import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Group, Progress, Select, Text } from '@mantine/core'
import { IconAlertTriangle, IconCamera, IconCheck } from '@tabler/icons-react'
import { QrTransferAssembler, decompressJson, type QrTransferProgress } from '../../../../shared/qrTransfer'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { handleError } from '../../lib/utils/errorHandler'
import { notify } from '../../lib/utils/notify'
import { useWakeLock } from '../../lib/hooks/useWakeLock'
import { SyncCard } from './SyncCard'
import {
  describeTransfer,
  importTransfer,
  parseTransferText,
  summarizeImport,
  type TransferDocument,
} from './syncData'
import { useQrScanner } from './useQrScanner'

const STALL_AFTER_MS = 12_000
const NOTHING_FOUND_AFTER_MS = 20_000
const FOREIGN_CODE_WINDOW_MS = 3_000
const SHOW_CELLS_UP_TO = 120

type ReadyTransfer = {
  document: TransferDocument
  description: string
}

type QrReceivePanelProps = {
  db: ScoutingDatabase | null
}

export function QrReceivePanel({ db }: QrReceivePanelProps): ReactElement {
  const [assembler] = useState(() => new QrTransferAssembler())
  const startedAtRef = useRef(0)
  const lastProgressAtRef = useRef(0)
  const foreignSeenRef = useRef<number[]>([])
  const [progress, setProgress] = useState<QrTransferProgress | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [ready, setReady] = useState<ReadyTransfer | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importedSummary, setImportedSummary] = useState<string | null>(null)

  const finishTransfer = useCallback(async (bytes: Uint8Array): Promise<void> => {
    try {
      const document = parseTransferText(await decompressJson(bytes))
      setReady({ document, description: describeTransfer(document) })
    } catch (error: unknown) {
      setReadError(error instanceof Error ? error.message : 'The codes were received but could not be read.')
    }
  }, [])

  // `stop` is defined by the scanner hook below; the handler reaches it through a ref so
  // the two can refer to each other without a dependency cycle.
  const stopRef = useRef<() => void>(() => undefined)

  const handleCode = useCallback(
    (text: string): void => {
      const now = Date.now()

      if (text.startsWith('{')) {
        setNote('That code comes from an older version of Matchbook. Update both laptops to the same version, then try again.')
        return
      }

      const result = assembler.addFrame(text)
      switch (result.kind) {
        case 'ignored': {
          const recent = foreignSeenRef.current.filter((at) => now - at < FOREIGN_CODE_WINDOW_MS)
          recent.push(now)
          foreignSeenRef.current = recent
          if (recent.length >= 3) {
            setNote('That is not a Matchbook code. Point the camera at the screen of the laptop that is sending.')
          }
          return
        }
        case 'duplicate':
          lastProgressAtRef.current = now
          return
        case 'accepted':
          lastProgressAtRef.current = now
          setProgress(result.progress)
          setHint(null)
          setNote(result.startedNewTransfer ? 'A different transfer started, so Matchbook began again with it.' : null)
          return
        case 'corrupt':
          setProgress(result.progress)
          setNote('Part of that transfer was garbled on the way. Keep the camera on the screen and it will collect it again.')
          return
        case 'complete':
          stopRef.current()
          setProgress(result.progress)
          setNote(null)
          void finishTransfer(result.bytes)
          return
      }
    },
    [assembler, finishTransfer],
  )

  const { videoRef, status, failure, cameras, cameraId, start, stop, selectCamera } = useQrScanner(handleCode)

  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  useWakeLock(status === 'scanning')

  useEffect(() => {
    if (status !== 'scanning') {
      return
    }

    const timer = window.setInterval(() => {
      const now = Date.now()
      if (assembler.progress().received > 0) {
        if (now - lastProgressAtRef.current > STALL_AFTER_MS) {
          setHint('No new codes for a while. Move a little closer, avoid glare on either screen, and make sure the sender is still showing codes.')
        }
      } else if (now - startedAtRef.current > NOTHING_FOUND_AFTER_MS) {
        setHint('No code found yet. Make sure the other laptop is showing codes with its screen bright, and hold the camera steady in front of it.')
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [assembler, status])

  const reset = useCallback((): void => {
    stop()
    assembler.reset()
    foreignSeenRef.current = []
    setProgress(null)
    setNote(null)
    setHint(null)
    setReady(null)
    setReadError(null)
    setImportedSummary(null)
  }, [assembler, stop])

  const beginScanning = useCallback((): void => {
    assembler.reset()
    foreignSeenRef.current = []
    startedAtRef.current = Date.now()
    lastProgressAtRef.current = Date.now()
    setProgress(null)
    setNote(null)
    setHint(null)
    setReady(null)
    setReadError(null)
    setImportedSummary(null)
    void start()
  }, [assembler, start])

  const addToThisLaptop = async (): Promise<void> => {
    if (!db || !ready) {
      return
    }

    setIsImporting(true)
    try {
      const result = await importTransfer(db, ready.document)
      const summary = summarizeImport(result)
      notify({
        color: result.errors > 0 ? 'yellow' : 'green',
        title: result.errors > 0 ? 'Added, with some problems' : 'Added to this laptop',
        message: summary,
      })
      setImportedSummary(summary)
      setReady(null)
    } catch (error: unknown) {
      handleError(error, 'Add QR transfer')
    } finally {
      setIsImporting(false)
    }
  }

  const isActive = status === 'starting' || status === 'scanning'
  const total = progress?.total ?? 0
  const received = progress?.received ?? 0
  const percent = total > 0 ? Math.round((received / total) * 100) : 0
  const includesForm = ready?.document.tasks.some((task) => task.collection === 'formSchemas') ?? false

  return (
    <SyncCard
      title="Receive with the camera"
      description="Use this laptop’s camera to read the codes from the other laptop’s screen."
      icon={<IconCamera size={18} />}
      aside={
        isActive ? (
          <Badge variant="light" color="green" radius="sm">
            Camera on
          </Badge>
        ) : undefined
      }
    >
      <div className={isActive ? 'qr-preview' : 'qr-preview qr-preview--off'}>
        <video ref={videoRef} muted playsInline aria-label="Camera view" />
      </div>

      {failure && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Could not start the camera">
          {failure.message}
        </Alert>
      )}

      {readError && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Could not read the transfer">
          {readError}
        </Alert>
      )}

      {ready ? (
        <>
          <Alert color="green" variant="light" icon={<IconCheck size={16} />} title="Everything arrived">
            Ready to add to this laptop: <strong>{ready.description}</strong>.
            {includesForm ? ' The scouting form in this transfer will replace the one scouts see here.' : ''}
          </Alert>
          <Group>
            <Button onClick={() => void addToThisLaptop()} loading={isImporting} disabled={!db}>
              Add to this laptop
            </Button>
            <Button variant="default" onClick={reset} disabled={isImporting}>
              Cancel
            </Button>
          </Group>
        </>
      ) : importedSummary ? (
        <>
          <Alert color="green" variant="light" icon={<IconCheck size={16} />} title="Added to this laptop">
            {importedSummary}
          </Alert>
          <Group>
            <Button variant="default" onClick={beginScanning}>
              Receive another
            </Button>
          </Group>
        </>
      ) : (
        <>
          {isActive && (
            <div aria-live="polite">
              <Text size="sm" c="slate.1" fw={500}>
                {received > 0
                  ? `Receiving: ${received} of ${total} codes`
                  : status === 'starting'
                    ? 'Starting the camera…'
                    : 'Looking for a code…'}
              </Text>
              {received === 0 && status === 'scanning' && (
                <Text size="xs" c="slate.4" mt={2}>
                  Hold this laptop’s camera facing the other screen, about a hand’s width away. Keep the whole code in view.
                </Text>
              )}
            </div>
          )}

          {received > 0 && (
            <>
              <Progress value={percent} size="sm" radius="xl" aria-label="Codes received" />
              {total <= SHOW_CELLS_UP_TO && (
                <div className="qr-progress" aria-hidden="true">
                  {Array.from({ length: total }, (_, position) => (
                    <span
                      key={position}
                      className={
                        progress?.receivedIndexes.includes(position + 1)
                          ? 'qr-progress__cell qr-progress__cell--done'
                          : 'qr-progress__cell'
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {note && (
            <Text size="sm" c="warning.4">
              {note}
            </Text>
          )}
          {hint && (
            <Text size="sm" c="slate.2">
              {hint}
            </Text>
          )}

          <Group>
            {isActive ? (
              <Button variant="default" onClick={reset}>
                Stop camera
              </Button>
            ) : (
              <Button onClick={beginScanning} leftSection={<IconCamera size={16} />}>
                Start camera
              </Button>
            )}
          </Group>

          {cameras.length > 1 && (
            <Select
              label="Camera"
              size="sm"
              value={cameraId}
              onChange={(value) => value && selectCamera(value)}
              data={cameras.map((camera) => ({ value: camera.id, label: camera.label }))}
              allowDeselect={false}
            />
          )}
        </>
      )}
    </SyncCard>
  )
}
