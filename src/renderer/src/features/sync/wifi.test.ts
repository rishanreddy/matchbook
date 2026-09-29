import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoutingDatabase } from '../../lib/db/collections'
import type { SyncPayload } from '../../../../shared/syncProtocol'
import { importPayload } from './syncData'
import { createMemoryStorage, createTestDatabase } from './testDatabase'
import {
  WifiError,
  checkHub,
  encodePairing,
  fetchHubSetup,
  parsePairing,
  splitIntoBatches,
  uploadScoutingData,
  validateTarget,
} from './wifi'

const TARGET = { url: 'http://192.168.1.20:41735', token: 'ABCD2345' }

const entry = (id: string, notes = ''): Record<string, unknown> => ({
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
  notes,
  createdAt: '2026-03-14T18:00:00.000Z',
})

const respond = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let db: ScoutingDatabase
const fetchMock = vi.fn()

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  db = await createTestDatabase()
})

afterEach(async () => {
  await db.close()
  vi.unstubAllGlobals()
})

async function expectFailure(promise: Promise<unknown>, kind: string, message: RegExp): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(WifiError)
  expect((error as WifiError).kind).toBe(kind)
  expect((error as WifiError).message).toMatch(message)
}

describe('validateTarget', () => {
  it('tidies what a person typed', () => {
    expect(validateTarget({ url: '192.168.1.20:41735', token: ' abcd2345 ' })).toEqual({
      url: 'http://192.168.1.20:41735',
      token: 'ABCD2345',
    })
  })

  it('asks for a laptop before anything else', () => {
    expect(() => validateTarget({ url: '  ', token: 'ABCD2345' })).toThrow(/Choose the lead scout/)
  })

  it('refuses an address that is not on a private network', () => {
    expect(() => validateTarget({ url: 'http://example.com:41735', token: 'ABCD2345' })).toThrow(/does not look right/)
    expect(() => validateTarget({ url: 'http://8.8.8.8:41735', token: 'ABCD2345' })).toThrow(/does not look right/)
  })

  it.each(['', 'ABC', 'ABCD234O', 'ABCD23456'])('refuses the code %j', (token) => {
    expect(() => validateTarget({ url: TARGET.url, token })).toThrow(/8-character code/)
  })
})

describe('splitIntoBatches', () => {
  const payload = (rows: Record<string, unknown>[]): SyncPayload => ({
    exportedAt: '2026-03-14T19:00:00.000Z',
    collection: 'scoutingData',
    count: rows.length,
    data: rows,
  })

  it('keeps a small payload in one piece', () => {
    expect(splitIntoBatches(payload([entry('a'), entry('b')]))).toHaveLength(1)
  })

  it('still sends an empty payload, so a scout with nothing new can confirm the connection', () => {
    expect(splitIntoBatches(payload([]))).toHaveLength(1)
  })

  it('splits by size and never loses or repeats a row', () => {
    const rows = Array.from({ length: 40 }, (_, index) => entry(`row-${index}`, 'n'.repeat(500)))
    const batches = splitIntoBatches(payload(rows), 6_000)

    expect(batches.length).toBeGreaterThan(3)
    expect(batches.flatMap((batch) => batch.data.map((row) => row.id))).toEqual(rows.map((row) => row.id))
    for (const batch of batches) {
      expect(batch.count).toBe(batch.data.length)
      expect(new TextEncoder().encode(JSON.stringify(batch)).length).toBeLessThanOrEqual(6_000)
    }
  })

  it('says so when a single entry can never fit', () => {
    expect(() => splitIntoBatches(payload([entry('a', 'x'.repeat(2_000))]), 1_000)).toThrow(/too large/)
  })
})

