import { create } from 'zustand'
import { initializeDatabase } from '../lib/db/database'
import type { ScoutingDatabase } from '../lib/db/collections'

interface DatabaseState {
  db: ScoutingDatabase | null
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  initialize: () => Promise<void>
}

export const useDatabaseStore = create<DatabaseState>((set) => ({
  db: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  initialize: async () => {
    set({ isLoading: true, error: null })
    try {
      const db = await initializeDatabase()
      set({ db, isLoading: false, isInitialized: true })
    } catch (error: unknown) {
      set({
        isLoading: false,
        isInitialized: false,
        error: error instanceof Error ? error.message : 'Database initialization failed',
      })
    }
  },
}))
