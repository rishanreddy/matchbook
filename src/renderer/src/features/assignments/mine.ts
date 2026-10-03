import type { AssignmentDocType } from '../../lib/db/schemas/assignments.schema'
import type { MatchDocType } from '../../lib/db/schemas/matches.schema'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { scoutsForDevice } from '../roster/rosterService'
import { positionLabel, type Position } from './assign'
import { teamKeyAt, teamNumberOf } from './assignmentService'

export type MyAssignment = {
  matchKey: string
  matchNumber: number
  position: Position
  positionLabel: string
  teamNumber: number
  /** `done`: this laptop has the entry. `next`: the first one still to do. `upcoming`: after that. */
  status: 'done' | 'next' | 'upcoming'
}

type EntryRef = { eventId: string; deviceId: string; matchNumber: number; teamNumber: number }

/**
 * The matches assigned to whoever is at this laptop, in match order. A laptop finds its own by the
 * scout the lead scout linked to it, or by the laptop itself when the assignment names one, so an
 * assignment still arrives for a scout who was renamed or re-added.
 */
export function buildMyAssignments(input: {
  eventId: string
  deviceId: string | null
  roster: readonly RosterScoutDocType[]
  assignments: readonly AssignmentDocType[]
  matches: readonly MatchDocType[]
  entries: readonly EntryRef[]
}): MyAssignment[] {
  const myScoutIds = new Set(scoutsForDevice(input.roster, input.deviceId).map((scout) => scout.id))
  const matchesByKey = new Map(input.matches.map((match) => [match.key, match]))
  const mine = input.assignments.filter(
    (assignment) =>
      assignment.eventKey === input.eventId &&
      assignment.scoutId !== '' &&
      (myScoutIds.has(assignment.scoutId) || (input.deviceId !== null && assignment.deviceId !== '' && assignment.deviceId === input.deviceId)),
  )

  const done = new Set(
    input.entries.filter((entry) => entry.eventId === input.eventId && entry.deviceId === input.deviceId).map((entry) => `${entry.matchNumber}:${entry.teamNumber}`),
  )

  const rows = mine
    .map((assignment) => {
      const match = matchesByKey.get(assignment.matchKey)
      const position = assignment.alliancePosition
      const teamNumber = match ? teamNumberOf(teamKeyAt(match, position)) : null
      return match && teamNumber !== null ? { match, position, teamNumber } : null
    })
    .filter((row): row is { match: MatchDocType; position: Position; teamNumber: number } => row !== null)
    .sort((a, b) => a.match.matchNumber - b.match.matchNumber)

  let nextTaken = false
  return rows.map(({ match, position, teamNumber }) => {
    const finished = done.has(`${match.matchNumber}:${teamNumber}`)
    const status: MyAssignment['status'] = finished ? 'done' : nextTaken ? 'upcoming' : 'next'
    if (!finished) {
      nextTaken = true
    }

    return { matchKey: match.key, matchNumber: match.matchNumber, position, positionLabel: positionLabel(position), teamNumber, status }
  })
}
