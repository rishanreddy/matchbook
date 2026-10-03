import { useEffect, useMemo, useState } from 'react'
import type { EventDocType } from '../../lib/db/schemas/events.schema'
import type { FormSchemaDocType } from '../../lib/db/schemas/formSchemas.schema'
import type { AnalysisObservation } from '../../lib/utils/analysis'
import { handleError } from '../../lib/utils/errorHandler'
import { useDatabaseStore } from '../../stores/useDatabase'

export function useAnalysisData(): {
  observations: AnalysisObservation[]
  events: EventDocType[]
  activeForm: FormSchemaDocType | null
  sourceLabels: Map<string, string>
  loaded: boolean
} {
  const db = useDatabaseStore((state) => state.db)
  const [observations, setObservations] = useState<AnalysisObservation[]>([])
  const [events, setEvents] = useState<EventDocType[]>([])
  const [activeForm, setActiveForm] = useState<FormSchemaDocType | null>(null)
  const [deviceNames, setDeviceNames] = useState<Map<string, string>>(new Map())
  const [scoutNames, setScoutNames] = useState<Map<string, string>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)

  useEffect(() => {
    if (!db) return
    const subscriptions = [
      db.collections.scoutingData.find().$.subscribe({
        next: (docs) => { setObservations(docs.map((doc) => doc.toJSON())); setLoaded(true) },
        error: (error: unknown) => handleError(error, 'Watch scouting data for analysis'),
      }),
      db.collections.events.find({ sort: [{ startDate: 'desc' }] }).$.subscribe({
        next: (docs) => { setEvents(docs.map((doc) => doc.toJSON())); setEventsLoaded(true) },
        error: (error: unknown) => handleError(error, 'Watch analysis events'),
      }),
      db.collections.formSchemas.find({ selector: { isActive: true } }).$.subscribe({
        next: (docs) => setActiveForm(docs.map((doc) => doc.toJSON()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))[0] ?? null),
        error: (error: unknown) => handleError(error, 'Watch the active scouting form'),
      }),
      db.collections.devices.find().$.subscribe({
        next: (docs) => setDeviceNames(new Map(docs.map((doc) => [doc.id, doc.name]))),
        error: (error: unknown) => handleError(error, 'Watch analysis device names'),
      }),
      db.collections.roster.find().$.subscribe({
        next: (docs) => setScoutNames(new Map(docs.filter((doc) => doc.deviceId !== '' && doc.status !== 'removed').map((doc) => [doc.deviceId, doc.name]))),
        error: (error: unknown) => handleError(error, 'Watch analysis scout names'),
      }),
    ]
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [db])

  const sourceLabels = useMemo(() => {
    const labels = new Map(deviceNames)
    for (const [id, name] of scoutNames) labels.set(id, deviceNames.has(id) ? `${name} (${deviceNames.get(id)})` : name)
    return labels
  }, [deviceNames, scoutNames])
  return { observations, events, activeForm, sourceLabels, loaded: loaded && eventsLoaded }
}
