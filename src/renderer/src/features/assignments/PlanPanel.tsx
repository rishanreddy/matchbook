import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Alert, Box, Button, Card, Group, Menu, Modal, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconAlertTriangle, IconCalendarEvent, IconDownload, IconDots, IconSparkles, IconTrash } from '@tabler/icons-react'
import type { RosterScoutDocType } from '../../lib/db/schemas/roster.schema'
import type { Plan } from './assign'
import type { Coverage } from './coverage'

type PlanPanelProps = {
  matchCount: number
  coverage: Coverage
  availableScouts: number
  roster: readonly RosterScoutDocType[]
  buildPlan: (mode: 'fill' | 'rebuild') => Plan
  onApply: (plan: Plan, label: string) => Promise<void>
  onClearAll: () => Promise<void>
  onDownload: () => void
}

type Dialog = 'fill' | 'rebuild' | 'clear' | null

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

export function PlanPanel({ matchCount, coverage, availableScouts, roster, buildPlan, onApply, onClearAll, onDownload }: PlanPanelProps): ReactElement {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)

  const fillPlan = useMemo(() => buildPlan('fill'), [buildPlan])
  const rebuildPlan = useMemo(() => (dialog === 'rebuild' ? buildPlan('rebuild') : null), [buildPlan, dialog])
  const names = useMemo(() => new Map(roster.map((scout) => [scout.id, scout.name])), [roster])

  const plan = dialog === 'rebuild' ? rebuildPlan : fillPlan
  const receivedPercent = coverage.total === 0 ? 0 : (coverage.received / coverage.total) * 100
  const waitingPercent = coverage.total === 0 ? 0 : ((coverage.waiting + coverage.late) / coverage.total) * 100
  const nothingToPlan = matchCount === 0
  const canFill = !nothingToPlan && availableScouts > 0 && fillPlan.changes.length > 0

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
      setDialog(null)
    } finally {
      setBusy(false)
    }
  }

  const givenTo = plan
    ? Object.entries(plan.givenTo)
        .map(([id, count]) => ({ name: names.get(id) ?? 'Unknown scout', count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    : []

  return (
    <Card p="lg" radius="lg" className="surface-card" data-tour="assignments-plan">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={36} radius="md" variant="light">
              <IconCalendarEvent size={18} />
            </ThemeIcon>
            <Box>
              <Title order={3} size="h4" c="slate.0">
                Plan
              </Title>
              <Text size="xs" c="slate.4">
                {nothingToPlan ? 'No qualification matches for this event yet' : `${plural(matchCount, 'match', 'matches')}, six robots each`}
              </Text>
            </Box>
          </Group>

          <Group gap="sm">
            <Button leftSection={<IconSparkles size={16} />} onClick={() => setDialog('fill')} disabled={!canFill} fw={700}>
              Fill open stations
            </Button>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="default" rightSection={<IconDots size={16} />} aria-label="More plan actions">
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => setDialog('rebuild')} disabled={nothingToPlan || availableScouts === 0}>
                  Rebuild matches nobody has scouted…
                </Menu.Item>
                <Menu.Item leftSection={<IconDownload size={14} />} onClick={onDownload} disabled={coverage.assigned === 0}>
                  Download as a spreadsheet
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setDialog('clear')} disabled={coverage.assigned === 0}>
                  Clear all assignments…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {!nothingToPlan ? (
          <Stack gap={6}>
            <Group justify="space-between" gap="sm">
              <Text size="sm" c="slate.1">
                {coverage.covered.toLocaleString()} of {coverage.total.toLocaleString()} stations covered
                <Text span size="xs" c="slate.4">
                  {' '}
                  ({coverage.assigned.toLocaleString()} assigned{coverage.covered > coverage.assigned ? `, ${(coverage.covered - coverage.assigned).toLocaleString()} already scouted` : ''})
                </Text>
              </Text>
              <Text size="sm" c={coverage.open > 0 ? 'amber.4' : 'slate.3'}>
                {coverage.open === 0 ? 'Everything is covered' : `${plural(coverage.open, 'station is', 'stations are')} open`}
              </Text>
            </Group>
            <Progress.Root size="lg" aria-label="How much of the schedule is assigned and how much data has arrived">
              <Progress.Section value={receivedPercent} color="green" />
              <Progress.Section value={waitingPercent} color="amber" />
            </Progress.Root>
            <Group gap="md" wrap="wrap">
              <Text size="xs" c="slate.3">
                <Text span c="green.4" fw={600}>
                  {coverage.received.toLocaleString()}
                </Text>{' '}
                entries received
              </Text>
              <Text size="xs" c="slate.3">
                <Text span c="amber.4" fw={600}>
                  {coverage.waiting.toLocaleString()}
                </Text>{' '}
                waiting for data
              </Text>
              {coverage.late > 0 ? (
                <Text size="xs" c="red.4">
                  {plural(coverage.late, 'station is', 'stations are')} late: later matches have arrived without {coverage.late === 1 ? 'it' : 'them'}
                </Text>
              ) : null}
            </Group>
          </Stack>
        ) : null}

        {!nothingToPlan && availableScouts === 0 ? (
          <Text size="sm" c="slate.3">
            Add at least one available scout to start planning.
          </Text>
        ) : !nothingToPlan && !canFill && coverage.open === 0 ? (
          <Text size="sm" c="slate.3">
            Every station is assigned. Change one with its menu in the schedule below.
          </Text>
        ) : null}
      </Stack>

      <Modal opened={dialog === 'fill' || dialog === 'rebuild'} onClose={() => (busy ? undefined : setDialog(null))} title={dialog === 'rebuild' ? 'Rebuild the plan?' : 'Fill the open stations?'} centered size="lg">
        {plan ? (
          <Stack gap="md">
            {dialog === 'rebuild' ? (
              <Text size="sm">
                This starts over for every match nobody has scouted yet. Matches that already have an entry stay exactly as they are, and assignments you made by hand for later matches are replaced.
              </Text>
            ) : null}
            <Stack gap={4} component="ul" style={{ margin: 0, paddingLeft: 18 }}>
              {plan.filled > 0 ? <Text component="li" size="sm">{plural(plan.filled, 'open station gets', 'open stations get')} a scout.</Text> : null}
              {plan.moved > 0 ? (
                <Text component="li" size="sm">
                  {plural(plan.moved, 'station moves', 'stations move')} to someone else{dialog === 'fill' ? ', because its scout is away or has been removed and the match has not been scouted' : ''}.
                </Text>
              ) : null}
              {plan.changes.length === 0 ? <Text component="li" size="sm">Nothing needs to change.</Text> : null}
            </Stack>
            {plan.stillOpen > 0 ? (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title={`${plural(plan.stillOpen, 'station stays', 'stations stay')} open`}>
                {plan.availableScouts === 0
                  ? 'There are no available scouts.'
                  : `Only ${plural(plan.availableScouts, 'scout is', 'scouts are')} available and a match has six robots. The robots watched least so far are covered first, so no team is skipped all event. Add scouts to cover the rest.`}
              </Alert>
            ) : null}
            {givenTo.length > 0 ? (
              <Box>
                <Text size="sm" fw={600} c="slate.1" mb={4}>
                  Who gets how many
                </Text>
                <Group gap="xs" wrap="wrap">
                  {givenTo.map((item) => (
                    <Text key={item.name} size="xs" className="plan-chip">
                      {item.name} <Text span fw={700}>+{item.count}</Text>
                    </Text>
                  ))}
                </Group>
              </Box>
            ) : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDialog(null)} disabled={busy}>
                Cancel
              </Button>
              <Button loading={busy} disabled={plan.changes.length === 0} onClick={() => void run(() => onApply(plan, dialog === 'rebuild' ? 'Plan rebuilt' : 'Stations assigned'))}>
                {dialog === 'rebuild' ? 'Rebuild' : 'Assign'}
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal opened={dialog === 'clear'} onClose={() => (busy ? undefined : setDialog(null))} title="Clear every assignment?" centered>
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            All {coverage.assigned.toLocaleString()} assigned stations for this event become open, including ones you set by hand. Entries already scouted are not affected.
          </Alert>
          <Text size="sm" c="slate.3">
            Scouts’ laptops hear about it the next time they press Get form, schedule and matches.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDialog(null)} disabled={busy}>
              Keep them
            </Button>
            <Button color="red" loading={busy} onClick={() => void run(onClearAll)}>
              Clear all
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  )
}
