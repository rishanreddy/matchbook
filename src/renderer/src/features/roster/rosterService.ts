import type { ScoutingDatabase } from '../../lib/db/collections'
import type { RosterScoutDocType, RosterStatus } from '../../lib/db/schemas/roster.schema'

export const MAX_SCOUT_NAME_LENGTH = 60

/** A name as a person would write it: trimmed, with runs of spaces collapsed. */
export function cleanScoutName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Why a name cannot be used, in words for the lead scout, or null when it is fine. */
export function validateScoutName(raw: string, roster: readonly RosterScoutDocType[], ignoreId?: string): string | null {
  const name = cleanScoutName(raw)
  if (name.length === 0) {
    return 'Type the scout’s name first.'
  }

  if (name.length > MAX_SCOUT_NAME_LENGTH) {
    return `Names can be at most ${MAX_SCOUT_NAME_LENGTH} characters.`
  }

  const taken = roster.some((scout) => scout.id !== ignoreId && scout.status !== 'removed' && scout.name.toLowerCase() === name.toLowerCase())
  return taken ? `There is already a scout named ${name}. Add a last initial so the two can be told apart.` : null
}

export function isListed(scout: RosterScoutDocType): boolean {
  return scout.status !== 'removed'
}

export function isAvailable(scout: RosterScoutDocType): boolean {
  return scout.status === 'active'
}

export function sortRoster<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
}

/** The scouts that sit at this laptop, which is how a scout laptop finds its own assignments. */
export function scoutsForDevice(roster: readonly RosterScoutDocType[], deviceId: string | null): RosterScoutDocType[] {
  if (!deviceId) {
    return []
  }

  return roster.filter((scout) => scout.deviceId === deviceId && isListed(scout))
}

/**
 * Whether an incoming copy of a scout should replace what is stored. The newest change wins, so
 * a stale copy that a scout's laptop sends later never undoes something the lead scout changed.
 */
export function shouldReplaceRosterRow(existing: Pick<RosterScoutDocType, 'updatedAt'>, incoming: Pick<RosterScoutDocType, 'updatedAt'>): boolean {
  return incoming.updatedAt > existing.updatedAt
}

function newScoutId(): string {
  return `scout_${crypto.randomUUID()}`
}

/**
 * A time for a change to a scout that is certain to be newer than the copy it changes. Laptops'
 * clocks differ by a few minutes and the newest change wins when scouts are synced, so a change
 * made on a laptop whose clock is behind would otherwise lose to the very copy it replaces.
 */
export function stampAfter(previous: string): string {
  const earliest = Date.parse(previous) + 1
  return new Date(Number.isNaN(earliest) ? Date.now() : Math.max(Date.now(), earliest)).toISOString()
}

function sameName(left: string, right: string): boolean {
  return cleanScoutName(left).toLowerCase() === cleanScoutName(right).toLowerCase()
}

/** A scout that only has its laptop's name, because nobody typed theirs. */
export function isNamedAfterLaptop(scout: Pick<RosterScoutDocType, 'name' | 'deviceName'>): boolean {
  return scout.deviceName !== '' && sameName(scout.name, scout.deviceName)
}

/** Scouts the lead scout added by name whose own laptop has not been linked to them yet. */
export function unclaimedScouts(roster: readonly RosterScoutDocType[]): RosterScoutDocType[] {
  return sortRoster(roster.filter((scout) => isListed(scout) && scout.deviceId === ''))
}

export async function listRoster(db: ScoutingDatabase): Promise<RosterScoutDocType[]> {
  const docs = await db.collections.roster.find().exec()
  return docs.map((doc) => doc.toJSON() as RosterScoutDocType)
}

