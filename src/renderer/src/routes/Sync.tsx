import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  FileInput,
  Group,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Html5Qrcode } from 'html5-qrcode'
import Papa from 'papaparse'
import { QRCodeSVG } from 'qrcode.react'
import {
  IconCamera,
  IconCheck,
  IconDatabase,
  IconDownload,
  IconFileSpreadsheet,
  IconQrcode,
  IconRefresh,
  IconUpload,
  IconWifi,
} from '@tabler/icons-react'
import { useDatabaseStore } from '../stores/useDatabase'
import { useIsHub } from '../stores/useDeviceStore'
import { handleError } from '../lib/utils/errorHandler'
import { compressData, decompressData, reconstructFromChunks, splitIntoChunks } from '../lib/utils/sync'
import styles from './Sync.module.css'

type ChunkPayload = {
  index: number
  total: number
  payload: string
}

type SyncCollection =
  | 'scoutingData'
  | 'formSchemas'
  | 'events'

type SyncPayload = {
  exportedAt: string
  collection: SyncCollection
  count: number
  data: Record<string, unknown>[]
}

type CsvRow = Record<string, string>

type ImportResult = {
  inserted: number
  duplicates: number
  errors: number
  errorMessages: string[]
}

function getPrimaryFieldName(): 'id' {
  return 'id'
}

type SyncServerStatus = {
  running: boolean
  port: number | null
  url: string | null
  queueLength: number
  failedQueueLength: number
  authRequired: boolean
}

type QuarantinedSyncPayload = {
  payload: SyncPayload
  reason: string
  quarantinedAt: string
}

const QR_CHUNK_SIZE = 1800
const NETWORK_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
const SYNC_TOKEN_LENGTH = 8
const SYNC_TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const collectionOptions = [
  { value: 'scoutingData', label: 'Scouting Data' },
  { value: 'formSchemas', label: 'Form Schemas' },
  { value: 'events', label: 'Events' },
] satisfies Array<{ value: SyncCollection; label: string }>

const allCollections: SyncCollection[] = [
  'scoutingData',
  'formSchemas',
  'events',
]

function isSyncCollection(value: unknown): value is SyncCollection {
  return typeof value === 'string' && allCollections.includes(value as SyncCollection)
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((row) => typeof row === 'object' && row !== null)
}

function mergeImportResults(results: ImportResult[]): ImportResult {
  return results.reduce<ImportResult>(
    (acc, result) => ({
      inserted: acc.inserted + result.inserted,
      duplicates: acc.duplicates + result.duplicates,
      errors: acc.errors + result.errors,
      errorMessages: [...acc.errorMessages, ...result.errorMessages],
    }),
    { inserted: 0, duplicates: 0, errors: 0, errorMessages: [] },
  )
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.max(0, Math.trunc(parsed))
}

