import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { formatForDisplay, normalizeHotkey, useHotkeyRecorder } from '@tanstack/react-hotkeys'
import {
  IconSettings,
  IconCalendarEvent,
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
  IconAlertTriangle,
} from '@tabler/icons-react'
import { logger, LogLevel } from '../lib/utils/logger'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { useDeviceStore } from '../stores/useDeviceStore'
import { useDatabaseStore } from '../stores/useDatabase'
import { getTbaStatus } from '../lib/api/tba'
import { handleError } from '../lib/utils/errorHandler'
import type { UpdaterActionResult } from '../types/electron'
import type { EventDocType } from '../lib/db/schemas/events.schema'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import {
  appShortcuts,
  getDefaultShortcutBindings,
  getShortcutDefinition,
  loadShortcutBindings,
  saveShortcutBindings,
  type AppShortcutId,
  type ShortcutBindings,
} from '../config/shortcuts'
import {
  type AnalysisAggregation,
  type AnalysisChartType,
  type AnalysisFieldConfig,
  type AnalysisFieldDefinition,
  extractSurveyAnalysisFields,
  getAllowedAggregations,
  loadAnalysisFieldConfigsFromDatabase,
  saveAnalysisFieldConfigsToDatabase,
} from '../lib/utils/analysisConfig'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { useEventStore } from '../stores/useEventStore'

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

