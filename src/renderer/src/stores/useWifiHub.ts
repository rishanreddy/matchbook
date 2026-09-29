import { createStoreHook } from './createStoreHook'
import type { HubIdentity, SyncServerStatus } from '../../../shared/electron'
import { isValidSyncToken } from '../../../shared/syncProtocol'
import { createSyncToken, normalizeSyncToken } from '../features/sync/token'
import { logger } from '../lib/utils/logger'

const TOKEN_KEY = 'sync_server_auth_token'
const PORT_KEY = 'sync_server_port'
const RECEIVING_KEY = 'sync_wifi_receiving'
const AUTO_ADD_KEY = 'sync_auto_add'
export const DEFAULT_SYNC_PORT = 41735

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Persisting these is a convenience; the hub still works for this session.
  }
}

function initialToken(): string {
  const saved = normalizeSyncToken(read(TOKEN_KEY) ?? '')
  return isValidSyncToken(saved) ? saved : createSyncToken()
}

function initialPort(): number {
  const saved = Number(read(PORT_KEY))
  return Number.isInteger(saved) && saved >= 1024 && saved <= 65535 ? saved : DEFAULT_SYNC_PORT
}

function explainStartFailure(error: unknown, port: number): string {
  const message = error instanceof Error ? error.message : ''
  if (/EADDRINUSE/.test(message)) {
    return `Another program on this laptop is already using port ${port}. Close it, or pick a different port under More options.`
  }
  if (/EACCES/.test(message)) {
    return `This laptop would not let Matchbook use port ${port}. Pick a different port under More options.`
  }
  return message || 'Receiving could not be started.'
}

type WifiHubState = {
  status: SyncServerStatus | null
  token: string
  port: number
  autoAdd: boolean
  /** Entries added from scouts since the app opened. */
  receivedThisSession: number
  /** What the hub is currently sharing with scouts, in words; null when there is nothing to share. */
  sharedSummary: string | null
  isStarting: boolean
  error: string | null
  refresh: () => Promise<void>
  start: (identity: HubIdentity) => Promise<boolean>
  stop: () => Promise<void>
  renewToken: () => void
  setPort: (port: number) => void
  setAutoAdd: (enabled: boolean) => void
  countReceived: (entries: number) => void
  setSharedSummary: (summary: string | null) => void
}

export const useWifiHub = createStoreHook<WifiHubState>((set, get) => ({
  status: null,
  token: initialToken(),
  port: initialPort(),
  autoAdd: read(AUTO_ADD_KEY) !== 'false',
  receivedThisSession: 0,
  sharedSummary: null,
  isStarting: false,
  error: null,

  refresh: async () => {
    if (!window.electronAPI) {
      return
    }

    try {
      set({ status: await window.electronAPI.getSyncServerStatus() })
    } catch {
      // A failed status check leaves the last known status in place.
    }
  },

  start: async (identity) => {
    const api = window.electronAPI
    if (!api) {
      return false
    }

    const { token, port } = get()
    set({ isStarting: true, error: null })
    const startedAt = Date.now()
    logger.info('Wi-Fi sync receiver start requested', {
      port,
      identityConfigured: Boolean(identity.id && identity.name),
    }, 'sync.wifi.hub')
    try {
      write(TOKEN_KEY, token)
      write(PORT_KEY, String(port))
      const status = await api.startSyncServer(port, token, identity)
      write(RECEIVING_KEY, 'true')
      set({ status, isStarting: false })
      logger.info('Wi-Fi sync receiver started', {
        port: status.port,
        addressCount: status.urls.length,
        queuedPayloads: status.queueLength,
        quarantinedPayloads: status.failedQueueLength,
        elapsedMs: Date.now() - startedAt,
      }, 'sync.wifi.hub')
      return true
    } catch (error: unknown) {
      const message = explainStartFailure(error, port)
      set({ isStarting: false, error: message })
      logger.error('Wi-Fi sync receiver failed to start', { port, elapsedMs: Date.now() - startedAt, error }, 'sync.wifi.hub')
      return false
    }
  },

  stop: async () => {
    const api = window.electronAPI
    if (!api) {
      return
    }

    write(RECEIVING_KEY, 'false')
    const startedAt = Date.now()
    logger.info('Wi-Fi sync receiver stop requested', { wasRunning: get().status?.running ?? false }, 'sync.wifi.hub')
    try {
      const status = await api.stopSyncServer()
      set({ status, error: null })
      logger.info('Wi-Fi sync receiver stopped', { elapsedMs: Date.now() - startedAt }, 'sync.wifi.hub')
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Receiving could not be stopped.' })
      logger.error('Wi-Fi sync receiver failed to stop', { elapsedMs: Date.now() - startedAt, error }, 'sync.wifi.hub')
    }
  },

  renewToken: () => {
    if (get().status?.running) {
      return
    }
    const token = createSyncToken()
    write(TOKEN_KEY, token)
    set({ token })
    logger.info('Wi-Fi sync authentication code renewed', {}, 'sync.wifi.hub')
  },

  setPort: (port) => {
    if (get().status?.running) {
      return
    }
    write(PORT_KEY, String(port))
    set({ port })
  },

  setAutoAdd: (enabled) => {
    write(AUTO_ADD_KEY, String(enabled))
    set({ autoAdd: enabled })
  },

  countReceived: (entries) => set((state) => ({ receivedThisSession: state.receivedThisSession + entries })),
  setSharedSummary: (summary) => set({ sharedSummary: summary }),
}))

export function wasReceivingWhenClosed(): boolean {
  return read(RECEIVING_KEY) === 'true'
}
