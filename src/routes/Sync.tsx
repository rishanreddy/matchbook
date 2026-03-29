import type { ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  FileInput,
  Group,
  Loader,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Html5Qrcode } from 'html5-qrcode'
import Papa from 'papaparse'
import { QRCodeSVG } from 'qrcode.react'
import { useDatabaseStore } from '../stores/useDatabase'
import { compressData, decompressData, reconstructFromChunks, splitIntoChunks } from '../lib/utils/sync'

type CollectionKey = 'scoutingData' | 'assignments' | 'matches' | 'events' | 'devices' | 'scouts' | 'formSchemas'
type TimeRange = 'lastHour' | 'lastDay' | 'all'
type SyncStatus = 'idle' | 'syncing' | 'error'

type ChunkPayload = {
  index: number
  total: number
  payload: string
}

type CsvRow = Record<string, string>

const QR_CHUNK_SIZE = 1800
const allCollections: CollectionKey[] = [
  'scoutingData',
  'assignments',
  'matches',
  'events',
  'devices',
  'scouts',
  'formSchemas',
]

export function Sync(): ReactElement {
  const db = useDatabaseStore((state) => state.db)

  const [isServerRunning, setIsServerRunning] = useState<boolean>(false)
  const [serverUrl, setServerUrl] = useState<string>('http://192.168.1.100:3000/sync')
  const [clientServerUrl, setClientServerUrl] = useState<string>('')
  const [clientSyncStatus, setClientSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string>('Never')

  const [qrRange, setQrRange] = useState<TimeRange>('lastDay')
  const [qrCollection, setQrCollection] = useState<CollectionKey>('scoutingData')
  const [qrChunks, setQrChunks] = useState<string[]>([])
  const [currentQrIndex, setCurrentQrIndex] = useState<number>(0)
  const [isQrExporting, setIsQrExporting] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scannedChunks, setScannedChunks] = useState<Map<number, string>>(new Map())
  const [expectedQrTotal, setExpectedQrTotal] = useState<number>(0)
  const [qrPreview, setQrPreview] = useState<object | null>(null)
  const [qrImportPayload, setQrImportPayload] = useState<string>('')

  const [csvEventFilter, setCsvEventFilter] = useState<string>('all')
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvParseError, setCsvParseError] = useState<string>('')
  const [csvImportSummary, setCsvImportSummary] = useState<string>('')
  const [isCsvLoading, setIsCsvLoading] = useState<boolean>(false)

  const [dbExportPath, setDbExportPath] = useState<string>('')
  const [dbExportSize, setDbExportSize] = useState<string>('')
  const [dbImportFile, setDbImportFile] = useState<File | null>(null)
  const [dbImportProgress, setDbImportProgress] = useState<number>(0)
  const [dbImportSummary, setDbImportSummary] = useState<string>('')
  const [isCsvDragging, setIsCsvDragging] = useState<boolean>(false)

  const eventOptions = useMemo(
    () => [{ value: 'all', label: 'All events' }],
    [],
  )

  const formatIsoDate = (value: string): string => {
    return new Date(value).toLocaleString()
  }

  const getCollectionDocs = async (collection: CollectionKey): Promise<Record<string, unknown>[]> => {
    if (!db) {
      return []
    }

    const docs = await db.collections[collection].find().exec()
    return docs.map((doc) => doc.toJSON() as Record<string, unknown>)
  }

  const insertCollectionDoc = async (collection: CollectionKey, doc: Record<string, unknown>): Promise<void> => {
    await db?.collections[collection].insert(doc as never)
  }

  const filterByRange = (docs: Record<string, unknown>[], range: TimeRange): Record<string, unknown>[] => {
    if (range === 'all') {
      return docs
    }

    const now = Date.now()
    const threshold = range === 'lastHour' ? now - 60 * 60 * 1000 : now - 24 * 60 * 60 * 1000

    return docs.filter((doc) => {
      const timestamp = typeof doc.timestamp === 'string' ? Date.parse(doc.timestamp) : Number.NaN
      const createdAt = typeof doc.createdAt === 'string' ? Date.parse(doc.createdAt) : Number.NaN
      const dateMs = Number.isNaN(timestamp) ? createdAt : timestamp
      return !Number.isNaN(dateMs) && dateMs >= threshold
    })
  }

  const handleStartSyncServer = (): void => {
    setIsServerRunning((prev) => !prev)
    notifications.show({
      color: 'blue',
      title: isServerRunning ? 'Sync server stopped' : 'Sync server started',
      message: 'Network sync backend integration is coming soon. Share this URL with clients for now.',
    })
  }

  const handleConnectAndSync = async (): Promise<void> => {
    if (!clientServerUrl.trim()) {
      setClientSyncStatus('error')
      notifications.show({
        color: 'red',
        title: 'Missing server URL',
        message: 'Enter the sync server URL from the hub device.',
      })
      return
    }

    setClientSyncStatus('syncing')
    await new Promise((resolve) => {
      window.setTimeout(resolve, 700)
    })
    setClientSyncStatus('idle')
    setLastSyncAt(new Date().toISOString())
    notifications.show({
      color: 'blue',
      title: 'Coming soon',
      message: 'RxDB CouchDB replication will be added when backend sync server is available.',
    })
  }

  const handleQrExport = async (): Promise<void> => {
    if (!db) {
      notifications.show({ color: 'red', title: 'Database not ready', message: 'Please wait for initialization.' })
      return
    }

    setIsQrExporting(true)
    try {
      const docs = await getCollectionDocs(qrCollection)
      const filtered = filterByRange(docs, qrRange)
      const payload = {
        exportedAt: new Date().toISOString(),
        collection: qrCollection,
        count: filtered.length,
        data: filtered,
      }
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
        message: `Generated ${encodedChunks.length} QR code${encodedChunks.length === 1 ? '' : 's'}.`,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Export failed',
        message: error instanceof Error ? error.message : 'Unable to generate QR export.',
      })
    } finally {
      setIsQrExporting(false)
    }
  }

  const stopScanner = async (): Promise<void> => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
      } catch {
        // ignore stop errors
      }
      try {
        await scannerRef.current.clear()
      } catch {
        // ignore clear errors
      }
      scannerRef.current = null
    }
    setIsScanning(false)
  }

  const onQrScanSuccess = async (decodedText: string): Promise<void> => {
    try {
      const parsed = JSON.parse(decodedText) as ChunkPayload
      if (!parsed.index || !parsed.total || !parsed.payload) {
        throw new Error('QR code is not a valid sync payload.')
      }

      setExpectedQrTotal(parsed.total)
      setScannedChunks((prev) => {
        const next = new Map(prev)
        next.set(parsed.index, parsed.payload)
        if (next.size === parsed.total) {
          const ordered = Array.from({ length: parsed.total }, (_, idx) => next.get(idx + 1) ?? '')
          if (ordered.some((item) => !item)) {
            throw new Error('Missing QR chunks. Please re-scan sequence.')
          }

          const reconstructed = reconstructFromChunks(ordered)
          const decompressed = decompressData(reconstructed)
          setQrImportPayload(reconstructed)
          setQrPreview(decompressed)
          void stopScanner()
          notifications.show({
            color: 'green',
            title: 'QR scan complete',
            message: `Captured ${parsed.total} of ${parsed.total} QR chunks.`,
          })
        }
        return next
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
    setScannedChunks(new Map())
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
          // ignore noisy scan errors from frames
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
    if (!db || !qrImportPayload) {
      return
    }

    try {
      const parsed = decompressData(qrImportPayload) as {
        collection: CollectionKey
        data: Record<string, unknown>[]
      }

      let inserted = 0
      let duplicates = 0
      for (const row of parsed.data) {
        const syncHash = typeof row.syncHash === 'string' ? row.syncHash : ''
        if (syncHash) {
          const duplicate = await db.collections.scoutingData
            .findOne({ selector: { syncHash } })
            .exec()
          if (duplicate) {
            duplicates += 1
            continue
          }
        }

        try {
          await insertCollectionDoc(parsed.collection, row)
          inserted += 1
        } catch {
          duplicates += 1
        }
      }

      notifications.show({
        color: 'green',
        title: 'Import complete',
        message: `${inserted} new records imported, ${duplicates} duplicates skipped.`,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'Unable to import scanned payload.',
      })
    }
  }

  const flattenScoutingRow = (row: Record<string, unknown>): CsvRow => {
    const base: CsvRow = {}
    Object.entries(row).forEach(([key, value]) => {
      if (key === 'formData' && value && typeof value === 'object') {
        Object.entries(value as Record<string, unknown>).forEach(([formKey, formValue]) => {
          base[`formData.${formKey}`] = String(formValue ?? '')
        })
      } else {
        base[key] = String(value ?? '')
      }
    })
    return base
  }

  const downloadTextFile = (contents: string, fileName: string): void => {
    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = async (): Promise<void> => {
    if (!db) {
      return
    }

    const docs = await getCollectionDocs('scoutingData')
    const filtered = csvEventFilter === 'all' ? docs : docs.filter((doc) => doc.matchKey?.toString().includes(csvEventFilter))
    const rows = filtered.map(flattenScoutingRow)
    const csv = Papa.unparse(rows)
    downloadTextFile(csv, `scoutingData-${new Date().toISOString().slice(0, 10)}.csv`)
    notifications.show({
      color: 'green',
      title: 'CSV exported',
      message: `Exported ${rows.length} scouting records.`,
    })
  }

  const parseCsvFile = async (file: File): Promise<void> => {
    setCsvParseError('')
    setCsvImportSummary('')
    setIsCsvLoading(true)
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const required = ['matchKey', 'teamNumber', 'originDeviceId']
        const missing = required.filter((key) => !results.meta.fields?.includes(key))
        if (missing.length > 0) {
          setCsvRows([])
          setCsvParseError(`Missing required columns: ${missing.join(', ')}`)
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
        setIsCsvLoading(false)
      },
    })
  }

  const handleCsvDrop = (files: FileList | null): void => {
    const file = files?.item(0)
    if (!file) {
      setCsvParseError('Unsupported file. Please choose a valid CSV file.')
      return
    }
    void parseCsvFile(file)
  }

  const handleImportCsv = async (): Promise<void> => {
    if (!db || csvRows.length === 0) {
      return
    }

    let inserted = 0
    let duplicates = 0
    for (const row of csvRows) {
      const syncHash = row.syncHash
      if (syncHash) {
        const existing = await db.collections.scoutingData.findOne({ selector: { syncHash } }).exec()
        if (existing) {
          duplicates += 1
          continue
        }
      }
      try {
        await db.collections.scoutingData.insert(row as never)
        inserted += 1
      } catch {
        duplicates += 1
      }
    }

    setCsvImportSummary(`${inserted} new records, ${duplicates} duplicates`)
    notifications.show({
      color: 'green',
      title: 'CSV import complete',
      message: `${inserted} new records imported, ${duplicates} duplicates skipped.`,
    })
  }

  const handleExportDatabase = async (): Promise<void> => {
    if (!db) {
      return
    }

    try {
      const snapshot: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        collections: {},
      }

      for (const collection of allCollections) {
        const docs = await getCollectionDocs(collection)
        ;(snapshot.collections as Record<string, unknown[]>)[collection] = docs
      }

      const serialized = JSON.stringify(snapshot)
      const blob = new Blob([serialized], { type: 'application/json' })
      downloadTextFile(serialized, `scouting-db-${new Date().toISOString().slice(0, 10)}.json`)
      setDbExportPath('Downloaded via browser save dialog')
      setDbExportSize(`${(blob.size / 1024).toFixed(1)} KB`)
      notifications.show({
        color: 'green',
        title: 'Database export complete',
        message: 'Saved full database snapshot. In Electron builds, this will use native save dialog.',
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Export failed',
        message:
          error instanceof Error
            ? `${error.message} If access is denied, choose a writable folder.`
            : 'Unable to export database file. Choose a writable location and try again.',
      })
    }
  }

  const handleImportDatabase = async (): Promise<void> => {
    if (!dbImportFile || !db) {
      return
    }

    try {
      setDbImportProgress(10)
      const text = await dbImportFile.text()
      const parsed = JSON.parse(text) as { collections?: Record<string, Record<string, unknown>[]> }
      const collections = parsed.collections ?? {}
      let inserted = 0
      let skipped = 0

      const entries = Object.entries(collections) as [CollectionKey, Record<string, unknown>[]][]
      for (let index = 0; index < entries.length; index += 1) {
        const [collectionName, docs] = entries[index]
        for (const doc of docs) {
          try {
            await insertCollectionDoc(collectionName, doc)
            inserted += 1
          } catch {
            skipped += 1
          }
        }
        setDbImportProgress(Math.round(((index + 1) / Math.max(entries.length, 1)) * 100))
      }

      setDbImportSummary(`${inserted} imported, ${skipped} skipped`)
      notifications.show({
        color: 'green',
        title: 'Database merge complete',
        message: `${inserted} records imported, ${skipped} skipped as duplicates/conflicts.`,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Database import failed',
        message:
          error instanceof Error
            ? `${error.message} Check file permissions and JSON format.`
            : 'Could not import database file. Check file permissions and try again.',
      })
    }
  }

  return (
    <Stack>
      <Title order={2}>Sync Data</Title>
      <Tabs defaultValue="network">
        <Tabs.List>
          <Tabs.Tab value="network">Network Sync</Tabs.Tab>
          <Tabs.Tab value="qr">QR Code Export/Import</Tabs.Tab>
          <Tabs.Tab value="csv">CSV Export/Import</Tabs.Tab>
          <Tabs.Tab value="database">Database File Export/Import</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="network" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder p="lg" radius="md">
              <Stack>
                <Group justify="space-between">
                  <Title order={4}>Hub Device</Title>
                  <Badge color={isServerRunning ? 'green' : 'gray'}>{isServerRunning ? 'running' : 'stopped'}</Badge>
                </Group>
                <TextInput label="Server URL" value={serverUrl} onChange={(event) => setServerUrl(event.currentTarget.value)} />
                <Button onClick={handleStartSyncServer}>{isServerRunning ? 'Stop Sync Server' : 'Start Sync Server'}</Button>
                <Text size="sm">Share this URL with clients:</Text>
                <Code>{serverUrl}</Code>
                <Box w={220}>
                  <QRCodeSVG value={serverUrl} size={220} />
                </Box>
              </Stack>
            </Card>

            <Card withBorder p="lg" radius="md">
              <Stack>
                <Title order={4}>Client Device</Title>
                <TextInput
                  label="Hub server URL"
                  placeholder="http://192.168.1.100:3000/sync"
                  value={clientServerUrl}
                  onChange={(event) => setClientServerUrl(event.currentTarget.value)}
                />
                <Button loading={clientSyncStatus === 'syncing'} onClick={() => void handleConnectAndSync()}>
                  Connect and Sync
                </Button>
                <Text size="sm">Last sync: {lastSyncAt === 'Never' ? lastSyncAt : formatIsoDate(lastSyncAt)}</Text>
                <Badge color={clientSyncStatus === 'error' ? 'red' : clientSyncStatus === 'syncing' ? 'blue' : 'gray'}>
                  {clientSyncStatus}
                </Badge>
                <Alert color="blue" variant="light" title="Coming soon">
                  Future: RxDB CouchDB-protocol replication with conflict-safe merge logic. Requires backend sync server.
                </Alert>
              </Stack>
            </Card>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="qr" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder p="lg" radius="md">
              <Stack>
                <Title order={4}>Export</Title>
                <Group grow>
                  <Select
                    label="Date range"
                    value={qrRange}
                    onChange={(value) => setQrRange((value as TimeRange | null) ?? 'lastDay')}
                    data={[
                      { value: 'lastHour', label: 'Last hour' },
                      { value: 'lastDay', label: 'Last day' },
                      { value: 'all', label: 'All data' },
                    ]}
                  />
                  <Select
                    label="Collection"
                    value={qrCollection}
                    onChange={(value) => setQrCollection((value as CollectionKey | null) ?? 'scoutingData')}
                    data={allCollections.map((collection) => ({ value: collection, label: collection }))}
                  />
                </Group>
                <Button loading={isQrExporting} onClick={() => void handleQrExport()}>
                  Export Recent Data
                </Button>

                {qrChunks.length > 0 ? (
                  <Stack>
                    <Text fw={600}>
                      QR {currentQrIndex + 1} of {qrChunks.length}
                    </Text>
                    <Box w={280}>
                      <QRCodeSVG value={qrChunks[currentQrIndex]} size={280} />
                    </Box>
                    <Button
                      variant="light"
                      onClick={() => setCurrentQrIndex((prev) => (prev + 1) % qrChunks.length)}
                      disabled={qrChunks.length <= 1}
                    >
                      Next
                    </Button>
                  </Stack>
                ) : null}
              </Stack>
            </Card>

            <Card withBorder p="lg" radius="md">
              <Stack>
                <Title order={4}>Import</Title>
                <Button variant={isScanning ? 'filled' : 'light'} onClick={() => void handleScanQr()}>
                  {isScanning ? 'Stop Scanning' : 'Scan QR Code'}
                </Button>
                <Button variant="subtle" onClick={() => void handleScanQr()} disabled={isScanning}>
                  Try again
                </Button>
                <div id="sync-qr-scanner" style={{ width: '100%', maxWidth: 340 }} />
                {expectedQrTotal > 0 ? (
                  <Text size="sm">
                    Captured {scannedChunks.size} of {expectedQrTotal}
                  </Text>
                ) : null}
                {qrPreview ? (
                  <Code block>{JSON.stringify(qrPreview, null, 2)}</Code>
                ) : (
                  <Text size="sm" c="dimmed">
                    Scan one or more QR codes to preview payload before importing.
                  </Text>
                )}
                <Button onClick={() => void handleImportQr()} disabled={!qrPreview}>
                  Import
                </Button>
              </Stack>
            </Card>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="csv" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder p="lg" radius="md">
              <Stack>
                <Title order={4}>Export</Title>
                <Select label="Collection" data={[{ value: 'scoutingData', label: 'scoutingData' }]} value="scoutingData" disabled />
                <Select label="Event filter" data={eventOptions} value={csvEventFilter} onChange={(value) => setCsvEventFilter(value ?? 'all')} />
                <Button onClick={() => void handleExportCsv()}>Export to CSV</Button>
              </Stack>
            </Card>

            <Card withBorder p="lg" radius="md">
              <Stack>
                <Title order={4}>Import</Title>
                <Box
                  p="md"
                  style={{ border: '1px dashed var(--mantine-color-gray-6)', borderRadius: 8 }}
                  bg={isCsvDragging ? 'dark.7' : undefined}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsCsvDragging(true)
                  }}
                  onDragLeave={() => setIsCsvDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setIsCsvDragging(false)
                    handleCsvDrop(event.dataTransfer.files)
                  }}
                >
                  <Text>Drag and drop CSV file here, or click to select</Text>
                </Box>
                <FileInput label="Or choose file" accept=".csv" onChange={(file) => file && void parseCsvFile(file)} />
                {isCsvLoading ? <Loader size="sm" /> : null}
                {csvParseError ? <Alert color="red">{csvParseError}</Alert> : null}

                {csvRows.length > 0 ? (
                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        {Object.keys(csvRows[0]).slice(0, 6).map((key) => (
                          <Table.Th key={key}>{key}</Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {csvRows.slice(0, 8).map((row, idx) => (
                        <Table.Tr key={`${row.id ?? idx}`}>
                          {Object.keys(csvRows[0]).slice(0, 6).map((key) => (
                            <Table.Td key={`${idx}-${key}`}>{row[key]}</Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : null}

                <Button onClick={() => void handleImportCsv()} disabled={csvRows.length === 0}>
                  Import
                </Button>
                {csvImportSummary ? <Alert color="green">{csvImportSummary}</Alert> : null}
              </Stack>
            </Card>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="database" pt="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder p="lg" radius="md">
              <Stack>
                <Title order={4}>Export</Title>
                <Button onClick={() => void handleExportDatabase()}>Export Database File</Button>
                {dbExportPath ? <Text size="sm">Path: {dbExportPath}</Text> : null}
                {dbExportSize ? <Text size="sm">Size: {dbExportSize}</Text> : null}
              </Stack>
            </Card>

            <Card withBorder p="lg" radius="md">
              <Stack>
                <Title order={4}>Import</Title>
                <Alert color="yellow" variant="light">
                  This will merge data into your existing database. It will not replace local records.
                </Alert>
                <FileInput label="Database export file" accept="application/json" value={dbImportFile} onChange={setDbImportFile} />
                <Button onClick={() => void handleImportDatabase()} disabled={!dbImportFile}>
                  Import Database
                </Button>
                {dbImportProgress > 0 ? <Progress value={dbImportProgress} /> : null}
                {dbImportSummary ? <Alert color="green">{dbImportSummary}</Alert> : null}
              </Stack>
            </Card>
          </SimpleGrid>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
