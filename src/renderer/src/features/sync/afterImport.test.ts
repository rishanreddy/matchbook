import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { useEventStore } from '../../stores/useEventStore'
import { adoptHubEvent, placementHint } from './afterImport'
import { entriesUnderOtherEvents, eventLabel } from './receiveNotices'
import { emptyImportResult } from './syncData'
import { createMemoryStorage, createTestDatabase } from './testDatabase'

let db: ScoutingDatabase

const event = (id: string, name: string, season = 2026) => ({
  id,
  name,
  season,
  startDate: '2026-03-12',
  endDate: '2026-03-14',
  syncedAt: '2026-03-01T00:00:00.000Z',
  createdAt: '2026-03-01T00:00:00.000Z',
})

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  useEventStore.setState({ currentEventId: null, currentSeason: null, isLoaded: true })
  db = await createTestDatabase()
})

afterEach(async () => {
  await db.close()
  vi.unstubAllGlobals()
})

describe('adoptHubEvent', () => {
  it('starts a laptop with no event on the lead scout’s event', async () => {
    await db.collections.events.bulkInsert([event('2026casd', 'San Diego Regional'), event('2026txhou', 'Houston Regional')])

    const outcome = await adoptHubEvent(db, '2026casd')

    expect(outcome).toEqual({ kind: 'adopted', eventId: '2026casd', eventName: 'San Diego Regional' })
    expect(useEventStore.getState().currentEventId).toBe('2026casd')
    expect(localStorage.getItem('matchbook-current-event-id')).toBe('2026casd')
  })

  it('never guesses an event for a laptop, even when there is only one, if the lead scout did not name it', async () => {
    await db.collections.events.insert(event('2026casd', 'San Diego Regional'))
    expect((await adoptHubEvent(db, undefined)).kind).toBe('unchanged')
    expect(useEventStore.getState().currentEventId).toBeNull()
  })

  it('does not guess between several events when the lead scout’s is not known here', async () => {
    await db.collections.events.bulkInsert([event('2026casd', 'San Diego Regional'), event('2026txhou', 'Houston Regional')])
    expect((await adoptHubEvent(db, undefined)).kind).toBe('unchanged')
    expect((await adoptHubEvent(db, '2099zzzz')).kind).toBe('unchanged')
    expect(useEventStore.getState().currentEventId).toBeNull()
  })

  it('leaves a laptop alone when it is already on the lead scout’s event', async () => {
    await db.collections.events.insert(event('2026casd', 'San Diego Regional'))
    useEventStore.getState().setCurrentEvent('2026casd', 2026)
    expect((await adoptHubEvent(db, '2026casd')).kind).toBe('unchanged')
  })

  it('tells a laptop on a different event instead of switching it silently', async () => {
    await db.collections.events.bulkInsert([event('2026casd', 'San Diego Regional'), event('2026txhou', 'Houston Regional')])
    useEventStore.getState().setCurrentEvent('2026txhou', 2026)

    const outcome = await adoptHubEvent(db, '2026casd')

    expect(outcome).toEqual({ kind: 'differs', hubEventId: '2026casd', hubEventName: 'San Diego Regional', currentEventName: 'Houston Regional' })
    expect(useEventStore.getState().currentEventId).toBe('2026txhou')
  })

  it('replaces an event the laptop remembers but no longer has', async () => {
    await db.collections.events.insert(event('2026casd', 'San Diego Regional'))
    useEventStore.getState().setCurrentEvent('2000gone', 2000)
    expect((await adoptHubEvent(db, '2026casd')).kind).toBe('adopted')
    expect(useEventStore.getState().currentEventId).toBe('2026casd')
  })
})

describe('saying where entries went', () => {
  const names = new Map([['2026casd', 'San Diego Regional']])

  it('finds the new entries filed under any other event', () => {
    const result = { ...emptyImportResult(), entriesByEvent: { '2026casd': 5, none: 9, '2026txhou': 2 } }
    expect(entriesUnderOtherEvents(result, '2026casd')).toEqual([['none', 9], ['2026txhou', 2]])
    // A laptop on no event shows every entry, so nothing is hidden from it.
    expect(entriesUnderOtherEvents(result, null)).toEqual([])
  })

  it('names the event in words', () => {
    expect(eventLabel('none', names)).toBe('no event')
    expect(eventLabel('2026casd', names)).toBe('San Diego Regional')
    expect(eventLabel('2099zzzz', names)).toBe('2099zzzz')
  })

  it('writes one sentence that says how many entries are elsewhere and what to do', () => {
    const result = { ...emptyImportResult(), inserted: 14, entriesByEvent: { '2026casd': 5, none: 9 } }
    expect(placementHint(result, '2026casd', names)).toBe(
      '9 new entries are filed under no event, not San Diego Regional. Choose All events in Review Entries to see them.',
    )
  })

  it('lists the events when entries went to several', () => {
    const result = { ...emptyImportResult(), inserted: 11, entriesByEvent: { none: 9, '2026casd': 2 } }
    const withHouston = new Map([...names, ['2026txhou', 'Houston Regional']])
    expect(placementHint({ ...result, entriesByEvent: { none: 9, '2026txhou': 2 } }, '2026casd', withHouston)).toBe(
      '11 new entries are filed under other events (9 under no event, 2 under Houston Regional), not San Diego Regional. Choose All events in Review Entries to see them.',
    )
  })

  it('says nothing when every new entry is under the event the laptop is on', () => {
    const result = { ...emptyImportResult(), inserted: 5, entriesByEvent: { '2026casd': 5 } }
    expect(placementHint(result, '2026casd', names)).toBeNull()
  })

  it('uses the singular for one entry', () => {
    const result = { ...emptyImportResult(), inserted: 1, entriesByEvent: { none: 1 } }
    expect(placementHint(result, '2026casd', names)).toBe('1 new entry is filed under no event, not San Diego Regional. Choose All events in Review Entries to see it.')
  })

  it('says nothing on a laptop that is on no event, which shows every entry anyway', () => {
    const result = { ...emptyImportResult(), inserted: 3, entriesByEvent: { none: 3 } }
    expect(placementHint(result, null, names)).toBeNull()
  })
})
