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
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconClipboardCheck, IconTrash } from '@tabler/icons-react'
import type { ScoutingDataDocType } from '../lib/db/schemas/scoutingData.schema'
import type { EventDocType } from '../lib/db/schemas/events.schema'
import { useDatabaseStore } from '../stores/useDatabase'
import { useDeviceStore, useIsHub } from '../stores/useDeviceStore'
import { useEventStore } from '../stores/useEventStore'
import { handleError } from '../lib/utils/errorHandler'
import { rememberScoutingDeletion } from '../lib/utils/scoutingDeletion'

const ALL_EVENTS = 'all'
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
  const db = useDatabaseStore((state) => state.db)
  const isHub = useIsHub()
  const deviceId = useDeviceStore((state) => state.deviceId)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const [entries, setEntries] = useState<ScoutingDataDocType[]>([])
  const [events, setEvents] = useState<EventDocType[]>([])
  const [eventFilter, setEventFilter] = useState<string>(currentEventId ?? ALL_EVENTS)
  const [entryPendingDeletion, setEntryPendingDeletion] = useState<ScoutingDataDocType | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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
  const availableEventIds = useMemo(
    () => Array.from(new Set(entries.filter((entry) => isHub || entry.deviceId === deviceId).map((entry) => entry.eventId))),
    [deviceId, entries, isHub],
  )

  const visibleEntries = useMemo(
    () =>
      entries
        .filter((entry) => isHub || (deviceId !== null && entry.deviceId === deviceId))
        .filter((entry) => eventFilter === ALL_EVENTS || entry.eventId === eventFilter)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, MAX_VISIBLE_ENTRIES),
    [deviceId, entries, eventFilter, isHub],
  )

  const eventOptions = [
    { value: ALL_EVENTS, label: isHub ? 'All events' : 'All of my events' },
    ...availableEventIds.map((eventId) => ({
      value: eventId,
      label: eventNames.get(eventId) ?? (eventId === 'none' ? 'No event selected' : eventId),
    })),
  ]

  const handleDelete = async (): Promise<void> => {
    if (!db || !entryPendingDeletion) {
      return
    }

    // Enforce ownership again at the mutation boundary; navigating directly to this
    // route must never let a scout delete another scout's record.
    if (!isHub && (!deviceId || entryPendingDeletion.deviceId !== deviceId)) {
      notifications.show({
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
        notifications.show({ color: 'yellow', title: 'Entry already removed', message: 'That observation is no longer stored here.' })
      } else {
        await document.remove()
        const deletionQueued = rememberScoutingDeletion(entryPendingDeletion.id)
        notifications.show({
          color: deletionQueued ? 'green' : 'yellow',
          title: 'Observation removed',
          message: deletionQueued
            ? isHub
              ? 'The hub will keep this correction even if an old scout copy uploads again.'
              : 'The removal will be sent to the hub the next time you send data.'
            : 'Removed from this laptop, but the sync correction could not be queued. Keep this app open and retry from the hub if needed.',
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
    <Box className="container-wide" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Box>
            <Title order={1} c="slate.0" className="text-[32px] font-bold">
              {isHub ? 'Review observations' : 'Your observations'}
            </Title>
            <Text c="slate.4" mt="xs" maw={620}>
              {isHub
                ? 'Review every observation received by this hub and remove an entry that should not influence analysis.'
                : 'Review entries saved on this laptop. Remove a mistake before or after you send it to the hub.'}
            </Text>
          </Box>
          <ThemeIcon size={42} radius="md" variant="light" color="frc-blue">
            <IconClipboardCheck size={21} />
          </ThemeIcon>
        </Group>

        <Alert color="blue" variant="light" title={isHub ? 'Hub corrections persist' : 'Corrections sync to the hub'}>
          {isHub
            ? 'When you remove an observation, this hub remembers the removal and rejects a stale copy if a scout uploads it later.'
            : 'Removing an entry also queues a deletion for your next data sync. Send data after correcting an entry.'}
        </Alert>

        <Card p="lg" radius="lg" className="surface-card">
          <Group justify="space-between" align="end" wrap="wrap">
            <Box>
              <Text fw={600} c="slate.1">
                Filter entries
              </Text>
              <Text size="sm" c="slate.4" mt={2}>
                {visibleEntries.length === 1 ? '1 entry shown' : `${visibleEntries.length} entries shown`}
                {entries.length > MAX_VISIBLE_ENTRIES ? ` · newest ${MAX_VISIBLE_ENTRIES} only` : ''}
              </Text>
            </Box>
            <Select
              aria-label="Filter observations by event"
              value={eventFilter}
              onChange={(value) => setEventFilter(value ?? ALL_EVENTS)}
              data={eventOptions}
              w={280}
              searchable
            />
          </Group>
        </Card>

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
                          {eventNames.get(entry.eventId) ?? (entry.eventId === 'none' ? 'No event' : entry.eventId)}
                        </Badge>
                      </Group>
                      <Text size="xs" c="slate.4" mt={3}>
                        {formatRecordedAt(entry.createdAt)}
                        {isHub ? ` · ${entry.deviceId}` : ''}
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
              ? 'This hub will remember the removal so an older upload cannot recreate it.'
              : 'The removal will be included the next time you send data to the hub.'}
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
    </Box>
  )
}
