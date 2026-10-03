import { Button, Group, Text } from '@mantine/core'
import type { ScoutingDatabase } from '../../lib/db/collections'
import { notify } from '../../lib/utils/notify'
import { useEventStore } from '../../stores/useEventStore'
import { describeElsewhere, entriesUnderOtherEvents } from './receiveNotices'
import { summarizeImport, type ImportResult, type TransferDocument } from './syncData'

export type EventAdoption =
  | { kind: 'adopted'; eventId: string; eventName: string }
  | { kind: 'differs'; hubEventId: string; hubEventName: string; currentEventName: string }
  | { kind: 'unchanged' }

/**
 * Starts this laptop on the lead scout's event when it has none.
 *
 * A scout laptop that never picked an event saved every entry under "no event", and the lead
 * scout's Review Entries hid them behind the event filter. The lead scout's event now travels
 * with the setup, and a laptop with no event of its own simply adopts it. A laptop that is
 * already on a different event is left alone and told, because switching it silently would put
 * the scout's next entries under an event they did not choose.
 *
 * Only an event the lead scout named is ever adopted. A file or an older lead scout that does not
 * name one never has an event guessed for it: the scout is asked to pick instead.
 */
export async function adoptHubEvent(db: ScoutingDatabase, hubEventId: string | undefined): Promise<EventAdoption> {
  const hubDoc = hubEventId ? await db.collections.events.findOne(hubEventId).exec() : null
  if (!hubDoc) {
    return { kind: 'unchanged' }
  }

  const store = useEventStore.getState()
  const currentDoc = store.currentEventId ? await db.collections.events.findOne(store.currentEventId).exec() : null
  if (!currentDoc) {
    store.setCurrentEvent(hubDoc.id, hubDoc.season)
    return { kind: 'adopted', eventId: hubDoc.id, eventName: hubDoc.name }
  }

  if (hubDoc.id !== currentDoc.id) {
    return { kind: 'differs', hubEventId: hubDoc.id, hubEventName: hubDoc.name, currentEventName: currentDoc.name }
  }

  return { kind: 'unchanged' }
}

function announceAdoption(adoption: EventAdoption, db: ScoutingDatabase): void {
  if (adoption.kind === 'adopted') {
    notify({
      color: 'green',
      title: 'Event set',
      message: `This laptop is now on ${adoption.eventName}, the lead scout’s event. New entries go under it.`,
    })
    return
  }

  if (adoption.kind === 'differs') {
    notify({
      color: 'yellow',
      title: 'Different event from the lead scout',
      autoClose: 20_000,
      interactive: true,
      message: (
        <Group gap="xs" align="center">
          <Text size="sm">
            The lead scout is on {adoption.hubEventName}. This laptop is on {adoption.currentEventName}.
          </Text>
          <Button
            size="compact-xs"
            onClick={() =>
              void db.collections.events.findOne(adoption.hubEventId).exec().then((doc) => {
                if (doc) {
                  useEventStore.getState().setCurrentEvent(doc.id, doc.season)
                  notify({ color: 'green', title: 'Event changed', message: `Now on ${doc.name}.` })
                }
              })
            }
          >
            Switch to {adoption.hubEventName}
          </Button>
        </Group>
      ),
    })
  }
}

/** The sentence that says where new entries were filed, when it is not under the event this laptop is on. */
export function placementHint(result: ImportResult, currentEventId: string | null, eventNames: ReadonlyMap<string, string>): string | null {
  const elsewhere = entriesUnderOtherEvents(result, currentEventId)
  if (elsewhere.length === 0) {
    return null
  }

  const total = elsewhere.reduce((sum, [, count]) => sum + count, 0)
  const where = describeElsewhere(elsewhere, eventNames)
  const current = currentEventId ? (eventNames.get(currentEventId) ?? currentEventId) : null
  return `${total === 1 ? '1 new entry is' : `${total} new entries are`} filed under ${where}${current ? `, not ${current}` : ''}. Choose All events in Review Entries to see ${total === 1 ? 'it' : 'them'}.`
}

/**
 * What to do after a file, QR transfer or Wi-Fi setup has been added to this laptop: adopt the
 * lead scout's event if there is one, and say where any new entries ended up. Returns the
 * summary to show next to the button.
 */
export async function finishImport(db: ScoutingDatabase, result: ImportResult, document: TransferDocument): Promise<string> {
  if (document.currentEventId) {
    announceAdoption(await adoptHubEvent(db, document.currentEventId), db)
  }

  const events = await db.collections.events.find().exec()
  const names = new Map(events.map((event) => [event.id, event.name]))
  const hint = placementHint(result, useEventStore.getState().currentEventId, names)
  const summary = summarizeImport(result)
  if (!hint) {
    return summary
  }

  notify({ color: 'yellow', title: 'Check the event filter', autoClose: 12_000, message: hint })
  return `${summary} ${hint}`
}
