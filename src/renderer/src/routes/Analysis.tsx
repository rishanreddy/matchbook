import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Accordion, Alert, Box, Button, Drawer, Group, Loader, Modal, Select, SimpleGrid, Stack, Switch, Table, Tabs, Text, TextInput, Title } from '@mantine/core'
import { IconArrowsSort, IconChartBar, IconCloudUpload, IconSearch, IconTable, IconX } from '@tabler/icons-react'
import { useStore } from '@tanstack/react-store'
import { useNavigate } from 'react-router-dom'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { RawObservationsTable } from '../components/RawObservationsTable'
import { TeamComparisonChart, TeamMatchTrend } from '../features/analysis/AnalysisCharts'
import { TeamRankingsTable } from '../features/analysis/TeamRankingsTable'
import { useAnalysisData } from '../features/analysis/useAnalysisData'
import { analysisMetricDescription, applyAnalysisAggregation, buildAnalysisMetrics, chooseAnalysisMetric, discoverAnalysisFields, formatAnalysisValue, hasRecordedPhaseScores, rankAnalysisTeams, recordedTotal, resolveAnalysisEvent, SCORE_METRICS, summarizeAnalysisTeams, summarizeMetric, type AnalysisMetric } from '../lib/utils/analysis'
import { loadAnalysisFieldConfigsFromDatabase, type AnalysisFieldConfig } from '../lib/utils/analysisConfig'
import { handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'
import { analysisViewStore, resetAnalysisFilters, toggleComparisonTeam, updateAnalysisAggregation, updateAnalysisView } from '../stores/analysisViewStore'
import { useDatabaseStore } from '../stores/useDatabase'
import { useEventStore } from '../stores/useEventStore'

const EMPTY_CONFIGS: AnalysisFieldConfig[] = []

function displayAnswer(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not answered'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(displayAnswer).join(', ') || 'Not answered'
  return JSON.stringify(value)
}

function aggregationOptions(metric: AnalysisMetric): { value: string; label: string }[] {
  if (metric.kind === 'numericField') return [
    { value: 'average', label: 'Average answer' }, { value: 'max', label: 'Highest answer' },
    { value: 'min', label: 'Lowest answer' }, { value: 'sum', label: 'Total of answers' },
  ]
  if (metric.kind === 'booleanField') return [
    { value: 'truePercent', label: 'Percent answered Yes' }, { value: 'trueCount', label: 'Number answered Yes' },
    { value: 'responseCount', label: 'Number of answers' },
  ]
  return []
}

export function Analysis(): ReactElement {
  const navigate = useNavigate()
  const db = useDatabaseStore((state) => state.db)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const { observations: allObservations, events, activeForm, sourceLabels, loaded } = useAnalysisData()
  const view = useStore(analysisViewStore)
  const [savedConfigs, setSavedConfigs] = useState<{ formId: string; formUpdatedAt: string; fields: AnalysisFieldConfig[] } | null>(null)
  const [comparisonDialogEventId, setComparisonDialogEventId] = useState<string | null>(null)
  const [teamDetail, setTeamDetail] = useState<{ eventId: string; teamNumber: number } | null>(null)
  const eventId = resolveAnalysisEvent({ requestedEventId: view.selectedEventId, currentEventId, events, observations: allObservations })
  const observations = useMemo(() => eventId === 'all' ? allObservations : allObservations.filter((observation) => observation.eventId === eventId), [allObservations, eventId])
  const configs = savedConfigs?.formId === activeForm?.id && savedConfigs?.formUpdatedAt === activeForm?.updatedAt ? savedConfigs?.fields ?? EMPTY_CONFIGS : EMPTY_CONFIGS
  const aggregationContext = JSON.stringify([eventId, activeForm?.id ?? null, activeForm?.updatedAt ?? null])
  const aggregations = view.aggregations?.context === aggregationContext ? view.aggregations.values : null
  const fields = useMemo(() => discoverAnalysisFields(observations, activeForm?.surveyJson ?? null), [activeForm?.surveyJson, observations])
  const teams = useMemo(() => summarizeAnalysisTeams(observations), [observations])
  const phaseTotalsAvailable = hasRecordedPhaseScores(observations)
  const metrics = useMemo(() => buildAnalysisMetrics(fields, configs).map((metric) => applyAnalysisAggregation(metric, aggregations?.[metric.id])), [aggregations, configs, fields])
  const metric = chooseAnalysisMetric(metrics, observations, view.metricId)
  const rankedTeams = useMemo(() => rankAnalysisTeams(teams, metric, view.lowestFirst), [metric, teams, view.lowestFirst])
  const searchTerms = view.search.trim().split(/[\s,;]+/).filter(Boolean)
  const visibleTeams = rankedTeams.filter((team) => team.matchCount >= view.minimumMatches && (searchTerms.length === 0 || searchTerms.some((term) => String(team.teamNumber).includes(term))))
  const selectedNumbers = view.comparison?.eventId === eventId ? view.comparison.teamNumbers.filter((number) => teams.some((team) => team.teamNumber === number)) : []
  const comparisonTeams = rankedTeams.filter((team) => selectedNumbers.includes(team.teamNumber))
  const detailTeam = teamDetail?.eventId === eventId ? rankedTeams.find((team) => team.teamNumber === teamDetail.teamNumber) ?? null : null
  const fieldLabels = new Map(fields.map((field) => [field.name, field.title]))
  const eventLabels = useMemo(() => new Map(events.map((event) => [event.id, `${event.name} (${event.season})`])), [events])
  const getEventLabel = useCallback((id: string): string => eventLabels.get(id) ?? (id === 'none' ? 'No event selected' : id), [eventLabels])
  const getSourceLabel = useCallback((id: string): string => sourceLabels.get(id) ?? (id.trim() || 'Unknown scout'), [sourceLabels])
  const openTeam = useCallback((teamNumber: number): void => {
    logger.info('Team analysis opened', { eventId, teamNumber, metricId: metric.id }, 'analysis')
    setComparisonDialogEventId(null)
    setTeamDetail({ eventId, teamNumber })
  }, [eventId, metric.id])
  const toggleTeam = useCallback((teamNumber: number): void => toggleComparisonTeam(eventId, teamNumber), [eventId])
  const eventOptions = Array.from(new Set([...events.map((event) => event.id), ...allObservations.map((observation) => observation.eventId)]))
    .map((id) => ({ value: id, label: getEventLabel(id) }))
  const visibleTeamNumbers = new Set(visibleTeams.map((team) => team.teamNumber))
  const tableObservations = observations.filter((observation) => visibleTeamNumbers.has(observation.teamNumber)).map((observation) => ({ ...observation, totalScore: recordedTotal(observation) }))
  const hasFilters = view.search !== '' || view.minimumMatches > 0 || view.lowestFirst || view.metricId !== null || aggregations !== null
  const summaryOptions = aggregationOptions(metric)
  const multipleEvents = eventId === 'all' && new Set(observations.map((observation) => observation.eventId)).size > 1

  useEffect(() => {
    if (loaded) logger.debug('Analysis event scope summarized', { eventId, observationCount: observations.length, teamCount: teams.length, allObservationCount: allObservations.length }, 'analysis')
  }, [allObservations.length, eventId, loaded, observations.length, teams.length])

  useEffect(() => {
    if (!db || !activeForm) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const loadedConfigs = await loadAnalysisFieldConfigsFromDatabase(db, { formSchemaId: activeForm.id, formSchemaUpdatedAt: activeForm.updatedAt }, discoverAnalysisFields([], activeForm.surveyJson))
        if (!cancelled) setSavedConfigs({ formId: activeForm.id, formUpdatedAt: activeForm.updatedAt, fields: loadedConfigs })
      } catch (error: unknown) {
        if (!cancelled) handleError(error, 'Load analysis preferences')
      }
    }
    const subscription = db.collections.analysisConfigs.findOne('active').$.subscribe(() => { void load() })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [activeForm, db])

  return (
    <Box className="container-wide analysis-page">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" gap="md">
          <Box data-tour="analysis-overview">
            <Title order={1} c="slate.0" fz={28}>Analysis</Title>
            <Text c="slate.3" mt={4}>Find teams to compare. Open a team to see its matches and notes.</Text>
          </Box>
          <Group gap="xs">
            <RouteHelpModal title="Compare teams" description="Start with a ranked list, then check the observations behind it."
              steps={[
                { title: 'Choose the event and metric', description: 'The current event is selected automatically. Use Rank teams by to choose a phase or an answer from your scouting form.' },
                { title: 'Select teams to compare', description: 'Check two to four teams, then press Compare selected to see their numbers together.' },
                { title: 'Review matches and notes', description: 'Open a team number to see trends, scout notes, and the original answers. Check how many matches support an average.' },
              ]}
              tips={[{ text: 'Missing answers are shown as No data and do not count as zero.' }, { text: 'Phase totals are recorded activity counts. They are not official game points.' }]}
              tooltipLabel="How to compare teams" />
            <Button variant="default" leftSection={<IconCloudUpload size={16} />} onClick={() => navigate('/sync?tab=wifi')}>Receive data</Button>
          </Group>
        </Group>

        <Box className="analysis-controls">
          <Select label="Event" aria-label="Analysis event" value={eventId} allowDeselect={false} searchable
            data={[...eventOptions, { value: 'all', label: 'All events' }]}
            onChange={(value) => { if (value) { updateAnalysisView({ selectedEventId: value === currentEventId ? null : value, comparison: null, search: '', metricId: null }); setTeamDetail(null); setComparisonDialogEventId(null) } }} />
          <Select label="Rank teams by" value={metric.id} allowDeselect={false} searchable
            data={[
              { group: 'Recorded totals', items: metrics.filter((item) => item.kind === 'score' || item.kind === 'matches').map((item) => ({ value: item.id, label: item.label, disabled: item.kind === 'score' && !phaseTotalsAvailable && observations.length > 0 })) },
              { group: 'Scouting form answers', items: metrics.filter((item) => item.kind !== 'score' && item.kind !== 'matches').map((item) => ({ value: item.id, label: item.label })) },
            ]}
            onChange={(value) => { if (value) {
              logger.info('Analysis metric selected', { eventId, metricId: value }, 'analysis')
              updateAnalysisView({ metricId: value })
            } }} />
          <TextInput label="Find a team" placeholder="Team number" value={view.search} leftSection={<IconSearch size={16} />}
            onChange={(event) => updateAnalysisView({ search: event.currentTarget.value })}
            rightSection={view.search ? <Button variant="subtle" color="slate" size="compact-xs" aria-label="Clear team search" onClick={() => updateAnalysisView({ search: '' })}><IconX size={14} /></Button> : null} />
        </Box>

        {!loaded ? <Group justify="center" py="xl"><Loader size="sm" /><Text c="slate.3">Loading scouting data...</Text></Group> : observations.length === 0 ? (
          <Box className="analysis-empty">
            <IconChartBar size={36} stroke={1.5} />
            <Title order={2} fz={22} mt="md">{allObservations.length === 0 ? 'Nothing to analyze yet' : 'No scouting for this event yet'}</Title>
            <Text c="slate.3" maw={480} mt="sm">Receive observations from your scouts to see team rankings here. You can use Wi-Fi, QR codes, or a file.</Text>
            <Group mt="lg"><Button onClick={() => navigate('/sync?tab=wifi')} leftSection={<IconCloudUpload size={16} />}>Receive scout data</Button>
              {allObservations.length > 0 && <Button variant="default" onClick={() => updateAnalysisView({ selectedEventId: 'all' })}>Show other events</Button>}</Group>
          </Box>
        ) : (
          <>
            {multipleEvents && <Alert color="yellow" title="You are comparing data from multiple events">Choose one event for a fair comparison. Forms and recorded totals may differ between events.</Alert>}
            <Box className="analysis-ranking-panel">
              <Group className="analysis-ranking-heading" justify="space-between" align="flex-start" gap="sm">
                <Box>
                  <Title order={2} fz={19}>Team rankings</Title>
                  <Text size="sm" c="slate.3" mt={4}>{teams.length} teams with {observations.length} observations. Select up to 4 teams to compare.</Text>
                </Box>
                <Group gap="xs"><Button variant="subtle" color="slate" size="sm" leftSection={<IconArrowsSort size={16} />} onClick={() => updateAnalysisView({ lowestFirst: !view.lowestFirst })}>
                  {view.lowestFirst ? 'Lowest first' : 'Highest first'}
                </Button>
                <Button disabled={selectedNumbers.length < 2} size="sm" leftSection={<IconChartBar size={16} />} onClick={() => {
                  logger.info('Team comparison opened', { eventId, metricId: metric.id, teamNumbers: selectedNumbers }, 'analysis')
                  setComparisonDialogEventId(eventId)
                }}>Compare selected{selectedNumbers.length > 0 ? ` (${selectedNumbers.length})` : ''}</Button></Group>
              </Group>
              <Box className="analysis-metric-explanation">
                <Text size="sm" c="slate.3">{analysisMetricDescription(metric)}</Text>
                {summaryOptions.length > 0 && <Select label="Summarize answers" value={metric.kind === 'numericField' || metric.kind === 'booleanField' ? metric.aggregation : null}
                  data={summaryOptions} allowDeselect={false} size="xs" w={190} onChange={(value) => {
                    const changed = applyAnalysisAggregation(metric, value)
                    if (changed.kind === 'numericField' || changed.kind === 'booleanField') updateAnalysisAggregation(aggregationContext, changed.id, changed.aggregation)
                  }} />}
              </Box>
              <Group className="analysis-ranking-options" justify="space-between" gap="sm">
                <Switch label="Only teams with 3+ matches" checked={view.minimumMatches === 3} onChange={(event) => updateAnalysisView({ minimumMatches: event.currentTarget.checked ? 3 : 0 })} />
                <Group gap="xs"><Text size="xs" c="slate.4" role="status">{visibleTeams.length} of {teams.length} teams shown</Text>
                  {hasFilters && <Button variant="subtle" color="slate" size="compact-xs" onClick={resetAnalysisFilters}>Reset filters</Button>}</Group>
              </Group>
              {selectedNumbers.length > 0 && <Group className="analysis-comparison-bar" justify="space-between" gap="sm">
                <Text size="sm" fw={500} role="status">Selected teams: {selectedNumbers.join(', ')}</Text>
                <Button variant="subtle" color="slate" size="compact-sm" onClick={() => updateAnalysisView({ comparison: null })}>Clear selection</Button>
              </Group>}
              {visibleTeams.length > 0 ? <TeamRankingsTable teams={visibleTeams} metric={metric} selectedTeams={selectedNumbers} onToggleTeam={toggleTeam} onOpenTeam={openTeam} /> : (
                <Stack align="center" py="xl" gap="sm"><Text fw={600}>No teams match these filters</Text><Button variant="default" onClick={resetAnalysisFilters}>Reset filters</Button></Stack>
              )}
              <Text className="analysis-ranking-footer" size="xs" c="slate.3">Choose at least 2 teams to compare. Check match coverage before judging an average.</Text>
            </Box>

            <Accordion variant="default" className="analysis-observations-panel">
              <Accordion.Item value="observations"><Accordion.Control icon={<IconTable size={18} />}>Review individual observations</Accordion.Control><Accordion.Panel>
                <RawObservationsTable observations={tableObservations} metric={metric} getDeviceDisplayLabel={getSourceLabel} getEventLabel={getEventLabel} showEvent={eventId === 'all'} />
              </Accordion.Panel></Accordion.Item>
            </Accordion>
          </>
        )}
      </Stack>

      <Modal opened={comparisonDialogEventId === eventId && comparisonTeams.length >= 2} onClose={() => setComparisonDialogEventId(null)} size="xl" title="Compare selected teams" centered>
        <Stack gap="lg">
          <Box><Text fw={600}>{metric.label}</Text><Text size="sm" c="slate.3" mt={4}>{analysisMetricDescription(metric)}</Text></Box>
          <TeamComparisonChart teams={comparisonTeams} metric={metric} />
          <Table.ScrollContainer minWidth={480}><Table aria-label="Team comparison" withRowBorders>
            <Table.Thead><Table.Tr><Table.Th>Metric</Table.Th>{comparisonTeams.map((team) => <Table.Th key={team.teamNumber}><Button variant="subtle" color="slate" size="compact-sm" onClick={() => openTeam(team.teamNumber)}>Team {team.teamNumber}</Button></Table.Th>)}</Table.Tr></Table.Thead>
            <Table.Tbody>
              <Table.Tr className="analysis-selected-metric"><Table.Th scope="row">{metric.label}</Table.Th>{comparisonTeams.map((team) => <Table.Td key={team.teamNumber}><Text fw={600} className="mono-number">{formatAnalysisValue(team.metric)}</Text>{team.metric.kind === 'percentage' && <Text size="xs" c="slate.3">{team.metric.yesCount} Yes / {team.metric.sampleCount} answers</Text>}{team.metric.kind === 'number' && metric.kind !== 'score' && metric.kind !== 'matches' && <Text size="xs" c="slate.3">{team.metric.sampleCount} answers</Text>}</Table.Td>)}</Table.Tr>
              {SCORE_METRICS.filter((item) => item.id !== metric.id && (item.kind === 'matches' || phaseTotalsAvailable)).map((item) => <Table.Tr key={item.id}><Table.Th scope="row">{item.label}</Table.Th>{comparisonTeams.map((team) => <Table.Td key={team.teamNumber} className="mono-number">{formatAnalysisValue(summarizeMetric(team.observations, item))}</Table.Td>)}</Table.Tr>)}
              <Table.Tr><Table.Th scope="row">Observations</Table.Th>{comparisonTeams.map((team) => <Table.Td key={team.teamNumber} className="mono-number">{team.observations.length}</Table.Td>)}</Table.Tr>
            </Table.Tbody>
          </Table></Table.ScrollContainer>
          <Text size="sm" c="slate.3">Check match coverage before choosing a partner. Open a team above to read the scouts' notes.</Text>
        </Stack>
      </Modal>

      <Drawer opened={detailTeam !== null} onClose={() => setTeamDetail(null)} position="right" size="lg" title={detailTeam ? `Team ${detailTeam.teamNumber}` : 'Team details'}>
        {detailTeam && <Stack gap="lg">
          <Text size="sm" c="slate.3">{eventId === 'all' ? 'All events' : getEventLabel(eventId)}</Text>
          <SimpleGrid cols={3} className="analysis-team-summary">
            <Box><Text size="xs" c="slate.3">{metric.label}</Text><Text fz={24} fw={600} className="mono-number">{formatAnalysisValue(detailTeam.metric)}</Text></Box>
            <Box><Text size="xs" c="slate.3">Matches</Text><Text fz={24} fw={600} className="mono-number">{detailTeam.matchCount}</Text></Box>
            <Box><Text size="xs" c="slate.3">Observations</Text><Text fz={24} fw={600} className="mono-number">{detailTeam.observations.length}</Text></Box>
          </SimpleGrid>
          <Tabs defaultValue="matches">
            <Tabs.List><Tabs.Tab value="matches">Matches</Tabs.Tab><Tabs.Tab value="notes">Scout notes</Tabs.Tab><Tabs.Tab value="answers">Form answers</Tabs.Tab></Tabs.List>
            <Tabs.Panel value="matches" pt="md"><Stack gap="md">
              {new Set(detailTeam.observations.map((observation) => observation.eventId)).size === 1 && detailTeam.matchCount > 0 && metric.kind !== 'matches' && <Box>
                <Text size="sm" fw={600}>{metric.label} by match</Text>
                <TeamMatchTrend observations={detailTeam.observations} metric={metric} teamNumber={detailTeam.teamNumber} />
              </Box>}
              <RawObservationsTable variant="team" observations={detailTeam.observations.map((observation) => ({ ...observation, totalScore: recordedTotal(observation) }))} metric={metric} getDeviceDisplayLabel={getSourceLabel} getEventLabel={getEventLabel} showEvent={eventId === 'all'} />
            </Stack></Tabs.Panel>
            <Tabs.Panel value="notes" pt="md"><Stack gap="md">
              {detailTeam.observations.filter((observation) => observation.notes.trim()).length === 0 ? <Text c="slate.3">No scout notes recorded for this team.</Text> : detailTeam.observations.filter((observation) => observation.notes.trim()).map((observation) => <Box key={observation.id} className="analysis-scout-note">
                <Group justify="space-between"><Text size="sm" fw={600}>Match {observation.matchNumber || 'unnumbered'}</Text><Text size="xs" c="slate.4">{getSourceLabel(observation.deviceId)}</Text></Group>
                {eventId === 'all' && <Text size="xs" c="slate.4">{getEventLabel(observation.eventId)}</Text>}
                <Text mt="sm" style={{ whiteSpace: 'pre-wrap' }}>{observation.notes}</Text>
              </Box>)}
            </Stack></Tabs.Panel>
            <Tabs.Panel value="answers" pt="md"><Accordion variant="default">
              {detailTeam.observations.map((observation) => <Accordion.Item key={observation.id} value={observation.id}><Accordion.Control>
                <Text size="sm">Match {observation.matchNumber || 'unnumbered'}</Text><Text size="xs" c="slate.4">{getSourceLabel(observation.deviceId)}{eventId === 'all' ? `, ${getEventLabel(observation.eventId)}` : ''}</Text>
              </Accordion.Control><Accordion.Panel>
                {Object.keys(observation.formData).filter((name) => !name.startsWith('_')).length === 0 ? <Text size="sm" c="slate.3">No form answers saved in this observation.</Text> : <Table aria-label={`Form answers for match ${observation.matchNumber}`}><Table.Tbody>
                  {Object.entries(observation.formData).filter(([name]) => !name.startsWith('_')).map(([name, value]) => <Table.Tr key={name}><Table.Th w="50%">{fieldLabels.get(name) ?? name}</Table.Th><Table.Td style={{ overflowWrap: 'anywhere' }}>{displayAnswer(value)}</Table.Td></Table.Tr>)}
                </Table.Tbody></Table>}
              </Accordion.Panel></Accordion.Item>)}
            </Accordion></Tabs.Panel>
          </Tabs>
          <Button variant="default" onClick={() => navigate(`/entries?event=${encodeURIComponent(eventId)}&team=${detailTeam.teamNumber}`)}>Review or correct these entries</Button>
        </Stack>}
      </Drawer>
    </Box>
  )
}
