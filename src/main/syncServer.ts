import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { isValidSyncPayload, isValidSyncToken, type SyncPayload } from '../shared/syncProtocol'
import { HubBeacon, HubListener, type HubIdentity } from './discovery'

type FailedSyncPayload = {
  payload: SyncPayload
  reason: string
  quarantinedAt: string
}

type SyncServerStatus = {
  running: boolean
  port: number | null
  url: string | null
  /** Every address this laptop can be reached on, best first. A laptop with Wi-Fi and Ethernet has two. */
  urls: string[]
  name: string | null
  queueLength: number
  failedQueueLength: number
  authRequired: boolean
}

const DEFAULT_PORT = 41735
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_PENDING_PAYLOADS = 100
const MAX_PENDING_BYTES = 50 * 1024 * 1024

let server: Server | null = null
let currentPort: number | null = null
let serverAuthToken: string | null = null
let serverIdentity: HubIdentity | null = null
let publishedConfig: { json: string; publishedAt: string } | null = null
const hubBeacon = new HubBeacon()
const hubListener = new HubListener()
const payloadQueue: SyncPayload[] = []
const failedPayloadQueue: FailedSyncPayload[] = []
let isQueueLoaded = false
let persistenceChain: Promise<void> = Promise.resolve()
let pendingPayloadBytes = 0

function getQueueFilePath(): string {
  return path.join(app.getPath('userData'), 'sync-payload-queue.json')
}

function getFailedQueueFilePath(): string {
  return path.join(app.getPath('userData'), 'sync-payload-dead-letter.json')
}

async function persistQueue(): Promise<void> {
  await writeJsonAtomic(getQueueFilePath(), payloadQueue)
}

async function persistFailedQueue(): Promise<void> {
  await writeJsonAtomic(getFailedQueueFilePath(), failedPayloadQueue)
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const serialized = JSON.stringify(data)

  try {
    await writeFile(tempPath, serialized, 'utf8')
    await rename(tempPath, filePath)
  } finally {
    await rm(tempPath, { force: true }).catch(() => {
      // ignore temp cleanup errors
    })
  }
}

function schedulePersistence(options: { queue?: boolean; failed?: boolean }): Promise<void> {
  const { queue = false, failed = false } = options
  const persistTask = async (): Promise<void> => {
    if (queue) {
      await persistQueue()
    }
    if (failed) {
      await persistFailedQueue()
    }
  }

  persistenceChain = persistenceChain.then(persistTask, persistTask)
  return persistenceChain
}

async function ensureQueueLoaded(): Promise<void> {
  if (isQueueLoaded) {
    return
  }

  const parsedQueue = await readJsonFile(getQueueFilePath())
  payloadQueue.length = 0
  if (Array.isArray(parsedQueue)) {
    parsedQueue.forEach((item) => {
      if (isValidSyncPayload(item)) {
        payloadQueue.push(item)
      }
    })
  }

  const parsedFailedQueue = await readJsonFile(getFailedQueueFilePath())
  failedPayloadQueue.length = 0
  if (Array.isArray(parsedFailedQueue)) {
    parsedFailedQueue.forEach((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'payload' in item &&
        'reason' in item &&
        'quarantinedAt' in item &&
        isValidSyncPayload((item as { payload: unknown }).payload)
      ) {
        failedPayloadQueue.push({
          payload: (item as { payload: SyncPayload }).payload,
          reason: String((item as { reason: unknown }).reason),
          quarantinedAt: String((item as { quarantinedAt: unknown }).quarantinedAt),
        })
      }
    })
  }

  pendingPayloadBytes = getPendingPayloads().reduce((total, payload) => total + getSerializedPayloadSize(payload), 0)
  isQueueLoaded = true
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const content = await readFile(filePath, 'utf8')
    return JSON.parse(content) as unknown
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return null
    }

    throw new Error(`Unable to read the saved sync queue at ${filePath}. The file was left untouched to preserve recovery options.`, {
      cause: error,
    })
  }
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Sync-Token')
}

function sendJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  setCorsHeaders(response)
  response.writeHead(statusCode, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(payload))
}

