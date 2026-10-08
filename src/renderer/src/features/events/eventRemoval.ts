import type { ScoutingDatabase } from '../../lib/db/collections'
import { useEventStore } from '../../stores/useEventStore'

export type EventDataCounts = {
  matches: number
  assignments: number
  observations: number
}

async function findEventData(db: ScoutingDatabase, eventId: string) {
  const [matches, assignments, observations] = await Promise.all([
    db.collections.matches.find({ selector: { eventId } }).exec(),
    db.collections.assignments.find({ selector: { eventKey: eventId } }).exec(),
    db.collections.scoutingData.find({ selector: { eventId } }).exec(),
  ])
  return { matches, assignments, observations }
}

export async function countEventData(db: ScoutingDatabase, eventId: string): Promise<EventDataCounts> {
  const data = await findEventData(db, eventId)
  return {
    matches: data.matches.length,
    assignments: data.assignments.length,
    observations: data.observations.length,
  }
}

export async function removeLocalEvent({ db, eventId, deleteAssociatedData }: {
  db: ScoutingDatabase
  eventId: string
  deleteAssociatedData: boolean
}): Promise<EventDataCounts> {
  const deleted = { matches: 0, assignments: 0, observations: 0 }

  if (deleteAssociatedData) {
    // Read again at confirmation so data received while the dialog is open is included.
    const data = await findEventData(db, eventId)
    await Promise.all([
      ...data.matches.map((document) => document.remove()),
      ...data.assignments.map((document) => document.remove()),
      ...data.observations.map((document) => document.remove()),
    ])
    deleted.matches = data.matches.length
    deleted.assignments = data.assignments.length
    deleted.observations = data.observations.length
  }

  // Keep the event available for a retry if removing its data fails.
  const event = await db.collections.events.findOne(eventId).exec()
  await event?.remove()

  const selection = useEventStore.getState()
  if (selection.currentEventId === eventId) {
    selection.clearCurrentEvent()
  }

  return deleted
}
