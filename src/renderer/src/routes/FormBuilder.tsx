import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { notify } from '../lib/utils/notify'
import { IconCheck, IconInfoCircle, IconSparkles, IconWand } from '@tabler/icons-react'
import { SurveyCreator, SurveyCreatorComponent } from 'survey-creator-react'
import { ExpressionErrorType, type Model } from 'survey-core'
import { DefaultDark } from 'survey-creator-core/themes'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import { logger } from '../lib/utils/logger'
import { applyMatchbookSurveyTheme } from '../lib/utils/surveyTheme'
import { useDatabaseStore } from '../stores/useDatabase'
import { useEventStore } from '../stores/useEventStore'
import { AiFormDialog } from '../features/form-ai/AiFormDialog'
import { DEFAULT_SCOUTING_FORM } from '../lib/forms/defaultScoutingForm'
import { createScoutSurvey, setScoutContext, withMatchbookContext } from '../lib/forms/scoutSurvey'
import 'survey-core/survey-core.min.css'
import 'survey-creator-core/survey-creator-core.min.css'

const NAMING_HINT_DISMISSED_KEY = 'form_builder_naming_hint_dismissed'

const EMPTY_TEMPLATE: Record<string, unknown> = {
  title: '',
  pages: [],
}

const DEFAULT_FORM_NAME = 'Match Scouting Form'

function describeExpressionError(errorType: ExpressionErrorType): string {
  switch (errorType) {
    case ExpressionErrorType.SyntaxError:
      return 'syntax error'
    case ExpressionErrorType.UnknownFunction:
      return 'unknown function'
    case ExpressionErrorType.UnknownVariable:
      return 'unknown variable'
    case ExpressionErrorType.SemanticError:
      return 'semantic issue'
    default:
      return 'invalid expression'
  }
}

