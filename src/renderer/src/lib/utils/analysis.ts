import type { ScoutingDataDocType } from '../db/schemas/scoutingData.schema'
import type { EventDocType } from '../db/schemas/events.schema'
import { extractSurveyAnalysisFields, type AnalysisFieldConfig, type AnalysisFieldDefinition } from './analysisConfig'
import { hasScorableFields } from './scoring'

export type AnalysisObservation = ScoutingDataDocType
export type NumericAggregation = 'average' | 'sum' | 'min' | 'max'
export type BooleanAggregation = 'truePercent' | 'trueCount' | 'responseCount'

type MetricIdentity = { id: string; label: string }
export type AnalysisMetric =
  | (MetricIdentity & { kind: 'score'; phase: 'total' | 'auto' | 'teleop' | 'endgame' })
  | (MetricIdentity & { kind: 'matches' })
  | (MetricIdentity & { kind: 'numericField'; fieldName: string; aggregation: NumericAggregation })
  | (MetricIdentity & { kind: 'booleanField'; fieldName: string; aggregation: BooleanAggregation })
  | (MetricIdentity & { kind: 'responseField'; fieldName: string })

export type MetricSummary =
  | { kind: 'missing'; value: null; sampleCount: 0 }
  | { kind: 'number'; value: number; sampleCount: number }
  | { kind: 'percentage'; value: number; sampleCount: number; yesCount: number }

export type AnalysisTeam = {
  teamNumber: number
  observations: AnalysisObservation[]
  matchCount: number
  averageAuto: number
  averageTeleop: number
  averageEndgame: number
  averageTotal: number
  lowestTotal: number
  highestTotal: number
}
export type RankedTeam = AnalysisTeam & { metric: MetricSummary; rank: number | null }

const TOTAL_METRIC = { kind: 'score', id: 'total', label: 'Average total', phase: 'total' } satisfies AnalysisMetric
const MATCHES_METRIC = { kind: 'matches', id: 'matches', label: 'Matches scouted' } satisfies AnalysisMetric
export const SCORE_METRICS: AnalysisMetric[] = [
  TOTAL_METRIC,
  { kind: 'score', id: 'auto', label: 'Average auto', phase: 'auto' },
  { kind: 'score', id: 'teleop', label: 'Average teleop', phase: 'teleop' },
  { kind: 'score', id: 'endgame', label: 'Average endgame', phase: 'endgame' },
  MATCHES_METRIC,
]

export function readAnalysisNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

export function recordedTotal(observation: AnalysisObservation): number {
  return observation.autoScore + observation.teleopScore + observation.endgameScore
}

function matchCount(observations: AnalysisObservation[]): number {
  return new Set(observations.filter((observation) => observation.matchNumber > 0)
    .map((observation) => JSON.stringify([observation.eventId, observation.matchNumber]))).size
}

export function summarizeAnalysisTeams(observations: AnalysisObservation[]): AnalysisTeam[] {
  const grouped = new Map<number, AnalysisObservation[]>()
  for (const observation of observations) {
    const team = grouped.get(observation.teamNumber) ?? []
    team.push(observation)
    grouped.set(observation.teamNumber, team)
  }
  return Array.from(grouped, ([teamNumber, entries]) => {
    const totals = entries.map(recordedTotal)
    return {
      teamNumber,
      observations: [...entries].sort((left, right) => left.matchNumber - right.matchNumber || left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)),
      matchCount: matchCount(entries),
      averageAuto: mean(entries.map((entry) => entry.autoScore)),
      averageTeleop: mean(entries.map((entry) => entry.teleopScore)),
      averageEndgame: mean(entries.map((entry) => entry.endgameScore)),
      averageTotal: mean(totals),
      lowestTotal: Math.min(...totals),
      highestTotal: Math.max(...totals),
    }
  })
}

function fieldLabel(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (first) => first.toUpperCase())
}

