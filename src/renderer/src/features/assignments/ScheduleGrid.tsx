import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Badge, Group, NativeSelect, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core'
import type { MatchDocType } from '../../lib/db/schemas/matches.schema'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { isListed, sortRoster } from '../roster/rosterService'
import { POSITIONS, positionLabel, type Position } from './assign'
import { slotId, teamKeyAt, teamNumberOf } from './assignmentService'
import type { SlotStatus } from './coverage'
import { statusWords } from './rows'
import './assignments.css'

type Filter = 'all' | 'open' | 'late'

type ScheduleGridProps = {
  matches: readonly MatchDocType[]
  scoutBySlot: ReadonlyMap<string, string>
  roster: readonly RosterScoutDocType[]
  statuses: ReadonlyMap<string, SlotStatus>
  doubles: ReadonlyMap<string, ReadonlySet<string>>
  onAssign: (match: MatchDocType, position: Position, scoutId: string | null) => void
}

function formatTime(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date)
}

export function ScheduleGrid({ matches, scoutBySlot, roster, statuses, doubles, onAssign }: ScheduleGridProps): ReactElement {
  const [filter, setFilter] = useState<Filter>('all')
  const [jump, setJump] = useState<number | string>('')

  const listed = useMemo(() => sortRoster(roster.filter(isListed)), [roster])
  const byId = useMemo(() => new Map(roster.map((scout) => [scout.id, scout])), [roster])

  const matchStatuses = (match: MatchDocType): SlotStatus[] => POSITIONS.map((position) => statuses.get(slotId(match.key, position))).filter((status): status is SlotStatus => status !== undefined)
  const openCount = matches.filter((match) => matchStatuses(match).includes('open')).length
  const lateCount = matches.filter((match) => matchStatuses(match).includes('late')).length

  const shown = matches.filter((match) => (filter === 'all' ? true : filter === 'open' ? matchStatuses(match).includes('open') : matchStatuses(match).includes('late')))

  const goTo = (value: number | string): void => {
    setJump(value)
    const target = typeof value === 'number' ? matches.find((match) => match.matchNumber === value) : undefined
    if (target) {
      document.getElementById(`assignment-match-${target.matchNumber}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }

  const optionsFor = (assignedId: string, status: SlotStatus | undefined): Array<{ value: string; label: string }> => {
    const options = [{ value: '', label: status === 'received' && assignedId === '' ? 'Already scouted' : 'Open' }, ...listed.map((scout) => ({ value: scout.id, label: scout.status === 'active' ? scout.name : `${scout.name} (away)` }))]
    if (assignedId !== '' && !listed.some((scout) => scout.id === assignedId)) {
      const former = byId.get(assignedId)
      options.push({ value: assignedId, label: `${former?.name ?? 'Unknown scout'} (removed)` })
    }
    return options
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <SegmentedControl
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          aria-label="Which matches to show"
          data={[
            { value: 'all', label: `All ${matches.length}` },
            { value: 'open', label: `Open stations (${openCount})` },
            { value: 'late', label: `Late (${lateCount})` },
          ]}
        />
        <NumberInput
          aria-label="Jump to match"
          placeholder="Jump to match"
          value={jump}
          onChange={goTo}
          min={1}
          hideControls
          allowDecimal={false}
          w={150}
        />
      </Group>

      {shown.length === 0 ? (
        <Text size="sm" c="slate.3">
          {filter === 'open' ? 'Every station has a scout.' : filter === 'late' ? 'Nothing is late.' : 'No matches.'}
        </Text>
      ) : (
        <Stack gap="sm">
          {shown.map((match) => {
            const time = formatTime(match.predictedTime)
            const open = matchStatuses(match).filter((status) => status === 'open').length
            const doubled = doubles.get(match.key)
            return (
              <div key={match.key} id={`assignment-match-${match.matchNumber}`} className="assignment-match">
                <Group justify="space-between" align="center" mb={8} wrap="wrap" gap="xs">
                  <Group gap="sm" align="baseline">
                    <Text fw={700} c="slate.0">
                      Match {match.matchNumber}
                    </Text>
                    {time ? (
                      <Text size="xs" c="slate.4">
                        {time}
                      </Text>
                    ) : null}
                  </Group>
                  <Group gap="xs">
                    {doubled ? (
                      <Badge color="yellow" variant="light" size="sm">
                        {[...doubled].map((id) => byId.get(id)?.name ?? 'A scout').join(', ')} has two robots
                      </Badge>
                    ) : null}
                    {open > 0 ? (
                      <Badge color="amber" variant="light" size="sm">
                        {open} open
                      </Badge>
                    ) : null}
                  </Group>
                </Group>

                <div className="assignment-stations">
                  {(['red', 'blue'] as const).map((alliance) => (
                    <div key={alliance} className="assignment-alliance">
                      {POSITIONS.filter((position) => position.startsWith(alliance)).map((position) => {
                        const teamKey = teamKeyAt(match, position)
                        const id = slotId(match.key, position)
                        const scoutId = scoutBySlot.get(id) ?? ''
                        const status = statuses.get(id)
                        const team = teamNumberOf(teamKey)
                        return (
                          <div key={position} className="assignment-slot" data-alliance={alliance} data-double={doubled?.has(scoutId) ? '' : undefined}>
                            <span className="assignment-slot__station">{positionLabel(position)}</span>
                            <span className="assignment-slot__team">{team ?? '-'}</span>
                            <NativeSelect
                              aria-label={`Scout for match ${match.matchNumber}, ${positionLabel(position)}${team ? `, team ${team}` : ''}`}
                              size="xs"
                              value={scoutId}
                              data={optionsFor(scoutId, status)}
                              disabled={teamKey === ''}
                              onChange={(event) => onAssign(match, position, event.currentTarget.value || null)}
                            />
                            <span
                              className="assignment-dot"
                              data-status={status ?? 'open'}
                              role="img"
                              aria-label={statusWords(status ?? 'open')}
                              title={statusWords(status ?? 'open')}
                            />
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}
