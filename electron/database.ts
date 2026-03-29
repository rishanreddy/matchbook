import { ipcMain } from 'electron'

type InMemoryDocument = Record<string, unknown>
type CollectionStore = Map<string, InMemoryDocument>

const store = new Map<string, CollectionStore>()

function getCollection(collectionName: string): CollectionStore {
  let collection = store.get(collectionName)
  if (!collection) {
    collection = new Map<string, InMemoryDocument>()
    store.set(collectionName, collection)
  }
  return collection
}

function documentId(document: InMemoryDocument): string {
  const id = document.id ?? document.key
  if (typeof id !== 'string') {
    throw new Error('Document must include string id or key field')
  }
  return id
}

export function registerDatabaseIpcHandlers(): void {
  ipcMain.handle('db:initialize', () => ({ ok: true, mode: 'ipc-memory-store' }))

  ipcMain.handle(
    'db:query',
    (_event, collectionName: string, query?: { selector?: Record<string, unknown> }) => {
      const collection = getCollection(collectionName)
      const allDocs = Array.from(collection.values())
      const selector = query?.selector
      if (!selector) {
        return allDocs
      }

      return allDocs.filter((doc) =>
        Object.entries(selector).every(([key, value]) => {
          return doc[key] === value
        }),
      )
    },
  )

  ipcMain.handle('db:insert', (_event, collectionName: string, doc: InMemoryDocument) => {
    const collection = getCollection(collectionName)
    const id = documentId(doc)
    collection.set(id, doc)
    return doc
  })

  ipcMain.handle(
    'db:update',
    (_event, collectionName: string, id: string, patch: Record<string, unknown>) => {
      const collection = getCollection(collectionName)
      const current = collection.get(id)
      if (!current) {
        throw new Error(`Document not found: ${id}`)
      }
      const updated = { ...current, ...patch }
      collection.set(id, updated)
      return updated
    },
  )

  ipcMain.handle('db:delete', (_event, collectionName: string, id: string) => {
    const collection = getCollection(collectionName)
    const deleted = collection.delete(id)
    return { deleted }
  })

  ipcMain.handle('db:sync', () => ({ ok: true, syncedAt: new Date().toISOString() }))
}
