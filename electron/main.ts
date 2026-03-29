import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import process from 'node:process'
import { registerDatabaseIpcHandlers } from './database'

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
  registerDatabaseIpcHandlers()
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
