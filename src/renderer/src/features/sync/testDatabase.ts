import { addRxPlugin, createRxDatabase } from 'rxdb'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import { collectionSchemas, type ScoutingCollections, type ScoutingDatabase } from '../../lib/db/collections'

// Test-only: an in-memory copy of the app's real database, using its real schemas, so
// import and sync logic is exercised against the same validation the app applies.
addRxPlugin(RxDBQueryBuilderPlugin)

let counter = 0

export async function createTestDatabase(): Promise<ScoutingDatabase> {
  counter += 1
  const db = await createRxDatabase<ScoutingCollections>({
    name: `testdb${Date.now()}x${counter}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  })
  await db.addCollections(collectionSchemas)
  return db
}

export function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  }
}