class HttpRequestError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let hasRejected = false

    request.on('data', (chunk: Buffer) => {
      if (hasRejected) {
        return
      }

      totalBytes += chunk.length
      if (totalBytes > MAX_UPLOAD_BYTES) {
        hasRejected = true
        request.resume()
        reject(new HttpRequestError('Payload exceeds 5MB limit.', 413))
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      if (hasRejected) {
        return
      }

      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(JSON.parse(text))
      } catch {
        reject(new HttpRequestError('Invalid JSON body.', 400))
      }
    })

    request.on('error', (error) => {
      if (!hasRejected) {
        reject(error)
      }
    })
  })
}

function getAddressSortWeight(address: string): number {
  if (address.startsWith('192.168.')) {
    return 0
  }

  if (address.startsWith('10.')) {
    return 1
  }

  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) {
    return 2
  }

  return 3
}

function getLanIpv4Addresses(): string[] {
  const interfaces = networkInterfaces()
  const addresses = new Set<string>()

  Object.values(interfaces).forEach((entries) => {
    if (!entries) {
      return
    }

    entries.forEach((entry) => {
      const isIpv4 = entry.family === 'IPv4'
      if (!isIpv4 || entry.internal || entry.address.startsWith('169.254.')) {
        return
      }

      addresses.add(entry.address)
    })
  })

  return Array.from(addresses).sort((a, b) => {
    const weightDiff = getAddressSortWeight(a) - getAddressSortWeight(b)
    if (weightDiff !== 0) {
      return weightDiff
    }

    return a.localeCompare(b)
  })
}

function getStatus(): SyncServerStatus {
  const addresses = currentPort ? getLanIpv4Addresses() : []
  const urls = currentPort ? (addresses.length > 0 ? addresses : ['127.0.0.1']).map((address) => `http://${address}:${currentPort}`) : []

  return {
    running: server !== null,
    port: currentPort,
    url: urls[0] ?? null,
    urls,
    name: serverIdentity?.name ?? null,
    queueLength: payloadQueue.length,
    failedQueueLength: failedPayloadQueue.length,
    authRequired: Boolean(serverAuthToken),
  }
}

/** Tells the window a scout just delivered something, so it can be added without a button press. */
function announcePayloadReceived(): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('sync-server:payload-received', { queueLength: payloadQueue.length })
    }
  })
}

function getPendingPayloads(): SyncPayload[] {
  return [...payloadQueue, ...failedPayloadQueue.map((entry) => entry.payload)]
}

function getSerializedPayloadSize(payload: SyncPayload): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8')
}

function hasQueueCapacityFor(payload: SyncPayload): boolean {
  const pendingPayloads = getPendingPayloads()
  if (pendingPayloads.length >= MAX_PENDING_PAYLOADS) {
    return false
  }

  return pendingPayloadBytes + getSerializedPayloadSize(payload) <= MAX_PENDING_BYTES
}

