import { describe, expect, it } from 'vitest'
import { applyAnalysisAggregation, buildAnalysisMetrics, chooseAnalysisMetric, discoverAnalysisFields, formatAnalysisValue, rankAnalysisTeams, readAnalysisNumber, resolveAnalysisEvent, summarizeAnalysisTeams, summarizeMetric, type AnalysisMetric, type AnalysisObservation } from './analysis'
import type { EventDocType } from '../db/schemas/events.schema'
import { createScoutSurvey } from '../forms/scoutSurvey'

const numericMetric = { kind: 'numericField', id: 'field:pieces', label: 'Pieces', fieldName: 'pieces', aggregation: 'average' } satisfies AnalysisMetric
const booleanMetric = { kind: 'booleanField', id: 'field:climbed', label: 'Climbed', fieldName: 'climbed', aggregation: 'truePercent' } satisfies AnalysisMetric

function observation(changes: Partial<AnalysisObservation> = {}): AnalysisObservation {
  return { id: 'entry', eventId: 'event-a', deviceId: 'scout-1', teamNumber: 254, matchNumber: 1,
    autoScore: 0, teleopScore: 0, endgameScore: 0, timestamp: '2026-09-30T12:00:00.000Z',
    createdAt: '2026-09-30T12:00:00.000Z', formData: {}, notes: '', ...changes }
}

function event(id: string): EventDocType {
  return { id, name: id, season: 2026, startDate: '2026-03-01', endDate: '2026-03-03', syncedAt: '', createdAt: '' }
}

