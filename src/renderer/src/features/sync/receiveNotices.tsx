import { Anchor, Text } from '@mantine/core'
import { notify } from '../../lib/utils/notify'
import { countInsertedEntries, countLabel, summarizeImport, type ImportResult } from './syncData'

export const NO_EVENT = 'none'

export type ReceiveContext = {
  /** A person pressed the button, so they always get an answer. Automatic passes stay quiet. */
  manual: boolean
  /** Uploads taken off the queue in this pass. */
  payloads: number
  /** Uploads set aside because something in them could not be read. */
  quarantined: number
  currentEventId: string | null
  /** Event ids to the names people know them by. */
  eventNames: ReadonlyMap<string, string>
}

export function eventLabel(eventId: string, eventNames: ReadonlyMap<string, string>): string {
  return eventId === NO_EVENT ? 'no event' : (eventNames.get(eventId) ?? eventId)
}

/** Where entries were filed, for a sentence: "no event", or "other events (9 under no event, 2 under Houston)". */
export function describeElsewhere(elsewhere: ReadonlyArray<readonly [string, number]>, eventNames: ReadonlyMap<string, string>): string {
  if (elsewhere.length === 1) {
    return eventLabel(elsewhere[0][0], eventNames)
  }

  return `other events (${elsewhere.map(([eventId, count]) => `${count} under ${eventLabel(eventId, eventNames)}`).join(', ')})`
}

/**
 * The new entries that are filed under an event other than the one this laptop is on, with how
 * many. A laptop that is on no event shows every entry, so nothing is hidden from it.
 */
export function entriesUnderOtherEvents(result: ImportResult, currentEventId: string | null): Array<[string, number]> {
  if (currentEventId === null) {
    return []
  }

  return Object.entries(result.entriesByEvent).filter(([eventId]) => eventId !== currentEventId)
}

/**
 * Tells the lead scout what a receive pass did, in terms of where entries went. "Already here" on
 * its own sent people looking for entries that were in fact filed under another event, so every
 * message here says what was added, where it was filed, and what was skipped and why.
 */
export function notifyReceived(result: ImportResult, context: ReceiveContext): void {
  const entries = countInsertedEntries(result)

  if (entries > 0) {
    notify({
      color: 'green',
      title: 'Scouting received',
      message: `${countLabel('scoutingData', entries)} added from a scout.`,
    })

    const elsewhere = entriesUnderOtherEvents(result, context.currentEventId)
    if (elsewhere.length > 0) {
      const total = elsewhere.reduce((sum, [, count]) => sum + count, 0)
      const where = describeElsewhere(elsewhere, context.eventNames)
      notify({
        color: 'yellow',
        title: 'Some entries are for a different event',
        autoClose: 12_000,
        interactive: true,
        message: (
          <Text size="sm">
            {total === 1 ? '1 entry is' : `${total} entries are`} filed under {where}, so {total === 1 ? 'it does' : 'they do'} not show in Review Entries for
            the event you are on.{' '}
            <Anchor href="#/entries?event=all" size="sm">
              Show all entries
            </Anchor>
          </Text>
        ),
      })
    }
  } else if (result.inserted + result.updated > 0 && context.manual) {
    notify({ color: 'green', title: 'Scouts updated', message: summarizeImport(result) })
  } else if (context.manual && context.payloads === 0 && context.quarantined === 0) {
    notify({ color: 'blue', title: 'Nothing waiting', message: 'No scouts have sent anything new.' })
  } else if (context.manual && context.quarantined === 0) {
    notify({
      color: 'blue',
      title: 'Nothing new',
      autoClose: 12_000,
      interactive: true,
      message:
        result.removedEarlier > 0 ? (
          `${summarizeImport(result)} Entries you remove stay removed, even if a scout sends them again.`
        ) : (
          <Text size="sm">
            {summarizeImport(result)} Everything a scout sent is already on this laptop. Review Entries starts on the event you are on, so some of it may be filed under another
            event.{' '}
            <Anchor href="#/entries?event=all" size="sm">
              Show all entries
            </Anchor>
          </Text>
        ),
    })
  }

  if (entries > 0 && result.removedEarlier > 0) {
    notify({
      color: 'blue',
      title: 'Some entries were skipped',
      message: `${result.removedEarlier} ${result.removedEarlier === 1 ? 'entry was' : 'entries were'} skipped because you removed ${result.removedEarlier === 1 ? 'it' : 'them'} earlier.`,
    })
  }

  if (context.quarantined > 0) {
    notify({
      color: 'yellow',
      title: 'Some data was set aside',
      message: 'Part of an upload could not be read. Open Sync Data, then Wi-Fi, to see why.',
    })
  }
}
