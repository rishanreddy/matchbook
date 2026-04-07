import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  useMantineTheme,
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { IconChartBar, IconChartDots, IconChevronDown, IconChevronUp, IconSearch, IconSettings, IconTable, IconTarget } from '@tabler/icons-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { TeamSparkline } from '../components/charts/TeamSparkline'
import type { ScoutingDataDocument } from '../lib/db/collections'
import type { EventDocType } from '../lib/db/schemas/events.schema'
import type { FormSchemaDocType } from '../lib/db/schemas/formSchemas.schema'
import {
  type AnalysisAggregation,
  type AnalysisChartType,
  type AnalysisFieldConfig,
  extractSurveyAnalysisFields,
  loadAnalysisFieldConfigsFromDatabase,
} from '../lib/utils/analysisConfig'
import { handleError } from '../lib/utils/errorHandler'
import { useDatabaseStore } from '../stores/useDatabase'

type Observation = {
  teamNumber: number
  matchNumber: number
  timestamp: string
  autoScore: number
  teleopScore: number
  endgameScore: number
  notes: string
  deviceId: string
  formData: Record<string, unknown>
}

type TeamStats = {
  teamNumber: number
  avgAuto: number
  avgTeleop: number
  avgEndgame: number
  avgTotal: number
  matchCount: number
  scores: number[]
  consistency: number
}

type SortKey = 'total' | 'auto' | 'teleop' | 'endgame' | 'matches'

type TeamFieldPoint = {
  teamNumber: number
  value: number
}