/** Collected answers remain usable even when this laptop has no copy of the form. */
export function discoverAnalysisFields(observations: AnalysisObservation[], surveyJson: Record<string, unknown> | null): AnalysisFieldDefinition[] {
  const fields = new Map((surveyJson ? extractSurveyAnalysisFields(surveyJson) : []).map((field) => [field.name, field]))
  const valuesByName = new Map<string, unknown[]>()
  for (const observation of observations) {
    for (const [name, value] of Object.entries(observation.formData)) {
      if (name.startsWith('_') || !hasAnswer(value)) continue
      const values = valuesByName.get(name) ?? []
      values.push(value)
      valuesByName.set(name, values)
    }
  }
  for (const [name, values] of valuesByName) {
    const valueKind = values.every((value) => typeof value === 'boolean') ? 'boolean'
      : values.every((value) => readAnalysisNumber(value) !== null) ? 'number' : 'text'
    const declared = fields.get(name)
    // Native expressions and choices can return numbers, booleans or words. Use their
    // actual saved result type, retaining the form's title and known numeric-input types.
    if (!declared) fields.set(name, { name, title: fieldLabel(name), questionType: 'collected', valueKind })
    else if (['expression', 'calculated', 'radiogroup', 'dropdown', 'imagepicker', 'boolean', 'rating'].includes(declared.questionType)) {
      fields.set(name, { ...declared, valueKind })
    }
  }
  return [...fields.values()]
}

export function buildAnalysisMetrics(fields: AnalysisFieldDefinition[], configs: AnalysisFieldConfig[]): AnalysisMetric[] {
  const configsByName = new Map(configs.map((config) => [config.fieldName, config]))
  const fieldMetrics = fields.flatMap<AnalysisMetric>((field) => {
    const config = configsByName.get(field.name)
    const identity = { id: `field:${field.name}`, fieldName: field.name, label: field.title }
    if (field.valueKind === 'number') {
      const saved = config?.aggregation
      const aggregation = saved === 'sum' || saved === 'min' || saved === 'max' ? saved : 'average'
      return [{ ...identity, kind: 'numericField', aggregation }]
    }
    if (field.valueKind === 'boolean') return [{ ...identity, kind: 'booleanField', aggregation: 'truePercent' }]
    return config?.enabled ? [{ ...identity, kind: 'responseField' }] : []
  })
  return [...SCORE_METRICS, ...fieldMetrics]
}

export function hasRecordedPhaseScores(observations: AnalysisObservation[]): boolean {
  return observations.some((observation) => recordedTotal(observation) > 0 || hasScorableFields(observation.formData))
}

export function applyAnalysisAggregation(metric: AnalysisMetric, aggregation: unknown): AnalysisMetric {
  if (metric.kind === 'numericField' && (aggregation === 'average' || aggregation === 'sum' || aggregation === 'min' || aggregation === 'max')) {
    return { ...metric, aggregation }
  }
  if (metric.kind === 'booleanField' && (aggregation === 'truePercent' || aggregation === 'trueCount' || aggregation === 'responseCount')) {
    return { ...metric, aggregation }
  }
  return metric
}

export function chooseAnalysisMetric(metrics: AnalysisMetric[], observations: AnalysisObservation[], requestedId: string | null): AnalysisMetric {
  const requested = metrics.find((metric) => metric.id === requestedId)
  const hasScores = hasRecordedPhaseScores(observations)
  if (requested && (requested.kind !== 'score' || hasScores)) return requested
  if (hasScores) return TOTAL_METRIC
  return metrics.find((metric) => metric.kind !== 'score' && metric.kind !== 'matches' && summarizeMetric(observations, metric).value !== null)
    ?? MATCHES_METRIC
}

