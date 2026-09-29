import type { ReactElement } from 'react'
import { useState } from 'react'
import { Alert, Button, FileInput, Group, Modal, Progress, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconDownload, IconFileSpreadsheet, IconTrash, IconUpload } from '@tabler/icons-react'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { downloadTextFile, timestampedFileStem } from '../../lib/utils/download'
import { handleError } from '../../lib/utils/errorHandler'
import { notify } from '../../lib/utils/notify'
import { useDeviceStore } from '../../stores/useDeviceStore'
import { MAX_IMPORT_FILE_BYTES, getCollectionDocs, importPayload, summarizeImport } from './syncData'
import { SyncCard } from './SyncCard'
import { csvRowToScoutingDoc, parseCsv, toCsv, type CsvRow } from './csv'

type AdvancedPanelProps = {
  db: ScoutingDatabase | null
  isHub: boolean
}

export function AdvancedPanel({ db, isHub }: AdvancedPanelProps): ReactElement {
  const deviceName = useDeviceStore((state) => state.deviceName)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearText, setClearText] = useState('')
  const [clearCount, setClearCount] = useState(0)
  const [isClearing, setIsClearing] = useState(false)

  const previewColumns = rows.length > 0 ? Object.keys(rows[0]).slice(0, 5) : []

  const exportCsv = async (): Promise<void> => {
    if (!db) {
      return
    }

    try {
      const entries = await getCollectionDocs(db, 'scoutingData')
      downloadTextFile(toCsv(entries), `scouting-${timestampedFileStem(deviceName)}.csv`, 'text/csv')
      notify({ color: 'green', title: 'Spreadsheet saved', message: `${entries.length.toLocaleString()} entries.` })
    } catch (error: unknown) {
      handleError(error, 'Export spreadsheet')
    }
  }

  const chooseCsv = async (file: File | null): Promise<void> => {
    setRows([])
    setProblem(null)
    setSummary(null)
    if (!file) {
      return
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setProblem('That spreadsheet is larger than 10 MB. Split it and add the parts one at a time.')
      return
    }

    setIsLoading(true)
    try {
      const parsed = parseCsv(await file.text())
      setRows(parsed.rows)
      setProblem(parsed.error)
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : 'That spreadsheet could not be read.')
    } finally {
      setIsLoading(false)
    }
  }

  const importCsv = async (): Promise<void> => {
    if (!db || rows.length === 0) {
      return
    }

    try {
      const docs: Record<string, unknown>[] = []
      let unreadable = 0
      for (const row of rows) {
        const doc = csvRowToScoutingDoc(row)
        if (doc) {
          docs.push(doc)
        } else {
          unreadable += 1
        }
      }

      const result = await importPayload(db, { exportedAt: new Date().toISOString(), collection: 'scoutingData', count: docs.length, data: docs })
      const text = summarizeImport({ ...result, errors: result.errors + unreadable })
      setSummary(text)
      notify({ color: result.errors + unreadable > 0 ? 'yellow' : 'green', title: 'Spreadsheet added', message: text })
    } catch (error: unknown) {
      handleError(error, 'Add spreadsheet')
    }
  }

  const openClear = async (): Promise<void> => {
    if (!db) {
      return
    }

    try {
      setClearCount(await db.collections.scoutingData.count().exec())
      setClearText('')
      setClearOpen(true)
    } catch (error: unknown) {
      handleError(error, 'Prepare to clear scouting entries')
    }
  }

  const clearEntries = async (): Promise<void> => {
    if (!db || clearText.trim().toUpperCase() !== 'DELETE') {
      return
    }

    setIsClearing(true)
    try {
      const docs = await db.collections.scoutingData.find().exec()
      await Promise.all(docs.map(async (doc) => await doc.remove()))
      notify({ color: 'green', title: 'Scouting entries deleted', message: `Removed ${docs.length.toLocaleString()} ${docs.length === 1 ? 'entry' : 'entries'}.` })
      setClearOpen(false)
    } catch (error: unknown) {
      handleError(error, 'Clear scouting entries')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <SyncCard
          title="Save as a spreadsheet"
          description="Open your scouting entries in Excel or Google Sheets."
          icon={<IconFileSpreadsheet size={18} />}
        >
          <Button onClick={() => void exportCsv()} disabled={!db} leftSection={<IconDownload size={16} />} style={{ alignSelf: 'flex-start' }}>
            Save spreadsheet (CSV)
          </Button>
        </SyncCard>

        <SyncCard
          title="Add from a spreadsheet"
          description="Bring in entries from a CSV file with matchNumber and teamNumber columns."
          icon={<IconUpload size={18} />}
        >
          <FileInput label="CSV file" accept=".csv,text/csv" placeholder="Choose a file…" onChange={(file) => void chooseCsv(file)} clearable />
          {isLoading && <Progress value={100} animated size="sm" radius="xl" />}
          {problem && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              {problem}
            </Alert>
          )}
          {rows.length > 0 && (
            <>
              <Text size="sm" c="slate.2">
                {rows.length.toLocaleString()} rows found. First few:
              </Text>
              <Table.ScrollContainer minWidth={320}>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      {previewColumns.map((column) => (
                        <Table.Th key={column}>{column}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.slice(0, 5).map((row, index) => (
                      <Table.Tr key={`${row.id ?? ''}-${index}`}>
                        {previewColumns.map((column) => (
                          <Table.Td key={column}>{row[column]}</Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          )}
          <Button onClick={() => void importCsv()} disabled={!db || rows.length === 0 || Boolean(problem)} style={{ alignSelf: 'flex-start' }}>
            Add these rows
          </Button>
          {summary && (
            <Alert color="blue" variant="light">
              {summary}
            </Alert>
          )}
        </SyncCard>
      </SimpleGrid>

      {isHub && (
        <SyncCard
          title="Start fresh"
          description="Remove every scouting entry from this laptop. Forms, events and the schedule stay."
          icon={<IconTrash size={18} />}
        >
          <Text size="sm" c="slate.2">
            Do this between events, after you have saved a backup. Entries deleted here cannot be brought back.
          </Text>
          <Button color="red" variant="light" onClick={() => void openClear()} disabled={!db} leftSection={<IconTrash size={16} />} style={{ alignSelf: 'flex-start' }}>
            Delete all scouting entries…
          </Button>
        </SyncCard>
      )}

      <Modal opened={clearOpen} onClose={() => !isClearing && setClearOpen(false)} title="Delete all scouting entries?">
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            This permanently deletes {clearCount.toLocaleString()} {clearCount === 1 ? 'entry' : 'entries'} from this laptop.
          </Alert>
          <TextInput label="Type DELETE to confirm" value={clearText} onChange={(event) => setClearText(event.currentTarget.value)} disabled={isClearing} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setClearOpen(false)} disabled={isClearing}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void clearEntries()} loading={isClearing} disabled={clearText.trim().toUpperCase() !== 'DELETE'}>
              Delete everything
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
