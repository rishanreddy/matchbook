import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { Link } from 'react-router-dom'
import {
  IconClipboardCheck,
  IconChartBar,
  IconCloudUpload,
  IconSettings,
  IconCalendarEvent,
  IconFileDownload,
} from '@tabler/icons-react'
import { useIsHub } from '../stores/useDeviceStore'
import { useDatabaseStore } from '../stores/useDatabase'
import { useEventStore } from '../stores/useEventStore'
import type { ScoutingDataDocument } from '../lib/db/collections'
import type { EventDocType } from '../lib/db/schemas/events.schema'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { handleError } from '../lib/utils/errorHandler'
import { brand } from '../config/brand'

export function Home(): ReactElement {
  const isHub = useIsHub()
  const db = useDatabaseStore((state) => state.db)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent)
  const clearCurrentEvent = useEventStore((state) => state.clearCurrentEvent)
  const [observationCount, setObservationCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [events, setEvents] = useState<EventDocType[]>([])
  const [hasActiveForm, setHasActiveForm] = useState(false)

  useEffect(() => {
    if (!db) {
      return
    }

    const fetchEvents = async (): Promise<void> => {
      try {
        const eventDocs = await db.collections.events
          .find({
            sort: [{ startDate: 'desc' }],
          })
          .exec()
        setEvents(eventDocs.map((doc) => doc.toJSON()))
      } catch (error: unknown) {
        handleError(error, 'Load events')
      }
    }

    void fetchEvents()
  }, [db])

  useEffect(() => {
    if (!db) {
      return
    }

    const subscription = db.collections.formSchemas.find({ selector: { isActive: true } }).$.subscribe({
      next: (forms) => setHasActiveForm(forms.length > 0),
      error: (error: unknown) => {
        handleError(error, 'Observe active scouting form')
        setHasActiveForm(false)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [db])

  useEffect(() => {
    if (!db) return

    const subscription = db.collections.scoutingData.find().$.subscribe((docs) => {
      const observations = docs as ScoutingDataDocument[]
      setObservationCount(observations.length)
      const uniqueTeams = new Set(observations.map((d) => d.get('teamNumber')))
      setTeamCount(uniqueTeams.size)
    })

    return () => subscription.unsubscribe()
  }, [db])

  const currentEvent = events.find((e) => e.id === currentEventId)

  if (isHub) {
    // Hub view - shows stats and quick actions
    return (
      <Box className="container-wide" py="xl">
        <Stack gap={40}>
          {/* Header with integrated event selector */}
          <Stack gap={24} className="animate-fadeInUp">
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Box>
                <Title order={1} c="slate.0" className="text-[32px] font-bold">
                  {brand.name} Hub
                </Title>
                <Text size="md" c="slate.4" mt="xs">
                  Collect match data from your scout laptops and rank teams for alliance selection.
                </Text>
              </Box>

              <RouteHelpModal
                title="Hub Home"
                description="This dashboard is your command center for sync, forms, and analysis."
                steps={[
                  { title: 'Select Event', description: 'Set the active event for schedules and assignments.' },
                  { title: 'Monitor Progress', description: 'Track observations and unique teams scouted.' },
                  { title: 'Run Actions', description: 'Open Sync, Analysis, or Form Builder from quick actions.' },
                ]}
                tips={[
                  { text: 'Sync frequently between matches to keep analysis up to date.' },
                  { text: 'Keep active event accurate each day of competition.' },
                ]}
                tooltipLabel="Hub dashboard help"
                color="frc-blue"
              />
            </Group>

            {/* Integrated event selector bar */}
            <Box
              p="lg"
              style={{
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
              }}
            >
              <Group gap="md" wrap="nowrap" align="center">
                <ThemeIcon size={36} radius="md" variant="light" color="frc-orange">
                  <IconCalendarEvent size={18} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="xs" c="slate.4">
                    Current event
                  </Text>
                  {currentEvent ? (
                    <Text fw={600} size="sm" c="slate.1" mt={2} truncate>
                      {currentEvent.name} ({currentEvent.season})
                    </Text>
                  ) : (
                    <Text size="xs" c="slate.5" mt={2}>No event selected</Text>
                  )}
                </Box>
                <Group gap="xs">
                  <Select
                    placeholder="Select event"
                    value={currentEventId}
                    onChange={(value) => {
                      if (value) {
                        const selectedEvent = events.find((e) => e.id === value)
                        if (selectedEvent) {
                          setCurrentEvent(value, selectedEvent.season)
                        }
                      }
                    }}
                    data={events.map((event) => ({
                      value: event.id,
                      label: `${event.name} (${event.season})`,
                    }))}
                    size="sm"
                    w={280}
                    clearable
                    onClear={() => clearCurrentEvent()}
                  />
                  {events.length === 0 && (
                    <Button
                      component={Link}
                      to="/events"
                      variant="light"
                      color="frc-orange"
                      size="sm"
                    >
                      Import events
                    </Button>
                  )}
                </Group>
              </Group>
            </Box>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" className="animate-fadeInUp stagger-1">
            <Card p="xl" radius="lg" className="surface-card">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box>
                  <Text fw={600} size="2rem" c="slate.0" className="mono-number" lh={1.1}>
                    {observationCount}
                  </Text>
                  <Text size="sm" c="slate.2" mt={4}>
                    {observationCount === 1 ? 'match observation' : 'match observations'}
                  </Text>
                  <Text size="xs" c="slate.4" mt={6}>
                    {observationCount === 0
                      ? 'Nothing recorded yet. Scout data lands here once devices sync.'
                      : 'Collected on this hub.'}
                  </Text>
                </Box>
                <ThemeIcon size={44} radius="md" variant="light" color="slate">
                  <IconClipboardCheck size={22} />
                </ThemeIcon>
              </Group>
            </Card>

            <Card p="xl" radius="lg" className="surface-card">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box>
                  <Text fw={600} size="2rem" c="slate.0" className="mono-number" lh={1.1}>
                    {teamCount}
                  </Text>
                  <Text size="sm" c="slate.2" mt={4}>
                    {teamCount === 1 ? 'team covered' : 'teams covered'}
                  </Text>
                  <Text size="xs" c="slate.4" mt={6}>
                    {teamCount === 0
                      ? 'Alliance picks need at least a few teams scouted.'
                      : 'Ready for alliance comparison.'}
                  </Text>
                </Box>
                <ThemeIcon size={44} radius="md" variant="light" color="slate">
                  <IconChartBar size={22} />
                </ThemeIcon>
              </Group>
            </Card>
          </SimpleGrid>

          <Stack gap="lg" className="animate-fadeInUp stagger-2">
            <Text fw={600} size="sm" c="slate.2">
              Next steps
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Button
                component={Link}
                to="/sync"
                size="md"
                leftSection={<IconCloudUpload size={18} />}
              >
                Receive scout data
              </Button>

              <Button
                component={Link}
                to="/analysis"
                size="md"
                variant="default"
                leftSection={<IconChartBar size={18} />}
              >
                Compare teams
              </Button>

              <Button
                component={Link}
                to="/form-builder"
                size="md"
                variant="default"
                leftSection={<IconSettings size={18} />}
              >
                Edit scouting form
              </Button>
            </SimpleGrid>
          </Stack>
        </Stack>
      </Box>
    )
  }

  // Scout view - simple "Scout a Match" button
  return (
    <Box className="container-wide" py="xl">
      <Stack gap={48} align="center" justify="center" className="min-h-[60vh]">
        {/* Hero section with integrated event selector */}
        <Stack gap={32} align="center" className="animate-fadeInUp">
          <Group justify="space-between" align="flex-start" w="100%" maw={640}>
            <Box ta="center" style={{ flex: 1 }}>
              <ThemeIcon 
                size={96} 
                radius="xl" 
                variant="light"
                color="slate"
                mb="xl"
              >
                <IconClipboardCheck size={48} />
              </ThemeIcon>
              <Title order={1} c="slate.0" className="text-4xl font-bold">
                {brand.name} Scout Mode
              </Title>
              <Text size="lg" c="slate.4" mt="md" maw={480} mx="auto">
                Watch a match, record what you see, then send your data to the lead scout
              </Text>
            </Box>

            <RouteHelpModal
              title="Scout Home"
              description="This view is optimized for fast match capture workflows."
              steps={[
                { title: 'Confirm Event', description: 'Choose active event for schedule-aware scouting.' },
                { title: 'Open Scout Form', description: 'Tap Scout a Match and record one robot at a time.' },
                { title: 'Send Data', description: 'Sync observations back to the Hub regularly.' },
              ]}
              tips={[
                { text: 'If schedule data is missing, manual team and match entry still works.' },
                { text: 'Sync between matches to reduce end-of-day backlog.' },
              ]}
              tooltipLabel="Scout mode help"
              color="frc-blue"
            />
          </Group>

          {/* Integrated inline event selector */}
          <Box
            w="100%"
            maw={480}
            p="md"
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
            }}
          >
            <Group gap="sm" mb="xs" wrap="nowrap">
              <ThemeIcon size={28} radius="md" variant="light" color="frc-orange">
                <IconCalendarEvent size={14} />
              </ThemeIcon>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" c="slate.4">
                  Current event
                </Text>
                {currentEvent ? (
                  <Text fw={600} size="sm" c="slate.1" mt={2} truncate>
                    {currentEvent.name}
                  </Text>
                ) : (
                  <Text size="xs" c="slate.5" mt={2}>No event selected</Text>
                )}
              </Box>
            </Group>

            <Select
              placeholder="Select an event (optional)"
              value={currentEventId}
              onChange={(value) => {
                if (value) {
                  const selectedEvent = events.find((e) => e.id === value)
                  if (selectedEvent) {
                    setCurrentEvent(value, selectedEvent.season)
                  }
                }
              }}
              data={events.map((event) => ({
                value: event.id,
                label: `${event.name} (${event.season})`,
              }))}
              size="sm"
              clearable
              onClear={() => clearCurrentEvent()}
            />
          </Box>
        </Stack>

        {/* Primary action - clear visual hierarchy */}
        <Stack gap="md" w="100%" maw={480} className="animate-fadeInUp stagger-1">
          <Button
            component={Link}
            to={hasActiveForm ? '/scout' : '/sync'}
            size="lg"
            fullWidth
            leftSection={hasActiveForm ? <IconClipboardCheck size={20} /> : <IconFileDownload size={20} />}
          >
            {hasActiveForm ? 'Scout a match' : 'Get the scouting form'}
          </Button>

          {!hasActiveForm && (
            <Text size="sm" c="slate.4" ta="center">
              Receive the active form from the hub before recording your first match. Your device is otherwise ready to use offline.
            </Text>
          )}

          {observationCount > 0 && (
            <Button
              component={Link}
              to="/sync"
              size="lg"
              radius="lg"
              fullWidth
              variant="light"
              color="frc-blue"
              leftSection={<IconCloudUpload size={20} />}
            >
              Send Data ({observationCount} matches)
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  )
}
