import { app, BrowserWindow, ipcMain, Menu, screen, shell, systemPreferences } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { readFileSync, unlinkSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import updater from 'electron-updater'
import log from 'electron-log/main'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { isPermissionCheckAllowed, isPermissionRequestAllowed } from './permissions'
import { registerSyncServerIpcHandlers, stopSyncServer } from './syncServer'
import { parseSavedWindowState, planMainWindow, type SavedWindowState } from './windowBounds'
import { normalizeApplicationLogEntry } from '../shared/logging'

const { autoUpdater } = updater
log.transports.file.level = 'debug'
log.transports.file.maxSize = 8 * 1024 * 1024
log.transports.file.inspectOptions = { depth: 6, maxArrayLength: 40, maxStringLength: 4_000, breakLength: 120 }
// Dev mode = loading from Vite dev server with HMR (electron-vite dev)
// Preview mode = loading built files (electron-vite preview)  
// Production = packaged app loading built files
const IS_DEV = !app.isPackaged && process.env.ELECTRON_RENDERER_URL?.startsWith('http://localhost') === true
log.transports.console.level = IS_DEV ? 'debug' : 'warn'
// Renderer application logs go through the validated preload bridge. Console
// messages are captured with Electron's current event shape below.
log.initialize({ preload: false })
const FORCE_DEV_UPDATES = process.env.FORCE_DEV_UPDATES === 'true'
const REPO_URL = 'https://github.com/rishanreddy/matchbook'
const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3'
const TBA_REQUEST_TIMEOUT_MS = 10_000

let mainWindow: BrowserWindow | null = null

if (!app.isPackaged) {
  const profileSuffix = IS_DEV ? 'dev' : 'preview'
  const isolatedUserDataPath = process.env.MATCHBOOK_E2E_USER_DATA || path.join(app.getPath('userData'), profileSuffix)
  app.setPath('userData', isolatedUserDataPath)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  log.warn('Another Matchbook instance already owns the single-instance lock; this process will exit')
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

function classifyRendererConsoleSource(sourceId: string): string {
  if (sourceId.startsWith('file:')) return 'local-file'
  if (sourceId.startsWith('http://localhost') || sourceId.startsWith('http://127.0.0.1')) return 'local-dev-server'
  return 'other'
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
  const startedAt = Date.now()
  log.debug('TBA API request started', { endpoint: normalizedEndpoint, timeoutMs: TBA_REQUEST_TIMEOUT_MS })

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

    log.info('TBA API request completed', {
      endpoint: normalizedEndpoint,
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
      responseBytes: Buffer.byteLength(rawText),
    })

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: parsedBody,
      retryAfter: response.headers.get('retry-after'),
    }
  } catch (error: unknown) {
    log.warn('TBA API request failed', {
      endpoint: normalizedEndpoint,
      elapsedMs: Date.now() - startedAt,
      error,
    })
    throw error
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

  autoUpdater.on('checking-for-update', () => {
    log.info('Updater check started')
    emitUpdateStatus('updater:checking')
  })
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info('No update is available', { version: info.version })
    emitUpdateStatus('updater:not-available', info)
  })
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('An update is available', { version: info.version, releaseDate: info.releaseDate })
    emitUpdateStatus('updater:available', info)
  })
  let lastLoggedProgress = 0
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const progressBucket = Math.floor(progress.percent / 10) * 10
    if (progressBucket >= lastLoggedProgress + 10) {
      lastLoggedProgress = progressBucket
      log.info('Updater download progress', {
        percent: progressBucket,
        transferredBytes: progress.transferred,
        totalBytes: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      })
    }
    emitUpdateStatus('updater:download-progress', progress)
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update download completed', { version: info.version })
    emitUpdateStatus('updater:downloaded', info)
  })
  autoUpdater.on('error', (error: Error) => {
    if (suppressUpdaterErrors) {
      log.warn('Background update check failed in an offline-tolerant operation', error)
      return
    }

    log.error('Updater reported an error', error)
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

const WINDOW_STATE_FILE = 'window-state.json'
const WINDOW_STATE_SAVE_DELAY_MS = 400

function readSavedWindowState(): SavedWindowState | null {
  try {
    const raw = readFileSync(path.join(app.getPath('userData'), WINDOW_STATE_FILE), 'utf8')
    return parseSavedWindowState(JSON.parse(raw) as unknown)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.debug('No saved window size is available; using screen defaults')
    } else {
      log.warn('Saved window size could not be read; using screen defaults', error)
    }
    return null
  }
}

function watchWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const save = (): void => {
    timer = null
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
      return
    }

    const state: SavedWindowState = { bounds: window.getNormalBounds(), isMaximized: window.isMaximized() }
    void writeFile(path.join(app.getPath('userData'), WINDOW_STATE_FILE), JSON.stringify(state)).catch((error: unknown) => {
      log.warn('Failed to save application window size', error)
    })
  }

  const scheduleSave = (): void => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(save, WINDOW_STATE_SAVE_DELAY_MS)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)
  window.on('close', () => {
    if (timer) {
      clearTimeout(timer)
    }
    save()
  })
}

