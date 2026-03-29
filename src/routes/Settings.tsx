import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Group,
  LoadingOverlay,
  Modal,
  PasswordInput,
  Progress,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { getEventsByYear } from '../lib/api/tba'
import { notifyErrorWithRetry } from '../lib/utils/errorHandler'
import { logger, LogLevel } from '../lib/utils/logger'

type SettingsProps = {
  appVersion: string
  onOpenAbout: () => void
}

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'

export function Settings({ appVersion, onOpenAbout }: SettingsProps): ReactElement {
  const [tbaApiKey, setTbaApiKey] = useState<string>(() => localStorage.getItem('tba_api_key') ?? '')
  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(() => localStorage.getItem('shortcuts_enabled') !== 'false')
  const [developerMode, setDeveloperMode] = useState<boolean>(() => localStorage.getItem('developer_mode') === 'true')
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false)
  const [formMessage, setFormMessage] = useState<string>('')
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [updateInfo, setUpdateInfo] = useState<unknown>(null)
  const [logsModalOpened, logsModalHandlers] = useDisclosure(false)

  useEffect(() => {
    if (!window.electronAPI) return

    const offChecking = window.electronAPI.onUpdaterChecking(() => setUpdateState('checking'))
    const offNotAvailable = window.electronAPI.onUpdaterNotAvailable((info) => {
      setUpdateInfo(info)
      setUpdateState('up-to-date')
    })
    const offAvailable = window.electronAPI.onUpdaterAvailable((info) => {
      setUpdateInfo(info)
      setUpdateState('available')
    })
    const offProgress = window.electronAPI.onUpdaterDownloadProgress((progress) => {
      const percent =
        typeof progress === 'object' && progress && 'percent' in progress
          ? Number((progress as { percent: number }).percent)
          : 0
      setDownloadProgress(Number.isFinite(percent) ? percent : 0)
      setUpdateState('downloading')
    })
    const offDownloaded = window.electronAPI.onUpdaterDownloaded((info) => {
      setUpdateInfo(info)
      setUpdateState('downloaded')
    })
    const offError = window.electronAPI.onUpdaterError((message) => {
      setUpdateState('error')
      notifications.show({ color: 'red', title: 'Update error', message })
    })

    return () => {
      offChecking()
      offNotAvailable()
      offAvailable()
      offProgress()
      offDownloaded()
      offError()
    }
  }, [])

  const updateStatusText = useMemo(() => {
    switch (updateState) {
      case 'checking':
        return 'Checking for updates...'
      case 'available':
        return 'Update available.'
      case 'downloading':
        return 'Downloading update...'
      case 'downloaded':
        return 'Update downloaded and ready to install.'
      case 'up-to-date':
        return 'You are on the latest version.'
      case 'error':
        return 'Update check failed.'
      default:
        return 'Update status idle.'
    }
  }, [updateState])

  const handleApiKeyChange = (value: string): void => {
    setTbaApiKey(value)
    localStorage.setItem('tba_api_key', value)
    setFormMessage('API key updated.')
    logger.info('Settings updated: tba_api_key')
  }

  const handleShortcutToggle = (value: boolean): void => {
    setShortcutsEnabled(value)
    localStorage.setItem('shortcuts_enabled', String(value))
    window.dispatchEvent(new CustomEvent('shortcuts:changed', { detail: value }))
    setFormMessage(`Keyboard shortcuts ${value ? 'enabled' : 'disabled'}.`)
    logger.info('Settings updated: shortcuts_enabled', { enabled: value })
  }

  const handleDeveloperModeToggle = (value: boolean): void => {
    setDeveloperMode(value)
    localStorage.setItem('developer_mode', String(value))
    setFormMessage(`Developer mode ${value ? 'enabled' : 'disabled'}.`)
    logger.info('Settings updated: developer_mode', { enabled: value })
  }

  const handleTestConnection = async (): Promise<void> => {
    if (!tbaApiKey.trim()) {
      notifications.show({
        color: 'red',
        title: 'Missing API key',
        message: 'Enter a TBA API key before testing the connection.',
      })
      return
    }

    setIsTestingConnection(true)
    logger.info('TBA connection test started')
    try {
      const events = await getEventsByYear(2024, tbaApiKey.trim())
      logger.info('TBA connection test successful', { count: events.length })
      notifications.show({
        color: 'green',
        title: 'Connection successful',
        message: `Fetched ${events.length} events from The Blue Alliance API.`,
      })
    } catch (error: unknown) {
      notifyErrorWithRetry(error, 'Retry Connection', () => {
        void handleTestConnection()
      }, 'TBA connection test')
    } finally {
      setIsTestingConnection(false)
    }
  }

  const downloadTextFile = (contents: string, fileName: string): void => {
    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExportLogs = (): void => {
    downloadTextFile(logger.exportLogs(), `offline-scouting-logs-${new Date().toISOString().slice(0, 10)}.json`)
    notifications.show({ color: 'green', title: 'Logs exported', message: 'Downloaded logs as JSON.' })
  }

  const handleClearLogs = (): void => {
    if (!window.confirm('Clear all stored logs? This action cannot be undone.')) {
      return
    }
    logger.clearLogs()
    notifications.show({ color: 'green', title: 'Logs cleared', message: 'All logs were removed.' })
  }

  const logs = logger.getLogs().slice().reverse()

  const handleCheckForUpdates = async (): Promise<void> => {
    if (!window.electronAPI) return
    setUpdateState('checking')
    await window.electronAPI.checkForUpdates()
  }

  const handleDownloadUpdate = async (): Promise<void> => {
    if (!window.electronAPI) return
    setUpdateState('downloading')
    await window.electronAPI.downloadUpdate()
  }

  const handleInstallUpdate = async (): Promise<void> => {
    if (!window.electronAPI) return
    await window.electronAPI.installUpdate()
  }

  return (
    <Stack>
      <Title order={2}>Settings</Title>
      <Card withBorder radius="md" p="lg">
        <LoadingOverlay visible={isTestingConnection} />
        <Stack>
          <Text c="dimmed">Configure local preferences and app behavior.</Text>
          <Switch label="Enable offline autosave" defaultChecked aria-label="Enable offline autosave" />
          <Switch
            label="Show developer diagnostics"
            checked={developerMode}
            onChange={(event) => handleDeveloperModeToggle(event.currentTarget.checked)}
            aria-label="Show developer diagnostics"
          />
          {developerMode && (
            <Alert color="blue" variant="light" title="Developer mode enabled">
              Extra diagnostics and detailed logs are available for troubleshooting.
            </Alert>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>Advanced</Title>
          <Group>
            <Tooltip label="Open in-app application logs">
              <Button variant="light" onClick={logsModalHandlers.open}>View Logs</Button>
            </Tooltip>
            <Tooltip label="Download logs for debugging or support">
              <Button variant="light" onClick={handleExportLogs}>Export Logs</Button>
            </Tooltip>
            <Tooltip label="Permanently remove local log history">
              <Button color="red" variant="light" onClick={handleClearLogs}>Clear Logs</Button>
            </Tooltip>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>Keyboard Shortcuts</Title>
          <Text c="dimmed" size="sm">
            Global keyboard shortcuts are enabled by default. Shortcut customization is planned for a future release.
          </Text>
          <Switch
            label="Enable global keyboard shortcuts"
            checked={shortcutsEnabled}
            onChange={(event) => handleShortcutToggle(event.currentTarget.checked)}
            aria-label="Enable global keyboard shortcuts"
          />
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>The Blue Alliance API</Title>
          <PasswordInput
            label="TBA API Key"
            description="Used for event, team, and match imports from The Blue Alliance"
            withAsterisk
            placeholder="Enter API key"
            value={tbaApiKey}
            onChange={(event) => handleApiKeyChange(event.currentTarget.value)}
            aria-label="The Blue Alliance API key"
            aria-required="true"
            autoFocus
          />
          <Button onClick={() => void handleTestConnection()} loading={isTestingConnection} aria-label="Test API connection">
            Test Connection
          </Button>
          <Text size="sm" c="dimmed" role="status" aria-live="polite">
            {formMessage}
          </Text>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Group justify="space-between">
            <Title order={4}>Updates</Title>
            <Text size="sm" c="dimmed">
              Current version: {appVersion}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {updateStatusText}
          </Text>
          {updateState === 'downloading' ? <Progress value={downloadProgress} animated /> : null}
          <Group>
            <Button variant="default" onClick={() => void handleCheckForUpdates()}>
              Check for Updates
            </Button>
            {updateState === 'available' ? (
              <Button onClick={() => void handleDownloadUpdate()}>Download and Install</Button>
            ) : null}
            {updateState === 'downloaded' ? (
              <Button color="green" onClick={() => void handleInstallUpdate()}>
                Install Update Now
              </Button>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed">
            Changelog: {updateInfo ? JSON.stringify(updateInfo) : 'No update changelog available.'}
          </Text>
          <Button variant="subtle" onClick={onOpenAbout}>
            Open About Dialog
          </Button>
        </Stack>
      </Card>

      <Modal opened={logsModalOpened} onClose={logsModalHandlers.close} title="Application Logs" size="xl">
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Time</Table.Th>
              <Table.Th>Level</Table.Th>
              <Table.Th>Message</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {logs.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>No logs recorded.</Table.Td>
              </Table.Tr>
            ) : (
              logs.map((entry, index) => (
                <Table.Tr key={`${entry.timestamp}-${index}`}>
                  <Table.Td>{new Date(entry.timestamp).toLocaleString()}</Table.Td>
                  <Table.Td c={entry.level === LogLevel.ERROR ? 'red' : entry.level === LogLevel.WARN ? 'yellow' : undefined}>
                    {entry.level}
                  </Table.Td>
                  <Table.Td>{entry.message}</Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Modal>
    </Stack>
  )
}
