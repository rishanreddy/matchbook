import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Group, Select, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { ScoutingDatabase } from '../../lib/db/collections'
import type { EventDocType } from '../../lib/db/schemas/events.schema'
import { handleError } from '../../lib/utils/errorHandler'
import { notify } from '../../lib/utils/notify'
import { refreshSetupFromHub } from '../sync/refreshSetup'
import { useEventStore } from '../../stores/useEventStore'

type NoEventNoticeProps = {
  db: ScoutingDatabase | null
}

/**
 * Shown on a laptop that has not picked an event. Entries saved without one are filed under "no
 * event", and the lead scout's Review Entries and Analysis hide those, which is how a whole
 * evening of scouting once seemed to go missing. So the choice is put in front of the scout.
 */
export function NoEventNotice({ db }: NoEventNoticeProps): ReactElement {
  const navigate = useNavigate()
  const setCurrentEvent = useEventStore((state) => state.setCurrentEvent)
  const [events, setEvents] = useState<EventDocType[]>([])
  const [choice, setChoice] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)

  useEffect(() => {
    if (!db) {
      return
    }

    const subscription = db.collections.events.find({ sort: [{ startDate: 'desc' }] }).$.subscribe({
      next: (docs) => setEvents(docs.map((doc) => doc.toJSON() as EventDocType)),
      error: (error: unknown) => handleError(error, 'Watch events'),
    })
    return () => subscription.unsubscribe()
  }, [db])

  const use = (): void => {
    const event = events.find((candidate) => candidate.id === choice)
    if (event) {
      setCurrentEvent(event.id, event.season)
      notify({ color: 'green', title: 'Event set', message: `This laptop is now on ${event.name}. New entries go under it.` })
    }
  }

  const fetchSetup = async (): Promise<void> => {
    if (!db) {
      return
    }

    setIsFetching(true)
    try {
      const outcome = await refreshSetupFromHub(db)
      if (outcome.kind === 'not-paired') {
        navigate('/sync?tab=wifi')
      } else if (outcome.kind === 'failed') {
        notify({ color: 'red', title: 'Could not reach the lead scout', message: outcome.message })
      }
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <Card p="lg" radius="lg" style={{ border: '1px solid rgba(var(--accent-rgb), 0.45)', background: 'rgba(var(--accent-rgb), 0.06)' }} role="region" aria-label="Pick an event">
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size={34} radius="md" variant="light" color="amber">
            <IconAlertTriangle size={18} />
          </ThemeIcon>
          <div>
            <Text fw={700} c="slate.0">
              Pick your event before you scout
            </Text>
            <Text size="sm" c="slate.3" mt={2}>
              Entries saved with no event are filed under “No event selected”, and the lead scout will not see them for your event. Choose the event you are scouting
              first.
            </Text>
          </div>
        </Group>

        {events.length > 0 ? (
          <Group align="flex-end" gap="sm" wrap="wrap">
            <Select
              label="Event"
              placeholder="Choose your event"
              data={events.map((event) => ({ value: event.id, label: `${event.name} (${event.season})` }))}
              value={choice}
              onChange={setChoice}
              style={{ flex: '1 1 260px' }}
              allowDeselect={false}
            />
            <Button onClick={use} disabled={choice === null}>
              Use this event
            </Button>
          </Group>
        ) : (
          <Group gap="sm" wrap="wrap">
            <Text size="sm" c="slate.3" style={{ flex: '1 1 240px' }}>
              This laptop has no events yet. Press Get form, schedule and matches and it will pick the lead scout’s event for you.
            </Text>
            <Button variant="default" onClick={() => void fetchSetup()} loading={isFetching}>
              Get form, schedule and matches
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  )
}
