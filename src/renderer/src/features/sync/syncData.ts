import type { ScoutingDatabase } from '../../lib/db/collections'
import { getScoutingDeletionId } from '../../../../shared/scoutingDeletion'
import { NETWORK_SYNC_COLLECTIONS, isSyncCollection, type SyncCollection, type SyncPayload } from '../../../../shared/syncProtocol'
import {
  getPendingScoutingDeletionRows,
  isScoutingDeletionRemembered,
  rememberScoutingDeletion,
} from '../../lib/utils/scoutingDeletion'

export const ALL_COLLECTIONS: readonly SyncCollection[] = NETWORK_SYNC_COLLECTIONS
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 10_000

export type ImportResult = {
  inserted: number
  updated: number
  duplicates: number
  errors: number
  errorMessages: string[]
}

export type TransferTask = {
  collection: SyncCollection
  rows: Record<string, unknown>[]
}

export type TransferDocument = {
  tasks: TransferTask[]
}

export type SnapshotFile = {
  exportedAt: string
  version: 2
  collections: Partial<Record<SyncCollection, Record<string, unknown>[]>>
}

const NOUNS: Record<SyncCollection, readonly [string, string]> = {
  scoutingData: ['scouting entry', 'scouting entries'],
  formSchemas: ['scouting form', 'scouting forms'],
  analysisConfigs: ['analysis setting', 'analysis settings'],
  events: ['event', 'events'],
  matches: ['match', 'matches'],
  assignments: ['scout assignment', 'scout assignments'],
}

export const COLLECTION_LABELS: Record<SyncCollection, string> = {
  scoutingData: 'Scouting entries',
  formSchemas: 'Scouting forms',
  analysisConfigs: 'Analysis settings',
  events: 'Events',
  matches: 'Match schedule',
  assignments: 'Scout assignments',
}