describe('analysis evidence', () => {
  it('keeps empty, invalid, and nonfinite answers out of numeric averages', () => {
    const values: unknown[] = ['', '   ', null, undefined, 'unknown', Number.NaN, Number.POSITIVE_INFINITY, false]
    expect(values.map(readAnalysisNumber)).toEqual(values.map(() => null))
    const entries = [0, ' 6 ', '', null, 'unknown'].map((pieces) => observation({ formData: { pieces } }))
    expect(summarizeMetric(entries, numericMetric)).toEqual({ kind: 'number', value: 3, sampleCount: 2 })
  })

  it('distinguishes a recorded zero from a missing answer', () => {
    const result = summarizeMetric([observation({ formData: { pieces: 0 } })], numericMetric)
    expect(result.value).toBe(0)
    expect(formatAnalysisValue(result)).toBe('0')
    expect(formatAnalysisValue(summarizeMetric([observation()], numericMetric))).toBe('No data')
  })

  it('compares yes rates using only actual boolean answers', () => {
    const entries = [true, false, true, '', null, 'false'].map((climbed) => observation({ formData: { climbed } }))
    const result = summarizeMetric(entries, booleanMetric)
    expect(result).toMatchObject({ kind: 'percentage', sampleCount: 3, yesCount: 2 })
    expect(result.value).toBeCloseTo(200 / 3)
    expect(formatAnalysisValue(result)).toBe('67%')
    expect(summarizeMetric([observation({ formData: { climbed: false } })], booleanMetric).value).toBe(0)
    expect(summarizeMetric([observation()], booleanMetric).value).toBeNull()
  })

  it('supports numeric summaries and rejects aggregation modes for another value kind', () => {
    const entries = [2, 6].map((pieces) => observation({ formData: { pieces } }))
    expect(summarizeMetric(entries, applyAnalysisAggregation(numericMetric, 'max')).value).toBe(6)
    expect(summarizeMetric(entries, applyAnalysisAggregation(numericMetric, 'min')).value).toBe(2)
    expect(summarizeMetric(entries, applyAnalysisAggregation(numericMetric, 'sum')).value).toBe(8)
    expect(applyAnalysisAggregation(numericMetric, 'trueCount')).toEqual(numericMetric)
    expect(applyAnalysisAggregation(booleanMetric, 'sum')).toEqual(booleanMetric)
  })

  it('counts duplicate observations as evidence without claiming they are separate matches', () => {
    const entries = [observation({ id: 'a', autoScore: 2 }), observation({ id: 'b', autoScore: 6 }),
      observation({ id: 'c', matchNumber: 2, autoScore: 10 }), observation({ id: 'd', eventId: 'event-b', autoScore: 2 }),
      observation({ id: 'unassigned', matchNumber: 0 })]
    const [team] = summarizeAnalysisTeams(entries)
    expect(team.matchCount).toBe(3)
    expect(team.observations).toHaveLength(5)
    expect(team.averageTotal).toBe(4)
  })

  it('uses recorded match numbers for order rather than the order entries arrived', () => {
    const [team] = summarizeAnalysisTeams([observation({ matchNumber: 25 }), observation({ matchNumber: 7 }), observation({ matchNumber: 13 })])
    expect(team.observations.map((entry) => entry.matchNumber)).toEqual([7, 13, 25])
  })

  it('keeps missing values last in either ranking direction and gives tied values the same rank', () => {
    const teams = summarizeAnalysisTeams([observation({ teamNumber: 111, formData: { pieces: 4 } }),
      observation({ teamNumber: 254, formData: { pieces: 4 } }), observation({ teamNumber: 364, formData: { pieces: 0 } }), observation({ teamNumber: 1678 })])
    expect(rankAnalysisTeams(teams, numericMetric, false).map(({ teamNumber, rank }) => [teamNumber, rank])).toEqual([[111, 1], [254, 1], [364, 3], [1678, null]])
    expect(rankAnalysisTeams(teams, numericMetric, true).map(({ teamNumber, rank }) => [teamNumber, rank])).toEqual([[364, 1], [111, 2], [254, 2], [1678, null]])
  })

  it('supports negative form values without converting them into missing data', () => {
    expect(summarizeMetric([observation({ formData: { pieces: '-2' } })], numericMetric).value).toBe(-2)
  })

  it('discovers collected numeric and yes/no answers when the form is unavailable', () => {
    const fields = discoverAnalysisFields([observation({ formData: { gamePieces: '4', climbed: false, comments: 'Strong defense', _internal: 5 } })], null)
    expect(fields.map((field) => [field.name, field.valueKind, field.title])).toEqual([
      ['gamePieces', 'number', 'Game Pieces'], ['climbed', 'boolean', 'Climbed'], ['comments', 'text', 'Comments'],
    ])
    const metrics = buildAnalysisMetrics(fields, [])
    expect(metrics.map((metric) => metric.id)).toContain('field:gamePieces')
    expect(metrics.map((metric) => metric.id)).toContain('field:climbed')
    expect(metrics.map((metric) => metric.id)).not.toContain('field:comments')
  })

  it('keeps the real question title and value kind when a form exists', () => {
    const fields = discoverAnalysisFields([observation({ formData: { pieces: '4' } })], { elements: [{ type: 'text', inputType: 'number', name: 'pieces', title: 'Game pieces scored' }] })
    expect(fields[0].title).toBe('Game pieces scored')
    expect(fields[0].valueKind).toBe('number')
  })

  it('offers saved native expressions and calculations using their real result types', () => {
    const form = {
      elements: [
        { type: 'text', inputType: 'number', name: 'pieces' },
        { type: 'expression', name: 'weighted', title: 'Weighted scoring', expression: '{pieces} * 3' },
        { type: 'expression', name: 'reliable', title: 'Reliable output', expression: '{pieces} >= 3' },
        { type: 'expression', name: 'classification', expression: "iif({pieces} >= 3, 'Strong', 'Developing')" },
      ],
      calculatedValues: [
        { name: 'piecesTotal', expression: '{pieces} + 1', includeIntoResult: true },
        { name: 'internalOnly', expression: '{pieces} * 2' },
      ],
    }
    const model = createScoutSurvey(form)
    model.setValue('pieces', '4')
    model.doComplete()
    const entries = [observation({ formData: model.data })]
    const fields = discoverAnalysisFields(entries, form)
    const metrics = buildAnalysisMetrics(fields, [])
    expect(fields.find((field) => field.name === 'weighted')).toMatchObject({ title: 'Weighted scoring', valueKind: 'number' })
    expect(fields.find((field) => field.name === 'reliable')?.valueKind).toBe('boolean')
    expect(fields.find((field) => field.name === 'classification')?.valueKind).toBe('text')
    expect(fields.some((field) => field.name === 'internalOnly')).toBe(false)
    expect(summarizeMetric(entries, metrics.find((metric) => metric.id === 'field:weighted')!).value).toBe(12)
    expect(summarizeMetric(entries, metrics.find((metric) => metric.id === 'field:reliable')!).value).toBe(100)
    expect(summarizeMetric(entries, metrics.find((metric) => metric.id === 'field:piecesTotal')!).value).toBe(5)
    expect(metrics.some((metric) => metric.id === 'field:classification')).toBe(false)
    model.dispose()
  })

  it('uses valueName, numeric choice values and native sliders before any answers arrive', () => {
    const fields = discoverAnalysisFields([], { elements: [
      { type: 'dropdown', name: 'level', valueName: 'height', title: 'Scoring height', choices: [{ value: 1, text: 'Low' }, { value: 3, text: 'High' }] },
      { type: 'slider', name: 'cycleSeconds', title: 'Cycle duration' },
      { type: 'boolean', name: 'success', valueTrue: 1, valueFalse: 0 },
    ] })
    expect(fields.map((field) => [field.name, field.valueKind])).toEqual([['height', 'number'], ['cycleSeconds', 'number'], ['success', 'number']])
    expect(fields[0].title).toBe('Scoring height')
  })

  it('keeps dynamic-template children and static groups out of top-level metric discovery', () => {
    const fields = discoverAnalysisFields([], { elements: [
      { type: 'panel', name: 'group', elements: [{ type: 'text', name: 'pieces', inputType: 'number' }] },
      { type: 'paneldynamic', name: 'cycles', templateElements: [{ type: 'text', name: 'perCycle', inputType: 'number' }] },
    ], calculatedValues: [{ name: 'cycleTotal', expression: "sumInArray({cycles}, 'perCycle')", includeIntoResult: true }] })
    expect(fields.map((field) => field.name)).toEqual(['pieces', 'cycles', 'cycleTotal'])
    expect(buildAnalysisMetrics(fields, []).map((metric) => metric.id)).toContain('field:cycleTotal')
    expect(buildAnalysisMetrics(fields, []).map((metric) => metric.id)).not.toContain('field:perCycle')
  })

  it('offers numeric metrics without requiring users to enable charts in Settings', () => {
    const fields = discoverAnalysisFields([observation({ formData: { pieces: 4 } })], null)
    const metrics = buildAnalysisMetrics(fields, [{ fieldName: 'pieces', fieldLabel: 'Pieces', valueKind: 'number', enabled: false, chartType: 'line', aggregation: 'average' }])
    expect(metrics.some((metric) => metric.id === 'field:pieces')).toBe(true)
  })

  it('starts with a usable form metric when no phase scores exist', () => {
    const entries = [observation({ formData: { pieces: 4 } })]
    const metrics = buildAnalysisMetrics(discoverAnalysisFields(entries, null), [])
    expect(chooseAnalysisMetric(metrics, entries, null).id).toBe('field:pieces')
    expect(chooseAnalysisMetric(metrics, entries, 'total').id).toBe('field:pieces')
  })

  it('treats a legitimate all-zero scoring form as recorded scores', () => {
    const entries = [observation({ formData: { autoPieces: 0 } })]
    expect(chooseAnalysisMetric(buildAnalysisMetrics([], []), entries, null).id).toBe('total')
  })

  it('falls back to coverage when there are no recorded metrics', () => {
    expect(chooseAnalysisMetric(buildAnalysisMetrics([], []), [observation()], null).id).toBe('matches')
    expect(summarizeAnalysisTeams([])).toEqual([])
  })
})

