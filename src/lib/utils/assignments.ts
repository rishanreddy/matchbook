import type { TBAMatch } from '../../types/tba'

export function getAlliancePositionLabel(position: string): string {
  const map: Record<string, string> = {
    red1: 'Red 1',
    red2: 'Red 2',
    red3: 'Red 3',
    blue1: 'Blue 1',
    blue2: 'Blue 2',
    blue3: 'Blue 3',
  }

  return map[position] ?? position
}

export function getTeamFromMatch(match: TBAMatch, position: string): string {
  const alliance = position.startsWith('red') ? match.alliances.red.team_keys : match.alliances.blue.team_keys
  const index = Number(position.slice(-1)) - 1
  return alliance[index] ?? ''
}
