import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconCamera, IconCheck, IconWifi } from '@tabler/icons-react'
import type { DiscoveredHub } from '../../../../shared/electron'
import { StepList } from '../../components/StepList'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { handleError } from '../../lib/utils/errorHandler'
import { PairingScanner } from './PairingScanner'
import { SyncCard } from './SyncCard'
import { describeTransfer, importTransfer, summarizeImport } from './syncData'
import { normalizeSyncToken } from './token'
import { recordLastSent } from './lastSent'
import { WifiError, fetchHubSetup, uploadScoutingData } from './wifi'

const URL_KEY = 'sync_server_url_input'
const TOKEN_KEY = 'sync_client_auth_token'
const DISCOVERY_POLL_MS = 2000

function readSaved(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function saveValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Remembering the lead scout is a convenience only.
  }
}

type Outcome = { kind: 'success' | 'error'; message: string }

type ScoutWifiPanelProps = {
  db: ScoutingDatabase | null
}

export function ScoutWifiPanel({ db }: ScoutWifiPanelProps): ReactElement {
  const [hubs, setHubs] = useState<DiscoveredHub[]>([])
  const [url, setUrl] = useState<string>(() => readSaved(URL_KEY))
  const [token, setToken] = useState<string>(() => normalizeSyncToken(readSaved(TOKEN_KEY)))
  const [showManual, setShowManual] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState<'send' | 'setup' | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [entryCount, setEntryCount] = useState(0)

  const desktop = Boolean(window.electronAPI)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) {
      return
    }

    let cancelled = false
    void api.startHubDiscovery()
    const poll = async (): Promise<void> => {
      try {
        const list = await api.listDiscoveredHubs()
        if (!cancelled) {
          setHubs(list)
        }
      } catch {
        // Finding hubs is a convenience; the address can always be typed.
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), DISCOVERY_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      void api.stopHubDiscovery()
    }
  }, [])

  useEffect(() => {
    if (!db) {
      return
    }

    const subscription = db.collections.scoutingData.find().$.subscribe((docs) => setEntryCount(docs.length))
    return () => subscription.unsubscribe()
  }, [db])

  const chooseHub = (hub: DiscoveredHub): void => {
    setUrl(hub.url)
    saveValue(URL_KEY, hub.url)
    setOutcome(null)
  }

  const updateUrl = (value: string): void => {
    setUrl(value)
    saveValue(URL_KEY, value)
  }

  const updateToken = (value: string): void => {
    const normalized = normalizeSyncToken(value)
    setToken(normalized)
    saveValue(TOKEN_KEY, normalized)
  }

  const applyPairing = useCallback((pairing: { url: string; token: string; name: string }): void => {
    setUrl(pairing.url)
    saveValue(URL_KEY, pairing.url)
    setToken(pairing.token)
    saveValue(TOKEN_KEY, pairing.token)
    setScanning(false)
    setShowManual(false)
    setOutcome({
      kind: 'success',
      message: `Paired with ${pairing.name || 'the lead scout’s laptop'}. Press Send my entries.`,
    })
  }, [])

  const explain = (error: unknown, context: string): void => {
    if (error instanceof WifiError) {
      setOutcome({ kind: 'error', message: error.message })
      return
    }
    handleError(error, context)
  }

  const send = async (): Promise<void> => {
    if (!db) {
      return
    }

    setBusy('send')
    setOutcome(null)
    try {
      const sent = await uploadScoutingData(db, { url, token })
      recordLastSent({ at: new Date().toISOString(), entries: sent.entries, method: 'wifi' })
      setOutcome({
        kind: 'success',
        message:
          sent.entries === 0
            ? 'Connected to the lead scout, but you have no entries to send yet.'
            : `Sent ${sent.entries.toLocaleString()} ${sent.entries === 1 ? 'entry' : 'entries'} to the lead scout at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
      })
    } catch (error: unknown) {
      explain(error, 'Send over Wi-Fi')
    } finally {
      setBusy(null)
    }
  }

  const getSetup = async (): Promise<void> => {
    if (!db) {
      return
    }

    setBusy('setup')
    setOutcome(null)
    try {
      const document = await fetchHubSetup({ url, token })
      const description = describeTransfer(document)
      if (description === 'nothing to add') {
        setOutcome({ kind: 'error', message: 'The lead scout has not created a scouting form yet. Ask them to set it up in Form Builder.' })
        return
      }

      const result = await importTransfer(db, document)
      setOutcome({ kind: 'success', message: `Got ${description} from the lead scout. ${summarizeImport(result)}` })
    } catch (error: unknown) {
      explain(error, 'Get setup over Wi-Fi')
    } finally {
      setBusy(null)
    }
  }

  if (!desktop) {
    return (
      <SyncCard title="Send over Wi-Fi" icon={<IconWifi size={18} />}>
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          Wi-Fi sharing works in the Matchbook desktop app. QR codes and files work everywhere.
        </Alert>
      </SyncCard>
    )
  }

  const ready = url.trim().length > 0 && token.length === 8
  const savedButNotFound = url.trim().length > 0 && !hubs.some((hub) => hub.url === url)

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <SyncCard
        title="Send to the lead scout over Wi-Fi"
        description="Your entries go straight to the lead scout’s laptop."
        icon={<IconWifi size={18} />}
      >
        <Stack gap="xs">
          <Text size="sm" fw={500} c="slate.1">
            Lead scout laptops on this Wi-Fi
          </Text>
          {hubs.length === 0 ? (
            <Text size="sm" c="slate.3" aria-live="polite">
              Looking… If nothing appears, check that you are on the same Wi-Fi as the lead scout and that they have pressed
              Start receiving.
            </Text>
          ) : (
            hubs.map((hub) => (
              <button
                key={hub.id}
                type="button"
                className="hub-choice"
                aria-pressed={hub.url === url}
                onClick={() => chooseHub(hub)}
              >
                <span>
                  <strong>{hub.name}</strong>
                  <Text span size="xs" c="slate.3" ml="sm">
                    {hub.url.replace('http://', '')}
                  </Text>
                </span>
                {hub.url === url && <IconCheck size={16} aria-hidden="true" />}
              </button>
            ))
          )}
        </Stack>

        <TextInput
          label="Code from the lead scout’s screen"
          description="Eight letters and numbers."
          value={token}
          onChange={(event) => updateToken(event.currentTarget.value)}
          placeholder="ABCD2345"
          maxLength={8}
          autoComplete="off"
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', letterSpacing: '0.12em' } }}
        />

        {savedButNotFound && !showManual && (
          <Text size="xs" c="slate.3">
            Using the address you used last time ({url.replace('http://', '')}).
          </Text>
        )}

        <Group>
          <Button onClick={() => void send()} loading={busy === 'send'} disabled={!ready || !db || busy !== null}>
            {entryCount > 0 ? `Send my ${entryCount.toLocaleString()} ${entryCount === 1 ? 'entry' : 'entries'}` : 'Send my entries'}
          </Button>
          <Button variant="default" onClick={() => void getSetup()} loading={busy === 'setup'} disabled={!ready || !db || busy !== null}>
            Get form and schedule
          </Button>
        </Group>

        {outcome && (
          <Alert
            color={outcome.kind === 'success' ? 'green' : 'red'}
            variant="light"
            icon={outcome.kind === 'success' ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
          >
            {outcome.message}
          </Alert>
        )}

        <Stack gap="xs">
          <Group gap="xs">
            <Button variant="subtle" size="compact-sm" leftSection={<IconCamera size={14} />} onClick={() => setScanning(true)}>
              Scan the lead scout’s code instead
            </Button>
            <Button variant="subtle" size="compact-sm" onClick={() => setShowManual((value) => !value)}>
              {showManual ? 'Hide the address box' : 'Type the address by hand'}
            </Button>
          </Group>
          {showManual && (
            <TextInput
              label="Lead scout’s address"
              description="Shown on their screen under More options, like 192.168.1.20:41735."
              value={url.replace(/^http:\/\//, '')}
              onChange={(event) => updateUrl(event.currentTarget.value)}
              placeholder="192.168.1.20:41735"
            />
          )}
        </Stack>
      </SyncCard>

      <SyncCard title="How it works" icon={<IconWifi size={18} />}>
        <StepList
          steps={[
            { title: 'Connect this laptop to the same Wi-Fi as the lead scout' },
            {
              title: 'Pick their laptop from the list',
              detail: 'If it is not there, scan their pairing code or type their address.',
            },
            { title: 'Type the code from their screen', detail: 'You only need to do this once.' },
            {
              title: 'Press Send my entries',
              detail: 'Sending the same entries twice is safe. The lead scout keeps one copy of each.',
            },
          ]}
        />
      </SyncCard>

      <PairingScanner opened={scanning} onClose={() => setScanning(false)} onPaired={applyPairing} />
    </SimpleGrid>
  )
}
