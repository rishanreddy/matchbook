import { describe, expect, it } from 'vitest'
import type { AssignmentDocType } from '../../lib/db/schemas/assignments.schema'
import type { MatchDocType } from '../../lib/db/schemas/matches.schema'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { buildMyAssignments } from './mine'

const match = (matchNumber: number): MatchDocType => ({
  key: `2026casd_qm${matchNumber}`,
  eventId: '2026casd',
  matchNumber,
  compLevel: 'qm',
  predictedTime: '',
  redAlliance: [`frc${matchNumber}01`, `frc${matchNumber}02`, `frc${matchNumber}03`],
  blueAlliance: [`frc${matchNumber}04`, `frc${matchNumber}05`, `frc${matchNumber}06`],
  createdAt: '',
})

const assignment = (matchNumber: number, position: AssignmentDocType['alliancePosition'], scoutId: string, deviceId = '', eventKey = '2026casd'): AssignmentDocType => ({
  id: `2026casd_qm${matchNumber}:${position}`,
  eventKey,
  matchKey: `2026casd_qm${matchNumber}`,
  alliancePosition: position,
  teamKey: '',
  scoutId,
  deviceId,
  assignedAt: '2026-03-14T10:00:00.000Z',
})

const scout = (id: string, deviceId: string, status: RosterScoutDocType['status'] = 'active'): RosterScoutDocType => ({
  id,
  name: id,
  deviceId,
  deviceName: '',
  status,
  createdAt: '',
  updatedAt: '',
})

const base = {
  eventId: '2026casd',
  deviceId: 'device_me' as string | null,
  roster: [scout('scout_me', 'device_me'), scout('scout_other', 'device_other')],
  matches: [match(1), match(2), match(3), match(4)],
  entries: [] as Array<{ eventId: string; deviceId: string; matchNumber: number; teamNumber: number }>,
}

describe('buildMyAssignments', () => {
  it('lists this laptop’s matches in order, with the station and the team', () => {
    const list = buildMyAssignments({ ...base, assignments: [assignment(3, 'blue2', 'scout_me'), assignment(1, 'red1', 'scout_me'), assignment(2, 'red2', 'scout_other')] })
    expect(list.map((row) => [row.matchNumber, row.positionLabel, row.teamNumber])).toEqual([
      [1, 'Red 1', 101],
      [3, 'Blue 2', 305],
    ])
  })

  it('marks what is done, what is next and what comes after', () => {
    const list = buildMyAssignments({
      ...base,
      assignments: [assignment(1, 'red1', 'scout_me'), assignment(2, 'red1', 'scout_me'), assignment(3, 'red1', 'scout_me')],
      entries: [{ eventId: '2026casd', deviceId: 'device_me', matchNumber: 1, teamNumber: 101 }],
    })
    expect(list.map((row) => row.status)).toEqual(['done', 'next', 'upcoming'])
  })

  it('only counts entries this laptop saved as done, not ones another laptop scouted', () => {
    const list = buildMyAssignments({
      ...base,
      assignments: [assignment(1, 'red1', 'scout_me')],
      entries: [{ eventId: '2026casd', deviceId: 'device_other', matchNumber: 1, teamNumber: 101 }],
    })
    expect(list[0].status).toBe('next')
  })

  it('finds an assignment by the laptop even when the roster has no scout for it', () => {
    const list = buildMyAssignments({ ...base, roster: [], assignments: [assignment(1, 'red1', 'someone', 'device_me')] })
    expect(list).toHaveLength(1)
  })

  it('ignores open stations, other events and matches that are not in the schedule', () => {
    const list = buildMyAssignments({
      ...base,
      assignments: [assignment(1, 'red1', ''), assignment(2, 'red1', 'scout_me', '', '2026other'), assignment(9, 'red1', 'scout_me')],
    })
    expect(list).toEqual([])
  })

  it('finds nothing for a laptop with no scout, or for a scout who was removed', () => {
    expect(buildMyAssignments({ ...base, deviceId: null, assignments: [assignment(1, 'red1', 'scout_me')] })).toEqual([])
    expect(buildMyAssignments({ ...base, roster: [scout('scout_me', 'device_me', 'removed')], assignments: [assignment(1, 'red1', 'scout_me')] })).toEqual([])
  })
})
