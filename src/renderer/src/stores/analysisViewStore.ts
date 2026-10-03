import { Store } from '@tanstack/store'
import type { AnalysisAggregation } from '../lib/utils/analysisConfig'

type AnalysisViewState = {
  selectedEventId: string | null
  metricId: string | null
  search: string
  lowestFirst: boolean
  minimumMatches: number
  comparison: { eventId: string; teamNumbers: number[] } | null
  aggregations: { context: string; values: Record<string, AnalysisAggregation> } | null
}

// Transient view preferences survive route changes without adding them to the
// persisted scouting database or the device's long-lived settings.
export const analysisViewStore = new Store<AnalysisViewState>({
  selectedEventId: null,
  metricId: null,
  search: '',
  lowestFirst: false,
  minimumMatches: 0,
  comparison: null,
  aggregations: null,
})

export function updateAnalysisView(changes: Partial<AnalysisViewState>): void {
  analysisViewStore.setState((current) => ({ ...current, ...changes }))
}

export function resetAnalysisFilters(): void {
  analysisViewStore.setState((current) => ({ ...current, metricId: null, search: '', lowestFirst: false, minimumMatches: 0, aggregations: null }))
}

export function updateAnalysisAggregation(context: string, metricId: string, aggregation: AnalysisAggregation): void {
  analysisViewStore.setState((current) => ({
    ...current,
    aggregations: { context, values: { ...(current.aggregations?.context === context ? current.aggregations.values : {}), [metricId]: aggregation } },
  }))
}

export function toggleComparisonTeam(eventId: string, teamNumber: number): void {
  analysisViewStore.setState((current) => {
    const selected = current.comparison?.eventId === eventId ? current.comparison.teamNumbers : []
    const teamNumbers = selected.includes(teamNumber) ? selected.filter((team) => team !== teamNumber)
      : selected.length < 4 ? [...selected, teamNumber] : selected
    return { ...current, comparison: { eventId, teamNumbers } }
  })
}
