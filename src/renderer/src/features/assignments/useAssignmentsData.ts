import { useEffect, useMemo, useState } from 'react'
import type { ScoutingDatabase } from '../../lib/db/collections'
import type { AssignmentDocType } from '../../lib/db/schemas/assignments.schema'
import type { EventDocType } from '../../lib/db/schemas/events.schema'
import type { MatchDocType } from '../../lib/db/schemas/matches.schema'
import { handleError } from '../../lib/utils/errorHandler'
import { useRoster } from '../roster/useRoster'
import { computeCoverage, type Coverage, type CoverageEntry } from './coverage'
import { toPlanMatch } from './assignmentService'
import type { PlanMatch } from './assign'

/** Data that belongs to one event. Remembering which event it came from lets a change of event show nothing, not the old event's data, until the new data arrives. */
type ForEvent<T> = { eventKey: string; data: T }

/** The events on this laptop, newest first. */
export function useEvents(db: ScoutingDatabase | null): { events: EventDocType[]; loaded: boolean } {
  const [events, setEvents] = useState<EventDocType[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!db) {
      return
    }

    const subscription = db.collections.events.find({ sort: [{ startDate: 'desc' }] }).$.subscribe({
      next: (docs) => {
        setEvents(docs.map((doc) => doc.toJSON() as EventDocType))
        setLoaded(true)
      },
      error: (error: unknown) => handleError(error, 'Watch events'),
    })
    return () => subscription.unsubscribe()
  }, [db])

  return db ? { events, loaded } : { events: [], loaded: false }
}

export type AssignmentsData = {
  matches: MatchDocType[]
  planMatches: PlanMatch[]
  assignments: AssignmentDocType[]
  /** Who holds each station, by station id. An empty string means open. */
  scoutBySlot: Map<string, string>
  entries: CoverageEntry[]
  coverage: Coverage
  roster: ReturnType<typeof useRoster>['roster']
  loaded: boolean
}

const NONE: never[] = []

/** Everything the assignments screens need for one event, kept current as data arrives. */
export function useAssignmentsData(db: ScoutingDatabase | null, eventKey: string | null): AssignmentsData {
  const { roster, loaded: rosterLoaded } = useRoster(db)
  const [matchesFor, setMatchesFor] = useState<ForEvent<MatchDocType[]> | null>(null)
  const [assignmentsFor, setAssignmentsFor] = useState<ForEvent<AssignmentDocType[]> | null>(null)
  const [entriesFor, setEntriesFor] = useState<ForEvent<CoverageEntry[]> | null>(null)

  useEffect(() => {
    if (!db || !eventKey) {
      return
    }

    const subscriptions = [
      db.collections.matches.find({ selector: { eventId: eventKey, compLevel: 'qm' }, sort: [{ matchNumber: 'asc' }] }).$.subscribe({
        next: (docs) => setMatchesFor({ eventKey, data: docs.map((doc) => doc.toJSON() as MatchDocType) }),
        error: (error: unknown) => handleError(error, 'Watch the match schedule'),
      }),
      db.collections.assignments.find({ selector: { eventKey } }).$.subscribe({
        next: (docs) => setAssignmentsFor({ eventKey, data: docs.map((doc) => doc.toJSON() as AssignmentDocType) }),
        error: (error: unknown) => handleError(error, 'Watch assignments'),
      }),
      db.collections.scoutingData.find({ selector: { eventId: eventKey } }).$.subscribe({
        next: (docs) => setEntriesFor({ eventKey, data: docs.map((doc) => ({ eventId: doc.eventId, matchNumber: doc.matchNumber, teamNumber: doc.teamNumber })) }),
        error: (error: unknown) => handleError(error, 'Watch scouting entries'),
      }),
    ]

    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [db, eventKey])

  const matches = matchesFor?.eventKey === eventKey && db ? matchesFor.data : NONE
  const assignments = assignmentsFor?.eventKey === eventKey && db ? assignmentsFor.data : NONE
  const entries = entriesFor?.eventKey === eventKey && db ? entriesFor.data : NONE

  const planMatches = useMemo(() => matches.map(toPlanMatch), [matches])
  const scoutBySlot = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment.scoutId])), [assignments])
  const coverage = useMemo(() => computeCoverage(eventKey ?? '', planMatches, scoutBySlot, entries), [entries, eventKey, planMatches, scoutBySlot])

  const eventLoaded = !eventKey || (matchesFor?.eventKey === eventKey && assignmentsFor?.eventKey === eventKey)
  return { matches, planMatches, assignments, scoutBySlot, entries, coverage, roster, loaded: Boolean(db) && eventLoaded && rosterLoaded }
}
