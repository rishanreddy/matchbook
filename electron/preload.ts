import { contextBridge, ipcRenderer } from 'electron'

const electronApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:get-platform'),
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  db: {
    initialize: (): Promise<{ ok: boolean; mode: string }> => ipcRenderer.invoke('db:initialize'),
    query: (collection: string, query?: Record<string, unknown>): Promise<unknown[]> =>
      ipcRenderer.invoke('db:query', collection, query),
    insert: (collection: string, document: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('db:insert', collection, document),
    update: (
      collection: string,
      id: string,
      patch: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => ipcRenderer.invoke('db:update', collection, id, patch),
    delete: (collection: string, id: string): Promise<{ deleted: boolean }> =>
      ipcRenderer.invoke('db:delete', collection, id),
    sync: (): Promise<{ ok: boolean; syncedAt: string }> => ipcRenderer.invoke('db:sync'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
