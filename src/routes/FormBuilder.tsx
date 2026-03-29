import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Group, Modal, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { SurveyCreator, SurveyCreatorComponent } from 'survey-creator-react'
import { Model } from 'survey-core'
import { Survey } from 'survey-react-ui'
import type { EventDocType } from '../lib/db/schemas/events.schema'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import { useDatabaseStore } from '../stores/useDatabase'

const DEFAULT_CRESCENDO_TEMPLATE: Record<string, unknown> = {
  title: 'Match Scouting Form',
  pages: [
    {
      name: 'auto',
      title: 'Autonomous Period',
      elements: [
        { type: 'text', name: 'autoNotes', title: 'Notes Scored in Auto', inputType: 'number', isRequired: true },
        { type: 'boolean', name: 'autoLeave', title: 'Left Starting Zone?' },
      ],
    },
    {
      name: 'teleop',
      title: 'Teleoperated Period',
      elements: [
        { type: 'text', name: 'teleopNotes', title: 'Notes Scored in Teleop', inputType: 'number', isRequired: true },
        { type: 'text', name: 'teleopAmp', title: 'Amp Scores', inputType: 'number' },
      ],
    },
    {
      name: 'endgame',
      title: 'Endgame',
      elements: [
        { type: 'radiogroup', name: 'climbStatus', title: 'Climb Status', choices: ['None', 'Parked', 'Onstage', 'Spotlit'] },
        { type: 'text', name: 'trapScores', title: 'Trap Scores', inputType: 'number' },
      ],
    },
    {
      name: 'overall',
      title: 'Overall',
      elements: [
        { type: 'rating', name: 'defense', title: 'Defense Rating', rateMax: 5 },
        { type: 'comment', name: 'notes', title: 'Additional Notes' },
      ],
    },
  ],
}

export function FormBuilder(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const [events, setEvents] = useState<EventDocType[]>([])
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [formName, setFormName] = useState<string>('Match Scouting Form')
  const [loadedSchema, setLoadedSchema] = useState<FormSchemaDocType | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [previewOpen, setPreviewOpen] = useState<boolean>(false)

  const creator = useMemo(() => {
    const model = new SurveyCreator({
      showLogicTab: true,
      isAutoSave: false,
      showTranslationTab: false,
    })

    model.JSON = DEFAULT_CRESCENDO_TEMPLATE
    return model
  }, [])

  useEffect(() => {
    const loadEvents = async (): Promise<void> => {
      if (!db) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const docs = await db.collections.events.find().sort({ startDate: 'desc' }).exec()
        const loaded = docs.map((doc) => doc.toJSON())
        setEvents(loaded)
        setSelectedEvent((current) => current ?? loaded[0]?.id ?? null)
      } catch (error: unknown) {
        notifications.show({
          color: 'red',
          title: 'Failed to load events',
          message: error instanceof Error ? error.message : 'Could not load events.',
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadEvents()
  }, [db])

  useEffect(() => {
    const loadSchemaForEvent = async (): Promise<void> => {
      if (!db || !selectedEvent) {
        return
      }

      try {
        const activeSchema = await db.collections.formSchemas
          .findOne({ selector: { eventKey: selectedEvent, isActive: true } })
          .exec()

        const existing = activeSchema?.toJSON() ?? null
        setLoadedSchema(existing)

        if (existing) {
          setFormName(existing.name)
          creator.JSON = existing.surveyJson
        } else {
          setFormName('Match Scouting Form')
          creator.JSON = DEFAULT_CRESCENDO_TEMPLATE
        }
      } catch (error: unknown) {
        notifications.show({
          color: 'red',
          title: 'Failed to load form schema',
          message: error instanceof Error ? error.message : 'Could not load form for selected event.',
        })
      }
    }

    void loadSchemaForEvent()
  }, [creator, db, selectedEvent])

  const handleSave = async (): Promise<void> => {
    if (!db || !selectedEvent) {
      notifications.show({ color: 'yellow', title: 'Event required', message: 'Select an event before saving.' })
      return
    }

    if (!formName.trim()) {
      notifications.show({ color: 'yellow', title: 'Form name required', message: 'Enter a name for this form schema.' })
      return
    }

    try {
      new Model(creator.JSON)
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Invalid schema JSON',
        message: error instanceof Error ? error.message : 'Survey JSON is invalid.',
      })
      return
    }

    setIsSaving(true)
    try {
      const now = new Date().toISOString()
      const nextVersion = (loadedSchema?.schemaVersion ?? 0) + 1

      if (loadedSchema) {
        await db.collections.formSchemas.upsert({
          ...loadedSchema,
          name: formName.trim(),
          surveyJson: creator.JSON,
          schemaVersion: nextVersion,
          isActive: true,
          updatedAt: now,
        })
      } else {
        await db.collections.formSchemas.insert({
          id: crypto.randomUUID(),
          eventKey: selectedEvent,
          name: formName.trim(),
          surveyJson: creator.JSON,
          schemaVersion: 1,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
      }

      const refreshed = await db.collections.formSchemas
        .findOne({ selector: { eventKey: selectedEvent, isActive: true } })
        .exec()
      setLoadedSchema(refreshed?.toJSON() ?? null)

      notifications.show({ color: 'green', title: 'Form saved', message: 'Form schema was saved successfully.' })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Unable to save form schema.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Stack>
      <Title order={2}>Form Builder</Title>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Select
            label="Event"
            placeholder="Select an event"
            data={events.map((event) => ({ value: event.id, label: `${event.name} (${event.id})` }))}
            value={selectedEvent}
            onChange={setSelectedEvent}
            searchable
            disabled={isLoading}
          />
          <TextInput label="Form Name" value={formName} onChange={(event) => setFormName(event.currentTarget.value)} />
          <Group>
            <Button onClick={() => void handleSave()} loading={isSaving} disabled={!selectedEvent || isLoading}>
              Save Form
            </Button>
            <Button variant="light" onClick={() => setPreviewOpen(true)} disabled={!selectedEvent || isLoading}>
              Preview Form
            </Button>
          </Group>
          {!selectedEvent && <Text c="dimmed">No events found. Import an event first from Event Management.</Text>}
        </Stack>
      </Card>

      <Card withBorder radius="md" p="md">
        <SurveyCreatorComponent creator={creator} />
      </Card>

      <Modal opened={previewOpen} onClose={() => setPreviewOpen(false)} title="Form Preview" size="xl">
        <Survey model={new Model(creator.JSON)} />
      </Modal>
    </Stack>
  )
}
