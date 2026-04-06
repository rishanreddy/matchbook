import { formatForDisplay, normalizeHotkey, validateHotkey } from '@tanstack/react-hotkeys'
import type { Hotkey } from '@tanstack/react-hotkeys'

export type AppShortcutId =
  | 'open-command-palette'
  | 'open-settings'
  | 'save-form'
  | 'go-home'
  | 'go-scout'
  | 'go-analysis'
  | 'go-sync'
  | 'close-dialogs'
  | 'show-shortcut-help'

export type AppShortcutDefinition = {
  id: AppShortcutId
  hotkey: Hotkey
  description: string
  category: 'Navigation' | 'Actions'
}

export type ShortcutBindings = Record<AppShortcutId, Hotkey>

export type ShortcutHelpGroup = {
  category: 'Navigation' | 'Actions'
  shortcuts: Array<{ keys: string; description: string }>
}

const SHORTCUT_BINDINGS_STORAGE_KEY = 'matchbook-shortcut-bindings-v1'

export const appShortcuts: AppShortcutDefinition[] = [
  { id: 'open-command-palette', hotkey: 'Mod+K', description: 'Open command palette', category: 'Actions' },
  { id: 'open-settings', hotkey: 'Mod+,', description: 'Open settings', category: 'Navigation' },
  { id: 'save-form', hotkey: 'Mod+S', description: 'Save current form', category: 'Actions' },
  { id: 'go-home', hotkey: 'Mod+H', description: 'Go to dashboard', category: 'Navigation' },
  { id: 'go-scout', hotkey: 'Mod+Shift+S', description: 'Go to scout', category: 'Navigation' },
  { id: 'go-analysis', hotkey: 'Mod+Shift+A', description: 'Go to analysis', category: 'Navigation' },
  { id: 'go-sync', hotkey: 'Mod+Shift+Y', description: 'Go to sync', category: 'Navigation' },
  { id: 'close-dialogs', hotkey: 'Escape', description: 'Close dialogs', category: 'Actions' },
  { id: 'show-shortcut-help', hotkey: 'Mod+/', description: 'Show shortcut help', category: 'Actions' },
]

export function getDefaultShortcutBindings(): ShortcutBindings {
  return appShortcuts.reduce((accumulator, shortcut) => {
    accumulator[shortcut.id] = shortcut.hotkey
    return accumulator
  }, {} as ShortcutBindings)
}

export function getShortcutDefinition(shortcutId: AppShortcutId): AppShortcutDefinition {
  const shortcut = appShortcuts.find((item) => item.id === shortcutId)
  if (!shortcut) {
    throw new Error(`Unknown shortcut id: ${shortcutId}`)
  }

  return shortcut
}

function parseStoredShortcutBindings(rawValue: string): Partial<Record<AppShortcutId, unknown>> | null {
  try {
    const parsed = JSON.parse(rawValue)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }

    return parsed as Partial<Record<AppShortcutId, unknown>>
  } catch {
    return null
  }
}

export function loadShortcutBindings(): ShortcutBindings {
  const defaults = getDefaultShortcutBindings()
  if (typeof window === 'undefined') {
    return defaults
  }

  const rawValue = window.localStorage.getItem(SHORTCUT_BINDINGS_STORAGE_KEY)
  if (!rawValue) {
    return defaults
  }

  const parsed = parseStoredShortcutBindings(rawValue)
  if (!parsed) {
    return defaults
  }

  const resolvedBindings = { ...defaults }
  appShortcuts.forEach((shortcut) => {
    const candidate = parsed[shortcut.id]
    if (typeof candidate !== 'string') {
      return
    }

    const validation = validateHotkey(candidate)
    if (!validation.valid) {
      return
    }

    try {
      resolvedBindings[shortcut.id] = normalizeHotkey(candidate)
    } catch {
      // keep default binding when normalization fails
    }
  })

  return resolvedBindings
}

export function saveShortcutBindings(bindings: ShortcutBindings): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SHORTCUT_BINDINGS_STORAGE_KEY, JSON.stringify(bindings))
}

export function getShortcutHotkey(shortcutId: AppShortcutId, bindings: ShortcutBindings): Hotkey {
  return bindings[shortcutId] ?? getShortcutDefinition(shortcutId).hotkey
}

export function createShortcutHelpGroups(bindings: ShortcutBindings): ShortcutHelpGroup[] {
  const groups: ShortcutHelpGroup[] = [
    { category: 'Navigation', shortcuts: [] },
    { category: 'Actions', shortcuts: [] },
  ]

  appShortcuts.forEach((shortcut) => {
    const group = groups.find((item) => item.category === shortcut.category)
    if (!group) {
      return
    }

    group.shortcuts.push({
      keys: formatForDisplay(getShortcutHotkey(shortcut.id, bindings), { useSymbols: false }),
      description: shortcut.description,
    })
  })

  return groups
}

export const shortcutGroups = createShortcutHelpGroups(getDefaultShortcutBindings())