export function countLabel(collection: SyncCollection, count: number): string {
  const [singular, plural] = NOUNS[collection]
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

/** Corrections travel beside entries as delete instructions; they are not entries themselves. */
function splitCorrections(task: TransferTask): { entries: number; corrections: number } {
  if (task.collection !== 'scoutingData') {
    return { entries: task.rows.length, corrections: 0 }
  }

  const corrections = task.rows.filter((row) => getScoutingDeletionId(row) !== null).length
  return { entries: task.rows.length - corrections, corrections }
}

/** How many scouting entries a transfer carries, not counting corrections. */
export function countEntries(document: TransferDocument): number {
  return document.tasks.filter((task) => task.collection === 'scoutingData').reduce((total, task) => total + splitCorrections(task).entries, 0)
}

export function describeTransfer(document: TransferDocument): string {
  const parts: string[] = []
  for (const task of document.tasks) {
    const { entries, corrections } = splitCorrections(task)
    if (entries > 0) {
      parts.push(countLabel(task.collection, entries))
    }
    if (corrections > 0) {
      parts.push(`${corrections.toLocaleString()} ${corrections === 1 ? 'correction' : 'corrections'}`)
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing to add'
}

export function mergeImportResults(results: ImportResult[]): ImportResult {
  return results.reduce<ImportResult>(
    (acc, result) => ({
      inserted: acc.inserted + result.inserted,
      updated: acc.updated + result.updated,
      duplicates: acc.duplicates + result.duplicates,
      errors: acc.errors + result.errors,
      errorMessages: [...acc.errorMessages, ...result.errorMessages],
    }),
    { inserted: 0, updated: 0, duplicates: 0, errors: 0, errorMessages: [] },
  )
}

export function summarizeImport(result: ImportResult): string {
  const parts: string[] = []
  if (result.inserted > 0) parts.push(`${result.inserted.toLocaleString()} added`)
  if (result.updated > 0) parts.push(`${result.updated.toLocaleString()} updated`)
  if (result.duplicates > 0) parts.push(`${result.duplicates.toLocaleString()} already here`)
  if (result.errors > 0) parts.push(`${result.errors.toLocaleString()} could not be read`)
  return parts.length > 0 ? parts.join(', ') + '.' : 'Nothing new to add.'
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((row) => typeof row === 'object' && row !== null)
}

/**
 * Reads either shape Matchbook moves around: a single-collection payload (what the
 * network hub and QR codes carry) or a multi-collection snapshot (what a saved file
 * holds). Both go through here so every route into the app validates the same way.
 */
export function parseTransferDocument(value: unknown): TransferDocument {
  if (typeof value !== 'object' || value === null) {
    throw new Error('That does not look like a Matchbook file.')
  }

  const parsed = value as { collection?: unknown; data?: unknown; collections?: Record<string, unknown> }
  const tasks = new Map<SyncCollection, Record<string, unknown>[]>()

  if (parsed.collection !== undefined || parsed.data !== undefined) {
    if (!isSyncCollection(parsed.collection)) {
      throw new Error('This file names a kind of data Matchbook does not recognise.')
    }
    if (!isRecordArray(parsed.data)) {
      throw new Error('This file’s data is not in the expected format.')
    }
    if (parsed.data.length > MAX_IMPORT_ROWS) {
      throw new Error(`Files are limited to ${MAX_IMPORT_ROWS.toLocaleString()} records of each kind.`)
    }
    tasks.set(parsed.collection, parsed.data)
  }

  if (parsed.collections !== undefined) {
    if (typeof parsed.collections !== 'object' || parsed.collections === null) {
      throw new Error('This file’s data is not in the expected format.')
    }

    for (const collection of ALL_COLLECTIONS) {
      const rows = parsed.collections[collection]
      if (rows === undefined) {
        continue
      }
      if (!isRecordArray(rows)) {
        throw new Error(`The ${COLLECTION_LABELS[collection].toLowerCase()} in this file are not in the expected format.`)
      }
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Files are limited to ${MAX_IMPORT_ROWS.toLocaleString()} records of each kind.`)
      }
      tasks.set(collection, rows)
    }
  }

  if (tasks.size === 0) {
    throw new Error('That does not look like a Matchbook file.')
  }

  return { tasks: Array.from(tasks, ([collection, rows]) => ({ collection, rows })) }
}

export function parseTransferText(text: string): TransferDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That does not look like a Matchbook file.')
  }

  return parseTransferDocument(parsed)
}

export async function getCollectionDocs(db: ScoutingDatabase, collection: SyncCollection): Promise<Record<string, unknown>[]> {
  switch (collection) {
    case 'scoutingData':
      return (await db.collections.scoutingData.find().exec()).map((doc) => doc.toJSON())
    case 'formSchemas':
      return (await db.collections.formSchemas.find().exec()).map((doc) => doc.toJSON())
    case 'analysisConfigs':
      return (await db.collections.analysisConfigs.find().exec()).map((doc) => doc.toJSON())
    case 'events':
      return (await db.collections.events.find().exec()).map((doc) => doc.toJSON())
    case 'matches':
      return (await db.collections.matches.find().exec()).map((doc) => doc.toJSON())
    case 'assignments':
      return (await db.collections.assignments.find().exec()).map((doc) => doc.toJSON())
    default:
      throw new Error(`Unsupported collection: ${String(collection)}`)
  }
}

export async function buildPayload(db: ScoutingDatabase, collection: SyncCollection): Promise<SyncPayload> {
  const data = await getCollectionDocs(db, collection)
  const deletionRows = collection === 'scoutingData' ? getPendingScoutingDeletionRows() : []
  const rows = [...data, ...deletionRows]
  return {
    exportedAt: new Date().toISOString(),
    collection,
    count: rows.length,
    data: rows,
  }
}

export async function buildSnapshot(db: ScoutingDatabase, collections: readonly SyncCollection[]): Promise<SnapshotFile> {
  const included: SnapshotFile['collections'] = {}
  for (const collection of collections) {
    const rows = await getCollectionDocs(db, collection)
    // Corrections ride along so a file cannot bring back an entry that was deleted.
    included[collection] = collection === 'scoutingData' ? [...rows, ...getPendingScoutingDeletionRows()] : rows
  }

  return { exportedAt: new Date().toISOString(), version: 2, collections: included }
}

export function snapshotRowCount(snapshot: SnapshotFile): number {
  return Object.values(snapshot.collections).reduce((total, rows) => total + (rows?.length ?? 0), 0)
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.max(0, Math.trunc(parsed))
}

function extractMatchNumberFromKey(value: string): number {
  const lowered = value.toLowerCase()
  const stageMatch = lowered.match(/(?:^|_)(?:qm|qf|sf|f)(\d+)(?:$|_)/)
  if (stageMatch) {
    const parsed = Number(stageMatch[1])
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  const lastNumber = lowered.match(/(\d+)(?!.*\d)/)
  if (!lastNumber) {
    return 0
  }

  const parsed = Number(lastNumber[1])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

function extractTeamNumberFromKey(value: string): number {
  const frcMatch = value.toLowerCase().match(/frc(\d+)/)
  if (frcMatch) {
    const parsed = Number(frcMatch[1])
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  const anyNumber = value.match(/(\d+)/)
  if (!anyNumber) {
    return 0
  }

  const parsed = Number(anyNumber[1])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

function getPrimaryFieldName(collection: SyncCollection): 'id' | 'key' {
  return collection === 'matches' ? 'key' : 'id'
}

function isDuplicateInsertError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '')
    if (code.toUpperCase() === 'CONFLICT') {
      return true
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('conflict') || message.includes('duplicate') || message.includes('already exists')
  }

  return false
}

export function normalizeScoutingDataRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const id = typeof row.id === 'string' && row.id.length > 0 ? row.id : crypto.randomUUID()
  const timestamp = typeof row.timestamp === 'string' && row.timestamp.length > 0 ? row.timestamp : new Date().toISOString()
  const createdAt = typeof row.createdAt === 'string' && row.createdAt.length > 0 ? row.createdAt : timestamp
  const matchNumberRaw = Number(row.matchNumber)
  const teamNumberRaw = Number(row.teamNumber)

  const matchNumber =
    Number.isInteger(matchNumberRaw) && matchNumberRaw > 0
      ? matchNumberRaw
      : extractMatchNumberFromKey(String(row.matchKey ?? ''))
  const teamNumber =
    Number.isInteger(teamNumberRaw) && teamNumberRaw > 0 ? teamNumberRaw : extractTeamNumberFromKey(String(row.teamKey ?? ''))

  if (!Number.isInteger(matchNumber) || !Number.isInteger(teamNumber) || matchNumber < 1 || teamNumber < 1) {
    return null
  }

  const formData = typeof row.formData === 'object' && row.formData !== null ? (row.formData as Record<string, unknown>) : {}
  const notes = typeof row.notes === 'string' ? row.notes : ''
  const eventId =
    typeof row.eventId === 'string' && row.eventId.length > 0 && row.eventId !== 'unknown' && row.eventId !== 'null'
      ? row.eventId
      : 'none'
  const deviceId = typeof row.deviceId === 'string' && row.deviceId.length > 0 ? row.deviceId : 'unknown'

  return {
    id,
    eventId,
    deviceId,
    matchNumber,
    teamNumber,
    timestamp,
    autoScore: toNonNegativeInteger(row.autoScore),
    teleopScore: toNonNegativeInteger(row.teleopScore),
    endgameScore: toNonNegativeInteger(row.endgameScore),
    formData,
    notes,
    createdAt,
  }
}

function normalizeEventRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const id =
    typeof row.id === 'string' && row.id.length > 0 ? row.id : typeof row.key === 'string' && row.key.length > 0 ? row.key : ''

  if (!id) {
    return null
  }

  const now = new Date().toISOString()
  const currentSeason = new Date().getFullYear()
  const seasonRaw = Number(row.season)

  return {
    id,
    name: typeof row.name === 'string' ? row.name : id,
    season: Number.isInteger(seasonRaw) && seasonRaw > 1990 ? seasonRaw : currentSeason,
    startDate: typeof row.startDate === 'string' ? row.startDate : '',
    endDate: typeof row.endDate === 'string' ? row.endDate : '',
    syncedAt: typeof row.syncedAt === 'string' ? row.syncedAt : now,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : now,
  }
}

/**
 * Adds a payload's rows to this laptop's database.
 *
 * Scouting entries are never overwritten (a second copy of the same entry counts as
 * "already here"), while forms, events, schedules and assignments update in place.
 * Deletions travel beside observations as idempotent instructions, and a tombstone is
 * kept so an old scout copy cannot recreate a correction the next time it uploads.
 */
export async function importPayload(
  db: ScoutingDatabase,
  payload: SyncPayload,
  forcedCollection?: SyncCollection,
): Promise<ImportResult> {
  const collection = forcedCollection ?? payload.collection
  const result: ImportResult = { inserted: 0, updated: 0, duplicates: 0, errors: 0, errorMessages: [] }
  const primaryField = getPrimaryFieldName(collection)

  const enforceSingleActiveFormSchema = async (row: Record<string, unknown>): Promise<void> => {
    if (collection !== 'formSchemas' || row.isActive !== true) {
      return
    }

    const activeSchemaId = typeof row.id === 'string' ? row.id : ''
    if (!activeSchemaId) {
      return
    }

    const nowIso = new Date().toISOString()
    const activeDocs = await db.collections.formSchemas.find({ selector: { isActive: true } }).exec()
    await Promise.all(
      activeDocs
        .filter((doc) => doc.primary !== activeSchemaId)
        .map(async (doc) => {
          const docJson = doc.toJSON()
          await db.collections.formSchemas.upsert({
            ...docJson,
            isActive: false,
            updatedAt: nowIso,
          })
        }),
    )
  }

  const findExisting = async (id: string) => {
    switch (collection) {
      case 'scoutingData':
        return db.collections.scoutingData.findOne(id).exec()
      case 'formSchemas':
        return db.collections.formSchemas.findOne(id).exec()
      case 'analysisConfigs':
        return db.collections.analysisConfigs.findOne(id).exec()
      case 'events':
        return db.collections.events.findOne(id).exec()
      case 'matches':
        return db.collections.matches.findOne(id).exec()
      case 'assignments':
        return db.collections.assignments.findOne(id).exec()
      default:
        throw new Error(`Unsupported collection: ${String(collection)}`)
    }
  }

  const insertRow = async (row: Record<string, unknown>) => {
    switch (collection) {
      case 'scoutingData':
        await db.collections.scoutingData.insert(row as never)
        return
      case 'formSchemas':
        await db.collections.formSchemas.insert(row as never)
        return
      case 'analysisConfigs':
        await db.collections.analysisConfigs.insert(row as never)
        return
      case 'events':
        await db.collections.events.insert(row as never)
        return
      case 'matches':
        await db.collections.matches.insert(row as never)
        return
      case 'assignments':
        await db.collections.assignments.insert(row as never)
        return
      default:
        throw new Error(`Unsupported collection: ${String(collection)}`)
    }
  }

  const updateExistingRow = async (row: Record<string, unknown>): Promise<'updated' | 'failed' | 'not-supported'> => {
    if (collection === 'scoutingData') {
      return 'not-supported'
    }

    try {
      switch (collection) {
        case 'formSchemas':
          await db.collections.formSchemas.upsert(row as never)
          return 'updated'
        case 'analysisConfigs':
          await db.collections.analysisConfigs.upsert(row as never)
          return 'updated'
        case 'events':
          await db.collections.events.upsert(row as never)
          return 'updated'
        case 'matches':
          await db.collections.matches.upsert(row as never)
          return 'updated'
        case 'assignments':
          await db.collections.assignments.upsert(row as never)
          return 'updated'
        default:
          return 'not-supported'
      }
    } catch (error: unknown) {
      result.errors += 1
      result.errorMessages.push(error instanceof Error ? error.message : `Failed updating existing ${collection} row.`)
      return 'failed'
    }
  }

  for (const sourceRow of payload.data) {
    let row = sourceRow

    const deletedObservationId = collection === 'scoutingData' ? getScoutingDeletionId(sourceRow) : null
    if (deletedObservationId) {
      const deletedAt = typeof sourceRow.deletedAt === 'string' ? sourceRow.deletedAt : new Date().toISOString()
      rememberScoutingDeletion(deletedObservationId, deletedAt)
      const existing = await findExisting(deletedObservationId)
      if (existing) {
        await existing.remove()
        result.updated += 1
      } else {
        result.duplicates += 1
      }
      continue
    }

    if (collection === 'scoutingData') {
      const normalizedScoutingDataRow = normalizeScoutingDataRow(sourceRow)
      if (!normalizedScoutingDataRow) {
        result.errors += 1
        result.errorMessages.push('Scouting data row is missing required match/team identifiers.')
        continue
      }
      row = normalizedScoutingDataRow
    }

    if (collection === 'events') {
      const normalizedEventRow = normalizeEventRow(sourceRow)
      if (!normalizedEventRow) {
        result.errors += 1
        result.errorMessages.push('Event row is missing required identifier.')
        continue
      }
      row = normalizedEventRow
    }

    const primaryValue = row[primaryField]
    const primaryId = typeof primaryValue === 'string' ? primaryValue : ''
    if (!primaryId) {
      result.errors += 1
      result.errorMessages.push(`Row missing required ${primaryField} field.`)
      continue
    }

    if (collection === 'scoutingData' && isScoutingDeletionRemembered(primaryId)) {
      result.duplicates += 1
      continue
    }

    const existing = await findExisting(primaryId)

    if (existing) {
      const updateOutcome = await updateExistingRow(row)
      if (updateOutcome === 'updated') {
        await enforceSingleActiveFormSchema(row)
        result.updated += 1
        continue
      }

      if (updateOutcome === 'failed') {
        continue
      }

      result.duplicates += 1
      continue
    }

    try {
      await insertRow(row)
      await enforceSingleActiveFormSchema(row)
      result.inserted += 1
    } catch (error: unknown) {
      if (isDuplicateInsertError(error)) {
        result.duplicates += 1
      } else {
        result.errors += 1
        result.errorMessages.push(error instanceof Error ? error.message : 'Unknown import error.')
      }
    }
  }

  return result
}

/** Adds every collection in a transfer, reporting progress as a fraction from 0 to 1. */
export async function importTransfer(
  db: ScoutingDatabase,
  document: TransferDocument,
  onProgress?: (fraction: number) => void,
): Promise<ImportResult> {
  const results: ImportResult[] = []
  for (let index = 0; index < document.tasks.length; index += 1) {
    const task = document.tasks[index]
    results.push(
      await importPayload(db, {
        exportedAt: new Date().toISOString(),
        collection: task.collection,
        count: task.rows.length,
        data: task.rows,
      }),
    )
    onProgress?.((index + 1) / document.tasks.length)
  }

  return mergeImportResults(results)
}
