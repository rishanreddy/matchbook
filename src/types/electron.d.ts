export interface ElectronAPI {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  ping: () => Promise<string>
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdaterChecking: (callback: () => void) => () => void
  onUpdaterNotAvailable: (callback: (info: unknown) => void) => () => void
  onUpdaterAvailable: (callback: (info: unknown) => void) => () => void
  onUpdaterDownloadProgress: (callback: (progress: unknown) => void) => () => void
  onUpdaterDownloaded: (callback: (info: unknown) => void) => () => void
  onUpdaterError: (callback: (message: string) => void) => () => void
  onOpenAbout: (callback: () => void) => () => void
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
