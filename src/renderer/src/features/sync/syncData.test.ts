import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScoutingDeletionSyncRow } from '../../../../shared/scoutingDeletion'
import type { ScoutingDatabase } from '../../lib/db/collections'
import {
  ENTRIES_COLLECTIONS,
  MAX_IMPORT_ROWS,
  SETUP_COLLECTIONS,
  buildPayload,
  buildSnapshot,
  countInsertedEntries,
  countLabel,
  describeTransfer,
  emptyImportResult,
  importPayload,
  importTransfer,
  mergeImportResults,
  parseTransferDocument,
  parseTransferText,
  summarizeImport,
} from './syncData'
import { createMemoryStorage, createTestDatabase } from './testDatabase'

let db: ScoutingDatabase

beforeEach(async () => {
  vi.stubGlobal('localStorage', createMemoryStorage())
  db = await createTestDatabase()
})

afterEach(async () => {
  await db.close()
  vi.unstubAllGlobals()
})

const entry = (id: string, match: number, team: number): Record<string, unknown> => ({
  id,
  eventId: '2026casd',
  deviceId: 'device_a',
  matchNumber: match,
  teamNumber: team,
  timestamp: '2026-03-14T18:00:00.000Z',
  autoScore: 2,
  teleopScore: 8,
  endgameScore: 3,
  formData: { autoScored: 2 },
  notes: '',
  createdAt: '2026-03-14T18:00:00.000Z',
})

const scoutingPayload = (rows: Record<string, unknown>[]) => ({
  exportedAt: '2026-03-14T19:00:00.000Z',
  collection: 'scoutingData' as const,
  count: rows.length,
  data: rows,
})

