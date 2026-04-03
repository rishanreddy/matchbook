import { addRxPlugin, createRxDatabase, removeRxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import type { ScoutingCollections, ScoutingDatabase } from './collections'
import { collectionSchemas } from './collections'
import { AppError } from '../utils/errorHandler'
import { logger } from '../utils/logger'

const DATABASE_NAME = 'matchbook'
const LEGACY_LOCALSTORAGE_MIGRATION_KEY = 'matchbook-legacy-localstorage-migrated'
const DATABASE_RECOVERY_KEY = 'matchbook-database-recovery-v1'
const ENABLE_LEGACY_LOCALSTORAGE_MIGRATION = import.meta.env.VITE_ENABLE_LEGACY_LOCALSTORAGE_MIGRATION === 'true'

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

function isLegacyMigrationCompleted(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    return window.localStorage.getItem(LEGACY_LOCALSTORAGE_MIGRATION_KEY) === 'true'
  } catch {
    return false
  }
}

function markLegacyMigrationCompleted(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(LEGACY_LOCALSTORAGE_MIGRATION_KEY, 'true')
  } catch {
    // ignore localStorage write failures
  }
}

function hasRecoveryAttempted(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(DATABASE_RECOVERY_KEY) === 'true'
  } catch {
    return false
  }
}

function markRecoveryAttempted(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DATABASE_RECOVERY_KEY, 'true')
  } catch {
    // ignore localStorage write failures
  }
}

function clearRecoveryAttempted(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(DATABASE_RECOVERY_KEY)
  } catch {
    // ignore localStorage write failures
  }
}

function isRecoverableDatabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return (
    message.includes('RxDB Error-Code: DM4') ||
    message.includes('RxDB Error-Code: SNH') ||
    message.includes('RxStorageInstanceDexie is closed')
  )
}

async function migrateLegacyLocalStorageDatabase(targetDb: ScoutingDatabase): Promise<void> {
  if (!ENABLE_LEGACY_LOCALSTORAGE_MIGRATION) {
    markLegacyMigrationCompleted()
    return
  }

  if (isLegacyMigrationCompleted()) {
    return
  }

  let migratedCount = 0
  let legacyDb: ScoutingDatabase | null = null
  let legacyStorage: ReturnType<typeof wrappedValidateAjvStorage> | null = null

  try {
    const { getRxStorageLocalstorage } = await import('rxdb/plugins/storage-localstorage')
    legacyStorage = wrappedValidateAjvStorage({
      storage: getRxStorageLocalstorage() as never,
    })

    legacyDb = await createRxDatabase<ScoutingCollections>({
      name: DATABASE_NAME,
      storage: legacyStorage,
      multiInstance: false,
      eventReduce: true,
      ignoreDuplicate: import.meta.env.DEV,
    })

    await legacyDb.addCollections(collectionSchemas)

    const collectionNames = Object.keys(collectionSchemas) as Array<keyof ScoutingCollections>
    for (const collectionName of collectionNames) {
      const sourceCollection = legacyDb.collections[collectionName]
      const targetCollection = targetDb.collections[collectionName]
      const docs = await sourceCollection.find().exec()

      for (const doc of docs) {
        try {
          const rawDoc = doc.toJSON() as Record<string, unknown>
          const documentData = { ...rawDoc }

          const isDeleted = documentData._deleted === true
          delete documentData._deleted
          delete documentData._attachments
          delete documentData._meta
          delete documentData._rev

          if (isDeleted) {
            continue
          }

          await targetCollection.upsert(documentData as never)
          migratedCount += 1
        } catch (error: unknown) {
          logger.warn('Skipped legacy document during migration', {
            collection: collectionName,
            error: error instanceof Error ? error.message : 'Unknown migration error',
          })
        }
      }
    }

    await legacyDb.close()
    legacyDb = null

    if (legacyStorage) {
      await removeRxDatabase(DATABASE_NAME, legacyStorage)
    }

    markLegacyMigrationCompleted()
    logger.info('Legacy localStorage data migration complete', { migratedCount })
  } catch (error: unknown) {
    if (legacyDb) {
      try {
        await legacyDb.close()
      } catch {
        // ignore close errors
      }
    }

    logger.warn('Legacy localStorage migration skipped', {
      error: error instanceof Error ? error.message : 'Unknown legacy migration error',
    })
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

  const { RxDBMigrationSchemaPlugin } = await import('rxdb/plugins/migration-schema')
  addRxPlugin(RxDBMigrationSchemaPlugin)

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

      await migrateLegacyLocalStorageDatabase(db)

      clearRecoveryAttempted()
      databaseInstance = db
      logger.info('RxDB initialized successfully')
      return databaseInstance
    } catch (error: unknown) {
      if (isRecoverableDatabaseError(error) && !hasRecoveryAttempted()) {
        logger.warn('Recoverable database initialization error detected. Clearing local cache and retrying once.', {
          error: error instanceof Error ? error.message : 'Unknown recoverable database error',
        })

        try {
          markRecoveryAttempted()
          await clearPersistentDatabaseStorage()

          const recoveredDb = await createDatabaseWithStorage()
          clearRecoveryAttempted()
          databaseInstance = recoveredDb
          logger.info('RxDB recovered successfully after clearing local cache')
          return recoveredDb
        } catch (recoveryError: unknown) {
          logger.error('RxDB auto-recovery attempt failed', recoveryError)
        }
      }

      logger.error('Failed to initialize RxDB', error)
      const causeMessage = error instanceof Error ? error.message : 'Unknown database error'
      throw new AppError(`Database initialization failed: ${causeMessage}`, 'DATABASE_INIT_FAILED', {
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
  const storage = wrappedValidateAjvStorage({
    storage: getRxStorageDexie() as never,
  })

  await removeRxDatabase(DATABASE_NAME, storage)
}

export async function resetDatabase(): Promise<number> {
  if (databaseInstance) {
    await databaseInstance.close()
    databaseInstance = null
  }

  initializingPromise = null

  if (isLocalStorageAvailable()) {
    await clearPersistentDatabaseStorage()
    logger.warn('Database reset requested, removed persistent RxDB storage')
    return 1
  }

  logger.warn('Database reset requested, but persistent storage was not available')
  return 0
}
