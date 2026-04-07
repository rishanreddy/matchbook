import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Group, Loader, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCheck } from '@tabler/icons-react'
import { SurveyCreator, SurveyCreatorComponent } from 'survey-creator-react'
import { ExpressionErrorType, Model } from 'survey-core'
import { DefaultDark } from 'survey-creator-core/themes'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import { logger } from '../lib/utils/logger'
import { applyMatchbookSurveyTheme } from '../lib/utils/surveyTheme'
import { useDatabaseStore } from '../stores/useDatabase'
import 'survey-core/survey-core.min.css'
import 'survey-creator-core/survey-creator-core.min.css'

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
      if (options.area === 'preview-tab' || options.area === 'designer-tab') {
        applyMatchbookSurveyTheme(options.survey)
      }
    })
    return model
  }, [])

  useEffect(() => {
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
        setLoadedSchema(existing)

        if (existing) {
          creator.JSON = existing.surveyJson
          logger.info('Loaded active form schema', { name: existing.name })
        } else {
          creator.JSON = EMPTY_TEMPLATE
          logger.info('No active form schema found, starting with empty form')
        }
      } catch (error: unknown) {
        notifications.show({
          color: 'red',
          title: 'Failed to load form schema',
          message: error instanceof Error ? error.message : 'Could not load form.',
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadActiveSchema()
  }, [creator, db])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!db) {
      notifications.show({ color: 'yellow', title: 'Database not ready', message: 'Please wait for initialization.' })
      return false
    }

    let validationModel: Model
    try {
      validationModel = new Model(creator.JSON)
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Invalid form JSON',
        message: error instanceof Error ? error.message : 'Form JSON is invalid.',
      })
      return false
    }

    const expressionValidationResults = validationModel.validateExpressions()
    const expressionIssues = expressionValidationResults.filter((result) => result.errors.length > 0)
    if (expressionIssues.length > 0) {
      const issue = expressionIssues[0]
      const issueError = issue.errors[0]
      notifications.show({
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
      const targetSchemaId = loadedSchema?.id ?? null
      await Promise.all(
        activeSchemas
          .filter((doc) => doc.primary !== targetSchemaId)
          .map(async (doc) => {
            const json = doc.toJSON()
            await db.collections.formSchemas.upsert({
              ...json,
              isActive: false,
              updatedAt: now,
            })
          }),
      )

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
          id: crypto.randomUUID(),
          name: nameForSave,
          surveyJson: creator.JSON,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        }
        await db.collections.formSchemas.insert(newSchema)
        logger.info('Created new form schema', { id: newSchema.id })
      }

      const refreshed = await db.collections.formSchemas
        .find({
          selector: { isActive: true },
          sort: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          limit: 1,
        })
        .exec()
      setLoadedSchema(refreshed[0]?.toJSON() ?? null)

      notifications.show({
        color: 'green',
        title: 'Form saved',
        message: 'Your scouting form is now active and will be used for new entries.',
        icon: <IconCheck size={16} />,
      })
      return true
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Unable to save form.',
      })
      return false
    }
  }, [creator, db, loadedSchema])

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
        <Box className="survey-creator-container" style={{ height: '100%', overflow: 'hidden' }}>
          <SurveyCreatorComponent creator={creator} />
        </Box>
      )}
    </Box>
  )
}
