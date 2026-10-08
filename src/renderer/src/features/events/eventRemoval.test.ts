import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { useEventStore } from '../../stores/useEventStore'
import { analysisViewStore, updateAnalysisView } from '../../stores/analysisViewStore'
import { createMemoryStorage, createTestDatabase } from '../sync/testDatabase'
import { countEventData, removeLocalEvent } from './eventRemoval'

let db: ScoutingDatabase
const timestamp = '2026-03-14T12:00:00.000Z'

async function seedEvent(eventId: string): Promise<void> {
  await db.collections.events.insert({
    id: eventId, name: eventId, season: 2026, startDate: '2026-03-12', endDate: '2026-03-14', syncedAt: timestamp, createdAt: timestamp,
  })
  await db.collections.matches.insert({
    key: `${eventId}_qm1`, eventId, matchNumber: 1, compLevel: 'qm', predictedTime: timestamp,
    redAlliance: ['frc254'], blueAlliance: ['frc971'], createdAt: timestamp,
  })
  await db.collections.assignments.insert({
    id: `${eventId}_qm1:red1`, eventKey: eventId, matchKey: `${eventId}_qm1`, alliancePosition: 'red1',
    teamKey: 'frc254', scoutId: 'scout-a', deviceId: 'device-a', assignedAt: timestamp,
  })
  await db.collections.scoutingData.insert({
    id: `${eventId}-entry`, eventId, deviceId: 'device-a', matchNumber: 1, teamNumber: 254,
    timestamp, autoScore: 0, teleopScore: 0, endgameScore: 0, formData: {}, notes: '', createdAt: timestamp,
  })
}

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  useEventStore.getState().clearCurrentEvent()
  db = await createTestDatabase()
  await seedEvent('2026first')
  await seedEvent('2026other')
})

afterEach(async () => {
  await db.close()
  useEventStore.getState().clearCurrentEvent()
  vi.unstubAllGlobals()
})

describe('local event removal', () => {
  it('keeps all associated data when only the event is removed and clears its global selection', async () => {
    useEventStore.getState().setCurrentEvent('2026first', 2026)
    updateAnalysisView({ selectedEventId: '2026first', comparison: { eventId: '2026first', teamNumbers: [254] } })
    expect(await countEventData(db, '2026first')).toEqual({ matches: 1, assignments: 1, observations: 1 })

    expect(await removeLocalEvent({ db, eventId: '2026first', deleteAssociatedData: false })).toEqual({ matches: 0, assignments: 0, observations: 0 })

    expect(await db.collections.events.findOne('2026first').exec()).toBeNull()
    expect(await countEventData(db, '2026first')).toEqual({ matches: 1, assignments: 1, observations: 1 })
    expect(useEventStore.getState()).toMatchObject({ currentEventId: null, currentSeason: null })
    expect(localStorage.getItem('matchbook-current-event-id')).toBeNull()
    expect(localStorage.getItem('matchbook-current-season')).toBeNull()
    expect(analysisViewStore.get()).toMatchObject({ selectedEventId: null, comparison: null })
    useEventStore.getState().loadFromStorage()
    expect(useEventStore.getState().currentEventId).toBeNull()
  })

  it('deletes only the requested event and its associated data when opted in', async () => {
    useEventStore.getState().setCurrentEvent('2026other', 2026)
    expect(await removeLocalEvent({ db, eventId: '2026first', deleteAssociatedData: true })).toEqual({ matches: 1, assignments: 1, observations: 1 })

    expect(await countEventData(db, '2026first')).toEqual({ matches: 0, assignments: 0, observations: 0 })
    expect(await db.collections.events.findOne('2026first').exec()).toBeNull()
    expect(await db.collections.events.findOne('2026other').exec()).not.toBeNull()
    expect(await countEventData(db, '2026other')).toEqual({ matches: 1, assignments: 1, observations: 1 })
    expect(useEventStore.getState().currentEventId).toBe('2026other')
  })

  it('includes data added after the removal dialog counted it', async () => {
    expect((await countEventData(db, '2026first')).observations).toBe(1)
    const original = await db.collections.scoutingData.findOne('2026first-entry').exec()
    if (!original) throw new Error('Fixture entry is missing')
    await db.collections.scoutingData.insert({ ...original.toJSON(), id: 'late-entry' })

    const deleted = await removeLocalEvent({ db, eventId: '2026first', deleteAssociatedData: true })
    expect(deleted.observations).toBe(2)
    expect(await countEventData(db, '2026first')).toEqual({ matches: 0, assignments: 0, observations: 0 })
  })

  it('can delete kept data after the event metadata has already been removed', async () => {
    await removeLocalEvent({ db, eventId: '2026first', deleteAssociatedData: false })
    await removeLocalEvent({ db, eventId: '2026first', deleteAssociatedData: true })
    expect(await countEventData(db, '2026first')).toEqual({ matches: 0, assignments: 0, observations: 0 })
  })
})

describe('global event selection', () => {
  it('changes the persisted selection and resets an older analysis event filter', () => {
    useEventStore.getState().setCurrentEvent('2026first', 2026)
    updateAnalysisView({ selectedEventId: '2026first', comparison: { eventId: '2026first', teamNumbers: [254] } })
    useEventStore.getState().setCurrentEvent('2026other', 2026)
    expect(useEventStore.getState().currentEventId).toBe('2026other')
    expect(localStorage.getItem('matchbook-current-event-id')).toBe('2026other')
    expect(analysisViewStore.get()).toMatchObject({ selectedEventId: null, comparison: null })
  })
})
