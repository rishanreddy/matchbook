import { contextBridge, ipcRenderer } from 'electron'

const electronApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:get-platform'),
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
}

contextBridge.exposeInMainWorld('electronAPI', electronApi)
