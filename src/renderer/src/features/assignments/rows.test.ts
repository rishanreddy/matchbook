import { describe, expect, it } from 'vitest'
import { toCsv } from '../sync/csv'
import { POSITIONS, type PlanMatch } from './assign'
import { buildRows, statusWords, toCsvRows } from './rows'

const match = (matchNumber: number): PlanMatch => ({
  key: `m${matchNumber}`,
  matchNumber,
  teams: Object.fromEntries(POSITIONS.map((position, slot) => [position, `frc${matchNumber}0${slot}`])) as PlanMatch['teams'],
})
const roster = [{ id: 'a', name: 'Alex', deviceId: '', deviceName: '', status: 'active' as const, createdAt: '', updatedAt: '' }]

describe('buildRows', () => {
  it('lists every station that has a team in match order, naming the scout', () => {
    const sparse = match(2)
    sparse.teams.blue3 = ''
    const rows = buildRows([sparse, match(1)], new Map([['m1:red1', 'a'], ['m2:red2', 'gone']]), roster, new Map([['m1:red1', 'received']]))

    expect(rows).toHaveLength(11)
    expect(rows[0]).toMatchObject({ matchNumber: 1, position: 'red1', teamNumber: 100, scoutName: 'Alex', status: 'received' })
    expect(rows.find((row) => row.matchNumber === 2 && row.position === 'red2')?.scoutName).toBe('Unknown scout')
    expect(rows.find((row) => row.matchNumber === 1 && row.position === 'red2')).toMatchObject({ scoutId: '', scoutName: '', status: 'open' })
  })
})

describe('toCsvRows', () => {
  it('writes a spreadsheet grouped by scout, leaving out open stations', () => {
    const rows = buildRows([match(2), match(1)], new Map([['m2:red1', 'a'], ['m1:blue1', 'a']]), roster, new Map([['m1:blue1', 'received'], ['m2:red1', 'waiting']]))
    const csv = toCsv(toCsvRows(rows))
    const lines = csv.trim().split(/\r?\n/)
    expect(lines[0]).toBe('Scout,Match,Station,Team,Status')
    expect(lines.slice(1)).toEqual(['Alex,1,Blue 1,103,Received', 'Alex,2,Red 1,200,Waiting for data'])
  })

  it('has words for every status', () => {
    expect(['open', 'received', 'waiting', 'late'].map((status) => statusWords(status as never))).toEqual(['Open', 'Received', 'Waiting for data', 'Late'])
  })
})
