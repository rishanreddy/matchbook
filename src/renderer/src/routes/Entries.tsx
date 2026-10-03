import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notify } from '../lib/utils/notify'
import { IconAlertTriangle, IconClipboardCheck, IconEyeOff, IconSearch, IconTrash } from '@tabler/icons-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ScoutingDataDocType } from '../lib/db/schemas/scoutingData.schema'
import type { EventDocType } from '../lib/db/schemas/events.schema'
import {
  ALL_EVENTS,
  chooseInitialEventFilter,
  entriesWithNoEvent,
  eventDisplayName,
  summarizeHidden,
  tallyByEvent,
} from '../features/entries/entryVisibility'
import { fileEntriesUnderEvent } from '../features/entries/entryService'
import { useRoster } from '../features/roster/useRoster'
import { useDatabaseStore } from '../stores/useDatabase'
import { useDeviceStore, useIsHub } from '../stores/useDeviceStore'
import { useEventStore } from '../stores/useEventStore'
import { handleError } from '../lib/utils/errorHandler'
import { rememberScoutingDeletion } from '../lib/utils/scoutingDeletion'

const MAX_VISIBLE_ENTRIES = 250

function formatRecordedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) {
    return 'Recorded at an unknown time'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function Entries(): ReactElement {
  const [searchParams] = useSearchParams()
  const db = useDatabaseStore((state) => state.db)
  const isHub = useIsHub()
  const deviceId = useDeviceStore((state) => state.deviceId)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const [entries, setEntries] = useState<ScoutingDataDocType[]>([])
  const [events, setEvents] = useState<EventDocType[]>([])
  // null means "choose for me": the event this laptop is on, or everything when that has no entries.
  const [chosenEvent, setChosenEvent] = useState<string | null>(searchParams.get('event'))
  const [teamFilter, setTeamFilter] = useState(searchParams.get('team') ?? '')
  const [entryPendingDeletion, setEntryPendingDeletion] = useState<ScoutingDataDocType | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmingFiling, setConfirmingFiling] = useState(false)
  const [isFiling, setIsFiling] = useState(false)
  const { roster } = useRoster(db)

  useEffect(() => {
    if (!db) {
      setEntries([])
      return
    }

    const subscription = db.collections.scoutingData.find().$.subscribe({
      next: (docs) => setEntries(docs.map((doc) => doc.toJSON())),
      error: (error: unknown) => handleError(error, 'Watch scouting entries'),
    })

    return () => subscription.unsubscribe()
  }, [db])

  useEffect(() => {
    if (!db) {
      setEvents([])
      return
    }

    const subscription = db.collections.events.find().$.subscribe({
      next: (docs) => setEvents(docs.map((doc) => doc.toJSON())),
      error: (error: unknown) => handleError(error, 'Watch imported events'),
    })

    return () => subscription.unsubscribe()
  }, [db])

  const eventNames = useMemo(() => new Map(events.map((event) => [event.id, event.name])), [events])
  const scoutByDevice = useMemo(
    () => new Map(roster.filter((scout) => scout.deviceId !== '' && scout.status !== 'removed').map((scout) => [scout.deviceId, scout.name])),
    [roster],
  )

  // Everything this laptop is allowed to show: all of it on the lead scout's laptop, only its own on a scout's.
  const reviewable = useMemo(
    () => entries.filter((entry) => isHub || (deviceId !== null && entry.deviceId === deviceId)),
    [deviceId, entries, isHub],
  )
  const tally = useMemo(() => tallyByEvent(reviewable, eventNames, currentEventId), [currentEventId, eventNames, reviewable])
  const eventFilter = chooseInitialEventFilter(chosenEvent, currentEventId, tally)

  const filteredEntries = useMemo(
    () =>
      reviewable
        .filter((entry) => eventFilter === ALL_EVENTS || entry.eventId === eventFilter)
        .filter((entry) => teamFilter.trim() === '' || String(entry.teamNumber).includes(teamFilter.trim()))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [eventFilter, reviewable, teamFilter],
  )
  const visibleEntries = filteredEntries.slice(0, MAX_VISIBLE_ENTRIES)
  const hidden = useMemo(() => summarizeHidden(reviewable, eventFilter, teamFilter, eventNames), [eventFilter, eventNames, reviewable, teamFilter])
  const withNoEvent = useMemo(() => entriesWithNoEvent(reviewable), [reviewable])
  const currentEventName = currentEventId ? eventNames.get(currentEventId) : undefined

  const eventOptions = [
    { value: ALL_EVENTS, label: isHub ? 'All events' : 'All of my events' },
    ...Array.from(new Set([...events.map((event) => event.id), ...tally.map((item) => item.eventId)])).map((eventId) => ({
      value: eventId,
      label: eventDisplayName(eventId, eventNames),
    })),
  ]

  const scoutLabel = (entryDeviceId: string): string => scoutByDevice.get(entryDeviceId) ?? entryDeviceId

  const handleFileUnderCurrentEvent = async (): Promise<void> => {
    if (!db || !currentEventId) {
      return
    }

    setIsFiling(true)
    try {
      const moved = await fileEntriesUnderEvent(db, withNoEvent.map((entry) => entry.id), currentEventId)
      notify({
        color: 'green',
        title: 'Entries filed',
        message: `${moved} ${moved === 1 ? 'entry is' : 'entries are'} now under ${currentEventName ?? currentEventId} and will count in its Analysis.`,
      })
      setConfirmingFiling(false)
    } catch (error: unknown) {
      handleError(error, 'File entries under the current event')
    } finally {
      setIsFiling(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!db || !entryPendingDeletion) {
      return
    }

    // Enforce ownership again at the mutation boundary; navigating directly to this
    // route must never let a scout delete another scout's record.
    if (!isHub && (!deviceId || entryPendingDeletion.deviceId !== deviceId)) {
      notify({
        color: 'red',
        title: 'Cannot remove this entry',
        message: 'Scout laptops can only remove entries created on this device.',
      })
      setEntryPendingDeletion(null)
      return
    }

    setIsDeleting(true)
    try {
      const document = await db.collections.scoutingData.findOne(entryPendingDeletion.id).exec()
      if (!document) {
        notify({ color: 'yellow', title: 'Entry already removed', message: 'That observation is no longer stored here.' })
      } else {
        await document.remove()
        const deletionQueued = rememberScoutingDeletion(entryPendingDeletion.id)
        notify({
          color: deletionQueued ? 'green' : 'yellow',
          title: 'Observation removed',
          message: deletionQueued
            ? isHub
              ? 'The lead scout’s laptop will keep this correction even if an old copy is sent again.'
              : 'The removal will be sent to the lead scout the next time you send your entries.'
            : 'Removed from this laptop, but the sync correction could not be queued. Keep this app open and try again.',
        })
      }
      setEntryPendingDeletion(null)
    } catch (error: unknown) {
      handleError(error, 'Remove scouting observation')
    } finally {
      setIsDeleting(false)
    }
  }

  const entryLabel = entryPendingDeletion
    ? `Match ${entryPendingDeletion.matchNumber}, Team ${entryPendingDeletion.teamNumber}`
    : 'this observation'

  return (
    <Box className="container-wide">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Box>
            <Title order={1} c="slate.0" className="text-[32px] font-bold">
              {isHub ? 'Review observations' : 'Your observations'}
            </Title>
            <Text c="slate.4" mt="xs" maw={620}>
              {isHub
                ? 'Review every entry scouts have sent to this laptop, plus anything scouted on it, and remove one that should not count in the analysis.'
                : 'Review entries saved on this laptop. Remove a mistake before or after you send it to the lead scout.'}
            </Text>
          </Box>
          {searchParams.get('team') ? <Button component={Link} to="/analysis" variant="default">Back to Analysis</Button> : <ThemeIcon size={42} radius="md" variant="light" color="frc-blue">
            <IconClipboardCheck size={21} />
          </ThemeIcon>}
        </Group>

        <Alert color="blue" variant="light" title={isHub ? 'Hub corrections persist' : 'Corrections sync to the hub'}>
          {isHub
            ? 'When you remove an entry, this laptop remembers it. If a scout sends an old copy later, it is ignored.'
            : 'Removing an entry also queues a deletion for your next data sync. Send data after correcting an entry.'}
        </Alert>

        <Card p="lg" radius="lg" className="surface-card" data-tour="entries-filter">
          <Group justify="space-between" align="end" wrap="wrap">
            <Box>
              <Text fw={600} c="slate.1">
                Filter entries
              </Text>
              <Text size="sm" c="slate.4" mt={2}>
                {visibleEntries.length === 1 ? '1 entry shown' : `${visibleEntries.length} entries shown`}
                {filteredEntries.length > MAX_VISIBLE_ENTRIES ? ` of ${filteredEntries.length}, newest ${MAX_VISIBLE_ENTRIES} only` : ''}
                {hidden.hidden > 0 ? ` of ${filteredEntries.length + hidden.hidden} in all` : ''}
              </Text>
              {!isHub ? (
                <Text size="xs" c="slate.4" mt={2}>
                  This laptop shows the entries scouted on it. The lead scout’s laptop shows everyone’s.
                </Text>
              ) : null}
            </Box>
            <Group align="end" gap="sm">
            <TextInput label="Find a team" placeholder="Team number" leftSection={<IconSearch size={15} />} value={teamFilter} onChange={(event) => setTeamFilter(event.currentTarget.value)} w={180} />
            <Select
              label="Event"
              aria-label="Filter observations by event"
              value={eventFilter}
              onChange={(value) => setChosenEvent(value ?? ALL_EVENTS)}
              allowDeselect={false}
              data={eventOptions}
              w={280}
              searchable
            />
            </Group>
          </Group>
        </Card>

        {hidden.hidden > 0 ? (
          <Alert
            color="yellow"
            variant="light"
            icon={<IconEyeOff size={18} />}
            title={`${filteredEntries.length} of ${filteredEntries.length + hidden.hidden} entries shown`}
          >
            <Group justify="space-between" align="center" gap="md">
              <Text size="sm" maw={640}>
                {hidden.hidden === 1 ? '1 more entry is' : `${hidden.hidden} more entries are`} filed under another event, so the filter is hiding{' '}
                {hidden.hidden === 1 ? 'it' : 'them'}: {hidden.where.map((item) => `${item.label} (${item.count})`).join(', ')}.
              </Text>
              <Button size="xs" variant="default" onClick={() => setChosenEvent(ALL_EVENTS)}>
                Show all events
              </Button>
            </Group>
          </Alert>
        ) : null}

        {isHub && withNoEvent.length > 0 && currentEventId && currentEventName ? (
          <Alert color="blue" variant="light" title={`${withNoEvent.length} ${withNoEvent.length === 1 ? 'entry was' : 'entries were'} saved with no event`}>
            <Group justify="space-between" align="center" gap="md">
              <Text size="sm" maw={640}>
                A scout laptop that has no event selected files its entries under “No event selected”, so {withNoEvent.length === 1 ? 'it does' : 'they do'} not count
                in Analysis for {currentEventName}. If {withNoEvent.length === 1 ? 'this was' : 'these were'} scouted at {currentEventName}, file{' '}
                {withNoEvent.length === 1 ? 'it' : 'them'} there.
              </Text>
              <Button size="xs" onClick={() => setConfirmingFiling(true)}>
                File under {currentEventName}
              </Button>
            </Group>
          </Alert>
        ) : null}

        {visibleEntries.length === 0 ? (
          <Card p="xl" radius="lg" className="surface-card">
            <Stack align="center" gap="sm" py="md">
              <ThemeIcon size={44} radius="xl" variant="light" color="slate">
                <IconClipboardCheck size={22} />
              </ThemeIcon>
              <Text fw={600} c="slate.1">
                No observations to review
              </Text>
              <Text size="sm" c="slate.4" ta="center">
                {isHub ? 'Received scout data will appear here.' : 'Entries you save on this laptop will appear here.'}
              </Text>
              {hidden.hidden > 0 ? (
                <Button size="xs" variant="default" onClick={() => setChosenEvent(ALL_EVENTS)}>
                  Show the {hidden.hidden} {hidden.hidden === 1 ? 'entry' : 'entries'} under other events
                </Button>
              ) : null}
            </Stack>
          </Card>
        ) : (
          <Stack gap="sm">
            {visibleEntries.map((entry) => (
              <Card key={entry.id} p="md" radius="md" className="surface-card">
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ThemeIcon size={34} radius="md" variant="light" color="slate">
                      <IconClipboardCheck size={17} />
                    </ThemeIcon>
                    <Box style={{ minWidth: 0 }}>
                      <Group gap="xs" wrap="wrap">
                        <Text fw={650} c="slate.1">
                          Match {entry.matchNumber} · Team {entry.teamNumber}
                        </Text>
                        <Badge size="sm" variant="light" color="frc-blue">
                          {entry.eventId === 'none' ? 'No event' : eventDisplayName(entry.eventId, eventNames)}
                        </Badge>
                      </Group>
                      <Text size="xs" c="slate.4" mt={3}>
                        {formatRecordedAt(entry.createdAt)}
                        {isHub ? ` · ${scoutLabel(entry.deviceId)}` : ''}
                      </Text>
                    </Box>
                  </Group>
                  <Tooltip label={`Remove Match ${entry.matchNumber}, Team ${entry.teamNumber}`}>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      size="lg"
                      onClick={() => setEntryPendingDeletion(entry)}
                      aria-label={`Remove Match ${entry.matchNumber}, Team ${entry.teamNumber}`}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={entryPendingDeletion !== null}
        onClose={() => {
          if (!isDeleting) {
            setEntryPendingDeletion(null)
          }
        }}
        title="Remove observation?"
        centered
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            {entryLabel} will be removed from this laptop. This cannot be undone.
          </Alert>
          <Text size="sm" c="slate.3">
            {isHub
              ? 'This laptop will remember the removal, so an older copy cannot bring it back.'
              : 'The removal will be sent to the lead scout the next time you send your entries.'}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEntryPendingDeletion(null)} disabled={isDeleting}>
              Keep entry
            </Button>
            <Button color="red" loading={isDeleting} onClick={() => void handleDelete()} leftSection={<IconTrash size={16} />}>
              Remove entry
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={confirmingFiling} onClose={() => (isFiling ? undefined : setConfirmingFiling(false))} title="File these entries under your event?" centered>
        <Stack gap="md">
          <Text size="sm">
            {withNoEvent.length} {withNoEvent.length === 1 ? 'entry' : 'entries'} will be filed under {currentEventName ?? 'this event'}. They will then show in Review
            Entries and count in Analysis for it.
          </Text>
          <Text size="sm" c="slate.3">
            Only do this if they were scouted at {currentEventName ?? 'this event'}. To avoid it next time, have scouts press Get form, schedule and matches in Sync Data so their laptops
            start on your event.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmingFiling(false)} disabled={isFiling}>
              Cancel
            </Button>
            <Button loading={isFiling} onClick={() => void handleFileUnderCurrentEvent()}>
              File them
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
