import type { ReactElement } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Box, Button, Card, Group, Loader, Select, Stack, Tabs, Text, ThemeIcon, Title } from '@mantine/core'
import { IconCalendarEvent, IconClipboardCheck, IconInfoCircle, IconUser, IconUsers } from '@tabler/icons-react'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { ByScoutView } from '../features/assignments/ByScoutView'
import { PlanPanel } from '../features/assignments/PlanPanel'
import { RosterPanel } from '../features/assignments/RosterPanel'
import { ScheduleGrid } from '../features/assignments/ScheduleGrid'
import { countLoads, findDoubleBookings, planAssignments, type CurrentAssignment, type Plan, type PlanOptions, type Position } from '../features/assignments/assign'
import { releaseAll, setSlot, writeAssignments } from '../features/assignments/assignmentService'
import { buildRows, toCsvRows } from '../features/assignments/rows'
import { useAssignmentsData, useEvents } from '../features/assignments/useAssignmentsData'
import { addScout, isAvailable, isListed, renameScout, setScoutStatus } from '../features/roster/rosterService'
import { toCsv } from '../features/sync/csv'
import type { MatchDocType } from '../lib/db/schemas/matches.schema'
import type { RosterStatus } from '../lib/db/schemas/roster.schema'
import { downloadTextFile } from '../lib/utils/download'
import { handleError } from '../lib/utils/errorHandler'
import { notify } from '../lib/utils/notify'
import { useDatabaseStore } from '../stores/useDatabase'
import { useEventStore } from '../stores/useEventStore'
import { useWifiHub } from '../stores/useWifiHub'

