import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScoutingDatabase } from '../../lib/db/collections'
import type { MatchDocType } from '../../lib/db/schemas/matches.schema'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { buildPayload, importPayload } from '../sync/syncData'
import { createMemoryStorage, createTestDatabase } from '../sync/testDatabase'
import { vi } from 'vitest'
import { listAssignments, nextTimestamp, releaseAll, setSlot, slotId, teamKeyAt, teamNumberOf, toPlanMatch, writeAssignments } from './assignmentService'

let db: ScoutingDatabase

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  db = await createTestDatabase()
})

afterEach(async () => {
  await db.close()
  vi.unstubAllGlobals()
})

const match: MatchDocType = {
  key: '2026casd_qm1',
  eventId: '2026casd',
  matchNumber: 1,
  compLevel: 'qm',
  predictedTime: '2026-03-14T18:00:00.000Z',
  redAlliance: ['frc254', 'frc971', 'frc118'],
  blueAlliance: ['frc1678', 'frc148', 'frc2056'],
  createdAt: '2026-03-14T09:00:00.000Z',
}

const scout = (id: string, deviceId = '', name = id): RosterScoutDocType => ({
  id,
  name,
  deviceId,
  deviceName: '',
  status: 'active',
  createdAt: '2026-03-14T10:00:00.000Z',
  updatedAt: '2026-03-14T10:00:00.000Z',
})

describe('reading the schedule', () => {
  it('finds the team at each station', () => {
    expect(teamKeyAt(match, 'red1')).toBe('frc254')
    expect(teamKeyAt(match, 'red3')).toBe('frc118')
    expect(teamKeyAt(match, 'blue2')).toBe('frc148')
    expect(teamKeyAt({ redAlliance: [], blueAlliance: [] }, 'red1')).toBe('')
  })

  it('turns a match into the shape the planner uses', () => {
    expect(toPlanMatch(match)).toEqual({
      key: '2026casd_qm1',
      matchNumber: 1,
      teams: { red1: 'frc254', red2: 'frc971', red3: 'frc118', blue1: 'frc1678', blue2: 'frc148', blue3: 'frc2056' },
    })
  })

  it('reads a team number from a team key', () => {
    expect(teamNumberOf('frc254')).toBe(254)
    expect(teamNumberOf('')).toBeNull()
    expect(teamNumberOf('frc')).toBeNull()
  })
})

describe('nextTimestamp', () => {
  it('uses the current time when it is later than the old one', () => {
    const now = new Date('2026-03-14T12:00:00.000Z')
    expect(nextTimestamp('2026-03-14T11:00:00.000Z', now)).toBe('2026-03-14T12:00:00.000Z')
    expect(nextTimestamp(undefined, now)).toBe('2026-03-14T12:00:00.000Z')
  })

  it('is always later than the old one, even when two changes land in the same moment or a clock is behind', () => {
    const now = new Date('2026-03-14T12:00:00.000Z')
    expect(nextTimestamp('2026-03-14T12:00:00.000Z', now)).toBe('2026-03-14T12:00:00.001Z')
    expect(nextTimestamp('2026-03-14T12:30:00.000Z', now) > '2026-03-14T12:30:00.000Z').toBe(true)
  })
})

describe('writing assignments', () => {
  it('assigns a station, remembering the scout’s laptop', async () => {
    await writeAssignments(db, '2026casd', [{ matchKey: match.key, position: 'red1', teamKey: 'frc254', scoutId: 'scout_a', reason: 'open' }], [scout('scout_a', 'device_a')], [])
    const [row] = await listAssignments(db, '2026casd')
    expect(row).toMatchObject({ id: '2026casd_qm1:red1', scoutId: 'scout_a', deviceId: 'device_a', teamKey: 'frc254', alliancePosition: 'red1' })
  })

  it('records a change as newer than what it replaces', async () => {
    const change = (scoutId: string) => [{ matchKey: match.key, position: 'red1' as const, teamKey: 'frc254', scoutId, reason: 'open' as const }]
    await writeAssignments(db, '2026casd', change('scout_a'), [scout('scout_a')], [])
    const first = await listAssignments(db, '2026casd')
    await writeAssignments(db, '2026casd', change('scout_b'), [scout('scout_a'), scout('scout_b')], first)
    const [second] = await listAssignments(db, '2026casd')
    expect(second.scoutId).toBe('scout_b')
    expect(second.assignedAt > first[0].assignedAt).toBe(true)
  })

  it('writes nothing when there is nothing to change', async () => {
    expect(await writeAssignments(db, '2026casd', [], [], [])).toBe(0)
  })
})

describe('assigning by hand', () => {
  it('assigns, reassigns and opens a station', async () => {
    await setSlot(db, { eventKey: '2026casd', match, position: 'blue1', scout: scout('scout_a', 'device_a') })
    expect((await listAssignments(db, '2026casd'))[0]).toMatchObject({ scoutId: 'scout_a', teamKey: 'frc1678' })

    await setSlot(db, { eventKey: '2026casd', match, position: 'blue1', scout: scout('scout_b') })
    expect((await listAssignments(db, '2026casd'))[0]).toMatchObject({ scoutId: 'scout_b', deviceId: '' })

    await setSlot(db, { eventKey: '2026casd', match, position: 'blue1', scout: null })
    const [opened] = await listAssignments(db, '2026casd')
    expect(opened.scoutId).toBe('')
    expect(await db.collections.assignments.count().exec()).toBe(1)
  })

  it('does not create a record just to say a station is open', async () => {
    await setSlot(db, { eventKey: '2026casd', match, position: 'red2', scout: null })
    expect(await db.collections.assignments.count().exec()).toBe(0)
  })

  it('opens every station of an event and reports how many had a scout', async () => {
    await setSlot(db, { eventKey: '2026casd', match, position: 'red1', scout: scout('scout_a') })
    await setSlot(db, { eventKey: '2026casd', match, position: 'red2', scout: scout('scout_b') })
    expect(await releaseAll(db, '2026casd')).toBe(2)
    expect((await listAssignments(db, '2026casd')).every((row) => row.scoutId === '')).toBe(true)
    expect(await releaseAll(db, '2026casd')).toBe(0)
  })
})

describe('reaching scouts’ laptops', () => {
  it('carries a reassignment and then an opened station to a laptop that already has the old one', async () => {
    // RxDB's free tier allows 16 open collections, so two full databases cannot be open at once.
    // The lead scout's laptop writes three versions of one station and hands each over as data.
    const sent = []
    await setSlot(db, { eventKey: '2026casd', match, position: 'red1', scout: scout('scout_a') })
    sent.push(await buildPayload(db, 'assignments'))
    await setSlot(db, { eventKey: '2026casd', match, position: 'red1', scout: scout('scout_b') })
    sent.push(await buildPayload(db, 'assignments'))
    await setSlot(db, { eventKey: '2026casd', match, position: 'red1', scout: null })
    sent.push(await buildPayload(db, 'assignments'))
    await db.close()

    db = await createTestDatabase()
    const owner = async () => (await db.collections.assignments.findOne(slotId(match.key, 'red1')).exec())?.scoutId
    await importPayload(db, sent[0])
    expect(await owner()).toBe('scout_a')
    await importPayload(db, sent[1])
    expect(await owner()).toBe('scout_b')
    await importPayload(db, sent[2])
    expect(await owner()).toBe('')

    // An old copy arriving late changes nothing.
    await importPayload(db, sent[0])
    expect(await owner()).toBe('')
  })
})
