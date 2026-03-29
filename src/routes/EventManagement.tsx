import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconInfoCircle } from '@tabler/icons-react'
import { getEvent, getEventMatches, getEventsByYear, getEventTeams } from '../lib/api/tba'
import { formatDateRange } from '../lib/utils/dates'
import type { TBAEvent } from '../types/tba'
import { useDatabaseStore } from '../stores/useDatabase'
import { notifyErrorWithRetry } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'

const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => {
  const year = String(2020 + index)
  return { value: year, label: year }
})

export function EventManagement(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const currentYear = new Date().getFullYear()
  const fallbackYear = Math.min(2026, Math.max(2020, currentYear))
  const [selectedYear, setSelectedYear] = useState<string>(String(fallbackYear))
  const [events, setEvents] = useState<TBAEvent[]>([])
  const [importedEventKeys, setImportedEventKeys] = useState<Set<string>>(new Set())
  const [isFetchingEvents, setIsFetchingEvents] = useState<boolean>(false)
  const [importingEventKeys, setImportingEventKeys] = useState<Set<string>>(new Set())

  const getTbaApiKey = (): string => localStorage.getItem('tba_api_key')?.trim() ?? ''

  const isApiKeyMissing = getTbaApiKey().length === 0

  const updateImportedStatus = async (fetchedEvents: TBAEvent[]): Promise<void> => {
    if (!db || fetchedEvents.length === 0) {
      return
    }

    const importedKeys = new Set<string>()
    await Promise.all(
      fetchedEvents.map(async (event) => {
        const existing = await db.collections.events.findOne(event.key).exec()
        if (existing) {
          importedKeys.add(event.key)
        }
      }),
    )

    setImportedEventKeys(importedKeys)
  }

  const handleFetchEvents = async (): Promise<void> => {
    const tbaApiKey = getTbaApiKey()
    if (!tbaApiKey) {
      notifications.show({
        color: 'yellow',
        title: 'TBA API key required',
        message: 'Set your API key in Settings before fetching events.',
      })
      return
    }

    setIsFetchingEvents(true)
    logger.info('Event fetch started', { year: selectedYear })
    try {
      const parsedYear = Number(selectedYear)
      const fetchedEvents = await getEventsByYear(parsedYear, tbaApiKey)
      setEvents(fetchedEvents)
      await updateImportedStatus(fetchedEvents)
      notifications.show({
        color: 'green',
        title: 'Events fetched',
        message: `Loaded ${fetchedEvents.length} events for ${parsedYear}.`,
      })
    } catch (error: unknown) {
      notifyErrorWithRetry(error, 'Retry Fetch', () => {
        void handleFetchEvents()
      }, 'Event fetch')
    } finally {
      setIsFetchingEvents(false)
    }
  }

  const handleImportEvent = async (event: TBAEvent): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'red',
        title: 'Database unavailable',
        message: 'Please wait for database initialization and try again.',
      })
      return
    }

    const tbaApiKey = getTbaApiKey()
    if (!tbaApiKey) {
      notifications.show({
        color: 'yellow',
        title: 'TBA API key required',
        message: 'Set your API key in Settings before importing events.',
      })
      return
    }

    const alreadyImported = await db.collections.events.findOne(event.key).exec()
    if (alreadyImported) {
      setImportedEventKeys((prev) => new Set(prev).add(event.key))
      notifications.show({
        color: 'blue',
        title: 'Already imported',
        message: `${event.short_name ?? event.name} is already in local storage.`,
      })
      return
    }

    setImportingEventKeys((prev) => new Set(prev).add(event.key))
    logger.info('Event import started', { eventKey: event.key })
    try {
      const [eventDetails, matches, teams] = await Promise.all([
        getEvent(event.key, tbaApiKey),
        getEventMatches(event.key, tbaApiKey),
        getEventTeams(event.key, tbaApiKey),
      ])

      const now = new Date().toISOString()

      await db.collections.events.insert({
        id: eventDetails.key,
        name: eventDetails.short_name ?? eventDetails.name,
        season: eventDetails.year,
        startDate: eventDetails.start_date,
        endDate: eventDetails.end_date,
        syncedAt: now,
        createdAt: now,
      })

      const sortedMatches = [...matches].sort((a, b) => a.match_number - b.match_number)

      await Promise.all(
        sortedMatches.map(async (match) => {
          await db.collections.matches.upsert({
            key: match.key,
            eventId: eventDetails.key,
            matchNumber: match.match_number,
            compLevel: match.comp_level,
            predictedTime: match.predicted_time
              ? new Date(match.predicted_time * 1000).toISOString()
              : new Date(0).toISOString(),
            redAlliance: match.alliances.red.team_keys,
            blueAlliance: match.alliances.blue.team_keys,
            createdAt: now,
          })
        }),
      )

      setImportedEventKeys((prev) => new Set(prev).add(event.key))
      notifications.show({
        color: 'green',
        title: 'Event imported',
        message: `Imported ${sortedMatches.length} matches and fetched ${teams.length} teams for ${eventDetails.short_name ?? eventDetails.name}.`,
      })
    } catch (error: unknown) {
      notifyErrorWithRetry(error, 'Retry Import', () => {
        void handleImportEvent(event)
      }, 'Event import')
    } finally {
      setImportingEventKeys((prev) => {
        const next = new Set(prev)
        next.delete(event.key)
        return next
      })
    }
  }

  return (
    <Stack>
      <Title order={2}>Event Management</Title>

      {isApiKeyMissing && (
        <Alert icon={<IconInfoCircle size={16} />} color="yellow" title="Missing TBA API key" variant="light">
          Set your The Blue Alliance API key in Settings before fetching or importing events.
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group align="flex-end">
          <Select
            label="Season Year"
            description="Choose the competition season to query from TBA"
            data={YEAR_OPTIONS}
            value={selectedYear}
            onChange={(value) => setSelectedYear(value ?? String(fallbackYear))}
            w={180}
          />
          <Tooltip label="Fetch available events from The Blue Alliance">
            <Button onClick={() => void handleFetchEvents()} loading={isFetchingEvents}>
              Fetch Events
            </Button>
          </Tooltip>
        </Group>
      </Card>

      {isFetchingEvents ? (
        <Grid>
          {['a', 'b', 'c', 'd'].map((placeholder) => (
            <Grid.Col key={placeholder} span={{ base: 12, md: 6 }}>
              <Card withBorder radius="md" p="lg"><Skeleton height={120} /></Card>
            </Grid.Col>
          ))}
        </Grid>
      ) : events.length === 0 ? (
        <Card withBorder radius="md" p="lg">
          <Text c="dimmed">No events fetched yet. Select a year and click &quot;Fetch Events&quot;.</Text>
        </Card>
      ) : (
        <Grid>
          {events.map((event) => {
            const isImported = importedEventKeys.has(event.key)
            const isImporting = importingEventKeys.has(event.key)
            const location = [event.city, event.state_prov, event.country].filter(Boolean).join(', ')

            return (
              <Grid.Col key={event.key} span={{ base: 12, md: 6 }}>
                <Card withBorder radius="md" p="lg" h="100%">
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start">
                      <Text fw={600}>{event.short_name ?? event.name}</Text>
                      {isImported && <Badge color="green">Imported</Badge>}
                    </Group>
                    <Text size="sm" c="dimmed">
                      Key: {event.key}
                    </Text>
                    <Text size="sm">{formatDateRange(event.start_date, event.end_date)}</Text>
                    <Text size="sm" c="dimmed">
                      {location || 'Location unavailable'}
                    </Text>
                    {event.week !== undefined && <Badge variant="light">Week {event.week}</Badge>}
                    <Button
                      mt="sm"
                      onClick={() => void handleImportEvent(event)}
                      loading={isImporting}
                      disabled={isImported}
                    >
                      {isImported ? 'Imported' : 'Import'}
                    </Button>
                  </Stack>
                </Card>
              </Grid.Col>
            )
          })}
        </Grid>
      )}
    </Stack>
  )
}
