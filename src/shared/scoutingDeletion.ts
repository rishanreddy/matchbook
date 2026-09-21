/** A compact, idempotent instruction carried inside a scouting-data sync payload. */
export const SCOUTING_DELETION_OPERATION = 'delete' as const
export const SCOUTING_DELETION_OPERATION_FIELD = '__matchbookSyncOperation' as const

export type ScoutingDeletionSyncRow = {
  id: string
  deletedAt: string
  [SCOUTING_DELETION_OPERATION_FIELD]: typeof SCOUTING_DELETION_OPERATION
}

export function createScoutingDeletionSyncRow(id: string, deletedAt: string): ScoutingDeletionSyncRow {
  return {
    id,
    deletedAt,
    [SCOUTING_DELETION_OPERATION_FIELD]: SCOUTING_DELETION_OPERATION,
  }
}

/** Returns the deleted record id only for a well-formed deletion instruction. */
export function getScoutingDeletionId(row: Record<string, unknown>): string | null {
  if (
    row[SCOUTING_DELETION_OPERATION_FIELD] !== SCOUTING_DELETION_OPERATION ||
    typeof row.id !== 'string' ||
    row.id.trim().length === 0 ||
    typeof row.deletedAt !== 'string' ||
    row.deletedAt.trim().length === 0
  ) {
    return null
  }

  return row.id
}