describe('importPayload', () => {
  it('adds new scouting entries', async () => {
    const result = await importPayload(db, scoutingPayload([entry('a', 1, 254), entry('b', 2, 971)]))

    expect(result).toMatchObject({ inserted: 2, updated: 0, duplicates: 0, errors: 0 })
    expect(await db.collections.scoutingData.count().exec()).toBe(2)
  })

  it('counts a second delivery of the same entries as already here, without changing them', async () => {
    await importPayload(db, scoutingPayload([entry('a', 1, 254)]))
    const changed = { ...entry('a', 1, 254), teleopScore: 99 }
    const result = await importPayload(db, scoutingPayload([changed]))

    expect(result).toMatchObject({ inserted: 0, duplicates: 1, errors: 0 })
    expect((await db.collections.scoutingData.findOne('a').exec())?.teleopScore).toBe(8)
  })

  it('reports a row that names no match or team instead of silently dropping it', async () => {
    const result = await importPayload(db, scoutingPayload([{ id: 'x', matchNumber: 0, teamNumber: 0 }]))

    expect(result.errors).toBe(1)
    expect(result.errorMessages[0]).toMatch(/match\/team/)
    expect(await db.collections.scoutingData.count().exec()).toBe(0)
  })

  it('works out match and team from FRC keys when the numbers are missing', async () => {
    const result = await importPayload(
      db,
      scoutingPayload([{ ...entry('k', 0, 0), matchNumber: undefined, teamNumber: undefined, matchKey: '2026casd_qm14', teamKey: 'frc1678' }]),
    )

    expect(result.inserted).toBe(1)
    const stored = await db.collections.scoutingData.findOne('k').exec()
    expect(stored?.matchNumber).toBe(14)
    expect(stored?.teamNumber).toBe(1678)
  })

  it('applies a deletion and then refuses to bring the entry back from an old copy', async () => {
    await importPayload(db, scoutingPayload([entry('a', 1, 254)]))

    const deletion = await importPayload(db, scoutingPayload([createScoutingDeletionSyncRow('a', '2026-03-14T19:30:00.000Z')]))
    expect(deletion.updated).toBe(1)
    expect(await db.collections.scoutingData.count().exec()).toBe(0)

    const oldCopy = await importPayload(db, scoutingPayload([entry('a', 1, 254)]))
    expect(oldCopy).toMatchObject({ inserted: 0, duplicates: 0, removedEarlier: 1 })
    expect(await db.collections.scoutingData.count().exec()).toBe(0)
  })

  it('says how many new entries belong to each event, so the lead scout can see where they went', async () => {
    const result = await importPayload(
      db,
      scoutingPayload([
        entry('a', 1, 254),
        entry('b', 2, 971),
        { ...entry('c', 3, 1678), eventId: 'none' },
        { ...entry('d', 4, 118), eventId: 'unknown' },
      ]),
    )

    expect(result.entriesByEvent).toEqual({ '2026casd': 2, none: 2 })
    expect(countInsertedEntries(result)).toBe(4)

    const again = await importPayload(db, scoutingPayload([entry('a', 1, 254)]))
    expect(again.entriesByEvent).toEqual({})
    expect(again.duplicates).toBe(1)
  })

  it('treats deleting something that is already gone as a no-op', async () => {
    const result = await importPayload(db, scoutingPayload([createScoutingDeletionSyncRow('never-existed', '2026-03-14T19:30:00.000Z')]))

    expect(result).toMatchObject({ updated: 0, duplicates: 1, errors: 0 })
  })

  it('keeps exactly one active form when an active form arrives', async () => {
    const form = (id: string, isActive: boolean) => ({
      id,
      name: id,
      surveyJson: { pages: [] },
      isActive,
      createdAt: '2026-03-14T18:00:00.000Z',
      updatedAt: '2026-03-14T18:00:00.000Z',
    })
    await importPayload(db, { exportedAt: 'x', collection: 'formSchemas', count: 1, data: [form('old', true)] })
    await importPayload(db, { exportedAt: 'x', collection: 'formSchemas', count: 1, data: [form('new', true)] })

    const active = await db.collections.formSchemas.find({ selector: { isActive: true } }).exec()
    expect(active.map((doc) => doc.id)).toEqual(['new'])
  })

  it('updates an event that is already known instead of duplicating it', async () => {
    const event = (name: string) => ({ id: '2026casd', name, season: 2026, startDate: '2026-03-12', endDate: '2026-03-14' })
    await importPayload(db, { exportedAt: 'x', collection: 'events', count: 1, data: [event('San Diego')] })
    const result = await importPayload(db, { exportedAt: 'x', collection: 'events', count: 1, data: [event('San Diego Regional')] })

    expect(result).toMatchObject({ inserted: 0, updated: 1 })
    expect((await db.collections.events.findOne('2026casd').exec())?.name).toBe('San Diego Regional')
  })

  it('accepts matches keyed by `key` rather than `id`', async () => {
    const match = {
      key: '2026casd_qm1',
      eventId: '2026casd',
      matchNumber: 1,
      compLevel: 'qm',
      predictedTime: '',
      redAlliance: ['frc254', 'frc971', 'frc1678'],
      blueAlliance: ['frc1323', 'frc604', 'frc649'],
      createdAt: '2026-03-14T18:00:00.000Z',
    }
    const result = await importPayload(db, { exportedAt: 'x', collection: 'matches', count: 1, data: [match] })

    expect(result.inserted).toBe(1)
    expect(await db.collections.matches.findOne('2026casd_qm1').exec()).not.toBeNull()
  })
})

describe('buildPayload and buildSnapshot', () => {
  it('exports every entry together with corrections still waiting to be sent', async () => {
    await importPayload(db, scoutingPayload([entry('a', 1, 254)]))
    localStorage.setItem(
      'matchbook-scouting-deletion-outbox-v1',
      JSON.stringify([{ id: 'gone', deletedAt: '2026-03-14T19:30:00.000Z' }]),
    )

    const payload = await buildPayload(db, 'scoutingData')

    expect(payload.count).toBe(2)
    expect(payload.data.map((row) => row.id)).toEqual(['a', 'gone'])
  })

  it('bundles several collections into one snapshot that imports back cleanly', async () => {
    await importPayload(db, scoutingPayload([entry('a', 1, 254), entry('b', 2, 971)]))
    const snapshot = await buildSnapshot(db, ['scoutingData', 'events'])

    expect(snapshot.collections.scoutingData).toHaveLength(2)
    expect(snapshot.collections.events).toEqual([])

    const document = parseTransferDocument(JSON.parse(JSON.stringify(snapshot)))
    expect(describeTransfer(document)).toBe('2 scouting entries')
  })

  it('sends stored event records in a setup snapshot and imports them on the receiving laptop', async () => {
    const event = {
      id: '2026casd',
      name: 'San Diego Regional',
      season: 2026,
      startDate: '2026-03-12',
      endDate: '2026-03-14',
      syncedAt: '2026-03-10T12:00:00.000Z',
      createdAt: '2026-03-10T12:00:00.000Z',
    }
    await db.collections.events.insert(event)

    const snapshot = await buildSnapshot(db, ['formSchemas', 'events', 'matches', 'assignments'])
    const receivedDocument = parseTransferDocument(JSON.parse(JSON.stringify(snapshot)))
    const sourceEvent = await db.collections.events.findOne(event.id).exec()
    await sourceEvent?.remove()

    const result = await importTransfer(db, receivedDocument)
    const receivedEvent = await db.collections.events.findOne(event.id).exec()

    expect(snapshot.collections.events).toEqual([event])
    expect(result).toMatchObject({ inserted: 1, errors: 0 })
    expect(receivedEvent?.toJSON()).toMatchObject(event)
  })
})

