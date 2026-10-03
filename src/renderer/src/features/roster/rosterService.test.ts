import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScoutingDatabase } from '../../lib/db/collections'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { createTestDatabase } from '../sync/testDatabase'
import {
  addScout,
  claimScout,
  cleanScoutName,
  linkHandAddedScouts,
  listRoster,
  migrateLegacyScouts,
  renameScout,
  saveMyScoutName,
  scoutsForDevice,
  setScoutStatus,
  shouldReplaceRosterRow,
  sortRoster,
  stampAfter,
  unclaimedScouts,
  validateScoutName,
} from './rosterService'

let db: ScoutingDatabase

beforeEach(async () => {
  db = await createTestDatabase()
})

afterEach(async () => {
  await db.close()
})

const scout = (overrides: Partial<RosterScoutDocType> = {}): RosterScoutDocType => ({
  id: 'scout_a',
  name: 'Alex',
  deviceId: '',
  deviceName: '',
  status: 'active',
  createdAt: '2026-03-14T10:00:00.000Z',
  updatedAt: '2026-03-14T10:00:00.000Z',
  ...overrides,
})

describe('names', () => {
  it('tidies spaces the way a person would expect', () => {
    expect(cleanScoutName('  Riley    Chen ')).toBe('Riley Chen')
  })

  it('asks for a name, refuses a very long one, and refuses a duplicate regardless of case', () => {
    expect(validateScoutName('   ', [])).toMatch(/Type the scout/)
    expect(validateScoutName('x'.repeat(61), [])).toMatch(/at most 60/)
    expect(validateScoutName('alex', [scout()])).toMatch(/already a scout named alex/)
    expect(validateScoutName('Sam', [scout()])).toBeNull()
  })

  it('lets a name be reused once its owner is removed, or when renaming that same scout', () => {
    expect(validateScoutName('Alex', [scout({ status: 'removed' })])).toBeNull()
    expect(validateScoutName('Alex', [scout()], 'scout_a')).toBeNull()
  })

  it('sorts without caring about capitals', () => {
    expect(sortRoster([{ name: 'riley' }, { name: 'Alex' }, { name: 'Sam' }]).map((row) => row.name)).toEqual(['Alex', 'riley', 'Sam'])
  })
})

describe('shouldReplaceRosterRow', () => {
  it('lets only a newer change win', () => {
    const stored = { updatedAt: '2026-03-14T10:00:00.000Z' }
    expect(shouldReplaceRosterRow(stored, { updatedAt: '2026-03-14T10:00:01.000Z' })).toBe(true)
    expect(shouldReplaceRosterRow(stored, { updatedAt: '2026-03-14T10:00:00.000Z' })).toBe(false)
    expect(shouldReplaceRosterRow(stored, { updatedAt: '2026-03-14T09:59:59.000Z' })).toBe(false)
  })
})

describe('the lead scout editing the roster', () => {
  it('adds a scout who has no laptop and refuses a duplicate', async () => {
    const added = await addScout(db, '  Riley  ')
    expect(added).toMatchObject({ name: 'Riley', deviceId: '', status: 'active' })
    expect(added.id).toMatch(/^scout_/)
    await expect(addScout(db, 'riley')).rejects.toThrow(/already a scout named/)
    expect(await listRoster(db)).toHaveLength(1)
  })

  it('renames a scout and bumps the change time so the new name wins when synced', async () => {
    const added = await addScout(db, 'Riley')
    await renameScout(db, added.id, 'Riley C')
    const [after] = await listRoster(db)
    expect(after.name).toBe('Riley C')
    expect(after.updatedAt >= added.updatedAt).toBe(true)
    await expect(renameScout(db, 'missing', 'Whoever')).rejects.toThrow(/no longer on the roster/)
  })

  it('marks a scout away and back without deleting anyone', async () => {
    const added = await addScout(db, 'Riley')
    await setScoutStatus(db, added.id, 'away')
    expect((await listRoster(db))[0].status).toBe('away')
    await setScoutStatus(db, added.id, 'active')
    expect((await listRoster(db))[0].status).toBe('active')
  })
})

