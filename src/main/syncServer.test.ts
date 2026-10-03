import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => [] as Array<{ channel: string; payload: unknown }>)
const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData, isPackaged: true },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
      },
    ],
  },
}))

const server = await import('./syncServer')

const TOKEN = 'ABCD2345'
let port = 0
let base = ''
let nextPort = 47_000 + Math.floor(Math.random() * 1_000)

const scoutingRow = (id: string) => ({
  id,
  eventId: '2026casd',
  deviceId: 'device_a',
  matchNumber: 1,
  teamNumber: 254,
  timestamp: '2026-03-14T18:00:00.000Z',
  autoScore: 1,
  teleopScore: 2,
  endgameScore: 3,
  formData: {},
  notes: '',
  createdAt: '2026-03-14T18:00:00.000Z',
})

const payload = (rows: Array<Record<string, unknown>>, collection = 'scoutingData') => ({
  exportedAt: '2026-03-14T19:00:00.000Z',
  collection,
  count: rows.length,
  data: rows,
})

function post(body: unknown, token: string | null = TOKEN, raw = false): Promise<Response> {
  return fetch(`${base}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-sync-token': token } : {}) },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

function get(pathname: string, token: string | null = TOKEN): Promise<Response> {
  return fetch(`${base}${pathname}`, { headers: token ? { 'x-sync-token': token } : {} })
}

beforeEach(async () => {
  state.userData = mkdtempSync(path.join(tmpdir(), 'matchbook-sync-'))
  sent.length = 0
  // A fresh port each time: reusing a recently closed port can reset a pooled fetch socket.
  port = nextPort++
  base = `http://127.0.0.1:${port}`
  await server.startSyncServer(port, TOKEN)
})

afterEach(async () => {
  await server.consumeSyncPayloads()
  await server.clearFailedSyncPayloads()
  await server.stopSyncServer()
  rmSync(state.userData, { recursive: true, force: true })
})

afterAll(async () => {
  await server.stopSyncServer()
})

describe('authentication', () => {
  it('refuses every request that does not carry the code', async () => {
    expect((await get('/health', null)).status).toBe(401)
    expect((await get('/health', 'WRONG234')).status).toBe(401)
    expect((await post(payload([scoutingRow('a')]), null)).status).toBe(401)
    expect((await get('/config', null)).status).toBe(401)
  })

  it('lets the correct code see the hub status', async () => {
    const response = await get('/health')
    const body = (await response.json()) as { ok: boolean; status: { running: boolean; port: number; authRequired: boolean } }

    expect(response.status).toBe(200)
    expect(body.status).toMatchObject({ running: true, port, authRequired: true })
  })

  it('answers a browser preflight without needing the code', async () => {
    const response = await fetch(`${base}/upload`, { method: 'OPTIONS' })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toContain('X-Sync-Token')
  })
})

