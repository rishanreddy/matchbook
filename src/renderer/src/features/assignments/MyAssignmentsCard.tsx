import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Box, Button, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconCheck, IconClipboardList, IconRefresh } from '@tabler/icons-react'
import type { ScoutingDatabase } from '../../lib/db/collections'
import type { AssignmentDocType } from '../../lib/db/schemas/assignments.schema'
import type { MatchDocType } from '../../lib/db/schemas/matches.schema'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { handleError } from '../../lib/utils/errorHandler'
import { notify } from '../../lib/utils/notify'
import { useDeviceStore } from '../../stores/useDeviceStore'
import { readSavedHub } from '../sync/hubSettings'
import { refreshSetupFromHub } from '../sync/refreshSetup'
import { shareScoutName } from '../sync/wifi'
import { claimScout, isNamedAfterLaptop, scoutsForDevice, unclaimedScouts } from '../roster/rosterService'
import { useRoster } from '../roster/useRoster'
import { buildMyAssignments, type MyAssignment } from './mine'
import './assignments.css'

type MyAssignmentsCardProps = {
  db: ScoutingDatabase | null
  eventId: string
  deviceId: string | null
  /** Whether the lead scout's laptop is this one; a lead scout who does not scout does not need the card. */
  isHub: boolean
  onScout: (assignment: MyAssignment) => void
}

const COLLAPSED_ROWS = 4