function createMainWindow(): BrowserWindow {
  // Size from the screen the window will open on. A fixed size larger than the usable
  // area put the bottom of every page under the taskbar on small laptops.
  const saved = readSavedWindowState()
  const display = saved
    ? screen.getDisplayMatching(saved.bounds)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const plan = planMainWindow(display.workArea, saved)
  log.info('Creating application window', {
    restoredSavedBounds: Boolean(saved),
    bounds: plan.bounds,
    minWidth: plan.minWidth,
    minHeight: plan.minHeight,
    maximizeOnShow: plan.maximize,
    displayScaleFactor: display.scaleFactor,
  })

  const window = new BrowserWindow({
    ...plan.bounds,
    minWidth: plan.minWidth,
    minHeight: plan.minHeight,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Matchbook uses a top-level camera request for QR scanning and writes text to the
  // clipboard for its Copy buttons. Nothing else is granted: not audio, display capture,
  // reading the clipboard, or any request made from embedded content.
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isPermissionRequestAllowed(permission, webContents === window.webContents, details))
  })

  window.webContents.session.setPermissionCheckHandler((webContents, permission, _requestingOrigin, details) =>
    isPermissionCheckAllowed(permission, webContents === window.webContents, details),
  )

  window.on('ready-to-show', () => {
    if (plan.maximize) {
      window.maximize()
    }
    window.show()
    log.info('Application window is ready to show', {
      maximized: window.isMaximized(),
      bounds: window.getBounds(),
    })
  })

  watchWindowState(window)

  window.on('closed', () => {
    log.info('Application window closed')
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  window.webContents.setWindowOpenHandler((details) => {
    log.info('Renderer requested a new window', { allowedExternalUrl: isSafeExternalUrl(details.url) })
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }

    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    log.warn('Blocked top-level renderer navigation', { isSafeExternalUrl: isSafeExternalUrl(url) })
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    window.loadURL(rendererUrl).catch((error: unknown) => {
      log.error('Failed to load renderer development URL', error)
    })
    // Only auto-open DevTools in true dev mode (not preview)
    if (IS_DEV) {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html')).catch((error: unknown) => {
      log.error('Failed to load packaged renderer entry point', error)
    })
  }

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log.error('Renderer navigation failed', {
      errorCode,
      errorDescription,
      isMainFrame,
      isInternalUrl: validatedURL.startsWith('file:') || validatedURL.startsWith('http://localhost'),
    })
  })
  window.webContents.on('did-finish-load', () => {
    log.info('Renderer document finished loading', { rendererProcessId: window.webContents.getProcessId() })
  })
  window.webContents.on('console-message', (details) => {
    const level = details.level === 'warning' ? 'warn' : details.level
    const entry = normalizeApplicationLogEntry({
      timestamp: new Date().toISOString(),
      level,
      message: details.message,
      context: 'renderer-console',
      data: {
        source: classifyRendererConsoleSource(details.sourceId),
        lineNumber: details.lineNumber,
      },
    })
    if (!entry) return

    const message = `[renderer-console] ${entry.message}`
    const detail = { rendererTimestamp: entry.timestamp, data: entry.data }
    switch (entry.level) {
      case 'debug':
        log.debug(message, detail)
        break
      case 'info':
        log.info(message, detail)
        break
      case 'warn':
        log.warn(message, detail)
        break
      case 'error':
        log.error(message, detail)
        break
    }
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process exited unexpectedly', {
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })
  window.webContents.on('unresponsive', () => log.error('Renderer became unresponsive'))
  window.webContents.on('responsive', () => log.info('Renderer became responsive'))

  return window
}