function findShortcutConflict(
  candidateShortcut: string,
  targetId: AppShortcutId,
  bindings: ShortcutBindings,
): AppShortcutId | null {
  const normalizedCandidate = normalizeHotkey(candidateShortcut)

  for (const shortcut of appShortcuts) {
    if (shortcut.id === targetId) {
      continue
    }

    const existing = bindings[shortcut.id]
    if (normalizeHotkey(existing) === normalizedCandidate) {
      return shortcut.id
    }
  }

  return null
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
  const [clearLogsModalOpened, clearLogsModalHandlers] = useDisclosure(false)
  const [deleteScoutingDataModalOpened, deleteScoutingDataModalHandlers] = useDisclosure(false)
  const isHub = useDeviceStore((state) => state.isPrimary)
  const deviceId = useDeviceStore((state) => state.deviceId)
  const setDevice = useDeviceStore((state) => state.setDevice)
  const db = useDatabaseStore((state) => state.db)
  const [activeFormSchema, setActiveFormSchema] = useState<FormSchemaDocType | null>(null)
  const [analysisFieldConfigs, setAnalysisFieldConfigs] = useState<AnalysisFieldConfig[]>([])
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindings>(() => loadShortcutBindings())
  const [recordingShortcutId, setRecordingShortcutId] = useState<AppShortcutId | null>(null)
  const [deleteScoutingDataConfirmText, setDeleteScoutingDataConfirmText] = useState('')
  const [isDeletingScoutingData, setIsDeletingScoutingData] = useState(false)
  const [scoutingDataCount, setScoutingDataCount] = useState<number>(0)
  const [events, setEvents] = useState<EventDocType[]>([])
  const currentEventId = useEventStore((state) => state.currentEventId)
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent)
  const clearCurrentEvent = useEventStore((state) => state.clearCurrentEvent)

  const selectedEvent = useMemo(() => events.find((event) => event.id === currentEventId) ?? null, [events, currentEventId])
  const eventOptions = useMemo(
    () =>
      events.map((event) => ({
        value: event.id,
        label: `${event.name} (${event.season})`,
      })),
    [events],
  )

  const applyShortcutBindings = (nextBindings: ShortcutBindings, message: string): void => {
    setShortcutBindings(nextBindings)
    saveShortcutBindings(nextBindings)
    window.dispatchEvent(new CustomEvent('shortcuts:bindings-changed', { detail: nextBindings }))
    setFormMessage(message)
  }

  const shortcutRecorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      if (!recordingShortcutId) {
        return
      }

      const normalized = normalizeHotkey(hotkey)
      const conflictingId = findShortcutConflict(normalized, recordingShortcutId, shortcutBindings)
      if (conflictingId) {
        const conflictDefinition = getShortcutDefinition(conflictingId)
        notifications.show({
          color: 'yellow',
          title: 'Shortcut already in use',
          message: `${formatForDisplay(normalized)} is already assigned to "${conflictDefinition.description}".`,
        })
        return
      }

      const editedDefinition = getShortcutDefinition(recordingShortcutId)
      const nextBindings: ShortcutBindings = {
        ...shortcutBindings,
        [recordingShortcutId]: normalized,
      }

      applyShortcutBindings(nextBindings, `Shortcut updated: ${editedDefinition.description}.`)
      setRecordingShortcutId(null)
      window.dispatchEvent(new CustomEvent('shortcuts:recording-changed', { detail: false }))
    },
    onCancel: () => {
      setRecordingShortcutId(null)
      window.dispatchEvent(new CustomEvent('shortcuts:recording-changed', { detail: false }))
    },
    onClear: () => {
      if (!recordingShortcutId) {
        return
      }

      const defaults = getDefaultShortcutBindings()
      const shortcutDefinition = getShortcutDefinition(recordingShortcutId)
      const nextBindings: ShortcutBindings = {
        ...shortcutBindings,
        [recordingShortcutId]: defaults[recordingShortcutId],
      }

      applyShortcutBindings(nextBindings, `Shortcut reset: ${shortcutDefinition.description}.`)
      setRecordingShortcutId(null)
      window.dispatchEvent(new CustomEvent('shortcuts:recording-changed', { detail: false }))
    },
  })

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

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('shortcuts:recording-changed', { detail: false }))
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

  useEffect(() => {
    if (!db) {
      setEvents([])
      return
    }

    let cancelled = false

    const loadEvents = async (): Promise<void> => {
      try {
        const eventDocs = await db.collections.events
          .find({
            sort: [{ startDate: 'desc' }],
          })
          .exec()

        if (!cancelled) {
          setEvents(eventDocs.map((doc) => doc.toJSON()))
        }
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'Load event options for settings')
          setEvents([])
        }
      }
    }

    void loadEvents()

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

  const analysisConfigContext = useMemo(() => {
    if (!activeFormSchema) {
      return null
    }

    return {
      formSchemaId: activeFormSchema.id,
      formSchemaUpdatedAt: activeFormSchema.updatedAt,
    }
  }, [activeFormSchema])

  useEffect(() => {
    if (!db || !analysisConfigContext) {
      return
    }

    let cancelled = false

    const loadConfigs = async (): Promise<void> => {
      try {
        const configs = await loadAnalysisFieldConfigsFromDatabase(db, analysisConfigContext, analysisFields)
        if (!cancelled) {
          setAnalysisFieldConfigs(configs)
        }
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'Load analysis field configuration')
          setAnalysisFieldConfigs([])
        }
      }
    }

    void loadConfigs()

    return () => {
      cancelled = true
    }
  }, [analysisConfigContext, analysisFields, db])

  const persistAnalysisFieldConfigs = useCallback(
    async (configs: AnalysisFieldConfig[]): Promise<void> => {
      if (!db || !analysisConfigContext) {
        return
      }

      try {
        await saveAnalysisFieldConfigsToDatabase(db, analysisConfigContext, configs)
      } catch (error: unknown) {
        handleError(error, 'Save analysis field configuration')
      }
    },
    [analysisConfigContext, db],
  )

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

      void persistAnalysisFieldConfigs(next)
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

  const handleStartShortcutRecording = (shortcutId: AppShortcutId): void => {
    setRecordingShortcutId(shortcutId)
    window.dispatchEvent(new CustomEvent('shortcuts:recording-changed', { detail: true }))
    shortcutRecorder.startRecording()
  }

  const handleCancelShortcutRecording = (): void => {
    shortcutRecorder.cancelRecording()
    setRecordingShortcutId(null)
    window.dispatchEvent(new CustomEvent('shortcuts:recording-changed', { detail: false }))
  }

  const handleResetShortcut = (shortcutId: AppShortcutId): void => {
    const defaults = getDefaultShortcutBindings()
    const definition = getShortcutDefinition(shortcutId)

    const nextBindings: ShortcutBindings = {
      ...shortcutBindings,
      [shortcutId]: defaults[shortcutId],
    }

    applyShortcutBindings(nextBindings, `Shortcut reset: ${definition.description}.`)
  }

  const handleResetAllShortcuts = (): void => {
    const defaults = getDefaultShortcutBindings()
    applyShortcutBindings(defaults, 'All shortcuts reset to defaults.')
    setRecordingShortcutId(null)
    shortcutRecorder.cancelRecording()
    window.dispatchEvent(new CustomEvent('shortcuts:recording-changed', { detail: false }))
  }

  const handleDeveloperModeToggle = (value: boolean): void => {
    setDeveloperMode(value)
    localStorage.setItem('developer_mode', String(value))
    window.dispatchEvent(new CustomEvent('developer-mode:changed', { detail: value }))
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

  const handleCurrentEventChange = (value: string | null): void => {
    if (!value) {
      clearCurrentEvent()
      notifications.show({
        color: 'blue',
        title: 'Current event cleared',
        message: 'No default event is selected.',
      })
      return
    }

    const selected = events.find((event) => event.id === value)
    if (!selected) {
      notifications.show({
        color: 'yellow',
        title: 'Event unavailable',
        message: 'Selected event is not in local storage.',
      })
      return
    }

    setCurrentEvent(selected.id, selected.season)
    notifications.show({
      color: 'green',
      title: 'Current event updated',
      message: `Set to ${selected.name} (${selected.season}).`,
    })
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
    logger.clearLogs()
    clearLogsModalHandlers.close()
    notifications.show({ color: 'green', title: 'Logs cleared', message: 'All logs were removed.' })
  }

  const refreshScoutingDataCount = useCallback(async (): Promise<void> => {
    if (!db) {
      setScoutingDataCount(0)
      return
    }

    try {
      const count = await db.collections.scoutingData.count().exec()
      setScoutingDataCount(count)
    } catch (error: unknown) {
      handleError(error, 'Load scouting data count')
      setScoutingDataCount(0)
    }
  }, [db])

  useEffect(() => {
    if (!deleteScoutingDataModalOpened) {
      setDeleteScoutingDataConfirmText('')
      return
    }

    void refreshScoutingDataCount()
  }, [deleteScoutingDataModalOpened, refreshScoutingDataCount])

  const handleDeleteScoutingData = async (): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'red',
        title: 'Database not ready',
        message: 'Please wait for database initialization.',
      })
      return
    }

    if (deleteScoutingDataConfirmText.trim().toUpperCase() !== 'DELETE') {
      notifications.show({
        color: 'yellow',
        title: 'Confirmation required',
        message: 'Type DELETE to confirm deleting scouting data.',
      })
      return
    }

    setIsDeletingScoutingData(true)
    try {
      const docs = await db.collections.scoutingData.find().exec()
      await Promise.all(docs.map(async (doc) => await doc.remove()))

      notifications.show({
        color: 'green',
        title: 'Scouting data deleted',
        message: `Removed ${docs.length} scouting observation${docs.length === 1 ? '' : 's'} from this device.`,
      })

      deleteScoutingDataModalHandlers.close()
      setDeleteScoutingDataConfirmText('')
      setScoutingDataCount(0)
    } catch (error: unknown) {
      handleError(error, 'Delete scouting data from settings')
    } finally {
      setIsDeletingScoutingData(false)
    }
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
          <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
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

            <RouteHelpModal
              title="Settings Overview"
              description="Configure runtime preferences, API credentials, shortcuts, and diagnostics."
              steps={[
                { title: 'General', description: 'Control device behavior and developer tools visibility.' },
                { title: 'Analysis', description: 'Choose which scouting fields appear in analysis charts.' },
                { title: 'Operations', description: 'Manage updates, logs, and maintenance actions.' },
              ]}
              tips={[
                { text: 'Set TBA API key on Hub devices for event import workflows.' },
                { text: 'Use destructive data actions only when you are sure.' },
              ]}
              tooltipLabel="How settings are organized"
              color="frc-blue"
            />
          </Group>
        </Box>

        {/* Current Event */}
        <Card p="lg" radius="lg" style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="lg" variant="light" color="frc-orange">
                <IconCalendarEvent size={16} />
              </ThemeIcon>
              <Text fw={600} c="slate.0" size="lg">Current Event</Text>
            </Group>

            <Text c="slate.4" size="sm">
              Set the default event used across Home, Scout, Analysis, and Assignments.
            </Text>

            <Select
              label="Active Event"
              placeholder="Select imported event"
              value={currentEventId}
              onChange={handleCurrentEventChange}
              data={eventOptions}
              searchable
              clearable
              disabled={!db}
              radius="md"
            />

            {selectedEvent ? (
              <Badge variant="light" color="frc-blue" radius="md">
                Selected: {selectedEvent.name} ({selectedEvent.season})
              </Badge>
            ) : (
              <Text size="xs" c="slate.5">
                {eventOptions.length === 0
                  ? 'No imported events available yet. Import from Event Management first.'
                  : 'No default event selected.'}
              </Text>
            )}
          </Stack>
        </Card>

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

            <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="center" wrap="wrap">
                  <Text size="sm" c="slate.3">
                    Customize shortcut bindings
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="slate"
                    onClick={handleResetAllShortcuts}
                    disabled={recordingShortcutId !== null}
                  >
                    Reset All
                  </Button>
                </Group>

                <Table.ScrollContainer minWidth={680}>
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Action</Table.Th>
                        <Table.Th>Current Shortcut</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>Controls</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {appShortcuts.map((shortcut) => {
                        const isRecording = recordingShortcutId === shortcut.id && shortcutRecorder.isRecording
                        return (
                          <Table.Tr key={shortcut.id}>
                            <Table.Td>
                              <Stack gap={2}>
                                <Text size="sm" c="slate.1" fw={600}>
                                  {shortcut.description}
                                </Text>
                                <Text size="xs" c="slate.5">
                                  {shortcut.category}
                                </Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color="frc-blue" radius="md" className="mono-number">
                                {formatForDisplay(shortcutBindings[shortcut.id], { useSymbols: false })}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Group justify="flex-end" gap="xs" wrap="nowrap">
                                {isRecording ? (
                                  <Button size="xs" color="warning" variant="light" onClick={handleCancelShortcutRecording}>
                                    Press keys... (Cancel)
                                  </Button>
                                ) : (
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="frc-blue"
                                    onClick={() => handleStartShortcutRecording(shortcut.id)}
                                  >
                                    Record
                                  </Button>
                                )}
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="slate"
                                  onClick={() => handleResetShortcut(shortcut.id)}
                                  disabled={isRecording}
                                >
                                  Reset
                                </Button>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        )
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>

                {recordingShortcutId && shortcutRecorder.isRecording && (
                  <Alert color="frc-blue" variant="light" radius="md" icon={<IconInfoCircle size={16} />}>
                    Recording shortcut for <strong>{getShortcutDefinition(recordingShortcutId).description}</strong>. Press a key
                    combination now.
                    {shortcutRecorder.recordedHotkey
                      ? ` Captured: ${formatForDisplay(shortcutRecorder.recordedHotkey, { useSymbols: false })}.`
                      : ''}
                  </Alert>
                )}
              </Stack>
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
                onClick={clearLogsModalHandlers.open}
                leftSection={<IconTrash size={16} />}
                radius="md"
              >
                Clear Logs
              </Button>
            </Group>

            <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
              <Stack gap="sm">
                <Text size="sm" fw={600} c="slate.1">Scouting Data</Text>
                <Text size="sm" c="slate.4">
                  Delete scouting observations collected on this device. Forms, events, matches, and assignments are preserved.
                </Text>
                <Button
                  color="danger"
                  variant="light"
                  leftSection={<IconTrash size={16} />}
                  onClick={deleteScoutingDataModalHandlers.open}
                  disabled={!db}
                  radius="md"
                >
                  Delete Scouting Data
                </Button>
              </Stack>
            </Paper>
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

        <Modal
          opened={clearLogsModalOpened}
          onClose={clearLogsModalHandlers.close}
          title="Clear Logs"
          centered
          radius="lg"
          styles={{
            header: { backgroundColor: 'var(--surface-raised)' },
            body: { backgroundColor: 'var(--surface-raised)' },
          }}
        >
          <Stack gap="md">
            <Alert color="warning" variant="light" icon={<IconAlertTriangle size={16} />} radius="md">
              This removes all stored application logs on this device.
            </Alert>
            <Text size="sm" c="slate.4">
              Use this if logs are noisy or you want a clean troubleshooting session.
            </Text>
            <Group justify="flex-end">
              <Button variant="subtle" color="slate" onClick={clearLogsModalHandlers.close}>
                Cancel
              </Button>
              <Button color="danger" onClick={handleClearLogs} leftSection={<IconTrash size={16} />}>
                Clear Logs
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={deleteScoutingDataModalOpened}
          onClose={() => {
            if (isDeletingScoutingData) {
              return
            }
            deleteScoutingDataModalHandlers.close()
          }}
          title="Delete Scouting Data"
          centered
          radius="lg"
          styles={{
            header: { backgroundColor: 'var(--surface-raised)' },
            body: { backgroundColor: 'var(--surface-raised)' },
          }}
        >
          <Stack gap="md">
            <Alert color="danger" variant="light" icon={<IconAlertTriangle size={16} />} radius="md">
              This action permanently deletes scouting observations stored on this device.
            </Alert>

            <Text size="sm" c="slate.3">
              Records to delete: <strong>{scoutingDataCount}</strong>
            </Text>

            <TextInput
              label="Type DELETE to confirm"
              placeholder="DELETE"
              value={deleteScoutingDataConfirmText}
              onChange={(event) => setDeleteScoutingDataConfirmText(event.currentTarget.value)}
              disabled={isDeletingScoutingData}
            />

            <Group justify="flex-end">
              <Button
                variant="subtle"
                color="slate"
                onClick={deleteScoutingDataModalHandlers.close}
                disabled={isDeletingScoutingData}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                variant="filled"
                leftSection={<IconTrash size={16} />}
                onClick={() => void handleDeleteScoutingData()}
                loading={isDeletingScoutingData}
              >
                Delete Data
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Box>
  )
}
