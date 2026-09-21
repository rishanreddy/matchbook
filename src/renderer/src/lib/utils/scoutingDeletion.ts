import { createScoutingDeletionSyncRow, type ScoutingDeletionSyncRow } from '../../../../shared/scoutingDeletion'

type DeletionEntry = {
  id: string
  deletedAt: string
}

const OUTBOX_KEY = 'matchbook-scouting-deletion-outbox-v1'
const TOMBSTONE_KEY = 'matchbook-scouting-deletion-tombstones-v1'
const MAX_STORED_DELETIONS = 10_000

function readEntries(key: string): DeletionEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (entry): entry is DeletionEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { id?: unknown }).id === 'string' &&
        (entry as { id: string }).id.length > 0 &&
        typeof (entry as { deletedAt?: unknown }).deletedAt === 'string',
    )
  } catch {
    return []
  }
}

function writeEntries(key: string, entries: DeletionEntry[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(entries.slice(-MAX_STORED_DELETIONS)))
    return true
  } catch {
    return false
  }
}

function upsertEntry(entries: DeletionEntry[], entry: DeletionEntry): DeletionEntry[] {
  return [...entries.filter((existing) => existing.id !== entry.id), entry]
}

/** Remembering a tombstone stops an old copy from reappearing on the hub after a scout syncs. */
export function rememberScoutingDeletion(id: string, deletedAt = new Date().toISOString()): boolean {
  const entry = { id, deletedAt }
  const outboxSaved = writeEntries(OUTBOX_KEY, upsertEntry(readEntries(OUTBOX_KEY), entry))
  const tombstoneSaved = writeEntries(TOMBSTONE_KEY, upsertEntry(readEntries(TOMBSTONE_KEY), entry))
  return outboxSaved && tombstoneSaved
}

export function isScoutingDeletionRemembered(id: string): boolean {
  return readEntries(TOMBSTONE_KEY).some((entry) => entry.id === id)
}

export function getPendingScoutingDeletionRows(): ScoutingDeletionSyncRow[] {
  return readEntries(OUTBOX_KEY).map((entry) => createScoutingDeletionSyncRow(entry.id, entry.deletedAt))
}

/** Keep the tombstone after an upload so an outdated scout copy cannot recreate the record. */
export function acknowledgeScoutingDeletionRows(ids: readonly string[]): void {
  if (ids.length === 0) {
    return
  }

  const acknowledged = new Set(ids)
  void writeEntries(
    OUTBOX_KEY,
    readEntries(OUTBOX_KEY).filter((entry) => !acknowledged.has(entry.id)),
  )
}
