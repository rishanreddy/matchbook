import type { ScoutingDatabase } from '../../lib/db/collections'
import { getScoutingDeletionId } from '../../../../shared/scoutingDeletion'
import { normalizeHubUrl, isValidSyncToken, type SyncPayload } from '../../../../shared/syncProtocol'
import { acknowledgeScoutingDeletionRows } from '../../lib/utils/scoutingDeletion'
import { logger } from '../../lib/utils/logger'
import { buildPayload, parseTransferDocument, type TransferDocument } from './syncData'

export const NETWORK_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 20_000

export type HubTarget = {
  url: string
  token: string
}

export type WifiFailureKind = 'unreachable' | 'timeout' | 'wrong-code' | 'full' | 'nothing-shared' | 'rejected'

export class WifiError extends Error {
  readonly kind: WifiFailureKind

  constructor(kind: WifiFailureKind, message: string) {
    super(message)
    this.name = 'WifiError'
    this.kind = kind
  }
}

const UNREACHABLE_HELP =
  'Could not reach the lead scout’s laptop. Check that both laptops are on the same Wi-Fi, and that the lead scout has pressed Start receiving.'

/** Checks the address and code the way a person typed them, with messages meant to be acted on. */
export function validateTarget(target: HubTarget): HubTarget {
  if (target.url.trim().length === 0) {
    throw new WifiError('rejected', 'Choose the lead scout’s laptop first, or enter its address.')
  }

  let url: string
  try {
    url = normalizeHubUrl(target.url)
  } catch {
    throw new WifiError('rejected', 'That address does not look right. It should be numbers like 192.168.1.20:41735.')
  }

  const token = target.token.trim().toUpperCase()
  if (!isValidSyncToken(token)) {
    throw new WifiError('rejected', 'Enter the 8-character code shown on the lead scout’s screen.')
  }

  return { url, token }
}

/** Splits rows into batches that each stay under the size the hub will accept. */
export function splitIntoBatches(payload: SyncPayload, maxBytes = NETWORK_UPLOAD_MAX_BYTES): SyncPayload[] {
  const build = (rows: Record<string, unknown>[]): SyncPayload => ({
    exportedAt: payload.exportedAt,
    collection: payload.collection,
    count: rows.length,
    data: rows,
  })
  const sizeOf = (rows: Record<string, unknown>[]): number => new TextEncoder().encode(JSON.stringify(build(rows))).length

  if (payload.data.length === 0) {
    return [payload]
  }

  const batches: SyncPayload[] = []
  let current: Record<string, unknown>[] = []
  for (const row of payload.data) {
    const candidate = [...current, row]
    if (sizeOf(candidate) <= maxBytes) {
      current = candidate
      continue
    }

    if (current.length === 0) {
      throw new WifiError('rejected', 'One entry is too large to send over Wi-Fi. Save a file instead.')
    }

    batches.push(build(current))
    current = [row]
  }

  if (current.length > 0) {
    batches.push(build(current))
  }

  return batches
}

async function request(target: HubTarget, pathname: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${target.url}${pathname}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), 'x-sync-token': target.token },
      signal: controller.signal,
    })
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new WifiError('timeout', `${UNREACHABLE_HELP} (It took too long to answer.)`)
    }
    throw new WifiError('unreachable', UNREACHABLE_HELP)
  } finally {
    window.clearTimeout(timer)
  }

  if (response.ok) {
    return response
  }

  if (response.status === 401) {
    throw new WifiError('wrong-code', 'The code does not match. Check the 8-character code on the lead scout’s screen.')
  }

  let detail = ''
  try {
    detail = ((await response.json()) as { error?: string }).error ?? ''
  } catch {
    // The body is only used to explain the problem.
  }

  if (response.status === 507) {
    throw new WifiError('full', 'The lead scout’s laptop has a backlog of data waiting. Ask them to open Sync Data so it can catch up, then try again.')
  }
  if (response.status === 404 && pathname === '/config') {
    throw new WifiError('nothing-shared', detail || 'The lead scout has not shared a scouting form yet.')
  }

  throw new WifiError('rejected', detail || `The lead scout’s laptop refused that (error ${response.status}).`)
}

/** Confirms the hub is reachable and the code is right, without sending anything. */
export async function checkHub(target: HubTarget): Promise<void> {
  await request(validateTarget(target), '/health')
}

export type UploadOutcome = {
  entries: number
  batches: number
  /** Whether this laptop's scout name reached the lead scout's roster. */
  nameShared: boolean
}

/**
 * Sends this laptop's scout name to the lead scout so they can assign it matches. Best effort: an
 * older lead scout app does not accept it, and that must never make a send look like a failure.
 */
export async function shareScoutName(db: ScoutingDatabase, rawTarget: HubTarget, deviceId: string): Promise<boolean> {
  try {
    const target = validateTarget(rawTarget)
    const roster = await buildPayload(db, 'roster', { rosterDeviceId: deviceId })
    if (roster.count === 0) {
      return false
    }

    await request(target, '/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roster),
    })
    return true
  } catch (error: unknown) {
    logger.warn('Could not share this scout’s name with the lead scout', error, 'sync.wifi.scout')
    return false
  }
}

/**
 * Sends everything scouted on this laptop to the hub, and this laptop's scout name so the lead
 * scout can assign matches to it. The hub keeps the first copy of an entry it sees, so sending
 * the same entries again is always safe. The name goes after the entries.
 */
export async function uploadScoutingData(
  db: ScoutingDatabase,
  rawTarget: HubTarget,
  options: { deviceId?: string | null } = {},
): Promise<UploadOutcome> {
  const target = validateTarget(rawTarget)
  const payload = await buildPayload(db, 'scoutingData')
  const deletionIds = payload.data.map(getScoutingDeletionId).filter((id): id is string => id !== null)
  const batches = splitIntoBatches(payload)

  for (const batch of batches) {
    await request(target, '/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
  }

  acknowledgeScoutingDeletionRows(deletionIds)

  const nameShared = options.deviceId ? await shareScoutName(db, target, options.deviceId) : false
  return { entries: payload.count - deletionIds.length, batches: batches.length, nameShared }
}

/** Downloads the form, event and schedule the hub is sharing. */
export async function fetchHubSetup(rawTarget: HubTarget): Promise<TransferDocument> {
  const target = validateTarget(rawTarget)
  const response = await request(target, '/config')
  const body = (await response.json()) as { document?: unknown }
  return parseTransferDocument(body.document)
}

/** What a scout scans from the hub's screen: address, code and name in one short code. */
export const PAIRING_PREFIX = 'MBP1'

export function encodePairing(url: string, token: string, name: string): string {
  return [PAIRING_PREFIX, url, token, name.replace(/\|/g, ' ')].join('|')
}

export function parsePairing(text: string): { url: string; token: string; name: string } | null {
  const parts = text.trim().split('|')
  if (parts.length < 3 || parts[0] !== PAIRING_PREFIX) {
    return null
  }

  try {
    const url = normalizeHubUrl(parts[1])
    const token = parts[2].toUpperCase()
    return isValidSyncToken(token) ? { url, token, name: parts.slice(3).join('|') } : null
  } catch {
    return null
  }
}
