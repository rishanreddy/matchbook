import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  Group,
  LoadingOverlay,
  NumberInput,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconClipboardCheck, IconRefresh } from '@tabler/icons-react'
import { Model } from 'survey-core'
import { Survey } from 'survey-react-ui'
import { useNavigate } from 'react-router-dom'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import { calculateAutoScore, calculateEndgameScore, calculateTeleopScore } from '../lib/utils/scoring'
import { handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'
import { applyMatchbookSurveyTheme } from '../lib/utils/surveyTheme'
import { useDatabaseStore } from '../stores/useDatabase'
import { useDeviceStore } from '../stores/useDeviceStore'
import { useEventStore } from '../stores/useEventStore'
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

  const hasActiveForm = formSchema !== null
  const canStartScouting =
    hasActiveForm &&
    isPositiveInteger(matchNumber) &&
    isPositiveInteger(teamNumber) &&
    !isLoadingForm

  const handleStartScouting = (): void => {
    if (!hasActiveForm) {
      notifications.show({
        color: 'yellow',
        title: 'Sync required',
        message: 'No active scouting form is synced. Sync an active form before scouting.',
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
          eventId: currentEventId ?? null,
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
            >
              Back
            </Button>

            <Group gap="md" align="center">
              <ThemeIcon
                size={56}
                radius="xl"
                variant="gradient"
                gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
              >
                <IconClipboardCheck size={28} stroke={1.5} />
              </ThemeIcon>
              <Box>
                <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                  Match {matchNumber} · Team {teamNumber}
                </Title>
                <Text size="sm" c="slate.4">Fill out the form below and submit when done</Text>
              </Box>
            </Group>
          </Box>

          <Card
            p="xl"
            radius="lg"
            className="animate-fadeInUp stagger-1"
            style={{
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border-default)',
              position: 'relative',
            }}
          >
            <LoadingOverlay visible={isSubmitting} overlayProps={{ blur: 2 }} />
            {survey ? (
              <Box className="survey-runtime-container">
                <Survey model={survey} />
              </Box>
            ) : (
              <Text c="slate.4">Preparing form...</Text>
            )}
          </Card>
        </Stack>
      </Box>
    )
  }

  return (
    <Box className="container-wide" py="xl">
      <Stack gap={24}>
        <Box className="animate-fadeInUp">
          <Group gap="md" align="center" mb="md">
            <ThemeIcon size={56} radius="xl" variant="gradient" gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}>
              <IconClipboardCheck size={28} stroke={1.5} />
            </ThemeIcon>
            <Box>
              <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                Scout Match
              </Title>
              <Text size="sm" c="slate.4">Enter match and team number to start scouting</Text>
            </Box>
          </Group>
        </Box>

        {!hasActiveForm && (
          <Card
            p="xl"
            radius="lg"
            className="animate-fadeInUp stagger-1"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 136, 0, 0.08), rgba(255, 136, 0, 0.03))',
              border: '1px solid rgba(255, 136, 0, 0.28)',
            }}
          >
            <Stack gap="md">
              <Alert
                color="warning"
                title="Scouting Form Required"
                icon={<IconAlertTriangle size={16} />}
                variant="light"
              >
                No active scouting form is synced on this device. Open Sync to import an active form, then refresh here.
              </Alert>

              <Group>
                <Button
                  variant="gradient"
                  gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                  onClick={() => navigate('/sync')}
                  leftSection={<IconRefresh size={16} />}
                >
                  Open Sync
                </Button>
                {isHub && (
                  <Button variant="light" color="frc-orange" onClick={() => navigate('/form-builder')}>
                    Open Form Builder
                  </Button>
                )}
                <Button variant="subtle" color="slate" onClick={() => void loadFormSchema()} loading={isLoadingForm}>
                  Refresh Form Status
                </Button>
              </Group>
            </Stack>
          </Card>
        )}

        <Card
          p="xl"
          radius="lg"
          className="animate-fadeInUp stagger-2"
          style={{
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border-default)',
          }}
        >
          <Stack gap="lg">
            <Group justify="space-between" align="center">
              <Title order={3} c="slate.1">Manual Entry</Title>
              <Text size="sm" c="slate.4">All fields required</Text>
            </Group>

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
              />
            </Group>

            <Button
              size="lg"
              onClick={handleStartScouting}
              disabled={!canStartScouting}
              loading={isLoadingForm}
              variant="gradient"
              gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
            >
              Start Scouting
            </Button>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
