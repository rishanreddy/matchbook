import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  LoadingOverlay,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft, IconCheck, IconClipboardCheck, IconInfoCircle, IconRefresh, IconAlertCircle, IconCircleCheck } from '@tabler/icons-react'
import { Model } from 'survey-core'
import { Survey } from 'survey-react-ui'
import { useNavigate } from 'react-router-dom'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import type { MatchDocType } from '../lib/db/schemas/matches.schema'
import { calculateAutoScore, calculateEndgameScore, calculateTeleopScore } from '../lib/utils/scoring'
import { handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'
import { applyMatchbookSurveyTheme } from '../lib/utils/surveyTheme'
import { useDatabaseStore } from '../stores/useDatabase'
import { useDeviceStore } from '../stores/useDeviceStore'
import { useEventStore } from '../stores/useEventStore'
import { RouteHelpModal } from '../components/RouteHelpModal'
import 'survey-core/survey-core.min.css'

const META_FIELDS = [
  { type: 'text', name: '_matchNumber', visible: false },
  { type: 'text', name: '_teamNumber', visible: false },
]

type ScoutSurveyDraft = {
  data: Record<string, unknown>
  currentPageNo: number
}

function isPositiveInteger(value: number | ''): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function normalizePositiveIntegerInput(value: string | number): number | '' {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  const normalized = Math.trunc(value)
  return normalized > 0 ? normalized : ''
}

function parseTeamKey(teamKey: string): number | null {
  const frcMatch = teamKey.toLowerCase().match(/frc(\d+)/)
  if (frcMatch) {
    const parsedFrc = Number(frcMatch[1])
    if (Number.isInteger(parsedFrc) && parsedFrc > 0) {
      return parsedFrc
    }
  }

  const parsed = Number(teamKey)
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed
  }

  return null
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

export function Scout(): ReactElement {
  const navigate = useNavigate()
  const db = useDatabaseStore((state) => state.db)
  const isHub = useDeviceStore((state) => state.isPrimary)
  const deviceId = useDeviceStore((state) => state.deviceId)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const [matchNumber, setMatchNumber] = useState<number | ''>('')
  const [teamNumber, setTeamNumber] = useState<number | ''>('')
  const [showForm, setShowForm] = useState(false)
  const [formSchema, setFormSchema] = useState<FormSchemaDocType | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingForm, setIsLoadingForm] = useState(false)
  const [eventMatchDocs, setEventMatchDocs] = useState<MatchDocType[]>([])
  const [isLoadingEventMatches, setIsLoadingEventMatches] = useState(false)
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null)

  const loadFormSchema = useCallback(async (): Promise<void> => {
    if (!db) {
      return
    }

    setIsLoadingForm(true)
    try {
      const schemaDocs = await db.collections.formSchemas
        .find({
          selector: { isActive: true },
          sort: [
            { updatedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          limit: 1,
        })
        .exec()
      setFormSchema(schemaDocs[0]?.toJSON() ?? null)
    } catch (error: unknown) {
      handleError(error, 'Load form schema')
    } finally {
      setIsLoadingForm(false)
    }
  }, [db])

  useEffect(() => {
    void loadFormSchema()
  }, [loadFormSchema])

  const loadEventSchedule = useCallback(async (): Promise<void> => {
    if (!db || !currentEventId) {
      setSelectedEventName(null)
      setEventMatchDocs([])
      setIsLoadingEventMatches(false)
      return
    }

    setIsLoadingEventMatches(true)
    try {
      const [eventDoc, matchDocs] = await Promise.all([
        db.collections.events.findOne(currentEventId).exec(),
        db.collections.matches
          .find({ selector: { eventId: currentEventId, compLevel: 'qm' } })
          .sort({ matchNumber: 'asc' })
          .exec(),
      ])

      setSelectedEventName(eventDoc?.toJSON().name ?? currentEventId)
      setEventMatchDocs(
        matchDocs.map((doc) => {
          const value = doc.toJSON()
          return {
            ...value,
            redAlliance: [...value.redAlliance],
            blueAlliance: [...value.blueAlliance],
          }
        }),
      )
    } catch (error: unknown) {
      handleError(error, 'Load selected event match schedule')
      setSelectedEventName(currentEventId)
      setEventMatchDocs([])
    } finally {
      setIsLoadingEventMatches(false)
    }
  }, [currentEventId, db])

  useEffect(() => {
    void loadEventSchedule()
  }, [loadEventSchedule])

  const teamsByMatchNumber = useMemo(() => {
    const map = new Map<number, number[]>()
    eventMatchDocs.forEach((matchDoc) => {
      const teams = [...matchDoc.redAlliance, ...matchDoc.blueAlliance]
        .map((teamKey) => parseTeamKey(teamKey))
        .filter((team): team is number => team !== null)
      const uniqueTeams = Array.from(new Set(teams)).sort((a, b) => a - b)
      map.set(matchDoc.matchNumber, uniqueTeams)
    })
    return map
  }, [eventMatchDocs])

  const eventMatchOptions = useMemo(
    () =>
      Array.from(teamsByMatchNumber.keys())
        .sort((a, b) => a - b)
        .map((value) => ({ value: String(value), label: `Match ${value}` })),
    [teamsByMatchNumber],
  )

  const teamOptionsForSelectedMatch = useMemo(() => {
    if (!isPositiveInteger(matchNumber)) {
      return []
    }

    const teams = teamsByMatchNumber.get(matchNumber) ?? []
    return teams.map((team) => ({ value: String(team), label: `Team ${team}` }))
  }, [matchNumber, teamsByMatchNumber])

  const selectedMatchValue = useMemo(() => {
    if (!isPositiveInteger(matchNumber)) {
      return null
    }

    const value = String(matchNumber)
    return eventMatchOptions.some((option) => option.value === value) ? value : null
  }, [eventMatchOptions, matchNumber])

  const selectedTeamValue = useMemo(() => {
    if (!isPositiveInteger(teamNumber)) {
      return null
    }

    const value = String(teamNumber)
    return teamOptionsForSelectedMatch.some((option) => option.value === value) ? value : null
  }, [teamNumber, teamOptionsForSelectedMatch])

  const scheduleValidationError = useMemo(() => {
    if (!currentEventId || eventMatchOptions.length === 0) {
      return null
    }

    if (!isPositiveInteger(matchNumber) || !isPositiveInteger(teamNumber)) {
      return null
    }

    const teams = teamsByMatchNumber.get(matchNumber)
    if (!teams) {
      return `Match ${matchNumber} is not in the imported schedule for this event.`
    }

    if (!teams.includes(teamNumber)) {
      return `Team ${teamNumber} is not scheduled in Match ${matchNumber} for this event.`
    }

    return null
  }, [currentEventId, eventMatchOptions.length, matchNumber, teamNumber, teamsByMatchNumber])

  const hasEventScheduleValidation = Boolean(currentEventId) && eventMatchOptions.length > 0

  const hasActiveForm = formSchema !== null
  const canStartScouting =
    hasActiveForm &&
    isPositiveInteger(matchNumber) &&
    isPositiveInteger(teamNumber) &&
    (!currentEventId || !isLoadingEventMatches) &&
    scheduleValidationError === null &&
    !isLoadingForm

  const handleScheduleMatchChange = (value: string | null): void => {
    if (!value) {
      setMatchNumber('')
      setTeamNumber('')
      return
    }

    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return
    }

    setMatchNumber(parsed)
    const teams = teamsByMatchNumber.get(parsed) ?? []
    if (!isPositiveInteger(teamNumber) || teams.includes(teamNumber)) {
      return
    }

    setTeamNumber('')
  }

  const handleScheduleTeamChange = (value: string | null): void => {
    if (!value) {
      setTeamNumber('')
      return
    }

    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return
    }

    setTeamNumber(parsed)
  }

  const handleStartScouting = (): void => {
    if (!hasActiveForm) {
      notifications.show({
        color: 'yellow',
        title: 'Sync required',
        message: 'No active scouting form is synced. Sync an active form before scouting.',
      })
      return
    }

    if (currentEventId && isLoadingEventMatches) {
      notifications.show({
        color: 'yellow',
        title: 'Loading event schedule',
        message: 'Please wait for event match data to finish loading.',
      })
      return
    }

    if (scheduleValidationError) {
      notifications.show({
        color: 'red',
        title: 'Match validation failed',
        message: scheduleValidationError,
      })
      return
    }

    if (!canStartScouting) {
      notifications.show({
        color: 'yellow',
        title: 'Invalid match or team number',
        message: 'Match number and team number must be whole numbers greater than zero.',
      })
      return
    }

    setShowForm(true)
  }

  const surveyDraftKey = useMemo(() => {
    if (!showForm || !isPositiveInteger(matchNumber) || !isPositiveInteger(teamNumber)) {
      return null
    }

    return `scout_draft_manual_${matchNumber}_${teamNumber}`
  }, [showForm, matchNumber, teamNumber])

  const survey = useMemo(() => {
    if (!showForm || !formSchema) {
      return null
    }

    const surveyJson = buildSurveyJsonWithMeta(formSchema.surveyJson)
    const model = new Model(surveyJson)
    applyMatchbookSurveyTheme(model)
    model.checkErrorsMode = 'onValueChanged'
    model.textUpdateMode = 'onTyping'

    if (surveyDraftKey) {
      const draftRaw = localStorage.getItem(surveyDraftKey)
      if (draftRaw) {
        try {
          const parsedDraft = JSON.parse(draftRaw) as ScoutSurveyDraft
          if (parsedDraft && typeof parsedDraft === 'object' && parsedDraft.data) {
            model.mergeData(parsedDraft.data)
          }
          if (parsedDraft && Number.isInteger(parsedDraft.currentPageNo) && parsedDraft.currentPageNo >= 0) {
            model.currentPageNo = parsedDraft.currentPageNo
          }
        } catch (error: unknown) {
          handleError(error, 'Restore scouting form draft')
          localStorage.removeItem(surveyDraftKey)
        }
      }
    }

    model.data = {
      ...model.data,
      _matchNumber: String(matchNumber),
      _teamNumber: String(teamNumber),
    }

    return model
  }, [formSchema, showForm, surveyDraftKey, matchNumber, teamNumber])

  useEffect(() => {
    if (!survey || !surveyDraftKey) {
      return
    }

    const persistDraft = (): void => {
      const payload: ScoutSurveyDraft = {
        data: survey.data as Record<string, unknown>,
        currentPageNo: survey.currentPageNo,
      }
      localStorage.setItem(surveyDraftKey, JSON.stringify(payload))
    }

    persistDraft()

    const valueChangedHandler = (): void => {
      persistDraft()
    }

    const currentPageChangedHandler = (): void => {
      persistDraft()
    }

    survey.onValueChanged.add(valueChangedHandler)
    survey.onCurrentPageChanged.add(currentPageChangedHandler)

    return () => {
      survey.onValueChanged.remove(valueChangedHandler)
      survey.onCurrentPageChanged.remove(currentPageChangedHandler)
    }
  }, [survey, surveyDraftKey])

  const saveObservation = useCallback(
    async (formData: Record<string, unknown>): Promise<void> => {
      if (!db || !isPositiveInteger(matchNumber) || !isPositiveInteger(teamNumber)) {
        notifications.show({
          color: 'red',
          title: 'Invalid submission context',
          message: 'Match and team number must be valid whole numbers before saving.',
        })
        return
      }

      setIsSubmitting(true)
      logger.info('Scout form submission started', { matchNumber, teamNumber })
      try {
        const now = new Date().toISOString()
        const notes = typeof formData.notes === 'string' ? formData.notes.trim() : ''

        await db.collections.scoutingData.insert({
          id: crypto.randomUUID(),
          eventId: currentEventId ?? 'none',
          deviceId: deviceId ?? 'unknown',
          matchNumber,
          teamNumber,
          timestamp: now,
          autoScore: calculateAutoScore(formData),
          teleopScore: calculateTeleopScore(formData),
          endgameScore: calculateEndgameScore(formData),
          formData,
          notes,
          createdAt: now,
        })

        notifications.show({
          color: 'green',
          title: 'Saved!',
          message: `Match ${matchNumber}, Team ${teamNumber} recorded.`,
          icon: <IconCheck size={18} />,
        })

        logger.info('Scout form submission successful', { matchNumber, teamNumber })

        if (surveyDraftKey) {
          localStorage.removeItem(surveyDraftKey)
        }

        setShowForm(false)
        setMatchNumber('')
        setTeamNumber('')
      } catch (error: unknown) {
        handleError(error, 'Save scouting data')
      } finally {
        setIsSubmitting(false)
      }
    },
    [currentEventId, db, deviceId, matchNumber, surveyDraftKey, teamNumber],
  )

  useEffect(() => {
    if (!survey) {
      return
    }

    const completeHandler = (sender: Model): void => {
      sender.clearIncorrectValues(true)
      void saveObservation(sender.data as Record<string, unknown>)
    }

    survey.onComplete.add(completeHandler)
    return () => {
      survey.onComplete.remove(completeHandler)
    }
  }, [saveObservation, survey])

  if (showForm) {
    return (
      <Box className="container-wide" py="xl">
        <Stack gap={24}>
          <Box className="animate-fadeInUp">
            <Button
              variant="subtle"
              color="slate"
              size="sm"
              mb="md"
              onClick={() => setShowForm(false)}
              leftSection={<IconArrowLeft size={14} />}
              className="transition-all duration-200 hover:translate-x-[-2px]"
            >
              Back
            </Button>

            <Card
              p="lg"
              radius="xl"
              className="animate-fadeInUp stagger-1 transition-all duration-300 hover:shadow-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(26, 140, 255, 0.08), rgba(26, 140, 255, 0.03))',
                border: '1px solid rgba(26, 140, 255, 0.25)',
              }}
            >
              <Group gap="md" align="center" wrap="wrap">
                <ThemeIcon
                  size={56}
                  radius="xl"
                  variant="gradient"
                  gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                >
                  <IconClipboardCheck size={28} stroke={1.5} />
                </ThemeIcon>
                <Box>
                  <Title order={1} c="slate.0" style={{ fontSize: 24, fontWeight: 700 }}>
                    Match {matchNumber} · Team {teamNumber}
                  </Title>
                  <Text size="sm" c="slate.4">Fill out the form below and submit when done</Text>
                </Box>
              </Group>
            </Card>
          </Box>

          <Card
            p="xl"
            radius="xl"
            className="animate-fadeInUp stagger-2 transition-all duration-300 hover:shadow-xl"
            style={{
              background: 'linear-gradient(180deg, rgba(20, 26, 38, 0.95), rgba(15, 21, 32, 0.98))',
              border: '1px solid rgba(148, 163, 184, 0.12)',
              backdropFilter: 'blur(12px)',
              position: 'relative',
            }}
          >
            <Box
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'linear-gradient(90deg, var(--mantine-color-frc-blue-5), var(--mantine-color-frc-blue-7))',
                borderRadius: '12px 12px 0 0',
              }}
            />
            <LoadingOverlay visible={isSubmitting} overlayProps={{ blur: 2 }} />
            <Box className="survey-runtime-container" />
            {survey ? (
              <Survey model={survey} />
            ) : (
              <Group justify="center" py="xl">
                <Loader size="sm" color="frc-blue" />
                <Text size="sm" c="slate.4">Preparing form...</Text>
              </Group>
            )}
          </Card>
        </Stack>
      </Box>
    )
  }

  return (
    <Box className="container-wide" py="xl">
      <Stack gap={24}>
        {/* Header */}
        <Box className="animate-fadeInUp">
          <Card
            p="lg"
            radius="xl"
            style={{
              background: 'linear-gradient(135deg, rgba(26, 140, 255, 0.08), rgba(26, 140, 255, 0.03))',
              border: '1px solid rgba(26, 140, 255, 0.2)',
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Group gap="md" align="center">
                <ThemeIcon size={56} radius="xl" variant="gradient" gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}>
                  <IconClipboardCheck size={28} stroke={1.5} />
                </ThemeIcon>
                <Box>
                  <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                    Scout Match
                  </Title>
                  <Text size="sm" c="slate.4" mt={4}>
                    {currentEventId
                      ? 'Use the selected event schedule for faster, validated entry.'
                      : 'Enter match and team number to start scouting'}
                  </Text>
                </Box>
              </Group>
              <RouteHelpModal
                title="How to Scout"
                description="Record team performance during matches for post-match analysis and alliance selection."
                steps={[
                  { title: 'Select Match & Team', description: 'Choose from the event schedule or enter manually.' },
                  { title: 'Fill Out the Form', description: 'Answer questions about the robot\'s autonomous and teleop performance.' },
                  { title: 'Submit', description: 'Submit to save observations to the local database.' },
                ]}
                tips={[
                  { text: 'Use the event schedule when available — it validates selections against published matches.' },
                  { text: 'Manual entry is always available for overrides or unscheduled matches.' },
                  { text: 'Your draft is auto-saved as you type. Close the form anytime and resume later.' },
                ]}
                iconSize={20}
                tooltipLabel="How scouting works"
                color="frc-blue"
              />
            </Group>
          </Card>
        </Box>

        {/* Form required warning */}
        {!hasActiveForm && (
          <Card
            p="xl"
            radius="xl"
            className="animate-fadeInUp stagger-1 transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 136, 0, 0.08), rgba(255, 136, 0, 0.03))',
              border: '1px solid rgba(255, 136, 0, 0.28)',
            }}
          >
            <Stack gap="md">
              <Group gap="md" align="center">
                <ThemeIcon size={36} radius="md" color="frc-orange" variant="light">
                  <IconAlertCircle size={20} />
                </ThemeIcon>
                <Box>
                  <Text fw={600} c="frc-orange.3" size="sm">No Active Scouting Form</Text>
                  <Text size="xs" c="slate.4" mt={2}>
                    Sync or build a scouting form to start recording match data.
                  </Text>
                </Box>
                <RouteHelpModal
                  title="Getting Started with Scouting"
                  description="Before you can record match observations, you need an active scouting form synced to this device."
                  steps={[
                    { title: 'Sync a Form', description: 'Go to Sync Data to download a scouting form from the hub.' },
                    { title: 'Build a Form', description: 'On the hub, use Form Builder to create a custom scouting form.' },
                    { title: 'Set Active', description: 'Mark the form as active so scouts can use it.' },
                  ]}
                  tips={[
                    { text: 'Forms contain questions about robot capabilities, scoring, and defense.' },
                    { text: 'Multiple forms can exist; only one can be active at a time.' },
                    { text: 'Scouts on other devices will need to sync to get the latest form.' },
                  ]}
                  iconSize={16}
                  tooltipLabel="Form help"
                  color="frc-orange"
                />
              </Group>

              <Group gap="sm">
                <Button
                  variant="gradient"
                  gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                  onClick={() => navigate('/sync')}
                  leftSection={<IconRefresh size={16} />}
                  size="sm"
                  className="transition-all duration-200 hover:shadow-lg hover:shadow-frc-blue-5/20"
                >
                  Open Sync
                </Button>
                {isHub && (
                  <Button
                    variant="light"
                    color="frc-orange"
                    onClick={() => navigate('/form-builder')}
                    size="sm"
                    className="transition-all duration-200"
                  >
                    Form Builder
                  </Button>
                )}
                <Button
                  variant="subtle"
                  color="slate"
                  onClick={() => void loadFormSchema()}
                  loading={isLoadingForm}
                  size="sm"
                >
                  Refresh
                </Button>
              </Group>
            </Stack>
          </Card>
        )}

        {/* Match/Team Selection Card */}
        <Card
          p="xl"
          radius="xl"
          className="animate-fadeInUp stagger-2 transition-all duration-300 hover:shadow-xl"
          style={{
            background: 'linear-gradient(180deg, rgba(20, 26, 38, 0.95), rgba(15, 21, 32, 0.98))',
            border: '1px solid rgba(148, 163, 184, 0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Stack gap="lg">
            <Group justify="space-between" align="center">
              <Title order={3} c="slate.1" size="lg">
                {currentEventId ? 'Match Setup' : 'Manual Entry'}
              </Title>
              <Badge variant="light" color="slate" radius="md" size="sm">
                All fields required
              </Badge>
            </Group>

            {/* Event Schedule Section */}
            {currentEventId && (
              <Paper p="lg" radius="lg" style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                <Stack gap="md">
                  <Group justify="space-between" align="center" wrap="wrap">
                    <Group gap="sm">
                      <Text fw={600} c="slate.1" size="sm">Event Schedule</Text>
                      <Badge variant="light" color="frc-orange" radius="md" size="sm">
                        {selectedEventName ?? currentEventId}
                      </Badge>
                    </Group>
                    <RouteHelpModal
                      title="Event Schedule Validation"
                      description="When an event is selected, Matchbook validates your match and team selection against the imported schedule."
                      steps={[
                        { title: 'Select from Schedule', description: 'Choose a qualification match, then pick a team from that match.' },
                        { title: 'Validation', description: 'Matchbook checks that the team is actually scheduled in the selected match.' },
                        { title: 'Manual Override', description: 'Use manual entry for unscheduled matches, practice, or overrides.' },
                      ]}
                      tips={[
                        { text: 'Schedule validation prevents data entry errors on wrong teams.' },
                        { text: 'The form still works without an imported schedule.' },
                        { text: 'Import matches via Sync to enable schedule validation.' },
                      ]}
                      iconSize={14}
                      tooltipLabel="Schedule validation help"
                      color="frc-blue"
                    />
                  </Group>

                  <Text size="xs" c="slate.4">
                    Select a qualification match, then choose one of the teams scheduled in that match.
                  </Text>

                  {isLoadingEventMatches ? (
                    <Group gap="sm" py="xs">
                      <Loader size="xs" color="frc-blue" />
                      <Text size="xs" c="slate.4">Loading qualification match schedule...</Text>
                    </Group>
                  ) : eventMatchOptions.length === 0 ? (
                    <Paper p="md" radius="md" style={{ backgroundColor: 'rgba(255, 136, 0, 0.05)', border: '1px solid rgba(255, 136, 0, 0.15)' }}>
                      <Group gap="sm">
                        <IconInfoCircle size={16} className="text-[var(--mantine-color-frc-orange-5)]" />
                        <Text size="xs" c="frc-orange.3">
                          No qualification matches imported for this event yet. Use manual entry below.
                        </Text>
                      </Group>
                    </Paper>
                  ) : (
                    <Group grow align="flex-end">
                      <Select
                        label="Match"
                        placeholder="Select match"
                        data={eventMatchOptions}
                        searchable
                        clearable
                        value={selectedMatchValue}
                        onChange={handleScheduleMatchChange}
                        disabled={isLoadingForm || isLoadingEventMatches}
                        size="md"
                        classNames={{
                          input: 'transition-all duration-200 focus:border-frc-blue-5',
                        }}
                      />

                      <Select
                        label="Team in Match"
                        placeholder={isPositiveInteger(matchNumber) ? 'Select team' : 'Select match first'}
                        data={teamOptionsForSelectedMatch}
                        searchable
                        clearable
                        value={selectedTeamValue}
                        onChange={handleScheduleTeamChange}
                        disabled={!isPositiveInteger(matchNumber) || isLoadingForm || isLoadingEventMatches}
                        size="md"
                        classNames={{
                          input: 'transition-all duration-200 focus:border-frc-blue-5',
                        }}
                      />
                    </Group>
                  )}
                </Stack>
              </Paper>
            )}

            {/* Manual Entry Accordion or standalone */}
            {currentEventId ? (
              <Accordion variant="separated" radius="md" styles={{ item: { backgroundColor: 'transparent', border: '1px solid rgba(148, 163, 184, 0.08)' } }}>
                <Accordion.Item value="manual-entry">
                  <Accordion.Control>
                    <Group justify="space-between" align="center" wrap="wrap" pr="sm">
                      <Group gap="sm">
                        <Text fw={600} c="slate.1" size="sm">Manual Entry</Text>
                        <Badge variant="dot" color="slate" radius="md" size="xs">Override</Badge>
                      </Group>
                      <Text size="xs" c="slate.5">For unscheduled matches or quick edits</Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Group grow align="flex-end">
                      <NumberInput
                        label="Match Number"
                        value={matchNumber}
                        onChange={(value) => setMatchNumber(normalizePositiveIntegerInput(value))}
                        min={1}
                        allowDecimal={false}
                        hideControls
                        placeholder="e.g. 42"
                        size="md"
                        disabled={isLoadingForm}
                        classNames={{ input: 'transition-all duration-200 focus:border-frc-blue-5' }}
                      />

                      <NumberInput
                        label="Team Number"
                        value={teamNumber}
                        onChange={(value) => setTeamNumber(normalizePositiveIntegerInput(value))}
                        min={1}
                        allowDecimal={false}
                        hideControls
                        placeholder="e.g. 254"
                        size="md"
                        disabled={isLoadingForm}
                        classNames={{ input: 'transition-all duration-200 focus:border-frc-blue-5' }}
                      />
                    </Group>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            ) : (
              <Group grow align="flex-end">
                <NumberInput
                  label="Match Number"
                  value={matchNumber}
                  onChange={(value) => setMatchNumber(normalizePositiveIntegerInput(value))}
                  min={1}
                  allowDecimal={false}
                  hideControls
                  placeholder="e.g. 42"
                  size="md"
                  disabled={isLoadingForm}
                  error={hasEventScheduleValidation ? scheduleValidationError : undefined}
                  classNames={{ input: 'transition-all duration-200 focus:border-frc-blue-5' }}
                />

                <NumberInput
                  label="Team Number"
                  value={teamNumber}
                  onChange={(value) => setTeamNumber(normalizePositiveIntegerInput(value))}
                  min={1}
                  allowDecimal={false}
                  hideControls
                  placeholder="e.g. 254"
                  size="md"
                  disabled={isLoadingForm}
                  error={hasEventScheduleValidation ? scheduleValidationError : undefined}
                  classNames={{ input: 'transition-all duration-200 focus:border-frc-blue-5' }}
                />
              </Group>
            )}

            {/* Validation feedback */}
            {hasEventScheduleValidation && isPositiveInteger(matchNumber) && isPositiveInteger(teamNumber) && (
              <Paper
                p="md"
                radius="md"
                className="transition-all duration-300"
                style={
                  scheduleValidationError
                    ? { backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }
                    : { backgroundColor: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)' }
                }
              >
                <Group gap="sm">
                  {scheduleValidationError ? (
                    <>
                      <IconAlertCircle size={16} className="text-[var(--mantine-color-danger-5)]" />
                      <Text size="xs" c="danger.4">
                        {scheduleValidationError}
                      </Text>
                    </>
                  ) : (
                    <>
                      <IconCircleCheck size={16} className="text-[var(--mantine-color-success-5)]" />
                      <Text size="xs" c="success.4">
                        Team {teamNumber} is scheduled in Match {matchNumber}.
                      </Text>
                    </>
                  )}
                </Group>
              </Paper>
            )}

            {/* CTA */}
            <Box pt="sm">
              <Button
                size="lg"
                fullWidth
                onClick={handleStartScouting}
                disabled={!canStartScouting}
                loading={isLoadingForm || (Boolean(currentEventId) && isLoadingEventMatches)}
                variant="gradient"
                gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                leftSection={<IconClipboardCheck size={20} />}
                className="transition-all duration-200 hover:shadow-xl hover:shadow-frc-blue-5/25 hover:translate-y-[-1px] disabled:hover:translate-y-0 disabled:hover:shadow-none"
                styles={{
                  root: {
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                  },
                }}
              >
                Start Scouting
              </Button>
              {!hasActiveForm && (
                <Text size="xs" c="slate.5" ta="center" mt="sm">
                  Sync or build a form to enable scouting
                </Text>
              )}
            </Box>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