describe('a scout setting their own name on their laptop', () => {
  const laptop = { id: 'device_1', name: 'Scout Laptop 1' }

  it('creates the scout for this laptop, remembering what the laptop is called', async () => {
    await saveMyScoutName(db, laptop, ' Sam ')
    const roster = await listRoster(db)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ name: 'Sam', deviceId: 'device_1', deviceName: 'Scout Laptop 1', status: 'active' })
  })

  it('renames the same scout instead of adding a second one', async () => {
    await saveMyScoutName(db, laptop, 'Sam')
    const [first] = await listRoster(db)
    await saveMyScoutName(db, laptop, 'Samantha')
    const roster = await listRoster(db)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ id: first.id, name: 'Samantha' })
  })

  it('changes nothing when the name is the same, so an old copy cannot beat the lead scout’s edit', async () => {
    await saveMyScoutName(db, laptop, 'Sam')
    const [before] = await listRoster(db)
    await saveMyScoutName(db, laptop, 'Sam')
    const [after] = await listRoster(db)
    expect(after.updatedAt).toBe(before.updatedAt)
  })

  it('does not undo a break the lead scout gave them just because they saved the same name', async () => {
    await saveMyScoutName(db, laptop, 'Sam')
    const [mine] = await listRoster(db)
    await setScoutStatus(db, mine.id, 'away')
    await saveMyScoutName(db, laptop, 'Sam')
    expect((await listRoster(db))[0].status).toBe('away')
  })

  it('removes the scout when the name is cleared, and brings the same one back when a name is set again', async () => {
    await saveMyScoutName(db, laptop, 'Sam')
    const [first] = await listRoster(db)
    await saveMyScoutName(db, laptop, '')
    expect((await listRoster(db))[0].status).toBe('removed')
    expect(scoutsForDevice(await listRoster(db), 'device_1')).toEqual([])

    await saveMyScoutName(db, laptop, 'Sam')
    const roster = await listRoster(db)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ id: first.id, status: 'active' })
  })

  it('finds the scouts at a laptop, ignoring removed ones and other laptops', async () => {
    const roster = [
      scout({ id: 'a', deviceId: 'device_1' }),
      scout({ id: 'b', deviceId: 'device_1', status: 'removed' }),
      scout({ id: 'c', deviceId: 'device_2' }),
      scout({ id: 'd', deviceId: '' }),
    ]
    expect(scoutsForDevice(roster, 'device_1').map((row) => row.id)).toEqual(['a'])
    expect(scoutsForDevice(roster, null)).toEqual([])
  })
})

describe('migrating the scouts older versions kept', () => {
  it('copies each legacy scout into the roster once', async () => {
    await db.collections.devices.insert({
      id: 'device_1',
      name: 'Scout Laptop 1',
      isPrimary: false,
      lastSeenAt: '2026-03-14T10:00:00.000Z',
      createdAt: '2026-03-14T10:00:00.000Z',
    })
    await db.collections.scouts.insert({ id: 'scout_old', name: 'Jordan', deviceId: 'device_1', createdAt: '2026-03-01T10:00:00.000Z' })

    expect(await migrateLegacyScouts(db)).toBe(1)
    expect(await migrateLegacyScouts(db)).toBe(0)

    const [migrated] = await listRoster(db)
    expect(migrated).toMatchObject({
      id: 'scout_old',
      name: 'Jordan',
      deviceId: 'device_1',
      deviceName: 'Scout Laptop 1',
      status: 'active',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    })
  })

  it('leaves a scout alone if the roster already has them', async () => {
    await db.collections.scouts.insert({ id: 'scout_old', name: 'Jordan', deviceId: 'device_1', createdAt: '2026-03-01T10:00:00.000Z' })
    await db.collections.roster.insert(scout({ id: 'scout_old', name: 'Jordan R', deviceId: 'device_1' }))
    expect(await migrateLegacyScouts(db)).toBe(0)
    expect((await listRoster(db))[0].name).toBe('Jordan R')
  })
})

