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
  IconArrowRight,
  IconCalendarEvent,
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
                  Capture the floor truth and turn it into confident picklist decisions
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
                backgroundColor: 'rgba(255, 136, 0, 0.04)',
                border: '1px solid rgba(255, 136, 0, 0.12)',
                borderRadius: '12px',
              }}
            >
              <Group gap="md" wrap="nowrap" align="center">
                <ThemeIcon size={36} radius="md" variant="light" color="frc-orange">
                  <IconCalendarEvent size={18} />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="xs" c="slate.4" fw={500} className="uppercase tracking-[0.05em]">
                    Current Event
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
                      Import Events
                    </Button>
                  )}
                </Group>
              </Group>
            </Box>
          </Stack>

          {/* Stats - visually grouped under event context */}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" className="animate-fadeInUp stagger-1">
            <Card p="xl" radius="lg" className="glass surface-card">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Text size="xs" c="slate.4" fw={500} className="uppercase tracking-[0.05em]">
                    Observations
                  </Text>
                  <Text fw={700} size="2rem" c="slate.0" className="mono-number" mt="xs">
                    {observationCount}
                  </Text>
                </Box>
                <ThemeIcon size={48} radius="lg" variant="light" color="frc-blue">
                  <IconClipboardCheck size={24} />
                </ThemeIcon>
              </Group>
            </Card>

            <Card p="xl" radius="lg" className="glass surface-card">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Text size="xs" c="slate.4" fw={500} className="uppercase tracking-[0.05em]">
                    Teams Scouted
                  </Text>
                  <Text fw={700} size="2rem" c="slate.0" className="mono-number" mt="xs">
                    {teamCount}
                  </Text>
                </Box>
                <ThemeIcon size={48} radius="lg" variant="light" color="frc-orange">
                  <IconChartBar size={24} />
                </ThemeIcon>
              </Group>
            </Card>
          </SimpleGrid>

          {/* Quick Actions - clear visual separation */}
          <Stack gap="lg" className="animate-fadeInUp stagger-2">
            <Text fw={600} size="sm" c="slate.3" className="uppercase tracking-[0.05em]">
              Quick Actions
            </Text>
            
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Button
                component={Link}
                to="/sync"
                size="xl"
                radius="lg"
                variant="gradient"
                gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                leftSection={<IconCloudUpload size={22} />}
                rightSection={<IconArrowRight size={18} />}
                classNames={{ root: 'h-[72px]', label: 'text-base font-semibold' }}
              >
                Receive Scout Data
              </Button>

              <Button
                component={Link}
                to="/analysis"
                size="xl"
                radius="lg"
                variant="light"
                color="frc-blue"
                leftSection={<IconChartBar size={22} />}
                rightSection={<IconArrowRight size={18} />}
                classNames={{ root: 'h-[72px]', label: 'text-base font-semibold' }}
              >
                View Team Stats
              </Button>

              <Button
                component={Link}
                to="/form-builder"
                size="xl"
                radius="lg"
                variant="light"
                color="slate"
                leftSection={<IconSettings size={22} />}
                rightSection={<IconArrowRight size={18} />}
                classNames={{ root: 'h-[72px]', label: 'text-base font-semibold' }}
              >
                Edit Scouting Form
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
                variant="gradient" 
                gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
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
              backgroundColor: 'rgba(255, 136, 0, 0.03)',
              border: '1px solid rgba(255, 136, 0, 0.1)',
              borderRadius: '12px',
            }}
          >
            <Group gap="sm" mb="xs" wrap="nowrap">
              <ThemeIcon size={28} radius="md" variant="light" color="frc-orange">
                <IconCalendarEvent size={14} />
              </ThemeIcon>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" c="slate.4" fw={500} className="uppercase tracking-[0.05em]">
                  Current Event
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
            to="/scout"
            size="xl"
            radius="lg"
            fullWidth
            variant="gradient"
            gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
            rightSection={<IconArrowRight size={20} />}
            classNames={{ root: 'h-16', label: 'text-lg font-bold' }}
          >
            Scout a Match
          </Button>

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
