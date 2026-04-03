import type { RegisterableHotkey } from '@tanstack/react-hotkeys'

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
  hotkey: RegisterableHotkey
  description: string
}

export const shortcutGroups = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: 'Ctrl/Cmd + H', description: 'Go to Dashboard' },
      { keys: 'Ctrl/Cmd + Shift + S', description: 'Go to Scout' },
      { keys: 'Ctrl/Cmd + Shift + A', description: 'Go to Analysis' },
      { keys: 'Ctrl/Cmd + Shift + Y', description: 'Go to Sync' },
      { keys: 'Ctrl/Cmd + ,', description: 'Open Settings' },
    ],
  },
  {
    category: 'Actions',
    shortcuts: [
      { keys: 'Ctrl/Cmd + K', description: 'Open Command Palette' },
      { keys: 'Ctrl/Cmd + S', description: 'Save current form' },
      { keys: '?', description: 'Open shortcut help' },
      { keys: 'Esc', description: 'Close open dialog' },
    ],
  },
]

export const appShortcuts: AppShortcutDefinition[] = [
  { id: 'open-command-palette', hotkey: 'Mod+K', description: 'Open command palette' },
  { id: 'open-settings', hotkey: 'Mod+,', description: 'Open settings' },
  { id: 'save-form', hotkey: 'Mod+S', description: 'Save current form' },
  { id: 'go-home', hotkey: 'Mod+H', description: 'Go to dashboard' },
  { id: 'go-scout', hotkey: 'Mod+Shift+S', description: 'Go to scout' },
  { id: 'go-analysis', hotkey: 'Mod+Shift+A', description: 'Go to analysis' },
  { id: 'go-sync', hotkey: 'Mod+Shift+Y', description: 'Go to sync' },
  { id: 'close-dialogs', hotkey: 'Escape', description: 'Close dialogs' },
  { id: 'show-shortcut-help', hotkey: { key: '/', shift: true }, description: 'Show shortcut help' },
]
