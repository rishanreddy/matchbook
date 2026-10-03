import type { ScoutingDatabase } from '../../lib/db/collections'
import type { AssignmentDocType } from '../../lib/db/schemas/assignments.schema'
import type { MatchDocType } from '../../lib/db/schemas/matches.schema'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { POSITIONS, type PlanChange, type PlanMatch, type Position } from './assign'

export const slotId = (matchKey: string, position: Position): string => `${matchKey}:${position}`

type Alliances = Pick<MatchDocType, 'redAlliance' | 'blueAlliance'>

export function teamKeyAt(match: Alliances, position: Position): string {
  const alliance = position.startsWith('red') ? match.redAlliance : match.blueAlliance
  return alliance[Number(position.slice(-1)) - 1] ?? ''
}

export function toPlanMatch(match: MatchDocType): PlanMatch {
  return {
    key: match.key,
    matchNumber: match.matchNumber,
    teams: Object.fromEntries(POSITIONS.map((position) => [position, teamKeyAt(match, position)])) as PlanMatch['teams'],
  }
}

/** `frc254` is team 254. */
export function teamNumberOf(teamKey: string): number | null {
  const found = teamKey.match(/(\d+)/)
  const value = found ? Number(found[1]) : Number.NaN
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * A time later than `previous`. Scouts' laptops keep the newest copy of an assignment, so every
 * change must carry a later time than the one it replaces, even when two happen in the same
 * millisecond or this laptop's clock is a little behind the one that wrote the old copy.
 */
export function nextTimestamp(previous?: string, now: Date = new Date()): string {
  const current = now.getTime()
  const before = previous ? Date.parse(previous) : Number.NaN
  return new Date(Number.isFinite(before) && before >= current ? before + 1 : current).toISOString()
}

export async function listAssignments(db: ScoutingDatabase, eventKey: string): Promise<AssignmentDocType[]> {
  const docs = await db.collections.assignments.find({ selector: { eventKey } }).exec()
  return docs.map((doc) => doc.toJSON() as AssignmentDocType)
}

function buildAssignment(
  eventKey: string,
  matchKey: string,
  position: Position,
  teamKey: string,
  scout: RosterScoutDocType | null,
  previous: AssignmentDocType | undefined,
): AssignmentDocType {
  return {
    id: slotId(matchKey, position),
    eventKey,
    matchKey,
    alliancePosition: position,
    teamKey,
    // An empty scout means the station is open. It is written, not deleted, so that scouts' laptops hear about it.
    scoutId: scout?.id ?? '',
    deviceId: scout?.deviceId ?? '',
    assignedAt: nextTimestamp(previous?.assignedAt),
  }
}

/** Writes what a plan decided. Returns how many stations were written. */
export async function writeAssignments(
  db: ScoutingDatabase,
  eventKey: string,
  changes: readonly PlanChange[],
  roster: readonly RosterScoutDocType[],
  existing: readonly AssignmentDocType[],
): Promise<number> {
  if (changes.length === 0) {
    return 0
  }

  const scouts = new Map(roster.map((scout) => [scout.id, scout]))
  const previous = new Map(existing.map((assignment) => [assignment.id, assignment]))
  const rows = changes.map((change) =>
    buildAssignment(eventKey, change.matchKey, change.position, change.teamKey, scouts.get(change.scoutId) ?? null, previous.get(slotId(change.matchKey, change.position))),
  )
  await db.collections.assignments.bulkUpsert(rows)
  return rows.length
}

/** Assigns one station by hand, or opens it when `scout` is null. */
export async function setSlot(
  db: ScoutingDatabase,
  slot: { eventKey: string; match: MatchDocType; position: Position; scout: RosterScoutDocType | null },
): Promise<void> {
  const id = slotId(slot.match.key, slot.position)
  const existing = await db.collections.assignments.findOne(id).exec()
  const teamKey = teamKeyAt(slot.match, slot.position)
  if (!existing && !slot.scout) {
    return
  }

  await db.collections.assignments.upsert(buildAssignment(slot.eventKey, slot.match.key, slot.position, teamKey, slot.scout, existing?.toJSON() as AssignmentDocType | undefined))
}

/** Opens every station of an event. Returns how many had somebody. */
export async function releaseAll(db: ScoutingDatabase, eventKey: string): Promise<number> {
  const existing = await listAssignments(db, eventKey)
  const held = existing.filter((assignment) => assignment.scoutId !== '')
  if (held.length === 0) {
    return 0
  }

  await db.collections.assignments.bulkUpsert(
    held.map((assignment) => ({ ...assignment, scoutId: '', deviceId: '', assignedAt: nextTimestamp(assignment.assignedAt) })),
  )
  return held.length
}
