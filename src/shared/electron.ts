export type { SyncCollection, SyncPayload } from './syncProtocol'
import type { SyncPayload } from './syncProtocol'

export type SyncServerStatus = {
  running: boolean
  port: number | null
  url: string | null
  queueLength: number
  failedQueueLength: number
  authRequired: boolean
}

export type FailedSyncPayload = {
  payload: SyncPayload
  reason: string
  quarantinedAt: string
}

export type CameraAccess = {
  granted: boolean
  status: string
}

export type UpdateCapability = {
  /** Whether this build can look for updates at all. */
  canCheck: boolean
  /** Whether it can install one. False for unsigned macOS builds. */
  canInstall: boolean
  reason?: string
}

export type UpdaterActionResult = {
  supported: boolean
  reason?: string
  updateInfo?: unknown
}

export type TbaRequestResult = {
  ok: boolean
  status: number
  statusText: string
  data: unknown
  retryAfter: string | null
}

export type ElectronPlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'linux'
  | 'netbsd'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'

export interface ElectronAPI {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<ElectronPlatform>
  ping: () => Promise<string>
  openExternal: (url: string) => Promise<{ ok: boolean }>
  tbaRequest: (endpoint: string, apiKey: string) => Promise<TbaRequestResult>
  ensureCameraAccess: () => Promise<CameraAccess>
  getUpdateCapability: () => Promise<UpdateCapability>
  checkForUpdates: () => Promise<UpdaterActionResult>
  downloadUpdate: () => Promise<UpdaterActionResult>
  installUpdate: () => Promise<UpdaterActionResult>
  onUpdaterChecking: (callback: () => void) => () => void
  onUpdaterNotAvailable: (callback: (info: unknown) => void) => () => void
  onUpdaterAvailable: (callback: (info: unknown) => void) => () => void
  onUpdaterDownloadProgress: (callback: (progress: unknown) => void) => () => void
  onUpdaterDownloaded: (callback: (info: unknown) => void) => () => void
  onUpdaterError: (callback: (message: string) => void) => () => void
  onOpenAbout: (callback: () => void) => () => void
  onShowShortcuts: (callback: () => void) => () => void
  startSyncServer: (port?: number, authToken?: string) => Promise<SyncServerStatus>
  stopSyncServer: () => Promise<SyncServerStatus>
  getSyncServerStatus: () => Promise<SyncServerStatus>
  consumeSyncPayloads: () => Promise<SyncPayload[]>
  peekSyncPayloads: () => Promise<SyncPayload[]>
  ackSyncPayloads: (count: number) => Promise<SyncServerStatus>
  quarantineHeadSyncPayload: (reason: string) => Promise<SyncServerStatus>
  peekQuarantinedSyncPayloads: () => Promise<FailedSyncPayload[]>
  retryQuarantinedSyncPayloads: () => Promise<SyncServerStatus>
  clearQuarantinedSyncPayloads: () => Promise<SyncServerStatus>
}
