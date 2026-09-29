import type { ReactElement } from 'react'
import { useState } from 'react'
import { Alert, Button, Checkbox, FileInput, Group, Progress, Select, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconDeviceFloppy, IconFolderOpen } from '@tabler/icons-react'
import { getScoutingDeletionId } from '../../../../shared/scoutingDeletion'
import type { SyncCollection } from '../../../../shared/syncProtocol'
import { StepList } from '../../components/StepList'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { downloadTextFile, timestampedFileStem } from '../../lib/utils/download'
import { handleError } from '../../lib/utils/errorHandler'
import { logger } from '../../lib/utils/logger'
import { notify } from '../../lib/utils/notify'
import { useDeviceStore } from '../../stores/useDeviceStore'
import { recordLastSent } from './lastSent'
import { SyncCard } from './SyncCard'
import {
  ALL_COLLECTIONS,
  COLLECTION_LABELS,
  MAX_IMPORT_FILE_BYTES,
  buildSnapshot,
  describeTransfer,
  importTransfer,
  parseTransferText,
  snapshotRowCount,
  summarizeImport,
  type TransferDocument,
} from './syncData'

type WhatToSave = 'everything' | 'entries' | 'setup' | 'custom'

const SAVE_CHOICES: Array<{ value: WhatToSave; label: string }> = [
  { value: 'everything', label: 'Everything on this laptop (a backup)' },
  { value: 'entries', label: 'My scouting entries' },
  { value: 'setup', label: 'Scouting form, event and match schedule' },
  { value: 'custom', label: 'Let me choose…' },
]

const PRESETS: Record<Exclude<WhatToSave, 'custom'>, readonly SyncCollection[]> = {
  everything: ALL_COLLECTIONS,
  entries: ['scoutingData'],
  setup: ['formSchemas', 'events', 'matches', 'assignments'],
}

type FilePanelProps = {
  db: ScoutingDatabase | null
}