export async function startSyncServer(port?: number, authToken?: string, identity?: HubIdentity): Promise<SyncServerStatus> {
  await ensureQueueLoaded()

  if (server !== null) {
    return getStatus()
  }

  const resolvedPort = Number(port ?? DEFAULT_PORT)
  if (!Number.isInteger(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
    throw new Error('Invalid sync server port.')
  }

  const normalizedAuthToken = typeof authToken === 'string' ? authToken.trim().toUpperCase() : ''
  if (!isValidSyncToken(normalizedAuthToken)) {
    throw new Error('A sync token must be eight characters using A–Z (without I/O) and 2–9.')
  }

  serverAuthToken = normalizedAuthToken
  serverIdentity = identity && identity.id && identity.name ? { id: String(identity.id), name: String(identity.name).slice(0, 60) } : null

  server = createServer((request, response) => {
    setCorsHeaders(response)
    
    if (!request.url || !request.method) {
      sendJson(response, 400, { ok: false, error: 'Invalid request.' })
      return
    }

    // Parse URL path (strip query params)
    const urlPath = request.url.split('?')[0]
    if (!app.isPackaged) {
      console.log(`[Sync Server] ${request.method} ${urlPath}`)
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const incomingTokenHeader = request.headers['x-sync-token']
    const incomingToken = Array.isArray(incomingTokenHeader) ? incomingTokenHeader[0] : incomingTokenHeader
    if (incomingToken !== serverAuthToken) {
      sendJson(response, 401, { ok: false, error: 'Invalid sync token.' })
      return
    }

    if (request.method === 'GET' && urlPath === '/health') {
      sendJson(response, 200, { ok: true, status: getStatus() })
      return
    }

    if (request.method === 'POST' && urlPath === '/upload') {
      const declaredContentLength = Number(request.headers['content-length'])
      if (Number.isFinite(declaredContentLength) && declaredContentLength > MAX_UPLOAD_BYTES) {
        request.resume()
        sendJson(response, 413, { ok: false, error: 'Payload exceeds 5MB limit.' })
        return
      }

      void readJsonBody(request)
        .then(async (body) => {
          if (!isValidSyncPayload(body)) {
            sendJson(response, 400, { ok: false, error: 'Invalid sync payload.' })
            return
          }

          if (body.collection !== 'scoutingData') {
            sendJson(response, 422, {
              ok: false,
              error: 'Network hub uploads accept scouting data only. Transfer forms and configuration with QR or database snapshots.',
            })
            return
          }

          await ensureQueueLoaded()
          if (!hasQueueCapacityFor(body)) {
            sendJson(response, 507, {
              ok: false,
              error: 'Hub sync queue is full. Ask the hub operator to process or clear queued payloads before retrying.',
            })
            return
          }
          payloadQueue.push(body)
          pendingPayloadBytes += getSerializedPayloadSize(body)
          await schedulePersistence({ queue: true })
          sendJson(response, 200, { ok: true, queueLength: payloadQueue.length })
          announcePayloadReceived()
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Upload failed.'
          const statusCode = error instanceof HttpRequestError ? error.statusCode : 400
          if (!response.writableEnded) {
            sendJson(response, statusCode, { ok: false, error: message })
          }
        })
      return
    }

    if (request.method === 'GET' && urlPath === '/config') {
      if (!publishedConfig) {
        sendJson(response, 404, {
          ok: false,
          error: 'The lead scout has not shared a scouting form yet. Ask them to open Sync Data on their laptop.',
        })
        return
      }

      // The stored text was validated as JSON when it was published, so it is spliced in
      // as-is rather than parsed and re-serialised on every request.
      setCorsHeaders(response)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(`{"ok":true,"publishedAt":${JSON.stringify(publishedConfig.publishedAt)},"document":${publishedConfig.json}}`)
      return
    }

    sendJson(response, 404, { ok: false, error: 'Not found.' })
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const activeServer = server
      if (!activeServer) {
        reject(new Error('Sync server did not initialize.'))
        return
      }

      const handleStartupError = (error: Error): void => {
        activeServer.removeListener('listening', handleListening)
        reject(error)
      }
      const handleListening = (): void => {
        activeServer.removeListener('error', handleStartupError)
        currentPort = resolvedPort
        resolve()
      }

      activeServer.once('error', handleStartupError)
      activeServer.once('listening', handleListening)
      activeServer.listen(resolvedPort, '0.0.0.0')
    })
  } catch (error) {
    if (server) {
      try {
        server.close()
      } catch {
        // ignore close errors during failed startup cleanup
      }
    }
    server = null
    currentPort = null
    serverAuthToken = null
    serverIdentity = null
    throw error
  }

  server.on('error', (error) => {
    console.error('Network sync server error:', error)
  })

  if (serverIdentity) {
    hubBeacon.start(serverIdentity, resolvedPort)
  }

  return getStatus()
}

export async function stopSyncServer(): Promise<SyncServerStatus> {
  hubBeacon.stop()
  publishedConfig = null
  if (!server) {
    return getStatus()
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  server = null
  currentPort = null
  serverAuthToken = null
  serverIdentity = null
  return getStatus()
}

/** The renderer hands over the current form, event and schedule so scouts can fetch them. */
export function publishSyncConfig(json: unknown): void {
  if (typeof json !== 'string' || json.length === 0 || Buffer.byteLength(json, 'utf8') > MAX_UPLOAD_BYTES) {
    throw new Error('The shared setup is missing or too large.')
  }

  JSON.parse(json)
  publishedConfig = { json, publishedAt: new Date().toISOString() }
}

export async function consumeSyncPayloads(): Promise<SyncPayload[]> {
  await ensureQueueLoaded()
  const consumed = [...payloadQueue]
  payloadQueue.length = 0
  pendingPayloadBytes = Math.max(
    0,
    pendingPayloadBytes - consumed.reduce((total, payload) => total + getSerializedPayloadSize(payload), 0),
  )
  await schedulePersistence({ queue: true })
  return consumed
}

export async function peekSyncPayloads(): Promise<SyncPayload[]> {
  await ensureQueueLoaded()
  return [...payloadQueue]
}

export async function ackSyncPayloads(count: number): Promise<SyncServerStatus> {
  await ensureQueueLoaded()
  const safeCount = Number.isInteger(count) ? Math.max(0, count) : 0
  if (safeCount > 0) {
    const acknowledged = payloadQueue.splice(0, safeCount)
    pendingPayloadBytes = Math.max(
      0,
      pendingPayloadBytes - acknowledged.reduce((total, payload) => total + getSerializedPayloadSize(payload), 0),
    )
    await schedulePersistence({ queue: true })
  }
  return getStatus()
}

export async function quarantineHeadPayload(reason: string): Promise<SyncServerStatus> {
  await ensureQueueLoaded()
  const headPayload = payloadQueue.shift()
  if (headPayload) {
    failedPayloadQueue.push({
      payload: headPayload,
      reason,
      quarantinedAt: new Date().toISOString(),
    })
    await schedulePersistence({ queue: true, failed: true })
  }

  return getStatus()
}

export async function peekFailedSyncPayloads(): Promise<FailedSyncPayload[]> {
  await ensureQueueLoaded()
  return [...failedPayloadQueue]
}

export async function retryFailedSyncPayloads(): Promise<SyncServerStatus> {
  await ensureQueueLoaded()
  if (failedPayloadQueue.length === 0) {
    return getStatus()
  }

  const retriedPayloads = failedPayloadQueue.splice(0, failedPayloadQueue.length).map((entry) => entry.payload)
  payloadQueue.unshift(...retriedPayloads)
  await schedulePersistence({ queue: true, failed: true })
  return getStatus()
}

export async function clearFailedSyncPayloads(): Promise<SyncServerStatus> {
  await ensureQueueLoaded()
  if (failedPayloadQueue.length === 0) {
    return getStatus()
  }

  pendingPayloadBytes = Math.max(
    0,
    pendingPayloadBytes - failedPayloadQueue.reduce((total, entry) => total + getSerializedPayloadSize(entry.payload), 0),
  )
  failedPayloadQueue.length = 0
  await schedulePersistence({ failed: true })
  return getStatus()
}

export function registerSyncServerIpcHandlers(): void {
  ipcMain.handle(
    'sync-server:start',
    async (_event, port?: number, authToken?: string, identity?: HubIdentity) => await startSyncServer(port, authToken, identity),
  )
  ipcMain.handle('sync-server:publish-config', (_event, json: unknown) => publishSyncConfig(json))
  ipcMain.handle('discovery:start', () => hubListener.start())
  ipcMain.handle('discovery:stop', () => hubListener.stop())
  ipcMain.handle('discovery:list', () => hubListener.list())
  ipcMain.handle('sync-server:stop', async () => await stopSyncServer())
  ipcMain.handle('sync-server:status', async () => {
    await ensureQueueLoaded()
    return getStatus()
  })
  ipcMain.handle('sync-server:consume', async () => await consumeSyncPayloads())
  ipcMain.handle('sync-server:peek', async () => await peekSyncPayloads())
  ipcMain.handle('sync-server:ack', async (_event, count: number) => await ackSyncPayloads(count))
  ipcMain.handle('sync-server:quarantine-head', async (_event, reason: string) => await quarantineHeadPayload(reason))
  ipcMain.handle('sync-server:failed-peek', async () => await peekFailedSyncPayloads())
  ipcMain.handle('sync-server:failed-retry-all', async () => await retryFailedSyncPayloads())
  ipcMain.handle('sync-server:failed-clear', async () => await clearFailedSyncPayloads())
}
