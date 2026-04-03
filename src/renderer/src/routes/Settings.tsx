import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  PasswordInput,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  IconSettings,
  IconKey,
  IconKeyboard,
  IconCode,
  IconDownload,
  IconRefresh,
  IconTrash,
  IconFileText,
  IconInfoCircle,
  IconRocket,
  IconExternalLink,
  IconServer,
  IconUsers,
  IconChartBar,
} from '@tabler/icons-react'
import { logger, LogLevel } from '../lib/utils/logger'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { useDeviceStore } from '../stores/useDeviceStore'
import { useDatabaseStore } from '../stores/useDatabase'
import { getTbaStatus } from '../lib/api/tba'
import { handleError } from '../lib/utils/errorHandler'
import type { UpdaterActionResult } from '../types/electron'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import {
  type AnalysisAggregation,
  type AnalysisChartType,
  type AnalysisFieldConfig,
  type AnalysisFieldDefinition,
  extractSurveyAnalysisFields,
  getAllowedAggregations,
  loadAnalysisFieldConfigs,
  saveAnalysisFieldConfigs,
} from '../lib/utils/analysisConfig'

type SettingsProps = {
  appVersion: string
  onOpenAbout: () => void
}

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'

const CHART_TYPE_LABELS: Record<AnalysisChartType, string> = {
  bar: 'Bar Chart',
  line: 'Line Chart',
  area: 'Area Chart',
}

const AGGREGATION_LABELS: Record<AnalysisAggregation, string> = {
  average: 'Average per team',
  sum: 'Total sum',
  min: 'Minimum value',
  max: 'Maximum value',
  trueCount: 'Count of true values',
  responseCount: 'Count of responses',
}

function getValueKindLabel(valueKind: AnalysisFieldDefinition['valueKind']): string {
  switch (valueKind) {
    case 'number':
      return 'Numeric'
    case 'boolean':
      return 'Boolean'
    default:
      return 'Text'
  }
}

