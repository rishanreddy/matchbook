export type { SyncCollection, SyncPayload } from './syncProtocol'
import type { SyncPayload } from './syncProtocol'
import type { ApplicationLogEntry } from './logging'
export type { ApplicationLogEntry } from './logging'

export type SyncServerStatus = {
  running: boolean
  port: number | null
  url: string | null
  /** Every address this laptop can be reached on, best first. */
  urls: string[]
  /** The name this hub is announcing on the network, if it is running. */
  name: string | null
  queueLength: number
  failedQueueLength: number
  authRequired: boolean
}

export type HubIdentity = {
  id: string
  name: string
}

export type DiscoveredHub = HubIdentity & {
  url: string
  lastSeenAt: number
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
  writeLog: (entry: ApplicationLogEntry) => void
  openDiagnosticLog: () => Promise<void>
  exportDiagnosticLogs: () => Promise<string>
  clearDiagnosticLogs: () => Promise<void>
  startSyncServer: (port?: number, authToken?: string, identity?: HubIdentity) => Promise<SyncServerStatus>
  /** Hands the hub's current form, event and schedule to the server so scouts can fetch them. */
  publishSyncConfig: (json: string) => Promise<void>
  /** Fires when a scout has just delivered data to this hub. Returns an unsubscribe function. */
  onSyncPayloadReceived: (callback: (info: { queueLength: number }) => void) => () => void
  startHubDiscovery: () => Promise<void>
  stopHubDiscovery: () => Promise<void>
  listDiscoveredHubs: () => Promise<DiscoveredHub[]>
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
