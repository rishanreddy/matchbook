import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import type { AssignmentDocType } from '../lib/db/schemas/assignments.schema'
import type { MatchDocType } from '../lib/db/schemas/matches.schema'
import type { ScoutDocType } from '../lib/db/schemas/scouts.schema'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { getAlliancePositionLabel } from '../lib/utils/assignments'
import { useDatabaseStore } from '../stores/useDatabase'

type AssignmentView = {
  assignment: AssignmentDocType
  match: MatchDocType | null
  scout: ScoutDocType | null
}

function formatTeamLabel(teamKey: string): string {
  const teamNumber = teamKey.replace('frc', '')
  return `Team ${teamNumber}`
}

export function Scout(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [assignmentViews, setAssignmentViews] = useState<AssignmentView[]>([])

  useEffect(() => {
    const loadAssignmentsForDevice = async (): Promise<void> => {
      if (!db) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const deviceId = await getOrCreateDeviceId()
        const assignmentDocs = await db.collections.assignments
          .find({ selector: { deviceId } })
          .sort({ assignedAt: 'asc' })
          .exec()

        const joined = await Promise.all(
          assignmentDocs.map(async (assignmentDoc) => {
            const assignment = assignmentDoc.toJSON()
            const [matchDoc, scoutDoc] = await Promise.all([
              db.collections.matches.findOne(assignment.matchKey).exec(),
              db.collections.scouts.findOne(assignment.scoutId).exec(),
            ])

            const matchData = matchDoc?.toJSON()

            return {
              assignment,
              match: matchData
                ? {
                    ...matchData,
                    redAlliance: [...matchData.redAlliance],
                    blueAlliance: [...matchData.blueAlliance],
                  }
                : null,
              scout: scoutDoc?.toJSON() ?? null,
            }
          }),
        )

        joined.sort((a, b) => {
          const aTime = a.match ? new Date(a.match.predictedTime).getTime() : Number.MAX_SAFE_INTEGER
          const bTime = b.match ? new Date(b.match.predictedTime).getTime() : Number.MAX_SAFE_INTEGER
          if (aTime === bTime) {
            return (a.match?.matchNumber ?? Number.MAX_SAFE_INTEGER) - (b.match?.matchNumber ?? Number.MAX_SAFE_INTEGER)
          }
          return aTime - bTime
        })

        setAssignmentViews(joined)
      } catch (error: unknown) {
        console.error('Failed to load scout assignments:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void loadAssignmentsForDevice()
  }, [db])

  const currentAssignment = assignmentViews[0]
  const upcomingAssignments = assignmentViews.slice(1, 4)

  return (
    <Stack>
      <Title order={2}>Scout</Title>

      {isLoading ? (
        <Card withBorder shadow="sm" radius="md" p="lg">
          <Text c="dimmed">Loading assignments...</Text>
        </Card>
      ) : !currentAssignment ? (
        <Card withBorder shadow="sm" radius="md" p="lg">
          <Text fw={600}>No assignments found for this device.</Text>
          <Text mt="sm" c="dimmed">
            Ask your lead scout to assign this device from the Assignments page.
          </Text>
          <Button component={Link} to="/assignments" variant="light" mt="md">
            Open Assignments
          </Button>
        </Card>
      ) : (
        <>
          <Card withBorder shadow="sm" radius="md" p="lg">
            <Stack>
              <Title order={4}>Your Current Assignment</Title>
              <Text fw={600}>Match {currentAssignment.match?.matchNumber ?? 'Unknown'}</Text>
              <Text>{getAlliancePositionLabel(currentAssignment.assignment.alliancePosition)}</Text>
              <Text>
                {formatTeamLabel(currentAssignment.assignment.teamKey)} - Name unavailable
              </Text>
              <Text c="dimmed">
                {currentAssignment.match && new Date(currentAssignment.match.predictedTime).getTime() > 0
                  ? `Match Time: ${new Date(currentAssignment.match.predictedTime).toLocaleString()}`
                  : 'Match Time: Unavailable'}
              </Text>
              <Text size="sm" c="dimmed">
                Assigned scout: {currentAssignment.scout?.name ?? currentAssignment.assignment.scoutId}
              </Text>
              <Button size="xl" mt="sm" fullWidth>
                START SCOUTING
              </Button>
            </Stack>
          </Card>

          <Card withBorder shadow="sm" radius="md" p="lg">
            <Stack>
              <Title order={4}>Upcoming Assignments</Title>
              {upcomingAssignments.length === 0 ? (
                <Text c="dimmed">No upcoming assignments.</Text>
              ) : (
                upcomingAssignments.map((item) => (
                  <Group key={item.assignment.id} justify="space-between">
                    <Stack gap={2}>
                      <Text fw={500}>Match {item.match?.matchNumber ?? 'Unknown'}</Text>
                      <Text size="sm" c="dimmed">
                        {getAlliancePositionLabel(item.assignment.alliancePosition)} · {formatTeamLabel(item.assignment.teamKey)}
                      </Text>
                    </Stack>
                    <Text size="sm" c="dimmed">
                      {item.match && new Date(item.match.predictedTime).getTime() > 0
                        ? new Date(item.match.predictedTime).toLocaleTimeString()
                        : 'TBD'}
                    </Text>
                  </Group>
                ))
              )}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  )
}
