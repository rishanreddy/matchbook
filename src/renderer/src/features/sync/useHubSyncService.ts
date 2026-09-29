import { useCallback, useEffect, useRef } from 'react'
import { combineLatest, debounceTime } from 'rxjs'
import { logger } from '../../lib/utils/logger'
import { useDatabaseStore } from '../../stores/useDatabase'
import { useDeviceStore, useIsHub } from '../../stores/useDeviceStore'
import { useWifiHub, wasReceivingWhenClosed } from '../../stores/useWifiHub'
import { addReceivedScouting, buildSetupDocument } from './hubService'

const PUBLISH_DEBOUNCE_MS = 800

/**
 * Keeps a hub laptop's Wi-Fi receiving working from every page, not just Sync Data.
 *
 * - Starts receiving again on launch if it was on when the app last closed, so a
 *   restart mid-event does not silently stop collecting.
 * - Adds scouts' uploads as they arrive, when the lead scout has left that switched on.
 * - Keeps the form, event and schedule scouts can fetch up to date as they are edited.
 */
export function useHubSyncService(): void {
  const db = useDatabaseStore((state) => state.db)
  const isHub = useIsHub()
  const deviceId = useDeviceStore((state) => state.deviceId)
  const deviceName = useDeviceStore((state) => state.deviceName)
  const isRunning = useWifiHub((state) => state.status?.running ?? false)
  const autoAdd = useWifiHub((state) => state.autoAdd)
  const attemptedRestart = useRef(false)

  const active = Boolean(db) && isHub && typeof window !== 'undefined' && Boolean(window.electronAPI)

  useEffect(() => {
    if (!active || !deviceId) {
      return
    }

    let cancelled = false
    const restore = async (): Promise<void> => {
      await useWifiHub.getState().refresh()
      if (cancelled || attemptedRestart.current) {
        return
      }

      attemptedRestart.current = true
      if (!useWifiHub.getState().status?.running && wasReceivingWhenClosed()) {
        await useWifiHub.getState().start({ id: deviceId, name: deviceName?.trim() || 'Lead scout laptop' })
      }
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [active, deviceId, deviceName])

  const addReceived = useCallback(async (): Promise<void> => {
    if (!db) {
      return
    }

    try {
      await addReceivedScouting(db)
    } catch (error: unknown) {
      logger.warn('Could not add received scouting', error)
    }
  }, [db])

  useEffect(() => {
    const api = window.electronAPI
    if (!active || !isRunning || !api) {
      return
    }

    const off = api.onSyncPayloadReceived(() => {
      void useWifiHub.getState().refresh()
      if (useWifiHub.getState().autoAdd) {
        void addReceived()
      }
    })

    if (autoAdd) {
      void addReceived()
    }

    return off
  }, [active, isRunning, autoAdd, addReceived])

  useEffect(() => {
    const api = window.electronAPI
    if (!db || !active || !isRunning || !api) {
      return
    }

    const publish = async (): Promise<void> => {
      try {
        const setup = await buildSetupDocument(db)
        await api.publishSyncConfig(setup.json)
        useWifiHub.getState().setSharedSummary(setup.isEmpty ? null : setup.summary)
      } catch (error: unknown) {
        logger.warn('Could not share the setup with scouts', error)
      }
    }

    void publish()
    const subscription = combineLatest([
      db.collections.formSchemas.find().$,
      db.collections.events.find().$,
      db.collections.matches.find().$,
      db.collections.assignments.find().$,
    ])
      .pipe(debounceTime(PUBLISH_DEBOUNCE_MS))
      .subscribe(() => void publish())

    return () => subscription.unsubscribe()
  }, [active, db, isRunning])
}
