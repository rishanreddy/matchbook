import type { PlanMatch, Position } from './assign'
import { POSITIONS } from './assign'
import { slotId, teamNumberOf } from './assignmentService'

/** `open`: nobody is assigned. `received`: the entry has arrived. `waiting`: assigned, not here yet. `late`: still not here though later matches have arrived. */
export type SlotStatus = 'open' | 'received' | 'waiting' | 'late'

/** How many matches later an entry must have arrived before an absent one is called late. */
export const LATE_AFTER_MATCHES = 3

export type CoverageEntry = { eventId: string; matchNumber: number; teamNumber: number }

export type Coverage = {
  statuses: Map<string, SlotStatus>
  total: number
  /** Stations with a scout. */
  assigned: number
  /** Stations somebody is assigned to, or whose entry has already arrived. */
  covered: number
  open: number
  received: number
  waiting: number
  late: number
}

/**
 * Joins the plan to the data: for every station, whether somebody is assigned and whether their
 * entry has arrived. An entry counts for a station when it names the same match and team, whoever
 * scouted it, because what matters is that the robot was watched.
 */
export function computeCoverage(
  eventKey: string,
  matches: readonly PlanMatch[],
  assignedScouts: ReadonlyMap<string, string>,
  entries: readonly CoverageEntry[],
): Coverage {
  const here = entries.filter((entry) => entry.eventId === eventKey)
  const received = new Set(here.map((entry) => `${entry.matchNumber}:${entry.teamNumber}`))
  const latestReceived = here.reduce((latest, entry) => Math.max(latest, entry.matchNumber), 0)

  const statuses = new Map<string, SlotStatus>()
  const counts = { total: 0, assigned: 0, covered: 0, open: 0, received: 0, waiting: 0, late: 0 }

  for (const match of matches) {
    for (const position of POSITIONS as readonly Position[]) {
      const teamKey = match.teams[position]
      if (teamKey === '') {
        continue
      }

      counts.total += 1
      const id = slotId(match.key, position)
      const scoutId = assignedScouts.get(id) ?? ''
      const team = teamNumberOf(teamKey)
      const arrived = team !== null && received.has(`${match.matchNumber}:${team}`)

      let status: SlotStatus
      if (scoutId === '' && !arrived) {
        status = 'open'
      } else if (arrived) {
        status = 'received'
      } else if (latestReceived >= match.matchNumber + LATE_AFTER_MATCHES) {
        status = 'late'
      } else {
        status = 'waiting'
      }

      statuses.set(id, status)
      counts[status] += 1
      if (scoutId !== '') {
        counts.assigned += 1
      }
      if (scoutId !== '' || arrived) {
        counts.covered += 1
      }
    }
  }

  return { statuses, ...counts }
}
