import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { SurveyCreator, SurveyCreatorComponent } from 'survey-creator-react'
import { ExpressionErrorType, Model } from 'survey-core'
import { Survey } from 'survey-react-ui'
import {
  IconForms,
  IconDeviceFloppy,
  IconEye,
  IconCheck,
  IconPlus,
  IconLayoutGrid,
  IconFileDescription,
  IconSparkles,
} from '@tabler/icons-react'
import { DefaultDark } from 'survey-creator-core/themes'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import { applyMatchbookSurveyTheme } from '../lib/utils/surveyTheme'
import { useDatabaseStore } from '../stores/useDatabase'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { logger } from '../lib/utils/logger'
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
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [previewOpen, setPreviewOpen] = useState<boolean>(false)

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
    model.JSON = EMPTY_TEMPLATE
    model.onSurveyInstanceCreated.add((_, options) => {
      if (options.area === 'preview-tab' || options.area === 'designer-tab') {
        applyMatchbookSurveyTheme(options.survey)
      }
    })
    return model
  }, [])

  const getPreviewModel = (): Model => {
    const model = new Model(creator.JSON)
    applyMatchbookSurveyTheme(model)
    return model
  }

  // Load the active form schema on mount
  useEffect(() => {
    const loadActiveSchema = async (): Promise<void> => {
      if (!db) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        // Find active schema deterministically (latest updated)
        const activeSchema = await db.collections.formSchemas
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

  const handleSave = async (): Promise<void> => {
    if (!db) {
      notifications.show({ color: 'yellow', title: 'Database not ready', message: 'Please wait for initialization.' })
      return
    }

    // Validate the JSON
    let validationModel: Model
    try {
      validationModel = new Model(creator.JSON)
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Invalid form JSON',
        message: error instanceof Error ? error.message : 'Form JSON is invalid.',
      })
      return
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
      return
    }

    setIsSaving(true)
    try {
      const now = new Date().toISOString()
      const nameForSave = loadedSchema?.name?.trim() || DEFAULT_FORM_NAME

      // Enforce single active schema by deactivating all others first
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
        // Update existing schema
        await db.collections.formSchemas.upsert({
          ...loadedSchema,
          name: nameForSave,
          surveyJson: creator.JSON,
          isActive: true,
          updatedAt: now,
        })
        logger.info('Updated existing form schema', { id: loadedSchema.id })
      } else {
        // Create new schema
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

      // Refresh the loaded schema
      const refreshed = await db.collections.formSchemas
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
      setLoadedSchema(refreshed[0]?.toJSON() ?? null)

      notifications.show({ 
        color: 'green', 
        title: 'Form saved', 
        message: 'Your scouting form is now active and will be used for new entries.',
        icon: <IconCheck size={16} />,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Unable to save form.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Box 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: 'calc(100vh - 60px)',
        overflow: 'hidden',
      }}
    >
      {/* Header Bar */}
      <Box 
        px="lg" 
        py="md" 
        style={{ 
          borderBottom: '1px solid var(--border-default)',
          backgroundColor: 'var(--surface-base)',
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size={40} radius="lg" variant="gradient" gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}>
              <IconForms size={22} stroke={1.5} />
            </ThemeIcon>
            <Box>
              <Title order={2} c="slate.0" style={{ fontSize: 20, fontWeight: 600 }}>
                Form Builder
              </Title>
              <Text size="xs" c="slate.4">Design your scouting form</Text>
            </Box>
          </Group>

          <Group gap="md" wrap="nowrap">
            <Tooltip label="Preview the current form">
              <Button 
                variant="light" 
                color="frc-blue"
                onClick={() => setPreviewOpen(true)} 
                disabled={isLoading}
                leftSection={<IconEye size={14} />}
                radius="md"
                size="sm"
              >
                Preview
              </Button>
            </Tooltip>
            <Tooltip label="Save this form for your scouts to use">
              <Button 
                onClick={() => void handleSave()} 
                loading={isSaving} 
                disabled={isLoading}
                variant="gradient"
                gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
                leftSection={<IconDeviceFloppy size={14} />}
                radius="md"
                size="sm"
              >
                Save Form
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {loadedSchema && (
          <Paper 
            p="sm" 
            mt="sm"
            radius="md" 
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}
          >
            <Group gap="sm">
              <ThemeIcon size={24} radius="md" variant="light" color="success">
                <IconCheck size={14} />
              </ThemeIcon>
              <Text c="success.4" size="sm">
                Editing active form: {loadedSchema.name}
              </Text>
            </Group>
          </Paper>
        )}
      </Box>

      {/* Form Builder - Full Height */}
      <Box 
        style={{ 
          flex: 1, 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {isLoading ? (
          <Group justify="center" align="center" style={{ flex: 1 }}>
            <Stack align="center" gap="md">
              <Loader size="lg" color="frc-blue" />
              <Text c="slate.4">Loading form builder...</Text>
            </Stack>
          </Group>
        ) : (
          <Box 
            style={{ 
              flex: 1,
              overflow: 'hidden',
            }}
            className="survey-creator-container"
          >
            <SurveyCreatorComponent creator={creator} />
          </Box>
        )}
      </Box>

      {/* Preview Modal */}
      <Modal 
        opened={previewOpen} 
        onClose={() => setPreviewOpen(false)} 
        title="Form Preview" 
        size="xl"
        radius="lg"
        styles={{
          header: { backgroundColor: 'var(--surface-raised)' },
          body: { backgroundColor: 'var(--surface-raised)' },
        }}
      >
        <Box className="survey-runtime-container">
          <Survey model={getPreviewModel()} />
        </Box>
      </Modal>
    </Box>
  )
}
