import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { barX, defineChart, dot, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { summarizeMetric, type AnalysisMetric, type AnalysisObservation, type RankedTeam } from '../../lib/utils/analysis'

function valueDomain(values: (number | null)[], percentage: boolean): [number, number] {
  if (percentage) return [0, 100]
  const recorded = values.filter((value): value is number => value !== null)
  return [Math.min(0, ...recorded), Math.max(1, ...recorded)]
}

export function TeamComparisonChart({ teams, metric }: { teams: RankedTeam[]; metric: AnalysisMetric }): ReactElement {
  const definition = useMemo(() => {
    const points = teams.flatMap((team) => team.metric.value === null ? [] : [{ team: `Team ${team.teamNumber}`, value: team.metric.value }])
    return defineChart({
      marks: [barX(points, { y: 'team', x: 'value', fill: '#ffb020', inset: 10, maxThickness: 28, radius: { end: 3 } })],
      scales: { x: { scale: scaleLinear().domain(valueDomain(points.map((point) => point.value), metric.kind === 'booleanField' && metric.aggregation === 'truePercent')), nice: true, grid: true }, y: { scale: () => scaleBand().padding(0.2) } },
      tooltip, keyboard: true,
      margin: { top: 8, left: 100, bottom: 34, right: 24 },
    })
  }, [metric, teams])
  return <Chart definition={definition} height={Math.max(150, teams.length * 60)} ariaLabel={`${metric.label} for selected teams`}
    ariaDescription="Actual recorded values. Exact values and the number of matches are in the comparison table below." />
}

export function TeamMatchTrend({ observations, metric, teamNumber }: { observations: AnalysisObservation[]; metric: AnalysisMetric; teamNumber: number }): ReactElement {
  const definition = useMemo(() => {
    const byMatch = new Map<number, AnalysisObservation[]>()
    for (const observation of observations) {
      if (observation.matchNumber === 0) continue
      const entries = byMatch.get(observation.matchNumber) ?? []
      entries.push(observation)
      byMatch.set(observation.matchNumber, entries)
    }
    const points = Array.from(byMatch, ([match, entries]) => ({ match, value: summarizeMetric(entries, metric).value })).sort((left, right) => left.match - right.match)
    return defineChart({
      marks: [lineY(points, { x: 'match', y: 'value', stroke: '#ffb020', strokeWidth: 2 }), dot(points, { x: 'match', y: 'value', fill: '#ffb020', r: 4 })],
      scales: {
        x: { scale: scaleLinear, nice: true, axis: { label: 'Recorded match number', ticks: { values: points.length <= 10 ? points.map((point) => point.match) : undefined, format: (value: number) => Number.isInteger(value) ? String(value) : '' } } },
        y: { scale: scaleLinear().domain(valueDomain(points.map((point) => point.value), metric.kind === 'booleanField' && metric.aggregation === 'truePercent')), nice: true, grid: true },
      },
      tooltip, keyboard: true,
      margin: { top: 14, right: 16, left: 50, bottom: 48 },
    })
  }, [metric, observations])
  return <Chart definition={definition} height={230} ariaLabel={`${metric.label} by recorded match number for team ${teamNumber}`}
    ariaDescription="Missing answers leave gaps. Multiple observations for one match use the selected summary. Individual observations are listed below." />
}