describe('corrections in snapshots', () => {
  it('carry pending deletions so a file cannot bring back a deleted entry', async () => {
    await importPayload(db, scoutingPayload([entry('a', 1, 254)]))
    localStorage.setItem(
      'matchbook-scouting-deletion-outbox-v1',
      JSON.stringify([{ id: 'gone', deletedAt: '2026-03-14T19:30:00.000Z' }]),
    )

    const snapshot = await buildSnapshot(db, ['scoutingData'])

    expect(snapshot.collections.scoutingData?.map((row) => row.id)).toEqual(['a', 'gone'])
  })

  it('are described as corrections rather than counted as entries', () => {
    const document = parseTransferDocument({
      collection: 'scoutingData',
      data: [entry('a', 1, 254), entry('b', 2, 971), createScoutingDeletionSyncRow('c', '2026-03-14T19:30:00.000Z')],
    })

    expect(describeTransfer(document)).toBe('2 scouting entries, 1 correction')
  })

  it('are described alone when that is all there is', () => {
    const document = parseTransferDocument({
      collection: 'scoutingData',
      data: [createScoutingDeletionSyncRow('c', '2026-03-14T19:30:00.000Z'), createScoutingDeletionSyncRow('d', '2026-03-14T19:31:00.000Z')],
    })

    expect(describeTransfer(document)).toBe('2 corrections')
  })
})

describe('importTransfer', () => {
  it('adds every collection in a snapshot and reports progress', async () => {
    const document = parseTransferDocument({
      collections: {
        scoutingData: [entry('a', 1, 254)],
        events: [{ id: '2026casd', name: 'San Diego', season: 2026 }],
      },
    })
    const progress: number[] = []

    const result = await importTransfer(db, document, (fraction) => progress.push(fraction))

    expect(result.inserted).toBe(2)
    expect(progress).toEqual([0.5, 1])
  })
})

describe('parseTransferDocument', () => {
  it('reads a single-collection payload', () => {
    const document = parseTransferDocument(scoutingPayload([entry('a', 1, 254)]))

    expect(document.tasks).toEqual([{ collection: 'scoutingData', rows: [entry('a', 1, 254)] }])
  })

  it('reads a multi-collection snapshot in a stable order', () => {
    const document = parseTransferDocument({
      version: 2,
      collections: { matches: [], scoutingData: [], events: [] },
    })

    expect(document.tasks.map((task) => task.collection)).toEqual(['scoutingData', 'events', 'matches'])
  })

  it.each([null, 42, 'text', [], {}, { collection: 'nonsense', data: [] }, { collection: 'events', data: 'nope' }, { collections: { events: 'nope' } }, { collections: 5 }])(
    'rejects a file that is not a Matchbook export: %j',
    (value) => {
      expect(() => parseTransferDocument(value)).toThrow()
    },
  )

  it('refuses a file with an unreasonable number of records', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => ({ id: String(index) }))

    expect(() => parseTransferDocument({ collection: 'scoutingData', data: rows })).toThrow(/limited/)
  })

  it('explains itself in plain language when the text is not JSON', () => {
    expect(() => parseTransferText('this is not json')).toThrow('That does not look like a Matchbook file.')
  })
})

