import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  ActionIcon,
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
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconCalendarEvent,
  IconExternalLink,
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
import { RouteHelpModal } from '../components/RouteHelpModal'
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
    <Stack gap="xl">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Title order={2} c="slate.0" style={{ letterSpacing: '-0.02em' }}>
          Event Management
        </Title>
        <RouteHelpModal
          title="Event Import Workflow"
          description="Fetch event lists by season, then import only your competition events."
          steps={[
            { title: 'Fetch by Season', description: 'Load available events for the selected year.' },
            { title: 'Filter Results', description: 'Search by name, key, or location and optionally event type.' },
            { title: 'Import Event', description: 'Import matches and teams for scouting and assignments.' },
          ]}
          tips={[
            { text: 'Set your TBA API key in Settings before importing.' },
            { text: 'Re-importing updates stale matches and assignments safely.' },
          ]}
          tooltipLabel="How event import works"
          color="frc-blue"
        />
      </Group>

      {isApiKeyMissing && (
        <Box
          p="sm"
          style={{
            backgroundColor: 'rgba(255, 136, 0, 0.08)',
            border: '1px solid rgba(255, 136, 0, 0.24)',
            borderRadius: '10px',
          }}
        >
          <Text size="sm" c="frc-orange.3" fw={600}>
            Missing TBA API key
          </Text>
          <Text size="xs" c="slate.3" mt={4}>
            Set your The Blue Alliance API key in Settings before fetching or importing events.
          </Text>
        </Box>
      )}

      <Card
        p="xl"
        radius="lg"
        style={{
          background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.8) 0%, rgba(15, 21, 32, 0.9) 100%)',
          border: '1px solid rgba(148, 163, 184, 0.14)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className="hover:border-[rgba(26,140,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_32px_rgba(26,140,255,0.08)]"
      >
        <Stack gap="lg">
          <Group gap="xs" align="center">
            <Box
              style={{
                width: '4px',
                height: '18px',
                background: 'linear-gradient(180deg, #1a8cff, #0d7de6)',
                borderRadius: '2px',
                boxShadow: '0 0 8px rgba(26, 140, 255, 0.4)',
              }}
            />
            <Text fw={700} c="slate.0" size="lg" style={{ letterSpacing: '-0.01em' }}>
              Import Events from TBA
            </Text>
          </Group>
          
          <Text size="sm" c="slate.4" style={{ marginTop: '-0.5rem' }}>
            Fetch events by season, then import only the event(s) you need.
          </Text>

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
                  fw={700}
                  style={{
                    width: '100%',
                    maxWidth: 260,
                    letterSpacing: '0.01em',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                  className="active:scale-[0.97]"
                >
                  Fetch Events
                </Button>
              </Tooltip>
            </Box>
          </Box>
        </Stack>
      </Card>

      <Group align="flex-end" wrap="wrap" grow style={{ gap: '1rem' }}>
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
              style={{ transition: 'all 0.2s ease' }}
              className="hover:bg-slate-700"
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
        <Text size="sm" c="slate.4" fw={500}>
          Showing {filteredEvents.length} of {events.length} events
        </Text>
      )}

      {isFetchingEvents ? (
        <Grid>
          {['a', 'b', 'c', 'd'].map((placeholder) => (
            <Grid.Col key={placeholder} span={{ base: 12, md: 6 }}>
              <Card
                withBorder
                radius="md"
                p="lg"
                style={{
                  background: 'rgba(21, 28, 40, 0.4)',
                  borderColor: 'rgba(148, 163, 184, 0.1)',
                }}
              >
                <Skeleton height={120} radius="md" />
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      ) : events.length === 0 ? (
        <Card
          p="xl"
          radius="lg"
          style={{
            background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.6) 0%, rgba(15, 21, 32, 0.7) 100%)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            textAlign: 'center',
          }}
        >
          <Stack gap="md" align="center">
            <ThemeIcon size={64} radius="xl" variant="light" color="slate">
              <IconCalendarEvent size={32} />
            </ThemeIcon>
            <Box>
              <Text fw={600} size="lg" c="slate.1" mb="xs">
                No Events Fetched
              </Text>
              <Text size="sm" c="slate.4">
                Select a year and click "Fetch Events" to load events from The Blue Alliance.
              </Text>
            </Box>
          </Stack>
        </Card>
      ) : filteredEvents.length === 0 ? (
        <Card
          p="xl"
          radius="lg"
          style={{
            background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.6) 0%, rgba(15, 21, 32, 0.7) 100%)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            textAlign: 'center',
          }}
        >
          <Stack gap="md" align="center">
            <ThemeIcon size={64} radius="xl" variant="light" color="slate">
              <IconSearch size={32} />
            </ThemeIcon>
            <Box>
              <Text fw={600} size="lg" c="slate.1" mb="xs">
                No Matching Events
              </Text>
              <Text size="sm" c="slate.4">
                Try adjusting your search or filter to find events.
              </Text>
            </Box>
          </Stack>
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
                  p="lg"
                  radius="md"
                  h="100%"
                  style={{
                    background: 'linear-gradient(145deg, rgba(21, 28, 40, 0.7) 0%, rgba(15, 21, 32, 0.85) 100%)',
                    border: '1px solid rgba(148, 163, 184, 0.12)',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.25)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                  className="hover:border-[rgba(26,140,255,0.3)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:-translate-y-1"
                >
                  <Stack gap="md">
                    {/* Header with title and TBA link */}
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={700} size="lg" lineClamp={2} c="slate.0" style={{ letterSpacing: '-0.01em' }}>
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
                          style={{
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                          className="hover:bg-[rgba(26,140,255,0.15)] active:scale-95"
                        >
                          <IconExternalLink size={20} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>

                    {/* Badges row */}
                    <Group gap="xs" wrap="wrap">
                      {isImported && (
                        <Badge
                          color="green"
                          variant="light"
                          leftSection={<Text size="xs">✓</Text>}
                          style={{
                            fontWeight: 600,
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.2)',
                          }}
                        >
                          Imported
                        </Badge>
                      )}
                      <Badge
                        color="blue"
                        variant="light"
                        leftSection={getEventTypeIcon(event.event_type_string)}
                        style={{ fontWeight: 600 }}
                      >
                        {event.event_type_string}
                      </Badge>
                      {event.week !== undefined && (
                        <Badge color="cyan" variant="light" style={{ fontWeight: 600 }}>
                          Week {event.week}
                        </Badge>
                      )}
                      {event.district && (
                        <Badge color="grape" variant="light" style={{ fontWeight: 600 }}>
                          {event.district.abbreviation}
                        </Badge>
                      )}
                    </Group>

                    {/* Event details */}
                    <Stack gap="xs">
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" c="slate.4" className="mono-number">
                          {event.key}
                        </Text>
                      </Group>
                      <Text size="sm" fw={600} c="slate.1">
                        {formatDateRange(event.start_date, event.end_date)}
                      </Text>
                      {location && (
                        <Text size="sm" c="slate.4" lineClamp={1}>
                          {location}
                        </Text>
                      )}
                    </Stack>

                    {/* Action button */}
                    <Button
                      mt="xs"
                      onClick={() => void handleImportEvent(event)}
                      loading={isImporting}
                      variant={isImported ? 'light' : 'gradient'}
                      gradient={isImported ? undefined : { from: 'frc-blue.5', to: 'frc-blue.7' }}
                      color={isImported ? 'frc-blue' : undefined}
                      fullWidth
                      fw={700}
                      style={{
                        letterSpacing: '0.01em',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      className="active:scale-[0.97]"
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