describe('a laptop and a scout the lead scout added by name', () => {
  const laptop = { id: 'device_riley', name: 'Scout Laptop 1' }
  const byRow = async (id: string) => (await db.collections.roster.findOne(id).exec())?.toJSON() as RosterScoutDocType

  it('lists the scouts with no laptop yet, never removed ones', () => {
    const roster = [scout({ id: 'a', name: 'Sam' }), scout({ id: 'b', name: 'Alex', deviceId: 'device_x' }), scout({ id: 'c', name: 'Jo', status: 'removed' }), scout({ id: 'd', name: 'Kim' })]
    expect(unclaimedScouts(roster).map((row) => row.name)).toEqual(['Kim', 'Sam'])
  })

  it('lets a scout pick their name, keeping the scout so what was assigned to them stays theirs', async () => {
    await db.collections.roster.insert(scout({ id: 'scout_riley', name: 'Riley' }))

    const claimed = await claimScout(db, 'scout_riley', laptop)

    expect(claimed).toMatchObject({ id: 'scout_riley', name: 'Riley', deviceId: 'device_riley', deviceName: 'Scout Laptop 1' })
    expect(claimed.updatedAt > '2026-03-14T10:00:00.000Z').toBe(true)
    expect(scoutsForDevice(await listRoster(db), 'device_riley').map((row) => row.id)).toEqual(['scout_riley'])
  })

  it('retires the scout this laptop made for itself, so nobody is listed twice', async () => {
    await saveMyScoutName(db, laptop, 'Riley R.')
    await db.collections.roster.insert(scout({ id: 'scout_riley', name: 'Riley' }))

    await claimScout(db, 'scout_riley', laptop)

    const mine = scoutsForDevice(await listRoster(db), 'device_riley')
    expect(mine.map((row) => row.name)).toEqual(['Riley'])
    expect((await listRoster(db)).filter((row) => row.status === 'removed')).toHaveLength(1)
  })

  it('refuses a scout who is already on someone else’s laptop, or who has been removed', async () => {
    await db.collections.roster.bulkInsert([scout({ id: 'taken', name: 'Sam', deviceId: 'device_other' }), scout({ id: 'gone', name: 'Jo', status: 'removed' })])

    await expect(claimScout(db, 'taken', laptop)).rejects.toThrow(/already using another laptop/)
    await expect(claimScout(db, 'gone', laptop)).rejects.toThrow(/no longer on the roster/)
    await expect(claimScout(db, 'missing', laptop)).rejects.toThrow(/no longer on the roster/)
  })

  it('does nothing when a scout picks the name they already have', async () => {
    await db.collections.roster.insert(scout({ id: 'scout_riley', name: 'Riley', deviceId: 'device_riley', updatedAt: '2026-03-14T11:00:00.000Z' }))
    const again = await claimScout(db, 'scout_riley', laptop)
    expect(again.updatedAt).toBe('2026-03-14T11:00:00.000Z')
  })

  it('takes over the scout the lead scout added when the same name is typed in Device Setup', async () => {
    await db.collections.roster.insert(scout({ id: 'scout_riley', name: 'Riley' }))

    await saveMyScoutName(db, laptop, '  riley ')

    const roster = await listRoster(db)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ id: 'scout_riley', name: 'Riley', deviceId: 'device_riley' })
  })

  it('links a laptop that sends its name to the scout of the same name the lead scout already added', async () => {
    await db.collections.roster.insert(scout({ id: 'scout_riley', name: 'Riley' }))
    await db.collections.roster.insert(scout({ id: 'from_laptop', name: 'riley', deviceId: 'device_riley', deviceName: 'Scout Laptop 1' }))

    expect(await linkHandAddedScouts(db)).toBe(1)

    expect(await byRow('scout_riley')).toMatchObject({ deviceId: 'device_riley', deviceName: 'Scout Laptop 1', status: 'active' })
    expect((await byRow('from_laptop')).status).toBe('removed')
    expect((await listRoster(db)).filter((row) => row.status !== 'removed')).toHaveLength(1)
  })

  it('leaves scouts alone when no names match, and does nothing the second time', async () => {
    await db.collections.roster.insert(scout({ id: 'scout_sam', name: 'Sam' }))
    await db.collections.roster.insert(scout({ id: 'from_laptop', name: 'Riley', deviceId: 'device_riley' }))
    expect(await linkHandAddedScouts(db)).toBe(0)

    await db.collections.roster.insert(scout({ id: 'scout_riley', name: 'Riley' }))
    expect(await linkHandAddedScouts(db)).toBe(1)
    expect(await linkHandAddedScouts(db)).toBe(0)
  })

  it('stamps its changes later than the copy they replace, even when this laptop’s clock is behind', async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString()
    expect(stampAfter(future) > future).toBe(true)
    expect(stampAfter('2000-01-01T00:00:00.000Z') > '2000-01-01T00:00:00.000Z').toBe(true)
    expect(stampAfter('not a date') > '2000-01-01T00:00:00.000Z').toBe(true)

    await db.collections.roster.insert(scout({ id: 'scout_riley', name: 'Riley', updatedAt: future }))
    await setScoutStatus(db, 'scout_riley', 'away')
    expect((await byRow('scout_riley')).updatedAt > future).toBe(true)
  })
})