export function Settings({ appVersion, onOpenAbout }: SettingsProps): ReactElement {
  const [tbaApiKey, setTbaApiKey] = useState<string>(() => localStorage.getItem('tba_api_key') ?? '')
  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(() => localStorage.getItem('shortcuts_enabled') !== 'false')
  const [developerMode, setDeveloperMode] = useState<boolean>(() => localStorage.getItem('developer_mode') === 'true')
  const [formMessage, setFormMessage] = useState<string>('')
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [updateInfo, setUpdateInfo] = useState<unknown>(null)
  const [logsModalOpened, logsModalHandlers] = useDisclosure(false)
  const isHub = useDeviceStore((state) => state.isPrimary)
  const deviceId = useDeviceStore((state) => state.deviceId)
  const setDevice = useDeviceStore((state) => state.setDevice)
  const db = useDatabaseStore((state) => state.db)
  const [activeFormSchema, setActiveFormSchema] = useState<FormSchemaDocType | null>(null)
  const [analysisFieldConfigs, setAnalysisFieldConfigs] = useState<AnalysisFieldConfig[]>([])

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

  useEffect(() => {
    if (!db) {
      setActiveFormSchema(null)
      return
    }

    let cancelled = false

    const loadActiveSchema = async (): Promise<void> => {
      try {
        const docs = await db.collections.formSchemas
          .find({
            selector: { isActive: true },
            sort: [
              { updatedAt: 'desc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            limit: 1,
          })
          .exec()

        if (!cancelled) {
          setActiveFormSchema(docs[0]?.toJSON() ?? null)
        }
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'Load analysis fields from active form')
          setActiveFormSchema(null)
        }
      }
    }

    void loadActiveSchema()

    return () => {
      cancelled = true
    }
  }, [db])

  const analysisFields = useMemo(() => {
    if (!activeFormSchema) {
      return []
    }

    return extractSurveyAnalysisFields(activeFormSchema.surveyJson)
  }, [activeFormSchema])

  useEffect(() => {
    setAnalysisFieldConfigs(loadAnalysisFieldConfigs(analysisFields))
  }, [analysisFields])

  const updateAnalysisFieldConfig = (fieldName: string, patch: Partial<AnalysisFieldConfig>): void => {
    setAnalysisFieldConfigs((previous) => {
      const next = previous.map((config) => {
        if (config.fieldName !== fieldName) {
          return config
        }

        const updated: AnalysisFieldConfig = {
          ...config,
          ...patch,
        }

        const allowedAggregations = getAllowedAggregations(updated.valueKind)
        if (!allowedAggregations.includes(updated.aggregation)) {
          updated.aggregation = allowedAggregations[0]
        }

        return updated
      })

      saveAnalysisFieldConfigs(next)
      return next
    })

    setFormMessage('Analysis field settings updated.')
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

  const handleRoleChange = async (nextIsHub: boolean): Promise<void> => {
    try {
      const resolvedDeviceId = deviceId ?? (await getOrCreateDeviceId())
      const now = new Date().toISOString()

      let resolvedDeviceName = nextIsHub ? 'Hub Device' : 'Scout Device'
      if (db) {
        const existingDevice = await db.collections.devices.findOne(resolvedDeviceId).exec()
        resolvedDeviceName = existingDevice?.name ?? resolvedDeviceName
        await db.collections.devices.upsert({
          id: resolvedDeviceId,
          name: resolvedDeviceName,
          isPrimary: nextIsHub,
          lastSeenAt: now,
          createdAt: existingDevice?.createdAt ?? now,
        })
      }

      setDevice({
        deviceId: resolvedDeviceId,
        deviceName: resolvedDeviceName,
        isPrimary: nextIsHub,
      })

      setFormMessage(`Device role switched to ${nextIsHub ? 'Hub' : 'Scout'}.`)
      notifications.show({
        color: 'green',
        title: 'Role updated',
        message: `This device is now in ${nextIsHub ? 'Hub' : 'Scout'} mode.`,
      })
    } catch (error: unknown) {
      handleError(error, 'Update device role')
    }
  }

  const handleApiKeyChange = (value: string): void => {
    setTbaApiKey(value)
    localStorage.setItem('tba_api_key', value)
    setFormMessage('TBA API key updated.')
    logger.info('Settings updated: tba_api_key')
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

    try {
      await getTbaStatus(tbaApiKey.trim())
      notifications.show({
        color: 'green',
        title: 'Connection successful',
        message: 'TBA API key verified successfully.',
      })
    } catch (error: unknown) {
      handleError(error, 'TBA connection test')
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
    downloadTextFile(logger.exportLogs(), `matchbook-logs-${new Date().toISOString().slice(0, 10)}.json`)
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

    try {
      setUpdateState('checking')
      const result = await window.electronAPI.checkForUpdates()
      const payload = result as UpdaterActionResult
      if (!payload.supported) {
        setUpdateState('idle')
        notifications.show({
          color: 'yellow',
          title: 'Updates unavailable in this build',
          message: payload.reason ?? 'Update checks are disabled for this runtime.',
        })
      }
    } catch (error: unknown) {
      setUpdateState('error')
      handleError(error, 'Check for updates')
    }
  }

  const handleDownloadUpdate = async (): Promise<void> => {
    if (!window.electronAPI) return

    try {
      setUpdateState('downloading')
      const result = await window.electronAPI.downloadUpdate()
      const payload = result as UpdaterActionResult
      if (!payload.supported) {
        setUpdateState('idle')
        notifications.show({
          color: 'yellow',
          title: 'Download unavailable',
          message: payload.reason ?? 'Update download is disabled for this runtime.',
        })
      }
    } catch (error: unknown) {
      setUpdateState('error')
      handleError(error, 'Download update')
    }
  }

  const handleInstallUpdate = async (): Promise<void> => {
    if (!window.electronAPI) return

    try {
      const result = await window.electronAPI.installUpdate()
      const payload = result as UpdaterActionResult
      if (!payload.supported) {
        notifications.show({
          color: 'yellow',
          title: 'Install unavailable',
          message: payload.reason ?? 'Install is disabled for this runtime.',
        })
      }
    } catch (error: unknown) {
      handleError(error, 'Install update')
    }
  }

  // Clear form message after delay
  useEffect(() => {
    if (formMessage) {
      const timer = setTimeout(() => setFormMessage(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [formMessage])

  return (
    <Box className="container-wide" py="xl">
      <Stack gap={32}>
        {/* Header */}
        <Box className="animate-fadeInUp">
          <Group gap="md">
            <ThemeIcon size={48} radius="xl" variant="gradient" gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}>
              <IconSettings size={26} stroke={1.5} />
            </ThemeIcon>
            <Box>
              <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                Settings
              </Title>
              <Text size="sm" c="slate.4">Configure app preferences</Text>
            </Box>
          </Group>
        </Box>

        {/* General Settings */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-blue">
                <IconSettings size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">General</Text>
            </Group>

            <Text c="slate.4" size="sm">Configure local preferences and app behavior.</Text>
            
            <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
              <Stack gap="md">
                <Switch 
                  label="Enable offline autosave" 
                  defaultChecked 
                  aria-label="Enable offline autosave"
                  styles={{
                    track: { cursor: 'pointer' },
                    label: { color: 'var(--mantine-color-slate-2)' },
                  }}
                />
                <Switch
                  label="Show developer diagnostics"
                  checked={developerMode}
                  onChange={(event) => handleDeveloperModeToggle(event.currentTarget.checked)}
                  aria-label="Show developer diagnostics"
                  styles={{
                    track: { cursor: 'pointer' },
                    label: { color: 'var(--mantine-color-slate-2)' },
                  }}
                />
              </Stack>
            </Paper>

            {developerMode && (
              <Alert 
                color="frc-blue" 
                variant="light" 
                title="Developer mode enabled" 
                icon={<IconCode size={16} />}
                radius="md"
              >
                Extra diagnostics and detailed logs are available for troubleshooting.
              </Alert>
            )}
          </Stack>
        </Card>

        {/* Analysis Field Builder */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-blue">
                <IconChartBar size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Analysis Builder</Text>
            </Group>

            <Text c="slate.4" size="sm">
              For each SurveyJS field, choose how Matchbook analyzes it and which chart style to use on the Analysis page.
            </Text>

            {!activeFormSchema ? (
              <Alert color="yellow" variant="light" title="No active form available" icon={<IconInfoCircle size={16} />} radius="md">
                Sync or create an active scouting form first. Analysis settings are generated from the active SurveyJS form fields.
              </Alert>
            ) : analysisFieldConfigs.length === 0 ? (
              <Alert color="yellow" variant="light" title="No analyzable fields found" icon={<IconInfoCircle size={16} />} radius="md">
                The active form does not currently expose fields that can be analyzed.
              </Alert>
            ) : (
              <Stack gap="sm">
                {analysisFieldConfigs.map((config) => {
                  const aggregationOptions = getAllowedAggregations(config.valueKind).map((aggregation) => ({
                    value: aggregation,
                    label: AGGREGATION_LABELS[aggregation],
                  }))

                  return (
                    <Paper key={config.fieldName} p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
                      <Stack gap="sm">
                        <Group justify="space-between" align="center" wrap="wrap">
                          <Box>
                            <Group gap="xs" align="center" wrap="wrap">
                              <Text fw={600} c="slate.1">{config.fieldLabel}</Text>
                              <Badge size="xs" radius="sm" color="slate" variant="light">
                                {getValueKindLabel(config.valueKind)}
                              </Badge>
                            </Group>
                            <Text size="xs" c="slate.5" className="mono-number">{config.fieldName}</Text>
                          </Box>

                          <Switch
                            label="Show in analysis"
                            checked={config.enabled}
                            onChange={(event) => {
                              updateAnalysisFieldConfig(config.fieldName, { enabled: event.currentTarget.checked })
                            }}
                            styles={{ label: { color: 'var(--mantine-color-slate-2)' } }}
                          />
                        </Group>

                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                          <Select
                            label="Chart type"
                            value={config.chartType}
                            data={Object.entries(CHART_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                            onChange={(value) => {
                              if (!value) {
                                return
                              }
                              updateAnalysisFieldConfig(config.fieldName, { chartType: value as AnalysisChartType })
                            }}
                            disabled={!config.enabled}
                          />

                          <Select
                            label="Aggregation"
                            value={config.aggregation}
                            data={aggregationOptions}
                            onChange={(value) => {
                              if (!value) {
                                return
                              }
                              updateAnalysisFieldConfig(config.fieldName, { aggregation: value as AnalysisAggregation })
                            }}
                            disabled={!config.enabled}
                          />
                        </SimpleGrid>
                      </Stack>
                    </Paper>
                  )
                })}
              </Stack>
            )}
          </Stack>
        </Card>

        {/* Device Role */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-orange">
                {isHub ? <IconServer size={16} /> : <IconUsers size={16} />}
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Device Role</Text>
            </Group>

            <Text c="slate.4" size="sm">
              Switch this device between Hub and Scout mode without restarting the app.
            </Text>

            <Group gap="md">
                <Button
                  variant={isHub ? 'gradient' : 'light'}
                  gradient={isHub ? { from: 'frc-orange.5', to: 'frc-orange.7' } : undefined}
                  color={isHub ? undefined : 'frc-orange'}
                  leftSection={<IconServer size={16} />}
                  onClick={() => void handleRoleChange(true)}
                  radius="md"
                >
                Hub
              </Button>
                <Button
                  variant={!isHub ? 'gradient' : 'light'}
                  gradient={!isHub ? { from: 'frc-blue.5', to: 'frc-blue.7' } : undefined}
                  color={!isHub ? undefined : 'frc-blue'}
                  leftSection={<IconUsers size={16} />}
                  onClick={() => void handleRoleChange(false)}
                  radius="md"
                >
                Scout
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-orange">
                <IconKeyboard size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Keyboard Shortcuts</Text>
            </Group>

            <Text c="slate.4" size="sm">
              Global keyboard shortcuts for quick navigation.
            </Text>
            
            <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
              <Switch
                label="Enable global keyboard shortcuts"
                checked={shortcutsEnabled}
                onChange={(event) => handleShortcutToggle(event.currentTarget.checked)}
                aria-label="Enable global keyboard shortcuts"
                styles={{
                  track: { cursor: 'pointer' },
                  label: { color: 'var(--mantine-color-slate-2)' },
                }}
              />
            </Paper>
          </Stack>
        </Card>

        {/* TBA API */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-blue">
                <IconKey size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">The Blue Alliance API</Text>
            </Group>

            <Text c="slate.4" size="sm">
              Used for importing events and matches.
            </Text>

            <PasswordInput
              label="TBA API Key"
              placeholder="Enter API key"
              value={tbaApiKey}
              onChange={(event) => handleApiKeyChange(event.currentTarget.value)}
              radius="md"
            />

            <Button
              onClick={() => void handleTestConnection()}
              variant="light"
              color="frc-blue"
              leftSection={<IconRefresh size={16} />}
              radius="md"
            >
              Test Connection
            </Button>
          </Stack>
        </Card>

        {/* Advanced / Logs */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="slate">
                <IconFileText size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Advanced</Text>
            </Group>

            <Group gap="md">
              <Button 
                variant="light" 
                color="frc-blue"
                onClick={logsModalHandlers.open}
                leftSection={<IconFileText size={16} />}
                radius="md"
              >
                View Logs
              </Button>
              <Button 
                variant="light" 
                color="frc-blue"
                onClick={handleExportLogs}
                leftSection={<IconDownload size={16} />}
                radius="md"
              >
                Export Logs
              </Button>
              <Button 
                color="danger" 
                variant="light" 
                onClick={handleClearLogs}
                leftSection={<IconTrash size={16} />}
                radius="md"
              >
                Clear Logs
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Updates */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Group gap="sm">
                <ThemeIcon size={32} radius="lg" variant="light" color="frc-blue">
                  <IconRocket size={16} />
                </ThemeIcon>
                <Text fw={600} c="slate.0" size="lg">Updates</Text>
              </Group>
              <Badge color="frc-blue" variant="light" radius="md" className="mono-number">
                v{appVersion}
              </Badge>
            </Group>

            <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
              <Group justify="space-between" align="center">
                <Group gap="xs">
                  <IconInfoCircle size={16} style={{ color: 'var(--mantine-color-slate-4)' }} />
                  <Text size="sm" c="slate.3">{updateStatusText}</Text>
                </Group>
                {updateState === 'downloading' && (
                  <Text size="sm" c="frc-blue.4" className="mono-number">{downloadProgress.toFixed(0)}%</Text>
                )}
              </Group>
              {updateState === 'downloading' && (
                <Progress value={downloadProgress} color="frc-blue" mt="sm" radius="md" animated />
              )}
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <Button 
                variant="light" 
                color="frc-blue"
                onClick={() => void handleCheckForUpdates()}
                leftSection={<IconRefresh size={16} />}
                radius="md"
              >
                Check for Updates
              </Button>
              {updateState === 'available' && (
                <Button 
                  variant="gradient"
                  gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                  onClick={() => void handleDownloadUpdate()}
                  leftSection={<IconDownload size={16} />}
                  radius="md"
                >
                  Download Update
                </Button>
              )}
              {updateState === 'downloaded' && (
                <Button 
                  color="success" 
                  variant="gradient"
                  gradient={{ from: 'success.5', to: 'success.7' }}
                  onClick={() => void handleInstallUpdate()}
                  leftSection={<IconRocket size={16} />}
                  radius="md"
                >
                  Install Now
                </Button>
              )}
            </SimpleGrid>

            {updateInfo !== null && (
              <Text size="xs" c="slate.5">
                Changelog: {JSON.stringify(updateInfo)}
              </Text>
            )}

            <Button 
              variant="subtle" 
              color="slate" 
              onClick={onOpenAbout}
              leftSection={<IconExternalLink size={16} />}
              radius="md"
            >
              Open About Dialog
            </Button>
          </Stack>
        </Card>

        {/* Logs Modal */}
        <Modal 
          opened={logsModalOpened} 
          onClose={logsModalHandlers.close} 
          title="Application Logs" 
          size="xl"
          radius="lg"
          styles={{
            header: { backgroundColor: 'var(--surface-raised)' },
            body: { backgroundColor: 'var(--surface-raised)' },
          }}
        >
          <Table.ScrollContainer minWidth={500}>
            <Table striped highlightOnHover>
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
                    <Table.Td colSpan={3}>
                      <Text c="slate.4" ta="center" py="md">No logs recorded.</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  logs.map((entry, index) => (
                    <Table.Tr key={`${entry.timestamp}-${index}`}>
                      <Table.Td className="mono-number" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </Table.Td>
                      <Table.Td>
                        <Badge 
                          color={entry.level === LogLevel.ERROR ? 'danger' : entry.level === LogLevel.WARN ? 'warning' : 'slate'} 
                          variant="light"
                          size="sm"
                          radius="md"
                        >
                          {entry.level}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{entry.message}</Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Modal>
      </Stack>
    </Box>
  )
}
