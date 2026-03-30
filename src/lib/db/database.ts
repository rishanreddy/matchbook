import { addRxPlugin, createRxDatabase } from 'rxdb'
import { getRxStorageLocalstorage } from 'rxdb/plugins/storage-localstorage'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import type { ScoutingCollections, ScoutingDatabase } from './collections'
import { collectionSchemas } from './collections'
import { AppError } from '../utils/errorHandler'
import { logger } from '../utils/logger'

let databaseInstance: ScoutingDatabase | null = null
let initializingPromise: Promise<ScoutingDatabase> | null = null
let pluginsLoaded = false

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false
  }

  try {
    const testKey = '__rxdb_localstorage_test__'
    window.localStorage.setItem(testKey, testKey)
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

async function createDatabaseWithStorage(useMemoryStorage: boolean): Promise<ScoutingDatabase> {
  const selectedStorage = useMemoryStorage ? getRxStorageMemory() : getRxStorageLocalstorage()
  const storage = wrappedValidateAjvStorage({
    storage: selectedStorage as never,
  })

  const db = await createRxDatabase<ScoutingCollections>({
    name: 'offline-scouting-manager',
    storage,
    multiInstance: true,
    eventReduce: true,
    ignoreDuplicate: import.meta.env.DEV, // Only in dev mode
  })

  await db.addCollections(collectionSchemas)
  return db
}

async function loadPlugins(): Promise<void> {
  if (pluginsLoaded) return

  // Load dev-mode plugin in development for better error messages
  if (import.meta.env.DEV) {
    const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode')
    addRxPlugin(RxDBDevModePlugin)
  }

  pluginsLoaded = true
}

export async function initializeDatabase(): Promise<ScoutingDatabase> {
  if (databaseInstance) {
    return databaseInstance
  }

  if (initializingPromise) {
    return initializingPromise
  }

  initializingPromise = (async () => {
    try {
      await loadPlugins()

      const hasLocalStorage = isLocalStorageAvailable()
      let usedMemoryFallback = false
      let db: ScoutingDatabase

      if (!hasLocalStorage) {
        usedMemoryFallback = true
        logger.warn('localStorage unavailable. Falling back to in-memory RxDB storage.')
        db = await createDatabaseWithStorage(true)
      } else {
        try {
          db = await createDatabaseWithStorage(false)
        } catch (localStorageError) {
          logger.warn('localStorage RxDB initialization failed. Retrying with in-memory storage.', localStorageError)
          usedMemoryFallback = true
          db = await createDatabaseWithStorage(true)
        }
      }

      databaseInstance = db
      logger.info(
        usedMemoryFallback ? 'RxDB initialized successfully with memory fallback' : 'RxDB initialized successfully',
      )
      return databaseInstance
    } catch (error: unknown) {
      logger.error('Failed to initialize RxDB', error)
      throw new AppError('Database initialization failed', 'DATABASE_INIT_FAILED', {
        cause: error,
        hasLocalStorage: isLocalStorageAvailable(),
      })
    } finally {
      initializingPromise = null
    }
  })()

  return initializingPromise
}

export function getDatabase(): ScoutingDatabase {
  if (!databaseInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }

  return databaseInstance
}