describe('wording', () => {
  it('pluralises counts the way a person would say them', () => {
    expect(countLabel('scoutingData', 1)).toBe('1 scouting entry')
    expect(countLabel('scoutingData', 24)).toBe('24 scouting entries')
    expect(countLabel('matches', 1)).toBe('1 match')
    expect(countLabel('matches', 78)).toBe('78 matches')
  })

  it('summarises an import without database jargon', () => {
    expect(summarizeImport({ ...emptyImportResult(), inserted: 5, duplicates: 2 })).toBe('5 added, 2 already here.')
    expect(summarizeImport(emptyImportResult())).toBe('Nothing new to add.')
    expect(summarizeImport({ ...emptyImportResult(), inserted: 1, updated: 1, errors: 3 })).toBe(
      '1 added, 1 updated, 3 could not be read.',
    )
  })
})


const scoutRow = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  name: 'Riley',
  deviceId: 'device_1',
  deviceName: 'Scout Laptop 1',
  status: 'active',
  createdAt: '2026-03-14T10:00:00.000Z',
  updatedAt: '2026-03-14T10:00:00.000Z',
  ...overrides,
})

const rosterPayload = (rows: Record<string, unknown>[]) => ({
  exportedAt: '2026-03-14T19:00:00.000Z',
  collection: 'roster' as const,
  count: rows.length,
  data: rows,
})

describe('importing the roster', () => {
  it('adds a scout who sent their name', async () => {
    const result = await importPayload(db, rosterPayload([scoutRow('scout_1')]))
    expect(result).toMatchObject({ inserted: 1, errors: 0 })
    expect((await db.collections.roster.findOne('scout_1').exec())?.name).toBe('Riley')
  })

  it('keeps the newest version of a scout, so an old copy cannot undo the lead scout’s change', async () => {
    await importPayload(db, rosterPayload([scoutRow('scout_1')]))
    await importPayload(db, rosterPayload([scoutRow('scout_1', { status: 'away', updatedAt: '2026-03-14T12:00:00.000Z' })]))

    const stale = await importPayload(db, rosterPayload([scoutRow('scout_1', { status: 'active', updatedAt: '2026-03-14T11:00:00.000Z' })]))
    expect(stale).toMatchObject({ inserted: 0, updated: 0, duplicates: 1 })
    expect((await db.collections.roster.findOne('scout_1').exec())?.status).toBe('away')

    const newer = await importPayload(db, rosterPayload([scoutRow('scout_1', { name: 'Riley C', updatedAt: '2026-03-14T13:00:00.000Z' })]))
    expect(newer.updated).toBe(1)
    expect((await db.collections.roster.findOne('scout_1').exec())?.name).toBe('Riley C')
  })

  it('tidies names and unknown statuses, and refuses a scout with no name', async () => {
    const result = await importPayload(db, rosterPayload([scoutRow('scout_1', { name: '  Riley   C  ', status: 'sleeping' }), scoutRow('scout_2', { name: '   ' })]))
    expect(result).toMatchObject({ inserted: 1, errors: 1 })
    const stored = await db.collections.roster.findOne('scout_1').exec()
    expect(stored).toMatchObject({ name: 'Riley C', status: 'active' })
  })

  it('links a laptop’s name to the scout of that name the lead scout already added, instead of listing them twice', async () => {
    await db.collections.roster.insert(scoutRow('added_by_hand', { deviceId: '', deviceName: '' }) as never)

    await importPayload(db, rosterPayload([scoutRow('from_laptop', { name: 'riley' })]))

    const roster = await db.collections.roster.find().exec()
    expect(roster.filter((row) => row.status !== 'removed').map((row) => [row.id, row.deviceId])).toEqual([['added_by_hand', 'device_1']])
    expect(roster.find((row) => row.id === 'from_laptop')?.status).toBe('removed')
  })

  it('does not link anything when the roster it was given changed nothing', async () => {
    await db.collections.roster.insert(scoutRow('added_by_hand', { deviceId: '', deviceName: '' }) as never)
    await db.collections.roster.insert(scoutRow('from_laptop') as never)

    const result = await importPayload(db, rosterPayload([scoutRow('from_laptop')]))

    expect(result).toMatchObject({ inserted: 0, updated: 0, duplicates: 1 })
    expect((await db.collections.roster.findOne('added_by_hand').exec())?.deviceId).toBe('')
  })
})

