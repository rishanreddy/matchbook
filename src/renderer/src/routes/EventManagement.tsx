import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Select,
  Skeleton,
  Stack,
  TextInput,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconCalendarEvent,
  IconExternalLink,
  IconInfoCircle,
  IconMapPin,
  IconSearch,
  IconTrophy,
  IconUsers,
  IconX,
} from '@tabler/icons-react'
import { getEvent, getEventMatches, getEventsByYear, getEventTeams } from '../lib/api/tba'
import { formatDateRange } from '../lib/utils/dates'
import type { TBAEvent } from '../types/tba'
import { useDatabaseStore } from '../stores/useDatabase'
import { notifyErrorWithRetry } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'

function getYearOptions(currentYear: number): Array<{ value: string; label: string }> {
  return Array.from({ length: 7 }, (_, index) => {
    const year = currentYear - index
    const value = String(year)
    return { value, label: value }
  })
}

function getEventTypeIcon(eventTypeString: string): ReactElement {
  const lowerType = eventTypeString.toLowerCase()
  
  if (lowerType.includes('championship') || lowerType.includes('cmp')) {
    return <IconTrophy size={16} />
  }
  if (lowerType.includes('district')) {
    return <IconUsers size={16} />
  }
  if (lowerType.includes('regional')) {
    return <IconMapPin size={16} />
  }
  
  return <IconCalendarEvent size={16} />
}

