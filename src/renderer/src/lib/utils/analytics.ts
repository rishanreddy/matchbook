import type { RxDocument } from 'rxdb'
import type { ScoutingDataDocType } from '../db/schemas/scoutingData.schema'

export type ScoutingDataDocument = RxDocument<ScoutingDataDocType>

export interface TeamStats {
  teamNumber: number
  matchesScouted: number
  avgAuto: number
  avgTeleop: number
  avgEndgame: number
  avgTotal: number
  stdDev: number
  bestMatch: number
  worstMatch: number
  consistency: 'high' | 'medium' | 'low'
}

type WeightInput = {
  auto: number
  teleop: number
  endgame: number
  consistency: number
  defense?: number
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0
  }

  const average = mean(values)
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function calculateTeamStats(observations: ScoutingDataDocument[]): TeamStats {
  if (observations.length === 0) {
    return {
      teamNumber: 0,
      matchesScouted: 0,
      avgAuto: 0,
      avgTeleop: 0,
      avgEndgame: 0,
      avgTotal: 0,
      stdDev: 0,
      bestMatch: 0,
      worstMatch: 0,
      consistency: 'low',
    }
  }

  const autoScores = observations.map((obs) => obs.get('autoScore') ?? 0)
  const teleopScores = observations.map((obs) => obs.get('teleopScore') ?? 0)
  const endgameScores = observations.map((obs) => obs.get('endgameScore') ?? 0)
  const totals = observations.map((obs) => 
    (obs.get('autoScore') ?? 0) + (obs.get('teleopScore') ?? 0) + (obs.get('endgameScore') ?? 0)
  )

  const deviation = standardDeviation(totals)

  let consistency: TeamStats['consistency'] = 'low'
  if (deviation <= 8) {
    consistency = 'high'
  } else if (deviation <= 16) {
    consistency = 'medium'
  }

  const teamNumber = observations[0].get('teamNumber')

  return {
    teamNumber: typeof teamNumber === 'string' ? Number.parseInt(teamNumber, 10) : teamNumber,
    matchesScouted: observations.length,
    avgAuto: mean(autoScores),
    avgTeleop: mean(teleopScores),
    avgEndgame: mean(endgameScores),
    avgTotal: mean(totals),
    stdDev: deviation,
    bestMatch: Math.max(...totals),
    worstMatch: Math.min(...totals),
    consistency,
  }
}

export function calculateWeightedScore(stats: TeamStats, weights: WeightInput): number {
  const totalWeight = weights.auto + weights.teleop + weights.endgame + weights.consistency + (weights.defense ?? 0)
  if (totalWeight === 0) {
    return 0
  }

  const consistencyScore = Math.max(0, 100 - stats.stdDev * 5)
  const defenseScore = 0

  return (
    (stats.avgAuto * weights.auto +
      stats.avgTeleop * weights.teleop +
      stats.avgEndgame * weights.endgame +
      consistencyScore * weights.consistency +
      defenseScore * (weights.defense ?? 0)) /
    totalWeight
  )
}

export function detectOutliers(observations: ScoutingDataDocument[]): ScoutingDataDocument[] {
  const byTeam = new Map<number, ScoutingDataDocument[]>()

  observations.forEach((observation) => {
    const teamNumber = observation.get('teamNumber')
    const teamObservations = byTeam.get(teamNumber) ?? []
    teamObservations.push(observation)
    byTeam.set(teamNumber, teamObservations)
  })

  const outliers: ScoutingDataDocument[] = []

  byTeam.forEach((teamObservations) => {
    const totals = teamObservations.map(
      (obs) => (obs.get('autoScore') ?? 0) + (obs.get('teleopScore') ?? 0) + (obs.get('endgameScore') ?? 0),
    )
    const average = mean(totals)
    const deviation = standardDeviation(totals)
    const threshold = deviation * 2

    teamObservations.forEach((obs) => {
      const total = (obs.get('autoScore') ?? 0) + (obs.get('teleopScore') ?? 0) + (obs.get('endgameScore') ?? 0)
      if (Math.abs(total - average) > threshold) {
        outliers.push(obs)
      }
    })
  })

  return outliers
}
