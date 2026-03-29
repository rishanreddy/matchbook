import { contextBridge, ipcRenderer } from 'electron'

type UnsubscribeFn = () => void

const electronApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:get-platform'),
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),
  onUpdaterChecking: (callback: () => void): UnsubscribeFn => {
    const listener = (): void => callback()
    ipcRenderer.on('updater:checking', listener)
    return () => ipcRenderer.removeListener('updater:checking', listener)
  },
  onUpdaterNotAvailable: (callback: (info: unknown) => void): UnsubscribeFn => {
    const listener = (_event: Electron.IpcRendererEvent, info: unknown): void => callback(info)
    ipcRenderer.on('updater:not-available', listener)
    return () => ipcRenderer.removeListener('updater:not-available', listener)
  },
  onUpdaterAvailable: (callback: (info: unknown) => void): UnsubscribeFn => {
    const listener = (_event: Electron.IpcRendererEvent, info: unknown): void => callback(info)
    ipcRenderer.on('updater:available', listener)
    return () => ipcRenderer.removeListener('updater:available', listener)
  },
  onUpdaterDownloadProgress: (callback: (progress: unknown) => void): UnsubscribeFn => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown): void => callback(progress)
    ipcRenderer.on('updater:download-progress', listener)
    return () => ipcRenderer.removeListener('updater:download-progress', listener)
  },
  onUpdaterDownloaded: (callback: (info: unknown) => void): UnsubscribeFn => {
    const listener = (_event: Electron.IpcRendererEvent, info: unknown): void => callback(info)
    ipcRenderer.on('updater:downloaded', listener)
    return () => ipcRenderer.removeListener('updater:downloaded', listener)
  },
  onUpdaterError: (callback: (message: string) => void): UnsubscribeFn => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('updater:error', listener)
    return () => ipcRenderer.removeListener('updater:error', listener)
  },
  onOpenAbout: (callback: () => void): UnsubscribeFn => {
    const listener = (): void => callback()
    ipcRenderer.on('app:open-about', listener)
    return () => ipcRenderer.removeListener('app:open-about', listener)
  },
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
