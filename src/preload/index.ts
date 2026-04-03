import { contextBridge, ipcRenderer } from 'electron'
import type {
  ElectronAPI,
  FailedSyncPayload,
  SyncPayload,
  SyncServerStatus,
  TbaRequestResult,
  UpdaterActionResult,
} from '../shared/electron'

type UnsubscribeFn = () => void

const electronApi: ElectronAPI = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  openExternal: (url: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:open-external', url),
  tbaRequest: (endpoint: string, apiKey: string): Promise<TbaRequestResult> =>
    ipcRenderer.invoke('tba:request', endpoint, apiKey),
  checkForUpdates: (): Promise<UpdaterActionResult> => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<UpdaterActionResult> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<UpdaterActionResult> => ipcRenderer.invoke('install-update'),
  onUpdaterChecking: (callback: () => void): UnsubscribeFn => {
    const listener = (): void => callback()
    ipcRenderer.on('updater:checking', listener)
    return () => ipcRenderer.removeListener('updater:checking', listener)
  },
  onUpdaterNotAvailable: (callback: (info: unknown) => void): UnsubscribeFn => {
    const listener = (_event: unknown, info: unknown): void => callback(info)
    ipcRenderer.on('updater:not-available', listener)
    return () => ipcRenderer.removeListener('updater:not-available', listener)
  },
  onUpdaterAvailable: (callback: (info: unknown) => void): UnsubscribeFn => {
    const listener = (_event: unknown, info: unknown): void => callback(info)
    ipcRenderer.on('updater:available', listener)
    return () => ipcRenderer.removeListener('updater:available', listener)
  },
  onUpdaterDownloadProgress: (callback: (progress: unknown) => void): UnsubscribeFn => {
    const listener = (_event: unknown, progress: unknown): void => callback(progress)
    ipcRenderer.on('updater:download-progress', listener)
    return () => ipcRenderer.removeListener('updater:download-progress', listener)
  },
  onUpdaterDownloaded: (callback: (info: unknown) => void): UnsubscribeFn => {
    const listener = (_event: unknown, info: unknown): void => callback(info)
    ipcRenderer.on('updater:downloaded', listener)
    return () => ipcRenderer.removeListener('updater:downloaded', listener)
  },
  onUpdaterError: (callback: (message: string) => void): UnsubscribeFn => {
    const listener = (_event: unknown, message: string): void => callback(message)
    ipcRenderer.on('updater:error', listener)
    return () => ipcRenderer.removeListener('updater:error', listener)
  },
  onOpenAbout: (callback: () => void): UnsubscribeFn => {
    const listener = (): void => callback()
    ipcRenderer.on('app:open-about', listener)
    return () => ipcRenderer.removeListener('app:open-about', listener)
  },
  onShowShortcuts: (callback: () => void): UnsubscribeFn => {
    const listener = (): void => callback()
    ipcRenderer.on('app:show-shortcuts', listener)
    return () => ipcRenderer.removeListener('app:show-shortcuts', listener)
  },
  startSyncServer: (port?: number, authToken?: string): Promise<SyncServerStatus> =>
    ipcRenderer.invoke('sync-server:start', port, authToken),
  stopSyncServer: (): Promise<SyncServerStatus> => ipcRenderer.invoke('sync-server:stop'),
  getSyncServerStatus: (): Promise<SyncServerStatus> => ipcRenderer.invoke('sync-server:status'),
  consumeSyncPayloads: (): Promise<SyncPayload[]> => ipcRenderer.invoke('sync-server:consume'),
  peekSyncPayloads: (): Promise<SyncPayload[]> => ipcRenderer.invoke('sync-server:peek'),
  ackSyncPayloads: (count: number): Promise<SyncServerStatus> => ipcRenderer.invoke('sync-server:ack', count),
  quarantineHeadSyncPayload: (reason: string): Promise<SyncServerStatus> =>
    ipcRenderer.invoke('sync-server:quarantine-head', reason),
  peekQuarantinedSyncPayloads: (): Promise<FailedSyncPayload[]> => ipcRenderer.invoke('sync-server:failed-peek'),
  retryQuarantinedSyncPayloads: (): Promise<SyncServerStatus> =>
    ipcRenderer.invoke('sync-server:failed-retry-all'),
  clearQuarantinedSyncPayloads: (): Promise<SyncServerStatus> => ipcRenderer.invoke('sync-server:failed-clear'),
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
