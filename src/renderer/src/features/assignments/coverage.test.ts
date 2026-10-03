import { describe, expect, it } from 'vitest'
import { POSITIONS, type PlanMatch } from './assign'
import { LATE_AFTER_MATCHES, computeCoverage } from './coverage'

const match = (matchNumber: number): PlanMatch => ({
  key: `2026casd_qm${matchNumber}`,
  matchNumber,
  teams: Object.fromEntries(POSITIONS.map((position, slot) => [position, `frc${matchNumber * 10 + slot}`])) as PlanMatch['teams'],
})

const assigned = (...slots: Array<[PlanMatch, string, string]>): Map<string, string> =>
  new Map(slots.map(([m, position, scoutId]) => [`${m.key}:${position}`, scoutId]))

describe('computeCoverage', () => {
  const m1 = match(1)
  const m5 = match(5)

  it('says which stations are open, waiting and received', () => {
    const coverage = computeCoverage('2026casd', [m1], assigned([m1, 'red1', 'a'], [m1, 'red2', 'b']), [{ eventId: '2026casd', matchNumber: 1, teamNumber: 10 }])
    expect(coverage.statuses.get(`${m1.key}:red1`)).toBe('received')
    expect(coverage.statuses.get(`${m1.key}:red2`)).toBe('waiting')
    expect(coverage.statuses.get(`${m1.key}:red3`)).toBe('open')
    expect(coverage).toMatchObject({ total: 6, assigned: 2, covered: 2, open: 4, received: 1, waiting: 1, late: 0 })
  })

  it('counts an entry from anyone, since what matters is that the robot was watched', () => {
    const coverage = computeCoverage('2026casd', [m1], assigned(), [{ eventId: '2026casd', matchNumber: 1, teamNumber: 12 }])
    expect(coverage.statuses.get(`${m1.key}:red3`)).toBe('received')
    expect(coverage.assigned).toBe(0)
    // Nobody was assigned, but the robot was watched, so the station is covered.
    expect(coverage.covered).toBe(1)
  })

  it('calls a station late once later matches have arrived without it', () => {
    const slots = assigned([m1, 'red1', 'a'])
    const early = computeCoverage('2026casd', [m1, m5], slots, [{ eventId: '2026casd', matchNumber: 1 + LATE_AFTER_MATCHES - 1, teamNumber: 99 }])
    expect(early.statuses.get(`${m1.key}:red1`)).toBe('waiting')

    const later = computeCoverage('2026casd', [m1, m5], slots, [{ eventId: '2026casd', matchNumber: 1 + LATE_AFTER_MATCHES, teamNumber: 99 }])
    expect(later.statuses.get(`${m1.key}:red1`)).toBe('late')
    expect(later.late).toBe(1)
  })

  it('ignores entries from another event', () => {
    const coverage = computeCoverage('2026casd', [m1], assigned([m1, 'red1', 'a']), [{ eventId: '2026other', matchNumber: 1, teamNumber: 10 }])
    expect(coverage.received).toBe(0)
  })

  it('skips stations the schedule has no team for', () => {
    const sparse = match(2)
    sparse.teams.blue3 = ''
    expect(computeCoverage('2026casd', [sparse], assigned(), []).total).toBe(5)
  })
})
