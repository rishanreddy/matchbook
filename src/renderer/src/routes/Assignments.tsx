import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { AssignmentDocType } from '../lib/db/schemas/assignments.schema'
import type { EventDocType } from '../lib/db/schemas/events.schema'
import type { MatchDocType } from '../lib/db/schemas/matches.schema'
import type { ScoutDocType } from '../lib/db/schemas/scouts.schema'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { getAlliancePositionLabel, getTeamFromMatch } from '../lib/utils/assignments'
import { useDatabaseStore } from '../stores/useDatabase'
import type { TBAMatch } from '../types/tba'

const ALLIANCE_POSITIONS: AssignmentDocType['alliancePosition'][] = [
  'red1',
  'red2',
  'red3',
  'blue1',
  'blue2',
  'blue3',
]

function toTBAMatch(match: MatchDocType): TBAMatch {
  return {
    key: match.key,
    comp_level: match.compLevel,
    set_number: 1,
    match_number: match.matchNumber,
    alliances: {
      red: { team_keys: match.redAlliance, score: 0 },
      blue: { team_keys: match.blueAlliance, score: 0 },
    },
  }
}

function formatTeamLabel(teamKey: string): string {
  return teamKey.replace('frc', 'Team ')
}

function getAssignmentId(matchKey: string, position: AssignmentDocType['alliancePosition']): string {
  return `${matchKey}:${position}`
}

function isConflictError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '').toUpperCase() === 'CONFLICT'
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('conflict') || message.includes('duplicate') || message.includes('already exists')
  }

  return false
}

