import { addRxPlugin, createRxDatabase } from 'rxdb'
import { getRxStorageLocalstorage } from 'rxdb/plugins/storage-localstorage'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import type { ScoutingCollections, ScoutingDatabase } from './collections'
import { collectionSchemas } from './collections'

let databaseInstance: ScoutingDatabase | null = null
let initializingPromise: Promise<ScoutingDatabase> | null = null
let pluginsLoaded = false

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

      // Wrap storage with validation
      const storage = wrappedValidateAjvStorage({
        storage: getRxStorageLocalstorage(),
      })

      const db = await createRxDatabase<ScoutingCollections>({
        name: 'offline-scouting-manager',
        storage,
        multiInstance: true,
        eventReduce: true,
        ignoreDuplicate: import.meta.env.DEV, // Only in dev mode
      })

      await db.addCollections(collectionSchemas)
      databaseInstance = db
      console.info('[DB] RxDB initialized successfully')
      return databaseInstance
    } catch (error: unknown) {
      console.error('[DB] Failed to initialize RxDB:', error)
      throw error
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
