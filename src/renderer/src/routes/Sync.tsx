import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  FileInput,
  Group,
  Modal,
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
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import Papa from 'papaparse'
import { QRCodeSVG } from 'qrcode.react'
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCamera,
  IconCheck,
  IconDatabase,
  IconDownload,
  IconFileSpreadsheet,
  IconHelp,
  IconQrcode,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconWifi,
} from '@tabler/icons-react'
import { useDatabaseStore } from '../stores/useDatabase'
import { useIsHub } from '../stores/useDeviceStore'
import { handleError } from '../lib/utils/errorHandler'
import { compressData, decompressData, reconstructFromChunks, splitIntoChunks } from '../lib/utils/sync'

type ChunkPayload = {
  index: number
  total: number
  payload: string
}

type SyncCollection =
  | 'scoutingData'
  | 'formSchemas'
  | 'analysisConfigs'
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

type QrCameraOption = {
  value: string
  label: string
}

const QR_CHUNK_SIZE = 1800
const TEST_QR_CHUNK_SIZE = 320
const MIN_QR_SCANNER_HEIGHT = 340
const NETWORK_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
const SYNC_TOKEN_LENGTH = 8
const SYNC_TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const collectionOptions = [
  { value: 'scoutingData', label: 'Scouting Data' },
  { value: 'formSchemas', label: 'Form Schemas' },
  { value: 'analysisConfigs', label: 'Analysis Settings' },
  { value: 'events', label: 'Events' },
] satisfies Array<{ value: SyncCollection; label: string }>

const allCollections: SyncCollection[] = [
  'scoutingData',
  'formSchemas',
  'analysisConfigs',
  'events',
]

const snapshotCollectionLabels: Record<SyncCollection, string> = {
  scoutingData: 'Scouting Data',
  formSchemas: 'Form Schemas',
  analysisConfigs: 'Analysis Settings',
  events: 'Events',
}

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