export function summarizeMetric(observations: AnalysisObservation[], metric: AnalysisMetric): MetricSummary {
  if (observations.length === 0) return { kind: 'missing', value: null, sampleCount: 0 }
  if (metric.kind === 'matches') {
    const count = matchCount(observations)
    return { kind: 'number', value: count, sampleCount: count }
  }
  if (metric.kind === 'score') {
    const values = observations.map((observation) => {
      switch (metric.phase) {
        case 'total': return recordedTotal(observation)
        case 'auto': return observation.autoScore
        case 'teleop': return observation.teleopScore
        case 'endgame': return observation.endgameScore
      }
    })
    return { kind: 'number', value: mean(values), sampleCount: values.length }
  }
  const answers = observations.map((observation) => observation.formData[metric.fieldName])
  if (metric.kind === 'responseField') {
    const count = answers.filter(hasAnswer).length
    return count === 0 ? { kind: 'missing', value: null, sampleCount: 0 } : { kind: 'number', value: count, sampleCount: count }
  }
  if (metric.kind === 'booleanField') {
    const validAnswers = answers.filter((answer): answer is boolean => typeof answer === 'boolean')
    if (validAnswers.length === 0) return { kind: 'missing', value: null, sampleCount: 0 }
    const yesCount = validAnswers.filter(Boolean).length
    if (metric.aggregation === 'truePercent') return { kind: 'percentage', value: yesCount / validAnswers.length * 100, sampleCount: validAnswers.length, yesCount }
    return { kind: 'number', value: metric.aggregation === 'trueCount' ? yesCount : validAnswers.length, sampleCount: validAnswers.length }
  }
  const values = answers.map(readAnalysisNumber).filter((value): value is number => value !== null)
  if (values.length === 0) return { kind: 'missing', value: null, sampleCount: 0 }
  let value: number
  switch (metric.aggregation) {
    case 'average': value = mean(values); break
    case 'sum': value = values.reduce((sum, answer) => sum + answer, 0); break
    case 'min': value = Math.min(...values); break
    case 'max': value = Math.max(...values); break
  }
  return { kind: 'number', value, sampleCount: values.length }
}

export function rankAnalysisTeams(teams: AnalysisTeam[], metric: AnalysisMetric, lowestFirst: boolean): RankedTeam[] {
  const rows = teams.map((team) => ({ ...team, metric: summarizeMetric(team.observations, metric) }))
    .sort((left, right) => {
      if (left.metric.value === null) return right.metric.value === null ? left.teamNumber - right.teamNumber : 1
      if (right.metric.value === null) return -1
      return (lowestFirst ? left.metric.value - right.metric.value : right.metric.value - left.metric.value) || left.teamNumber - right.teamNumber
    })
  let rank = 0
  return rows.map((row, index) => {
    if (row.metric.value !== null && (index === 0 || row.metric.value !== rows[index - 1].metric.value)) rank = index + 1
    return { ...row, rank: row.metric.value === null ? null : rank }
  })
}

export function resolveAnalysisEvent({ requestedEventId, currentEventId, events, observations }: {
  requestedEventId: string | null; currentEventId: string | null; events: EventDocType[]; observations: AnalysisObservation[]
}): string {
  const available = new Set([...events.map((event) => event.id), ...observations.map((observation) => observation.eventId)])
  if (requestedEventId === 'all') return 'all'
  if (requestedEventId && available.has(requestedEventId)) return requestedEventId
  if (currentEventId && available.has(currentEventId)) return currentEventId
  return 'all'
}

export function formatAnalysisValue(result: MetricSummary): string {
  if (result.value === null) return 'No data'
  if (result.kind === 'percentage') return `${result.value.toFixed(0)}%`
  return result.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

export function analysisMetricDescription(metric: AnalysisMetric): string {
  switch (metric.kind) {
    case 'score': return 'Average of the saved phase totals in each observation. These are recorded activity counts, not official FRC match points.'
    case 'matches': return 'Distinct recorded match numbers. Multiple scouts observing the same match count as one match.'
    case 'responseField': return 'Number of observations with an answer to this question. Missing answers are excluded.'
    case 'booleanField': return metric.aggregation === 'truePercent' ? 'Percentage of recorded yes/no answers that are Yes. Missing answers are excluded.'
      : metric.aggregation === 'trueCount' ? 'Number of recorded Yes answers. Teams with more observations may have higher counts.'
        : 'Number of recorded yes/no answers, including No.'
    case 'numericField': {
      const labels: Record<NumericAggregation, string> = {
        average: 'Average of the recorded answers.', sum: 'Sum of the recorded answers. Teams with more observations may have higher totals.',
        min: 'Lowest recorded answer.', max: 'Highest recorded answer.',
      }
      return `${labels[metric.aggregation]} Missing answers are excluded.`
    }
  }
}