describe('importing assignments', () => {
  const assignment = (scoutId: string, assignedAt: string) => ({
    id: '2026casd_qm1:red1',
    eventKey: '2026casd',
    matchKey: '2026casd_qm1',
    alliancePosition: 'red1',
    teamKey: 'frc254',
    scoutId,
    deviceId: '',
    assignedAt,
  })
  const payload = (row: Record<string, unknown>) => ({ exportedAt: '2026-03-14T19:00:00.000Z', collection: 'assignments' as const, count: 1, data: [row] })

  it('lets a newer assignment replace an older one, and ignores an older copy', async () => {
    await importPayload(db, payload(assignment('scout_a', '2026-03-14T10:00:00.000Z')))

    const newer = await importPayload(db, payload(assignment('scout_b', '2026-03-14T11:00:00.000Z')))
    expect(newer.updated).toBe(1)

    const older = await importPayload(db, payload(assignment('scout_a', '2026-03-14T10:30:00.000Z')))
    expect(older).toMatchObject({ updated: 0, duplicates: 1 })
    expect((await db.collections.assignments.findOne('2026casd_qm1:red1').exec())?.scoutId).toBe('scout_b')
  })

  it('accepts an assignment that has been released, so a clear on the lead scout’s laptop reaches scouts', async () => {
    await importPayload(db, payload(assignment('scout_a', '2026-03-14T10:00:00.000Z')))
    const released = await importPayload(db, payload(assignment('', '2026-03-14T12:00:00.000Z')))
    expect(released.updated).toBe(1)
    expect((await db.collections.assignments.findOne('2026casd_qm1:red1').exec())?.scoutId).toBe('')
  })
})

describe('what is shared between laptops', () => {
  it('shares the roster and assignments with scouts, and only their own name back', () => {
    expect(SETUP_COLLECTIONS).toEqual(['formSchemas', 'events', 'matches', 'assignments', 'roster'])
    expect(ENTRIES_COLLECTIONS).toEqual(['scoutingData', 'roster'])
  })

  it('sends a scout’s own row and not the whole roster', async () => {
    await db.collections.roster.bulkInsert([scoutRow('mine', { deviceId: 'device_me' }), scoutRow('theirs', { deviceId: 'device_other', name: 'Sam' }), scoutRow('manual', { deviceId: '', name: 'Jo' })] as never)

    const own = await buildSnapshot(db, ENTRIES_COLLECTIONS, { rosterDeviceId: 'device_me' })
    expect(own.collections.roster?.map((row) => row.id)).toEqual(['mine'])

    const everyone = await buildSnapshot(db, ['roster'])
    expect(everyone.collections.roster).toHaveLength(3)

    const wifi = await buildPayload(db, 'roster', { rosterDeviceId: 'device_me' })
    expect(wifi.count).toBe(1)
  })

  it('carries the lead scout’s event in the setup, so a scout laptop can start on it', async () => {
    const setup = await buildSnapshot(db, SETUP_COLLECTIONS, { currentEventId: '2026casd' })
    expect(setup.currentEventId).toBe('2026casd')
    expect(parseTransferDocument(JSON.parse(JSON.stringify(setup))).currentEventId).toBe('2026casd')

    const without = await buildSnapshot(db, SETUP_COLLECTIONS, { currentEventId: null })
    expect('currentEventId' in without).toBe(false)
    expect(parseTransferDocument(without).currentEventId).toBeUndefined()
  })
})

describe('summarising what was skipped', () => {
  it('says removed entries were skipped because they were removed, not that they are already here', () => {
    expect(summarizeImport({ ...emptyImportResult(), duplicates: 3, removedEarlier: 2 })).toBe('3 already here, 2 skipped because you removed them earlier.')
    expect(summarizeImport({ ...emptyImportResult(), removedEarlier: 1 })).toBe('1 skipped because you removed it earlier.')
  })

  it('adds results from several collections together, event counts included', () => {
    const merged = mergeImportResults([
      { ...emptyImportResult(), inserted: 2, entriesByEvent: { a: 2 } },
      { ...emptyImportResult(), inserted: 1, removedEarlier: 1, entriesByEvent: { a: 1, none: 3 } },
    ])
    expect(merged).toMatchObject({ inserted: 3, removedEarlier: 1, entriesByEvent: { a: 3, none: 3 } })
  })
})
