import { createStoreHook } from './createStoreHook'
import { initializeDatabase } from '../lib/db/database'
import { migrateLegacyScouts } from '../features/roster/rosterService'
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

export const useDatabaseStore = createStoreHook<DatabaseState>((set, get) => ({
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
    const startedAt = Date.now()
    try {
      const db = await initializeDatabase()
      try {
        const moved = await migrateLegacyScouts(db)
        if (moved > 0) {
          logger.info('Scouts from an earlier version were added to the roster', { moved }, 'database')
        }
      } catch (error: unknown) {
        // The roster is rebuilt from scouts' laptops on the next sync, so this must never block startup.
        logger.warn('Could not move earlier scouts into the roster', error, 'database')
      }
      logger.info('Database initialization completed', {
        elapsedMs: Date.now() - startedAt,
        collectionCount: Object.keys(db.collections).length,
      }, 'database')
      set({ db, isLoading: false, isInitialized: true })
    } catch (error: unknown) {
      logger.error('Database initialization failed in the application store', error, 'database')
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
