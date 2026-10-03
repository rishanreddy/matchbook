import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncPayload } from '../../../../shared/syncProtocol'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { useEventStore } from '../../stores/useEventStore'
import { useWifiHub } from '../../stores/useWifiHub'
import { addReceivedScouting } from './hubService'
import { createMemoryStorage, createTestDatabase } from './testDatabase'

const notify = vi.hoisted(() => vi.fn())
vi.mock('../../lib/utils/notify', () => ({ notify }))

let db: ScoutingDatabase

const NOW = '2026-03-14T18:00:00.000Z'

const entriesUpload = (count = 1): SyncPayload => ({
  exportedAt: NOW,
  collection: 'scoutingData',
  count,
  data: Array.from({ length: count }, (_, index) => ({
    id: `entry_${index}`,
    eventId: '2026casd',
    deviceId: 'device_scout',
    matchNumber: index + 1,
    teamNumber: 254,
    timestamp: NOW,
    autoScore: 2,
    teleopScore: 8,
    endgameScore: 3,
    formData: { autoScored: 2 },
    notes: '',
    createdAt: NOW,
  })),
})

const nameUpload = (): SyncPayload => ({
  exportedAt: NOW,
  collection: 'roster',
  count: 1,
  data: [{ id: 'scout_riley', name: 'Riley', deviceId: 'device_scout', deviceName: 'Scout Laptop 1', status: 'active', createdAt: NOW, updatedAt: NOW }],
})

/** The lead scout's upload queue as the main process keeps it, as far as the renderer can see. */
function fakeQueue(initial: SyncPayload[]) {
  const queue = [...initial]
  const api = {
    peekSyncPayloads: vi.fn(async () => [...queue]),
    ackSyncPayloads: vi.fn(async (count: number) => {
      queue.splice(0, count)
    }),
    quarantineHeadSyncPayload: vi.fn(async () => {
      queue.shift()
    }),
    getSyncServerStatus: vi.fn(async () => null),
  }
  vi.stubGlobal('window', { electronAPI: api })
  return { queue, api }
}

const toasts = (title: string) => notify.mock.calls.filter(([toast]) => (toast as { title?: string }).title === title)

/** The words in a toast, whether its message is a string or a little piece of page. */
function wordsIn(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(wordsIn).join('')
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    return wordsIn((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  useEventStore.setState({ currentEventId: '2026casd', currentSeason: 2026, isLoaded: true })
  useWifiHub.setState({ receivedThisSession: 0 })
  notify.mockClear()
  db = await createTestDatabase()
})

afterEach(async () => {
  await db.close()
  vi.unstubAllGlobals()
})

describe('adding what scouts have sent', () => {
  it('adds an upload that arrives while the one before it is still being added', async () => {
    const { queue, api } = fakeQueue([entriesUpload()])
    let second: ReturnType<typeof addReceivedScouting> | undefined
    api.ackSyncPayloads.mockImplementationOnce(async (count: number) => {
      queue.splice(0, count)
      // A scout's name is sent right behind its entries, while the first upload is being finished off.
      queue.push(nameUpload())
      second = addReceivedScouting(db)
    })

    await addReceivedScouting(db)
    await second

    expect(queue).toEqual([])
    expect(await db.collections.scoutingData.find().exec()).toHaveLength(1)
    expect((await db.collections.roster.find().exec()).map((scout) => scout.name)).toEqual(['Riley'])
  })

  it('keeps taking another look for as long as uploads keep arriving', async () => {
    const { queue, api } = fakeQueue([entriesUpload()])
    const late = [nameUpload(), { ...entriesUpload(2), exportedAt: '2026-03-14T18:05:00.000Z' }]
    api.ackSyncPayloads.mockImplementation(async (count: number) => {
      queue.splice(0, count)
      const next = late.shift()
      if (next) {
        queue.push(next)
        void addReceivedScouting(db)
      }
    })

    await addReceivedScouting(db)
    // Let the passes the late uploads asked for finish.
    await vi.waitFor(async () => expect(queue).toEqual([]))

    expect(await db.collections.roster.find().exec()).toHaveLength(1)
    expect(await db.collections.scoutingData.find().exec()).toHaveLength(2)
  })

  it('tells the lead scout once and counts each entry once, however many uploads were waiting', async () => {
    const { queue, api } = fakeQueue([entriesUpload()])
    api.ackSyncPayloads.mockImplementationOnce(async (count: number) => {
      queue.splice(0, count)
      queue.push(nameUpload())
      void addReceivedScouting(db)
    })

    const outcome = await addReceivedScouting(db)

    expect(outcome.payloads).toBe(2)
    expect(toasts('Scouting received')).toHaveLength(1)
    expect(useWifiHub.getState().receivedThisSession).toBe(1)
  })

  it('answers a person who pressed the button during a pass that found nothing', async () => {
    fakeQueue([])
    const pressed = addReceivedScouting(db)
    const again = addReceivedScouting(db, { manual: true })

    await Promise.all([pressed, again])

    expect(toasts('Nothing waiting')).toHaveLength(1)
  })

  it('says where to look when everything a scout sent was already here, instead of only that it was', async () => {
    fakeQueue([entriesUpload(2)])
    await addReceivedScouting(db)
    notify.mockClear()
    fakeQueue([entriesUpload(2)])

    await addReceivedScouting(db, { manual: true })

    const [toast] = toasts('Nothing new')
    expect(toast).toBeDefined()
    const words = wordsIn((toast[0] as { message: unknown }).message)
    expect(words).toContain('2 already here')
    expect(words).toContain('already on this laptop')
    expect(words).toContain('another event')
    expect(words).toContain('Show all entries')
  })

  it('stays quiet when nothing arrived and nobody asked', async () => {
    fakeQueue([])
    await addReceivedScouting(db)
    expect(notify).not.toHaveBeenCalled()
  })

  it('can run again after a pass could not read the queue', async () => {
    const { api } = fakeQueue([entriesUpload()])
    api.peekSyncPayloads.mockRejectedValueOnce(new Error('The main process did not answer.'))

    await expect(addReceivedScouting(db)).rejects.toThrow('did not answer')
    await addReceivedScouting(db)

    expect(await db.collections.scoutingData.find().exec()).toHaveLength(1)
  })

  it('sets aside an upload it cannot read and carries on with the rest', async () => {
    const broken = { ...entriesUpload(), data: [{ id: 'entry_broken', teamNumber: 'not a number' }] } as SyncPayload
    const { queue } = fakeQueue([broken, nameUpload()])

    const outcome = await addReceivedScouting(db)

    expect(outcome.quarantined).toBe(1)
    expect(outcome.payloads).toBe(1)
    expect(queue).toEqual([])
    expect(await db.collections.roster.find().exec()).toHaveLength(1)
    expect(toasts('Some data was set aside')).toHaveLength(1)
  })
})
