import type { ReactElement } from 'react'
import { memo, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  NumberFormatter,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconDownload, IconSearch } from '@tabler/icons-react'
import Papa from 'papaparse'
import { notifications } from '@mantine/notifications'
import { getEventTeams } from '../lib/api/tba'
import type { EventDocument, MatchDocument, ScoutingDataDocument } from '../lib/db/collections'
import {
  calculateCoverage,
  calculateTeamStats,
  calculateWeightedScore,
  detectOutliers,
} from '../lib/utils/analytics'
import type { TeamStats } from '../lib/utils/analytics'
import { ConsistencyRadar } from '../components/charts/ConsistencyRadar'
import { ScoreBreakdownChart } from '../components/charts/ScoreBreakdownChart'
import { TeamSparkline } from '../components/charts/TeamSparkline'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { useDatabaseStore } from '../stores/useDatabase'
import { useAnalyticsStore } from '../stores/useAnalyticsStore'
import type { TBATeam } from '../types/tba'

type SortKey = 'total' | 'auto' | 'teleop' | 'endgame' | 'consistency'

type TeamCardProps = {
  stats: TeamStats
  teamName: string
  trend: number[]
  onClick: () => void
}

const TeamCard = memo(function TeamCard({ stats, teamName, trend, onClick }: TeamCardProps): ReactElement {
  const consistencyColor = stats.stdDev <= 8 ? 'green' : stats.stdDev <= 16 ? 'yellow' : 'red'

  return (
    <Card withBorder radius="md" p="lg" onClick={onClick} style={{ cursor: 'pointer' }}>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={700}>Team {stats.teamNumber}</Text>
          <Badge color={consistencyColor}>σ {stats.stdDev.toFixed(1)}</Badge>
        </Group>
        <Text size="sm" c="dimmed" lineClamp={1}>
          {teamName}
        </Text>
        <SimpleGrid cols={2} spacing="xs">
          <Text size="sm">Auto: {stats.avgAuto.toFixed(1)}</Text>
          <Text size="sm">Teleop: {stats.avgTeleop.toFixed(1)}</Text>
          <Text size="sm">Endgame: {stats.avgEndgame.toFixed(1)}</Text>
          <Text size="sm" fw={600}>
            Total: {stats.avgTotal.toFixed(1)}
          </Text>
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          Matches scouted: {stats.matchesScouteed}
        </Text>
        <TeamSparkline data={trend} />
      </Stack>
    </Card>
  )
})

