import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import process from 'node:process'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { registerDatabaseIpcHandlers } from './database'

let mainWindow: BrowserWindow | null = null

function emitUpdateStatus(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

function configureAutoUpdater(): void {
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
        { label: 'Documentation', click: () => void shell.openExternal('https://github.com/') },
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
      preload: path.join(__dirname, 'preload.mjs'),
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

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const rendererUrl = process.env.VITE_DEV_SERVER_URL
  if (rendererUrl) {
    window.loadURL(rendererUrl).catch((error: unknown) => {
      console.error('Failed to load dev server URL:', error)
    })
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html')).catch((error: unknown) => {
      console.error('Failed to load built index.html:', error)
    })
  }

  return window
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)
  ipcMain.handle('app:ping', () => 'pong')
  ipcMain.handle('check-for-updates', async () => {
    const result = await autoUpdater.checkForUpdates()
    return result?.updateInfo
  })
  ipcMain.handle('download-update', async () => {
    await autoUpdater.downloadUpdate()
  })
  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall()
  })
  registerDatabaseIpcHandlers()
}

app.whenReady().then(() => {
  registerIpcHandlers()
  configureApplicationMenu()
  configureAutoUpdater()
  mainWindow = createMainWindow()
  void autoUpdater.checkForUpdatesAndNotify()

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