describe('talking to the hub', () => {
  it('sends every entry with the code attached', async () => {
    await importPayload(db, { exportedAt: 'x', collection: 'scoutingData', count: 2, data: [entry('a'), entry('b')] })
    fetchMock.mockResolvedValue(respond(200, { ok: true, queueLength: 1 }))

    const outcome = await uploadScoutingData(db, TARGET)

    expect(outcome).toEqual({ entries: 2, batches: 1 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://192.168.1.20:41735/upload')
    expect((init.headers as Record<string, string>)['x-sync-token']).toBe('ABCD2345')
    expect(JSON.parse(init.body as string).data).toHaveLength(2)
  })

  it('confirms a hub is reachable without sending anything', async () => {
    fetchMock.mockResolvedValue(respond(200, { ok: true }))

    await checkHub(TARGET)

    expect(fetchMock.mock.calls[0][0]).toBe('http://192.168.1.20:41735/health')
  })

  it('explains an unreachable laptop in terms of what to check', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expectFailure(checkHub(TARGET), 'unreachable', /same Wi-Fi.*Start receiving/)
  })

  it('explains a slow laptop the same way', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    await expectFailure(checkHub(TARGET), 'timeout', /too long/)
  })

  it('points at the code when it is wrong', async () => {
    fetchMock.mockResolvedValue(respond(401, { ok: false }))

    await expectFailure(uploadScoutingData(db, TARGET), 'wrong-code', /8-character code/)
  })

  it('says to open Sync Data when the hub has a backlog', async () => {
    fetchMock.mockResolvedValue(respond(507, { ok: false, error: 'queue is full' }))

    await expectFailure(uploadScoutingData(db, TARGET), 'full', /Sync Data/)
  })

  it('never marks corrections as sent when the upload failed', async () => {
    localStorage.setItem('matchbook-scouting-deletion-outbox-v1', JSON.stringify([{ id: 'gone', deletedAt: '2026-03-14T19:30:00.000Z' }]))
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await uploadScoutingData(db, TARGET).catch(() => undefined)

    expect(JSON.parse(localStorage.getItem('matchbook-scouting-deletion-outbox-v1') ?? '[]')).toHaveLength(1)
  })

  it('clears corrections from the outbox once the hub has them', async () => {
    localStorage.setItem('matchbook-scouting-deletion-outbox-v1', JSON.stringify([{ id: 'gone', deletedAt: '2026-03-14T19:30:00.000Z' }]))
    fetchMock.mockResolvedValue(respond(200, { ok: true, queueLength: 1 }))

    const outcome = await uploadScoutingData(db, TARGET)

    expect(outcome.entries).toBe(0)
    expect(JSON.parse(localStorage.getItem('matchbook-scouting-deletion-outbox-v1') ?? '[]')).toHaveLength(0)
  })

  it('fetches what the hub is sharing as a document ready to add', async () => {
    fetchMock.mockResolvedValue(
      respond(200, { ok: true, publishedAt: 'x', document: { version: 2, collections: { events: [{ id: '2026casd', name: 'San Diego' }] } } }),
    )

    const document = await fetchHubSetup(TARGET)

    expect(document.tasks).toEqual([{ collection: 'events', rows: [{ id: '2026casd', name: 'San Diego' }] }])
  })

  it('relays the hub’s own explanation when nothing has been shared', async () => {
    fetchMock.mockResolvedValue(respond(404, { ok: false, error: 'The lead scout has not shared a scouting form yet.' }))

    await expectFailure(fetchHubSetup(TARGET), 'nothing-shared', /has not shared/)
  })
})

describe('pairing codes', () => {
  it('round-trips the address, code and name a scout scans from the hub', () => {
    const text = encodePairing('http://192.168.1.20:41735', 'ABCD2345', 'Lead Laptop')

    expect(parsePairing(text)).toEqual({ url: 'http://192.168.1.20:41735', token: 'ABCD2345', name: 'Lead Laptop' })
  })

  it('cannot be confused by a pipe in the hub’s name', () => {
    expect(parsePairing(encodePairing('http://10.0.0.5:41735', 'ABCD2345', 'Red | Blue'))?.name).toBe('Red   Blue')
  })

  it.each(['', 'https://example.com', 'MBP1|http://8.8.8.8:41735|ABCD2345|x', 'MBP1|http://10.0.0.5:41735|SHORT|x', 'MB1:ABCD:1:00000000:1:AAA'])(
    'ignores %j',
    (text) => {
      expect(parsePairing(text)).toBeNull()
    },
  )
})
