import type { ScoutingDatabase } from '../../lib/db/collections'

/**
 * Files entries under an event. Used for entries a scout saved with no event selected, which the
 * lead scout's Review Entries and Analysis would otherwise never show for the event in progress.
 * Returns how many were changed.
 */
export async function fileEntriesUnderEvent(db: ScoutingDatabase, entryIds: readonly string[], eventId: string): Promise<number> {
  if (entryIds.length === 0) {
    return 0
  }

  const docs = await db.collections.scoutingData.findByIds([...entryIds]).exec()
  const changed = [...docs.values()].filter((doc) => doc.eventId !== eventId)
  await Promise.all(changed.map((doc) => doc.incrementalPatch({ eventId })))
  return changed.length
}
