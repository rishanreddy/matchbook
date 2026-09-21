import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import updater from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
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

/**
 * Whether this build can actually install an update it downloads.
 *
 * Squirrel.Mac refuses to swap in a new bundle unless the downloaded copy satisfies
 * the running app's designated code requirement. An ad-hoc signature has no stable
 * identity to match, so the swap fails after the whole download with
 * "code failed to satisfy specified code requirement(s)". Offering the button anyway
 * meant every Mac user hit that error. Detect it up front instead.
 *
 * Windows and Linux have no equivalent restriction.
 */
let cachedCanInstall: boolean | null = null

function canInstallUpdates(): boolean {
  if (cachedCanInstall !== null) {
    return cachedCanInstall
  }

  if (process.platform !== 'darwin') {
    cachedCanInstall = true
    return cachedCanInstall
  }

  try {
    // .../Matchbook.app/Contents/MacOS/Matchbook -> .../Matchbook.app
    const bundlePath = path.resolve(process.execPath, '..', '..', '..')
    const result = spawnSync('codesign', ['-dv', bundlePath], { encoding: 'utf8', timeout: 5_000 })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    cachedCanInstall = /Authority=Developer ID Application/.test(output)
  } catch {
    cachedCanInstall = false
  }

  return cachedCanInstall
}

const UNSIGNED_MAC_REASON =
  'This macOS build is not signed by Apple, so it cannot replace itself. Download the new version from GitHub and drag it into Applications.'

function getUpdateCapability(): { canCheck: boolean; canInstall: boolean; reason?: string } {
  if (!isUpdaterEnabled()) {
    return {
      canCheck: false,
      canInstall: false,
      reason: 'Updates are available only in packaged builds.',
    }
  }

  if (!canInstallUpdates()) {
    return { canCheck: true, canInstall: false, reason: UNSIGNED_MAC_REASON }
  }

  return { canCheck: true, canInstall: true }
}

function emitUpdateStatus(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

// Competition venues routinely have no usable internet. An automatic check that
// fails to reach GitHub is expected there, so it must stay silent; only a check the
// user explicitly asked for is allowed to surface an error.
let suppressUpdaterErrors = false

function isOfflineUpdateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /net::|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|getaddrinfo/i.test(message)
}

function configureAutoUpdater(): void {
  // Downloads stay manual: pulling a ~150 MB installer over a shared venue hotspot
  // mid-event would be hostile. The renderer prompts and the user decides when.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = canInstallUpdates()

  autoUpdater.on('checking-for-update', () => emitUpdateStatus('updater:checking'))
  autoUpdater.on('update-not-available', (info: UpdateInfo) => emitUpdateStatus('updater:not-available', info))
  autoUpdater.on('update-available', (info: UpdateInfo) => emitUpdateStatus('updater:available', info))
  autoUpdater.on('download-progress', (progress: ProgressInfo) =>
    emitUpdateStatus('updater:download-progress', progress),
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => emitUpdateStatus('updater:downloaded', info))
  autoUpdater.on('error', (error: Error) => {
    if (suppressUpdaterErrors) {
      console.warn('Background update check failed:', error.message)
      return
    }

    emitUpdateStatus('updater:error', error.message)
  })
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
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
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
  ipcMain.handle('app:update-capability', () => getUpdateCapability())
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
    const capability = getUpdateCapability()
    if (!capability.canInstall) {
      return { supported: false, reason: capability.reason }
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
    const capability = getUpdateCapability()
    if (!capability.canInstall) {
      return { supported: false, reason: capability.reason }
    }

    autoUpdater.quitAndInstall()
    return { supported: true }
  })
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
      // `checkForUpdatesAndNotify` only raises an OS notification once a download has
      // finished, which never happens while autoDownload is off. Check directly so the
      // `update-available` event reaches the renderer banner instead.
      // Recorded at startup so a support question about updates not arriving can be
      // answered from the log rather than guessed at.
      const capability = getUpdateCapability()
      console.log(
        `Updater: canCheck=${capability.canCheck} canInstall=${capability.canInstall}` +
          (capability.reason ? ` reason=${capability.reason}` : ''),
      )

      suppressUpdaterErrors = true
      void autoUpdater
        .checkForUpdates()
        .catch((error: unknown) => {
          if (!isOfflineUpdateError(error)) {
            console.warn('Startup update check failed:', error)
          }
        })
        .finally(() => {
          suppressUpdaterErrors = false
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
