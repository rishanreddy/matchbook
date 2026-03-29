export interface ElectronAPI {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  ping: () => Promise<string>
  db: {
    initialize: () => Promise<{ ok: boolean; mode: string }>
    query: (collection: string, query?: Record<string, unknown>) => Promise<unknown[]>
    insert: (collection: string, document: Record<string, unknown>) => Promise<unknown>
    update: (collection: string, id: string, patch: Record<string, unknown>) => Promise<unknown>
    delete: (collection: string, id: string) => Promise<{ deleted: boolean }>
    sync: () => Promise<{ ok: boolean; syncedAt: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