/** Adds a scout who has no laptop of their own, or whose laptop has not sent a name. */
export async function addScout(db: ScoutingDatabase, rawName: string): Promise<RosterScoutDocType> {
  const roster = await listRoster(db)
  const problem = validateScoutName(rawName, roster)
  if (problem) {
    throw new Error(problem)
  }

  const now = new Date().toISOString()
  const scout: RosterScoutDocType = {
    id: newScoutId(),
    name: cleanScoutName(rawName),
    deviceId: '',
    deviceName: '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  await db.collections.roster.insert(scout)
  return scout
}

export async function renameScout(db: ScoutingDatabase, id: string, rawName: string): Promise<void> {
  const roster = await listRoster(db)
  const problem = validateScoutName(rawName, roster, id)
  if (problem) {
    throw new Error(problem)
  }

  const doc = await db.collections.roster.findOne(id).exec()
  if (!doc) {
    throw new Error('That scout is no longer on the roster.')
  }

  await doc.incrementalPatch({ name: cleanScoutName(rawName), updatedAt: stampAfter(doc.updatedAt) })
}

export async function setScoutStatus(db: ScoutingDatabase, id: string, status: RosterStatus): Promise<void> {
  const doc = await db.collections.roster.findOne(id).exec()
  if (!doc || doc.status === status) {
    return
  }

  await doc.incrementalPatch({ status, updatedAt: stampAfter(doc.updatedAt) })
}

/**
 * Records who is using this laptop, from the name typed in Device Setup or the first-run wizard.
 * The lead scout learns of it the next time this laptop sends its entries. An empty name removes
 * the laptop's scout from the roster instead of deleting it, so that removal syncs too.
 *
 * If the lead scout already added this name by hand, this laptop takes that scout over instead of
 * adding a second one, so what has been assigned to them reaches this laptop.
 */
export async function saveMyScoutName(
  db: ScoutingDatabase,
  device: { id: string; name: string },
  rawName: string,
): Promise<void> {
  const name = cleanScoutName(rawName).slice(0, MAX_SCOUT_NAME_LENGTH)
  const deviceName = device.name.trim().slice(0, 128)
  const rows = await db.collections.roster.find({ selector: { deviceId: device.id } }).exec()
  const mine = rows.filter((doc) => doc.status !== 'removed')

  if (name === '') {
    await Promise.all(mine.map((doc) => doc.incrementalPatch({ status: 'removed', updatedAt: stampAfter(doc.updatedAt) })))
    return
  }

  const [first, ...extra] = mine
  if (!first) {
    const addedByHand = (await db.collections.roster.find({ selector: { deviceId: '' } }).exec()).find((doc) => doc.status !== 'removed' && sameName(doc.name, name))
    if (addedByHand) {
      await addedByHand.incrementalPatch({ deviceId: device.id, deviceName, updatedAt: stampAfter(addedByHand.updatedAt) })
      return
    }

    const revived = [...rows].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    if (revived) {
      await revived.incrementalPatch({ name, deviceName, status: 'active', updatedAt: stampAfter(revived.updatedAt) })
      return
    }

    const now = new Date().toISOString()
    await db.collections.roster.insert({ id: newScoutId(), name, deviceId: device.id, deviceName, status: 'active', createdAt: now, updatedAt: now })
    return
  }

  if (first.name !== name || first.deviceName !== deviceName) {
    await first.incrementalPatch({ name, deviceName, updatedAt: stampAfter(first.updatedAt) })
  }

  // One laptop has one scout in it. Anything extra is a leftover from an older version.
  await Promise.all(extra.map((doc) => doc.incrementalPatch({ status: 'removed', updatedAt: stampAfter(doc.updatedAt) })))
}

/**
 * Makes this laptop the one that belongs to a scout the lead scout added by name. The scout keeps
 * its id, so everything already assigned to them stays theirs, and the laptop's own scout, if it
 * had one, is retired so the roster does not list the same person twice.
 */
export async function claimScout(db: ScoutingDatabase, scoutId: string, device: { id: string; name: string }): Promise<RosterScoutDocType> {
  const target = await db.collections.roster.findOne(scoutId).exec()
  if (!target || target.status === 'removed') {
    throw new Error('That scout is no longer on the roster. Press Get latest to see who is.')
  }

  if (target.deviceId === device.id) {
    return target.toJSON() as RosterScoutDocType
  }

  if (target.deviceId !== '') {
    throw new Error(`${target.name} is already using another laptop.`)
  }

  const others = (await db.collections.roster.find({ selector: { deviceId: device.id } }).exec()).filter((doc) => doc.id !== scoutId && doc.status !== 'removed')
  const claimed = await target.incrementalPatch({ deviceId: device.id, deviceName: device.name.trim().slice(0, 128), updatedAt: stampAfter(target.updatedAt) })
  await Promise.all(others.map((doc) => doc.incrementalPatch({ status: 'removed', updatedAt: stampAfter(doc.updatedAt) })))
  return claimed.toJSON() as RosterScoutDocType
}

/**
 * When a scout's laptop sends its own name and the lead scout has already added that name by hand,
 * they are the same person. The scout the lead scout added takes the laptop, so what is assigned to
 * them reaches it, and the laptop's separate row is retired. Returns how many scouts were linked.
 */
export async function linkHandAddedScouts(db: ScoutingDatabase): Promise<number> {
  const listed = (await db.collections.roster.find().exec()).filter((doc) => doc.status !== 'removed')
  const used = new Set<string>()
  let linked = 0

  for (const byHand of listed.filter((doc) => doc.deviceId === '')) {
    const onLaptop = listed.find((doc) => doc.deviceId !== '' && !used.has(doc.id) && sameName(doc.name, byHand.name))
    if (!onLaptop) {
      continue
    }

    used.add(onLaptop.id)
    await byHand.incrementalPatch({ deviceId: onLaptop.deviceId, deviceName: onLaptop.deviceName, updatedAt: stampAfter(byHand.updatedAt) })
    await onLaptop.incrementalPatch({ status: 'removed', updatedAt: stampAfter(onLaptop.updatedAt) })
    linked += 1
  }

  return linked
}

/**
 * Brings the scouts that older versions kept on each laptop into the roster. Safe to run on every
 * start: a scout that is already there is left alone.
 */
export async function migrateLegacyScouts(db: ScoutingDatabase): Promise<number> {
  const legacy = await db.collections.scouts.find().exec()
  if (legacy.length === 0) {
    return 0
  }

  const known = new Set((await db.collections.roster.find().exec()).map((doc) => doc.id))
  const devices = new Map((await db.collections.devices.find().exec()).map((doc) => [doc.id, doc.name]))
  const rows: RosterScoutDocType[] = legacy
    .filter((doc) => !known.has(doc.id))
    .map((doc) => ({
      id: doc.id,
      name: cleanScoutName(doc.name).slice(0, MAX_SCOUT_NAME_LENGTH) || 'Scout',
      deviceId: doc.deviceId,
      deviceName: devices.get(doc.deviceId) ?? '',
      status: 'active' as const,
      createdAt: doc.createdAt,
      updatedAt: doc.createdAt,
    }))

  if (rows.length > 0) {
    await db.collections.roster.bulkInsert(rows)
  }

  return rows.length
}
