import { create } from 'zustand'
import type { TeamStats } from '../lib/utils/analytics'

interface AnalyticsState {
  statsByEvent: Record<string, TeamStats[]>
  setStatsForEvent: (eventId: string, stats: TeamStats[]) => void
  clearStatsForEvent: (eventId: string) => void
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  statsByEvent: {},
  setStatsForEvent: (eventId, stats) =>
    set((state) => ({
      statsByEvent: {
        ...state.statsByEvent,
        [eventId]: stats,
      },
    })),
  clearStatsForEvent: (eventId) =>
    set((state) => {
      const next = { ...state.statsByEvent }
      delete next[eventId]
      return { statsByEvent: next }
    }),
}))
