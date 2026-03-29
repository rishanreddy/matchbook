import { BrowserWindow as e, app as t, ipcMain as n } from "electron";
import r from "node:path";
import i from "node:process";
//#region electron/database.ts
var a = /* @__PURE__ */ new Map();
function o(e) {
	let t = a.get(e);
	return t || (t = /* @__PURE__ */ new Map(), a.set(e, t)), t;
}
function s(e) {
	let t = e.id ?? e.key;
	if (typeof t != "string") throw Error("Document must include string id or key field");
	return t;
}
function c() {
	n.handle("db:initialize", () => ({
		ok: !0,
		mode: "ipc-memory-store"
	})), n.handle("db:query", (e, t, n) => {
		let r = o(t), i = Array.from(r.values()), a = n?.selector;
		return a ? i.filter((e) => Object.entries(a).every(([t, n]) => e[t] === n)) : i;
	}), n.handle("db:insert", (e, t, n) => {
		let r = o(t), i = s(n);
		return r.set(i, n), n;
	}), n.handle("db:update", (e, t, n, r) => {
		let i = o(t), a = i.get(n);
		if (!a) throw Error(`Document not found: ${n}`);
		let s = {
			...a,
			...r
		};
		return i.set(n, s), s;
	}), n.handle("db:delete", (e, t, n) => ({ deleted: o(t).delete(n) })), n.handle("db:sync", () => ({
		ok: !0,
		syncedAt: (/* @__PURE__ */ new Date()).toISOString()
	}));
}
//#endregion
//#region electron/main.ts
function l() {
	let t = new e({
		width: 1400,
		height: 900,
		minWidth: 1024,
		minHeight: 720,
		show: !1,
		autoHideMenuBar: !0,
		webPreferences: {
			preload: r.join(__dirname, "preload.mjs"),
			contextIsolation: !0,
			nodeIntegration: !1,
			sandbox: !0
		}
	});
	t.on("ready-to-show", () => {
		t.show();
	}), t.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	let n = i.env.VITE_DEV_SERVER_URL;
	return n ? (t.loadURL(n).catch((e) => {
		console.error("Failed to load dev server URL:", e);
	}), t.webContents.openDevTools({ mode: "detach" })) : t.loadFile(r.join(__dirname, "../dist/index.html")).catch((e) => {
		console.error("Failed to load built index.html:", e);
	}), t;
}
function u() {
	n.handle("app:get-version", () => t.getVersion()), n.handle("app:get-platform", () => i.platform), n.handle("app:ping", () => "pong"), c();
}
t.whenReady().then(() => {
	u(), l(), t.on("activate", () => {
		e.getAllWindows().length === 0 && l();
	});
}), t.on("window-all-closed", () => {
	i.platform !== "darwin" && t.quit();
});
//#endregion
