import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  List,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconCircleCheck, IconInfoCircle } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { formatDateRange } from '../lib/utils/dates'
import { useDatabaseStore } from '../stores/useDatabase'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'

type ImportedEvent = {
  id: string
  name: string
  startDate: string
  endDate: string
}

export function Home(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const [testDeviceId, setTestDeviceId] = useState<string>('')
  const [testStatus, setTestStatus] = useState<string>('pending')
  const [importedEvents, setImportedEvents] = useState<ImportedEvent[]>([])

  useEffect(() => {
    const runTest = async (): Promise<void> => {
      if (!db) {
        return
      }

      try {
        const deviceId = await getOrCreateDeviceId()
        const existing = await db.collections.devices.findOne(deviceId).exec()
        if (!existing) {
          await db.collections.devices.insert({
            id: deviceId,
            name: 'Renderer Test Device',
            isPrimary: true,
            lastSeenAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          })
        }

        const queried = await db.collections.devices.findOne(deviceId).exec()
        setTestDeviceId(queried?.id ?? 'not-found')
        setTestStatus(queried ? 'ok' : 'failed')
      } catch (error: unknown) {
        console.error('Database test failed:', error)
        setTestStatus('failed')
      }
    }

    void runTest()
  }, [db])

  useEffect(() => {
    const loadImportedEvents = async (): Promise<void> => {
      if (!db) {
        return
      }

      const events = await db.collections.events.find().exec()
      setImportedEvents(
        events.map((eventDoc) => ({
          id: eventDoc.id,
          name: eventDoc.name,
          startDate: eventDoc.startDate,
          endDate: eventDoc.endDate,
        })),
      )
    }

    void loadImportedEvents()
  }, [db])

  return (
    <Stack>
      <Title order={2}>Offline Scouting Manager</Title>
      <Text c="dimmed">
        Welcome! This Electron + React + TypeScript project is set up and ready for feature development.
      </Text>

      <Alert icon={<IconInfoCircle size={16} />} title="Setup status" color="blue" variant="light">
        The application shell, routing, theme, and Electron bridge are configured.
      </Alert>

      <List
        spacing="sm"
        icon={
          <ThemeIcon color="green" size={20} radius="xl">
            <IconCircleCheck size={12} />
          </ThemeIcon>
        }
      >
        <List.Item>Mantine providers and notifications mounted</List.Item>
        <List.Item>React Router navigation configured</List.Item>
        <List.Item>
          Electron preload API available via <Code>window.electronAPI</Code>
        </List.Item>
        <List.Item>
          RxDB insert/query test status:{' '}
          <Badge color={testStatus === 'ok' ? 'green' : testStatus === 'failed' ? 'red' : 'yellow'}>
            {testStatus}
          </Badge>
        </List.Item>
      </List>

      <Alert icon={<IconInfoCircle size={16} />} title="Database test result" color="teal" variant="light">
        {testStatus === 'ok'
          ? `Device document verified in RxDB: ${testDeviceId}`
          : testStatus === 'failed'
            ? 'Device test failed. Check console logs for details.'
            : 'Running insert/query test...'}
      </Alert>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>Imported Events</Title>
          {importedEvents.length === 0 ? (
            <Text c="dimmed">No events imported yet.</Text>
          ) : (
            <List spacing="xs">
              {importedEvents.map((event) => (
                <List.Item key={event.id}>
                  {event.name} ({event.id}) - {formatDateRange(event.startDate, event.endDate)}
                </List.Item>
              ))}
            </List>
          )}
          <Button component={Link} to="/events" variant="light">
            Manage Events
          </Button>
        </Stack>
      </Card>
    </Stack>
  )
}
