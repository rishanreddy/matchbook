import { create } from 'zustand'
import { initializeDatabase } from '../lib/db/database'
import type { ScoutingDatabase } from '../lib/db/collections'
import { handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'

interface DatabaseState {
  db: ScoutingDatabase | null
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  initialize: () => Promise<void>
  clearState: () => void
  setError: (message: string) => void
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  db: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  initialize: async () => {
    const { isLoading, isInitialized, db } = get()
    if (isLoading || isInitialized || db) {
      return
    }

    logger.info('Database initialization started')
    set({ isLoading: true, error: null })
    try {
      const db = await initializeDatabase()
      logger.info('Database initialization completed')
      set({ db, isLoading: false, isInitialized: true })
    } catch (error: unknown) {
      handleError(error, 'Database initialization')
      set({
        isLoading: false,
        isInitialized: false,
        error: error instanceof Error ? error.message : 'Database initialization failed',
      })
    }
  },
  clearState: () => {
    set({
      db: null,
      isLoading: false,
      isInitialized: false,
      error: null,
    })
  },
  setError: (message: string) => {
    set({
      db: null,
      isLoading: false,
      isInitialized: false,
      error: message,
    })
  },
}))
