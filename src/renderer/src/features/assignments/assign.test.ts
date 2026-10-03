import { describe, expect, it } from 'vitest'
import {
  POSITIONS,
  countLoads,
  findDoubleBookings,
  planAssignments,
  positionLabel,
  type CurrentAssignment,
  type PlanMatch,
  type PlanScout,
} from './assign'

/** `count` matches of six unique teams each. */
function uniqueMatches(count: number): PlanMatch[] {
  return Array.from({ length: count }, (_, index) => {
    const matchNumber = index + 1
    return {
      key: `2026casd_qm${matchNumber}`,
      matchNumber,
      teams: Object.fromEntries(POSITIONS.map((position, slot) => [position, `frc${matchNumber * 10 + slot}`])) as PlanMatch['teams'],
    }
  })
}

/** `count` matches in which twelve teams take turns, like a real schedule where every team plays many times. */
function rotatingMatches(count: number, teamCount = 12): PlanMatch[] {
  return Array.from({ length: count }, (_, index) => {
    const matchNumber = index + 1
    return {
      key: `2026casd_qm${matchNumber}`,
      matchNumber,
      teams: Object.fromEntries(POSITIONS.map((position, slot) => [position, `frc${100 + ((index * 6 + slot) % teamCount)}`])) as PlanMatch['teams'],
    }
  })
}

const scouts = (count: number): PlanScout[] =>
  Array.from({ length: count }, (_, index) => ({ id: `s${String(index + 1).padStart(2, '0')}`, name: `Scout ${String.fromCharCode(65 + index)}`, status: 'active' as const }))

function apply(current: CurrentAssignment[], plan: ReturnType<typeof planAssignments>): CurrentAssignment[] {
  const map = new Map(current.map((assignment) => [`${assignment.matchKey}:${assignment.position}`, assignment]))
  for (const change of plan.changes) {
    map.set(`${change.matchKey}:${change.position}`, { matchKey: change.matchKey, position: change.position, scoutId: change.scoutId })
  }
  return [...map.values()]
}

function loadsOf(people: PlanScout[], assignments: CurrentAssignment[]): number[] {
  return [...countLoads(people, assignments).values()]
}

describe('exactly six scouts', () => {
  const matches = uniqueMatches(12)
  const people = scouts(6)
  const plan = planAssignments(matches, people, [])
  const assignments = apply([], plan)

  it('covers every station in every match', () => {
    expect(plan.filled).toBe(72)
    expect(plan.stillOpen).toBe(0)
    expect(assignments.filter((assignment) => assignment.scoutId !== '')).toHaveLength(72)
  })

  it('never gives one scout two stations in a match', () => {
    expect(findDoubleBookings(assignments).size).toBe(0)
  })

  it('keeps each scout on the same station all event, which is easiest to follow', () => {
    for (const scout of people) {
      const positions = new Set(assignments.filter((assignment) => assignment.scoutId === scout.id).map((assignment) => assignment.position))
      expect(positions.size).toBe(1)
    }
  })

  it('shares the work equally', () => {
    expect(new Set(loadsOf(people, assignments))).toEqual(new Set([12]))
  })
})

describe('more than six scouts', () => {
  it('takes turns resting, so nobody works much more than anybody else', () => {
    const matches = uniqueMatches(30)
    const people = scouts(8)
    const plan = planAssignments(matches, people, [])
    const assignments = apply([], plan)
    const loads = loadsOf(people, assignments)

    expect(plan.stillOpen).toBe(0)
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1)
    expect(findDoubleBookings(assignments).size).toBe(0)
    // Everyone rests sometimes: nobody is in all 30 matches.
    expect(Math.max(...loads)).toBeLessThan(30)
  })

  it('never lets a scout rest two matches in a row more than a rotation requires', () => {
    const matches = uniqueMatches(24)
    const people = scouts(8)
    const assignments = apply([], planAssignments(matches, people, []))
    for (const scout of people) {
      const inMatch = matches.map((match) => assignments.some((assignment) => assignment.matchKey === match.key && assignment.scoutId === scout.id))
      let longestRest = 0
      let rest = 0
      for (const worked of inMatch) {
        rest = worked ? 0 : rest + 1
        longestRest = Math.max(longestRest, rest)
      }
      expect(longestRest).toBeLessThanOrEqual(2)
    }
  })

  it('uses twelve scouts evenly', () => {
    const people = scouts(12)
    const loads = loadsOf(people, apply([], planAssignments(uniqueMatches(24), people, [])))
    expect(new Set(loads)).toEqual(new Set([12]))
  })
})

