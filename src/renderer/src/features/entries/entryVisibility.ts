export const ALL_EVENTS = 'all'
export const NO_EVENT = 'none'

type EntryLike = { eventId: string; teamNumber: number; deviceId: string }

export type EventTally = { eventId: string; label: string; count: number }

export function eventDisplayName(eventId: string, eventNames: ReadonlyMap<string, string>): string {
  return eventNames.get(eventId) ?? (eventId === NO_EVENT ? 'No event selected' : eventId)
}

/** How many entries each event has, most first, with the event the laptop is on leading ties. */
export function tallyByEvent(entries: readonly EntryLike[], eventNames: ReadonlyMap<string, string>, currentEventId: string | null): EventTally[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.eventId, (counts.get(entry.eventId) ?? 0) + 1)
  }

  return [...counts]
    .map(([eventId, count]) => ({ eventId, label: eventDisplayName(eventId, eventNames), count }))
    .sort((left, right) => right.count - left.count || Number(right.eventId === currentEventId) - Number(left.eventId === currentEventId) || left.label.localeCompare(right.label))
}

/**
 * The event filter to start on. A laptop starts on its own event, but when that event has no
 * entries and others do, starting there would show an empty page that looks like data went
 * missing, so it starts on everything instead.
 */
export function chooseInitialEventFilter(requested: string | null, currentEventId: string | null, tally: readonly EventTally[]): string {
  if (requested) {
    return requested
  }

  if (currentEventId && tally.some((item) => item.eventId === currentEventId)) {
    return currentEventId
  }

  return ALL_EVENTS
}

export type HiddenSummary = {
  /** Entries this laptop could show that the event filter is hiding. */
  hidden: number
  /** What the hidden entries are filed under. */
  where: EventTally[]
}

/** What the event filter is hiding, after any team search has been applied. */
export function summarizeHidden(entries: readonly EntryLike[], eventFilter: string, teamFilter: string, eventNames: ReadonlyMap<string, string>): HiddenSummary {
  if (eventFilter === ALL_EVENTS) {
    return { hidden: 0, where: [] }
  }

  const search = teamFilter.trim()
  const matching = entries.filter((entry) => search === '' || String(entry.teamNumber).includes(search))
  const hiddenEntries = matching.filter((entry) => entry.eventId !== eventFilter)
  return { hidden: hiddenEntries.length, where: tallyByEvent(hiddenEntries, eventNames, null) }
}

/**
 * Entries filed under "no event": saved on a laptop that had not picked one. Nothing else in the
 * app can show them in context, so the lead scout is offered to file them under their own event.
 * Entries under some other real event are never touched: they may belong there.
 */
export function entriesWithNoEvent<T extends EntryLike>(entries: readonly T[]): T[] {
  return entries.filter((entry) => entry.eventId === NO_EVENT)
}
