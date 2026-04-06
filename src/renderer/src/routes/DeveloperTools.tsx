import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconCheck,
  IconCode,
  IconDatabase,
  IconInfoCircle,
  IconRefresh,
  IconRocket,
  IconTerminal,
  IconTools,
  IconTrash,
} from '@tabler/icons-react'
import { useDatabaseStore } from '../stores/useDatabase'
import { resetDatabase } from '../lib/db/database'
import { handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'

export function DeveloperTools(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const clearDatabaseState = useDatabaseStore((state) => state.clearState)
  const initializeDb = useDatabaseStore((state) => state.initialize)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [dbStats, setDbStats] = useState<Record<string, number> | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [clearLogsModalOpen, setClearLogsModalOpen] = useState(false)
  const [clearScoutingDataModalOpen, setClearScoutingDataModalOpen] = useState(false)
  const [clearEventImportsModalOpen, setClearEventImportsModalOpen] = useState(false)
  const [isClearingScoutingData, setIsClearingScoutingData] = useState(false)
  const [isClearingEventImports, setIsClearingEventImports] = useState(false)
  const [clearScoutingDataConfirmText, setClearScoutingDataConfirmText] = useState('')
  const [clearEventImportsConfirmText, setClearEventImportsConfirmText] = useState('')
  const [scoutingDataCount, setScoutingDataCount] = useState(0)
  const [eventImportCounts, setEventImportCounts] = useState({ events: 0, matches: 0, assignments: 0 })
  const [forceSmallQrChunks, setForceSmallQrChunks] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sync_force_small_qr_chunks') === 'true'
    } catch {
      return false
    }
  })

  const setForceSmallQrChunkMode = (enabled: boolean): void => {
    setForceSmallQrChunks(enabled)
    try {
      localStorage.setItem('sync_force_small_qr_chunks', String(enabled))
    } catch {
      // ignore persistence failures
    }
    window.dispatchEvent(new CustomEvent('sync:force-small-qr-chunks-changed', { detail: enabled }))
    notifications.show({
      color: 'green',
      title: enabled ? 'QR test mode enabled' : 'QR test mode disabled',
      message: enabled
        ? 'Sync QR exports will use smaller chunk size for multi-chunk testing.'
        : 'Sync QR exports reverted to normal chunk size.',
    })
  }

  const loadDatabaseStats = async (): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'yellow',
        title: 'Database not ready',
        message: 'Please wait for database initialization.',
      })
      return
    }

    setIsLoadingStats(true)
    try {
      const stats: Record<string, number> = {}
      const collections = Object.keys(db.collections) as Array<keyof typeof db.collections>

      for (const collectionName of collections) {
        const count = await db.collections[collectionName].count().exec()
        stats[collectionName] = count
      }

      setDbStats(stats)
      logger.info('Loaded database statistics', stats)
    } catch (error: unknown) {
      handleError(error, 'Load database statistics')
    } finally {
      setIsLoadingStats(false)
    }
  }

  const handleResetDatabase = async (): Promise<void> => {
    if (confirmText !== 'RESET') {
      notifications.show({
        color: 'yellow',
        title: 'Confirmation required',
        message: 'Please type RESET to confirm.',
      })
      return
    }

    setIsResetting(true)
    logger.warn('Database reset initiated by user')

    try {
      await resetDatabase()
      clearDatabaseState()
      setResetModalOpen(false)
      setConfirmText('')

      notifications.show({
        color: 'green',
        title: 'Database reset',
        message: 'Local database cleared. Reinitializing...',
        icon: <IconCheck size={16} />,
      })

      logger.info('Database reset successful, reinitializing')
      await initializeDb()
    } catch (error: unknown) {
      handleError(error, 'Reset database')
    } finally {
      setIsResetting(false)
    }
  }

  const copyDatabaseInfo = (): void => {
    const info = {
      collections: dbStats,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    }

    navigator.clipboard
      .writeText(JSON.stringify(info, null, 2))
      .then(() => {
        notifications.show({
          color: 'green',
          title: 'Copied',
          message: 'Database info copied to clipboard',
          icon: <IconCheck size={16} />,
        })
      })
      .catch((error: unknown) => {
        handleError(error, 'Copy to clipboard')
      })
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

  const exportLogs = (): void => {
    downloadTextFile(logger.exportLogs(), `matchbook-logs-${new Date().toISOString().slice(0, 10)}.json`)
    notifications.show({
      color: 'green',
      title: 'Logs exported',
      message: 'Downloaded logs as JSON.',
    })
  }

  const setOnboardingState = async (completed: boolean): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'yellow',
        title: 'Database not ready',
        message: 'Wait for database initialization and try again.',
      })
      return
    }

    const now = new Date().toISOString()
    try {
      await db.collections.appState.upsert({
        id: 'global',
        onboardingCompleted: completed,
        setupCompletedAt: completed ? now : '',
        updatedAt: now,
      })

      window.dispatchEvent(new CustomEvent('onboarding-state:changed', { detail: completed }))

      if (!completed) {
        localStorage.removeItem('matchbook-current-event-id')
        localStorage.removeItem('matchbook-current-season')
      }

      notifications.show({
        color: 'green',
        title: completed ? 'Onboarding marked complete' : 'Onboarding reset',
        message: completed
          ? 'First-run wizard will stay hidden on next launch.'
          : 'Restart app to run first-time setup wizard again.',
      })
    } catch (error: unknown) {
      handleError(error, 'Update onboarding state')
    }
  }

  const clearLogs = (): void => {
    logger.clearLogs()
    setClearLogsModalOpen(false)
    notifications.show({
      color: 'green',
      title: 'Logs cleared',
      message: 'Stored logs were removed.',
    })
  }

  const openClearScoutingDataModal = async (): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'yellow',
        title: 'Database not ready',
        message: 'Wait for database initialization and try again.',
      })
      return
    }

    try {
      const count = await db.collections.scoutingData.count().exec()
      setScoutingDataCount(count)
      setClearScoutingDataConfirmText('')
      setClearScoutingDataModalOpen(true)
    } catch (error: unknown) {
      handleError(error, 'Prepare clear scouting data modal')
    }
  }

  const clearScoutingData = async (): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'yellow',
        title: 'Database not ready',
        message: 'Wait for database initialization and try again.',
      })
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
        message: `Removed ${docs.length} scouting records.`,
      })
      setClearScoutingDataModalOpen(false)
      setClearScoutingDataConfirmText('')
      setScoutingDataCount(0)
      await loadDatabaseStats()
    } catch (error: unknown) {
      handleError(error, 'Clear scouting data')
    } finally {
      setIsClearingScoutingData(false)
    }
  }

  const openClearEventImportsModal = async (): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'yellow',
        title: 'Database not ready',
        message: 'Wait for database initialization and try again.',
      })
      return
    }

    try {
      const [eventsCount, matchesCount, assignmentsCount] = await Promise.all([
        db.collections.events.count().exec(),
        db.collections.matches.count().exec(),
        db.collections.assignments.count().exec(),
      ])

      setEventImportCounts({ events: eventsCount, matches: matchesCount, assignments: assignmentsCount })
      setClearEventImportsConfirmText('')
      setClearEventImportsModalOpen(true)
    } catch (error: unknown) {
      handleError(error, 'Prepare clear event imports modal')
    }
  }

  const clearEventImports = async (): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'yellow',
        title: 'Database not ready',
        message: 'Wait for database initialization and try again.',
      })
      return
    }

    if (clearEventImportsConfirmText.trim().toUpperCase() !== 'DELETE') {
      notifications.show({
        color: 'yellow',
        title: 'Confirmation required',
        message: 'Type DELETE to confirm clearing imported event data.',
      })
      return
    }

    setIsClearingEventImports(true)
    try {
      const [eventDocs, matchDocs, assignmentDocs] = await Promise.all([
        db.collections.events.find().exec(),
        db.collections.matches.find().exec(),
        db.collections.assignments.find().exec(),
      ])

      await Promise.all([
        ...eventDocs.map(async (doc) => await doc.remove()),
        ...matchDocs.map(async (doc) => await doc.remove()),
        ...assignmentDocs.map(async (doc) => await doc.remove()),
      ])

      notifications.show({
        color: 'green',
        title: 'Event imports cleared',
        message: `Removed ${eventDocs.length} events, ${matchDocs.length} matches, and ${assignmentDocs.length} assignments.`,
      })
      setClearEventImportsModalOpen(false)
      setClearEventImportsConfirmText('')
      setEventImportCounts({ events: 0, matches: 0, assignments: 0 })
      await loadDatabaseStats()
    } catch (error: unknown) {
      handleError(error, 'Clear imported event data')
    } finally {
      setIsClearingEventImports(false)
    }
  }

  return (
    <Box p="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group gap="md">
          <ThemeIcon size={48} radius="lg" variant="gradient" gradient={{ from: 'frc-orange.5', to: 'frc-orange.7' }}>
            <IconTools size={28} stroke={1.5} />
          </ThemeIcon>
          <Box>
            <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
              Developer Tools
            </Title>
            <Text size="sm" c="slate.4">
              Advanced diagnostics and utilities
            </Text>
          </Box>
        </Group>

        {/* Warning Banner */}
        <Alert icon={<IconAlertTriangle size={18} />} title="Caution" color="warning" radius="md">
          These tools are intended for developers and advanced users. Misuse may result in data loss or application
          instability.
        </Alert>

        {/* Database Tools */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="md" variant="light" color="frc-blue">
                <IconDatabase size={18} />
              </ThemeIcon>
              <Box>
                <Title order={3} size="h4" c="slate.1">
                  Database Tools
                </Title>
                <Text size="xs" c="slate.4">
                  Manage local RxDB database
                </Text>
              </Box>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              <Button
                variant="light"
                color="frc-blue"
                leftSection={<IconRefresh size={16} />}
                onClick={() => void loadDatabaseStats()}
                loading={isLoadingStats}
              >
                Load Statistics
              </Button>
              <Button
                variant="light"
                color="slate"
                leftSection={<IconInfoCircle size={16} />}
                onClick={copyDatabaseInfo}
                disabled={!dbStats}
              >
                Copy DB Info
              </Button>
              <Button
                variant="filled"
                color="danger"
                leftSection={<IconTrash size={16} />}
                onClick={() => setResetModalOpen(true)}
              >
                Reset Database
              </Button>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Button variant="light" color="warning" onClick={() => void openClearScoutingDataModal()}>
                Clear Scouting Data
              </Button>
              <Button variant="light" color="warning" onClick={() => void openClearEventImportsModal()}>
                Clear Event Imports
              </Button>
            </SimpleGrid>

            {dbStats && (
              <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-raised)' }}>
                <Stack gap="xs">
                  <Text size="sm" fw={600} c="slate.2">
                    Collection Statistics
                  </Text>
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Collection</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>Documents</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {Object.entries(dbStats).map(([collection, count]) => (
                        <Table.Tr key={collection}>
                          <Table.Td>
                            <Code>{collection}</Code>
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'right' }}>
                            <Badge variant="light" color={count > 0 ? 'green' : 'slate'}>
                              {count}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              </Paper>
            )}
          </Stack>
        </Card>

        {/* System Information */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="md" variant="light" color="frc-orange">
                <IconTerminal size={18} />
              </ThemeIcon>
              <Box>
                <Title order={3} size="h4" c="slate.1">
                  System Information
                </Title>
                <Text size="xs" c="slate.4">
                  Environment and runtime details
                </Text>
              </Box>
            </Group>

            <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-raised)' }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="slate.3">
                    Environment
                  </Text>
                  <Badge variant="light" color="frc-blue">
                    {import.meta.env.DEV ? 'Development' : 'Production'}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="slate.3">
                    Electron API
                  </Text>
                  <Badge variant="light" color={window.electronAPI ? 'green' : 'slate'}>
                    {window.electronAPI ? 'Available' : 'Unavailable'}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="slate.3">
                    Database Status
                  </Text>
                  <Badge variant="light" color={db ? 'green' : 'yellow'}>
                    {db ? 'Connected' : 'Disconnected'}
                  </Badge>
                </Group>
              </Stack>
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Button
                variant="light"
                color="slate"
                leftSection={<IconCode size={16} />}
                onClick={exportLogs}
              >
                Export Logs
              </Button>
              <Button
                variant="light"
                color="slate"
                leftSection={<IconTrash size={16} />}
                onClick={() => setClearLogsModalOpen(true)}
              >
                Clear Logs
              </Button>
              <Button
                variant="light"
                color="slate"
                leftSection={<IconInfoCircle size={16} />}
                onClick={() =>
                  navigator.clipboard
                    .writeText(navigator.userAgent)
                    .then(() => notifications.show({ title: 'Copied', message: 'User agent copied' }))
                    .catch((e) => handleError(e, 'Copy user agent'))
                }
              >
                Copy User Agent
              </Button>
            </SimpleGrid>

            <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-raised)' }}>
              <Stack gap="xs">
                <Text size="sm" fw={600} c="slate.2">
                  Sync QR Testing
                </Text>
                <Switch
                  label="Force small QR chunks"
                  checked={forceSmallQrChunks}
                  onChange={(event) => setForceSmallQrChunkMode(event.currentTarget.checked)}
                  styles={{ label: { color: 'var(--mantine-color-slate-2)' } }}
                />
                <Text size="xs" c="slate.4">
                  Makes QR exports split into smaller chunks so multi-chunk scan behavior is easier to test.
                </Text>
              </Stack>
            </Paper>
          </Stack>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size={32} radius="md" variant="light" color="frc-blue">
                <IconRocket size={18} />
              </ThemeIcon>
              <Box>
                <Title order={3} size="h4" c="slate.1">
                  Onboarding Controls
                </Title>
                <Text size="xs" c="slate.4">
                  Manage first-time setup completion state
                </Text>
              </Box>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Button variant="light" color="frc-blue" onClick={() => void setOnboardingState(false)}>
                Reset Onboarding
              </Button>
              <Button variant="light" color="slate" onClick={() => void setOnboardingState(true)}>
                Mark Onboarding Complete
              </Button>
            </SimpleGrid>
          </Stack>
        </Card>
      </Stack>

      {/* Reset Confirmation Modal */}
      <Modal
        opened={resetModalOpen}
        onClose={() => {
          setResetModalOpen(false)
          setConfirmText('')
        }}
        title="Reset Database"
        centered
        radius="lg"
        styles={{
          header: { backgroundColor: 'var(--surface-raised)' },
          body: { backgroundColor: 'var(--surface-raised)' },
        }}
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={18} />} title="Destructive Action" color="danger" radius="md">
            This will permanently delete all local data including events, matches, scouts, assignments, and scouting
            observations. This action cannot be undone.
          </Alert>

          <TextInput
            label="Type RESET to confirm"
            placeholder="RESET"
            value={confirmText}
            onChange={(e) => setConfirmText(e.currentTarget.value)}
            radius="md"
          />

          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              color="slate"
              onClick={() => {
                setResetModalOpen(false)
                setConfirmText('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              color="danger"
              onClick={() => void handleResetDatabase()}
              loading={isResetting}
              disabled={confirmText !== 'RESET'}
            >
              Reset Database
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={clearLogsModalOpen}
        onClose={() => setClearLogsModalOpen(false)}
        title="Clear Logs"
        centered
        radius="lg"
        styles={{
          header: { backgroundColor: 'var(--surface-raised)' },
          body: { backgroundColor: 'var(--surface-raised)' },
        }}
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={18} />} title="Confirm Log Deletion" color="warning" radius="md">
            This removes all stored local logs used for troubleshooting.
          </Alert>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="slate" onClick={() => setClearLogsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="filled" color="danger" onClick={clearLogs}>
              Clear Logs
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={clearScoutingDataModalOpen}
        onClose={() => {
          if (isClearingScoutingData) {
            return
          }
          setClearScoutingDataModalOpen(false)
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
          <Alert icon={<IconAlertTriangle size={18} />} title="Destructive Action" color="danger" radius="md">
            This permanently deletes all local scouting observations on this device.
          </Alert>
          <Text size="sm" c="slate.3">
            Records to delete: <strong>{scoutingDataCount}</strong>
          </Text>
          <TextInput
            label="Type DELETE to confirm"
            placeholder="DELETE"
            value={clearScoutingDataConfirmText}
            onChange={(event) => setClearScoutingDataConfirmText(event.currentTarget.value)}
            radius="md"
            disabled={isClearingScoutingData}
          />
          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              color="slate"
              onClick={() => {
                setClearScoutingDataModalOpen(false)
                setClearScoutingDataConfirmText('')
              }}
              disabled={isClearingScoutingData}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              color="danger"
              onClick={() => void clearScoutingData()}
              loading={isClearingScoutingData}
            >
              Delete Scouting Data
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={clearEventImportsModalOpen}
        onClose={() => {
          if (isClearingEventImports) {
            return
          }
          setClearEventImportsModalOpen(false)
          setClearEventImportsConfirmText('')
        }}
        title="Clear Event Imports"
        centered
        radius="lg"
        styles={{
          header: { backgroundColor: 'var(--surface-raised)' },
          body: { backgroundColor: 'var(--surface-raised)' },
        }}
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={18} />} title="Destructive Action" color="danger" radius="md">
            This deletes imported events, matches, and assignments from local storage.
          </Alert>
          <Stack gap={2}>
            <Text size="sm" c="slate.3">Events: <strong>{eventImportCounts.events}</strong></Text>
            <Text size="sm" c="slate.3">Matches: <strong>{eventImportCounts.matches}</strong></Text>
            <Text size="sm" c="slate.3">Assignments: <strong>{eventImportCounts.assignments}</strong></Text>
          </Stack>
          <TextInput
            label="Type DELETE to confirm"
            placeholder="DELETE"
            value={clearEventImportsConfirmText}
            onChange={(event) => setClearEventImportsConfirmText(event.currentTarget.value)}
            radius="md"
            disabled={isClearingEventImports}
          />
          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              color="slate"
              onClick={() => {
                setClearEventImportsModalOpen(false)
                setClearEventImportsConfirmText('')
              }}
              disabled={isClearingEventImports}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              color="danger"
              onClick={() => void clearEventImports()}
              loading={isClearingEventImports}
            >
              Delete Imports
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
