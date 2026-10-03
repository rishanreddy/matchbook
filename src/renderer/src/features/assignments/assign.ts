import type { RosterStatus } from '../../lib/db/schemas/roster.schema'

export const POSITIONS = ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'] as const
export type Position = (typeof POSITIONS)[number]

export function positionLabel(position: Position): string {
  return `${position.startsWith('red') ? 'Red' : 'Blue'} ${position.slice(-1)}`
}

export type PlanMatch = {
  key: string
  matchNumber: number
  /** The team at each station, or an empty string when the schedule does not say. */
  teams: Record<Position, string>
}

export type PlanScout = { id: string; name: string; status: RosterStatus }

/** A station's current assignment. An empty `scoutId` means the station is open. */
export type CurrentAssignment = { matchKey: string; position: Position; scoutId: string }

export type PlanChange = {
  matchKey: string
  position: Position
  teamKey: string
  /** Who watches this station, or an empty string to leave it open. */
  scoutId: string
  /** `open`: it had nobody. `moved`: it belonged to a scout who is away or gone, and that match has not been scouted. */
  reason: 'open' | 'moved'
}

export type PlanOptions = {
  /** `fill` keeps every assignment that is still good. `rebuild` starts over for matches nobody has scouted yet. */
  mode?: 'fill' | 'rebuild'
  /** Whether this station's team has already been scouted in this match. Those stations are never changed. */
  isScouted?: (match: PlanMatch, position: Position) => boolean
}

export type Plan = {
  changes: PlanChange[]
  /** Stations given to someone who had nobody. */
  filled: number
  /** Stations taken from a scout who is away or gone and given to someone else. */
  moved: number
  /** Stations that stay open because there are not enough scouts for them. */
  stillOpen: number
  /** How many stations each scout is given by this plan. */
  givenTo: Record<string, number>
  /** Scouts available for matches. */
  availableScouts: number
}

type SlotState = { match: PlanMatch; position: Position; teamKey: string; scoutId: string; scouted: boolean }

const slotKey = (matchKey: string, position: Position): string => `${matchKey}:${position}`

/**
 * Works out who should watch which robot.
 *
 * Every match has six stations and a scout watches one of them. Each match goes to the scouts who
 * have watched the fewest so far, with ties going to whoever has waited longest, so a roster
 * larger than six takes turns resting and a smaller one shares the gaps. A scout keeps the same
 * station from one match to the next when they can, which is easier to follow from the stands.
 * When there are fewer scouts than stations, the stations whose teams have been watched least
 * are covered first, so no team is left out for the whole event.
 *
 * Stations already scouted are never changed, and an assignment held by someone who is away is
 * only taken back when its match has not been scouted yet.
 */
