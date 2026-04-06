import type { ComponentType } from 'react'
import {
  IconCalendarEvent,
  IconChartBar,
  IconCode,
  IconDeviceLaptop,
  IconForms,
  IconHelp,
  IconHome,
  IconRefresh,
  IconSettings,
  IconTargetArrow,
} from '@tabler/icons-react'

export type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ size?: number; stroke?: number }>
  group?: 'main' | 'tools' | 'system'
  hubOnly?: boolean
  requiresDeveloperMode?: boolean
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: IconHome, group: 'main' },
  { to: '/scout', label: 'Scout Match', icon: IconTargetArrow, group: 'main' },
  { to: '/events', label: 'Events', icon: IconCalendarEvent, group: 'main', hubOnly: true },
  { to: '/analysis', label: 'Analysis', icon: IconChartBar, group: 'main' },
  { to: '/sync', label: 'Sync Data', icon: IconRefresh, group: 'main' },
  { to: '/form-builder', label: 'Form Builder', icon: IconForms, group: 'tools', hubOnly: true },
  { to: '/developer-tools', label: 'Developer Tools', icon: IconCode, group: 'system', requiresDeveloperMode: true },
  { to: '/device-setup', label: 'Device Setup', icon: IconDeviceLaptop, group: 'system' },
  { to: '/settings', label: 'Settings', icon: IconSettings, group: 'system' },
  { to: '/help', label: 'Help', icon: IconHelp, group: 'system' },
]

export const navGroups = [
  { key: 'main', label: 'Main' },
  { key: 'tools', label: 'Lead Scout Tools' },
  { key: 'system', label: 'System' },
] as const
