export interface ElectronAPI {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  ping: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