export function FilePanel({ db }: FilePanelProps): ReactElement {
  const deviceName = useDeviceStore((state) => state.deviceName)
  const [what, setWhat] = useState<WhatToSave>('everything')
  const [chosen, setChosen] = useState<Record<SyncCollection, boolean>>({
    scoutingData: true,
    formSchemas: true,
    analysisConfigs: true,
    events: true,
    matches: true,
    assignments: true,
  })
  const [saved, setSaved] = useState<string | null>(null)
  const [savedEntries, setSavedEntries] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [opened, setOpened] = useState<{ document: TransferDocument; description: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [addedSummary, setAddedSummary] = useState<string | null>(null)

  const collectionsToSave = what === 'custom' ? ALL_COLLECTIONS.filter((collection) => chosen[collection]) : PRESETS[what]

  const saveFile = async (): Promise<void> => {
    if (!db) {
      return
    }

    const startedAt = Date.now()
    logger.info('Matchbook file export started', { collections: collectionsToSave }, 'sync.file')
    try {
      const snapshot = await buildSnapshot(db, collectionsToSave)
      const json = JSON.stringify(snapshot, null, 2)
      const stem = timestampedFileStem(deviceName)
      downloadTextFile(json, `matchbook-${stem}.json`)
      logger.info('Matchbook file export completed', {
        collections: Object.entries(snapshot.collections).map(([collection, rows]) => ({
          collection,
          rowCount: rows?.length ?? 0,
        })),
        recordCount: snapshotRowCount(snapshot),
        fileBytes: new TextEncoder().encode(json).byteLength,
        elapsedMs: Date.now() - startedAt,
      }, 'sync.file')
      setSaved(`Saved ${snapshotRowCount(snapshot).toLocaleString()} records. Now send that file to the other laptop.`)
      setSavedEntries((snapshot.collections.scoutingData ?? []).filter((row) => getScoutingDeletionId(row) === null).length)
      notify({ color: 'green', title: 'File saved', message: 'Choose where to keep it in the window that opened.' })
    } catch (error: unknown) {
      logger.error('Matchbook file export failed', { elapsedMs: Date.now() - startedAt, error }, 'sync.file')
      handleError(error, 'Save file')
    }
  }

  const chooseFile = async (next: File | null): Promise<void> => {
    setFile(next)
    setOpened(null)
    setProblem(null)
    setAddedSummary(null)
    if (!next) {
      return
    }

    if (next.size > MAX_IMPORT_FILE_BYTES) {
      setProblem('That file is larger than 10 MB, which is far more than a Matchbook file should be.')
      return
    }

    const startedAt = Date.now()
    logger.info('Matchbook transfer file parsing started', { fileBytes: next.size }, 'sync.file')
    try {
      const document = parseTransferText(await next.text())
      setOpened({ document, description: describeTransfer(document) })
      logger.info('Matchbook transfer file parsed', {
        collections: document.tasks.map(({ collection, rows }) => ({ collection, rowCount: rows.length })),
        elapsedMs: Date.now() - startedAt,
      }, 'sync.file')
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : 'That file could not be read.')
      logger.warn('Matchbook transfer file could not be parsed', {
        fileBytes: next.size,
        elapsedMs: Date.now() - startedAt,
        error,
      }, 'sync.file')
    }
  }

  const addFile = async (): Promise<void> => {
    if (!db || !opened) {
      return
    }

    setIsAdding(true)
    setProgress(0)
    const startedAt = Date.now()
    logger.info('Matchbook transfer file import started', {
      collections: opened.document.tasks.map(({ collection, rows }) => ({ collection, rowCount: rows.length })),
    }, 'sync.file')
    try {
      const result = await importTransfer(db, opened.document, (fraction) => setProgress(Math.round(fraction * 100)))
      const summary = summarizeImport(result)
      notify({
        color: result.errors > 0 ? 'yellow' : 'green',
        title: result.errors > 0 ? 'Added, with some problems' : 'Added to this laptop',
        message: summary,
      })
      setAddedSummary(summary)
      setOpened(null)
      setFile(null)
      logger.info('Matchbook transfer file import completed', {
        inserted: result.inserted,
        updated: result.updated,
        duplicates: result.duplicates,
        errors: result.errors,
        elapsedMs: Date.now() - startedAt,
      }, 'sync.file')
    } catch (error: unknown) {
      logger.error('Matchbook transfer file import failed', { elapsedMs: Date.now() - startedAt, error }, 'sync.file')
      handleError(error, 'Add file')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <SyncCard
          title="Save a file"
          description="Put your data in a file you can carry to another laptop."
          icon={<IconDeviceFloppy size={18} />}
        >
          <Select
            label="What do you want to save?"
            value={what}
            onChange={(value) => value && setWhat(value as WhatToSave)}
            data={SAVE_CHOICES}
            allowDeselect={false}
          />

          {what === 'custom' && (
            <Stack gap={6}>
              {ALL_COLLECTIONS.map((collection) => (
                <Checkbox
                  key={collection}
                  label={COLLECTION_LABELS[collection]}
                  checked={chosen[collection]}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    setChosen((previous) => ({ ...previous, [collection]: checked }))
                  }}
                />
              ))}
            </Stack>
          )}

          <Button onClick={() => void saveFile()} disabled={!db || collectionsToSave.length === 0} leftSection={<IconDeviceFloppy size={16} />}>
            Save file
          </Button>

          {saved && (
            <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
              <Stack gap="xs">
                <Text size="sm">{saved}</Text>
                {savedEntries > 0 && (
                  <Group gap="xs">
                    <Text size="sm">Once the lead scout has opened it:</Text>
                    <Button
                      size="compact-sm"
                      variant="default"
                      onClick={() => {
                        recordLastSent({ at: new Date().toISOString(), entries: savedEntries, method: 'file' })
                        setSavedEntries(0)
                        notify({ color: 'green', title: 'Marked as sent', message: 'This laptop will now remind you about newer entries only.' })
                      }}
                    >
                      Mark my entries as sent
                    </Button>
                  </Group>
                )}
              </Stack>
            </Alert>
          )}
        </SyncCard>

        <SyncCard
          title="Open a file"
          description="Add the contents of a Matchbook file that someone gave you."
          icon={<IconFolderOpen size={18} />}
        >
          <FileInput
            label="Matchbook file"
            placeholder="Choose a file…"
            accept="application/json,.json"
            value={file}
            onChange={(next) => void chooseFile(next)}
            clearable
          />

          {problem && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              {problem}
            </Alert>
          )}

          {opened && (
            <>
              <Alert color="green" variant="light" icon={<IconCheck size={16} />} title="File is ready">
                This file contains <strong>{opened.description}</strong>.
              </Alert>
              <Button onClick={() => void addFile()} loading={isAdding} disabled={!db}>
                Add to this laptop
              </Button>
              {isAdding && <Progress value={progress} size="sm" radius="xl" aria-label="Adding the file" />}
            </>
          )}

          {addedSummary && (
            <Alert color="green" variant="light" icon={<IconCheck size={16} />} title="Added to this laptop">
              {addedSummary}
            </Alert>
          )}
        </SyncCard>
      </SimpleGrid>

      <SyncCard title="How it works" icon={<IconDeviceFloppy size={18} />}>
        <StepList
          steps={[
            { title: 'On the laptop that has the data, press Save file' },
            {
              title: 'Get the file to the other laptop',
              detail: 'Use a USB stick, AirDrop, an email to yourself, or a shared drive. It does not need internet if you use a USB stick.',
            },
            { title: 'On the other laptop, choose the file under Open a file and press Add to this laptop' },
          ]}
        />
        <Text size="xs" c="slate.4">
          Adding the same file twice is safe. Entries you already have are never duplicated.
        </Text>
      </SyncCard>
    </Stack>
  )
}