describe('uploads', () => {
  it('queues a scout’s entries and reports the queue length', async () => {
    const response = await post(payload([scoutingRow('a'), scoutingRow('b')]))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, queueLength: 1 })
    expect(await server.peekSyncPayloads()).toHaveLength(1)
  })

  it('tells the window that something arrived, so it can be added automatically', async () => {
    await post(payload([scoutingRow('a')]))

    await vi.waitFor(() => expect(sent).toEqual([{ channel: 'sync-server:payload-received', payload: { queueLength: 1 } }]))
  })

  it('writes the queue to disk so a crash or restart cannot lose it', async () => {
    await post(payload([scoutingRow('a')]))

    const saved = JSON.parse(readFileSync(path.join(state.userData, 'sync-payload-queue.json'), 'utf8')) as unknown[]
    expect(saved).toHaveLength(1)
  })

  it('hands the queue over exactly once', async () => {
    await post(payload([scoutingRow('a')]))

    expect(await server.consumeSyncPayloads()).toHaveLength(1)
    expect(await server.consumeSyncPayloads()).toHaveLength(0)
  })

  it('accepts scouting entries and a scout’s name only; forms, schedules and assignments go the other way', async () => {
    for (const collection of ['formSchemas', 'events', 'matches', 'assignments', 'analysisConfigs']) {
      const response = await post(payload([{ id: 'x', key: 'x' }], collection))
      expect(response.status, collection).toBe(422)
    }

    expect(await server.peekSyncPayloads()).toHaveLength(0)
  })

  it('queues a scout’s name so the lead scout can assign them matches', async () => {
    const response = await post(payload([{ id: 'scout_1', name: 'Riley', deviceId: 'device_a' }], 'roster'))

    expect(response.status).toBe(200)
    expect(await server.peekSyncPayloads()).toMatchObject([{ collection: 'roster' }])
  })

  it('puts an upload that is retried from quarantine behind the ones waiting, so a pass in progress acknowledges the right one', async () => {
    await post(payload([scoutingRow('a')]))
    await server.quarantineHeadPayload('could not be read')
    await post(payload([scoutingRow('b')]))

    // A receiving pass has taken a copy of the queue and will acknowledge what it finishes, one at a time, from the head.
    const taken = await server.peekSyncPayloads()
    expect(taken).toHaveLength(1)
    // Meanwhile the lead scout presses Try again on the upload that was set aside.
    await server.retryFailedSyncPayloads()
    await server.ackSyncPayloads(taken.length)

    const waiting = await server.peekSyncPayloads()
    expect(waiting).toHaveLength(1)
    expect(waiting[0].data[0]).toMatchObject({ id: 'a' })
    expect(await server.peekFailedSyncPayloads()).toHaveLength(0)
  })

  it.each([
    ['a body that is not JSON', 'not json at all', true],
    ['a payload whose count disagrees with its rows', { ...payload([scoutingRow('a')]), count: 5 }, false],
    ['a payload with an unknown collection', payload([{ id: 'x' }], 'somethingElse'), false],
    ['a payload with a row that has no id', payload([{ noId: true }]), false],
  ])('rejects %s', async (_label, body, raw) => {
    const response = await post(body, TOKEN, raw)

    expect(response.status).toBe(400)
    expect(await server.peekSyncPayloads()).toHaveLength(0)
  })

  it('refuses a body larger than the limit', async () => {
    const huge = payload([{ ...scoutingRow('a'), notes: 'x'.repeat(5 * 1024 * 1024 + 100) }])
    const response = await post(huge).catch(() => null)

    // Either a clean 413, or the connection is closed on us mid-upload: both mean "refused".
    expect(response === null || response.status === 413).toBe(true)
    expect(await server.peekSyncPayloads()).toHaveLength(0)
  })
})

describe('sharing the form and schedule with scouts', () => {
  const setup = {
    exportedAt: '2026-03-14T19:00:00.000Z',
    version: 2,
    collections: { formSchemas: [{ id: 'form-1', name: 'Match scouting' }], events: [], matches: [] },
  }

  it('says so plainly when nothing has been shared yet', async () => {
    const response = await get('/config')

    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toMatch(/not shared/)
  })

  it('serves exactly what the hub shared', async () => {
    server.publishSyncConfig(JSON.stringify(setup))
    const response = await get('/config')
    const body = (await response.json()) as { ok: boolean; publishedAt: string; document: unknown }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.document).toEqual(setup)
    expect(new Date(body.publishedAt).getTime()).not.toBeNaN()
  })

  it('serves the newest version after the hub changes the form', async () => {
    server.publishSyncConfig(JSON.stringify(setup))
    server.publishSyncConfig(JSON.stringify({ ...setup, version: 3 }))

    const body = (await (await get('/config')).json()) as { document: { version: number } }
    expect(body.document.version).toBe(3)
  })

  it('stops sharing an old setup when receiving restarts', async () => {
    server.publishSyncConfig(JSON.stringify(setup))
    await server.stopSyncServer()
    await server.startSyncServer(port, TOKEN)

    expect((await get('/config')).status).toBe(404)
  })

  it.each<[unknown, string]>([['', 'empty'], ['{not json', 'invalid JSON'], [42, 'not text']])('refuses to share %j (%s)', (value) => {
    expect(() => server.publishSyncConfig(value)).toThrow()
  })
})

describe('lifecycle', () => {
  it('reports every address it can be reached on, best first', async () => {
    const status = await server.startSyncServer(port, TOKEN)

    expect(status.urls.length).toBeGreaterThan(0)
    expect(status.url).toBe(status.urls[0])
    status.urls.forEach((url) => expect(url).toMatch(new RegExp(`^http://[\\d.]+:${port}$`)))
  })

  it('refuses to start with a malformed code', async () => {
    await server.stopSyncServer()

    await expect(server.startSyncServer(port, 'short')).rejects.toThrow(/sync token/)
  })

  it('stops listening when told to', async () => {
    await server.stopSyncServer()

    await expect(get('/health')).rejects.toThrow()
  })
})