function downloadCsv(filename: string, data: Record<string, unknown>[]): void {
  const csv = Papa.unparse(data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function toTeamNumber(teamKey: string): number {
  const parsed = Number.parseInt(teamKey.replace('frc', ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function getMetricNotes(formData: Record<string, unknown>): string {
  const noteValues = Object.entries(formData)
    .filter(([key, value]) => /note|comment/i.test(key) && typeof value === 'string' && value.trim().length > 0)
    .map(([, value]) => String(value))
  return noteValues.join(' | ')
}

export function Analysis(): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const cachedStats = useAnalyticsStore((state) => state.statsByEvent)
  const setStatsForEvent = useAnalyticsStore((state) => state.setStatsForEvent)

  const [events, setEvents] = useState<EventDocument[]>([])
  const [matches, setMatches] = useState<MatchDocument[]>([])
  const [observations, setObservations] = useState<ScoutingDataDocument[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('total')
  const [search, setSearch] = useState<string>('')
  const [debouncedSearch] = useDebouncedValue(search, 200)
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null)
  const [teamMap, setTeamMap] = useState<Record<string, TBATeam>>({})
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [assignModalCell, setAssignModalCell] = useState<{ matchKey: string; teamKey: string } | null>(null)
  const [scoutOptions, setScoutOptions] = useState<Array<{ value: string; label: string; deviceId: string }>>([])
  const [selectedScoutId, setSelectedScoutId] = useState<string | null>(null)

  const [weights, setWeights] = useState({ auto: 30, teleop: 40, endgame: 20, consistency: 10, defense: 0 })
  const [manualPicklist, setManualPicklist] = useState<number[]>([])

  useEffect(() => {
    if (!db) {
      return
    }

    const subscription = db.collections.events.find().$.subscribe((docs) => {
      const typed = docs as EventDocument[]
      const sorted = [...typed].sort((a, b) => a.get('startDate').localeCompare(b.get('startDate')))
      setEvents(sorted)
      if (!selectedEventId && sorted.length > 0) {
        setSelectedEventId(sorted[sorted.length - 1].get('id'))
      }
    })

    return () => subscription.unsubscribe()
  }, [db, selectedEventId])

  useEffect(() => {
    if (!db || !selectedEventId) {
      setMatches([])
      setObservations([])
      return
    }

    setIsLoading(true)
    const matchesSub = db.collections.matches
      .find({ selector: { eventId: selectedEventId } })
      .$.
      subscribe((docs) => {
        const typedMatches = docs as MatchDocument[]
        setMatches(typedMatches)
      })

    const observationsSub = db.collections.scoutingData.find().$.subscribe((docs) => {
      const typed = docs as ScoutingDataDocument[]
      setObservations(typed)
      setIsLoading(false)
    })

    const scoutsSub = db.collections.scouts.find().$.subscribe((docs) => {
      const options = docs.map((doc) => ({
        value: doc.get('id'),
        label: doc.get('name'),
        deviceId: doc.get('deviceId'),
      }))
      setScoutOptions(options)
    })

    return () => {
      matchesSub.unsubscribe()
      observationsSub.unsubscribe()
      scoutsSub.unsubscribe()
    }
  }, [db, selectedEventId])

  useEffect(() => {
    if (!selectedEventId) {
      setTeamMap({})
      return
    }

    const apiKey = localStorage.getItem('tba_api_key')?.trim()
    if (!apiKey) {
      return
    }

    void getEventTeams(selectedEventId, apiKey)
      .then((teams) => {
        const mapped = teams.reduce<Record<string, TBATeam>>((acc, team) => {
          acc[team.key] = team
          return acc
        }, {})
        setTeamMap(mapped)
      })
      .catch(() => {
        notifications.show({
          color: 'yellow',
          title: 'Team names unavailable',
          message: 'Unable to fetch team names from TBA. Showing team numbers only.',
        })
      })
  }, [selectedEventId])

  const eventMatchKeys = useMemo(() => new Set(matches.map((match) => match.get('key'))), [matches])

  const eventObservations = useMemo(
    () => observations.filter((observation) => eventMatchKeys.has(observation.get('matchKey'))),
    [eventMatchKeys, observations],
  )

  const observationsByTeam = useMemo(() => {
    const grouped = new Map<number, ScoutingDataDocument[]>()
    eventObservations.forEach((observation) => {
      const teamNumber = Number.parseInt(observation.get('teamNumber'), 10)
      const existing = grouped.get(teamNumber) ?? []
      existing.push(observation)
      grouped.set(teamNumber, existing)
    })
    return grouped
  }, [eventObservations])

  const teamStats = useMemo(() => {
    if (!selectedEventId) {
      return []
    }

    if (cachedStats[selectedEventId]) {
      return cachedStats[selectedEventId]
    }

    const computed = Array.from(observationsByTeam.entries()).map(([, teamObservations]) => {
      const baseStats = calculateTeamStats(teamObservations)
      const key = `frc${baseStats.teamNumber}`
      return {
        ...baseStats,
        teamKey: key,
        teamName: teamMap[key]?.nickname || teamMap[key]?.name || `Team ${baseStats.teamNumber}`,
      }
    })

    setStatsForEvent(selectedEventId, computed)
    return computed
  }, [cachedStats, observationsByTeam, selectedEventId, setStatsForEvent, teamMap])

  const sortedFilteredStats = useMemo(() => {
    const lowered = debouncedSearch.trim().toLowerCase()
    const filtered = teamStats.filter(
      (stat) =>
        lowered.length === 0 ||
        stat.teamName.toLowerCase().includes(lowered) ||
        String(stat.teamNumber).includes(lowered),
    )

    return [...filtered].sort((a, b) => {
      if (sortBy === 'total') return b.avgTotal - a.avgTotal
      if (sortBy === 'auto') return b.avgAuto - a.avgAuto
      if (sortBy === 'teleop') return b.avgTeleop - a.avgTeleop
      if (sortBy === 'endgame') return b.avgEndgame - a.avgEndgame
      return a.stdDev - b.stdDev
    })
  }, [debouncedSearch, sortBy, teamStats])

  const selectedTeamStats = useMemo(
    () => teamStats.find((stats) => stats.teamKey === selectedTeamKey) ?? null,
    [selectedTeamKey, teamStats],
  )

  const selectedTeamObservations = useMemo(() => {
    if (!selectedTeamStats) {
      return []
    }

    return observationsByTeam.get(selectedTeamStats.teamNumber) ?? []
  }, [observationsByTeam, selectedTeamStats])

  const weightedScores = useMemo(() => {
    return teamStats.map((stat) => ({
      teamNumber: stat.teamNumber,
      teamName: stat.teamName,
      score: calculateWeightedScore(stat, weights),
    }))
  }, [teamStats, weights])

  const autoPicklist = useMemo(
    () => [...weightedScores].sort((a, b) => b.score - a.score).map((item) => item.teamNumber),
    [weightedScores],
  )

  useEffect(() => {
    setManualPicklist((current) => {
      const source = current.length > 0 ? current : autoPicklist
      const valid = source.filter((teamNumber) => autoPicklist.includes(teamNumber))
      const missing = autoPicklist.filter((teamNumber) => !valid.includes(teamNumber))
      return [...valid, ...missing]
    })
  }, [autoPicklist])

  const coveragePercent = useMemo(() => calculateCoverage(matches, eventObservations), [eventObservations, matches])

  const duplicateCount = useMemo(() => {
    const seen = new Map<string, number>()
    eventObservations.forEach((observation) => {
      const key = `${observation.get('matchKey')}:${observation.get('teamNumber')}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    })
    return Array.from(seen.values()).filter((value) => value > 1).length
  }, [eventObservations])

  const flaggedCount = useMemo(
    () => eventObservations.filter((observation) => observation.get('isNoShow') || observation.get('isBrokenRobot')).length,
    [eventObservations],
  )

  const outliers = useMemo(() => detectOutliers(eventObservations), [eventObservations])

  const trendByTeam = useMemo(() => {
    const trend = new Map<number, number[]>()
    observationsByTeam.forEach((teamObservations, teamNumber) => {
      const totals = teamObservations.map(
        (obs) => obs.get('autoScore') + obs.get('teleopScore') + obs.get('endgameScore'),
      )
      trend.set(teamNumber, totals)
    })
    return trend
  }, [observationsByTeam])

  const coverageMatrixTeams = useMemo(() => {
    const teams = new Set<string>()
    matches.forEach((match) => {
      match.get('redAlliance').forEach((team: string) => {
        teams.add(team)
      })
      match.get('blueAlliance').forEach((team: string) => {
        teams.add(team)
      })
    })
    return Array.from(teams).sort((a, b) => toTeamNumber(a) - toTeamNumber(b))
  }, [matches])

  const scoutedCells = useMemo(() => {
    const cells = new Set<string>()
    eventObservations.forEach((observation) => {
      cells.add(`${observation.get('matchKey')}:${observation.get('teamNumber')}`)
    })
    return cells
  }, [eventObservations])

  const eventOptions = events.map((event) => ({ value: event.get('id'), label: `${event.get('name')} (${event.get('season')})` }))

  const handlePicklistExport = (): void => {
    const rows = manualPicklist.map((teamNumber, index) => {
      const scoreRow = weightedScores.find((item) => item.teamNumber === teamNumber)
      return {
        rank: index + 1,
        teamNumber,
        name: scoreRow?.teamName ?? `Team ${teamNumber}`,
        weightedScore: scoreRow?.score.toFixed(2) ?? '0.00',
      }
    })

    downloadCsv('picklist.csv', rows)
  }

  const handleStatsExport = (): void => {
    const rows = teamStats.map((stat) => ({
      teamNumber: stat.teamNumber,
      teamName: stat.teamName,
      avgAuto: stat.avgAuto.toFixed(2),
      avgTeleop: stat.avgTeleop.toFixed(2),
      avgEndgame: stat.avgEndgame.toFixed(2),
      avgTotal: stat.avgTotal.toFixed(2),
      stdDev: stat.stdDev.toFixed(2),
      matchesScouted: stat.matchesScouteed,
      bestMatch: stat.bestMatch,
      worstMatch: stat.worstMatch,
    }))
    downloadCsv('team_stats.csv', rows)
  }

  const handleDataQualityExport = (): void => {
    const rows = outliers.map((observation) => ({
      id: observation.get('id'),
      matchKey: observation.get('matchKey'),
      teamNumber: observation.get('teamNumber'),
      auto: observation.get('autoScore'),
      teleop: observation.get('teleopScore'),
      endgame: observation.get('endgameScore'),
      isNoShow: observation.get('isNoShow'),
      isBrokenRobot: observation.get('isBrokenRobot'),
    }))
    downloadCsv('data_quality_report.csv', rows)
  }

  const movePick = (fromIndex: number, toIndex: number): void => {
    setManualPicklist((current) => {
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const assignScoutToCell = async (): Promise<void> => {
    if (!db || !assignModalCell || !selectedScoutId) {
      return
    }

    const scout = scoutOptions.find((option) => option.value === selectedScoutId)
    if (!scout) {
      return
    }

    const match = matches.find((item) => item.get('key') === assignModalCell.matchKey)
    if (!match) {
      return
    }

    const red = match.get('redAlliance')
    const blue = match.get('blueAlliance')
    const redIndex = red.indexOf(assignModalCell.teamKey)
    const blueIndex = blue.indexOf(assignModalCell.teamKey)

    let alliancePosition: 'red1' | 'red2' | 'red3' | 'blue1' | 'blue2' | 'blue3' | null = null
    if (redIndex >= 0 && redIndex <= 2) {
      alliancePosition = redIndex === 0 ? 'red1' : redIndex === 1 ? 'red2' : 'red3'
    } else if (blueIndex >= 0 && blueIndex <= 2) {
      alliancePosition = blueIndex === 0 ? 'blue1' : blueIndex === 1 ? 'blue2' : 'blue3'
    }

    if (!alliancePosition) {
      notifications.show({ color: 'red', title: 'Assignment failed', message: 'Could not determine alliance slot.' })
      return
    }

    await db.collections.assignments.upsert({
      id: `${assignModalCell.matchKey}:${assignModalCell.teamKey}:${selectedScoutId}`,
      eventKey: selectedEventId ?? '',
      matchKey: assignModalCell.matchKey,
      alliancePosition,
      teamKey: assignModalCell.teamKey,
      scoutId: selectedScoutId,
      deviceId: scout.deviceId,
      assignedAt: new Date().toISOString(),
    })

    notifications.show({ color: 'green', title: 'Scout assigned', message: 'Coverage gap assignment created.' })
    setAssignModalCell(null)
    setSelectedScoutId(null)
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Analysis Dashboard</Title>
        <Group>
          <Select
            label="Event"
            placeholder="Select event"
            data={eventOptions}
            value={selectedEventId}
            onChange={setSelectedEventId}
            searchable
            w={320}
          />
          <Button variant="light" leftSection={<IconDownload size={16} />} onClick={handleStatsExport}>
            Export Stats
          </Button>
        </Group>
      </Group>

      {isLoading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : !selectedEventId ? (
        <Card withBorder>
          <Text c="dimmed">No imported events found. Import an event first from Event Management.</Text>
        </Card>
      ) : (
        <Tabs defaultValue="overview">
          <Tabs.List>
            <Tabs.Tab value="overview">Team Overview</Tabs.Tab>
            <Tabs.Tab value="details">Team Details</Tabs.Tab>
            <Tabs.Tab value="picklist">Picklist Builder</Tabs.Tab>
            <Tabs.Tab value="quality">Data Quality</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            <Stack>
              <Group>
                <SegmentedControl
                  value={sortBy}
                  onChange={(value) => setSortBy(value as SortKey)}
                  data={[
                    { label: 'Total', value: 'total' },
                    { label: 'Auto', value: 'auto' },
                    { label: 'Teleop', value: 'teleop' },
                    { label: 'Endgame', value: 'endgame' },
                    { label: 'Consistency', value: 'consistency' },
                  ]}
                />
                <TextInput
                  leftSection={<IconSearch size={16} />}
                  placeholder="Search team number or name"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  w={280}
                />
              </Group>

              {sortedFilteredStats.length === 0 ? (
                <Card withBorder>
                  <Text c="dimmed">No scouting observations for this event yet.</Text>
                </Card>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                  {sortedFilteredStats.map((stats) => (
                    <TeamCard
                      key={stats.teamKey}
                      stats={stats}
                      teamName={stats.teamName}
                      trend={trendByTeam.get(stats.teamNumber) ?? []}
                      onClick={() => setSelectedTeamKey(stats.teamKey)}
                    />
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="details" pt="md">
            {selectedTeamStats ? (
              <Stack>
                <Group justify="space-between">
                  <Title order={4}>
                    Team {selectedTeamStats.teamNumber} · {selectedTeamStats.teamName}
                  </Title>
                  <Button variant="light" onClick={() => setSelectedTeamKey(null)}>
                    Clear Selection
                  </Button>
                </Group>

                <SimpleGrid cols={{ base: 1, md: 4 }}>
                  <Card withBorder><Text size="xs">Avg Auto</Text><Text fw={700}>{selectedTeamStats.avgAuto.toFixed(1)}</Text></Card>
                  <Card withBorder><Text size="xs">Avg Teleop</Text><Text fw={700}>{selectedTeamStats.avgTeleop.toFixed(1)}</Text></Card>
                  <Card withBorder><Text size="xs">Avg Endgame</Text><Text fw={700}>{selectedTeamStats.avgEndgame.toFixed(1)}</Text></Card>
                  <Card withBorder><Text size="xs">Avg Total</Text><Text fw={700}>{selectedTeamStats.avgTotal.toFixed(1)}</Text></Card>
                  <Card withBorder><Text size="xs">Best Match</Text><Text fw={700}>{selectedTeamStats.bestMatch.toFixed(1)}</Text></Card>
                  <Card withBorder><Text size="xs">Worst Match</Text><Text fw={700}>{selectedTeamStats.worstMatch.toFixed(1)}</Text></Card>
                  <Card withBorder><Text size="xs">Std Deviation</Text><Text fw={700}>{selectedTeamStats.stdDev.toFixed(1)}</Text></Card>
                  <Card withBorder><Text size="xs">Sample Size</Text><Text fw={700}>{selectedTeamStats.matchesScouteed}</Text></Card>
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, lg: 2 }}>
                  <Card withBorder>
                    <Text fw={600} mb="sm">Score Trend</Text>
                    <TrendLineChart
                      data={selectedTeamObservations.map((observation, index) => ({
                        match: index + 1,
                        total:
                          observation.get('autoScore') +
                          observation.get('teleopScore') +
                          observation.get('endgameScore'),
                      }))}
                    />
                  </Card>
                  <Card withBorder>
                    <Text fw={600} mb="sm">Auto / Teleop / Endgame</Text>
                    <ScoreBreakdownChart
                      auto={selectedTeamStats.avgAuto}
                      teleop={selectedTeamStats.avgTeleop}
                      endgame={selectedTeamStats.avgEndgame}
                    />
                  </Card>
                  <Card withBorder>
                    <Text fw={600} mb="sm">Consistency Analysis</Text>
                    <ConsistencyRadar
                      values={{
                        auto: selectedTeamStats.avgAuto,
                        teleop: selectedTeamStats.avgTeleop,
                        endgame: selectedTeamStats.avgEndgame,
                        consistencyScore: Math.max(0, 100 - selectedTeamStats.stdDev * 5),
                        ceiling: selectedTeamStats.bestMatch,
                      }}
                    />
                    <Text size="sm" c="dimmed">
                      Boom/Bust pattern: {selectedTeamStats.stdDev > 16 ? 'High variance' : 'Stable output'}
                    </Text>
                  </Card>
                  <Card withBorder>
                    <Text fw={600} mb="sm">Game-Specific Metrics</Text>
                    <Group>
                      {Object.entries(
                        selectedTeamObservations.reduce<Record<string, number>>((acc, observation) => {
                          const formData = observation.get('formData') as Record<string, unknown>
                          Object.entries(formData).forEach(([key, value]) => {
                            if (typeof value === 'number') {
                              acc[key] = (acc[key] ?? 0) + value
                            }
                          })
                          return acc
                        }, {}),
                      )
                        .slice(0, 12)
                        .map(([key, value]) => (
                          <Badge key={key} variant="light">{key}: {value}</Badge>
                        ))}
                    </Group>
                  </Card>
                </SimpleGrid>

                <Card withBorder>
                  <Text fw={600} mb="sm">Match History</Text>
                  <Table.ScrollContainer minWidth={700}>
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Match</Table.Th>
                          <Table.Th>Auto</Table.Th>
                          <Table.Th>Teleop</Table.Th>
                          <Table.Th>Endgame</Table.Th>
                          <Table.Th>Total</Table.Th>
                          <Table.Th>Notes</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {selectedTeamObservations.map((observation) => {
                          const total =
                            observation.get('autoScore') + observation.get('teleopScore') + observation.get('endgameScore')
                          const match = matches.find((item) => item.get('key') === observation.get('matchKey'))
                          return (
                            <Table.Tr key={observation.get('id')}>
                              <Table.Td>{match?.get('matchNumber') ?? observation.get('matchKey')}</Table.Td>
                              <Table.Td>{observation.get('autoScore')}</Table.Td>
                              <Table.Td>{observation.get('teleopScore')}</Table.Td>
                              <Table.Td>{observation.get('endgameScore')}</Table.Td>
                              <Table.Td>{total}</Table.Td>
                              <Table.Td>{getMetricNotes(observation.get('formData') as Record<string, unknown>) || '—'}</Table.Td>
                            </Table.Tr>
                          )
                        })}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </Card>
              </Stack>
            ) : (
              <Card withBorder>
                <Text c="dimmed">Pick a team from Team Overview to view details.</Text>
              </Card>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="picklist" pt="md">
            <Stack>
              <SimpleGrid cols={{ base: 1, md: 2, lg: 5 }}>
                <Stack gap={4}><Text size="sm">Auto weight</Text><Slider min={0} max={100} value={weights.auto} onChange={(value) => setWeights((w) => ({ ...w, auto: value }))} /></Stack>
                <Stack gap={4}><Text size="sm">Teleop weight</Text><Slider min={0} max={100} value={weights.teleop} onChange={(value) => setWeights((w) => ({ ...w, teleop: value }))} /></Stack>
                <Stack gap={4}><Text size="sm">Endgame weight</Text><Slider min={0} max={100} value={weights.endgame} onChange={(value) => setWeights((w) => ({ ...w, endgame: value }))} /></Stack>
                <Stack gap={4}><Text size="sm">Consistency weight</Text><Slider min={0} max={100} value={weights.consistency} onChange={(value) => setWeights((w) => ({ ...w, consistency: value }))} /></Stack>
                <Stack gap={4}><Text size="sm">Defense weight</Text><Slider min={0} max={100} value={weights.defense} onChange={(value) => setWeights((w) => ({ ...w, defense: value }))} /></Stack>
              </SimpleGrid>

              <Group justify="space-between">
                <Text size="sm" c="dimmed">Drag rows to manually reorder your final picklist.</Text>
                <Button leftSection={<IconDownload size={16} />} onClick={handlePicklistExport}>Export Picklist</Button>
              </Group>

              <ScrollArea h={500}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Rank</Table.Th>
                      <Table.Th>Team</Table.Th>
                      <Table.Th>Weighted Score</Table.Th>
                      <Table.Th>Tier</Table.Th>
                      <Table.Th>Move</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {manualPicklist.map((teamNumber, index) => {
                      const row = weightedScores.find((item) => item.teamNumber === teamNumber)
                      const tierColor = index < 8 ? 'green' : index < 16 ? 'blue' : 'yellow'
                      return (
                        <Table.Tr key={teamNumber}>
                          <Table.Td>{index + 1}</Table.Td>
                          <Table.Td>
                            Team {teamNumber} · {row?.teamName ?? ''}
                          </Table.Td>
                          <Table.Td>
                            <NumberFormatter value={row?.score ?? 0} decimalScale={2} fixedDecimalScale />
                          </Table.Td>
                          <Table.Td>
                            <Badge color={tierColor}>
                              {index < 8 ? 'First pick' : index < 16 ? 'Second pick' : 'Third pick'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Button size="xs" variant="light" disabled={index === 0} onClick={() => movePick(index, index - 1)}>
                                Up
                              </Button>
                              <Button
                                size="xs"
                                variant="light"
                                disabled={index === manualPicklist.length - 1}
                                onClick={() => movePick(index, index + 1)}
                              >
                                Down
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="quality" pt="md">
            <Stack>
              <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }}>
                <Card withBorder><Text size="xs">Total observations</Text><Text fw={700}>{eventObservations.length}</Text></Card>
                <Card withBorder><Text size="xs">Coverage %</Text><Text fw={700}>{coveragePercent.toFixed(1)}%</Text></Card>
                <Card withBorder><Text size="xs">Duplicate observations</Text><Text fw={700}>{duplicateCount}</Text></Card>
                <Card withBorder><Text size="xs">Flagged observations</Text><Text fw={700}>{flaggedCount}</Text></Card>
              </SimpleGrid>

              <Group justify="space-between">
                <Text fw={600}>Coverage Matrix</Text>
                <Button variant="light" leftSection={<IconDownload size={16} />} onClick={handleDataQualityExport}>
                  Export data quality report
                </Button>
              </Group>

              <ScrollArea h={360}>
                <Table withColumnBorders withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Team / Match</Table.Th>
                      {matches
                        .slice()
                        .sort((a, b) => a.get('matchNumber') - b.get('matchNumber'))
                        .map((match) => (
                          <Table.Th key={match.get('key')}>{match.get('matchNumber')}</Table.Th>
                        ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {coverageMatrixTeams.map((teamKey) => {
                      const teamNumber = toTeamNumber(teamKey)
                      return (
                        <Table.Tr key={teamKey}>
                          <Table.Td>Team {teamNumber}</Table.Td>
                          {matches
                            .slice()
                            .sort((a, b) => a.get('matchNumber') - b.get('matchNumber'))
                            .map((match) => {
                              const cellKey = `${match.get('key')}:${teamNumber}`
                              const hasData = scoutedCells.has(cellKey)
                              const inMatch =
                                match.get('redAlliance').includes(teamKey) || match.get('blueAlliance').includes(teamKey)
                              if (!inMatch) {
                                return <Table.Td key={cellKey} />
                              }

                              return (
                                <Table.Td key={cellKey}>
                                  <Button
                                    size="compact-xs"
                                    color={hasData ? 'green' : 'red'}
                                    variant="filled"
                                    onClick={() => !hasData && setAssignModalCell({ matchKey: match.get('key'), teamKey })}
                                  >
                                    {hasData ? '✓' : '!'}
                                  </Button>
                                </Table.Td>
                              )
                            })}
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>

              <Divider />
              <Text fw={600}>Outliers (&gt; 2σ from team mean)</Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Team</Table.Th>
                    <Table.Th>Match</Table.Th>
                    <Table.Th>Total</Table.Th>
                    <Table.Th>Flags</Table.Th>
                    <Table.Th>Action</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {outliers.slice(0, 50).map((observation) => {
                    const total =
                      observation.get('autoScore') + observation.get('teleopScore') + observation.get('endgameScore')
                    return (
                      <Table.Tr key={observation.get('id')}>
                        <Table.Td>{observation.get('teamNumber')}</Table.Td>
                        <Table.Td>{observation.get('matchKey')}</Table.Td>
                        <Table.Td>{total}</Table.Td>
                        <Table.Td>
                          {observation.get('isNoShow') || observation.get('isBrokenRobot') ? (
                            <Badge color="orange">Flagged</Badge>
                          ) : (
                            '—'
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="light" onClick={() => setSelectedTeamKey(`frc${observation.get('teamNumber')}`)}>
                            Review
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}

      <Modal
        opened={assignModalCell !== null}
        onClose={() => {
          setAssignModalCell(null)
          setSelectedScoutId(null)
        }}
        title="Assign scout to missing cell"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {assignModalCell ? `Match ${assignModalCell.matchKey} · Team ${toTeamNumber(assignModalCell.teamKey)}` : ''}
          </Text>
          <Select
            label="Scout"
            data={scoutOptions.map((option) => ({ value: option.value, label: option.label }))}
            value={selectedScoutId}
            onChange={setSelectedScoutId}
            placeholder="Pick scout"
          />
          <Button onClick={() => void assignScoutToCell()} disabled={!selectedScoutId}>
            Assign
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
