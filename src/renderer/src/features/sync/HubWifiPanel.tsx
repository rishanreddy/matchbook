import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { IconAlertTriangle, IconWifi } from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import type { FailedSyncPayload } from '../../../../shared/electron'
import { CopyTextButton } from '../../components/CopyTextButton'
import { StepList } from '../../components/StepList'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { handleError } from '../../lib/utils/errorHandler'
import { notify } from '../../lib/utils/notify'
import { useDeviceStore } from '../../stores/useDeviceStore'
import { useWifiHub } from '../../stores/useWifiHub'
import { addReceivedScouting } from './hubService'
import { SyncCard } from './SyncCard'
import { formatSyncToken } from './token'
import { encodePairing } from './wifi'

type HubWifiPanelProps = {
  db: ScoutingDatabase | null
}

export function HubWifiPanel({ db }: HubWifiPanelProps): ReactElement {
  const status = useWifiHub((state) => state.status)
  const token = useWifiHub((state) => state.token)
  const port = useWifiHub((state) => state.port)
  const autoAdd = useWifiHub((state) => state.autoAdd)
  const received = useWifiHub((state) => state.receivedThisSession)
  const sharedSummary = useWifiHub((state) => state.sharedSummary)
  const isStarting = useWifiHub((state) => state.isStarting)
  const error = useWifiHub((state) => state.error)
  const deviceId = useDeviceStore((state) => state.deviceId)
  const deviceName = useDeviceStore((state) => state.deviceName)
  const [isAdding, setIsAdding] = useState(false)
  const [setAside, setSetAside] = useState<FailedSyncPayload[]>([])
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearText, setClearText] = useState('')

  const desktop = Boolean(window.electronAPI)
  const running = status?.running ?? false
  const name = deviceName?.trim() || 'Lead scout laptop'
  const waiting = status?.queueLength ?? 0
  const failedCount = status?.failedQueueLength ?? 0

  useEffect(() => {
    void useWifiHub.getState().refresh()
    const timer = window.setInterval(() => void useWifiHub.getState().refresh(), 4000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!window.electronAPI || failedCount === 0) {
      return
    }

    let cancelled = false
    void window.electronAPI.peekQuarantinedSyncPayloads().then((items) => {
      if (!cancelled) {
        setSetAside(items)
      }
    })
    return () => {
      cancelled = true
    }
  }, [failedCount])

  const visibleSetAside = failedCount === 0 ? [] : setAside

  const start = async (): Promise<void> => {
    await useWifiHub.getState().start({ id: deviceId ?? 'hub', name })
  }

  const addNow = async (): Promise<void> => {
    if (!db) {
      return
    }

    setIsAdding(true)
    try {
      await addReceivedScouting(db, { manual: true })
    } catch (caught: unknown) {
      handleError(caught, 'Add received scouting')
    } finally {
      setIsAdding(false)
    }
  }

  const retrySetAside = async (): Promise<void> => {
    try {
      await window.electronAPI?.retryQuarantinedSyncPayloads()
      await useWifiHub.getState().refresh()
      notify({ color: 'blue', title: 'Trying again', message: 'The set-aside uploads were put back in line to be added.' })
      if (db) {
        await addReceivedScouting(db)
      }
    } catch (caught: unknown) {
      handleError(caught, 'Retry set-aside uploads')
    }
  }

  const removeSetAside = async (): Promise<void> => {
    if (clearText.trim().toUpperCase() !== 'REMOVE') {
      return
    }

    try {
      await window.electronAPI?.clearQuarantinedSyncPayloads()
      await useWifiHub.getState().refresh()
      setConfirmingClear(false)
      setClearText('')
    } catch (caught: unknown) {
      handleError(caught, 'Remove set-aside uploads')
    }
  }

  if (!desktop) {
    return (
      <SyncCard title="Receive over Wi-Fi" icon={<IconWifi size={18} />}>
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          Wi-Fi sharing works in the Matchbook desktop app. QR codes and files work everywhere.
        </Alert>
      </SyncCard>
    )
  }

  const addressList = status?.urls ?? []

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <SyncCard
        title="Receive over Wi-Fi"
        description="Scouts on the same Wi-Fi send their entries straight to this laptop."
        icon={<IconWifi size={18} />}
        aside={
          <Badge variant="light" color={running ? 'green' : 'gray'} radius="sm">
            {running ? 'Receiving' : 'Off'}
          </Badge>
        }
      >
        {error && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
        )}

        {!running ? (
          <>
            <Text size="sm" c="slate.2">
              Press Start receiving. This laptop will show a code, and any scout who is on the same Wi-Fi can send their
              entries to it with one click.
            </Text>
            <Group>
              <Button onClick={() => void start()} loading={isStarting} leftSection={<IconWifi size={16} />}>
                Start receiving
              </Button>
            </Group>
          </>
        ) : (
          <>
            <StepList
              steps={[
                { title: 'Scouts connect to the same Wi-Fi as this laptop' },
                { title: 'On their laptop: Sync Data, then Wi-Fi', detail: `They pick “${status?.name ?? name}” from the list.` },
                { title: 'They type this code, then press Send' },
              ]}
            />

            <Group gap="sm" align="center">
              <div className="wifi-code" aria-label={`Code ${token.split('').join(' ')}`}>
                {formatSyncToken(token)}
              </div>
              <CopyTextButton
                value={token}
                label="Copy"
                subject="Code"
                next="Scouts type this code on their laptops to send you their entries."
                variant="default"
                size="compact-md"
                iconSize={14}
              />
            </Group>

            <Text size="sm" c="slate.2" aria-live="polite">
              {received > 0
                ? `${received.toLocaleString()} ${received === 1 ? 'entry' : 'entries'} received since Matchbook opened.`
                : 'Waiting for the first scout to send something.'}
              {waiting > 0 && !autoAdd ? ` ${waiting} upload${waiting === 1 ? ' is' : 's are'} waiting to be added.` : ''}
            </Text>

            <Switch
              checked={autoAdd}
              onChange={(event) => useWifiHub.getState().setAutoAdd(event.currentTarget.checked)}
              label="Add scouts’ entries as soon as they arrive"
              description="Leave this on unless you want to look before adding."
            />

            <Group>
              {waiting > 0 && (
                <Button onClick={() => void addNow()} loading={isAdding} disabled={!db}>
                  Add {waiting} waiting {waiting === 1 ? 'upload' : 'uploads'} now
                </Button>
              )}
              <Button variant="default" onClick={() => void useWifiHub.getState().stop()}>
                Stop receiving
              </Button>
            </Group>
          </>
        )}

        {visibleSetAside.length > 0 && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title="Some uploads were set aside">
            <Stack gap="xs">
              <Text size="sm">Nothing was lost. Matchbook could not read these uploads:</Text>
              {visibleSetAside.slice(0, 3).map((item) => (
                <Text key={item.quarantinedAt} size="xs" c="slate.2">
                  {new Date(item.quarantinedAt).toLocaleTimeString()}: {item.reason}
                </Text>
              ))}
              <Group gap="xs">
                <Button size="compact-sm" variant="default" onClick={() => void retrySetAside()}>
                  Try again
                </Button>
                <Button size="compact-sm" variant="subtle" color="red" onClick={() => setConfirmingClear(true)}>
                  Remove them
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        <Accordion variant="default" chevronPosition="left">
          <Accordion.Item value="more">
            <Accordion.Control>More options</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <NumberInput
                  label="Port"
                  description="Only change this if another program is already using it."
                  value={port}
                  onChange={(value) => typeof value === 'number' && useWifiHub.getState().setPort(value)}
                  min={1024}
                  max={65535}
                  allowDecimal={false}
                  hideControls
                  disabled={running}
                />
                <Button
                  variant="default"
                  onClick={() => useWifiHub.getState().renewToken()}
                  disabled={running}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Make a new code
                </Button>
                {running && (
                  <Text size="xs" c="slate.4">
                    Stop receiving to change the port or the code.
                  </Text>
                )}
                {addressList.length > 0 && (
                  <Text size="xs" c="slate.3">
                    This laptop’s address{addressList.length > 1 ? 'es' : ''}: {addressList.join(', ')}
                  </Text>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </SyncCard>

      <Stack gap="lg">
        {running && status?.url && (
          <SyncCard
            title="Pair a laptop with one scan"
            description="Scouts can scan this instead of typing anything."
            icon={<IconWifi size={18} />}
          >
            <div className="pairing-code">
              <QRCodeSVG
                value={encodePairing(status.url, token, status.name ?? name)}
                size={176}
                level="M"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#000000"
                title="Pairing code for scouts"
              />
            </div>
            <Text size="xs" c="slate.3">
              On the scout’s laptop: Sync Data, Wi-Fi, then Scan the lead scout’s code.
            </Text>
          </SyncCard>
        )}

        <SyncCard
          title="Share the scouting form"
          description="Scouts can also download this laptop’s form and match schedule."
          icon={<IconWifi size={18} />}
        >
          {running ? (
            sharedSummary ? (
              <Text size="sm" c="slate.2">
                Scouts who press Get form, schedule and matches will receive: <strong>{sharedSummary}</strong>.
              </Text>
            ) : (
              <Text size="sm" c="slate.2">
                There is nothing to share yet. Create a scouting form in Form Builder, and import your event, and scouts will
                be able to get them from here.
              </Text>
            )
          ) : (
            <Text size="sm" c="slate.2">
              This works while receiving is on. Start receiving first.
            </Text>
          )}
        </SyncCard>
      </Stack>

      <Modal
        opened={confirmingClear}
        onClose={() => {
          setConfirmingClear(false)
          setClearText('')
        }}
        title="Remove the set-aside uploads?"
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            This deletes the uploads Matchbook could not read. Only do this if the scouts still have those entries on their
            own laptops, or you have a backup.
          </Alert>
          <TextInput label="Type REMOVE to confirm" value={clearText} onChange={(event) => setClearText(event.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void removeSetAside()} disabled={clearText.trim().toUpperCase() !== 'REMOVE'}>
              Remove them
            </Button>
          </Group>
        </Stack>
      </Modal>
    </SimpleGrid>
  )
}