export function Assignments(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const [events, setEvents] = useState<EventDocType[]>([])
  const [scouts, setScouts] = useState<ScoutDocType[]>([])
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [matches, setMatches] = useState<MatchDocType[]>([])
  const [assignments, setAssignments] = useState<AssignmentDocType[]>([])
  const [slotSelections, setSlotSelections] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isAssigning, setIsAssigning] = useState<boolean>(false)
  const [isAutoAssigning, setIsAutoAssigning] = useState<boolean>(false)

  const normalizeAssignmentsForEvent = useCallback(
    async (eventKey: string): Promise<AssignmentDocType[]> => {
      if (!db) {
        return []
      }

      const assignmentDocs = await db.collections.assignments.find({ selector: { eventKey } }).exec()
      const grouped = new Map<string, typeof assignmentDocs>()
      assignmentDocs.forEach((doc) => {
        const json = doc.toJSON()
        const slotKey = getAssignmentId(json.matchKey, json.alliancePosition)
        const group = grouped.get(slotKey)
        if (group) {
          group.push(doc)
        } else {
          grouped.set(slotKey, [doc])
        }
      })

      let mutated = false
      for (const [slotKey, docs] of grouped.entries()) {
        const preferred = docs
          .slice()
          .sort((a, b) => {
            const aAssigned = Date.parse(a.toJSON().assignedAt)
            const bAssigned = Date.parse(b.toJSON().assignedAt)
            if (aAssigned === bAssigned) {
              return b.primary.localeCompare(a.primary)
            }
            return bAssigned - aAssigned
          })[0]

        const preferredJson = preferred.toJSON()
        await db.collections.assignments.upsert({
          ...preferredJson,
          id: slotKey,
        })

        await Promise.all(
          docs
            .filter((doc) => doc.primary !== slotKey)
            .map(async (doc) => {
              mutated = true
              await doc.remove()
            }),
        )

        if (preferred.primary !== slotKey) {
          mutated = true
        }
      }

      const refreshedDocs = await db.collections.assignments.find({ selector: { eventKey } }).exec()
      const refreshed = refreshedDocs.map((doc) => doc.toJSON())

      if (mutated) {
        notifications.show({
          color: 'yellow',
          title: 'Assignments normalized',
          message: 'Duplicate assignment slots were merged using the latest assignment.',
        })
      }

      return refreshed
    },
    [db],
  )

  const assignmentMap = useMemo(() => {
    const map = new Map<string, AssignmentDocType>()
    assignments.forEach((assignment) => {
      map.set(`${assignment.matchKey}:${assignment.alliancePosition}`, assignment)
    })
    return map
  }, [assignments])

  useEffect(() => {
    const loadInitialData = async (): Promise<void> => {
      if (!db) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const [eventDocs, scoutDocs] = await Promise.all([
          db.collections.events.find().sort({ startDate: 'desc' }).exec(),
          db.collections.scouts.find().sort({ name: 'asc' }).exec(),
        ])

        const loadedEvents = eventDocs.map((doc) => doc.toJSON())
        setEvents(loadedEvents)
        setScouts(scoutDocs.map((doc) => doc.toJSON()))
        if (loadedEvents.length > 0) {
          setSelectedEvent((current) => current ?? loadedEvents[0].id)
        }
      } catch (error: unknown) {
        notifications.show({
          color: 'red',
          title: 'Failed to load assignments page',
          message: error instanceof Error ? error.message : 'Could not load events/scouts from local database.',
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadInitialData()
  }, [db])

  useEffect(() => {
    const loadEventData = async (): Promise<void> => {
      if (!db || !selectedEvent) {
        setMatches([])
        setAssignments([])
        return
      }

      setIsLoading(true)
      try {
        const [matchDocs, assignmentDocs] = await Promise.all([
          db.collections.matches
            .find({ selector: { eventId: selectedEvent, compLevel: 'qm' } })
            .sort({ matchNumber: 'asc' })
            .exec(),
          normalizeAssignmentsForEvent(selectedEvent),
        ])

        setMatches(
          matchDocs.map((doc) => {
            const value = doc.toJSON()
            return {
              ...value,
              redAlliance: [...value.redAlliance],
              blueAlliance: [...value.blueAlliance],
            }
          }),
        )
        setAssignments(assignmentDocs)
      } catch (error: unknown) {
        notifications.show({
          color: 'red',
          title: 'Failed to load matches/assignments',
          message: error instanceof Error ? error.message : 'Could not load event matches and assignments.',
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadEventData()
  }, [db, normalizeAssignmentsForEvent, selectedEvent])

  const refreshAssignments = useCallback(async (): Promise<void> => {
    if (!db || !selectedEvent) {
      return
    }

    const assignmentDocs = await normalizeAssignmentsForEvent(selectedEvent)
    setAssignments(assignmentDocs)
  }, [db, normalizeAssignmentsForEvent, selectedEvent])

  const handleAssignSlot = async (
    eventKey: string,
    match: MatchDocType,
    position: AssignmentDocType['alliancePosition'],
    selectedScoutId: string,
  ): Promise<void> => {
    if (!db) {
      return
    }

    setIsAssigning(true)
    try {
      const existing = await db.collections.assignments
        .findOne({ selector: { matchKey: match.key, alliancePosition: position } })
        .exec()

      if (existing) {
        notifications.show({
          color: 'yellow',
          title: 'Already assigned',
          message: `${getAlliancePositionLabel(position)} for Match ${match.matchNumber} is already assigned.`,
        })
        return
      }

      const teamKey = getTeamFromMatch(toTBAMatch(match), position)
      if (!teamKey) {
        notifications.show({
          color: 'red',
          title: 'Missing team data',
          message: `Could not resolve team for ${getAlliancePositionLabel(position)} in Match ${match.matchNumber}.`,
        })
        return
      }

      const scout = scouts.find((item) => item.id === selectedScoutId)
      const deviceId = scout?.deviceId ?? (await getOrCreateDeviceId())

      const assignmentId = getAssignmentId(match.key, position)
      await db.collections.assignments.insert({
        id: assignmentId,
        eventKey,
        matchKey: match.key,
        alliancePosition: position,
        teamKey,
        scoutId: selectedScoutId,
        deviceId,
        assignedAt: new Date().toISOString(),
      })

      await refreshAssignments()
      notifications.show({
        color: 'green',
        title: 'Assignment created',
        message: `Assigned ${scout?.name ?? selectedScoutId} to Match ${match.matchNumber} ${getAlliancePositionLabel(position)}.`,
      })
    } catch (error: unknown) {
      if (isConflictError(error)) {
        notifications.show({
          color: 'yellow',
          title: 'Already assigned',
          message: `${getAlliancePositionLabel(position)} for Match ${match.matchNumber} was assigned by another update.`,
        })
        await refreshAssignments()
        return
      }

      notifications.show({
        color: 'red',
        title: 'Assignment failed',
        message: error instanceof Error ? error.message : 'Could not create assignment.',
      })
    } finally {
      setIsAssigning(false)
    }
  }

  const handleAutoAssign = async (): Promise<void> => {
    if (!db || !selectedEvent || scouts.length === 0) {
      return
    }

    const unassignedSlots = matches.flatMap((match) =>
      ALLIANCE_POSITIONS.filter((position) => !assignmentMap.has(`${match.key}:${position}`)).map((position) => ({
        match,
        position,
      })),
    )

    if (unassignedSlots.length === 0) {
      notifications.show({
        color: 'blue',
        title: 'No open slots',
        message: 'All qualification positions are already assigned.',
      })
      return
    }

    setIsAutoAssigning(true)
    try {
      let insertedCount = 0
      let skippedCount = 0
      let failedCount = 0

      for (let index = 0; index < unassignedSlots.length; index += 1) {
        const { match, position } = unassignedSlots[index]
        const scout = scouts[index % scouts.length]
        const teamKey = getTeamFromMatch(toTBAMatch(match), position)
        if (!teamKey) {
          skippedCount += 1
          continue
        }

        const assignmentId = getAssignmentId(match.key, position)
        try {
          await db.collections.assignments.insert({
            id: assignmentId,
            eventKey: selectedEvent,
            matchKey: match.key,
            alliancePosition: position,
            teamKey,
            scoutId: scout.id,
            deviceId: scout.deviceId,
            assignedAt: new Date().toISOString(),
          })
          insertedCount += 1
        } catch (error: unknown) {
          if (isConflictError(error)) {
            skippedCount += 1
          } else {
            failedCount += 1
          }
        }
      }

      await refreshAssignments()
      notifications.show({
        color: failedCount > 0 ? 'yellow' : 'green',
        title: failedCount > 0 ? 'Auto-assign finished with issues' : 'Auto-assign complete',
        message: `${insertedCount} assigned, ${skippedCount} skipped, ${failedCount} failed.`,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Auto-assign failed',
        message: error instanceof Error ? error.message : 'Could not auto-assign open slots.',
      })
    } finally {
      setIsAutoAssigning(false)
    }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Scout Assignments</Title>
        <Tooltip label="Automatically fill open slots in round-robin order">
          <Button onClick={() => void handleAutoAssign()} disabled={!selectedEvent || scouts.length === 0} loading={isAutoAssigning}>
            Auto-assign
          </Button>
        </Tooltip>
      </Group>

      <Card withBorder radius="md" p="lg">
        <Select
          label="Event"
          description="Assignments are created for the selected event"
          placeholder="Select an event"
          value={selectedEvent}
          onChange={setSelectedEvent}
          data={events.map((event) => ({ value: event.id, label: `${event.name} (${event.id})` }))}
          searchable
        />
      </Card>

      {isLoading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : !selectedEvent ? (
        <Card withBorder radius="md" p="lg">
          <Text c="dimmed">No events available. Import an event first on the Events page.</Text>
        </Card>
      ) : matches.length === 0 ? (
        <Card withBorder radius="md" p="lg">
          <Text c="dimmed">No qualification matches found for this event.</Text>
        </Card>
      ) : scouts.length === 0 ? (
        <Card withBorder radius="md" p="lg">
          <Text c="dimmed">No scouts found. Add scouts before assigning positions.</Text>
        </Card>
      ) : (
        <Accordion variant="separated">
          {matches.map((match) => (
            <Accordion.Item key={match.key} value={match.key}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={600}>Qualification Match {match.matchNumber}</Text>
                  <Text size="sm" c="dimmed">
                    {new Date(match.predictedTime).getTime() > 0
                      ? new Date(match.predictedTime).toLocaleString()
                      : 'Time unavailable'}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack>
                  {ALLIANCE_POSITIONS.map((position) => {
                    const teamKey = getTeamFromMatch(toTBAMatch(match), position)
                    const assignment = assignmentMap.get(`${match.key}:${position}`)
                    const assignedScout = scouts.find((scout) => scout.id === assignment?.scoutId)
                    const slotKey = `${match.key}:${position}`

                    return (
                      <Card key={slotKey} withBorder radius="md" p="sm">
                        <Group align="flex-end" wrap="wrap">
                          <Stack gap={2} style={{ minWidth: 170 }}>
                            <Text fw={600}>{getAlliancePositionLabel(position)}</Text>
                            <Text size="sm" c="dimmed">
                              {teamKey ? formatTeamLabel(teamKey) : 'Team unavailable'}
                            </Text>
                          </Stack>

                          <Select
                            placeholder="Select scout"
                            data={scouts.map((scout) => ({ value: scout.id, label: scout.name }))}
                            value={slotSelections[slotKey] ?? assignment?.scoutId ?? null}
                            onChange={(value) => {
                              if (!value) {
                                return
                              }

                              setSlotSelections((prev) => ({ ...prev, [slotKey]: value }))
                            }}
                            disabled={Boolean(assignment)}
                            searchable
                            style={{ flex: 1, minWidth: 220 }}
                          />

                          <Button
                            onClick={() =>
                              void handleAssignSlot(
                                selectedEvent,
                                match,
                                position,
                                slotSelections[slotKey] ?? assignment?.scoutId ?? '',
                              )
                            }
                            disabled={Boolean(assignment) || !(slotSelections[slotKey] ?? assignment?.scoutId)}
                            loading={isAssigning}
                          >
                            Assign
                          </Button>

                          {assignment && (
                            <Badge color="green" variant="light">
                              Assigned: {assignedScout?.name ?? assignment.scoutId}
                            </Badge>
                          )}
                        </Group>
                      </Card>
                    )
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Stack>
  )
}
