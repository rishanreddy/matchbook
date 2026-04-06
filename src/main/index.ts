import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import process from 'node:process'
import updater from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { registerDatabaseIpcHandlers } from './database'
import { registerSyncServerIpcHandlers, stopSyncServer } from './syncServer'

const { autoUpdater } = updater
// Dev mode = loading from Vite dev server with HMR (electron-vite dev)
// Preview mode = loading built files (electron-vite preview)  
// Production = packaged app loading built files
const IS_DEV = !app.isPackaged && process.env.ELECTRON_RENDERER_URL?.startsWith('http://localhost') === true
const FORCE_DEV_UPDATES = process.env.FORCE_DEV_UPDATES === 'true'
const REPO_URL = 'https://github.com/rishanreddy/matchbook'
const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3'
const TBA_REQUEST_TIMEOUT_MS = 10_000

let mainWindow: BrowserWindow | null = null

if (!app.isPackaged) {
  const profileSuffix = IS_DEV ? 'dev' : 'preview'
  const isolatedUserDataPath = path.join(app.getPath('userData'), profileSuffix)
  app.setPath('userData', isolatedUserDataPath)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

async function openExternalUrl(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) {
    throw new Error('Only http/https external URLs are allowed.')
  }

  await shell.openExternal(url)
}

type TbaRequestResult = {
  ok: boolean
  status: number
  statusText: string
  data: unknown
  retryAfter: string | null
}

async function requestTba(endpoint: string, apiKey: string): Promise<TbaRequestResult> {
  const normalizedEndpoint = endpoint.trim()
  const normalizedApiKey = apiKey.trim()

  if (!normalizedEndpoint.startsWith('/')) {
    throw new Error('TBA endpoint must start with /.')
  }

  if (!normalizedApiKey) {
    throw new Error('Missing TBA API key.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TBA_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${TBA_BASE_URL}${normalizedEndpoint}`, {
      method: 'GET',
      headers: {
        'X-TBA-Auth-Key': normalizedApiKey,
        'User-Agent': 'Matchbook/1.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    const rawText = await response.text()
    let parsedBody: unknown = null

    if (rawText) {
      try {
        parsedBody = JSON.parse(rawText) as unknown
      } catch {
        parsedBody = rawText
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: parsedBody,
      retryAfter: response.headers.get('retry-after'),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function isUpdaterEnabled(): boolean {
  return app.isPackaged || FORCE_DEV_UPDATES
}

function emitUpdateStatus(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

function configureAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emitUpdateStatus('updater:checking'))
  autoUpdater.on('update-not-available', (info: UpdateInfo) => emitUpdateStatus('updater:not-available', info))
  autoUpdater.on('update-available', (info: UpdateInfo) => emitUpdateStatus('updater:available', info))
  autoUpdater.on('download-progress', (progress: ProgressInfo) =>
    emitUpdateStatus('updater:download-progress', progress),
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => emitUpdateStatus('updater:downloaded', info))
  autoUpdater.on('error', (error: Error) => emitUpdateStatus('updater:error', error.message))
}

function buildMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About', click: () => emitUpdateStatus('app:open-about') },
        { label: 'Documentation', click: () => void shell.openExternal(REPO_URL) },
        { label: 'Keyboard Shortcuts', click: () => emitUpdateStatus('app:show-shortcuts') },
      ],
    },
  ]
}

function configureApplicationMenu(): void {
  const menu = Menu.buildFromTemplate(buildMenuTemplate())
  Menu.setApplicationMenu(menu)
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  window.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }

    return { action: 'deny' }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    window.loadURL(rendererUrl).catch((error: unknown) => {
      console.error('Failed to load dev server URL:', error)
    })
    // Only auto-open DevTools in true dev mode (not preview)
    if (IS_DEV) {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html')).catch((error: unknown) => {
      console.error('Failed to load built index.html:', error)
    })
  }

  return window
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)
  ipcMain.handle('app:ping', () => 'pong')
  ipcMain.handle('app:open-external', async (_event, url: string) => {
    await openExternalUrl(url)
    return { ok: true }
  })
  ipcMain.handle('tba:request', async (_event, endpoint: string, apiKey: string) => {
    return await requestTba(endpoint, apiKey)
  })
  ipcMain.handle('check-for-updates', async () => {
    if (!isUpdaterEnabled()) {
      return {
        supported: false,
        reason: 'Updates are available only in packaged builds. Run build:mac/build:win/build:linux to test update checks.',
      }
    }

    try {
      const result = await autoUpdater.checkForUpdates()
      return {
        supported: true,
        updateInfo: result?.updateInfo ?? null,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to check updates.'
      emitUpdateStatus('updater:error', message)
      throw error
    }
  })
  ipcMain.handle('download-update', async () => {
    if (!isUpdaterEnabled()) {
      return {
        supported: false,
        reason: 'Updates are available only in packaged builds.',
      }
    }

    try {
      await autoUpdater.downloadUpdate()
      return { supported: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to download update.'
      emitUpdateStatus('updater:error', message)
      throw error
    }
  })
  ipcMain.handle('install-update', () => {
    if (!isUpdaterEnabled()) {
      return { supported: false, reason: 'Updates are available only in packaged builds.' }
    }

    autoUpdater.quitAndInstall()
    return { supported: true }
  })
  registerDatabaseIpcHandlers()
  registerSyncServerIpcHandlers()
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
  })

  app.whenReady().then(() => {
    registerIpcHandlers()
    configureApplicationMenu()
    configureAutoUpdater()
    mainWindow = createMainWindow()

    if (isUpdaterEnabled()) {
      void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Startup update check failed.'
        emitUpdateStatus('updater:error', message)
      })
    } else if (IS_DEV) {
      emitUpdateStatus('updater:not-available', {
        version: app.getVersion(),
        reason: 'Dev mode: automatic update checks are disabled.',
      })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    void stopSyncServer()
  })
}
