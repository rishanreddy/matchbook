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
  IconBook,
  IconCheck,
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
import { formatDateRange } from '../lib/utils/dates'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { HubWifiSummary } from '../features/sync/HubWifiSummary'
import { describeMethod, useLastSent } from '../features/sync/lastSent'
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
  const [entryTimes, setEntryTimes] = useState<string[]>([])
  const lastSent = useLastSent()
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
      setEntryTimes(observations.map((d) => String(d.get('createdAt') ?? '')))
      const uniqueTeams = new Set(observations.map((d) => d.get('teamNumber')))
      setTeamCount(uniqueTeams.size)
    })

    return () => subscription.unsubscribe()
  }, [db])

  const currentEvent = events.find((e) => e.id === currentEventId)
  // Entries made after the last successful send are the ones the lead scout does not have.
  const unsentCount = lastSent ? entryTimes.filter((createdAt) => createdAt > lastSent.at).length : entryTimes.length

  if (isHub) {
    // Hub view - shows stats and quick actions
    return (
      <Box className="container-wide">
        <Stack gap={40}>
          {/* Header with integrated event selector */}
          <Stack gap={24} className="animate-fadeInUp">
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Box>
                <Title order={1} c="slate.0" className="text-[32px] font-bold">
                  {brand.name} Lead Scout
                </Title>
                <Text size="md" c="slate.4" mt="xs">
                  Collect match data from your scout laptops and rank teams for alliance selection.
                </Text>
              </Box>

              <RouteHelpModal
                title="Lead scout home"
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
                tooltipLabel="What to do here"
                color="frc-blue"
              />
            </Group>

            {/* One panel, three states. Showing an empty dropdown next to an
                "Import events" button made the first run look broken. */}
            <Box p="lg" data-tour="home-event" style={{ border: '1px solid var(--border-default)', borderRadius: '8px' }}>
              {events.length === 0 ? (
                <Group gap="md" wrap="nowrap" align="flex-start">
                  <ThemeIcon size={36} radius="sm" variant="default">
                    <IconCalendarEvent size={18} />
                  </ThemeIcon>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} size="sm" c="slate.1">
                      Import your event to get started
                    </Text>
                    <Text size="xs" c="slate.4" mt={2}>
                      Matchbook needs the match schedule from The Blue Alliance. Do this while
                      you still have internet.
                    </Text>
                  </Box>
                  <Button component={Link} to="/events" size="sm">
                    Import events
                  </Button>
                </Group>
              ) : !currentEvent ? (
                <Group gap="md" wrap="nowrap" align="flex-start">
                  <ThemeIcon size={36} radius="sm" variant="default">
                    <IconCalendarEvent size={18} />
                  </ThemeIcon>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} size="sm" c="slate.1">
                      Which event are you scouting?
                    </Text>
                    <Text size="xs" c="slate.4" mt={2} mb="sm">
                      Scouting, assignments and analysis all follow this choice.
                    </Text>
                    <Select
                      placeholder="Choose an event"
                      value={currentEventId}
                      onChange={(value) => {
                        const selectedEvent = events.find((e) => e.id === value)
                        if (selectedEvent) {
                          setCurrentEvent(selectedEvent.id, selectedEvent.season)
                        }
                      }}
                      data={events.map((event) => ({
                        value: event.id,
                        label: `${event.name} (${event.season})`,
                      }))}
                      size="sm"
                      maw={360}
                    />
                  </Box>
                </Group>
              ) : (
                <Group gap="md" wrap="wrap" align="center">
                  <ThemeIcon size={36} radius="sm" variant="light" color="amber">
                    <IconCalendarEvent size={18} />
                  </ThemeIcon>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={600} size="sm" c="slate.0" truncate>
                      {currentEvent.name}
                    </Text>
                    <Text size="xs" c="slate.4" mt={2}>
                      {currentEvent.season} season
                      {currentEvent.startDate ? ` · ${formatDateRange(currentEvent.startDate, currentEvent.endDate)}` : ''}
                    </Text>
                  </Box>
                  <Select
                    aria-label="Change event"
                    value={currentEventId}
                    onChange={(value) => {
                      if (!value) {
                        clearCurrentEvent()
                        return
                      }
                      const selectedEvent = events.find((e) => e.id === value)
                      if (selectedEvent) {
                        setCurrentEvent(selectedEvent.id, selectedEvent.season)
                      }
                    }}
                    data={events.map((event) => ({
                      value: event.id,
                      label: `${event.name} (${event.season})`,
                    }))}
                    size="sm"
                    w={240}
                    clearable
                    onClear={clearCurrentEvent}
                  />
                  <Button variant="subtle" color="slate" size="sm" onClick={clearCurrentEvent}>
                    Clear active event
                  </Button>
                </Group>
              )}
            </Box>
          </Stack>

          <HubWifiSummary />

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
                      : 'Collected on this laptop.'}
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
                to="/sync?tab=wifi"
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

              <Button
                component={Link}
                to="/entries"
                size="md"
                variant="default"
                leftSection={<IconClipboardCheck size={18} />}
              >
                Review observations
              </Button>
            </SimpleGrid>
          </Stack>
        </Stack>
      </Box>
    )
  }

  // Scout view: one clear next step, and a plain answer to "did my scouting get to the lead scout?"
  return (
    <Box className="container-wide">
      <Stack gap="lg" maw={680} mx="auto">
        <Group justify="space-between" align="flex-start" wrap="nowrap" className="animate-fadeInUp">
          <Box>
            <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
              {brand.name} Scout Mode
            </Title>
            <Text size="sm" c="slate.3" mt={4}>
              Watch a match, record what you see, then send it to the lead scout.
            </Text>
          </Box>

          <RouteHelpModal
            title="Scout home"
            description="This screen always shows the next thing to do."
            steps={[
              { title: 'Get the form', description: 'The lead scout gives it to you once, over Wi-Fi or with QR codes.' },
              { title: 'Scout a match', description: 'Pick the match and team, then answer the questions as it happens.' },
              { title: 'Send your scouting', description: 'After a few matches, send your entries to the lead scout.' },
            ]}
            tips={[
              { text: 'Everything you record is saved on this laptop straight away, even with no Wi-Fi.' },
              { text: 'Sending the same entries twice is safe.' },
            ]}
            tooltipLabel="What to do here"
            color="frc-blue"
          />
        </Group>

        <Box className="home-next-step animate-fadeInUp stagger-1" data-tour="home-event">
          <Group gap="md" wrap="nowrap" align="flex-start">
            <ThemeIcon size={44} radius="md" variant="default">
              {hasActiveForm ? <IconClipboardCheck size={22} /> : <IconFileDownload size={22} />}
            </ThemeIcon>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} c="slate.0" size="lg">
                {hasActiveForm ? 'Scout a match' : 'First, get the scouting form'}
              </Text>
              <Text size="sm" c="slate.3" mt={2}>
                {hasActiveForm
                  ? 'Pick the match and the team, then answer the questions as it happens.'
                  : 'The lead scout has it. You get it once, over Wi-Fi or by scanning their QR codes.'}
              </Text>
            </Box>
          </Group>
          <Button
            component={Link}
            to={hasActiveForm ? '/scout' : '/sync?tab=wifi'}
            size="lg"
            fullWidth
            mt="md"
            leftSection={hasActiveForm ? <IconClipboardCheck size={20} /> : <IconFileDownload size={20} />}
          >
            {hasActiveForm ? 'Scout a match' : 'Get the scouting form'}
          </Button>
        </Box>

        {observationCount > 0 && (
          <Box className="home-next-step animate-fadeInUp stagger-2">
            <Group gap="md" wrap="nowrap" align="flex-start">
              <ThemeIcon size={44} radius="md" variant="default">
                {unsentCount === 0 ? <IconCheck size={22} /> : <IconCloudUpload size={22} />}
              </ThemeIcon>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} c="slate.0" size="lg">
                  {unsentCount === 0
                    ? 'The lead scout has all your scouting'
                    : `${unsentCount.toLocaleString()} ${unsentCount === 1 ? 'entry has' : 'entries have'} not been sent yet`}
                </Text>
                <Text size="sm" c="slate.3" mt={2}>
                  {lastSent
                    ? `Last sent ${new Date(lastSent.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ${describeMethod(lastSent.method)}.`
                    : 'You have not sent anything to the lead scout yet.'}{' '}
                  {unsentCount > 0 ? 'Send after every few matches so nothing piles up.' : ''}
                </Text>
              </Box>
            </Group>
            <Group mt="md" grow>
              <Button
                component={Link}
                to="/sync?tab=wifi"
                variant={unsentCount > 0 ? 'filled' : 'default'}
                leftSection={<IconCloudUpload size={18} />}
              >
                {unsentCount > 0 ? 'Send to the lead scout' : 'Send again'}
              </Button>
              <Button component={Link} to="/entries" variant="default" leftSection={<IconClipboardCheck size={18} />}>
                Review my entries
              </Button>
            </Group>
          </Box>
        )}

        <Box className="home-next-step animate-fadeInUp stagger-3">
          <Group gap="sm" mb="xs" wrap="nowrap">
            <ThemeIcon size={28} radius="md" variant="default">
              <IconCalendarEvent size={14} />
            </ThemeIcon>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" c="slate.4">
                Current event
              </Text>
              <Text fw={600} size="sm" c={currentEvent ? 'slate.1' : 'slate.4'} truncate>
                {currentEvent ? currentEvent.name : 'No event selected'}
              </Text>
            </Box>
          </Group>
          <Select
            placeholder={events.length > 0 ? 'Choose an event' : 'The lead scout will send the event'}
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
            disabled={events.length === 0}
          />
        </Box>

        <Button component={Link} to="/help" variant="subtle" color="slate" leftSection={<IconBook size={16} />} style={{ alignSelf: 'center' }}>
          New here? Read the how-to guide
        </Button>
      </Stack>
    </Box>
  )
}
