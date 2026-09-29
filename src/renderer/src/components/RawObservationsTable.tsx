import type { ReactElement } from 'react'
import { useMemo, useRef } from 'react'
import { Badge, Box, Button, Group, Table, Text, ThemeIcon } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconTable } from '@tabler/icons-react'
import { createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

export type RawObservation = {
  teamNumber: number
  matchNumber: number
  autoScore: number
  teleopScore: number
  endgameScore: number
  totalScore: number
  deviceId: string
  timestamp: string
  notes: string
}

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() })
const column = createColumnHelper<typeof features, RawObservation>()
const ROW_HEIGHT = 48

function recordedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function RawObservationsTable({
  observations,
  getDeviceDisplayLabel,
}: {
  observations: RawObservation[]
  getDeviceDisplayLabel: (deviceId: string) => string
}): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('teamNumber', { id: 'team', header: 'Team', cell: ({ getValue }) => getValue() }),
        column.accessor('matchNumber', { id: 'match', header: 'Match', cell: ({ getValue }) => getValue() }),
        column.accessor('autoScore', { id: 'auto', header: 'Auto', cell: ({ getValue }) => getValue() }),
        column.accessor('teleopScore', { id: 'teleop', header: 'Teleop', cell: ({ getValue }) => getValue() }),
        column.accessor('endgameScore', { id: 'endgame', header: 'Endgame', cell: ({ getValue }) => getValue() }),
        column.accessor('totalScore', {
          id: 'total',
          header: 'Total',
          cell: ({ getValue }) => <Text size="sm" c="frc-blue.4" fw={700}>{getValue()}</Text>,
        }),
        column.accessor('deviceId', {
          id: 'device',
          header: 'Device / Scout',
          enableSorting: false,
          cell: ({ getValue }) => {
            const label = getDeviceDisplayLabel(getValue())
            return <Text size="sm" truncate title={label}>{label}</Text>
          },
        }),
        column.accessor('timestamp', {
          id: 'timestamp',
          header: 'Timestamp',
          cell: ({ getValue }) => <Text size="xs" style={{ whiteSpace: 'nowrap' }}>{recordedAt(getValue())}</Text>,
        }),
        column.accessor('notes', {
          id: 'notes',
          header: 'Notes',
          enableSorting: false,
          cell: ({ getValue }) => <Text size="xs" truncate title={getValue()}>{getValue().trim() || '—'}</Text>,
        }),
      ]),
    [getDeviceDisplayLabel],
  )

  const table = useTable({
    features,
    data: observations,
    columns,
    initialState: { sorting: [{ id: 'timestamp', desc: true }] },
  })
  const rows = table.getRowModel().rows
  // TanStack Virtual manages its own mutable instance; React Compiler must not memoize it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })
  const virtualRows = virtualizer.getVirtualItems()
  const topSpace = virtualRows[0]?.start ?? 0
  const bottomSpace = virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0

  return (
    <Box>
      <Group gap="md" mb="md" align="center">
        <ThemeIcon size={40} radius="lg" variant="light" color="frc-blue"><IconTable size={20} stroke={1.5} /></ThemeIcon>
        <Box>
          <Text fw={700} c="slate.0">Raw Data Table</Text>
          <Text size="sm" c="slate.4">All observations with sortable columns</Text>
        </Box>
        <Badge color="frc-blue" variant="light" radius="md" ml="auto">{rows.length} rows</Badge>
      </Group>
      <Box ref={scrollRef} style={{ maxHeight: 520, overflow: 'auto' }}>
        <Table striped highlightOnHover withTableBorder withColumnBorders style={{ minWidth: 980, tableLayout: 'fixed' }}>
          <Table.Thead>
            {table.getHeaderGroups().map((group) => (
              <Table.Tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <Table.Th
                      key={header.id}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                      style={{ backgroundColor: 'var(--surface-base)' }}
                    >
                      {header.column.getCanSort() ? (
                        <Button
                          variant="subtle"
                          color="slate"
                          size="compact-xs"
                          onClick={() => header.column.toggleSorting(sorted === 'desc' ? false : true)}
                          rightSection={sorted === 'asc' ? <IconChevronUp size={12} /> : sorted === 'desc' ? <IconChevronDown size={12} /> : null}
                        >
                          <table.FlexRender header={header} />
                        </Button>
                      ) : <table.FlexRender header={header} />}
                    </Table.Th>
                  )
                })}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {topSpace > 0 && <Table.Tr aria-hidden="true"><Table.Td colSpan={columns.length} style={{ height: topSpace, padding: 0 }} /></Table.Tr>}
            {virtualRows.map((item) => {
              const row = rows[item.index]
              return (
                <Table.Tr key={row.id} style={{ height: ROW_HEIGHT }}>
                  {row.getAllCells().map((cell) => (
                    <Table.Td key={cell.id} style={{ overflow: 'hidden' }}><table.FlexRender cell={cell} /></Table.Td>
                  ))}
                </Table.Tr>
              )
            })}
            {bottomSpace > 0 && <Table.Tr aria-hidden="true"><Table.Td colSpan={columns.length} style={{ height: bottomSpace, padding: 0 }} /></Table.Tr>}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  )
}