describe('analysis event scope', () => {
  it('follows the current event even when only another event has observations', () => {
    expect(resolveAnalysisEvent({ requestedEventId: null, currentEventId: 'event-a', events: [event('event-a'), event('event-b')], observations: [observation({ eventId: 'event-b' })] })).toBe('event-a')
  })

  it('honors an explicit event or the all-events choice', () => {
    const context = { currentEventId: 'event-a', events: [event('event-a'), event('event-b')], observations: [observation()] }
    expect(resolveAnalysisEvent({ ...context, requestedEventId: 'event-b' })).toBe('event-b')
    expect(resolveAnalysisEvent({ ...context, requestedEventId: 'all' })).toBe('all')
  })

  it('shows all events after clearing or deleting the current event instead of choosing another', () => {
    expect(resolveAnalysisEvent({ requestedEventId: null, currentEventId: null, events: [event('event-a')], observations: [observation()] })).toBe('all')
    expect(resolveAnalysisEvent({ requestedEventId: 'deleted', currentEventId: null, events: [], observations: [observation({ eventId: 'received-event' })] })).toBe('all')
    expect(resolveAnalysisEvent({ requestedEventId: 'deleted', currentEventId: 'deleted', events: [], observations: [] })).toBe('all')
  })

  it('allows reviewing an explicit event received without its metadata', () => {
    expect(resolveAnalysisEvent({ requestedEventId: 'received-event', currentEventId: null, events: [], observations: [observation({ eventId: 'received-event' })] })).toBe('received-event')
  })
})