function extractMatchNumberFromKey(value: string): number {
  const lowered = value.toLowerCase()
  const stageMatch = lowered.match(/(?:^|_)(?:qm|qf|sf|f)(\d+)(?:$|_)/)
  if (stageMatch) {
    const parsed = Number(stageMatch[1])
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  const lastNumber = lowered.match(/(\d+)(?!.*\d)/)
  if (!lastNumber) {
    return 0
  }

  const parsed = Number(lastNumber[1])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

function extractTeamNumberFromKey(value: string): number {
  const frcMatch = value.toLowerCase().match(/frc(\d+)/)
  if (frcMatch) {
    const parsed = Number(frcMatch[1])
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  const anyNumber = value.match(/(\d+)/)
  if (!anyNumber) {
    return 0
  }

  const parsed = Number(anyNumber[1])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

function createSyncToken(): string {
  const bytes = new Uint8Array(SYNC_TOKEN_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => SYNC_TOKEN_ALPHABET[byte % SYNC_TOKEN_ALPHABET.length]).join('')
}

function normalizeSyncToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, SYNC_TOKEN_LENGTH)
}

function isValidSyncToken(value: string): boolean {
  return value.length === SYNC_TOKEN_LENGTH
}

function readPersistedValue(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function Sync(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const isHub = useIsHub()

  const [activeTab, setActiveTab] = useState<string>('network')

  const [exportCollection, setExportCollection] = useState<SyncCollection>('scoutingData')
  const [importCollection, setImportCollection] = useState<SyncCollection>('scoutingData')

  const [qrChunks, setQrChunks] = useState<string[]>([])
  const [currentQrIndex, setCurrentQrIndex] = useState<number>(0)
  const [isQrExporting, setIsQrExporting] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scannedChunks, setScannedChunks] = useState<Map<number, string>>(new Map())
  const scannedChunksRef = useRef<Map<number, string>>(new Map())
  const [expectedQrTotal, setExpectedQrTotal] = useState<number>(0)
  const expectedQrTotalRef = useRef<number>(0)
  const [qrPreview, setQrPreview] = useState<SyncPayload | null>(null)
  const [qrImportPayload, setQrImportPayload] = useState<string>('')

  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvParseError, setCsvParseError] = useState<string>('')
  const [csvImportSummary, setCsvImportSummary] = useState<string>('')
  const [isCsvLoading, setIsCsvLoading] = useState<boolean>(false)

  const [dbImportFile, setDbImportFile] = useState<File | null>(null)
  const [dbImportSummary, setDbImportSummary] = useState<string>('')
  const [dbImportProgress, setDbImportProgress] = useState<number>(0)

  const [serverPort, setServerPort] = useState<string>('41735')
  const [serverStatus, setServerStatus] = useState<SyncServerStatus>({
    running: false,
    port: null,
    url: null,
    queueLength: 0,
    failedQueueLength: 0,
    authRequired: false,
  })
  const [quarantinedPayloads, setQuarantinedPayloads] = useState<QuarantinedSyncPayload[]>([])
  const [serverAuthToken, setServerAuthToken] = useState<string>(() => {
    const persisted = normalizeSyncToken(readPersistedValue('sync_server_auth_token'))
    return isValidSyncToken(persisted) ? persisted : createSyncToken()
  })
  const [serverUrlInput, setServerUrlInput] = useState<string>(() => readPersistedValue('sync_server_url_input'))
  const [clientAuthToken, setClientAuthToken] = useState<string>(() => normalizeSyncToken(readPersistedValue('sync_client_auth_token')))
  const [isUploadingNetwork, setIsUploadingNetwork] = useState<boolean>(false)
  const [isConsumingNetwork, setIsConsumingNetwork] = useState<boolean>(false)
  const [networkCollection, setNetworkCollection] = useState<SyncCollection>('scoutingData')

  const networkAvailable = typeof window.electronAPI !== 'undefined'
  const serverUrlIsLoopback = useMemo(() => {
    if (!serverStatus.url) {
      return false
    }

    try {
      const hostname = new URL(serverStatus.url).hostname
      return hostname === 'localhost' || hostname === '127.0.0.1'
    } catch {
      return false
    }
  }, [serverStatus.url])

  useEffect(() => {
    try {
      localStorage.setItem('sync_server_auth_token', serverAuthToken)
    } catch {
      // ignore persistence failures
    }
  }, [serverAuthToken])

  useEffect(() => {
    try {
      localStorage.setItem('sync_server_url_input', serverUrlInput)
    } catch {
      // ignore persistence failures
    }
  }, [serverUrlInput])

  useEffect(() => {
    try {
      localStorage.setItem('sync_client_auth_token', clientAuthToken)
    } catch {
      // ignore persistence failures
    }
  }, [clientAuthToken])

  const getCollectionDocs = useCallback(
    async (collection: SyncCollection): Promise<Record<string, unknown>[]> => {
      if (!db) {
        return []
      }

      if (collection === 'scoutingData') {
        const docs = await db.collections.scoutingData.find().exec()
        return docs.map((doc) => doc.toJSON())
      }
      if (collection === 'formSchemas') {
        const docs = await db.collections.formSchemas.find().exec()
        return docs.map((doc) => doc.toJSON())
      }

      throw new Error(`Unsupported collection: ${String(collection)}`)
    },
    [db],
  )

  const validateSyncPayload = useCallback((payload: unknown): SyncPayload => {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Invalid sync payload object.')
    }

    const candidate = payload as Partial<SyncPayload>
    if (!isSyncCollection(candidate.collection)) {
      throw new Error('Invalid collection in sync payload.')
    }

    if (!isRecordArray(candidate.data)) {
      throw new Error('Sync payload data must be an array.')
    }

    return {
      exportedAt: String(candidate.exportedAt ?? ''),
      collection: candidate.collection,
      count: Number(candidate.count ?? candidate.data.length),
      data: candidate.data as Record<string, unknown>[],
    }
  }, [])

  const isDuplicateInsertError = useCallback((error: unknown): boolean => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = String((error as { code?: unknown }).code ?? '')
      if (code.toUpperCase() === 'CONFLICT') {
        return true
      }
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return message.includes('conflict') || message.includes('duplicate') || message.includes('already exists')
    }

    return false
  }, [])

  const importPayload = useCallback(
    async (payload: SyncPayload, forcedCollection?: SyncCollection): Promise<ImportResult> => {
      if (!db) {
        throw new Error('Database not ready.')
      }

      const collection = forcedCollection ?? payload.collection
      const result: ImportResult = { inserted: 0, duplicates: 0, errors: 0, errorMessages: [] }
      const primaryField = getPrimaryFieldName()

      const normalizeScoutingDataRow = (row: Record<string, unknown>): Record<string, unknown> | null => {
        const id = typeof row.id === 'string' && row.id.length > 0 ? row.id : crypto.randomUUID()
        const timestamp = typeof row.timestamp === 'string' && row.timestamp.length > 0 ? row.timestamp : new Date().toISOString()
        const createdAt = typeof row.createdAt === 'string' && row.createdAt.length > 0 ? row.createdAt : timestamp
        const matchNumberRaw = Number(row.matchNumber)
        const teamNumberRaw = Number(row.teamNumber)

        const matchNumber =
          Number.isInteger(matchNumberRaw) && matchNumberRaw > 0
            ? matchNumberRaw
            : extractMatchNumberFromKey(String(row.matchKey ?? ''))
        const teamNumber =
          Number.isInteger(teamNumberRaw) && teamNumberRaw > 0
            ? teamNumberRaw
            : extractTeamNumberFromKey(String(row.teamKey ?? ''))

        if (!Number.isInteger(matchNumber) || !Number.isInteger(teamNumber) || matchNumber < 1 || teamNumber < 1) {
          return null
        }

        const formData =
          typeof row.formData === 'object' && row.formData !== null ? (row.formData as Record<string, unknown>) : {}
        const notes = typeof row.notes === 'string' ? row.notes : ''
        const eventId = typeof row.eventId === 'string' && row.eventId.length > 0 && row.eventId !== 'unknown' ? row.eventId : null
        const deviceId = typeof row.deviceId === 'string' && row.deviceId.length > 0 ? row.deviceId : 'unknown'

        return {
          id,
          eventId,
          deviceId,
          matchNumber,
          teamNumber,
          timestamp,
          autoScore: toNonNegativeInteger(row.autoScore),
          teleopScore: toNonNegativeInteger(row.teleopScore),
          endgameScore: toNonNegativeInteger(row.endgameScore),
          formData,
          notes,
          createdAt,
        }
      }

      const enforceSingleActiveFormSchema = async (row: Record<string, unknown>): Promise<void> => {
        if (collection !== 'formSchemas' || row.isActive !== true) {
          return
        }

        const activeSchemaId = typeof row.id === 'string' ? row.id : ''
        if (!activeSchemaId) {
          return
        }

        const nowIso = new Date().toISOString()
        const activeDocs = await db.collections.formSchemas.find({ selector: { isActive: true } }).exec()
        await Promise.all(
          activeDocs
            .filter((doc) => doc.primary !== activeSchemaId)
            .map(async (doc) => {
              const docJson = doc.toJSON()
              await db.collections.formSchemas.upsert({
                ...docJson,
                isActive: false,
                updatedAt: nowIso,
              })
            }),
        )
      }

      const findExisting = async (id: string) => {
        switch (collection) {
          case 'scoutingData':
            return db.collections.scoutingData.findOne(id).exec()
          case 'formSchemas':
            return db.collections.formSchemas.findOne(id).exec()
          default:
            throw new Error(`Unsupported collection: ${String(collection)}`)
        }
      }

      const insertRow = async (row: Record<string, unknown>) => {
        switch (collection) {
          case 'scoutingData':
            await db.collections.scoutingData.insert(row as never)
            return
          case 'formSchemas':
            await db.collections.formSchemas.insert(row as never)
            return
          default:
            throw new Error(`Unsupported collection: ${String(collection)}`)
        }
      }

      const updateExistingRow = async (row: Record<string, unknown>) => {
        if (collection === 'scoutingData') {
          return false
        }

        try {
          switch (collection) {
            case 'formSchemas':
              await db.collections.formSchemas.upsert(row as never)
              return true
            default:
              return false
          }
        } catch (error: unknown) {
          result.errors += 1
          result.errorMessages.push(error instanceof Error ? error.message : `Failed updating existing ${collection} row.`)
          return true
        }
      }

      for (const sourceRow of payload.data) {
        let row = sourceRow

        if (collection === 'scoutingData') {
          const normalizedScoutingDataRow = normalizeScoutingDataRow(sourceRow)
          if (!normalizedScoutingDataRow) {
            result.errors += 1
            result.errorMessages.push('Scouting data row is missing required match/team identifiers.')
            continue
          }
          row = normalizedScoutingDataRow
        }

        await enforceSingleActiveFormSchema(row)

        const primaryValue = row[primaryField]
        const primaryId = typeof primaryValue === 'string' ? primaryValue : ''
        if (!primaryId) {
          result.errors += 1
          result.errorMessages.push(`Row missing required ${primaryField} field.`)
          continue
        }

        const existing = await findExisting(primaryId)

        if (existing) {
          const handledAsUpdate = await updateExistingRow(row)
          if (handledAsUpdate) {
            continue
          }

          result.duplicates += 1
          continue
        }

        try {
          await insertRow(row)
          result.inserted += 1
        } catch (error: unknown) {
          if (isDuplicateInsertError(error)) {
            result.duplicates += 1
          } else {
            result.errors += 1
            result.errorMessages.push(error instanceof Error ? error.message : 'Unknown import error.')
          }
        }
      }

      return result
    },
    [db, isDuplicateInsertError],
  )

  const buildPayload = useCallback(
    async (collection: SyncCollection): Promise<SyncPayload> => {
      const data = await getCollectionDocs(collection)
      return {
        exportedAt: new Date().toISOString(),
        collection,
        count: data.length,
        data,
      }
    },
    [getCollectionDocs],
  )

  const stopScanner = useCallback(async (): Promise<void> => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch {
        // ignore
      }
      try {
        await scannerRef.current.clear()
      } catch {
        // ignore
      }
      scannerRef.current = null
    }
    setIsScanning(false)
  }, [])

  useEffect(() => {
    return () => {
      void stopScanner()
    }
  }, [stopScanner])

  useEffect(() => {
    if (activeTab !== 'qr') {
      void stopScanner()
    }
  }, [activeTab, stopScanner])

  const handleQrExport = async (): Promise<void> => {
    if (!db) {
      notifications.show({ color: 'red', title: 'Database not ready', message: 'Please wait for initialization.' })
      return
    }

    setIsQrExporting(true)
    try {
      const payload = await buildPayload(exportCollection)
      const compressed = compressData(payload)
      const chunks = splitIntoChunks(compressed, QR_CHUNK_SIZE)
      const encodedChunks = chunks.map((chunk, index) =>
        JSON.stringify({ index: index + 1, total: chunks.length, payload: chunk } satisfies ChunkPayload),
      )

      setQrChunks(encodedChunks)
      setCurrentQrIndex(0)
      notifications.show({
        color: 'green',
        title: 'QR export ready',
        message: `Generated ${encodedChunks.length} code${encodedChunks.length === 1 ? '' : 's'} for ${payload.count} records.`,
      })
    } catch (error: unknown) {
      handleError(error, 'QR export')
    } finally {
      setIsQrExporting(false)
    }
  }

  const onQrScanSuccess = async (decodedText: string): Promise<void> => {
    try {
      const parsed = JSON.parse(decodedText) as ChunkPayload
      
      if (
        !Number.isInteger(parsed.index) ||
        !Number.isInteger(parsed.total) ||
        parsed.index < 1 ||
        parsed.total < 1 ||
        parsed.index > parsed.total ||
        typeof parsed.payload !== 'string' ||
        parsed.payload.length === 0
      ) {
        throw new Error('QR code is not a valid sync payload.')
      }

      if (expectedQrTotalRef.current > 0 && expectedQrTotalRef.current !== parsed.total) {
        const reset = new Map<number, string>()
        scannedChunksRef.current = reset
        setScannedChunks(reset)
        notifications.show({
          color: 'yellow',
          title: 'QR sequence reset',
          message: 'Detected a different QR sequence. Restarting scan capture.',
        })
      }

      expectedQrTotalRef.current = parsed.total
      setExpectedQrTotal(parsed.total)

      const nextChunks = new Map(scannedChunksRef.current)
      nextChunks.set(parsed.index, parsed.payload)
      scannedChunksRef.current = nextChunks
      setScannedChunks(nextChunks)

      if (nextChunks.size !== parsed.total) {
        notifications.show({
          color: 'blue',
          title: `QR chunk ${nextChunks.size}/${parsed.total} captured`,
          message: 'Scan the next QR code to continue.',
          autoClose: 1500,
        })
        return
      }

      const ordered = Array.from({ length: parsed.total }, (_, idx) => nextChunks.get(idx + 1) ?? '')
      if (ordered.some((item) => !item)) {
        notifications.show({
          color: 'red',
          title: 'QR scan error',
          message: 'Missing QR chunks. Please re-scan sequence.',
        })
        const reset = new Map<number, string>()
        scannedChunksRef.current = reset
        setScannedChunks(reset)
        expectedQrTotalRef.current = 0
        setExpectedQrTotal(0)
        return
      }

      const reconstructed = reconstructFromChunks(ordered)
      const completedPayload = validateSyncPayload(decompressData(reconstructed))
      setQrImportPayload(reconstructed)
      setQrPreview(completedPayload)
      void stopScanner()
      notifications.show({
        color: 'green',
        title: 'QR scan complete',
        message: `Captured ${parsed.total} of ${parsed.total} chunks.`,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'QR scan error',
        message: error instanceof Error ? error.message : 'Invalid QR payload. Try again.',
      })
    }
  }

  const handleScanQr = async (): Promise<void> => {
    if (isScanning) {
      await stopScanner()
      return
    }

    setQrPreview(null)
    setQrImportPayload('')
    const reset = new Map<number, string>()
    scannedChunksRef.current = reset
    setScannedChunks(reset)
    expectedQrTotalRef.current = 0
    setExpectedQrTotal(0)

    try {
      const scanner = new Html5Qrcode('sync-qr-scanner')
      scannerRef.current = scanner
      
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          void onQrScanSuccess(decodedText)
        },
        () => {
          // Ignore frame processing errors
        },
      )
      setIsScanning(true)
    } catch (error: unknown) {
      setIsScanning(false)
      notifications.show({
        color: 'red',
        title: 'Camera access failed',
        message:
          error instanceof Error
            ? `${error.message} If blocked, grant camera permission and try again.`
            : 'Unable to start scanner. Grant camera permission and try again.',
      })
    }
  }

  const handleImportQr = async (): Promise<void> => {
    if (!qrImportPayload) {
      return
    }

    try {
      const payload = validateSyncPayload(decompressData(qrImportPayload))
      if (payload.collection !== importCollection) {
        throw new Error(`QR contains ${payload.collection}, but import is set to ${importCollection}.`)
      }

      const result = await importPayload(payload, importCollection)
      notifications.show({
        color: result.errors > 0 ? 'yellow' : 'green',
        title: result.errors > 0 ? 'QR import finished with errors' : 'QR import complete',
        message: `${result.inserted} imported, ${result.duplicates} duplicates, ${result.errors} errors.`,
      })

      if (result.errors > 0 && result.errorMessages.length > 0) {
        notifications.show({
          color: 'yellow',
          title: 'Import error details',
          message: result.errorMessages.slice(0, 3).join(' | '),
        })
      }

      setQrPreview(null)
      setQrImportPayload('')
      expectedQrTotalRef.current = 0
      setExpectedQrTotal(0)
      const reset = new Map<number, string>()
      scannedChunksRef.current = reset
      setScannedChunks(reset)
    } catch (error: unknown) {
      handleError(error, 'QR import')
    }
  }

  const flattenScoutingRow = (row: Record<string, unknown>): CsvRow => {
    const flat: CsvRow = {}
    Object.entries(row).forEach(([key, value]) => {
      if (key === 'formData' && value && typeof value === 'object') {
        Object.entries(value as Record<string, unknown>).forEach(([formKey, formValue]) => {
          flat[`formData.${formKey}`] = String(formValue ?? '')
        })
      } else {
        flat[key] = String(value ?? '')
      }
    })
    return flat
  }

  const downloadTextFile = (content: string, fileName: string, type = 'text/plain;charset=utf-8'): void => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = async (): Promise<void> => {
    try {
      const docs = await getCollectionDocs('scoutingData')
      const rows = docs.map(flattenScoutingRow)
      const csv = Papa.unparse(rows)
      downloadTextFile(csv, `scoutingData-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')
      notifications.show({ color: 'green', title: 'CSV exported', message: `Exported ${rows.length} records.` })
    } catch (error: unknown) {
      handleError(error, 'CSV export')
    }
  }

  const parseCsvFile = async (file: File): Promise<void> => {
    setCsvParseError('')
    setCsvImportSummary('')
    setCsvRows([])
    setIsCsvLoading(true)

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields?.includes('matchNumber') || !results.meta.fields?.includes('teamNumber')) {
          setCsvRows([])
          setCsvParseError('CSV must include matchNumber and teamNumber columns.')
          setIsCsvLoading(false)
          return
        }

        if (results.errors.length > 0) {
          const first = results.errors[0]
          setCsvParseError(`CSV parse error on row ${first.row ?? '?'}: ${first.message}`)
        }

        setCsvRows(results.data)
        setIsCsvLoading(false)
      },
      error: (error) => {
        setCsvParseError(error.message)
        setCsvRows([])
        setIsCsvLoading(false)
      },
    })
  }

  const parseCsvRowToScoutingDoc = (row: CsvRow): Record<string, unknown> | null => {
    const matchNumber = Number(row.matchNumber)
    const teamNumber = Number(row.teamNumber)
    if (
      !Number.isFinite(matchNumber) ||
      !Number.isFinite(teamNumber) ||
      !Number.isInteger(matchNumber) ||
      !Number.isInteger(teamNumber) ||
      matchNumber < 1 ||
      teamNumber < 1
    ) {
      return null
    }

    const now = new Date().toISOString()
    const formDataEntries = Object.entries(row)
      .filter(([key]) => key.startsWith('formData.'))
      .map(([key, value]) => [key.replace('formData.', ''), value])

    return {
      id: row.id || crypto.randomUUID(),
      eventId: row.eventId && row.eventId !== 'unknown' ? row.eventId : null,
      deviceId: row.deviceId || 'unknown',
      matchNumber,
      teamNumber,
      timestamp: row.timestamp || now,
      autoScore: toNonNegativeInteger(row.autoScore),
      teleopScore: toNonNegativeInteger(row.teleopScore),
      endgameScore: toNonNegativeInteger(row.endgameScore),
      notes: row.notes ?? '',
      createdAt: row.createdAt || now,
      formData: Object.fromEntries(formDataEntries),
    }
  }

  const handleImportCsv = async (): Promise<void> => {
    if (csvRows.length === 0) {
      return
    }

    try {
      const docs: Record<string, unknown>[] = []
      let invalidRows = 0
      csvRows.forEach((row) => {
        const doc = parseCsvRowToScoutingDoc(row)
        if (doc) {
          docs.push(doc)
        } else {
          invalidRows += 1
        }
      })

      const result = await importPayload({
        exportedAt: new Date().toISOString(),
        collection: 'scoutingData',
        count: docs.length,
        data: docs,
      })

      const summary = `${result.inserted} imported, ${result.duplicates} duplicates, ${result.errors + invalidRows} errors.`
      setCsvImportSummary(summary)
      notifications.show({
        color: result.errors + invalidRows > 0 ? 'yellow' : 'green',
        title: 'CSV import complete',
        message: summary,
      })
    } catch (error: unknown) {
      handleError(error, 'CSV import')
    }
  }

  const handleExportDatabase = async (): Promise<void> => {
    try {
      const scoutingData = await getCollectionDocs('scoutingData')
      const formSchemas = await getCollectionDocs('formSchemas')

      const snapshot = {
        exportedAt: new Date().toISOString(),
        version: 1,
        collections: {
          scoutingData,
          formSchemas,
        },
      }

      const serialized = JSON.stringify(snapshot, null, 2)
      downloadTextFile(serialized, `scouting-db-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
      notifications.show({
        color: 'green',
        title: 'Database export complete',
        message: `Exported ${scoutingData.length + formSchemas.length} total records.`,
      })
    } catch (error: unknown) {
      handleError(error, 'Database export')
    }
  }

  const handleImportDatabase = async (): Promise<void> => {
    if (!dbImportFile) {
      return
    }

    try {
      setDbImportSummary('')
      setDbImportProgress(10)
      const text = await dbImportFile.text()
      const parsed = JSON.parse(text) as {
        collection?: unknown
        data?: unknown
        collections?: Record<string, unknown>
      }

      const results: ImportResult[] = []
      const taskMap = new Map<SyncCollection, Record<string, unknown>[]>()

      if (parsed.collection !== undefined || parsed.data !== undefined) {
        if (!isSyncCollection(parsed.collection)) {
          throw new Error('Snapshot has invalid collection value.')
        }
        if (!isRecordArray(parsed.data)) {
          throw new Error('Snapshot has invalid data payload for collection import.')
        }
        taskMap.set(parsed.collection, parsed.data)
      }

      if (parsed.collections) {
        allCollections.forEach((collection) => {
          const rawData = parsed.collections?.[collection]
          if (rawData === undefined) {
            return
          }

          if (!isRecordArray(rawData)) {
            throw new Error(`Snapshot collection '${collection}' must be an array of objects.`)
          }

          taskMap.set(collection, rawData)
        })
      }

      const tasks: Array<{ collection: SyncCollection; data: Record<string, unknown>[] }> = Array.from(taskMap.entries()).map(
        ([collection, data]) => ({ collection, data }),
      )

      if (tasks.length === 0) {
        throw new Error('Unsupported database import format.')
      }

      for (let i = 0; i < tasks.length; i += 1) {
        const task = tasks[i]
        const result = await importPayload({
          exportedAt: new Date().toISOString(),
          collection: task.collection,
          count: task.data.length,
          data: task.data,
        })
        results.push(result)
        setDbImportProgress(Math.round(((i + 1) / tasks.length) * 100))
      }

      const merged = mergeImportResults(results)
      const summary = `${merged.inserted} imported, ${merged.duplicates} duplicates, ${merged.errors} errors.`
      setDbImportSummary(summary)
      notifications.show({
        color: merged.errors > 0 ? 'yellow' : 'green',
        title: 'Database import complete',
        message: summary,
      })
      setDbImportFile(null)
    } catch (error: unknown) {
      setDbImportProgress(0)
      handleError(error, 'Database import')
    }
  }

  const normalizeServerUrl = (value: string): string => {
    const withProtocol = /^https?:\/\//.test(value) ? value : `http://${value}`
    // Strip trailing slash and /upload path if present
    const normalized = withProtocol.replace(/\/$/, '').replace(/\/upload$/, '')
    console.log('[normalizeServerUrl] input:', value, '→ output:', normalized)
    return normalized
  }

  const refreshServerStatus = useCallback(async (): Promise<void> => {
    if (!window.electronAPI) {
      return
    }

    const [status, failed] = await Promise.all([
      window.electronAPI.getSyncServerStatus(),
      window.electronAPI.peekQuarantinedSyncPayloads(),
    ])
    setServerStatus(status)
    setQuarantinedPayloads(failed)
  }, [])

  useEffect(() => {
    if (!networkAvailable || !isHub || activeTab !== 'network') {
      return
    }

    void refreshServerStatus()
    const timer = window.setInterval(() => {
      void refreshServerStatus()
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [activeTab, isHub, networkAvailable, refreshServerStatus])

  const handleStartServer = async (): Promise<void> => {
    if (!window.electronAPI) {
      notifications.show({ color: 'red', title: 'Unavailable', message: 'Network sync server requires Electron mode.' })
      return
    }

    try {
      const port = Number(serverPort.trim())
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        notifications.show({
          color: 'yellow',
          title: 'Invalid port',
          message: 'Enter a whole number between 1 and 65535.',
        })
        return
      }

      const authToken = serverAuthToken.trim()
      if (authToken.length > 0 && !isValidSyncToken(authToken)) {
        notifications.show({
          color: 'yellow',
          title: 'Invalid sync token',
          message: `Sync token must be exactly ${SYNC_TOKEN_LENGTH} characters.`,
        })
        return
      }
      const status = await window.electronAPI.startSyncServer(port, authToken.length > 0 ? authToken : undefined)
      setServerStatus(status)
      notifications.show({ color: 'green', title: 'Network server started', message: `Listening on port ${status.port}.` })
    } catch (error: unknown) {
      handleError(error, 'Start network sync server')
    }
  }

  const handleStopServer = async (): Promise<void> => {
    if (!window.electronAPI) {
      return
    }

    try {
      const status = await window.electronAPI.stopSyncServer()
      setServerStatus(status)
      notifications.show({ color: 'blue', title: 'Network server stopped', message: 'Sync server is no longer running.' })
    } catch (error: unknown) {
      handleError(error, 'Stop network sync server')
    }
  }

  const handleRetryQuarantinedPayloads = async (): Promise<void> => {
    if (!window.electronAPI) {
      return
    }

    try {
      const status = await window.electronAPI.retryQuarantinedSyncPayloads()
      setServerStatus(status)
      await refreshServerStatus()
      notifications.show({
        color: 'blue',
        title: 'Quarantined payloads requeued',
        message: 'All quarantined payloads were moved back to the incoming queue.',
      })
    } catch (error: unknown) {
      handleError(error, 'Retry quarantined sync payloads')
    }
  }

  const handleClearQuarantinedPayloads = async (): Promise<void> => {
    if (!window.electronAPI) {
      return
    }

    try {
      const status = await window.electronAPI.clearQuarantinedSyncPayloads()
      setServerStatus(status)
      await refreshServerStatus()
      notifications.show({
        color: 'yellow',
        title: 'Quarantine cleared',
        message: 'All quarantined payload records were removed.',
      })
    } catch (error: unknown) {
      handleError(error, 'Clear quarantined sync payloads')
    }
  }

  const handleClearScoutingData = async (): Promise<void> => {
    if (!db) {
      notifications.show({ color: 'red', title: 'Database not ready', message: 'Please wait for initialization.' })
      return
    }

    if (!isHub) {
      notifications.show({
        color: 'yellow',
        title: 'Hub mode required',
        message: 'Only hub devices can clear local scouting data.',
      })
      return
    }

    const confirmed = window.confirm(
      'WARNING: This will permanently delete all local scouting observations on this device. This cannot be undone. Continue?'
    )

    if (!confirmed) {
      return
    }

    try {
      const docs = await db.collections.scoutingData.find().exec()
      await Promise.all(docs.map(async (doc) => await doc.remove()))
      notifications.show({
        color: 'green',
        title: 'Scouting data cleared',
        message: `Removed ${docs.length} scouting observation${docs.length !== 1 ? 's' : ''}.`,
      })
    } catch (error: unknown) {
      handleError(error, 'Clear scouting data')
    }
  }

  const handleUploadToHub = async (): Promise<void> => {
    if (!db) {
      notifications.show({ color: 'red', title: 'Database not ready', message: 'Please wait for initialization.' })
      return
    }

    if (!serverUrlInput.trim()) {
      notifications.show({ color: 'red', title: 'Missing hub URL', message: 'Enter the hub sync server URL first.' })
      return
    }

    setIsUploadingNetwork(true)
    try {
      const payload = await buildPayload(networkCollection)
      const baseUrl = normalizeServerUrl(serverUrlInput.trim())
      const authToken = clientAuthToken.trim()
      if (authToken.length > 0 && !isValidSyncToken(authToken)) {
        throw new Error(`Sync token must be exactly ${SYNC_TOKEN_LENGTH} characters.`)
      }
      const createBatch = (rows: Record<string, unknown>[]): SyncPayload => ({
        exportedAt: payload.exportedAt,
        collection: payload.collection,
        count: rows.length,
        data: rows,
      })

      const getBatchSizeBytes = (rows: Record<string, unknown>[]): number => {
        return new Blob([JSON.stringify(createBatch(rows))], { type: 'application/json' }).size
      }

      const batches: SyncPayload[] = []
      if (payload.data.length === 0) {
        batches.push(payload)
      } else {
        let currentRows: Record<string, unknown>[] = []
        for (const row of payload.data) {
          const candidateRows = [...currentRows, row]
          const candidateBytes = getBatchSizeBytes(candidateRows)

          if (candidateBytes <= NETWORK_UPLOAD_MAX_BYTES) {
            currentRows = candidateRows
            continue
          }

          if (currentRows.length === 0) {
            throw new Error('A sync row exceeds the network payload size limit and cannot be uploaded.')
          }

          batches.push(createBatch(currentRows))
          currentRows = [row]
        }

        if (currentRows.length > 0) {
          batches.push(createBatch(currentRows))
        }
      }

      let latestQueueLength: number | undefined
      for (const batch of batches) {
        const uploadUrl = `${baseUrl}/upload`
        console.log('[Client Upload] POST to:', uploadUrl)
        
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 20000)
        let response: Response

        try {
          response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { 'x-sync-token': authToken } : {}),
            },
            body: JSON.stringify(batch),
            signal: controller.signal,
          })
        } finally {
          window.clearTimeout(timeout)
        }
        
        console.log('[Client Upload] Response:', response.status, response.statusText)

        if (!response.ok) {
          const text = await response.text()
          throw new Error(`Hub upload failed (${response.status}): ${text}`)
        }

        const body = (await response.json()) as { queueLength?: number }
        latestQueueLength = body.queueLength
      }

      notifications.show({
        color: 'green',
        title: 'Network upload complete',
        message: `Uploaded ${payload.count} records in ${batches.length} batch(es). Hub queue length: ${latestQueueLength ?? 'unknown'}.`,
      })
    } catch (error: unknown) {
      handleError(error, 'Network upload')
    } finally {
      setIsUploadingNetwork(false)
    }
  }

  const handleConsumeNetworkPayloads = async (): Promise<void> => {
    if (!window.electronAPI) {
      return
    }

    setIsConsumingNetwork(true)
    try {
      const incoming = await window.electronAPI.peekSyncPayloads()
      if (incoming.length === 0) {
        notifications.show({ color: 'blue', title: 'No incoming payloads', message: 'No queued network sync data right now.' })
        await refreshServerStatus()
        return
      }

      const results: ImportResult[] = []
      let acknowledged = 0
      let quarantined = 0
      for (const rawPayload of incoming) {
        try {
          const payload = validateSyncPayload(rawPayload)
          const result = await importPayload(payload)
          results.push(result)

          if (result.errors > 0) {
            const reason = result.errorMessages[0] ?? 'Payload had import errors.'
            await window.electronAPI.quarantineHeadSyncPayload(reason)
            quarantined += 1
            continue
          }

          await window.electronAPI.ackSyncPayloads(1)
          acknowledged += 1
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown payload processing error.'
          results.push({ inserted: 0, duplicates: 0, errors: 1, errorMessages: [message] })
          await window.electronAPI.quarantineHeadSyncPayload(message)
          quarantined += 1
        }
      }

      const merged = mergeImportResults(results)
      notifications.show({
        color: merged.errors > 0 ? 'yellow' : 'green',
        title: 'Network sync applied',
        message: `${merged.inserted} imported, ${merged.duplicates} duplicates, ${merged.errors} errors from ${acknowledged} acknowledged and ${quarantined} quarantined payload(s).`,
      })
      await refreshServerStatus()
    } catch (error: unknown) {
      handleError(error, 'Consume network payloads')
    } finally {
      setIsConsumingNetwork(false)
    }
  }

  const csvPreviewColumns = useMemo(() => {
    if (csvRows.length === 0) {
      return []
    }
    return Object.keys(csvRows[0]).slice(0, 5)
  }, [csvRows])

  return (
    <Box className="container-wide" py="xl">
      <Stack gap={32}>
        <Box className={styles.syncHeader}>
          <Group gap="md">
            <ThemeIcon 
              size={56} 
              radius="xl" 
              variant="light"
              className={styles.syncHeaderIcon}
            >
              <IconRefresh size={28} stroke={1.8} />
            </ThemeIcon>
            <Box>
              <Title order={1} c="slate.0" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>
                Sync Data
              </Title>
              <Text size="sm" c="slate.3" fw={500}>
                Transfer scouting data and form schemas with Network, QR, CSV, or full database snapshots.
              </Text>
            </Box>
          </Group>
        </Box>

        <Tabs 
          value={activeTab} 
          onChange={(value) => setActiveTab(value ?? 'network')} 
          variant="pills" 
          radius="lg"
          classNames={{ list: styles.tabsList }}
        >
          <Tabs.List>
            <Tabs.Tab value="network" leftSection={<IconWifi size={16} />}>Network</Tabs.Tab>
            <Tabs.Tab value="qr" leftSection={<IconQrcode size={16} />}>QR</Tabs.Tab>
            <Tabs.Tab value="csv" leftSection={<IconFileSpreadsheet size={16} />}>CSV</Tabs.Tab>
            <Tabs.Tab value="database" leftSection={<IconDatabase size={16} />}>Database</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="network" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Group justify="space-between" align="center">
                    <Text className={styles.syncCardTitle}>Hub Server</Text>
                    <Badge 
                      className={`${styles.statusBadge} ${serverStatus.running ? styles.statusBadgeRunning : styles.statusBadgeStopped}`}
                      radius="md"
                    >
                      {serverStatus.running ? 'Running' : 'Stopped'}
                    </Badge>
                  </Group>

                  {!networkAvailable ? (
                    <Alert color="yellow" title="Electron required" radius="lg">
                      Start/consume network sync server is available in Electron mode.
                    </Alert>
                  ) : (
                    <>
                      <Stack gap="md">
                        <TextInput
                          label="Server Port"
                          value={serverPort}
                          onChange={(event) => setServerPort(event.currentTarget.value)}
                          placeholder="41735"
                          disabled={!isHub}
                          size="md"
                        />

                        <TextInput
                          label="Sync Token"
                          value={serverAuthToken}
                          onChange={(event) => setServerAuthToken(normalizeSyncToken(event.currentTarget.value))}
                          description={`Clients must provide this ${SYNC_TOKEN_LENGTH}-character code when uploading to hub`}
                          placeholder="AB12CD34"
                          maxLength={SYNC_TOKEN_LENGTH}
                          disabled={!isHub || serverStatus.running}
                          size="md"
                        />

                        <Button
                          variant="light"
                          onClick={() => setServerAuthToken(createSyncToken())}
                          disabled={!isHub || serverStatus.running}
                          size="md"
                        >
                          Generate New Token
                        </Button>
                      </Stack>

                      <Group grow>
                        <Button 
                          onClick={() => void handleStartServer()} 
                          disabled={!isHub || serverStatus.running}
                          className={styles.syncButton}
                          size="md"
                          variant="gradient"
                          gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                        >
                          Start Server
                        </Button>
                        <Button 
                          variant="light" 
                          color="red" 
                          onClick={() => void handleStopServer()} 
                          disabled={!isHub || !serverStatus.running}
                          className={styles.syncButton}
                          size="md"
                        >
                          Stop Server
                        </Button>
                      </Group>

                      <Button variant="subtle" onClick={() => void refreshServerStatus()} size="md">
                        Refresh Status
                      </Button>

                      <Paper className={styles.infoPanel}>
                        <Stack gap="sm">
                          <Box>
                            <Text size="sm" c="slate.4" fw={600} mb={4}>Server URL:</Text>
                            <Code className={styles.networkUrlCode} block>
                              {serverStatus.url ? `${serverStatus.url}/upload` : 'Not running'}
                            </Code>
                          </Box>
                          <Text size="xs" c="slate.5" style={{ lineHeight: 1.5 }}>
                            {serverStatus.url
                              ? serverUrlIsLoopback
                                ? 'No LAN address detected yet. Connect this device to Wi-Fi/LAN to share sync with other computers.'
                                : 'Share this URL with other devices on the same Wi-Fi/LAN network.'
                              : 'Start the server to generate a shareable hub URL.'}
                          </Text>
                          <Group gap="lg" mt="xs">
                            <Box>
                              <Text size="sm" c="slate.3" fw={600}>Queued payloads</Text>
                              <Text size="lg" c="frc-blue.4" fw={700}>{serverStatus.queueLength}</Text>
                            </Box>
                            <Box>
                              <Text size="sm" c="warning.4" fw={600}>Quarantined</Text>
                              <Text size="lg" c="warning.5" fw={700}>{serverStatus.failedQueueLength}</Text>
                            </Box>
                          </Group>
                          <Text size="xs" c="slate.5" mt="xs">
                            Auth token required: {serverStatus.authRequired ? 'Yes' : 'No'}
                          </Text>

                          {quarantinedPayloads.length > 0 && (
                            <Stack gap={6} mt="md">
                              {quarantinedPayloads.slice(0, 3).map((item, index) => (
                                <Box key={`${item.quarantinedAt}-${index}`} className={styles.quarantinedItem}>
                                  {new Date(item.quarantinedAt).toLocaleString()} - {item.reason}
                                </Box>
                              ))}
                            </Stack>
                          )}
                        </Stack>
                      </Paper>

                      <Button
                        onClick={() => void handleConsumeNetworkPayloads()}
                        loading={isConsumingNetwork}
                        disabled={!isHub || !serverStatus.running}
                        variant="gradient"
                        gradient={{ from: 'success.5', to: 'success.7' }}
                        className={styles.syncButton}
                        size="md"
                        leftSection={<IconDownload size={18} />}
                      >
                        Consume Incoming Payloads
                      </Button>

                      <Group grow>
                        <Button
                          variant="light"
                          color="yellow"
                          onClick={() => void handleRetryQuarantinedPayloads()}
                          disabled={!isHub || serverStatus.failedQueueLength === 0}
                          size="md"
                        >
                          Requeue Quarantined
                        </Button>
                        <Button
                          variant="subtle"
                          color="red"
                          onClick={() => void handleClearQuarantinedPayloads()}
                          disabled={!isHub || serverStatus.failedQueueLength === 0}
                          size="md"
                        >
                          Clear Quarantine
                        </Button>
                      </Group>

                      <Stack gap={4}>
                        <Button
                          variant="subtle"
                          color="red"
                          onClick={() => void handleClearScoutingData()}
                          disabled={!isHub}
                          size="md"
                        >
                          Clear Scouting Data
                        </Button>
                        <Text size="xs" c="slate.5">
                          Clears local scouting observations only (events/forms/assignments/matches are preserved).
                        </Text>
                      </Stack>
                    </>
                  )}
                </Stack>
              </Card>

              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Text className={styles.syncCardTitle}>Client Upload</Text>
                  <Text size="sm" c="slate.4">
                    Send your local data to a hub server over LAN.
                  </Text>

                  <Select
                    label="Collection"
                    value={networkCollection}
                    onChange={(value) => {
                      if (allCollections.includes(value as SyncCollection)) {
                        setNetworkCollection(value as SyncCollection)
                      }
                    }}
                    data={collectionOptions}
                    size="md"
                  />

                  <TextInput
                    label="Hub URL"
                    value={serverUrlInput}
                    onChange={(event) => setServerUrlInput(event.currentTarget.value)}
                    placeholder="http://192.168.1.20:41735"
                    size="md"
                  />

                  <TextInput
                    label="Sync Token (if required)"
                    value={clientAuthToken}
                    onChange={(event) => setClientAuthToken(normalizeSyncToken(event.currentTarget.value))}
                    placeholder="AB12CD34"
                    maxLength={SYNC_TOKEN_LENGTH}
                    size="md"
                  />

                  <Button
                    onClick={() => void handleUploadToHub()}
                    loading={isUploadingNetwork}
                    variant="gradient"
                    gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}
                    leftSection={<IconUpload size={18} />}
                    className={styles.syncButton}
                    size="md"
                  >
                    Upload to Hub
                  </Button>
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="qr" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Text className={styles.syncCardTitle}>QR Export</Text>
                  <Select
                    label="Collection"
                    value={exportCollection}
                    onChange={(value) => {
                      if (allCollections.includes(value as SyncCollection)) {
                        setExportCollection(value as SyncCollection)
                      }
                    }}
                    data={collectionOptions}
                    size="md"
                  />

                  <Button
                    loading={isQrExporting}
                    onClick={() => void handleQrExport()}
                    variant="gradient"
                    gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                    leftSection={<IconQrcode size={18} />}
                    className={styles.syncButton}
                    size="md"
                  >
                    Generate QR Codes
                  </Button>

                  {qrChunks.length > 0 && (
                    <Stack gap="lg" align="center">
                      <Badge className={styles.qrChunkBadge} radius="md">
                        Code {currentQrIndex + 1} of {qrChunks.length}
                      </Badge>
                      <Box className={styles.qrCodeContainer}>
                        <QRCodeSVG value={qrChunks[currentQrIndex]} size={220} />
                      </Box>
                      <Button
                        variant="light"
                        onClick={() => setCurrentQrIndex((prev) => (prev + 1) % qrChunks.length)}
                        disabled={qrChunks.length <= 1}
                        size="md"
                      >
                        Next QR
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Card>

              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Text className={styles.syncCardTitle}>QR Import</Text>
                  <Select
                    label="Import Collection"
                    value={importCollection}
                    onChange={(value) => {
                      if (allCollections.includes(value as SyncCollection)) {
                        setImportCollection(value as SyncCollection)
                        void stopScanner()
                      }
                    }}
                    data={collectionOptions}
                    size="md"
                  />

                  <Button
                    variant={isScanning ? 'filled' : 'light'}
                    color={isScanning ? 'red' : 'frc-blue'}
                    onClick={() => void handleScanQr()}
                    leftSection={<IconCamera size={18} />}
                    className={styles.syncButton}
                    size="md"
                  >
                    {isScanning ? 'Stop Scanner' : 'Scan QR'}
                  </Button>

                  <div 
                    id="sync-qr-scanner" 
                    style={{ 
                      width: '100%', 
                      maxWidth: 340, 
                      borderRadius: 14, 
                      overflow: 'hidden', 
                      margin: '0 auto',
                      border: '2px solid rgba(26, 140, 255, 0.2)'
                    }} 
                  />

                  {expectedQrTotal > 0 && (
                    <Paper className={styles.syncSection}>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm" c="slate.3" fw={600}>Scan Progress</Text>
                          <Badge variant="light" className={styles.qrChunkBadge}>
                            {scannedChunks.size} / {expectedQrTotal}
                          </Badge>
                        </Group>
                        <Progress 
                          value={(scannedChunks.size / expectedQrTotal) * 100} 
                          className={styles.progressBar}
                          size="lg"
                          radius="xl"
                        />
                      </Stack>
                    </Paper>
                  )}

                  {qrPreview ? (
                    <>
                      <Code block className={styles.networkUrlCode}>
                        {JSON.stringify({ collection: qrPreview.collection, count: qrPreview.count })}
                      </Code>
                      <Button
                        onClick={() => void handleImportQr()}
                        variant="gradient"
                        gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}
                        leftSection={<IconCheck size={18} />}
                        className={styles.syncButton}
                        size="md"
                      >
                        Import QR Payload
                      </Button>
                    </>
                  ) : (
                    <Text size="sm" c="slate.4" ta="center" py="md">
                      Scan one or more QR chunks to preview import payload.
                    </Text>
                  )}
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="csv" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Text className={styles.syncCardTitle}>CSV Export</Text>
                  <Text size="sm" c="slate.4">Export scoutingData as CSV for spreadsheet analysis.</Text>
                  <Button
                    onClick={() => void handleExportCsv()}
                    leftSection={<IconDownload size={18} />}
                    variant="gradient"
                    gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                    className={styles.syncButton}
                    size="md"
                  >
                    Export CSV
                  </Button>
                </Stack>
              </Card>

              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Text className={styles.syncCardTitle}>CSV Import</Text>
                  <FileInput 
                    label="CSV File" 
                    accept=".csv" 
                    onChange={(file) => file && void parseCsvFile(file)} 
                    size="md"
                  />
                  {isCsvLoading && <Progress value={100} animated className={styles.progressBar} size="lg" />}
                  {csvParseError && <Alert color="red" radius="lg">{csvParseError}</Alert>}

                  {csvRows.length > 0 && (
                    <Box className={styles.csvTable}>
                      <Table.ScrollContainer minWidth={420}>
                        <Table striped highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              {csvPreviewColumns.map((column) => (
                                <Table.Th key={column}>{column}</Table.Th>
                              ))}
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {csvRows.slice(0, 5).map((row, idx) => (
                              <Table.Tr key={`${row.id ?? idx}`}>
                                {csvPreviewColumns.map((column) => (
                                  <Table.Td key={`${idx}-${column}`}>{row[column]}</Table.Td>
                                ))}
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    </Box>
                  )}

                  <Button
                    onClick={() => void handleImportCsv()}
                    leftSection={<IconUpload size={18} />}
                    disabled={csvRows.length === 0 || Boolean(csvParseError)}
                    variant="gradient"
                    gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}
                    className={styles.syncButton}
                    size="md"
                  >
                    Import CSV
                  </Button>

                  {csvImportSummary && <Alert color="blue" radius="lg">{csvImportSummary}</Alert>}
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="database" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Text className={styles.syncCardTitle}>Database Export</Text>
                  <Text size="sm" c="slate.4">Export both scoutingData and formSchemas into one JSON snapshot.</Text>
                  <Button
                    onClick={() => void handleExportDatabase()}
                    leftSection={<IconDownload size={18} />}
                    variant="gradient"
                    gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                    className={styles.syncButton}
                    size="md"
                  >
                    Export Database Snapshot
                  </Button>
                </Stack>
              </Card>

              <Card p="xl" radius="lg" className={styles.syncCard}>
                <Stack gap="lg">
                  <Text className={styles.syncCardTitle}>Database Import</Text>
                  <FileInput
                    label="Snapshot file"
                    accept="application/json"
                    value={dbImportFile}
                    onChange={setDbImportFile}
                    size="md"
                  />
                  <Button
                    onClick={() => void handleImportDatabase()}
                    leftSection={<IconUpload size={18} />}
                    disabled={!dbImportFile}
                    variant="gradient"
                    gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}
                    className={styles.syncButton}
                    size="md"
                  >
                    Import Snapshot
                  </Button>
                  {dbImportProgress > 0 && (
                    <Progress 
                      value={dbImportProgress} 
                      animated 
                      className={styles.progressBar} 
                      size="lg"
                    />
                  )}
                  {dbImportSummary && <Alert color="blue" radius="lg">{dbImportSummary}</Alert>}
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="database" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
                <Stack gap="md">
                  <Text fw={600} c="slate.0">Database Export</Text>
                  <Text size="sm" c="slate.4">Export both scoutingData and formSchemas into one JSON snapshot.</Text>
                  <Button
                    onClick={() => void handleExportDatabase()}
                    leftSection={<IconDownload size={16} />}
                    variant="gradient"
                    gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                  >
                    Export Database Snapshot
                  </Button>
                </Stack>
              </Card>

              <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
                <Stack gap="md">
                  <Text fw={600} c="slate.0">Database Import</Text>
                  <FileInput
                    label="Snapshot file"
                    accept="application/json"
                    value={dbImportFile}
                    onChange={setDbImportFile}
                  />
                  <Button
                    onClick={() => void handleImportDatabase()}
                    leftSection={<IconUpload size={16} />}
                    disabled={!dbImportFile}
                    variant="gradient"
                    gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}
                  >
                    Import Snapshot
                  </Button>
                  {dbImportProgress > 0 && <Progress value={dbImportProgress} animated />}
                  {dbImportSummary && <Alert color="blue">{dbImportSummary}</Alert>}
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>
        </Tabs>

        {!isHub && (
          <Alert color="frc-blue" variant="light">
            Scout mode tip: use `formSchemas` sync to receive updated forms from the hub and `scoutingData` to send match entries.
          </Alert>
        )}
      </Stack>
    </Box>
  )
}
