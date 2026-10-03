import type { ScoutingDatabase } from '../../lib/db/collections'
import { validateSyncPayload } from '../../../../shared/syncProtocol'
import { logger } from '../../lib/utils/logger'
import { useEventStore } from '../../stores/useEventStore'
import { useWifiHub } from '../../stores/useWifiHub'
import { notifyReceived } from './receiveNotices'
import {
  SETUP_COLLECTIONS,
  buildSnapshot,
  countInsertedEntries,
  describeTransfer,
  emptyImportResult,
  importPayload,
  mergeImportResults,
  parseTransferDocument,
  type ImportResult,
} from './syncData'

export type DrainResult = {
  /** Uploads taken off the queue. */
  payloads: number
  /** Uploads set aside because something in them could not be read. */
  quarantined: number
  result: ImportResult
}

const EMPTY_RESULT: ImportResult = emptyImportResult()

/** The pass in progress, shared by everyone who asks while it runs. */
let receiving: Promise<DrainResult> | null = null
/** Something arrived, or a person pressed the button, since the pass in progress last looked at the queue. */
let lookAgain = false
/** A person pressed the button during the pass in progress. */
let personAsked = false

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
      results.push({ ...emptyImportResult(), errors: 1, errorMessages: [message] })
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
      removedEarlier: combinedResult.removedEarlier,
      entriesByEvent: combinedResult.entriesByEvent,
      errors: combinedResult.errors,
      elapsedMs: Date.now() - startedAt,
    }, 'sync.wifi.hub')
  }

  return { payloads, quarantined, result: combinedResult }
}

function combinePasses(passes: DrainResult[]): DrainResult {
  if (passes.length === 1) {
    return passes[0]
  }

  return {
    payloads: passes.reduce((sum, pass) => sum + pass.payloads, 0),
    quarantined: passes.reduce((sum, pass) => sum + pass.quarantined, 0),
    result: mergeImportResults(passes.map((pass) => pass.result)),
  }
}

/** Looks at the queue until a look finds nothing new, so nothing a scout sent is left waiting. */
async function receiveUntilQuiet(db: ScoutingDatabase): Promise<{ outcome: DrainResult; manual: boolean }> {
  const passes: DrainResult[] = []
  let manual = false

  try {
    do {
      lookAgain = false
      passes.push(await drainOnce(db))
    } while (lookAgain)
  } finally {
    // Done in the same breath as the last look, so a caller that arrives after this starts a pass of its own.
    manual = personAsked
    personAsked = false
    receiving = null
  }

  return { outcome: combinePasses(passes), manual }
}

async function receive(db: ScoutingDatabase): Promise<DrainResult> {
  const { outcome, manual } = await receiveUntilQuiet(db)
  const { result, quarantined } = outcome
  const hub = useWifiHub.getState()
  hub.countReceived(countInsertedEntries(result))
  await hub.refresh()

  const events = await db.collections.events.find().exec()
  notifyReceived(result, {
    manual,
    payloads: outcome.payloads,
    quarantined,
    currentEventId: useEventStore.getState().currentEventId,
    eventNames: new Map(events.map((event) => [event.id, event.name])),
  })

  return outcome
}

/**
 * Adds everything scouts have uploaded to this laptop's database and tells the lead scout what
 * happened.
 *
 * `manual` is a person pressing the button: they get an answer even when nothing was waiting.
 * Automatic passes stay quiet unless something actually changed.
 *
 * Only one pass runs at a time. A scout's name is sent right behind its entries, and a pass only
 * sees what was queued when it began, so a caller that arrives mid-pass makes it look again before
 * it finishes instead of waiting on a result that cannot include what just arrived. Everyone who
 * asked gets the same combined result, and the lead scout hears about it once.
 */
export function addReceivedScouting(db: ScoutingDatabase, options: { manual?: boolean } = {}): Promise<DrainResult> {
  if (options.manual === true) {
    personAsked = true
  }

  if (receiving) {
    lookAgain = true
    return receiving
  }

  receiving = receive(db)
  return receiving
}

/**
 * What scouts fetch: the form, the event, the schedule, the roster and who is assigned what, as
 * this hub has them right now, plus the event the lead scout is on so a scout laptop that has not
 * picked one can start on the same event.
 */
export async function buildSetupDocument(db: ScoutingDatabase): Promise<{ json: string; summary: string; isEmpty: boolean }> {
  const currentEventId = useEventStore.getState().currentEventId
  const snapshot = await buildSnapshot(db, SETUP_COLLECTIONS, { currentEventId })
  const parsed = parseTransferDocument(snapshot)
  return {
    json: JSON.stringify(snapshot),
    summary: describeTransfer(parsed),
    isEmpty: parsed.tasks.every((task) => task.rows.length === 0),
  }
}