export function Assignments(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const hubReceiving = useWifiHub((state) => state.status?.running ?? false)
  const [chosenEvent, setChosenEvent] = useState<string | null>(null)

  const { events, loaded: eventsLoaded } = useEvents(db)
  // Start on the event this laptop is on, or the newest one, until the lead scout picks another.
  const eventKey = events.some((event) => event.id === chosenEvent)
    ? chosenEvent
    : (events.find((event) => event.id === currentEventId)?.id ?? events[0]?.id ?? null)

  const { matches, planMatches, assignments, scoutBySlot, coverage, roster, loaded } = useAssignmentsData(db, eventKey)
  const eventName = events.find((event) => event.id === eventKey)?.name ?? eventKey ?? ''
  const listed = useMemo(() => roster.filter(isListed), [roster])
  const availableScouts = useMemo(() => listed.filter(isAvailable), [listed])

  const current = useMemo<CurrentAssignment[]>(
    () => assignments.map((assignment) => ({ matchKey: assignment.matchKey, position: assignment.alliancePosition, scoutId: assignment.scoutId })),
    [assignments],
  )
  const loads = useMemo(() => countLoads(listed, current), [current, listed])
  const doubles = useMemo(() => findDoubleBookings(current), [current])
  const rows = useMemo(() => buildRows(planMatches, scoutBySlot, roster, coverage.statuses), [coverage.statuses, planMatches, roster, scoutBySlot])

  const buildPlan = useCallback(
    (mode: 'fill' | 'rebuild'): Plan => {
      const options: PlanOptions = {
        mode,
        isScouted: (match, position) => coverage.statuses.get(`${match.key}:${position}`) === 'received',
      }
      return planAssignments(planMatches, roster, current, options)
    },
    [coverage.statuses, current, planMatches, roster],
  )

  const guard = async (action: () => Promise<void>, context: string): Promise<void> => {
    try {
      await action()
    } catch (error: unknown) {
      handleError(error, context)
    }
  }

  const handleAdd = async (name: string): Promise<void> => {
    if (!db) {
      return
    }

    const scout = await addScout(db, name)
    notify({ color: 'green', title: 'Scout added', message: `${scout.name} is on the roster.` })
  }

  const handleRename = async (id: string, name: string): Promise<void> => {
    if (db) {
      await renameScout(db, id, name)
    }
  }

  const handleStatus = async (id: string, status: RosterStatus): Promise<void> => {
    if (!db) {
      return
    }

    await guard(async () => {
      await setScoutStatus(db, id, status)
      const name = roster.find((scout) => scout.id === id)?.name ?? 'The scout'
      if (status === 'away') {
        notify({ color: 'blue', title: `${name} is away`, message: 'Press Fill open stations to give their matches to someone else.' })
      } else if (status === 'removed') {
        notify({ color: 'blue', title: `${name} was removed`, message: 'Press Fill open stations to give their matches to someone else.' })
      }
    }, 'Update the roster')
  }

  const handleApply = async (plan: Plan, label: string): Promise<void> => {
    if (!db || !eventKey) {
      return
    }

    await guard(async () => {
      const written = await writeAssignments(db, eventKey, plan.changes, roster, assignments)
      notify({
        color: 'green',
        title: label,
        message: `${written.toLocaleString()} ${written === 1 ? 'station' : 'stations'} updated. Scouts get their matches the next time they press Get form, schedule and matches in Sync Data.`,
      })
    }, 'Assign scouts')
  }

  const handleClearAll = async (): Promise<void> => {
    if (!db || !eventKey) {
      return
    }

    await guard(async () => {
      const cleared = await releaseAll(db, eventKey)
      notify({ color: 'blue', title: 'Assignments cleared', message: `${cleared.toLocaleString()} ${cleared === 1 ? 'station is' : 'stations are'} open again.` })
    }, 'Clear assignments')
  }

  const handleAssign = (match: MatchDocType, position: Position, scoutId: string | null): void => {
    if (!db || !eventKey) {
      return
    }

    const scout = scoutId ? (roster.find((candidate) => candidate.id === scoutId) ?? null) : null
    void guard(() => setSlot(db, { eventKey, match, position, scout }), 'Assign a scout')
  }

  const handleDownload = (): void => {
    if (!eventKey) {
      return
    }

    downloadTextFile(toCsv(toCsvRows(rows)), `scout-assignments-${eventKey}.csv`, 'text/csv')
    notify({ color: 'green', title: 'Spreadsheet saved', message: 'Choose where to keep it in the window that opened.' })
  }

  return (
    <Box className="container-wide">
      <Stack gap="lg">
        <Card
          p="lg"
          radius="lg"
          style={{ background: 'linear-gradient(135deg, rgba(154, 166, 182, 0.08), rgba(154, 166, 182, 0.03))', border: '1px solid rgba(154, 166, 182, 0.2)' }}
        >
          <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
            <Group gap="md" align="center" wrap="nowrap">
              <ThemeIcon size={52} radius="xl" variant="light">
                <IconClipboardCheck size={24} stroke={1.6} />
              </ThemeIcon>
              <Box>
                <Title order={1} c="slate.0" data-tour="assignments-overview" style={{ fontSize: 28, fontWeight: 700 }}>
                  Scout Assignments
                </Title>
                <Text size="sm" c="slate.4">
                  Decide who watches which robot in every match
                </Text>
              </Box>
            </Group>
            <RouteHelpModal
              title="Assignment Workflow"
              description="Add your scouts, let Matchbook share the matches fairly, then adjust anything by hand."
              steps={[
                { title: 'Add your scouts', description: 'Type their names, or let scouts appear when they send their entries or press Get form, schedule and matches.' },
                { title: 'Fill open stations', description: 'Matchbook gives every match six scouts, taking turns so nobody works much more than anyone else.' },
                { title: 'Share it', description: 'Scouts press Get form, schedule and matches in Sync Data and see their next match on the Scout screen.' },
              ]}
              tips={[
                { text: 'Mark a scout away and fill again to hand their matches that nobody has scouted yet to someone else.' },
                { text: 'With fewer than six scouts, the robots watched least are covered first.' },
                { text: 'A dot beside each station shows whether its entry has arrived.' },
              ]}
              tooltipLabel="How assignments work"
              color="frc-blue"
            />
          </Group>
        </Card>

        {!eventsLoaded ? (
          <Card p="xl" radius="lg" className="surface-card">
            <Group justify="center" py="xl" gap="sm">
              <Loader size="sm" color="frc-blue" />
              <Text c="slate.4" size="sm">
                Loading…
              </Text>
            </Group>
          </Card>
        ) : events.length === 0 ? (
          <Card p="xl" radius="lg" className="surface-card">
            <Group gap="md" align="center" wrap="wrap">
              <ThemeIcon size={38} radius="md" variant="light" color="frc-orange">
                <IconCalendarEvent size={18} />
              </ThemeIcon>
              <Text c="slate.3" style={{ flex: '1 1 260px' }}>
                No events yet. Import your event first so Matchbook knows the match schedule.
              </Text>
              <Button component={Link} to="/events" variant="default">
                Open Events
              </Button>
            </Group>
          </Card>
        ) : (
          <>
            <Card p="lg" radius="lg" className="surface-card">
              <Stack gap="md">
                <Select
                  label="Event"
                  description="Assignments are made for this event’s qualification matches"
                  value={eventKey}
                  onChange={setChosenEvent}
                  data={events.map((event) => ({ value: event.id, label: `${event.name} (${event.id})` }))}
                  searchable
                  allowDeselect={false}
                />
                <Group gap="xs" wrap="wrap">
                  <Badge color="frc-blue" variant="light" radius="md" leftSection={<IconCalendarEvent size={12} />}>
                    {matches.length} {matches.length === 1 ? 'match' : 'matches'}
                  </Badge>
                  <Badge color="frc-orange" variant="light" radius="md" leftSection={<IconUsers size={12} />}>
                    {availableScouts.length} {availableScouts.length === 1 ? 'scout' : 'scouts'} available
                  </Badge>
                  <Badge color="green" variant="light" radius="md" leftSection={<IconUser size={12} />}>
                    {coverage.covered} of {coverage.total} stations covered
                  </Badge>
                </Group>
              </Stack>
            </Card>

            <RosterPanel roster={roster} loads={loads} onAdd={handleAdd} onRename={handleRename} onSetStatus={handleStatus} />

            {matches.length > 0 ? (
              <>
                <PlanPanel
                  matchCount={matches.length}
                  coverage={coverage}
                  availableScouts={availableScouts.length}
                  roster={roster}
                  buildPlan={buildPlan}
                  onApply={handleApply}
                  onClearAll={handleClearAll}
                  onDownload={handleDownload}
                />

                <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} title="How scouts get their matches">
                  <Group justify="space-between" align="center" gap="md">
                    <Text size="sm" maw={680}>
                      Scouts open Scout Match on their own laptop and press Get latest. A scout you added by name picks their name there the first time, and after that their next match
                      shows at the top. With QR codes or a file, scouts use Get form, schedule and matches in Sync Data instead.
                      {coverage.assigned > 0 && !hubReceiving ? ' Wi-Fi receiving is off on this laptop, so scouts cannot fetch it over Wi-Fi yet.' : ''}
                    </Text>
                    <Button component={Link} to="/sync?tab=wifi" size="xs" variant="default">
                      Open Sync Data
                    </Button>
                  </Group>
                </Alert>

                <Tabs defaultValue="schedule" keepMounted={false}>
                  <Tabs.List>
                    <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
                    <Tabs.Tab value="scouts">By scout</Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="schedule" pt="md">
                    <ScheduleGrid matches={matches} scoutBySlot={scoutBySlot} roster={roster} statuses={coverage.statuses} doubles={doubles} onAssign={handleAssign} />
                  </Tabs.Panel>
                  <Tabs.Panel value="scouts" pt="md">
                    <ByScoutView rows={rows} roster={roster} />
                  </Tabs.Panel>
                </Tabs>
              </>
            ) : loaded ? (
              <Card p="xl" radius="lg" className="surface-card">
                <Group gap="md" align="center" wrap="wrap">
                  <ThemeIcon size={38} radius="md" variant="light" color="frc-orange">
                    <IconCalendarEvent size={18} />
                  </ThemeIcon>
                  <Text c="slate.3" style={{ flex: '1 1 260px' }}>
                    {eventName} has no qualification matches on this laptop yet. Import its schedule on the Events page, then come back to assign scouts.
                  </Text>
                  <Button component={Link} to="/events" variant="default">
                    Open Events
                  </Button>
                </Group>
              </Card>
            ) : null}
          </>
        )}
      </Stack>
    </Box>
  )
}