describe('fewer than six scouts', () => {
  it('covers as many stations as there are scouts and says how many stay open', () => {
    const plan = planAssignments(uniqueMatches(10), scouts(4), [])
    expect(plan.filled).toBe(40)
    expect(plan.stillOpen).toBe(20)
  })

  it('leaves out the teams that have been watched least, so no team is skipped all event', () => {
    const matches = rotatingMatches(24)
    const people = scouts(5)
    const assignments = apply([], planAssignments(matches, people, []))
    const coverage = new Map<string, number>()
    for (const match of matches) {
      for (const position of POSITIONS) {
        const assigned = assignments.find((assignment) => assignment.matchKey === match.key && assignment.position === position)
        if (assigned?.scoutId) {
          coverage.set(match.teams[position], (coverage.get(match.teams[position]) ?? 0) + 1)
        }
      }
    }

    const counts = [...coverage.values()]
    expect(counts).toHaveLength(12)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('leaves every station open when there are no scouts, without failing', () => {
    const plan = planAssignments(uniqueMatches(3), [], [])
    expect(plan).toMatchObject({ filled: 0, moved: 0, stillOpen: 18, availableScouts: 0, changes: [] })
  })

  it('does not use scouts who are away or removed', () => {
    const people: PlanScout[] = [...scouts(6), { id: 'away', name: 'Away', status: 'away' }, { id: 'gone', name: 'Gone', status: 'removed' }]
    const assignments = apply([], planAssignments(uniqueMatches(6), people, []))
    expect(assignments.some((assignment) => assignment.scoutId === 'away' || assignment.scoutId === 'gone')).toBe(false)
  })
})

describe('filling around what is already assigned', () => {
  it('keeps good assignments and only fills the open stations', () => {
    const matches = uniqueMatches(4)
    const people = scouts(6)
    const current: CurrentAssignment[] = [{ matchKey: matches[0].key, position: 'red1', scoutId: 's06' }]
    const plan = planAssignments(matches, people, current)

    expect(plan.changes.find((change) => change.matchKey === matches[0].key && change.position === 'red1')).toBeUndefined()
    expect(plan.filled).toBe(23)
    const assignments = apply(current, plan)
    expect(findDoubleBookings(assignments).size).toBe(0)
    expect(assignments.find((assignment) => assignment.matchKey === matches[0].key && assignment.position === 'red1')?.scoutId).toBe('s06')
  })

  it('does not put a scout in a second station of a match they already have', () => {
    const matches = uniqueMatches(1)
    const people = scouts(6)
    const current: CurrentAssignment[] = [{ matchKey: matches[0].key, position: 'blue3', scoutId: 's01' }]
    const assignments = apply(current, planAssignments(matches, people, current))
    expect(assignments.filter((assignment) => assignment.scoutId === 's01')).toHaveLength(1)
    expect(findDoubleBookings(assignments).size).toBe(0)
  })

  it('counts earlier assignments when sharing the later ones out', () => {
    const matches = uniqueMatches(6)
    const people = scouts(7)
    const first = apply([], planAssignments(matches.slice(0, 3), people, []))
    const all = apply(first, planAssignments(matches, people, first))
    const loads = loadsOf(people, all)
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1)
  })

  it('never fills a station that has already been scouted', () => {
    const matches = uniqueMatches(2)
    const plan = planAssignments(matches, scouts(6), [], { isScouted: (match, position) => match.matchNumber === 1 && position === 'red2' })
    expect(plan.changes.some((change) => change.matchKey === matches[0].key && change.position === 'red2')).toBe(false)
    expect(plan.filled).toBe(11)
  })

  it('is the same every time it is run', () => {
    const matches = rotatingMatches(20)
    const people = scouts(7)
    expect(planAssignments(matches, people, [])).toEqual(planAssignments(matches, people, []))
  })
})

describe('when a scout goes away', () => {
  const matches = uniqueMatches(6)
  const people = scouts(7)
  const planned = apply([], planAssignments(matches, people, []))

  it('hands their matches that have not been scouted to someone else', () => {
    const away = people.map((scout) => (scout.id === 's01' ? { ...scout, status: 'away' as const } : scout))
    const plan = planAssignments(matches, away, planned)
    const after = apply(planned, plan)

    expect(plan.moved).toBeGreaterThan(0)
    expect(after.some((assignment) => assignment.scoutId === 's01')).toBe(false)
    expect(plan.changes.every((change) => change.scoutId !== 's01')).toBe(true)
    expect(findDoubleBookings(after).size).toBe(0)
  })

  it('leaves the matches they already scouted exactly as they were', () => {
    const away = people.map((scout) => (scout.id === 's01' ? { ...scout, status: 'away' as const } : scout))
    const theirs = planned.filter((assignment) => assignment.scoutId === 's01')
    const scouted = new Set(theirs.slice(0, 2).map((assignment) => `${assignment.matchKey}:${assignment.position}`))
    const plan = planAssignments(matches, away, planned, { isScouted: (match, position) => scouted.has(`${match.key}:${position}`) })
    const after = apply(planned, plan)

    for (const slot of scouted) {
      const [matchKey, position] = slot.split(':')
      expect(after.find((assignment) => assignment.matchKey === matchKey && assignment.position === position)?.scoutId).toBe('s01')
    }
  })

  it('writes a station back as open when nobody is left to take it, so scouts’ laptops hear about it', () => {
    const six = scouts(6)
    const full = apply([], planAssignments(matches, six, []))
    const withAway = six.map((scout) => (scout.id === 's06' ? { ...scout, status: 'away' as const } : scout))
    const plan = planAssignments(matches, withAway, full)

    expect(plan.moved).toBe(0)
    expect(plan.stillOpen).toBe(6)
    expect(plan.changes.filter((change) => change.scoutId === '')).toHaveLength(6)
  })

  it('treats an assignment to a scout who is not on the roster at all like one for a scout who is away', () => {
    const current: CurrentAssignment[] = [{ matchKey: matches[0].key, position: 'red1', scoutId: 'nobody' }]
    const plan = planAssignments(matches.slice(0, 1), scouts(6), current)
    expect(plan.moved).toBe(1)
  })
})

describe('rebuilding', () => {
  it('starts over for matches nobody has scouted and keeps the ones that were scouted', () => {
    const matches = uniqueMatches(4)
    const people = scouts(6)
    const original = apply([], planAssignments(matches, people, []))
    const scoutedMatch = matches[0].matchNumber
    const plan = planAssignments(matches, people.slice(0, 5), original, {
      mode: 'rebuild',
      isScouted: (match) => match.matchNumber === scoutedMatch,
    })
    const after = apply(original, plan)

    expect(after.filter((assignment) => assignment.matchKey === matches[0].key)).toEqual(original.filter((assignment) => assignment.matchKey === matches[0].key))
    expect(after.some((assignment) => assignment.scoutId === 's06' && assignment.matchKey !== matches[0].key)).toBe(false)
  })

  it('reports nothing for stations that land on the same scout as before', () => {
    const matches = uniqueMatches(3)
    const people = scouts(6)
    const original = apply([], planAssignments(matches, people, []))
    expect(planAssignments(matches, people, original, { mode: 'rebuild' }).changes).toEqual([])
  })
})

describe('stations the schedule has no team for', () => {
  it('are never assigned, and any old assignment to one is released', () => {
    const matches = uniqueMatches(1)
    matches[0].teams.blue3 = ''
    const current: CurrentAssignment[] = [{ matchKey: matches[0].key, position: 'blue3', scoutId: 's06' }]
    const plan = planAssignments(matches, scouts(6), current)
    expect(plan.changes.find((change) => change.position === 'blue3')).toMatchObject({ scoutId: '' })
    expect(plan.filled).toBe(5)
  })
})

describe('helpers', () => {
  it('labels stations the way scouts say them', () => {
    expect(positionLabel('red1')).toBe('Red 1')
    expect(positionLabel('blue3')).toBe('Blue 3')
  })

  it('finds a scout holding two stations in one match', () => {
    const doubled = findDoubleBookings([
      { matchKey: 'm1', position: 'red1', scoutId: 'a' },
      { matchKey: 'm1', position: 'red2', scoutId: 'a' },
      { matchKey: 'm2', position: 'red1', scoutId: 'a' },
      { matchKey: 'm2', position: 'red2', scoutId: '' },
      { matchKey: 'm2', position: 'red3', scoutId: '' },
    ])
    expect([...doubled.keys()]).toEqual(['m1'])
    expect([...(doubled.get('m1') ?? [])]).toEqual(['a'])
  })

  it('counts how many stations each listed scout holds', () => {
    const loads = countLoads([{ id: 'a' }, { id: 'b' }], [
      { matchKey: 'm1', position: 'red1', scoutId: 'a' },
      { matchKey: 'm2', position: 'red1', scoutId: 'a' },
      { matchKey: 'm2', position: 'red2', scoutId: '' },
      { matchKey: 'm2', position: 'red3', scoutId: 'stranger' },
    ])
    expect([...loads]).toEqual([['a', 2], ['b', 0]])
  })
})