type CustomFieldMetric = {
  fieldName: string
  fieldLabel: string
  chartType: AnalysisChartType
  aggregation: AnalysisAggregation
  valueKind: AnalysisFieldConfig['valueKind']
  points: TeamFieldPoint[]
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function hasResponse(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return true
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const avg = average(values)
  const squareDiffs = values.map((value) => (value - avg) ** 2)
  return Math.sqrt(average(squareDiffs))
}

function toObservation(doc: ScoutingDataDocument): Observation {
  return {
    teamNumber: doc.get('teamNumber'),
    matchNumber: doc.get('matchNumber'),
    timestamp: doc.get('timestamp'),
    autoScore: doc.get('autoScore'),
    teleopScore: doc.get('teleopScore'),
    endgameScore: doc.get('endgameScore'),
    notes: doc.get('notes'),
    deviceId: doc.get('deviceId'),
    formData: doc.get('formData'),
  }
}

function calculateTeamStats(observations: Observation[]): Map<number, TeamStats> {
  const byTeam = new Map<number, Observation[]>()

  observations.forEach((observation) => {
    const existing = byTeam.get(observation.teamNumber) ?? []
    existing.push(observation)
    byTeam.set(observation.teamNumber, existing)
  })

  const stats = new Map<number, TeamStats>()

  byTeam.forEach((teamObservations, teamNumber) => {
    const autoScores = teamObservations.map((obs) => obs.autoScore)
    const teleopScores = teamObservations.map((obs) => obs.teleopScore)
    const endgameScores = teamObservations.map((obs) => obs.endgameScore)
    const totals = teamObservations.map((obs) => obs.autoScore + obs.teleopScore + obs.endgameScore)

    const stdDev = standardDeviation(totals)
    const maxPossibleStdDev = 100
    const consistency = Math.max(0, 100 - (stdDev / maxPossibleStdDev) * 100)

    stats.set(teamNumber, {
      teamNumber,
      avgAuto: average(autoScores),
      avgTeleop: average(teleopScores),
      avgEndgame: average(endgameScores),
      avgTotal: average(totals),
      matchCount: teamObservations.length,
      scores: totals,
      consistency,
    })
  })

  return stats
}

function aggregateCustomField(teamObservations: Observation[], config: AnalysisFieldConfig): number {
  const rawValues = teamObservations.map((obs) => obs.formData[config.fieldName])

  if (config.aggregation === 'responseCount') {
    return rawValues.filter((value) => hasResponse(value)).length
  }

  if (config.aggregation === 'trueCount') {
    return rawValues.filter((value) => value === true).length
  }

  const numericValues = rawValues
    .map((value) => asNumber(value))
    .filter((value): value is number => value !== null)

  if (numericValues.length === 0) {
    return 0
  }

  if (config.aggregation === 'sum') {
    return numericValues.reduce((sum, value) => sum + value, 0)
  }

  if (config.aggregation === 'min') {
    return Math.min(...numericValues)
  }

  if (config.aggregation === 'max') {
    return Math.max(...numericValues)
  }

  return average(numericValues)
}

function calculateCustomFieldMetrics(observations: Observation[], configs: AnalysisFieldConfig[]): CustomFieldMetric[] {
  if (observations.length === 0) {
    return []
  }

  const byTeam = new Map<number, Observation[]>()
  observations.forEach((observation) => {
    const existing = byTeam.get(observation.teamNumber) ?? []
    existing.push(observation)
    byTeam.set(observation.teamNumber, existing)
  })

  return configs
    .filter((config) => config.enabled)
    .map((config) => {
      const points = Array.from(byTeam.entries())
        .map(([teamNumber, teamObservations]) => ({
          teamNumber,
          value: aggregateCustomField(teamObservations, config),
        }))
        .sort((a, b) => a.teamNumber - b.teamNumber)

      return {
        fieldName: config.fieldName,
        fieldLabel: config.fieldLabel,
        chartType: config.chartType,
        aggregation: config.aggregation,
        valueKind: config.valueKind,
        points,
      }
    })
}

function getAggregationLabel(aggregation: AnalysisAggregation): string {
  switch (aggregation) {
    case 'sum':
      return 'Sum'
    case 'min':
      return 'Minimum'
    case 'max':
      return 'Maximum'
    case 'trueCount':
      return 'True Count'
    case 'responseCount':
      return 'Response Count'
    default:
      return 'Average'
  }
}

type TeamRadarChartProps = {
  stats: TeamStats
  maxValues: {
    avgAuto: number
    avgTeleop: number
    avgEndgame: number
    avgTotal: number
    matchCount: number
  }
}

function TeamRadarChart({ stats, maxValues }: TeamRadarChartProps): ReactElement {
  const theme = useMantineTheme()
  const accent = theme.colors['frc-blue']?.[5] ?? theme.colors.blue[5]

  const normalizeToScale = (value: number, max: number): number => {
    if (max === 0) {
      return 0
    }
    return Math.min(100, (value / max) * 100)
  }

  const radarData = [
    {
      metric: 'Auto',
      value: normalizeToScale(stats.avgAuto, maxValues.avgAuto),
      actualValue: stats.avgAuto,
    },
    {
      metric: 'Teleop',
      value: normalizeToScale(stats.avgTeleop, maxValues.avgTeleop),
      actualValue: stats.avgTeleop,
    },
    {
      metric: 'Endgame',
      value: normalizeToScale(stats.avgEndgame, maxValues.avgEndgame),
      actualValue: stats.avgEndgame,
    },
    {
      metric: 'Total',
      value: normalizeToScale(stats.avgTotal, maxValues.avgTotal),
      actualValue: stats.avgTotal,
    },
    {
      metric: 'Consistency',
      value: stats.consistency,
      actualValue: stats.consistency,
    },
    {
      metric: 'Matches',
      value: normalizeToScale(stats.matchCount, maxValues.matchCount),
      actualValue: stats.matchCount,
    },
  ]

  const tooltipProps = {
    wrapperStyle: {
      pointerEvents: 'none' as const,
      zIndex: 1000,
      outline: 'none',
      backgroundColor: 'transparent',
    },
    contentStyle: {
      backgroundColor: 'rgba(22, 27, 34, 0.96)',
      border: '1px solid rgba(101, 132, 171, 0.35)',
      borderRadius: 8,
      boxShadow: '0 8px 26px rgba(0, 0, 0, 0.36)',
      padding: '8px 12px',
    },
    itemStyle: {
      color: '#f1f5f9',
      fontSize: 12,
    },
    labelStyle: {
      color: '#94a3b8',
      fontWeight: 600,
      marginBottom: 4,
    },
  }

  return (
    <Box h={240} w="100%">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={radarData}>
          <PolarGrid stroke="rgba(148, 163, 184, 0.2)" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: 'rgba(241, 245, 249, 0.85)', fontSize: 11, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: 'rgba(148, 163, 184, 0.6)', fontSize: 10 }}
          />
          <Radar
            name="Performance"
            dataKey="value"
            stroke={accent}
            fill={accent}
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip
            {...tooltipProps}
            cursor={false}
            formatter={(_value, _name, props) => {
              const actualValue = (props.payload as { actualValue: number; metric: string }).actualValue
              const metric = (props.payload as { actualValue: number; metric: string }).metric
              return [actualValue.toFixed(1), metric]
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </Box>
  )
}

function FieldMetricChart({ metric }: { metric: CustomFieldMetric }): ReactElement {
  const theme = useMantineTheme()
  const chartData = metric.points.map((point) => ({
    team: String(point.teamNumber),
    value: Number(point.value.toFixed(2)),
  }))

  const accent = theme.colors['frc-blue']?.[5] ?? theme.colors.blue[5]
  const accentLight = theme.colors['frc-blue']?.[4] ?? theme.colors.blue[4]

  const tooltipProps = {
    wrapperStyle: {
      pointerEvents: 'none' as const,
      zIndex: 1000,
      outline: 'none',
      backgroundColor: 'transparent',
    },
    contentStyle: {
      backgroundColor: 'rgba(22, 27, 34, 0.96)',
      border: '1px solid rgba(101, 132, 171, 0.35)',
      borderRadius: 8,
      boxShadow: '0 8px 26px rgba(0, 0, 0, 0.36)',
      padding: '8px 12px',
    },
    itemStyle: {
      color: '#f1f5f9',
      fontSize: 12,
    },
    labelStyle: {
      color: '#94a3b8',
      fontWeight: 600,
      marginBottom: 4,
    },
  }

  if (metric.chartType === 'line') {
    return (
      <Box h={220}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
            <XAxis dataKey="team" tick={{ fill: 'rgba(148, 163, 184, 0.8)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(148, 163, 184, 0.8)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipProps} cursor={false} />
            <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2.2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    )
  }

  if (metric.chartType === 'area') {
    return (
      <Box h={220}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={`metric-${metric.fieldName}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentLight} stopOpacity={0.55} />
                <stop offset="100%" stopColor={accentLight} stopOpacity={0.06} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
            <XAxis dataKey="team" tick={{ fill: 'rgba(148, 163, 184, 0.8)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(148, 163, 184, 0.8)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipProps} cursor={false} />
            <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2.2} fill={`url(#metric-${metric.fieldName})`} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    )
  }

  return (
    <Box h={220}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
          <XAxis dataKey="team" tick={{ fill: 'rgba(148, 163, 184, 0.8)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'rgba(148, 163, 184, 0.8)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipProps} cursor={false} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={accent} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  )
}

export function Analysis(): ReactElement {
  const navigate = useNavigate()
  const db = useDatabaseStore((state) => state.db)
  const [observations, setObservations] = useState<Observation[]>([])
  const [events, setEvents] = useState<EventDocType[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [activeFormSchema, setActiveFormSchema] = useState<FormSchemaDocType | null>(null)
  const [deviceNameById, setDeviceNameById] = useState<Map<string, string>>(new Map())
  const [scoutNameByDeviceId, setScoutNameByDeviceId] = useState<Map<string, string>>(new Map())
  const [sortBy, setSortBy] = useState<SortKey>('total')
  const [search, setSearch] = useState('')
  const [analysisFieldConfigs, setAnalysisFieldConfigs] = useState<AnalysisFieldConfig[]>([])
  const [debouncedSearch] = useDebouncedValue(search, 200)
  const [expandedTeams, setExpandedTeams] = useState<Set<number>>(new Set())
  const [tableSortBy, setTableSortBy] = useState<'team' | 'match' | 'auto' | 'teleop' | 'endgame' | 'total' | 'timestamp'>('timestamp')
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (!db) {
      return
    }

    let subscription: { unsubscribe: () => void } | null = null

    if (selectedEventId && selectedEventId !== 'all') {
      subscription = db.collections.scoutingData
        .find({
          selector: { eventId: selectedEventId },
        })
        .$.subscribe((docs) => {
          const normalized = (docs as ScoutingDataDocument[]).map((doc) => toObservation(doc))
          setObservations(normalized)
        })
    } else {
      subscription = db.collections.scoutingData.find().$.subscribe((docs) => {
        const normalized = (docs as ScoutingDataDocument[]).map((doc) => toObservation(doc))
        setObservations(normalized)
      })
    }

    return () => subscription?.unsubscribe()
  }, [db, selectedEventId])

  useEffect(() => {
    if (!db) {
      return
    }

    let cancelled = false

    const loadDeviceMetadata = async (): Promise<void> => {
      try {
        const [deviceDocs, scoutDocs] = await Promise.all([
          db.collections.devices.find().exec(),
          db.collections.scouts.find().exec(),
        ])

        if (cancelled) {
          return
        }

        const nextDeviceNameById = new Map<string, string>()
        deviceDocs.forEach((doc) => {
          nextDeviceNameById.set(String(doc.get('id')), String(doc.get('name')))
        })

        const nextScoutNameByDeviceId = new Map<string, string>()
        scoutDocs.forEach((doc) => {
          nextScoutNameByDeviceId.set(String(doc.get('deviceId')), String(doc.get('name')))
        })

        setDeviceNameById(nextDeviceNameById)
        setScoutNameByDeviceId(nextScoutNameByDeviceId)
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'Load device metadata for analysis')
        }
      }
    }

    void loadDeviceMetadata()

    return () => {
      cancelled = true
    }
  }, [db])

  useEffect(() => {
    if (!db) {
      return
    }

    let cancelled = false

    const loadActiveSchema = async (): Promise<void> => {
      try {
        const docs = await db.collections.formSchemas
          .find({
            selector: { isActive: true },
            sort: [
              { updatedAt: 'desc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            limit: 1,
          })
          .exec()

        if (!cancelled) {
          setActiveFormSchema(docs[0]?.toJSON() ?? null)
        }
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'Load active form for analysis')
        }
      }
    }

    const loadEvents = async (): Promise<void> => {
      try {
        const eventDocs = await db.collections.events
          .find({
            sort: [{ startDate: 'desc' }],
          })
          .exec()
        
        if (!cancelled) {
          setEvents(eventDocs.map((doc) => doc.toJSON()))
        }
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'Load events')
        }
      }
    }

    void loadActiveSchema()
    void loadEvents()

    return () => {
      cancelled = true
    }
  }, [db])

  const teamStats = useMemo(() => calculateTeamStats(observations), [observations])

  const sortedTeams = useMemo(() => {
    const teams = Array.from(teamStats.values())
    const filtered = debouncedSearch
      ? teams.filter((team) => String(team.teamNumber).includes(debouncedSearch))
      : teams

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'auto':
          return b.avgAuto - a.avgAuto
        case 'teleop':
          return b.avgTeleop - a.avgTeleop
        case 'endgame':
          return b.avgEndgame - a.avgEndgame
        case 'matches':
          return b.matchCount - a.matchCount
        default:
          return b.avgTotal - a.avgTotal
      }
    })
  }, [debouncedSearch, sortBy, teamStats])

  const groupedObservationsByTeam = useMemo(() => {
    const grouped = new Map<number, Observation[]>()

    observations.forEach((observation) => {
      const existing = grouped.get(observation.teamNumber) ?? []
      existing.push(observation)
      grouped.set(observation.teamNumber, existing)
    })

    grouped.forEach((teamObservations, teamNumber) => {
      const sorted = [...teamObservations].sort((a, b) => {
        if (a.matchNumber !== b.matchNumber) {
          return a.matchNumber - b.matchNumber
        }
        return a.timestamp.localeCompare(b.timestamp)
      })
      grouped.set(teamNumber, sorted)
    })

    return grouped
  }, [observations])

  const getDeviceDisplayLabel = useCallback((deviceId: string): string => {
    const normalizedDeviceId = deviceId?.trim() ?? ''
    if (!normalizedDeviceId) {
      return 'Unknown'
    }

    const scoutName = scoutNameByDeviceId.get(normalizedDeviceId)
    const deviceName = deviceNameById.get(normalizedDeviceId)

    if (scoutName && deviceName) {
      return `${scoutName} (${deviceName})`
    }

    if (scoutName) {
      return scoutName
    }

    if (deviceName) {
      return deviceName
    }

    return normalizedDeviceId
  }, [deviceNameById, scoutNameByDeviceId])

  const provenanceSummaryByTeam = useMemo(() => {
    const summary = new Map<number, string>()

    groupedObservationsByTeam.forEach((teamObservations, teamNumber) => {
      const counts = new Map<string, number>()
      const distinctDeviceIds = new Set<string>()

      teamObservations.forEach((observation) => {
        const normalizedDeviceId = observation.deviceId?.trim() ?? ''
        distinctDeviceIds.add(normalizedDeviceId || 'Unknown')
        const label = getDeviceDisplayLabel(normalizedDeviceId)
        counts.set(label, (counts.get(label) ?? 0) + 1)
      })

      if (counts.size === 0) {
        summary.set(teamNumber, 'Sources: Unknown')
        return
      }

      const topLabels = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label]) => label)

      const details = topLabels.length > 0 ? topLabels.join(', ') : 'Unknown'
      summary.set(teamNumber, `Sources (${distinctDeviceIds.size}): ${details}`)
    })

    return summary
  }, [getDeviceDisplayLabel, groupedObservationsByTeam])

  const toggleTeamExpanded = useCallback((teamNumber: number): void => {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamNumber)) {
        next.delete(teamNumber)
      } else {
        next.add(teamNumber)
      }
      return next
    })
  }, [])

  const allObservationsFlat = useMemo(() => {
    return [...observations].map((obs) => ({
      ...obs,
      totalScore: obs.autoScore + obs.teleopScore + obs.endgameScore,
    }))
  }, [observations])

  const sortedTableObservations = useMemo(() => {
    const sorted = [...allObservationsFlat]
    
    sorted.sort((a, b) => {
      let comparison = 0
      
      switch (tableSortBy) {
        case 'team':
          comparison = a.teamNumber - b.teamNumber
          break
        case 'match':
          comparison = a.matchNumber - b.matchNumber
          break
        case 'auto':
          comparison = a.autoScore - b.autoScore
          break
        case 'teleop':
          comparison = a.teleopScore - b.teleopScore
          break
        case 'endgame':
          comparison = a.endgameScore - b.endgameScore
          break
        case 'total':
          comparison = a.totalScore - b.totalScore
          break
        case 'timestamp':
          comparison = a.timestamp.localeCompare(b.timestamp)
          break
      }
      
      return tableSortDirection === 'asc' ? comparison : -comparison
    })
    
    return sorted
  }, [allObservationsFlat, tableSortBy, tableSortDirection])

  const handleTableHeaderClick = useCallback((column: typeof tableSortBy): void => {
    if (tableSortBy === column) {
      setTableSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setTableSortBy(column)
      setTableSortDirection('desc')
    }
  }, [tableSortBy])

  const analysisFields = useMemo(() => {
    if (!db || !activeFormSchema) {
      return []
    }
    return extractSurveyAnalysisFields(activeFormSchema.surveyJson)
  }, [activeFormSchema, db])

  const analysisConfigContext = useMemo(() => {
    if (!activeFormSchema) {
      return null
    }

    return {
      formSchemaId: activeFormSchema.id,
      formSchemaUpdatedAt: activeFormSchema.updatedAt,
    }
  }, [activeFormSchema])

  useEffect(() => {
    if (!db || !analysisConfigContext) {
      return
    }

    let cancelled = false

    const loadConfigs = async (): Promise<void> => {
      try {
        const configs = await loadAnalysisFieldConfigsFromDatabase(db, analysisConfigContext, analysisFields)
        if (!cancelled) {
          setAnalysisFieldConfigs(configs)
        }
      } catch (error: unknown) {
        if (!cancelled) {
          handleError(error, 'Load analysis field configuration for analysis page')
          setAnalysisFieldConfigs([])
        }
      }
    }

    void loadConfigs()
    const subscription = db.collections.analysisConfigs.findOne('active').$.subscribe(() => {
      void loadConfigs()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [analysisConfigContext, analysisFields, db])

  const customFieldMetrics = useMemo(() => {
    if (!analysisConfigContext) {
      return []
    }

    return calculateCustomFieldMetrics(observations, analysisFieldConfigs)
  }, [analysisConfigContext, analysisFieldConfigs, observations])

  const maxValues = useMemo(() => {
    const teams = Array.from(teamStats.values())
    return {
      avgAuto: Math.max(...teams.map((t) => t.avgAuto), 1),
      avgTeleop: Math.max(...teams.map((t) => t.avgTeleop), 1),
      avgEndgame: Math.max(...teams.map((t) => t.avgEndgame), 1),
      avgTotal: Math.max(...teams.map((t) => t.avgTotal), 1),
      matchCount: Math.max(...teams.map((t) => t.matchCount), 1),
    }
  }, [teamStats])

  if (observations.length === 0) {
    return (
      <Box className="container-wide" py="xl">
        <Stack gap={32}>
          <Box className="animate-fadeInUp">
            <Group gap="md">
              <ThemeIcon size={48} radius="xl" variant="gradient" gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}>
                <IconChartBar size={26} stroke={1.5} />
              </ThemeIcon>
              <Box>
                <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                  Analysis
                </Title>
                <Text size="sm" c="slate.4">Analyze collected scouting performance</Text>
              </Box>
            </Group>
          </Box>

          <Card p="xl" radius="lg" className="glass" style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>
            <Stack align="center" py="xl" gap="lg">
              <ThemeIcon size={72} radius="xl" variant="light" color="slate">
                <IconChartDots size={36} stroke={1.5} />
              </ThemeIcon>
              <Box maw={440}>
                <Text fw={600} c="slate.0" size="xl" mb={8}>No Data Yet</Text>
                <Text c="slate.3" mb="sm">
                  Start scouting matches to unlock team score analytics and custom field charts.
                </Text>
                <Button variant="light" color="frc-blue" leftSection={<IconSettings size={16} />} onClick={() => navigate('/settings')}>
                  Open Analysis Settings
                </Button>
              </Box>
            </Stack>
          </Card>
        </Stack>
      </Box>
    )
  }

  return (
    <Box className="container-wide" py="xl">
      <Stack gap={32}>
        <Box className="animate-fadeInUp">
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
            <Group gap="md">
              <ThemeIcon size={48} radius="xl" variant="gradient" gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}>
                <IconChartBar size={26} stroke={1.5} />
              </ThemeIcon>
              <Box>
                <Title order={1} c="slate.0" style={{ fontSize: 28, fontWeight: 700 }}>
                  Analysis
                </Title>
                <Text size="sm" c="slate.4">{observations.length} observations across {teamStats.size} teams</Text>
              </Box>
            </Group>

            <Group gap="sm">
              <RouteHelpModal
                title="Analysis Guide"
                description="Use filters and metrics to compare teams before alliance selection."
                steps={[
                  { title: 'Pick Event Scope', description: 'Filter by event or season scope before reviewing rankings.' },
                  { title: 'Sort by Phase', description: 'Switch between overall, auto, teleop, and endgame to spot specialists.' },
                  { title: 'Validate with Table', description: 'Confirm anomalies using the detailed rows below cards and charts.' },
                ]}
                tips={[
                  { text: 'Consistency often matters more than one high outlier score.' },
                  { text: 'Enable more form fields in Settings to unlock richer analysis charts.' },
                ]}
                tooltipLabel="How to use analysis"
                color="frc-blue"
              />
              <Button variant="light" color="frc-blue" leftSection={<IconSettings size={16} />} onClick={() => navigate('/settings')}>
                Analysis Settings
              </Button>
            </Group>
          </Group>
        </Box>

        <Group gap="md" wrap="wrap" className="animate-fadeInUp stagger-1">
          <Select
            placeholder="All Events"
            value={selectedEventId}
            onChange={(value) => setSelectedEventId(value)}
            data={[
              { value: 'all', label: 'All Events' },
              ...events.map((event) => ({
                value: event.id,
                label: `${event.name} (${event.season})`,
              })),
            ]}
            w={240}
            radius="md"
            clearable
            styles={{ input: { backgroundColor: 'var(--surface-raised)' } }}
          />
          <SegmentedControl
            value={sortBy}
            onChange={(value) => setSortBy(value as SortKey)}
            radius="md"
            data={[
              { label: 'Overall', value: 'total' },
              { label: 'Auto', value: 'auto' },
              { label: 'Teleop', value: 'teleop' },
              { label: 'Endgame', value: 'endgame' },
              { label: 'Matches', value: 'matches' },
            ]}
            styles={{ root: { backgroundColor: 'var(--surface-raised)' } }}
          />
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Search team..."
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            w={220}
            radius="md"
            styles={{ input: { backgroundColor: 'var(--surface-raised)' } }}
          />
        </Group>

        <Card
          p="lg"
          radius="lg"
          className="animate-fadeInUp stagger-2"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Box>
                <Text fw={700} c="slate.0">Custom Field Analysis</Text>
                <Text size="sm" c="slate.4">
                  SurveyJS field metrics configured in Settings.
                </Text>
              </Box>
              <Badge color="frc-blue" variant="light" radius="md">
                {customFieldMetrics.length} enabled
              </Badge>
            </Group>

            {customFieldMetrics.length === 0 ? (
              <Paper p="md" radius="md" style={{ backgroundColor: 'rgba(255, 136, 0, 0.08)', border: '1px solid rgba(255, 136, 0, 0.22)' }}>
                <Group justify="space-between" gap="sm" wrap="wrap">
                  <Box>
                    <Text size="sm" fw={600} c="frc-orange.3">
                      No custom fields enabled
                    </Text>
                    <Text size="xs" c="slate.3" mt={2}>
                      Open Settings and enable analysis for form fields to show custom charts here.
                    </Text>
                  </Box>
                  <Button size="xs" variant="light" color="frc-orange" leftSection={<IconSettings size={14} />} onClick={() => navigate('/settings')}>
                    Open Settings
                  </Button>
                </Group>
              </Paper>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                {customFieldMetrics.map((metric) => (
                  <Paper key={metric.fieldName} p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
                    <Stack gap="sm">
                      <Group justify="space-between" align="center">
                        <Box>
                          <Text fw={600} c="slate.1">{metric.fieldLabel}</Text>
                          <Text size="xs" c="slate.5" className="mono-number">{metric.fieldName}</Text>
                        </Box>
                        <Badge color="slate" variant="light" radius="md">
                          {getAggregationLabel(metric.aggregation)}
                        </Badge>
                      </Group>

                      <FieldMetricChart metric={metric} />
                    </Stack>
                  </Paper>
                ))}
              </SimpleGrid>
            )}
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg" className="animate-fadeInUp stagger-3">
          {sortedTeams.map((stats) => {
            const teamObservations = groupedObservationsByTeam.get(stats.teamNumber) ?? []
            const isExpanded = expandedTeams.has(stats.teamNumber)

            return (
              <Card
                key={stats.teamNumber}
                p="lg"
                radius="lg"
                style={{
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start">
                    <Group gap="sm">
                      <ThemeIcon size={40} radius="lg" variant="light" color="frc-blue">
                        <IconTarget size={20} stroke={1.5} />
                      </ThemeIcon>
                      <Box>
                        <Text fw={700} size="lg" c="slate.0" className="mono-number">
                          {stats.teamNumber}
                        </Text>
                        <Text size="xs" c="slate.4">
                          {stats.matchCount} match{stats.matchCount !== 1 ? 'es' : ''}
                        </Text>
                      </Box>
                    </Group>
                    <Badge color="frc-blue" variant="light" size="lg" className="mono-number">
                      {stats.avgTotal.toFixed(1)}
                    </Badge>
                  </Group>

                  <Paper p="sm" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
                    <Text size="xs" c="slate.4" mb={4} fw={600}>Performance Profile</Text>
                    <TeamRadarChart stats={stats} maxValues={maxValues} />
                  </Paper>

                  <SimpleGrid cols={3} spacing="xs">
                    <Paper p="xs" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
                      <Text size="xs" c="slate.4">Auto</Text>
                      <Text fw={600} c="slate.0" className="mono-number">{stats.avgAuto.toFixed(1)}</Text>
                    </Paper>
                    <Paper p="xs" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
                      <Text size="xs" c="slate.4">Teleop</Text>
                      <Text fw={600} c="slate.0" className="mono-number">{stats.avgTeleop.toFixed(1)}</Text>
                    </Paper>
                    <Paper p="xs" radius="md" style={{ backgroundColor: 'var(--surface-base)' }}>
                      <Text size="xs" c="slate.4">Endgame</Text>
                      <Text fw={600} c="slate.0" className="mono-number">{stats.avgEndgame.toFixed(1)}</Text>
                    </Paper>
                  </SimpleGrid>

                  <Text size="xs" c="slate.5">
                    {provenanceSummaryByTeam.get(stats.teamNumber) ?? 'Sources: Unknown'}
                  </Text>

                  <Box>
                    <Text size="xs" c="slate.4" mb={4}>Trend</Text>
                    <TeamSparkline data={stats.scores} />
                  </Box>

                  <Button
                    variant="subtle"
                    color="frc-blue"
                    size="xs"
                    fullWidth
                    rightSection={isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    onClick={() => toggleTeamExpanded(stats.teamNumber)}
                  >
                    {isExpanded ? 'Hide' : 'Show'} Match Details
                  </Button>

                  <Collapse in={isExpanded}>
                    <Stack gap="xs" pt="xs">
                      <Text size="xs" c="slate.4" fw={600}>Match Observations</Text>
                      {teamObservations.map((obs, index) => {
                        const totalScore = obs.autoScore + obs.teleopScore + obs.endgameScore

                        return (
                          <Paper
                            key={`${stats.teamNumber}-${obs.matchNumber}-${obs.timestamp}-${index}`}
                            p="xs"
                            radius="md"
                            style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-subtle)' }}
                          >
                            <Stack gap={4}>
                              <Group justify="space-between" wrap="nowrap" gap="xs">
                                <Text size="xs" fw={600} c="slate.1">Match {obs.matchNumber}</Text>
                                <Text size="xs" c="slate.3" className="mono-number">
                                  Total: {totalScore}
                                </Text>
                              </Group>
                              <Text size="xs" c="slate.4" className="mono-number">
                                A:{obs.autoScore} T:{obs.teleopScore} E:{obs.endgameScore}
                              </Text>
                              <Text size="xs" c="slate.5">{getDeviceDisplayLabel(obs.deviceId)}</Text>
                              {obs.notes.trim().length > 0 && (
                                <Text size="xs" c="slate.3" style={{ fontStyle: 'italic' }}>{obs.notes}</Text>
                              )}
                            </Stack>
                          </Paper>
                        )
                      })}
                    </Stack>
                  </Collapse>
                </Stack>
              </Card>
            )
          })}
        </SimpleGrid>

        <Card
          p="lg"
          radius="lg"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Box>
              <Text fw={700} c="slate.0">Team Observations</Text>
              <Text size="sm" c="slate.4">Grouped by team with match-level provenance</Text>
            </Box>

            <Accordion variant="separated" radius="md">
              {sortedTeams.map((stats) => {
                const teamObservations = groupedObservationsByTeam.get(stats.teamNumber) ?? []

                return (
                  <Accordion.Item key={stats.teamNumber} value={String(stats.teamNumber)}>
                    <Accordion.Control>
                      <Group justify="space-between" wrap="wrap" gap="xs">
                        <Text fw={600} c="slate.1" className="mono-number">Team {stats.teamNumber}</Text>
                        <Text size="xs" c="slate.4">{teamObservations.length} observation{teamObservations.length !== 1 ? 's' : ''}</Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        {teamObservations.map((obs, index) => {
                          const parsedTimestamp = new Date(obs.timestamp)
                          const timestampDisplay = Number.isNaN(parsedTimestamp.getTime())
                            ? obs.timestamp
                            : parsedTimestamp.toLocaleString()
                          const totalScore = obs.autoScore + obs.teleopScore + obs.endgameScore

                          return (
                            <Paper
                              key={`${stats.teamNumber}-${obs.matchNumber}-${obs.timestamp}-${index}`}
                              p="sm"
                              radius="md"
                              style={{ backgroundColor: 'var(--surface-base)' }}
                            >
                              <Stack gap={6}>
                                <Group justify="space-between" wrap="wrap" gap="xs">
                                  <Text size="sm" fw={600} c="slate.1">Match {obs.matchNumber}</Text>
                                  <Text size="sm" c="slate.3" className="mono-number">
                                    Auto {obs.autoScore} / Teleop {obs.teleopScore} / Endgame {obs.endgameScore} / Total {totalScore}
                                  </Text>
                                </Group>
                                <Text size="xs" c="slate.4">Device: {getDeviceDisplayLabel(obs.deviceId)}</Text>
                                <Text size="xs" c="slate.5">Timestamp: {timestampDisplay}</Text>
                                {obs.notes.trim().length > 0 && (
                                  <Text size="xs" c="slate.3">Notes: {obs.notes}</Text>
                                )}
                              </Stack>
                            </Paper>
                          )
                        })}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                )
              })}
            </Accordion>
          </Stack>
        </Card>

        <Card
          p="lg"
          radius="lg"
          className="animate-fadeInUp stagger-4"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
        >
          <Stack gap="md">
            <Group gap="md" align="center">
              <ThemeIcon size={40} radius="lg" variant="light" color="frc-blue">
                <IconTable size={20} stroke={1.5} />
              </ThemeIcon>
              <Box>
                <Text fw={700} c="slate.0">Raw Data Table</Text>
                <Text size="sm" c="slate.4">All observations with sortable columns</Text>
              </Box>
              <Badge color="frc-blue" variant="light" radius="md" ml="auto">
                {sortedTableObservations.length} rows
              </Badge>
            </Group>

            <ScrollArea>
              <Table striped highlightOnHover withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr style={{ backgroundColor: 'var(--surface-base)' }}>
                    <Table.Th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleTableHeaderClick('team')}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={700} c="slate.1">Team</Text>
                        {tableSortBy === 'team' && (
                          <ActionIcon size="xs" variant="transparent" color="slate">
                            {tableSortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                    <Table.Th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleTableHeaderClick('match')}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={700} c="slate.1">Match</Text>
                        {tableSortBy === 'match' && (
                          <ActionIcon size="xs" variant="transparent" color="slate">
                            {tableSortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                    <Table.Th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleTableHeaderClick('auto')}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={700} c="slate.1">Auto</Text>
                        {tableSortBy === 'auto' && (
                          <ActionIcon size="xs" variant="transparent" color="slate">
                            {tableSortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                    <Table.Th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleTableHeaderClick('teleop')}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={700} c="slate.1">Teleop</Text>
                        {tableSortBy === 'teleop' && (
                          <ActionIcon size="xs" variant="transparent" color="slate">
                            {tableSortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                    <Table.Th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleTableHeaderClick('endgame')}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={700} c="slate.1">Endgame</Text>
                        {tableSortBy === 'endgame' && (
                          <ActionIcon size="xs" variant="transparent" color="slate">
                            {tableSortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                    <Table.Th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleTableHeaderClick('total')}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={700} c="slate.1">Total</Text>
                        {tableSortBy === 'total' && (
                          <ActionIcon size="xs" variant="transparent" color="slate">
                            {tableSortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                    <Table.Th>
                      <Text size="xs" fw={700} c="slate.1">Device / Scout</Text>
                    </Table.Th>
                    <Table.Th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleTableHeaderClick('timestamp')}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={700} c="slate.1">Timestamp</Text>
                        {tableSortBy === 'timestamp' && (
                          <ActionIcon size="xs" variant="transparent" color="slate">
                            {tableSortDirection === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                    <Table.Th>
                      <Text size="xs" fw={700} c="slate.1">Notes</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sortedTableObservations.map((obs, index) => {
                    const parsedTimestamp = new Date(obs.timestamp)
                    const timestampDisplay = Number.isNaN(parsedTimestamp.getTime())
                      ? obs.timestamp
                      : parsedTimestamp.toLocaleString()

                    return (
                      <Table.Tr key={`${obs.teamNumber}-${obs.matchNumber}-${obs.timestamp}-${index}`}>
                        <Table.Td>
                          <Text size="sm" c="slate.1" className="mono-number">{obs.teamNumber}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="slate.1" className="mono-number">{obs.matchNumber}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="slate.2" className="mono-number">{obs.autoScore}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="slate.2" className="mono-number">{obs.teleopScore}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="slate.2" className="mono-number">{obs.endgameScore}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="frc-blue.4" fw={600} className="mono-number">{obs.totalScore}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="slate.3" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getDeviceDisplayLabel(obs.deviceId)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="slate.4" style={{ whiteSpace: 'nowrap' }}>{timestampDisplay}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="slate.3" lineClamp={2} style={{ maxWidth: 200 }}>
                            {obs.notes.trim() || '—'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