export function FormBuilder(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const [loadedSchema, setLoadedSchema] = useState<FormSchemaDocType | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isFormEmpty, setIsFormEmpty] = useState<boolean>(true)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const currentSeason = useEventStore((state) => state.currentSeason)
  const [aiOpen, setAiOpen] = useState<boolean>(false)
  const [aiCurrentForm, setAiCurrentForm] = useState<Record<string, unknown> | null>(null)
  const [aiEventName, setAiEventName] = useState<string | null>(null)

  const creator = useMemo(() => {
    const model = new SurveyCreator({
      showLogicTab: true,
      isAutoSave: false,
      showTranslationTab: false,
      previewAllowSimulateDevices: false,
      previewAllowHiddenElements: false,
      previewAllowSelectLanguage: false,
    })

    model.applyCreatorTheme(DefaultDark)
    model.showSaveButton = false
    model.JSON = EMPTY_TEMPLATE
    model.onSurveyInstanceCreated.add((_, options) => {
      if (options.area === 'preview-tab') {
        options.survey.fromJSON(withMatchbookContext(options.survey.toJSON()))
        setScoutContext(options.survey, 1, 254)
      }
      if (options.area === 'preview-tab' || options.area === 'designer-tab') {
        applyMatchbookSurveyTheme(options.survey)
      }
    })
    return model
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadActiveSchema = async (): Promise<void> => {
      if (!db) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const activeSchema = await db.collections.formSchemas
          .find({
            selector: { isActive: true },
            sort: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            limit: 1,
          })
          .exec()

        const existing = activeSchema[0]?.toJSON() ?? null
        if (cancelled) return
        setLoadedSchema(existing)

        if (existing) {
          creator.JSON = existing.surveyJson
          setIsFormEmpty(false)
          logger.info('Loaded active form schema', { name: existing.name })
        } else {
          creator.JSON = EMPTY_TEMPLATE
          setIsFormEmpty(true)
          logger.info('No active form schema found, starting with empty form')
        }
      } catch (error: unknown) {
        if (cancelled) return
        notify({
          color: 'red',
          title: 'Failed to load form schema',
          message: error instanceof Error ? error.message : 'Could not load form.',
        })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadActiveSchema()
    return () => { cancelled = true }
  }, [creator, db])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!db) {
      notify({ color: 'yellow', title: 'Database not ready', message: 'Please wait for initialization.' })
      return false
    }

    let validationModel: Model
    try {
      validationModel = createScoutSurvey(creator.JSON)
    } catch (error: unknown) {
      notify({
        color: 'red',
        title: 'Invalid form JSON',
        message: error instanceof Error ? error.message : 'Form JSON is invalid.',
      })
      return false
    }

    const jsonIssue = validationModel.jsonErrors?.[0]
    if (jsonIssue) {
      validationModel.dispose()
      notify({ color: 'red', title: 'Invalid form JSON', message: jsonIssue.message })
      return false
    }
    const expressionValidationResults = validationModel.validateExpressions()
    validationModel.dispose()
    const expressionIssues = expressionValidationResults.filter((result) => result.errors.length > 0)
    if (expressionIssues.length > 0) {
      const issue = expressionIssues[0]
      const issueError = issue.errors[0]
      notify({
        color: 'red',
        title: 'Invalid survey logic',
        message: `Fix ${issue.propertyName} (${describeExpressionError(issueError.errorType)}) before saving.`,
      })
      return false
    }

    try {
      const now = new Date().toISOString()
      const nameForSave = loadedSchema?.name?.trim() || DEFAULT_FORM_NAME

      const activeSchemas = await db.collections.formSchemas.find({ selector: { isActive: true } }).exec()
      const targetSchemaId = loadedSchema?.id ?? crypto.randomUUID()
      // Write the replacement first. If that write fails, scouts retain their active form.
      if (loadedSchema) {
        await db.collections.formSchemas.upsert({
          ...loadedSchema,
          name: nameForSave,
          surveyJson: creator.JSON,
          isActive: true,
          updatedAt: now,
        })
        logger.info('Updated existing form schema', { id: loadedSchema.id })
      } else {
        const newSchema = {
          id: targetSchemaId,
          name: nameForSave,
          surveyJson: creator.JSON,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        }
        await db.collections.formSchemas.insert(newSchema)
        logger.info('Created new form schema', { id: newSchema.id })
      }

      await Promise.all(
        activeSchemas
          .filter((doc) => doc.primary !== targetSchemaId)
          .map(async (doc) => {
            await db.collections.formSchemas.upsert({ ...doc.toJSON(), isActive: false, updatedAt: now })
          }),
      )

      const refreshed = await db.collections.formSchemas
        .find({
          selector: { isActive: true },
          sort: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          limit: 1,
        })
        .exec()
      setLoadedSchema(refreshed[0]?.toJSON() ?? null)

      notify({
        color: 'green',
        title: 'Form saved',
        message: 'Your scouting form is now active and will be used for new entries.',
        icon: <IconCheck size={16} />,
      })
      return true
    } catch (error: unknown) {
      notify({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Unable to save form.',
      })
      return false
    }
  }, [creator, db, loadedSchema])

  const handleUseDefaultForm = useCallback((): void => {
    creator.JSON = DEFAULT_SCOUTING_FORM
    setIsFormEmpty(false)
    notify({
      color: 'green',
      title: 'Starter form loaded',
      message: 'Edit anything you like, then press Save Form to send it to your scouts.',
    })
    logger.info('Loaded the default scouting form into the builder')
  }, [creator])

  const openAiDialog = useCallback((): void => {
    const current = creator.JSON as Record<string, unknown>
    const pages = Array.isArray(current.pages) ? (current.pages as Array<Record<string, unknown>>) : []
    const hasQuestions = pages.some((page) => Array.isArray(page.elements) && page.elements.length > 0)
    setAiCurrentForm(hasQuestions ? current : null)
    setAiEventName(null)
    setAiOpen(true)

    if (db && currentEventId) {
      void db.collections.events
        .findOne(currentEventId)
        .exec()
        .then((event) => setAiEventName(event?.name ?? null))
        .catch(() => setAiEventName(null))
    }
  }, [creator, currentEventId, db])

  const handleUseAiForm = useCallback(
    (form: Record<string, unknown>): void => {
      creator.JSON = form
      creator.switchTab('designer')
      setIsFormEmpty(false)
      setAiOpen(false)
      notify({
        color: 'green',
        title: 'AI form loaded',
        message: 'Look it over in the Designer, then press Save Form to send it to your scouts.',
      })
      logger.info('Loaded an AI-written form into the builder')
    },
    [creator],
  )

  useEffect(() => {
    window.addEventListener('matchbook:form-builder-ai', openAiDialog)
    return () => {
      window.removeEventListener('matchbook:form-builder-ai', openAiDialog)
    }
  }, [openAiDialog])

  useEffect(() => {
    creator.showSaveButton = false
    creator.saveSurveyFunc = (saveNo: number, callback: (no: number, isSuccess: boolean) => void): void => {
      void (async () => {
        const isSuccess = await handleSave()
        callback(saveNo, isSuccess)
      })()
    }
  }, [creator, handleSave])

  useEffect(() => {
    const handleExternalSave = (): void => {
      creator.saveSurvey()
    }

    window.addEventListener('matchbook:form-builder-save', handleExternalSave)
    return () => {
      window.removeEventListener('matchbook:form-builder-save', handleExternalSave)
    }
  }, [creator])

  const [showNamingHint, setShowNamingHint] = useState<boolean>(
    () => localStorage.getItem(NAMING_HINT_DISMISSED_KEY) !== 'true',
  )

  const dismissNamingHint = useCallback((): void => {
    localStorage.setItem(NAMING_HINT_DISMISSED_KEY, 'true')
    setShowNamingHint(false)
  }, [])

  return (
    <Box
      style={{
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isLoading ? (
        <Group justify="center" align="center" style={{ height: '100%' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" color="frc-blue" />
            <Text c="slate.4">Loading form builder...</Text>
          </Stack>
        </Group>
      ) : (
        <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {isFormEmpty && (
            <Alert
              color="amber"
              variant="light"
              radius={0}
              icon={<IconSparkles size={18} />}
              styles={{ root: { flexShrink: 0 } }}
            >
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Box style={{ flex: 1, minWidth: 240 }}>
                  <Text size="sm" fw={600}>
                    Start from the ready-made form
                  </Text>
                  <Text size="xs" c="dimmed">
                    Auto, teleop, endgame and a notes page that works for any season. Edit it
                    once you know what your team wants to track, or let an AI write one for your game.
                  </Text>
                </Box>
                <Group gap="xs">
                  <Button size="xs" variant="default" leftSection={<IconWand size={14} />} onClick={openAiDialog}>
                    Build with AI
                  </Button>
                  <Button size="xs" onClick={handleUseDefaultForm}>
                    Use the starter form
                  </Button>
                </Group>
              </Group>
            </Alert>
          )}

          {showNamingHint && (
            <Alert
              color="blue"
              variant="light"
              radius={0}
              icon={<IconInfoCircle size={18} />}
              withCloseButton
              closeButtonLabel="Hide naming hint"
              onClose={dismissNamingHint}
              styles={{ root: { flexShrink: 0 } }}
            >
              Compare any numeric or Yes/No answer in Analysis. Phase totals use result
              keys starting with <strong>auto…</strong>, <strong>teleop…</strong>,{' '}
              <strong>endgame…</strong> or <strong>climb…</strong>. Keep penalties and
              opinions neutral, and avoid giving both a total and its inputs phase prefixes.
            </Alert>
          )}
          <Box className="survey-creator-container" data-tour="form-builder" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <SurveyCreatorComponent creator={creator} />
          </Box>
        </Box>
      )}

      <AiFormDialog
        opened={aiOpen}
        onClose={() => setAiOpen(false)}
        currentForm={aiCurrentForm}
        season={currentSeason}
        eventName={aiEventName}
        onUse={handleUseAiForm}
      />
    </Box>
  )
}
