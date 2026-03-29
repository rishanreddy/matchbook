import { create } from 'zustand'

interface EventState {
  currentEventId: string | null
  currentSeason: number | null
  setCurrentEvent: (eventId: string, season: number) => void
  clearCurrentEvent: () => void
}

export const useEventStore = create<EventState>((set) => ({
  currentEventId: null,
  currentSeason: null,
  setCurrentEvent: (eventId, season) => set({ currentEventId: eventId, currentSeason: season }),
  clearCurrentEvent: () => set({ currentEventId: null, currentSeason: null }),
}))
