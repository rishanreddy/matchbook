import type { ScoutingDatabase } from '../../lib/db/collections'
import { finishImport } from './afterImport'
import { readSavedHub } from './hubSettings'
import { importTransfer } from './syncData'
import { WifiError, fetchHubSetup, shareScoutName } from './wifi'
import { useDeviceStore } from '../../stores/useDeviceStore'

export type RefreshOutcome =
  | { kind: 'done'; summary: string }
  | { kind: 'not-paired' }
  | { kind: 'failed'; message: string }

/**
 * Gets the latest form, event, schedule, roster and assignments from the lead scout, using the
 * address and code this laptop already has. A scout can do this from the Scout screen without
 * going to Sync Data; if the laptop has never been paired, the caller sends them there.
 */
export async function refreshSetupFromHub(db: ScoutingDatabase): Promise<RefreshOutcome> {
  const saved = readSavedHub()
  if (!saved) {
    return { kind: 'not-paired' }
  }

  try {
    const document = await fetchHubSetup(saved)
    const result = await importTransfer(db, document)
    const summary = await finishImport(db, result, document)
    const deviceId = useDeviceStore.getState().deviceId
    if (deviceId) {
      // Keeps the lead scout's roster current, for instance after this scout picked their name.
      await shareScoutName(db, saved, deviceId)
    }

    return { kind: 'done', summary }
  } catch (error: unknown) {
    return {
      kind: 'failed',
      message: error instanceof WifiError ? error.message : error instanceof Error ? error.message : 'Could not reach the lead scout.',
    }
  }
}
