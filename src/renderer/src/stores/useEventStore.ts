import { create } from 'zustand'

interface EventState {
  currentEventId: string | null
  currentSeason: number | null
  isLoaded: boolean
  setCurrentEvent: (eventId: string, season: number) => void
  clearCurrentEvent: () => void
  loadFromStorage: () => void
}

export const useEventStore = create<EventState>((set) => ({
  currentEventId: null,
  currentSeason: null,
  isLoaded: false,
  setCurrentEvent: (eventId, season) => {
    // Persist to localStorage
    localStorage.setItem('matchbook-current-event-id', eventId)
    localStorage.setItem('matchbook-current-season', String(season))
    set({ currentEventId: eventId, currentSeason: season, isLoaded: true })
  },
  clearCurrentEvent: () => {
    localStorage.removeItem('matchbook-current-event-id')
    localStorage.removeItem('matchbook-current-season')
    set({ currentEventId: null, currentSeason: null, isLoaded: true })
  },
  loadFromStorage: () => {
    const currentEventId = localStorage.getItem('matchbook-current-event-id')
    const seasonStr = localStorage.getItem('matchbook-current-season')
    const currentSeason = seasonStr ? parseInt(seasonStr, 10) : null
    set({
      currentEventId,
      currentSeason,
      isLoaded: true,
    })
  },
}))