export function planAssignments(
  matches: readonly PlanMatch[],
  scouts: readonly PlanScout[],
  current: readonly CurrentAssignment[],
  options: PlanOptions = {},
): Plan {
  const mode = options.mode ?? 'fill'
  const isScouted = options.isScouted ?? (() => false)
  const available = [...scouts].filter((scout) => scout.status === 'active').sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const availableIds = new Set(available.map((scout) => scout.id))
  const currentBySlot = new Map(current.map((assignment) => [slotKey(assignment.matchKey, assignment.position), assignment.scoutId]))
  const ordered = [...matches].sort((a, b) => a.matchNumber - b.matchNumber || a.key.localeCompare(b.key))

  const load = new Map<string, number>(available.map((scout) => [scout.id, 0]))
  const lastMatchIndex = new Map<string, number>(available.map((scout) => [scout.id, -1]))
  const lastPosition = new Map<string, Position>()
  const teamCoverage = new Map<string, number>()

  const slots: SlotState[][] = ordered.map((match) =>
    POSITIONS.map((position) => ({
      match,
      position,
      teamKey: match.teams[position],
      scoutId: currentBySlot.get(slotKey(match.key, position)) ?? '',
      scouted: isScouted(match, position),
    })),
  )

  // What stays: everything that is still good. The rest is open for planning.
  const kept: boolean[][] = slots.map((matchSlots) =>
    matchSlots.map((slot) => {
      if (slot.scoutId === '') {
        return false
      }

      if (slot.scouted) {
        return true
      }

      // The schedule has no team here, so nobody can watch it.
      if (slot.teamKey === '') {
        return false
      }

      return mode === 'fill' && availableIds.has(slot.scoutId)
    }),
  )

  slots.forEach((matchSlots, matchIndex) =>
    matchSlots.forEach((slot, slotIndex) => {
      if (!kept[matchIndex][slotIndex]) {
        return
      }

      load.set(slot.scoutId, (load.get(slot.scoutId) ?? 0) + 1)
      if (slot.teamKey) {
        teamCoverage.set(slot.teamKey, (teamCoverage.get(slot.teamKey) ?? 0) + 1)
      }
    }),
  )

  const changes: PlanChange[] = []
  const givenTo: Record<string, number> = {}
  let filled = 0
  let moved = 0
  let stillOpen = 0

  slots.forEach((matchSlots, matchIndex) => {
    const busyHere = new Set<string>()
    matchSlots.forEach((slot, slotIndex) => {
      if (kept[matchIndex][slotIndex]) {
        busyHere.add(slot.scoutId)
        lastPosition.set(slot.scoutId, slot.position)
        lastMatchIndex.set(slot.scoutId, matchIndex)
      }
    })

    const wanted = matchSlots.filter((slot, slotIndex) => !kept[matchIndex][slotIndex] && slot.teamKey !== '' && !slot.scouted)
    // A station whose assignment is being given up must be written back as open if nobody takes it.
    const giveUp = (slot: SlotState): void => {
      if (slot.scoutId !== '') {
        changes.push({ matchKey: slot.match.key, position: slot.position, teamKey: slot.teamKey, scoutId: '', reason: 'moved' })
      }
    }

    // A station the schedule has no team for cannot be watched, so any old assignment to it is released.
    matchSlots.forEach((slot, slotIndex) => {
      if (!kept[matchIndex][slotIndex] && slot.teamKey === '' && !slot.scouted) {
        giveUp(slot)
      }
    })

    if (wanted.length === 0) {
      return
    }

    const candidates = available.filter((scout) => !busyHere.has(scout.id))
    const taking = candidates.length >= wanted.length ? wanted : [...wanted].sort((a, b) => (teamCoverage.get(a.teamKey) ?? 0) - (teamCoverage.get(b.teamKey) ?? 0) || POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position)).slice(0, candidates.length)
    const skipped = wanted.filter((slot) => !taking.includes(slot))
    skipped.forEach((slot) => {
      stillOpen += 1
      giveUp(slot)
    })

    const chosen = [...candidates]
      .sort(
        (a, b) =>
          (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) ||
          (lastMatchIndex.get(a.id) ?? -1) - (lastMatchIndex.get(b.id) ?? -1) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, taking.length)

    const open = [...taking].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position))
    const pairs = new Map<SlotState, PlanScout>()

    // Keep a scout where they stood last time, if that station is among those being filled.
    for (const scout of chosen) {
      const wantedPosition = lastPosition.get(scout.id)
      const slot = open.find((candidate) => candidate.position === wantedPosition && !pairs.has(candidate))
      if (slot) {
        pairs.set(slot, scout)
      }
    }

    const unplaced = chosen.filter((scout) => ![...pairs.values()].includes(scout))
    const remaining = open.filter((slot) => !pairs.has(slot)).sort((a, b) => (teamCoverage.get(a.teamKey) ?? 0) - (teamCoverage.get(b.teamKey) ?? 0) || POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position))
    unplaced.forEach((scout, index) => pairs.set(remaining[index], scout))

    for (const [slot, scout] of pairs) {
      // A rebuild that lands on the same scout changes nothing, so it is not reported as a change.
      if (slot.scoutId !== scout.id) {
        const reason = slot.scoutId === '' ? 'open' : 'moved'
        changes.push({ matchKey: slot.match.key, position: slot.position, teamKey: slot.teamKey, scoutId: scout.id, reason })
        if (reason === 'open') {
          filled += 1
        } else {
          moved += 1
        }
        givenTo[scout.id] = (givenTo[scout.id] ?? 0) + 1
      }

      load.set(scout.id, (load.get(scout.id) ?? 0) + 1)
      lastMatchIndex.set(scout.id, matchIndex)
      lastPosition.set(scout.id, slot.position)
      if (slot.teamKey) {
        teamCoverage.set(slot.teamKey, (teamCoverage.get(slot.teamKey) ?? 0) + 1)
      }
    }
  })

  return { changes, filled, moved, stillOpen, givenTo, availableScouts: available.length }
}

/** How many stations each scout holds, counting only scouts in the list. */
export function countLoads(scouts: readonly { id: string }[], assignments: readonly CurrentAssignment[]): Map<string, number> {
  const loads = new Map(scouts.map((scout) => [scout.id, 0]))
  for (const assignment of assignments) {
    if (assignment.scoutId !== '' && loads.has(assignment.scoutId)) {
      loads.set(assignment.scoutId, (loads.get(assignment.scoutId) ?? 0) + 1)
    }
  }
  return loads
}

/** Matches in which one scout holds more than one station, which one person cannot watch. */
export function findDoubleBookings(assignments: readonly CurrentAssignment[]): Map<string, Set<string>> {
  const seen = new Map<string, Map<string, number>>()
  for (const assignment of assignments) {
    if (assignment.scoutId === '') {
      continue
    }

    const inMatch = seen.get(assignment.matchKey) ?? new Map<string, number>()
    inMatch.set(assignment.scoutId, (inMatch.get(assignment.scoutId) ?? 0) + 1)
    seen.set(assignment.matchKey, inMatch)
  }

  const doubled = new Map<string, Set<string>>()
  for (const [matchKey, scouts] of seen) {
    const ids = [...scouts].filter(([, count]) => count > 1).map(([id]) => id)
    if (ids.length > 0) {
      doubled.set(matchKey, new Set(ids))
    }
  }
  return doubled
}
