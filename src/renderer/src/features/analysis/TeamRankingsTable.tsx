import type { ReactElement } from 'react'
import { useMemo, useRef } from 'react'
import { Box, Button, Checkbox, Progress, Table, Text } from '@mantine/core'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatAnalysisValue, type AnalysisMetric, type RankedTeam } from '../../lib/utils/analysis'

const features = tableFeatures({})
const column = createColumnHelper<typeof features, RankedTeam>()
const ROW_HEIGHT = 70

export function TeamRankingsTable({ teams, metric, selectedTeams, onToggleTeam, onOpenTeam }: {
  teams: RankedTeam[]
  metric: AnalysisMetric
  selectedTeams: number[]
  onToggleTeam: (teamNumber: number) => void
  onOpenTeam: (teamNumber: number) => void
}): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const maximum = Math.max(0, ...teams.map((team) => team.metric.value ?? 0))
  const showBars = teams.every((team) => team.metric.value === null || team.metric.value >= 0)
  const columns = useMemo(() => column.columns([
    column.display({ id: 'compare', header: 'Compare', cell: ({ row }) => (
      <Checkbox aria-label={`Compare team ${row.original.teamNumber}`} checked={selectedTeams.includes(row.original.teamNumber)}
        disabled={selectedTeams.length >= 4 && !selectedTeams.includes(row.original.teamNumber)}
        onChange={() => onToggleTeam(row.original.teamNumber)} />
    ) }),
    column.accessor('rank', { id: 'rank', header: 'Rank', cell: ({ getValue }) => <Text size="sm" c="slate.4">{getValue() ?? 'N/A'}</Text> }),
    column.accessor('teamNumber', { id: 'team', header: 'Team', cell: ({ getValue }) => (
      <Button className="analysis-team-button" variant="subtle" color="slate" onClick={() => onOpenTeam(getValue())} aria-label={`View team ${getValue()}`}>
        {getValue()}
      </Button>
    ) }),
    column.display({ id: 'metric', header: metric.label, cell: ({ row }) => (
      <Box className="analysis-metric-cell">
        <Text className="mono-number" fw={600} size="md" c={row.original.metric.value === null ? 'slate.4' : 'slate.0'}>{formatAnalysisValue(row.original.metric)}</Text>
        {showBars && maximum > 0 && row.original.metric.value !== null && <Progress value={row.original.metric.value / maximum * 100} size={4} color="amber" aria-hidden="true" />}
        {row.original.metric.kind === 'percentage' && <Text size="xs" c="slate.4">{row.original.metric.yesCount} of {row.original.metric.sampleCount} answered Yes</Text>}
        {row.original.metric.kind === 'number' && metric.kind !== 'score' && metric.kind !== 'matches' && <Text size="xs" c="slate.4">{row.original.metric.sampleCount} {row.original.metric.sampleCount === 1 ? 'answer' : 'answers'}</Text>}
      </Box>
    ) }),
    column.accessor('matchCount', { id: 'matches', header: 'Matches', cell: ({ row, getValue }) => (
      <Box><Text size="sm" className="mono-number" c="slate.1">{getValue()}</Text>
        <Text size="xs" c="slate.4">{row.original.observations.length} {row.original.observations.length === 1 ? 'entry' : 'entries'}</Text></Box>
    ) }),
    column.display({ id: 'details', header: 'Details', cell: ({ row }) => (
      <Button variant="subtle" color="slate" size="compact-sm" onClick={() => onOpenTeam(row.original.teamNumber)} aria-label={`Open matches and notes for team ${row.original.teamNumber}`}>Matches & notes</Button>
    ) }),
  ]), [maximum, metric, onOpenTeam, onToggleTeam, selectedTeams, showBars])
  const table = useTable({ features, data: teams, columns, getRowId: (team) => String(team.teamNumber) })
  const rows = table.getRowModel().rows
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 8 })
  const virtualRows = virtualizer.getVirtualItems()
  const topSpace = virtualRows[0]?.start ?? 0
  const lastVirtualRow = virtualRows.at(-1)
  const bottomSpace = lastVirtualRow ? virtualizer.getTotalSize() - lastVirtualRow.end : 0

  return (
    <Box ref={scrollRef} className="analysis-rankings-scroll" role="region" aria-label="Scrollable team rankings" tabIndex={0}>
      <Table highlightOnHover className="analysis-rankings-table" aria-label="Team rankings">
        <Table.Thead>{table.getHeaderGroups().map((group) => <Table.Tr key={group.id}>{group.headers.map((header) =>
          <Table.Th key={header.id}><table.FlexRender header={header} /></Table.Th>)}</Table.Tr>)}</Table.Thead>
        <Table.Tbody>
          {topSpace > 0 && <Table.Tr aria-hidden="true"><Table.Td colSpan={columns.length} style={{ height: topSpace, padding: 0 }} /></Table.Tr>}
          {virtualRows.map((item) => { const row = rows[item.index]; return (
            <Table.Tr key={row.id} data-selected={selectedTeams.includes(row.original.teamNumber) || undefined} style={{ height: ROW_HEIGHT }}>
              {row.getAllCells().map((cell) => <Table.Td key={cell.id}><table.FlexRender cell={cell} /></Table.Td>)}
            </Table.Tr>
          ) })}
          {bottomSpace > 0 && <Table.Tr aria-hidden="true"><Table.Td colSpan={columns.length} style={{ height: bottomSpace, padding: 0 }} /></Table.Tr>}
        </Table.Tbody>
      </Table>
    </Box>
  )
}
