import type { ScoutingDatabase } from '../../lib/db/collections'
import { validateSyncPayload } from '../../../../shared/syncProtocol'
import { logger } from '../../lib/utils/logger'
import { notify } from '../../lib/utils/notify'
import { useWifiHub } from '../../stores/useWifiHub'
import {
  buildSnapshot,
  countLabel,
  describeTransfer,
  importPayload,
  mergeImportResults,
  parseTransferDocument,
  summarizeImport,
  type ImportResult,
} from './syncData'

export type DrainResult = {
  /** Uploads taken off the queue. */
  payloads: number
  /** Uploads set aside because something in them could not be read. */
  quarantined: number
  result: ImportResult
}

const EMPTY_RESULT: ImportResult = { inserted: 0, updated: 0, duplicates: 0, errors: 0, errorMessages: [] }

let draining: Promise<DrainResult> | null = null

async function drainOnce(db: ScoutingDatabase): Promise<DrainResult> {
  const api = window.electronAPI
  if (!api) {
    return { payloads: 0, quarantined: 0, result: EMPTY_RESULT }
  }

  const incoming = await api.peekSyncPayloads()
  const startedAt = Date.now()
  if (incoming.length > 0) {
    logger.info('Hub began processing Wi-Fi sync uploads', { queuedPayloads: incoming.length }, 'sync.wifi.hub')
  }
  const results: ImportResult[] = []
  let payloads = 0
  let quarantined = 0

  for (const raw of incoming) {
    try {
      const payload = validateSyncPayload(raw)
      const result = await importPayload(db, payload)
      results.push(result)

      if (result.errors > 0) {
        await api.quarantineHeadSyncPayload(result.errorMessages[0] ?? 'Part of this upload could not be read.')
        quarantined += 1
        continue
      }

      await api.ackSyncPayloads(1)
      payloads += 1
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown upload problem.'
      logger.warn('Set aside an upload that could not be added', { message })
      results.push({ inserted: 0, updated: 0, duplicates: 0, errors: 1, errorMessages: [message] })
      await api.quarantineHeadSyncPayload(message)
      quarantined += 1
    }
  }

  const combinedResult = mergeImportResults(results)
  if (incoming.length > 0) {
    logger.info('Hub finished processing Wi-Fi sync uploads', {
      queuedPayloads: incoming.length,
      acknowledgedPayloads: payloads,
      quarantinedPayloads: quarantined,
      inserted: combinedResult.inserted,
      updated: combinedResult.updated,
      duplicates: combinedResult.duplicates,
      errors: combinedResult.errors,
      elapsedMs: Date.now() - startedAt,
    }, 'sync.wifi.hub')
  }

  return { payloads, quarantined, result: combinedResult }
}

/**
 * Adds everything scouts have uploaded to this laptop's database.
 *
 * A scout's upload can arrive while the previous one is still being added, or while the
 * lead scout presses the button by hand. Only one pass runs at a time, and a caller that
 * arrives mid-pass simply waits for it and gets its result.
 */
export function drainIncoming(db: ScoutingDatabase): Promise<DrainResult> {
  if (draining) {
    return draining
  }

  draining = drainOnce(db).finally(() => {
    draining = null
  })
  return draining
}

const SETUP_COLLECTIONS = ['formSchemas', 'events', 'matches', 'assignments'] as const

/** What scouts fetch: the form, the event and the schedule as this hub has them right now. */
export async function buildSetupDocument(db: ScoutingDatabase): Promise<{ json: string; summary: string; isEmpty: boolean }> {
  const snapshot = await buildSnapshot(db, SETUP_COLLECTIONS)
  const parsed = parseTransferDocument(snapshot)
  return {
    json: JSON.stringify(snapshot),
    summary: describeTransfer(parsed),
    isEmpty: parsed.tasks.every((task) => task.rows.length === 0),
  }
}

/**
 * Adds waiting uploads and tells the lead scout what happened.
 *
 * `manual` is a person pressing the button: they get an answer even when nothing was
 * waiting. Automatic passes stay quiet unless something actually changed.
 */
export async function addReceivedScouting(db: ScoutingDatabase, options: { manual?: boolean } = {}): Promise<DrainResult> {
  const outcome = await drainIncoming(db)
  const { result, quarantined } = outcome
  const hub = useWifiHub.getState()
  hub.countReceived(result.inserted)
  await hub.refresh()

  if (result.inserted + result.updated > 0) {
    notify({
      color: 'green',
      title: 'Scouting received',
      message: result.inserted > 0 ? `${countLabel('scoutingData', result.inserted)} added from a scout.` : summarizeImport(result),
    })
  } else if (options.manual && outcome.payloads === 0 && quarantined === 0) {
    notify({ color: 'blue', title: 'Nothing waiting', message: 'No scouts have sent anything new.' })
  } else if (options.manual && quarantined === 0) {
    notify({ color: 'blue', title: 'Already up to date', message: 'Everything a scout sent was already here.' })
  }

  if (quarantined > 0) {
    notify({
      color: 'yellow',
      title: 'Some data was set aside',
      message: 'Part of an upload could not be read. Open Sync Data, then Wi-Fi, to see why.',
    })
  }

  return outcome
}