function registerIpcHandlers(): void {
  ipcMain.on('app:log', (event, rawEntry: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return
    const entry = normalizeApplicationLogEntry(rawEntry)
    if (!entry) return

    const scope = entry.context ? `[${entry.context}]` : ''
    const message = `[renderer]${scope} ${entry.message}`
    const detail = { rendererTimestamp: entry.timestamp, ...(entry.data === undefined ? {} : { data: entry.data }) }
    switch (entry.level) {
      case 'debug':
        log.debug(message, detail)
        break
      case 'info':
        log.info(message, detail)
        break
      case 'warn':
        log.warn(message, detail)
        break
      case 'error':
        log.error(message, detail)
        break
    }
  })
  ipcMain.handle('app:open-diagnostic-log', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Untrusted diagnostic log request.')
    log.info('User opened the local diagnostic log')
    const error = await shell.openPath(log.transports.file.getFile().path)
    if (error) throw new Error(error)
  })
  ipcMain.handle('app:export-diagnostic-logs', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Untrusted diagnostic log request.')
    const files = log.transports.file.readAllLogs().sort((a, b) => {
      const aIsArchive = a.path.endsWith('.old.log')
      const bIsArchive = b.path.endsWith('.old.log')
      return aIsArchive === bIsArchive ? a.path.localeCompare(b.path) : aIsArchive ? -1 : 1
    })
    return files
      .map(({ path: filePath, lines }) => `===== ${path.basename(filePath)} =====\n${lines.join('\n')}`)
      .join('\n\n')
  })
  ipcMain.handle('app:clear-diagnostic-logs', (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Untrusted diagnostic log request.')
    const fileTransport = log.transports.file
    const activePath = fileTransport.getFile().path
    for (const logFile of fileTransport.readAllLogs()) {
      if (logFile.path === activePath) continue
      try {
        unlinkSync(logFile.path)
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    fileTransport.getFile().clear()
    log.info('Local diagnostic log history cleared by the user')
  })
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:update-capability', () => getUpdateCapability())
  ipcMain.handle('app:ensure-camera-access', async () => {
    if (process.platform !== 'darwin') {
      log.info('Camera permission check completed', { platform: process.platform, status: 'granted' })
      return { granted: true, status: 'granted' }
    }

    const status = systemPreferences.getMediaAccessStatus('camera')
    if (status === 'not-determined') {
      // Triggers the one-time macOS prompt. Without this the scanner can sit on an
      // empty camera list while the system waits to be asked.
      const granted = await systemPreferences.askForMediaAccess('camera')
      log.info('macOS camera permission prompt completed', { granted })
      return { granted, status: granted ? 'granted' : 'denied' }
    }

    log.info('macOS camera permission checked', { status })
    return { granted: status === 'granted', status }
  })
  ipcMain.handle('app:get-platform', () => process.platform)
  ipcMain.handle('app:ping', () => 'pong')
  ipcMain.handle('app:open-external', async (_event, url: string) => {
    await openExternalUrl(url)
    log.info('Opened external link', { protocol: new URL(url).protocol, host: new URL(url).host })
    return { ok: true }
  })
  ipcMain.handle('tba:request', async (_event, endpoint: string, apiKey: string) => {
    return await requestTba(endpoint, apiKey)
  })
  ipcMain.handle('check-for-updates', async () => {
    if (!isUpdaterEnabled()) {
      log.warn('Update check was requested in a build where update checks are disabled')
      return {
        supported: false,
        reason: 'Updates are available only in packaged builds. Run build:mac/build:win/build:linux to test update checks.',
      }
    }

    try {
      log.info('User requested an update check')
      const result = await autoUpdater.checkForUpdates()
      return {
        supported: true,
        updateInfo: result?.updateInfo ?? null,
      }
    } catch (error: unknown) {
      log.error('User-requested update check failed', error)
      const message = error instanceof Error ? error.message : 'Failed to check updates.'
      emitUpdateStatus('updater:error', message)
      throw error
    }
  })
  ipcMain.handle('download-update', async () => {
    const capability = getUpdateCapability()
    if (!capability.canInstall) {
      log.warn('Update download is unavailable for this build', { reason: capability.reason })
      return { supported: false, reason: capability.reason }
    }

    try {
      log.info('User requested the available update download')
      await autoUpdater.downloadUpdate()
      return { supported: true }
    } catch (error: unknown) {
      log.error('Update download failed', error)
      const message = error instanceof Error ? error.message : 'Failed to download update.'
      emitUpdateStatus('updater:error', message)
      throw error
    }
  })
  ipcMain.handle('install-update', () => {
    const capability = getUpdateCapability()
    if (!capability.canInstall) {
      log.warn('Update installation is unavailable for this build', { reason: capability.reason })
      return { supported: false, reason: capability.reason }
    }

    log.info('User requested installation of the downloaded update')
    autoUpdater.quitAndInstall()
    return { supported: true }
  })
  registerSyncServerIpcHandlers()
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    log.info('A second launch request was routed to the existing application window')
    if (!mainWindow) {
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
  })

  app.whenReady().then(() => {
    log.errorHandler.startCatching({ showDialog: false })
    log.info('Matchbook startup completed', {
      version: app.getVersion(),
      platform: process.platform,
      architecture: process.arch,
      packaged: app.isPackaged,
      developmentServer: IS_DEV,
      electronVersion: process.versions.electron,
      chromiumVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      updateChecksEnabled: isUpdaterEnabled(),
    })
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
      if (process.platform === 'darwin') {
        // Recorded for the same reason as the updater line: when a scout says the QR
        // scanner will not open, this says whether macOS refused the camera.
        log.info('Camera permission status at startup', { status: systemPreferences.getMediaAccessStatus('camera') })
      }

      const capability = getUpdateCapability()
      log.info('Update capability evaluated', capability)

      suppressUpdaterErrors = true
      void autoUpdater
        .checkForUpdates()
        .catch((error: unknown) => {
          if (!isOfflineUpdateError(error)) {
            log.warn('Startup update check failed', error)
          } else {
            log.debug('Startup update check could not reach the network; the app will continue offline', error)
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
        log.info('Application reactivated without an open window')
        mainWindow = createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    log.info('All application windows closed', { platform: process.platform })
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    log.info('Application shutdown requested')
    void stopSyncServer()
  })
}