export function MyAssignmentsCard({ db, eventId, deviceId, isHub, onScout }: MyAssignmentsCardProps): ReactElement | null {
  const navigate = useNavigate()
  const { roster, loaded } = useRoster(db)
  const [assignments, setAssignments] = useState<AssignmentDocType[]>([])
  const [matches, setMatches] = useState<MatchDocType[]>([])
  const [entries, setEntries] = useState<Array<{ eventId: string; deviceId: string; matchNumber: number; teamNumber: number }>>([])
  const [showAll, setShowAll] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [claiming, setClaiming] = useState<string | null>(null)
  const deviceName = useDeviceStore((state) => state.deviceName)

  useEffect(() => {
    if (!db) {
      return
    }

    const subscriptions = [
      db.collections.assignments.find({ selector: { eventKey: eventId } }).$.subscribe({
        next: (docs) => setAssignments(docs.map((doc) => doc.toJSON() as AssignmentDocType)),
        error: (error: unknown) => handleError(error, 'Watch my assignments'),
      }),
      db.collections.matches.find({ selector: { eventId, compLevel: 'qm' } }).$.subscribe({
        next: (docs) => setMatches(docs.map((doc) => doc.toJSON() as MatchDocType)),
        error: (error: unknown) => handleError(error, 'Watch the schedule'),
      }),
      db.collections.scoutingData.find({ selector: { eventId } }).$.subscribe({
        next: (docs) => setEntries(docs.map((doc) => ({ eventId: doc.eventId, deviceId: doc.deviceId, matchNumber: doc.matchNumber, teamNumber: doc.teamNumber }))),
        error: (error: unknown) => handleError(error, 'Watch my entries'),
      }),
    ]
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [db, eventId])

  const mine = useMemo(() => buildMyAssignments({ eventId, deviceId, roster, assignments, matches, entries }), [assignments, deviceId, entries, eventId, matches, roster])
  const myScouts = scoutsForDevice(roster, deviceId)
  const iAmOnTheRoster = myScouts.length > 0
  // A laptop that was never given a person's name is listed under its own name, so it can still pick one.
  const canPickAName = !iAmOnTheRoster || myScouts.every(isNamedAfterLaptop)
  const unclaimed = unclaimedScouts(roster)

  if (!db || !loaded || !deviceId) {
    return null
  }

  // A lead scout who is not scouting has nothing to show here.
  if (mine.length === 0 && !iAmOnTheRoster && isHub) {
    return null
  }

  const refresh = async (): Promise<void> => {
    if (!db) {
      return
    }

    setIsRefreshing(true)
    try {
      const outcome = await refreshSetupFromHub(db)
      if (outcome.kind === 'not-paired') {
        notify({ color: 'blue', title: 'Connect to the lead scout first', message: 'Open Sync Data and pair this laptop, then your matches can be fetched from here.' })
        navigate('/sync?tab=wifi')
      } else if (outcome.kind === 'failed') {
        notify({ color: 'red', title: 'Could not get your matches', message: outcome.message })
      } else {
        notify({ color: 'green', title: 'Up to date', message: outcome.summary })
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const claim = async (scout: RosterScoutDocType): Promise<void> => {
    setClaiming(scout.id)
    try {
      await claimScout(db, scout.id, { id: deviceId, name: deviceName ?? '' })
      const saved = readSavedHub()
      const shared = saved ? await shareScoutName(db, saved, deviceId) : false
      notify({
        color: 'green',
        title: `You are ${scout.name}`,
        message: shared ? 'The lead scout can see this laptop now.' : 'The lead scout will see this laptop the next time you send your entries.',
      })
    } catch (error: unknown) {
      handleError(error, 'Pick my name')
    } finally {
      setClaiming(null)
    }
  }

  const upcoming = mine.filter((item) => item.status !== 'done')
  const done = mine.length - upcoming.length
  const shown = showAll ? mine : upcoming.slice(0, COLLAPSED_ROWS)

  return (
    <Card p="lg" radius="lg" className="surface-card" data-tour="my-assignments">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={36} radius="md" variant="light">
              <IconClipboardList size={18} />
            </ThemeIcon>
            <Box>
              <Title order={3} size="h4" c="slate.0">
                Your matches
              </Title>
              <Text size="xs" c="slate.4">
                {mine.length === 0 ? 'None assigned yet' : `${upcoming.length} to go${done > 0 ? `, ${done} done` : ''}`}
              </Text>
            </Box>
          </Group>
          <Button variant="default" size="compact-md" leftSection={<IconRefresh size={14} />} onClick={() => void refresh()} loading={isRefreshing}>
            Get latest
          </Button>
        </Group>

        {mine.length === 0 && iAmOnTheRoster && !(canPickAName && unclaimed.length > 0) ? (
          <Text size="sm" c="slate.3">
            The lead scout has not assigned you any matches yet. When they do, press Get latest and they will show here.
          </Text>
        ) : mine.length === 0 && canPickAName && unclaimed.length > 0 ? (
          <Stack gap="xs">
            <Text size="sm" fw={600} c="slate.1">
              Which scout are you?
            </Text>
            <Text size="sm" c="slate.3">
              The lead scout added these names. Pick yours and they can give you matches.
            </Text>
            <Group gap="xs" wrap="wrap">
              {unclaimed.map((scout) => (
                <Button key={scout.id} variant="default" size="compact-md" loading={claiming === scout.id} disabled={claiming !== null} onClick={() => void claim(scout)}>
                  {scout.name}
                </Button>
              ))}
            </Group>
            <Text size="xs" c="slate.4">
              Not on the list? Add your name in Device Setup, then send your entries to the lead scout.
            </Text>
          </Stack>
        ) : mine.length === 0 ? (
          <Text size="sm" c="slate.3">
            The lead scout cannot give you matches until you are on their roster. Press Get latest to see the names they have added and pick yours, or add your name in Device Setup and send
            your entries to them.
          </Text>
        ) : (
          <Stack gap="xs">
            {shown.map((item) => (
              <div key={item.matchKey} className="my-assignment-row" data-status={item.status}>
                <Text fw={700} c="slate.0">
                  Match {item.matchNumber}
                </Text>
                <Group gap="xs" wrap="wrap">
                  <Badge color={item.position.startsWith('red') ? 'red' : 'blue'} variant="light" size="md">
                    {item.positionLabel}
                  </Badge>
                  <Text size="sm" c="slate.1">
                    Team {item.teamNumber}
                  </Text>
                  {item.status === 'next' ? (
                    <Badge color="amber" variant="filled" size="sm">
                      Up next
                    </Badge>
                  ) : null}
                </Group>
                {item.status === 'done' ? (
                  <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
                    Done
                  </Badge>
                ) : (
                  <Button size="compact-md" variant={item.status === 'next' ? 'filled' : 'default'} onClick={() => onScout(item)}>
                    Scout this match
                  </Button>
                )}
              </div>
            ))}
            {mine.length > shown.length || showAll ? (
              <Button variant="subtle" size="compact-sm" onClick={() => setShowAll((value) => !value)} style={{ alignSelf: 'flex-start' }}>
                {showAll ? 'Show fewer' : `Show all ${mine.length}`}
              </Button>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
