import { describe, expect, it } from 'vitest'
import {
  createScoutingDeletionSyncRow,
  getScoutingDeletionId,
  SCOUTING_DELETION_OPERATION_FIELD,
} from './scoutingDeletion'

describe('scouting deletion sync rows', () => {
  it('creates and recognizes an idempotent deletion instruction', () => {
    const row = createScoutingDeletionSyncRow('observation-1', '2026-09-21T12:00:00.000Z')

    expect(getScoutingDeletionId(row)).toBe('observation-1')
  })

  it('does not mistake normal or incomplete scouting rows for deletions', () => {
    expect(getScoutingDeletionId({ id: 'observation-1' })).toBeNull()
    expect(getScoutingDeletionId({ id: 'observation-1', [SCOUTING_DELETION_OPERATION_FIELD]: 'delete' })).toBeNull()
  })
})
