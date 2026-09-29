import { Store } from '@tanstack/store'

export type AnalysisSortKey = 'total' | 'auto' | 'teleop' | 'endgame' | 'matches'

type AnalysisViewState = {
  selectedEventId: string | null
  sortBy: AnalysisSortKey
  search: string
}

// Transient view preferences survive route changes without adding them to the
// persisted scouting database or the device's long-lived settings.
export const analysisViewStore = new Store<AnalysisViewState>({
  selectedEventId: null,
  sortBy: 'total',
  search: '',
})

export function updateAnalysisView(changes: Partial<AnalysisViewState>): void {
  analysisViewStore.setState((current) => ({ ...current, ...changes }))
}
