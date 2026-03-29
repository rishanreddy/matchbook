let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	getVersion: () => electron.ipcRenderer.invoke("app:get-version"),
	getPlatform: () => electron.ipcRenderer.invoke("app:get-platform"),
	ping: () => electron.ipcRenderer.invoke("app:ping")
});
//#endregion
