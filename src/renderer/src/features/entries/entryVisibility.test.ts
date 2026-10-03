import { describe, expect, it } from 'vitest'
import { ALL_EVENTS, chooseInitialEventFilter, entriesWithNoEvent, summarizeHidden, tallyByEvent } from './entryVisibility'

const entry = (eventId: string, teamNumber = 254) => ({ eventId, teamNumber, deviceId: 'device_a' })
const names = new Map([['2026casd', 'San Diego Regional'], ['2026txhou', 'Houston Regional']])

describe('tallyByEvent', () => {
  it('counts entries per event, most first, naming the events people know', () => {
    const tally = tallyByEvent([entry('none'), entry('none'), entry('2026casd'), entry('2026txhou'), entry('none')], names, '2026casd')
    expect(tally).toEqual([
      { eventId: 'none', label: 'No event selected', count: 3 },
      { eventId: '2026casd', label: 'San Diego Regional', count: 1 },
      { eventId: '2026txhou', label: 'Houston Regional', count: 1 },
    ])
  })

  it('puts the event this laptop is on first when counts tie', () => {
    const tally = tallyByEvent([entry('2026txhou'), entry('2026casd')], names, '2026casd')
    expect(tally.map((item) => item.eventId)).toEqual(['2026casd', '2026txhou'])
  })
})

describe('chooseInitialEventFilter', () => {
  const tally = [{ eventId: 'none', label: 'No event selected', count: 13 }, { eventId: '2026casd', label: 'San Diego Regional', count: 5 }]

  it('honours a link that names an event', () => {
    expect(chooseInitialEventFilter('2026txhou', '2026casd', tally)).toBe('2026txhou')
  })

  it('starts on this laptop’s event when it has entries', () => {
    expect(chooseInitialEventFilter(null, '2026casd', tally)).toBe('2026casd')
  })

  it('starts on everything when this laptop’s event has no entries, so the page is never empty while data exists', () => {
    expect(chooseInitialEventFilter(null, '2026txhou', tally)).toBe(ALL_EVENTS)
    expect(chooseInitialEventFilter(null, null, tally)).toBe(ALL_EVENTS)
  })
})

describe('summarizeHidden', () => {
  const all = [entry('2026casd'), entry('2026casd'), entry('none', 971), entry('none', 118), entry('2026txhou', 254)]

  it('reports what the event filter hides and where it is filed', () => {
    const summary = summarizeHidden(all, '2026casd', '', names)
    expect(summary.hidden).toBe(3)
    expect(summary.where).toEqual([
      { eventId: 'none', label: 'No event selected', count: 2 },
      { eventId: '2026txhou', label: 'Houston Regional', count: 1 },
    ])
  })

  it('hides nothing when all events are shown', () => {
    expect(summarizeHidden(all, ALL_EVENTS, '', names)).toEqual({ hidden: 0, where: [] })
  })

  it('only counts entries that match the team search', () => {
    expect(summarizeHidden(all, '2026casd', '971', names).hidden).toBe(1)
  })
})

describe('entriesWithNoEvent', () => {
  it('finds only entries filed under no event, never entries that belong to another real event', () => {
    const all = [entry('2026casd'), entry('none'), entry('2099zzzz')]
    expect(entriesWithNoEvent(all).map((row) => row.eventId)).toEqual(['none'])
  })
})
