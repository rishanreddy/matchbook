import { addRxPlugin, createRxDatabase, removeRxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import type { ScoutingCollections, ScoutingDatabase } from './collections'
import { collectionSchemas } from './collections'
import { AppError } from '../utils/errorHandler'
import { logger } from '../utils/logger'

const DATABASE_NAME = 'matchbook-v4'
const LEGACY_DATABASE_NAMES = ['matchbook-v3', 'matchbook-v2', 'matchbook']

let databaseInstance: ScoutingDatabase | null = null
let initializingPromise: Promise<ScoutingDatabase> | null = null
let pluginsLoaded = false

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return false
  }

  try {
    void window.indexedDB
    return true
  } catch {
    return false
  }
}

async function createDatabaseWithStorage(): Promise<ScoutingDatabase> {
  const selectedStorage = getRxStorageDexie()
  const storage = wrappedValidateAjvStorage({
    storage: selectedStorage as never,
  })

  const db = await createRxDatabase<ScoutingCollections>({
    name: DATABASE_NAME,
    storage,
    multiInstance: false,
    eventReduce: true,
    ignoreDuplicate: import.meta.env.DEV, // Only in dev mode
  })

  try {
    await db.addCollections(collectionSchemas)
    return db
  } catch (error: unknown) {
    try {
      await db.close()
    } catch {
      // ignore close errors when addCollections fails
    }
    throw error
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function getUserFacingDatabaseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (
    message.includes('RxDB Error-Code: DB6') ||
    message.includes('another instance created this collection with a different schema')
  ) {
    return 'Local cache schema mismatch detected. Reset local cache to rebuild the database.'
  }

  if (message.includes('RxDB Error-Code: COL12') || message.includes('migrationStrategy is missing')) {
    return 'Database schema configuration changed. Reset local cache and restart the app.'
  }

  if (message.includes('RxDB Error-Code: DXE1') || message.includes('RxDB Error-Code: SC36')) {
    return 'Database schema configuration is invalid in this build. Update the app to continue.'
  }

  return `Database initialization failed: ${message}`
}

async function forceDeleteIndexedDbDatabase(name: string): Promise<void> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return
  }

  await new Promise<void>((resolve, reject) => {
    try {
      const request = window.indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'))
      request.onblocked = () => reject(new Error('IndexedDB delete blocked by another tab or process'))
    } catch (error: unknown) {
      reject(error)
    }
  })
}

async function clearDatabaseStorageByName(name: string): Promise<void> {
  const storage = wrappedValidateAjvStorage({
    storage: getRxStorageDexie() as never,
  })

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await removeRxDatabase(name, storage)
      return
    } catch (removeError: unknown) {
      logger.warn('removeRxDatabase failed, attempting IndexedDB delete fallback', {
        name,
        attempt,
        error: removeError instanceof Error ? removeError.message : 'Unknown removeRxDatabase error',
      })

      try {
        await forceDeleteIndexedDbDatabase(name)
        return
      } catch (deleteError: unknown) {
        const isLastAttempt = attempt === maxAttempts
        logger.warn('IndexedDB delete fallback failed', {
          name,
          attempt,
          error: deleteError instanceof Error ? deleteError.message : 'Unknown IndexedDB delete error',
          isLastAttempt,
        })

        if (isLastAttempt) {
          throw deleteError
        }

        await delay(250 * attempt)
      }
    }
  }
}

async function loadPlugins(): Promise<void> {
  if (pluginsLoaded) return

  // Load dev-mode plugin in development for better error messages
  if (import.meta.env.DEV) {
    const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode')
    addRxPlugin(RxDBDevModePlugin)
  }

  // Query builder plugin for .where(), .sort(), etc.
  const { RxDBQueryBuilderPlugin } = await import('rxdb/plugins/query-builder')
  addRxPlugin(RxDBQueryBuilderPlugin)

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
      let db: ScoutingDatabase

      if (!hasLocalStorage) {
        throw new AppError('Persistent local storage is unavailable.', 'DATABASE_INIT_FAILED', {
          hasLocalStorage,
        })
      } else {
        try {
          db = await createDatabaseWithStorage()
        } catch (persistentStorageError) {
          logger.error('IndexedDB RxDB initialization failed. Preserving existing data cache and surfacing recovery options.', persistentStorageError)
          throw persistentStorageError
        }
      }

      databaseInstance = db
      logger.info('RxDB initialized successfully')
      return databaseInstance
    } catch (error: unknown) {
      logger.error('Failed to initialize RxDB without modifying local data', error)
      const causeMessage = error instanceof Error ? error.message : 'Unknown database error'
      throw new AppError(getUserFacingDatabaseErrorMessage(error), 'DATABASE_INIT_FAILED', {
        cause: error,
        causeMessage,
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

async function clearPersistentDatabaseStorage(): Promise<void> {
  await clearDatabaseStorageByName(DATABASE_NAME)
}

export async function resetDatabase(): Promise<number> {
  if (databaseInstance) {
    await databaseInstance.close()
    databaseInstance = null
  }

  initializingPromise = null
  if (isLocalStorageAvailable()) {
    await clearPersistentDatabaseStorage()
    for (const legacyName of LEGACY_DATABASE_NAMES) {
      try {
        await clearDatabaseStorageByName(legacyName)
      } catch (error: unknown) {
        logger.warn('Failed to clear legacy database storage name', {
          name: legacyName,
          error: error instanceof Error ? error.message : 'Unknown legacy clear error',
        })
      }
    }
    logger.warn('Database reset requested, removed persistent RxDB storage')
    return 1
  }

  logger.warn('Database reset requested, but persistent storage was not available')
  return 0
}
