import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconQrcode } from '@tabler/icons-react'
import {
  QrTransferTooLargeError,
  encodeQrTransfer,
  type QrDensity,
  type QrTransfer,
} from '../../../../shared/qrTransfer'
import { StepList } from '../../components/StepList'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { logger } from '../../lib/utils/logger'
import { QrReceivePanel } from './QrReceivePanel'
import { QrSendOverlay } from './QrSendOverlay'
import { SyncCard } from './SyncCard'
import { recordLastSent } from './lastSent'
import { buildPayload, buildSnapshot, countEntries, describeTransfer, parseTransferDocument } from './syncData'

type WhatToSend = 'entries' | 'setup' | 'form'

const SEND_CHOICES: Array<{ value: WhatToSend; label: string }> = [
  { value: 'entries', label: 'My scouting entries' },
  { value: 'setup', label: 'Scouting form, event and match schedule' },
  { value: 'form', label: 'Just the scouting form' },
]

// A transfer this long is better sent another way; the codes still work, just slowly.
const SLOW_TRANSFER_FRAMES = 80

type Prepared = {
  json: string
  summary: string
  isEmpty: boolean
  entries: number
}

async function prepareTransfer(db: ScoutingDatabase, what: WhatToSend): Promise<Prepared> {
  const document =
    what === 'entries'
      ? await buildPayload(db, 'scoutingData')
      : what === 'form'
        ? await buildPayload(db, 'formSchemas')
        : await buildSnapshot(db, ['formSchemas', 'events', 'matches', 'assignments'])

  const parsed = parseTransferDocument(document)
  const isEmpty = parsed.tasks.every((task) => task.rows.length === 0)
  return { json: JSON.stringify(document), summary: describeTransfer(parsed), isEmpty, entries: countEntries(parsed) }
}

type QrPanelProps = {
  db: ScoutingDatabase | null
  isHub: boolean
}

export function QrPanel({ db, isHub }: QrPanelProps): ReactElement {
  const [what, setWhat] = useState<WhatToSend>(isHub ? 'setup' : 'entries')
  const [density, setDensity] = useState<QrDensity>('balanced')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [transfer, setTransfer] = useState<QrTransfer | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [showing, setShowing] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const latestRequest = useRef(0)

  useEffect(() => {
    if (!db) {
      return
    }

    const request = (latestRequest.current += 1)
    let cancelled = false

    const run = async (): Promise<void> => {
      const startedAt = Date.now()
      setIsPreparing(true)
      setProblem(null)
      logger.debug('QR transfer preparation started', { transferType: what, density }, 'sync.qr.send')
      try {
        const next = await prepareTransfer(db, what)
        const encoded = next.isEmpty ? null : await encodeQrTransfer(next.json, { density })
        if (cancelled || request !== latestRequest.current) {
          return
        }
        setPrepared(next)
        setTransfer(encoded)
        logger.info('QR transfer prepared', {
          transferType: what,
          recordCount: next.entries,
          isEmpty: next.isEmpty,
          serializedBytes: new TextEncoder().encode(next.json).byteLength,
          frameCount: encoded?.frames.length ?? 0,
          density,
          elapsedMs: Date.now() - startedAt,
        }, 'sync.qr.send')
      } catch (error: unknown) {
        if (cancelled || request !== latestRequest.current) {
          return
        }
        setPrepared(null)
        setTransfer(null)
        setProblem(
          error instanceof QrTransferTooLargeError
            ? 'That is too much to send with QR codes. Use Wi-Fi or a file instead.'
            : error instanceof Error
              ? error.message
              : 'Could not get that ready.',
        )
        logger.error('QR transfer preparation failed', {
          transferType: what,
          density,
          elapsedMs: Date.now() - startedAt,
          error,
        }, 'sync.qr.send')
      } finally {
        if (!cancelled && request === latestRequest.current) {
          setIsPreparing(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [db, what, density])

  const frameCount = transfer?.frames.length ?? 0
  const passSeconds = Math.max(1, Math.round((frameCount * 400) / 1000))

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <SyncCard
          title="Send with QR codes"
          description="Show codes on this screen for another laptop’s camera to read."
          icon={<IconQrcode size={18} />}
        >
          <Select
            label="What do you want to send?"
            value={what}
            onChange={(value) => value && setWhat(value as WhatToSend)}
            data={SEND_CHOICES}
            allowDeselect={false}
          />

          {problem && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              {problem}
            </Alert>
          )}

          {prepared && !problem && (
            <Text size="sm" c="slate.2">
              {prepared.isEmpty
                ? 'There is nothing of this kind on this laptop yet.'
                : `${prepared.summary}. That takes ${frameCount} ${frameCount === 1 ? 'code' : 'codes'}, about ${passSeconds} seconds to show once.`}
            </Text>
          )}

          {frameCount > SLOW_TRANSFER_FRAMES && (
            <Text size="sm" c="warning.4">
              This is a lot for QR codes. Wi-Fi or a file will be much quicker.
            </Text>
          )}

          <Button
            onClick={() => {
              setConfirmSent(false)
              setShowing(true)
              logger.info('QR sender display opened', {
                frameCount,
                transferType: what,
                density,
                setupDelayMs: 5_000,
              }, 'sync.qr.send')
            }}
            disabled={!transfer || isPreparing}
            loading={isPreparing}
            leftSection={<IconQrcode size={16} />}
          >
            Show QR codes
          </Button>

          {confirmSent && prepared && (
            <Alert color="gray" variant="light" title="Did it arrive?">
              <Stack gap="xs">
                <Text size="sm">
                  If the other laptop said “Everything arrived”, mark your {prepared.entries.toLocaleString()}{' '}
                  {prepared.entries === 1 ? 'entry' : 'entries'} as sent so this laptop can remind you correctly.
                </Text>
                <Group gap="xs">
                  <Button
                    size="compact-sm"
                    onClick={() => {
                      recordLastSent({ at: new Date().toISOString(), entries: prepared.entries, method: 'qr' })
                      setConfirmSent(false)
                    }}
                  >
                    Yes, it arrived
                  </Button>
                  <Button size="compact-sm" variant="default" onClick={() => setConfirmSent(false)}>
                    Not yet
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}
        </SyncCard>

        <QrReceivePanel db={db} />
      </SimpleGrid>

      <SyncCard title="How it works" icon={<IconQrcode size={18} />}>
        <StepList
          steps={[
            {
              title: 'On the laptop that is sending, press Show QR codes',
              detail: 'A still code and a camera alignment guide appear first. Turn the screen brightness up.',
            },
            {
              title: 'On the other laptop, open QR codes and press Start camera',
              detail: 'Aim its camera at the sending screen, about a hand’s width away, with the whole code in view.',
            },
            {
              title: 'Line up the camera, then keep the screen open',
              detail: 'The first code stays still for five seconds. Matchbook then rotates the codes automatically and repeats them until the transfer is received.',
            },
            {
              title: 'Wait for “Everything arrived”, then press Add to this laptop',
              detail: 'The codes repeat, so it does not matter where it starts or if it misses a few.',
            },
            { title: 'Press Done on the sending laptop' },
          ]}
        />
      </SyncCard>

      {showing && transfer && prepared && (
        <QrSendOverlay
          key={transfer.sessionId}
          transfer={transfer}
          summary={prepared.summary}
          density={density}
          onDensityChange={setDensity}
          onClose={() => {
            setShowing(false)
            setConfirmSent(prepared.entries > 0)
          }}
        />
      )}
    </Stack>
  )
}
