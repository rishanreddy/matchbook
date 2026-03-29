import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Model } from 'survey-core'
import { Survey } from 'survey-react-ui'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { AssignmentDocType } from '../lib/db/schemas/assignments.schema'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import type { MatchDocType } from '../lib/db/schemas/matches.schema'
import type { ScoutDocType } from '../lib/db/schemas/scouts.schema'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { getAlliancePositionLabel } from '../lib/utils/assignments'
import { calculateAutoScore, calculateEndgameScore, calculateTeleopScore } from '../lib/utils/scoring'
import { useDatabaseStore } from '../stores/useDatabase'

type AssignmentView = {
  assignment: AssignmentDocType
  match: MatchDocType | null
  scout: ScoutDocType | null
}

const META_FIELDS = [
  { type: 'text', name: '_matchNumber', visible: false },
  { type: 'text', name: '_teamNumber', visible: false },
  { type: 'text', name: '_alliancePosition', visible: false },
]

function formatTeamLabel(teamKey: string): string {
  const teamNumber = teamKey.replace('frc', '')
  return `Team ${teamNumber}`
}

function formatDuration(ms: number): string {
  const clampedMs = Math.max(ms, 0)
  const totalSeconds = Math.floor(clampedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)

  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function buildSurveyJsonWithMeta(surveyJson: Record<string, unknown>): Record<string, unknown> {
  const pagesRaw = Array.isArray(surveyJson.pages) ? surveyJson.pages : []
  const pages = pagesRaw.map((page) => ({ ...page })) as Array<Record<string, unknown>>

  if (pages.length === 0) {
    pages.push({ name: 'scouting', title: 'Scouting', elements: [...META_FIELDS] })
  } else {
    const firstPage = { ...pages[0] }
    const elements = Array.isArray(firstPage.elements) ? [...(firstPage.elements as Array<Record<string, unknown>>)] : []

    META_FIELDS.forEach((field) => {
      if (!elements.some((element) => element.name === field.name)) {
        elements.unshift(field)
      }
    })

    firstPage.elements = elements
    pages[0] = firstPage
  }

  return { ...surveyJson, pages }
}

function ScoutAssignmentsView(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const navigate = useNavigate()
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
              <Button
                size="xl"
                mt="sm"
                fullWidth
                onClick={() => navigate(`/scout/form/${currentAssignment.assignment.id}`)}
              >
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

function ScoutFormView(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const navigate = useNavigate()
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [assignment, setAssignment] = useState<AssignmentDocType | null>(null)
  const [match, setMatch] = useState<MatchDocType | null>(null)
  const [formSchema, setFormSchema] = useState<FormSchemaDocType | null>(null)
  const [countdownMs, setCountdownMs] = useState<number | null>(null)

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      if (!db || !assignmentId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const assignmentDoc = await db.collections.assignments.findOne(assignmentId).exec()
        const assignmentData = assignmentDoc?.toJSON() ?? null
        setAssignment(assignmentData)

        if (!assignmentData) {
          notifications.show({ color: 'red', title: 'Assignment not found', message: 'This assignment no longer exists.' })
          return
        }

        const [matchDoc, schemaDoc] = await Promise.all([
          db.collections.matches.findOne(assignmentData.matchKey).exec(),
          db.collections.formSchemas
            .findOne({ selector: { eventKey: assignmentData.eventKey, isActive: true } })
            .exec(),
        ])

        const matchDataRaw = matchDoc?.toJSON() ?? null
        const matchData = matchDataRaw
          ? {
              ...matchDataRaw,
              redAlliance: [...matchDataRaw.redAlliance],
              blueAlliance: [...matchDataRaw.blueAlliance],
            }
          : null
        setMatch(matchData)
        setFormSchema(schemaDoc?.toJSON() ?? null)
      } catch (error: unknown) {
        notifications.show({
          color: 'red',
          title: 'Failed to load scouting form',
          message: error instanceof Error ? error.message : 'Could not load assignment/form data.',
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadData()
  }, [assignmentId, db])

  useEffect(() => {
    if (!match) {
      setCountdownMs(null)
      return
    }

    const targetMs = new Date(match.predictedTime).getTime()
    if (targetMs <= 0) {
      setCountdownMs(null)
      return
    }

    const interval = setInterval(() => {
      setCountdownMs(targetMs - Date.now())
    }, 1000)

    setCountdownMs(targetMs - Date.now())
    return () => clearInterval(interval)
  }, [match])

  const survey = useMemo(() => {
    if (!assignment || !match || !formSchema) {
      return null
    }

    const surveyJson = buildSurveyJsonWithMeta(formSchema.surveyJson)
    const model = new Model(surveyJson)
    model.data = {
      _matchNumber: String(match.matchNumber),
      _teamNumber: assignment.teamKey.replace('frc', ''),
      _alliancePosition: assignment.alliancePosition,
    }
    return model
  }, [assignment, formSchema, match])

  const validateSubmissionData = useCallback((formData: Record<string, unknown>): string[] => {
    const errors: string[] = []

    Object.entries(formData).forEach(([key, value]) => {
      if (key.startsWith('_')) {
        return
      }

      if (typeof value === 'string' && value.trim() === '') {
        return
      }

      const parsed = Number(value)
      if (!Number.isNaN(parsed)) {
        if (parsed < 0) {
          errors.push(`${key} cannot be negative.`)
        }
        if (parsed > 1000) {
          errors.push(`${key} is above allowed maximum (1000).`)
        }
      }
    })

    return errors
  }, [])

  const saveObservation = useCallback(async (
    formData: Record<string, unknown>,
    options: { isNoShow: boolean; isBrokenRobot: boolean },
  ): Promise<void> => {
    if (!db || !assignment || !match || !formSchema) {
      return
    }

    const validationErrors = validateSubmissionData(formData)
    if (validationErrors.length > 0) {
      notifications.show({
        color: 'red',
        title: 'Validation failed',
        message: validationErrors[0],
      })
      return
    }

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const originDeviceId = await getOrCreateDeviceId()
      const syncHash = await sha256Hex(
        `${assignment.eventKey}${assignment.matchKey}${assignment.teamKey}${originDeviceId}`,
      )

      await db.collections.scoutingData.insert({
        id: crypto.randomUUID(),
        eventKey: assignment.eventKey,
        matchKey: assignment.matchKey,
        teamKey: assignment.teamKey,
        scoutId: assignment.scoutId,
        deviceId: assignment.deviceId,
        originDeviceId,
        timestamp: now,
        schemaVersion: formSchema.schemaVersion,
        autoScore: calculateAutoScore(formData),
        teleopScore: calculateTeleopScore(formData),
        endgameScore: calculateEndgameScore(formData),
        formData,
        syncHash,
        isNoShow: options.isNoShow,
        isBrokenRobot: options.isBrokenRobot,
        createdAt: now,
      })

      notifications.show({ color: 'green', title: 'Scouting saved', message: 'Observation was recorded successfully.' })
      navigate('/scout')
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Submit failed',
        message: error instanceof Error ? error.message : 'Could not save scouting data.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [assignment, db, formSchema, match, navigate, validateSubmissionData])

  useEffect(() => {
    if (!survey) {
      return
    }

    const completeHandler = (sender: Model): void => {
      void saveObservation(sender.data as Record<string, unknown>, { isNoShow: false, isBrokenRobot: false })
    }

    survey.onComplete.add(completeHandler)
    return () => {
      survey.onComplete.remove(completeHandler)
    }
  }, [saveObservation, survey])

  if (isLoading) {
    return (
      <Card withBorder radius="md" p="lg">
        <Text c="dimmed">Loading scouting form...</Text>
      </Card>
    )
  }

  if (!assignment) {
    return (
      <Card withBorder radius="md" p="lg">
        <Stack>
          <Text fw={600}>Assignment not found.</Text>
          <Button variant="light" onClick={() => navigate('/scout')}>
            Back to Scout
          </Button>
        </Stack>
      </Card>
    )
  }

  if (!formSchema) {
    return (
      <Card withBorder radius="md" p="lg">
        <Stack>
          <Text fw={600}>No active form schema for this event.</Text>
          <Text c="dimmed">Create and save a form in Form Builder before scouting this event.</Text>
          <Group>
            <Button variant="light" onClick={() => navigate('/form-builder')}>
              Open Form Builder
            </Button>
            <Button variant="subtle" onClick={() => navigate('/scout')}>
              Back to Scout
            </Button>
          </Group>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack>
      <Title order={2}>Scout Match Form</Title>

      <Card withBorder radius="md" p="lg">
        <Stack gap="xs">
          <Text fw={600}>Match {match?.matchNumber ?? 'Unknown'}</Text>
          <Text>
            {getAlliancePositionLabel(assignment.alliancePosition)} · {formatTeamLabel(assignment.teamKey)}
          </Text>
          {countdownMs !== null && (
            <Text c={countdownMs > 0 ? 'blue' : 'orange'}>
              {countdownMs > 0 ? `Starts in ${formatDuration(countdownMs)}` : 'Match should be in progress'}
            </Text>
          )}
          <Group>
            <Button
              color="yellow"
              variant="light"
              disabled={isSubmitting}
              onClick={() => void saveObservation(survey?.data ?? {}, { isNoShow: true, isBrokenRobot: false })}
            >
              No Show
            </Button>
            <Button
              color="orange"
              variant="light"
              disabled={isSubmitting}
              onClick={() => void saveObservation(survey?.data ?? {}, { isNoShow: false, isBrokenRobot: true })}
            >
              Broken Robot
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg" style={{ opacity: isSubmitting ? 0.7 : 1 }}>
        {survey ? <Survey model={survey} /> : <Text c="dimmed">Unable to render survey.</Text>}
      </Card>
    </Stack>
  )
}

export function Scout(): ReactElement {
  const { assignmentId } = useParams<{ assignmentId?: string }>()
  if (assignmentId) {
    return <ScoutFormView />
  }

  return <ScoutAssignmentsView />
}