function getMissingChunkNumbers(total: number, chunks: Map<number, string>): number[] {
  if (total <= 0) {
    return []
  }

  return Array.from({ length: total }, (_, index) => index + 1).filter((chunkIndex) => !chunks.has(chunkIndex))
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
  const [qrScanHint, setQrScanHint] = useState<string>('Select import collection, then start scanning chunks in order.')
  const [qrCameraOptions, setQrCameraOptions] = useState<QrCameraOption[]>([])
  const [selectedQrCamera, setSelectedQrCamera] = useState<string | null>(() => {
    const persisted = readPersistedValue('sync_qr_camera_id')
    return persisted.length > 0 ? persisted : null
  })
  const recentDecodedQrRef = useRef<{ value: string; at: number } | null>(null)

  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvParseError, setCsvParseError] = useState<string>('')
  const [csvImportSummary, setCsvImportSummary] = useState<string>('')
  const [isCsvLoading, setIsCsvLoading] = useState<boolean>(false)

  const [dbImportFile, setDbImportFile] = useState<File | null>(null)
  const [dbImportSummary, setDbImportSummary] = useState<string>('')
  const [dbImportProgress, setDbImportProgress] = useState<number>(0)
  const [snapshotCollections, setSnapshotCollections] = useState<Record<SyncCollection, boolean>>({
    scoutingData: true,
    formSchemas: true,
    analysisConfigs: true,
    events: true,
  })
  const [clearScoutingDataModalOpened, setClearScoutingDataModalOpened] = useState(false)
  const [clearScoutingDataConfirmText, setClearScoutingDataConfirmText] = useState('')
  const [clearScoutingDataCount, setClearScoutingDataCount] = useState<number>(0)
  const [isClearingScoutingData, setIsClearingScoutingData] = useState(false)
  const [forceSmallQrChunks, setForceSmallQrChunks] = useState<boolean>(() => {
    return readPersistedValue('sync_force_small_qr_chunks') === 'true'
  })
  const [qrPresentationMode, setQrPresentationMode] = useState(false)
  const [qrImportHelpOpen, setQrImportHelpOpen] = useState(false)

  const cameraSelectOptions = useMemo(
    () => [{ value: '__auto__', label: 'Auto select best camera' }, ...qrCameraOptions],
    [qrCameraOptions],
  )

  const selectedCameraValue = selectedQrCamera ?? '__auto__'
  const showScanProgress = expectedQrTotal > 0 && (isScanning || qrPreview === null)
  const qrChunkSize = forceSmallQrChunks ? TEST_QR_CHUNK_SIZE : QR_CHUNK_SIZE
  const capturedChunkIndexes = useMemo(
    () => Array.from(scannedChunks.keys()).sort((a, b) => a - b),
    [scannedChunks],
  )
  const missingChunkIndexes = useMemo(
    () => getMissingChunkNumbers(expectedQrTotal, scannedChunks),
    [expectedQrTotal, scannedChunks],
  )
  const nextChunkToScan = useMemo(() => {
    if (expectedQrTotal <= 0) {
      return 1
    }

    return missingChunkIndexes[0] ?? expectedQrTotal
  }, [expectedQrTotal, missingChunkIndexes])
  const presentationQrSize = useMemo(() => {
    if (typeof window === 'undefined') {
      return 560
    }

    return Math.max(420, Math.min(window.innerWidth - 140, window.innerHeight - 230, 820))
  }, [])

  const activeExportQr = qrChunks[currentQrIndex] ?? ''

  const openQrPresentationMode = useCallback((): void => {
    if (qrChunks.length === 0) {
      return
    }
    setQrPresentationMode(true)
  }, [qrChunks.length])

  const closeQrPresentationMode = useCallback((): void => {
    setQrPresentationMode(false)
  }, [])

  const showNextQr = useCallback((): void => {
    if (qrChunks.length <= 1) {
      return
    }
    setCurrentQrIndex((prev) => (prev + 1) % qrChunks.length)
  }, [qrChunks.length])

  const showPreviousQr = useCallback((): void => {
    if (qrChunks.length <= 1) {
      return
    }
    setCurrentQrIndex((prev) => (prev - 1 + qrChunks.length) % qrChunks.length)
  }, [qrChunks.length])

  useEffect(() => {
    if (!qrPresentationMode) {
      return
    }

    const previousBackground = document.body.style.backgroundColor
    const previousTransition = document.body.style.transition
    document.body.style.transition = 'background-color 180ms ease'
    document.body.style.backgroundColor = '#f3f4f6'

    return () => {
      document.body.style.backgroundColor = previousBackground
      document.body.style.transition = previousTransition
    }
  }, [qrPresentationMode])

  useEffect(() => {
    if (!qrPresentationMode) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeQrPresentationMode()
        return
      }

      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'n') {
        showNextQr()
        return
      }

      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'p') {
        showPreviousQr()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeQrPresentationMode, qrPresentationMode, showNextQr, showPreviousQr])

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

  useEffect(() => {
    try {
      if (selectedQrCamera) {
        localStorage.setItem('sync_qr_camera_id', selectedQrCamera)
      } else {
        localStorage.removeItem('sync_qr_camera_id')
      }
    } catch {
      // ignore persistence failures
    }
  }, [selectedQrCamera])

  useEffect(() => {
    const handleQrChunkModeChanged = (event: Event): void => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') {
        setForceSmallQrChunks(detail)
        return
      }

      setForceSmallQrChunks(readPersistedValue('sync_force_small_qr_chunks') === 'true')
    }

    window.addEventListener('sync:force-small-qr-chunks-changed', handleQrChunkModeChanged)
    return () => {
      window.removeEventListener('sync:force-small-qr-chunks-changed', handleQrChunkModeChanged)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('sync_force_small_qr_chunks', String(forceSmallQrChunks))
    } catch {
      // ignore persistence failures
    }
  }, [forceSmallQrChunks])

  const getRemainingChunkLabel = (total: number, chunks: Map<number, string>): string => {
    const remaining = Array.from({ length: total }, (_, index) => index + 1).filter((chunkIndex) => !chunks.has(chunkIndex))
    if (remaining.length === 0) {
      return 'All chunks captured.'
    }

    if (remaining.length <= 6) {
      return `Remaining chunks: ${remaining.join(', ')}`
    }

    return `Remaining chunks: ${remaining.slice(0, 6).join(', ')} +${remaining.length - 6} more`
  }

  const loadQrCameras = useCallback(async (): Promise<QrCameraOption[]> => {
    try {
      const cameras = await Html5Qrcode.getCameras()
      const options: QrCameraOption[] = cameras.map((camera, index) => ({
        value: camera.id,
        label: camera.label && camera.label.trim().length > 0 ? camera.label : `Camera ${index + 1}`,
      }))

      setQrCameraOptions(options)
      if (options.length === 0) {
        setSelectedQrCamera(null)
        return options
      }

      if (selectedQrCamera && options.some((option) => option.value === selectedQrCamera)) {
        return options
      }

      const preferred = options.find((option) => /back|rear|environment/i.test(option.label)) ?? options[0]
      setSelectedQrCamera(preferred.value)
      return options
    } catch {
      setQrCameraOptions([])
      setSelectedQrCamera(null)
      return []
    }
  }, [selectedQrCamera])

  useEffect(() => {
    if (activeTab !== 'qr') {
      return
    }

    void loadQrCameras()
  }, [activeTab, loadQrCameras])

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

      if (collection === 'analysisConfigs') {
        const docs = await db.collections.analysisConfigs.find().exec()
        return docs.map((doc) => doc.toJSON())
      }

      if (collection === 'events') {
        const docs = await db.collections.events.find().exec()
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
        const eventId =
          typeof row.eventId === 'string' && row.eventId.length > 0 && row.eventId !== 'unknown' && row.eventId !== 'null'
            ? row.eventId
            : 'none'
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

      const normalizeEventRow = (row: Record<string, unknown>): Record<string, unknown> | null => {
        const id =
          typeof row.id === 'string' && row.id.length > 0
            ? row.id
            : typeof row.key === 'string' && row.key.length > 0
              ? row.key
              : ''

        if (!id) {
          return null
        }

        const now = new Date().toISOString()
        const currentSeason = new Date().getFullYear()
        const seasonRaw = Number(row.season)

        return {
          id,
          name: typeof row.name === 'string' ? row.name : id,
          season: Number.isInteger(seasonRaw) && seasonRaw > 1990 ? seasonRaw : currentSeason,
          startDate: typeof row.startDate === 'string' ? row.startDate : '',
          endDate: typeof row.endDate === 'string' ? row.endDate : '',
          syncedAt: typeof row.syncedAt === 'string' ? row.syncedAt : now,
          createdAt: typeof row.createdAt === 'string' ? row.createdAt : now,
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
          case 'analysisConfigs':
            return db.collections.analysisConfigs.findOne(id).exec()
          case 'events':
            return db.collections.events.findOne(id).exec()
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
          case 'analysisConfigs':
            await db.collections.analysisConfigs.insert(row as never)
            return
          case 'events':
            await db.collections.events.insert(row as never)
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
            case 'analysisConfigs':
              await db.collections.analysisConfigs.upsert(row as never)
              return true
            case 'events':
              await db.collections.events.upsert(row as never)
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

        if (collection === 'events') {
          const normalizedEventRow = normalizeEventRow(sourceRow)
          if (!normalizedEventRow) {
            result.errors += 1
            result.errorMessages.push('Event row is missing required identifier.')
            continue
          }
          row = normalizedEventRow
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
      const chunks = splitIntoChunks(compressed, qrChunkSize)
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
      const now = Date.now()
      const recentDecoded = recentDecodedQrRef.current
      if (recentDecoded && recentDecoded.value === decodedText && now - recentDecoded.at < 900) {
        return
      }
      recentDecodedQrRef.current = { value: decodedText, at: now }

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
        setQrScanHint('Detected a different QR sequence. Scan chunks for the same export set.')
        notifications.show({
          color: 'yellow',
          title: 'QR sequence reset',
          message: 'Detected a different QR sequence. Restarting scan capture.',
        })
      }

      expectedQrTotalRef.current = parsed.total
      setExpectedQrTotal(parsed.total)

      const nextChunks = new Map(scannedChunksRef.current)
      const existingChunk = nextChunks.get(parsed.index)
      if (existingChunk === parsed.payload) {
        setQrScanHint(`Chunk ${parsed.index}/${parsed.total} already captured. ${getRemainingChunkLabel(parsed.total, nextChunks)}`)
        return
      }

      nextChunks.set(parsed.index, parsed.payload)
      scannedChunksRef.current = nextChunks
      setScannedChunks(nextChunks)

      if (nextChunks.size !== parsed.total) {
        setQrScanHint(`Captured chunk ${parsed.index}/${parsed.total}. ${getRemainingChunkLabel(parsed.total, nextChunks)}`)
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
        setQrScanHint('Missing chunks detected. Please re-scan all chunks in order.')
        return
      }

      const reconstructed = reconstructFromChunks(ordered)
      const completedPayload = validateSyncPayload(decompressData(reconstructed))
      setQrImportPayload(reconstructed)
      setQrPreview(completedPayload)
      void stopScanner()
      setQrScanHint('All chunks captured. Review payload details, then import.')
      notifications.show({
        color: 'green',
        title: 'QR scan complete',
        message: `Captured ${parsed.total} of ${parsed.total} chunks.`,
      })
    } catch (error: unknown) {
      setQrScanHint('Scan failed. Ensure the QR is from Matchbook and fully visible.')
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
      setQrScanHint('Scanner stopped.')
      return
    }

    setQrPreview(null)
    setQrImportPayload('')
    const reset = new Map<number, string>()
    scannedChunksRef.current = reset
    setScannedChunks(reset)
    expectedQrTotalRef.current = 0
    setExpectedQrTotal(0)
    recentDecodedQrRef.current = null
    setQrScanHint('Starting camera... point it at chunk 1.')

    try {
      const scanner = new Html5Qrcode('sync-qr-scanner', {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
      })
      scannerRef.current = scanner

      const cameras = qrCameraOptions.length > 0 ? qrCameraOptions : await loadQrCameras()
      const selectedCameraId = selectedQrCamera && cameras.some((camera) => camera.value === selectedQrCamera)
        ? selectedQrCamera
        : cameras[0]?.value

      if (!selectedCameraId) {
        throw new Error('No camera detected. Connect a camera or grant camera access, then try again.')
      }

      if (selectedCameraId && selectedQrCamera !== selectedCameraId) {
        setSelectedQrCamera(selectedCameraId)
      }

      const scannerConfig = {
        fps: 12,
        aspectRatio: 1,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const adjustedHeight = Math.max(viewfinderHeight, MIN_QR_SCANNER_HEIGHT)
          const minSide = Math.min(viewfinderWidth, adjustedHeight)
          const size = Math.max(220, Math.min(340, Math.floor(minSide * 0.78)))
          return { width: size, height: size }
        },
        disableFlip: false,
      }

      try {
        await scanner.start(
          selectedCameraId ?? { facingMode: 'environment' },
          scannerConfig,
          (decodedText) => {
            void onQrScanSuccess(decodedText)
          },
          () => {
            // Ignore frame processing errors
          },
        )
      } catch (primaryError) {
        if (!selectedCameraId) {
          throw primaryError
        }

        try {
          await scanner.start(
            { facingMode: 'environment' },
            scannerConfig,
            (decodedText) => {
              void onQrScanSuccess(decodedText)
            },
            () => {
              // Ignore frame processing errors
            },
          )
        } catch {
          throw primaryError
        }
      }

      setIsScanning(true)
      setQrScanHint('Scanner active. Move to the next chunk after each successful scan.')
    } catch (error: unknown) {
      setIsScanning(false)
      setQrScanHint('Unable to start scanner. Check camera permissions and retry.')
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
      eventId: row.eventId && row.eventId !== 'unknown' && row.eventId !== 'null' ? row.eventId : 'none',
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
      const selectedCollections = allCollections.filter((collection) => snapshotCollections[collection])
      if (selectedCollections.length === 0) {
        notifications.show({
          color: 'yellow',
          title: 'Nothing selected',
          message: 'Choose at least one collection before exporting a snapshot.',
        })
        return
      }

      const collections: Partial<Record<SyncCollection, Record<string, unknown>[]>> = {}
      let totalRecords = 0

      for (const collection of selectedCollections) {
        const docs = await getCollectionDocs(collection)
        collections[collection] = docs
        totalRecords += docs.length
      }

      const snapshot = {
        exportedAt: new Date().toISOString(),
        version: 2,
        collections,
      }

      const serialized = JSON.stringify(snapshot, null, 2)
      downloadTextFile(serialized, `scouting-db-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
      notifications.show({
        color: 'green',
        title: 'Database export complete',
        message: `Exported ${totalRecords} records across ${selectedCollections.length} collection(s).`,
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

  const openClearScoutingDataModal = async (): Promise<void> => {
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

    try {
      const count = await db.collections.scoutingData.count().exec()
      setClearScoutingDataCount(count)
      setClearScoutingDataConfirmText('')
      setClearScoutingDataModalOpened(true)
    } catch (error: unknown) {
      handleError(error, 'Prepare clear scouting data modal')
    }
  }

  const handleClearScoutingData = async (): Promise<void> => {
    if (!db) {
      notifications.show({ color: 'red', title: 'Database not ready', message: 'Please wait for initialization.' })
      return
    }

    if (clearScoutingDataConfirmText.trim().toUpperCase() !== 'DELETE') {
      notifications.show({
        color: 'yellow',
        title: 'Confirmation required',
        message: 'Type DELETE to confirm clearing scouting data.',
      })
      return
    }

    setIsClearingScoutingData(true)
    try {
      const docs = await db.collections.scoutingData.find().exec()
      await Promise.all(docs.map(async (doc) => await doc.remove()))
      notifications.show({
        color: 'green',
        title: 'Scouting data cleared',
        message: `Removed ${docs.length} scouting observation${docs.length !== 1 ? 's' : ''}.`,
      })

      setClearScoutingDataModalOpened(false)
      setClearScoutingDataConfirmText('')
      setClearScoutingDataCount(0)
    } catch (error: unknown) {
      handleError(error, 'Clear scouting data')
    } finally {
      setIsClearingScoutingData(false)
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
        <Box className="animate-fadeInUp">
          <Group gap="md">
            <ThemeIcon 
              size={56} 
              radius="xl" 
              variant="light"
              style={{
                background: 'linear-gradient(135deg, rgba(26, 140, 255, 0.15), rgba(26, 140, 255, 0.08))',
                border: '1px solid rgba(26, 140, 255, 0.25)',
                boxShadow: '0 4px 16px rgba(26, 140, 255, 0.2), 0 0 24px rgba(26, 140, 255, 0.15)',
              }}
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
          styles={{
            list: {
              background: 'rgba(21, 28, 40, 0.6)',
              padding: '0.375rem',
              borderRadius: '14px',
              border: '1px solid rgba(148, 163, 184, 0.1)',
              backdropFilter: 'blur(8px)',
            },
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="network" leftSection={<IconWifi size={16} />}>Network</Tabs.Tab>
            <Tabs.Tab value="qr" leftSection={<IconQrcode size={16} />}>QR</Tabs.Tab>
            <Tabs.Tab value="csv" leftSection={<IconFileSpreadsheet size={16} />}>CSV</Tabs.Tab>
            <Tabs.Tab value="database" leftSection={<IconDatabase size={16} />}>Database</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="network" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card 
                p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]"
              >
                <Stack gap="lg">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Box
                        style={{
                          width: '4px',
                          height: '18px',
                          background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                          borderRadius: '2px',
                          boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                        }}
                      />
                      <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>
                        Hub Server
                      </Text>
                    </Group>
                    <Badge 
                      radius="md"
                      fw={700}
                      tt="uppercase"
                      style={{
                        letterSpacing: '0.05em',
                        fontSize: '0.7rem',
                        padding: '0.35rem 0.75rem',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                        ...(serverStatus.running
                          ? {
                              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.08))',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              color: '#6ee7b7',
                            }
                          : {
                              background: 'rgba(100, 116, 139, 0.1)',
                              border: '1px solid rgba(100, 116, 139, 0.2)',
                              color: '#94a3b8',
                            }),
                      }}
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
                          size="md"
                          variant="gradient"
                          gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                          fw={700}
                          style={{
                            letterSpacing: '0.01em',
                            transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          }}
                          className="active:scale-[0.97]"
                        >
                          Start Server
                        </Button>
                        <Button 
                          variant="light" 
                          color="red" 
                          onClick={() => void handleStopServer()} 
                          disabled={!isHub || !serverStatus.running}
                          size="md"
                          fw={700}
                          style={{
                            letterSpacing: '0.01em',
                            transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          }}
                          className="active:scale-[0.97]"
                        >
                          Stop Server
                        </Button>
                      </Group>

                      <Button variant="subtle" onClick={() => void refreshServerStatus()} size="md">
                        Refresh Status
                      </Button>

                      <Paper
                        p="lg"
                        radius="md"
                        style={{
                          padding: '1.25rem',
                          background: 'rgba(12, 18, 24, 0.6)',
                          borderRadius: '12px',
                          border: '1px solid rgba(148, 163, 184, 0.1)',
                        }}
                      >
                        <Stack gap="sm">
                          <Box>
                            <Text size="sm" c="slate.4" fw={600} mb={4}>Server URL:</Text>
                            <Code
                              block
                              style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.85rem',
                                padding: '0.75rem 1rem',
                                background: 'rgba(8, 12, 20, 0.8)',
                                border: '1px solid rgba(148, 163, 184, 0.15)',
                                borderRadius: '8px',
                                color: '#8ec5ff',
                                fontWeight: 600,
                                overflowX: 'auto',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s ease',
                              }}
                              className="mono-number hover:bg-[rgba(8,12,20,0.95)] hover:border-[rgba(26,140,255,0.25)]"
                            >
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
                                 <Box 
                                  key={`${item.quarantinedAt}-${index}`}
                                  p="xs"
                                  style={{
                                    background: 'rgba(245, 158, 11, 0.08)',
                                    borderLeft: '3px solid rgba(245, 158, 11, 0.4)',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    lineHeight: 1.4,
                                  }}
                                  c="warning.3"
                                >
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
                        fw={700}
                        style={{
                          letterSpacing: '0.01em',
                          transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        }}
                        className="active:scale-[0.97]"
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
                          onClick={() => void openClearScoutingDataModal()}
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

              <Card                 p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]">
                <Stack gap="lg">
                  <Group gap="xs" mb="xs">
                    <Box
                      style={{
                        width: '4px',
                        height: '18px',
                        background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                      }}
                    />
                    <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>Client Upload</Text>
                  </Group>
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
                    fw={700} style={{ letterSpacing: "0.01em", transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }} className="active:scale-[0.97]"
                    size="md"
                  >
                    Upload to Hub
                  </Button>
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="qr" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
              <Card                 p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]">
                <Stack gap="lg">
                  <Group gap="xs" mb="xs">
                    <Box
                      style={{
                        width: '4px',
                        height: '18px',
                        background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                      }}
                    />
                    <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>QR Export</Text>
                  </Group>
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

                  {forceSmallQrChunks && (
                    <Alert color="warning" variant="light" radius="md">
                      Test mode enabled: small QR chunk size ({qrChunkSize} chars).
                    </Alert>
                  )}

                  <Button
                    loading={isQrExporting}
                    onClick={() => void handleQrExport()}
                    variant="gradient"
                    gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                    leftSection={<IconQrcode size={18} />}
                    fw={700} style={{ letterSpacing: "0.01em", transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }} className="active:scale-[0.97]"
                    size="md"
                  >
                    Generate QR Codes
                  </Button>

                  {qrChunks.length > 0 && (
                    <Stack gap="lg" align="center">
                      <Badge
                        radius="md"
                        fw={700}
                        className="mono-number"
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: '0.85rem',
                          padding: '0.5rem 1rem',
                          background: 'linear-gradient(135deg, rgba(26, 140, 255, 0.15), rgba(26, 140, 255, 0.08))',
                          border: '1px solid rgba(26, 140, 255, 0.3)',
                          boxShadow: '0 2px 8px rgba(26, 140, 255, 0.2)',
                        }}
                      >
                        Code {currentQrIndex + 1} of {qrChunks.length}
                      </Badge>
                      <Paper
                        p="lg" 
                        radius="lg" 
                        style={{ 
                          backgroundColor: "#ffffff", 
                          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 4px rgba(26, 140, 255, 0.08), 0 0 0 8px rgba(26, 140, 255, 0.04)", 
                          transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" 
                        }} 
                        className="cursor-zoom-in hover:scale-[1.02]"
                        onClick={openQrPresentationMode}
                        role="button"
                        tabIndex={0}
                        aria-label="Open large QR presentation mode"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openQrPresentationMode()
                          }
                        }}
                      >
                        <QRCodeSVG value={activeExportQr} size={220} />
                      </Paper>

                      <Group gap="xs" wrap="wrap" justify="center">
                        <Button
                          variant="light"
                          size="xs"
                          leftSection={<IconArrowsMaximize size={14} />}
                          onClick={openQrPresentationMode}
                        >
                          Open Large QR
                        </Button>
                        <Text size="xs" c="slate.5">
                          Tip: full-screen mode is easier for laptop-to-laptop scanning.
                        </Text>
                      </Group>

                      <Button
                        variant="light"
                        onClick={showNextQr}
                        disabled={qrChunks.length <= 1}
                        size="md"
                      >
                        Next QR
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Card>

              <Card                 p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]">
                <Stack gap="lg">
                  <Group gap="xs" mb="xs" justify="space-between" align="center">
                    <Group gap="xs">
                      <Box
                        style={{
                          width: '4px',
                          height: '18px',
                          background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                          borderRadius: '2px',
                          boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                        }}
                      />
                      <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>QR Import</Text>
                    </Group>
                    <Tooltip label="How to use QR Import" position="left">
                      <ActionIcon
                        variant="subtle"
                        color="slate"
                        size="lg"
                        onClick={() => setQrImportHelpOpen(true)}
                        aria-label="QR Import help"
                      >
                        <IconHelp size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                  <Select
                    label="Import Collection"
                    value={importCollection}
                    onChange={(value) => {
                      if (allCollections.includes(value as SyncCollection)) {
                        setImportCollection(value as SyncCollection)
                        void stopScanner()
                        setQrScanHint('Import collection changed. Start scanner to capture chunks.')
                      }
                    }}
                    data={collectionOptions}
                    size="md"
                  />

                  <Select
                    label="Camera"
                    value={selectedCameraValue}
                    onChange={(value) => {
                      if (!value || value === '__auto__') {
                        setSelectedQrCamera(null)
                        return
                      }
                      setSelectedQrCamera(value)
                    }}
                    data={cameraSelectOptions}
                    placeholder="Select camera"
                    size="md"
                    allowDeselect={false}
                  />

                  <Text size="xs" c="slate.4" mb="xs">
                    {qrScanHint}
                  </Text>

                  <Button
                    variant={isScanning ? 'filled' : 'light'}
                    color={isScanning ? 'red' : 'frc-blue'}
                    onClick={() => void handleScanQr()}
                    leftSection={<IconCamera size={18} />}
                    fw={700} style={{ letterSpacing: "0.01em", transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }} className="active:scale-[0.97]"
                    size="md"
                  >
                    {isScanning ? 'Stop Scanner' : qrPreview ? 'Scan Again' : 'Scan QR'}
                  </Button>

                  <Box className="relative mx-auto w-full max-w-[340px]">
                    <div
                      id="sync-qr-scanner"
                      className="min-h-[240px] w-full overflow-hidden rounded-[14px] border-2 border-[rgba(26,140,255,0.2)] bg-[rgba(8,12,20,0.45)]"
                    />

                    {!isScanning && (
                      <Box className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[14px] border border-dashed border-[rgba(148,163,184,0.28)] bg-[rgba(8,12,20,0.35)] px-4">
                        <Text size="sm" c="slate.4" ta="center">
                          Camera preview appears here when scanner is active.
                        </Text>
                      </Box>
                    )}
                  </Box>

                  {showScanProgress && (
                    <Paper p="lg" radius="md" style={{ padding: "1rem", background: "rgba(12, 18, 24, 0.5)", borderRadius: "12px", border: "1px solid rgba(148, 163, 184, 0.08)", transition: "all 0.25s ease" }} className="hover:bg-[rgba(12,18,24,0.7)] hover:border-[rgba(148,163,184,0.12)]">
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Text size="sm" c="slate.3" fw={600}>Scan Progress</Text>
                          <Badge variant="light" fw={700} className="mono-number" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.85rem", padding: "0.5rem 1rem", background: "linear-gradient(135deg, rgba(26, 140, 255, 0.15), rgba(26, 140, 255, 0.08))", border: "1px solid rgba(26, 140, 255, 0.3)", boxShadow: "0 2px 8px rgba(26, 140, 255, 0.2)" }}>
                            {scannedChunks.size} / {expectedQrTotal}
                          </Badge>
                        </Group>

                        <Text size="xs" c="slate.4">
                          Next chunk to scan: <strong>{nextChunkToScan}</strong>
                        </Text>

                        <Progress 
                          value={(scannedChunks.size / expectedQrTotal) * 100} 
                          size="lg" 
                          radius="xl" 
                          style={{ 
                            height: "8px", 
                            borderRadius: "999px", 
                            overflow: "hidden", 
                            background: "rgba(148, 163, 184, 0.12)", 
                            boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.3)" 
                          }}
                        />

                        {capturedChunkIndexes.length > 0 && (
                          <Text size="xs" c="slate.5" className="mono-number">
                            Captured: {capturedChunkIndexes.join(', ')}
                          </Text>
                        )}

                        {missingChunkIndexes.length > 0 && (
                          <Text size="xs" c="slate.5" className="mono-number">
                            Remaining: {missingChunkIndexes.join(', ')}
                          </Text>
                        )}

                        <Group gap={6} wrap="wrap">
                          {Array.from({ length: expectedQrTotal }, (_, index) => index + 1).map((chunkNumber) => {
                            const captured = scannedChunks.has(chunkNumber)
                            return (
                              <Badge
                                key={`chunk-${chunkNumber}`}
                                size="xs"
                                variant={captured ? 'filled' : 'outline'}
                                color={captured ? 'green' : 'slate'}
                              >
                                {chunkNumber}
                              </Badge>
                            )
                          })}
                        </Group>
                      </Stack>
                    </Paper>
                  )}

                  {qrPreview ? (
                    <>
                      <Code 
                        block 
                        className="mono-number hover:bg-[rgba(8,12,20,0.95)] hover:border-[rgba(26,140,255,0.25)]" 
                        style={{ 
                          fontFamily: "JetBrains Mono, monospace", 
                          fontSize: "0.85rem", 
                          padding: "0.75rem 1rem", 
                          background: "rgba(8, 12, 20, 0.8)", 
                          border: "1px solid rgba(148, 163, 184, 0.15)", 
                          borderRadius: "8px", 
                          color: "#8ec5ff", 
                          fontWeight: 600, 
                          overflowX: "auto", 
                          whiteSpace: "nowrap", 
                          transition: "all 0.2s ease" 
                        }}
                      >
                        {JSON.stringify({ collection: qrPreview.collection, count: qrPreview.count })}
                      </Code>
                      <Button
                        onClick={() => void handleImportQr()}
                        variant="gradient"
                        gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}
                        leftSection={<IconCheck size={18} />}
                        fw={700}
                        style={{
                          letterSpacing: '0.01em',
                          transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        }}
                        className="active:scale-[0.97]"
                        size="md"
                      >
                        Import QR Payload
                      </Button>
                    </>
                  ) : (
                    <Paper
                      p="md"
                      radius="lg"
                      style={{
                        background: 'linear-gradient(135deg, rgba(26, 140, 255, 0.09), rgba(26, 140, 255, 0.04))',
                        border: '1px solid rgba(26, 140, 255, 0.24)',
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                      }}
                    >
                      <Group align="flex-start" gap="sm" wrap="nowrap">
                        <ThemeIcon size={30} radius="md" variant="light" color="frc-blue">
                          <IconCamera size={16} />
                        </ThemeIcon>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={600} c="slate.1">
                            Ready to scan
                          </Text>
                          <Text size="xs" c="slate.4" mt={2}>
                            Start scanner, then scan chunk <strong>1</strong> to begin import.
                          </Text>
                        </Box>
                        <Badge size="sm" radius="sm" variant="light" color="frc-blue" className="mono-number">
                          Chunk 1 first
                        </Badge>
                      </Group>
                    </Paper>
                  )}
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="csv" pt="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card                 p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]">
                <Stack gap="lg">
                  <Group gap="xs" mb="xs">
                    <Box
                      style={{
                        width: '4px',
                        height: '18px',
                        background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                      }}
                    />
                    <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>CSV Export</Text>
                  </Group>
                  <Text size="sm" c="slate.4">Export scoutingData as CSV for spreadsheet analysis.</Text>
                  <Button
                    onClick={() => void handleExportCsv()}
                    leftSection={<IconDownload size={18} />}
                    variant="gradient"
                    gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                    fw={700} style={{ letterSpacing: "0.01em", transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }} className="active:scale-[0.97]"
                    size="md"
                  >
                    Export CSV
                  </Button>
                </Stack>
              </Card>

              <Card                 p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]">
                <Stack gap="lg">
                  <Group gap="xs" mb="xs">
                    <Box
                      style={{
                        width: '4px',
                        height: '18px',
                        background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                      }}
                    />
                    <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>CSV Import</Text>
                  </Group>
                  <FileInput 
                    label="CSV File" 
                    accept=".csv" 
                    onChange={(file) => file && void parseCsvFile(file)} 
                    size="md"
                  />
                  {isCsvLoading && (
                    <Progress 
                      value={100} 
                      animated 
                      size="lg" 
                      radius="xl" 
                      style={{ 
                        height: "8px", 
                        borderRadius: "999px", 
                        overflow: "hidden", 
                        background: "rgba(148, 163, 184, 0.12)", 
                        boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.3)" 
                      }} 
                    />
                  )}
                  {csvParseError && <Alert color="red" radius="lg">{csvParseError}</Alert>}

                  {csvRows.length > 0 && (
                    <Paper 
                      radius="md" 
                      style={{ 
                        borderRadius: "12px", 
                        overflow: "hidden", 
                        border: "1px solid rgba(148, 163, 184, 0.1)" 
                      }}
                    >
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
                    </Paper>
                  )}

                  <Button
                    onClick={() => void handleImportCsv()}
                    leftSection={<IconUpload size={18} />}
                    disabled={csvRows.length === 0 || Boolean(csvParseError)}
                    variant="gradient"
                    gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}
                    fw={700} style={{ letterSpacing: "0.01em", transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }} className="active:scale-[0.97]"
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
              <Card                 p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]">
                <Stack gap="lg">
                  <Group gap="xs" mb="xs">
                    <Box
                      style={{
                        width: '4px',
                        height: '18px',
                        background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                      }}
                    />
                    <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>Database Export</Text>
                  </Group>
                  <Text size="sm" c="slate.4">Choose which collections to include in the JSON snapshot.</Text>

                  <Paper p="lg" radius="md" style={{ padding: "1rem", background: "rgba(12, 18, 24, 0.5)", borderRadius: "12px", border: "1px solid rgba(148, 163, 184, 0.08)", transition: "all 0.25s ease" }} className="hover:bg-[rgba(12,18,24,0.7)] hover:border-[rgba(148,163,184,0.12)]">
                    <Stack gap="xs">
                      <Text size="xs" c="slate.4" fw={600}>Include Collections</Text>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                        {allCollections.map((collection) => (
                          <Checkbox
                            key={`snapshot-${collection}`}
                            label={snapshotCollectionLabels[collection]}
                            checked={snapshotCollections[collection]}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked
                              setSnapshotCollections((previous) => ({
                                ...previous,
                                [collection]: checked,
                              }))
                            }}
                            styles={{
                              label: { color: 'var(--mantine-color-slate-2)' },
                            }}
                          />
                        ))}
                      </SimpleGrid>
                    </Stack>
                  </Paper>

                  <Button
                    onClick={() => void handleExportDatabase()}
                    leftSection={<IconDownload size={18} />}
                    variant="gradient"
                    gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                    fw={700} style={{ letterSpacing: "0.01em", transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }} className="active:scale-[0.97]"
                    size="md"
                  >
                    Export Database Snapshot
                  </Button>
                </Stack>
              </Card>

              <Card                 p="xl" 
                radius="lg"
                style={{
                  background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)] hover:-translate-y-[2px]">
                <Stack gap="lg">
                  <Group gap="xs" mb="xs">
                    <Box
                      style={{
                        width: '4px',
                        height: '18px',
                        background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
                      }}
                    />
                    <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>Database Import</Text>
                  </Group>
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
                    fw={700} style={{ letterSpacing: "0.01em", transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }} className="active:scale-[0.97]"
                    size="md"
                  >
                    Import Snapshot
                  </Button>
                  {dbImportProgress > 0 && (
                    <Progress 
                      value={dbImportProgress} 
                      animated 
                      size="lg" 
                      radius="xl" 
                      style={{ 
                        height: "8px", 
                        borderRadius: "999px", 
                        overflow: "hidden", 
                        background: "rgba(148, 163, 184, 0.12)", 
                        boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.3)" 
                      }} 
                    />
                  )}
                  {dbImportSummary && <Alert color="blue" radius="lg">{dbImportSummary}</Alert>}
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

      <Modal
        opened={clearScoutingDataModalOpened}
          onClose={() => {
            if (isClearingScoutingData) {
              return
            }
            setClearScoutingDataModalOpened(false)
            setClearScoutingDataConfirmText('')
          }}
          title="Clear Scouting Data"
          centered
          radius="lg"
          styles={{
            header: { backgroundColor: 'var(--surface-raised)' },
            body: { backgroundColor: 'var(--surface-raised)' },
          }}
        >
          <Stack gap="md">
            <Alert color="danger" variant="light" icon={<IconAlertTriangle size={16} />} radius="md">
              This permanently deletes all local scouting observations on this device.
            </Alert>

            <Text size="sm" c="slate.3">
              Records to delete: <strong>{clearScoutingDataCount}</strong>
            </Text>

            <TextInput
              label="Type DELETE to confirm"
              placeholder="DELETE"
              value={clearScoutingDataConfirmText}
              onChange={(event) => setClearScoutingDataConfirmText(event.currentTarget.value)}
              disabled={isClearingScoutingData}
            />

            <Group justify="flex-end">
              <Button
                variant="subtle"
                color="slate"
                onClick={() => {
                  setClearScoutingDataModalOpened(false)
                  setClearScoutingDataConfirmText('')
                }}
                disabled={isClearingScoutingData}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                leftSection={<IconTrash size={16} />}
                onClick={() => void handleClearScoutingData()}
                loading={isClearingScoutingData}
              >
                Delete Data
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={qrPresentationMode}
          onClose={closeQrPresentationMode}
          fullScreen
          withCloseButton={false}
          styles={{
            content: { backgroundColor: '#f3f4f6' },
            body: {
              backgroundColor: '#f3f4f6',
              padding: '1rem',
            },
          }}
        >
          <Stack gap="md" align="center" className="min-h-screen">
            <Group justify="space-between" w="100%" maw={1100}>
              <Button
                variant="filled"
                color="dark"
                leftSection={<IconArrowsMinimize size={16} />}
                onClick={closeQrPresentationMode}
              >
                Exit Large QR
              </Button>

              <Badge color="dark" variant="filled" radius="md" className="mono-number" size="lg">
                QR {currentQrIndex + 1} / {Math.max(qrChunks.length, 1)}
              </Badge>

              <Group gap="xs">
                <Button variant="light" color="dark" onClick={showPreviousQr} disabled={qrChunks.length <= 1}>
                  Previous
                </Button>
                <Button variant="filled" color="dark" onClick={showNextQr} disabled={qrChunks.length <= 1}>
                  Next
                </Button>
              </Group>
            </Group>

            <Paper
              radius="xl"
              p="lg"
              shadow="md"
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #d4d4d8',
              }}
            >
              <QRCodeSVG value={activeExportQr} size={presentationQrSize} />
            </Paper>

            <Text size="sm" c="dark.6" fw={500} ta="center" maw={900}>
              Keep this screen bright and square to the scanner. Use Arrow Left/Right (or P/N) to switch chunks.
            </Text>
          </Stack>
        </Modal>

        <Modal
          opened={qrImportHelpOpen}
          onClose={() => setQrImportHelpOpen(false)}
          title="How to Use QR Import"
          centered
          radius="lg"
          size="md"
        >
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={600} c="slate.1" mb="xs">Step-by-Step Instructions</Text>
              <Stack gap="xs">
                <Text size="sm" c="slate.3">
                  <strong>1.</strong> Select the collection type you want to import (Scouting Data, Forms, etc.)
                </Text>
                <Text size="sm" c="slate.3">
                  <strong>2.</strong> Choose your camera from the dropdown (or use auto-select)
                </Text>
                <Text size="sm" c="slate.3">
                  <strong>3.</strong> Click "Scan QR" to activate the camera
                </Text>
                <Text size="sm" c="slate.3">
                  <strong>4.</strong> Point your camera at each QR code chunk in order (1, 2, 3...)
                </Text>
                <Text size="sm" c="slate.3">
                  <strong>5.</strong> Watch the progress bar fill as chunks are captured
                </Text>
                <Text size="sm" c="slate.3">
                  <strong>6.</strong> When all chunks are scanned (100%), click "Import QR Payload"
                </Text>
              </Stack>
            </Box>

            <Box
              p="sm"
              style={{
                background: 'rgba(26, 140, 255, 0.08)',
                border: '1px solid rgba(26, 140, 255, 0.2)',
                borderRadius: '8px',
              }}
            >
              <Text size="xs" c="slate.3" fw={500}>
                <strong>Tip:</strong> If you scan a wrong chunk or need to restart, click "Scan Again" to reset the capture.
              </Text>
            </Box>
          </Stack>
        </Modal>
      </Stack>
    </Box>
  )
}
