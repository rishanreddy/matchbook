import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { Accordion, Badge, Group, Stack, Text } from '@mantine/core'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import { isListed, sortRoster } from '../roster/rosterService'
import { positionLabel } from './assign'
import type { SlotStatus } from './coverage'
import { statusWords, type AssignmentRow } from './rows'

const STATUS_COLORS: Record<SlotStatus, string> = { open: 'gray', received: 'green', waiting: 'yellow', late: 'red' }

type ByScoutViewProps = {
  rows: readonly AssignmentRow[]
  roster: readonly RosterScoutDocType[]
}

/** Each scout's matches in one place, for answering "what is Riley watching?" and for sending a scout their list. */
export function ByScoutView({ rows, roster }: ByScoutViewProps): ReactElement {
  const scouts = useMemo(() => sortRoster(roster.filter(isListed)), [roster])
  const byScout = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>()
    for (const row of rows) {
      if (row.scoutId !== '') {
        map.set(row.scoutId, [...(map.get(row.scoutId) ?? []), row])
      }
    }
    return map
  }, [rows])

  if (scouts.length === 0) {
    return (
      <Text size="sm" c="slate.3">
        Add scouts above, then fill the plan to see each scout’s matches here.
      </Text>
    )
  }

  return (
    <Accordion variant="separated" radius="md" multiple>
      {scouts.map((scout) => {
        const mine = byScout.get(scout.id) ?? []
        const received = mine.filter((row) => row.status === 'received').length
        return (
          <Accordion.Item key={scout.id} value={scout.id} className="surface-card">
            <Accordion.Control>
              <Group justify="space-between" wrap="wrap" gap="xs" pr="sm">
                <Text fw={600} c="slate.0">
                  {scout.name}
                  {scout.status === 'away' ? ' (away)' : ''}
                </Text>
                <Text size="xs" c="slate.4">
                  {mine.length === 0 ? 'No matches yet' : `${mine.length} ${mine.length === 1 ? 'match' : 'matches'}, ${received} received`}
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              {mine.length === 0 ? (
                <Text size="sm" c="slate.3">
                  Nothing assigned yet.
                </Text>
              ) : (
                <Stack gap={6}>
                  {mine.map((row) => (
                    <Group key={`${row.matchKey}:${row.position}`} justify="space-between" wrap="nowrap" gap="sm">
                      <Text size="sm" c="slate.1">
                        Match {row.matchNumber} · {positionLabel(row.position)} · Team {row.teamNumber ?? '?'}
                      </Text>
                      <Badge size="sm" variant="light" color={STATUS_COLORS[row.status]}>
                        {statusWords(row.status)}
                      </Badge>
                    </Group>
                  ))}
                </Stack>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        )
      })}
    </Accordion>
  )
}
