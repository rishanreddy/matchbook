import { describe, expect, it } from 'vitest'
import { csvRowToScoutingDoc, flattenScoutingRow, parseCsv, toCsv } from './csv'

const entry = (id: string, formData: Record<string, unknown>, notes = ''): Record<string, unknown> => ({
  id,
  matchNumber: 12,
  teamNumber: 254,
  autoScore: 2,
  notes,
  formData,
})

describe('toCsv', () => {
  it('gives each form answer its own column', () => {
    expect(flattenScoutingRow(entry('a', { autoMoved: true, teleopScored: 7 }))).toMatchObject({
      'formData.autoMoved': 'true',
      'formData.teleopScored': '7',
    })
  })

  it('keeps columns that only later entries have, instead of dropping them', () => {
    const csv = toCsv([entry('a', { autoMoved: true }), entry('b', { autoMoved: false, brokeDown: true })])
    const [header, first, second] = csv.split('\r\n')

    expect(header.split(',')).toContain('formData.brokeDown')
    expect(first.split(',').length).toBe(header.split(',').length)
    expect(second).toContain('true')
  })

  it('leaves a cell empty when an entry never answered that question', () => {
    const csv = toCsv([entry('a', { autoMoved: true }), entry('b', { brokeDown: true })])
    const parsed = parseCsv(csv)

    expect(parsed.rows[0]['formData.brokeDown']).toBe('')
    expect(parsed.rows[1]['formData.autoMoved']).toBe('')
  })

  it('stops a formula in a scout’s note from running when opened in Excel', () => {
    const csv = toCsv([entry('a', {}, '=HYPERLINK("http://evil.example","click")'), entry('b', {}, '@SUM(1+1)'), entry('c', {}, '-2+3')])
    const rows = parseCsv(csv).rows

    for (const row of rows) {
      expect(row.notes.startsWith("'")).toBe(true)
    }
  })

  it('round-trips commas, quotes and line breaks in notes', () => {
    const note = 'Fast, "smooth" driver\nDrops pieces'
    const rows = parseCsv(toCsv([entry('a', { x: 1 }, note)])).rows

    expect(rows[0].notes).toBe(note)
  })
})

describe('parseCsv', () => {
  it('needs the match and team columns to make sense of a sheet', () => {
    expect(parseCsv('name,score\nAlex,3').error).toMatch(/matchNumber and teamNumber/)
  })

  it('reads a well-formed sheet', () => {
    const parsed = parseCsv('matchNumber,teamNumber,notes\n1,254,Great\n2,971,')

    expect(parsed.error).toBeNull()
    expect(parsed.rows).toHaveLength(2)
  })

  it('refuses an unreasonable number of rows', () => {
    const rows = Array.from({ length: 10_001 }, (_, index) => `${index + 1},254`).join('\n')

    expect(parseCsv(`matchNumber,teamNumber\n${rows}`).error).toMatch(/limited/)
  })
})

describe('csvRowToScoutingDoc', () => {
  it('rebuilds an entry with its form answers', () => {
    const doc = csvRowToScoutingDoc({ matchNumber: '12', teamNumber: '254', 'formData.autoMoved': 'true', notes: 'ok', id: 'abc' })

    expect(doc).toMatchObject({ id: 'abc', matchNumber: 12, teamNumber: 254, notes: 'ok', formData: { autoMoved: 'true' } })
  })

  it.each([
    { matchNumber: '0', teamNumber: '254' },
    { matchNumber: '12', teamNumber: 'frc254' },
    { matchNumber: '1.5', teamNumber: '254' },
    { matchNumber: '', teamNumber: '' },
  ])('rejects a row without a usable match and team: %j', (row) => {
    expect(csvRowToScoutingDoc(row)).toBeNull()
  })

  it('does not trust a placeholder event id', () => {
    expect(csvRowToScoutingDoc({ matchNumber: '1', teamNumber: '2', eventId: 'unknown' })?.eventId).toBe('none')
    expect(csvRowToScoutingDoc({ matchNumber: '1', teamNumber: '2', eventId: '2026casd' })?.eventId).toBe('2026casd')
  })
})
