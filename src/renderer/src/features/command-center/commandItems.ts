import type { NavigateFunction } from 'react-router-dom'
import type { CommandItem } from './types'

type CreateCommandItemsParams = {
  navigate: NavigateFunction
  openShortcutHelp: () => void
}

function getRecentTeamsFromStorage(): number[] {
  const recentTeamsRaw = localStorage.getItem('recent_teams')
  if (!recentTeamsRaw) {
    return []
  }

  try {
    const parsed = JSON.parse(recentTeamsRaw)
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === 'number') : []
  } catch {
    return []
  }
}

export function createCommandItems({ navigate, openShortcutHelp }: CreateCommandItemsParams): CommandItem[] {
  const staticCommands: CommandItem[] = [
    {
      id: 'go-home',
      label: 'Go to Dashboard',
      category: 'Navigation',
      keywords: 'home dashboard',
      action: () => navigate('/'),
    },
    {
      id: 'go-scout',
      label: 'Go to Scout',
      category: 'Navigation',
      keywords: 'scout match form',
      action: () => navigate('/scout'),
    },
    {
      id: 'go-analysis',
      label: 'Go to Analysis',
      category: 'Navigation',
      keywords: 'analysis charts',
      action: () => navigate('/analysis'),
    },
    {
      id: 'go-sync',
      label: 'Go to Sync',
      category: 'Navigation',
      keywords: 'sync import export',
      action: () => navigate('/sync'),
    },
    {
      id: 'go-settings',
      label: 'Open Settings',
      category: 'Navigation',
      keywords: 'settings preferences',
      action: () => navigate('/settings'),
    },
    {
      id: 'quick-export',
      label: 'Quick Action: Open Sync export',
      category: 'Actions',
      keywords: 'export csv qr database',
      action: () => navigate('/sync'),
    },
    {
      id: 'quick-shortcuts',
      label: 'Show Keyboard Shortcuts',
      category: 'Actions',
      keywords: 'help hotkeys shortcuts',
      action: openShortcutHelp,
    },
  ]

  const recentTeamCommands: CommandItem[] = getRecentTeamsFromStorage()
    .slice(0, 5)
    .map((teamNumber) => ({
      id: `team-${teamNumber}`,
      label: `Recently viewed team ${teamNumber}`,
      category: 'Recent',
      keywords: `team ${teamNumber} analysis`,
      action: () => navigate('/analysis'),
    }))

  return [...staticCommands, ...recentTeamCommands]
}
