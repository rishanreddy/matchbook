import type { MatchDocument, ScoutingDataDocument } from '../db/collections'

export interface TeamStats {
  teamKey: string
  teamNumber: number
  teamName: string
  matchesScouteed: number
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

function parseTeamNumber(teamKey: string): number {
  const parsed = Number.parseInt(teamKey.replace('frc', ''), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function calculateTeamStats(observations: ScoutingDataDocument[]): TeamStats {
  if (observations.length === 0) {
    return {
      teamKey: 'frc0',
      teamNumber: 0,
      teamName: 'Unknown Team',
      matchesScouteed: 0,
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

  const autoScores = observations.map((obs) => obs.get('autoScore'))
  const teleopScores = observations.map((obs) => obs.get('teleopScore'))
  const endgameScores = observations.map((obs) => obs.get('endgameScore'))
  const totals = observations.map((obs) => obs.get('autoScore') + obs.get('teleopScore') + obs.get('endgameScore'))

  const deviation = standardDeviation(totals)

  let consistency: TeamStats['consistency'] = 'low'
  if (deviation <= 8) {
    consistency = 'high'
  } else if (deviation <= 16) {
    consistency = 'medium'
  }

  return {
    teamKey: `frc${observations[0].get('teamNumber')}`,
    teamNumber: Number.parseInt(observations[0].get('teamNumber'), 10),
    teamName: `Team ${observations[0].get('teamNumber')}`,
    matchesScouteed: observations.length,
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
  const byTeam = new Map<string, ScoutingDataDocument[]>()

  observations.forEach((observation) => {
    const teamKey = observation.get('teamNumber')
    const teamObservations = byTeam.get(teamKey) ?? []
    teamObservations.push(observation)
    byTeam.set(teamKey, teamObservations)
  })

  const outliers: ScoutingDataDocument[] = []

  byTeam.forEach((teamObservations) => {
    const totals = teamObservations.map(
      (obs) => obs.get('autoScore') + obs.get('teleopScore') + obs.get('endgameScore'),
    )
    const average = mean(totals)
    const deviation = standardDeviation(totals)
    const threshold = deviation * 2

    teamObservations.forEach((obs) => {
      const total = obs.get('autoScore') + obs.get('teleopScore') + obs.get('endgameScore')
      if (Math.abs(total - average) > threshold) {
        outliers.push(obs)
      }
    })
  })

  return outliers
}

export function calculateCoverage(matches: MatchDocument[], observations: ScoutingDataDocument[]): number {
  if (matches.length === 0) {
    return 0
  }

  const requiredPairs = new Set<string>()
  matches.forEach((match) => {
    const matchKey = match.get('key')
    const allianceTeams = [...match.get('redAlliance'), ...match.get('blueAlliance')]
    allianceTeams.forEach((teamKey) => {
      requiredPairs.add(`${matchKey}:${parseTeamNumber(teamKey)}`)
    })
  })

  if (requiredPairs.size === 0) {
    return 0
  }

  const observedPairs = new Set<string>()
  observations.forEach((observation) => {
    observedPairs.add(`${observation.get('matchKey')}:${observation.get('teamNumber')}`)
  })

  const covered = Array.from(requiredPairs).filter((pair) => observedPairs.has(pair)).length
  return (covered / requiredPairs.size) * 100
}