function handleOpenTBA(eventKey: string): void {
  const url = `https://www.thebluealliance.com/event/${eventKey}`
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function EventManagement(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const currentYear = new Date().getFullYear()
  const fallbackYear = currentYear
  const yearOptions = getYearOptions(currentYear)
  const [selectedYear, setSelectedYear] = useState<string>(String(fallbackYear))
  const [events, setEvents] = useState<TBAEvent[]>([])
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedEventType, setSelectedEventType] = useState<string>('all')
  const [importedEventKeys, setImportedEventKeys] = useState<Set<string>>(new Set())
  const [isFetchingEvents, setIsFetchingEvents] = useState<boolean>(false)
  const [importingEventKeys, setImportingEventKeys] = useState<Set<string>>(new Set())

  const eventTypeOptions = [
    { value: 'all', label: 'All types' },
    ...Array.from(new Set(events.map((event) => event.event_type_string).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .map((eventType) => ({ value: eventType, label: eventType })),
  ]

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredEvents = events.filter((event) => {
    const location = [event.city, event.state_prov, event.country].filter(Boolean).join(' ')
    const matchesSearch =
      normalizedSearch.length === 0
      || [event.name, event.short_name, event.key, location]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedSearch))
    const matchesType = selectedEventType === 'all' || event.event_type_string === selectedEventType

    return matchesSearch && matchesType
  })
  const hasActiveFilters = normalizedSearch.length > 0 || selectedEventType !== 'all'

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

    setImportingEventKeys((prev) => new Set(prev).add(event.key))
    logger.info('Event import started', { eventKey: event.key })
    try {
      const [eventDetails, matches, teams] = await Promise.all([
        getEvent(event.key, tbaApiKey),
        getEventMatches(event.key, tbaApiKey),
        getEventTeams(event.key, tbaApiKey).catch(() => null),
      ])

      const now = new Date().toISOString()

      const sortedMatches = [...matches].sort((a, b) => a.match_number - b.match_number)
      const importedMatchKeys = new Set(sortedMatches.map((match) => match.key))

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

      const existingMatchDocs = await db.collections.matches.find({ selector: { eventId: eventDetails.key } }).exec()
      const staleMatchDocs = existingMatchDocs.filter((doc) => !importedMatchKeys.has(doc.primary))
      await Promise.all(staleMatchDocs.map(async (doc) => await doc.remove()))

      const staleMatchKeys = new Set(staleMatchDocs.map((doc) => doc.primary))
      if (staleMatchKeys.size > 0) {
        const staleAssignmentDocs = await db.collections.assignments.find({ selector: { eventKey: eventDetails.key } }).exec()
        await Promise.all(
          staleAssignmentDocs
            .filter((doc) => staleMatchKeys.has(doc.toJSON().matchKey))
            .map(async (doc) => await doc.remove()),
        )
      }

      await db.collections.events.upsert({
        id: eventDetails.key,
        name: eventDetails.short_name ?? eventDetails.name,
        season: eventDetails.year,
        startDate: eventDetails.start_date,
        endDate: eventDetails.end_date,
        syncedAt: now,
        createdAt: alreadyImported?.toJSON().createdAt ?? now,
      })

      setImportedEventKeys((prev) => new Set(prev).add(event.key))
      notifications.show({
        color: 'green',
        title: alreadyImported ? 'Event re-synced' : 'Event imported',
        message: `${alreadyImported ? 'Updated' : 'Imported'} ${sortedMatches.length} matches, removed ${staleMatchDocs.length} stale matches, and ${teams ? `fetched ${teams.length} teams` : 'skipped team list fetch'} for ${eventDetails.short_name ?? eventDetails.name}.`,
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

      <Card
        withBorder
        radius="lg"
        p="xl"
        style={{
          backgroundColor: 'var(--surface-raised)',
          borderColor: 'var(--border-default)',
          boxShadow: '0 20px 45px rgba(2, 6, 23, 0.35)',
        }}
      >
        <Stack gap="md">
          <Box>
            <Text fw={600} c="slate.1">
              Import Events from TBA
            </Text>
            <Text size="sm" c="slate.4">
              Fetch events by season, then import only the event(s) you need.
            </Text>
          </Box>

          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              alignItems: 'flex-end',
            }}
          >
            <Select
              label="Season Year"
              description="Most recent seasons are listed first"
              data={yearOptions}
              value={selectedYear}
              onChange={(value) => setSelectedYear(value ?? String(fallbackYear))}
              w="100%"
            />
            <Box style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Tooltip label="Fetch available events from The Blue Alliance">
                <Button
                  onClick={() => void handleFetchEvents()}
                  loading={isFetchingEvents}
                  variant="gradient"
                  gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                  size="md"
                  style={{ width: '100%', maxWidth: 260 }}
                >
                  Fetch Events
                </Button>
              </Tooltip>
            </Box>
          </Box>
        </Stack>
      </Card>

      <Group align="flex-end" wrap="wrap" grow>
        <TextInput
          label="Search events"
          placeholder="Search events by name, key, or location..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          rightSection={searchQuery.length > 0 ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
            >
              <IconX size={16} />
            </ActionIcon>
          ) : undefined}
        />
        <Select
          label="Event type"
          data={eventTypeOptions}
          value={selectedEventType}
          onChange={(value) => setSelectedEventType(value ?? 'all')}
        />
      </Group>

      {hasActiveFilters && (
        <Text size="sm" c="dimmed">
          Showing {filteredEvents.length} of {events.length} events
        </Text>
      )}

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
      ) : filteredEvents.length === 0 ? (
        <Card withBorder radius="md" p="lg">
          <Text c="dimmed">No events match the current filters.</Text>
        </Card>
      ) : (
        <Grid>
          {filteredEvents.map((event) => {
            const isImported = importedEventKeys.has(event.key)
            const isImporting = importingEventKeys.has(event.key)
            const location = [event.city, event.state_prov, event.country].filter(Boolean).join(', ')

            return (
              <Grid.Col key={event.key} span={{ base: 12, md: 6 }}>
                <Card
                  withBorder
                  radius="md"
                  p="lg"
                  h="100%"
                  style={{
                    position: 'relative',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  }}
                  styles={{
                    root: {
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                      },
                    },
                  }}
                >
                  <Stack gap="md">
                    {/* Header with title and TBA link */}
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={600} size="lg" lineClamp={2}>
                          {event.short_name ?? event.name}
                        </Text>
                      </Box>
                      <Tooltip label="View on The Blue Alliance">
                        <ActionIcon
                          variant="subtle"
                          color="frc-blue"
                          size="lg"
                          onClick={() => handleOpenTBA(event.key)}
                          aria-label={`Open ${event.key} on TBA`}
                        >
                          <IconExternalLink size={20} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>

                    {/* Badges row */}
                    <Group gap="xs" wrap="wrap">
                      {isImported && (
                        <Badge color="green" variant="light" leftSection={<Text size="xs">✓</Text>}>
                          Imported
                        </Badge>
                      )}
                      <Badge
                        color="blue"
                        variant="light"
                        leftSection={getEventTypeIcon(event.event_type_string)}
                      >
                        {event.event_type_string}
                      </Badge>
                      {event.week !== undefined && (
                        <Badge color="cyan" variant="light">
                          Week {event.week}
                        </Badge>
                      )}
                      {event.district && (
                        <Badge color="grape" variant="light">
                          {event.district.abbreviation}
                        </Badge>
                      )}
                    </Group>

                    {/* Event details */}
                    <Stack gap="xs">
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" c="dimmed" style={{ fontFamily: 'monospace' }}>
                          {event.key}
                        </Text>
                      </Group>
                      <Text size="sm" fw={500}>
                        {formatDateRange(event.start_date, event.end_date)}
                      </Text>
                      {location && (
                        <Text size="sm" c="dimmed" lineClamp={1}>
                          {location}
                        </Text>
                      )}
                    </Stack>

                    {/* Action button */}
                    <Button
                      mt="xs"
                      onClick={() => void handleImportEvent(event)}
                      loading={isImporting}
                      variant={isImported ? 'light' : 'filled'}
                      fullWidth
                    >
                      {isImported ? 'Re-sync Event' : 'Import Event'}
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
