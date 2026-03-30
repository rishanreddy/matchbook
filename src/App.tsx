import {
  AppShell,
  Modal,
  Badge,
  Box,
  Burger,
  Button,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
  ActionIcon,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconCalendarEvent,
  IconChartBar,
  IconHome,
  IconListCheck,
  IconSettings,
  IconDeviceLaptop,
  IconTargetArrow,
  IconUsersGroup,
  IconForms,
  IconRefresh,
  IconHelp,
  IconCommand,
} from '@tabler/icons-react'
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Analysis } from './routes/Analysis'
import { DeviceSetup } from './routes/DeviceSetup'
import { EventManagement } from './routes/EventManagement'
import { Home } from './routes/Home'
import { Assignments } from './routes/Assignments'
import { Scout } from './routes/Scout'
import { Settings } from './routes/Settings'
import { FormBuilder } from './routes/FormBuilder'
import { Sync } from './routes/Sync'
import { Help } from './routes/Help'
import { getOrCreateDeviceId } from './lib/db/utils/deviceId'
import { useDatabaseStore } from './stores/useDatabase'
import { shortcutManager } from './lib/utils/shortcuts'
import { handleError } from './lib/utils/errorHandler'
import { ShortcutHelp } from './components/ShortcutHelp'
import { CommandPalette, type CommandItem } from './components/CommandPalette'
import { SplashScreen } from './components/SplashScreen'
import { FirstRunWizard } from './components/FirstRunWizard'
import { AboutDialog } from './components/AboutDialog'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: IconHome },
  { to: '/scout', label: 'Scout', icon: IconTargetArrow },
  { to: '/events', label: 'Events', icon: IconCalendarEvent },
  { to: '/assignments', label: 'Assignments', icon: IconUsersGroup },
  { to: '/analysis', label: 'Analysis', icon: IconChartBar },
  { to: '/device-setup', label: 'Device Setup', icon: IconDeviceLaptop },
  { to: '/sync', label: 'Sync', icon: IconRefresh },
  { to: '/settings', label: 'Settings', icon: IconSettings },
  { to: '/form-builder', label: 'Form Builder', icon: IconForms },
  { to: '/help', label: 'Help', icon: IconHelp },
]

function App() {
  const [opened, { toggle, close }] = useDisclosure()
  const [showShortcutHelp, setShowShortcutHelp] = useState<boolean>(false)
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false)
  const location = useLocation()
  const pathname = location.pathname
  const navigate = useNavigate()
  const [appVersion, setAppVersion] = useState<string>('unknown')
  const initializeDb = useDatabaseStore((state) => state.initialize)
  const db = useDatabaseStore((state) => state.db)
  const [showDeviceReminder, setShowDeviceReminder] = useState<boolean>(false)
  const [showSplash, setShowSplash] = useState<boolean>(true)
  const [showFirstRun, setShowFirstRun] = useState<boolean>(
    () => localStorage.getItem('first_run_complete') !== 'true',
  )
  const [showAbout, setShowAbout] = useState<boolean>(false)
  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(() => localStorage.getItem('shortcuts_enabled') !== 'false')
  const mainRef = useRef<HTMLElement | null>(null)
  const initStartedRef = useRef<boolean>(false)

  useEffect(() => {
    if (initStartedRef.current) {
      return
    }

    initStartedRef.current = true
    let mounted = true

    const loadVersion = async (): Promise<void> => {
      if (!mounted) {
        return
      }

      try {
        if (window.electronAPI) {
          const version = await window.electronAPI.getVersion()
          if (mounted) {
            setAppVersion(version)
          }
        }
        await initializeDb()
      } catch (error: unknown) {
        if (mounted) {
          handleError(error, 'App initialization')
        }
      } finally {
        window.setTimeout(() => {
          if (mounted) {
            setShowSplash(false)
          }
        }, 500)
      }
    }

    void loadVersion()

    return () => {
      mounted = false
    }
  }, [initializeDb])

  useEffect(() => {
    if (!window.electronAPI) {
      return
    }

    const offOpenAbout = window.electronAPI.onOpenAbout(() => setShowAbout(true))
    return () => {
      offOpenAbout()
    }
  }, [])

  useEffect(() => {
    const checkDeviceRegistration = async (): Promise<void> => {
      if (!db) {
        return
      }

      try {
        const deviceId = await getOrCreateDeviceId()
        const device = await db.collections.devices.findOne(deviceId).exec()
        setShowDeviceReminder(!device)
      } catch (error: unknown) {
        console.error('Failed to check device registration:', error)
      }
    }

    void checkDeviceRegistration()
  }, [db])

  useEffect(() => {
    const handleShortcutsChanged = (event: Event): void => {
      const customEvent = event as CustomEvent<boolean>
      if (typeof customEvent.detail === 'boolean') {
        setShortcutsEnabled(customEvent.detail)
      }
    }

    window.addEventListener('shortcuts:changed', handleShortcutsChanged)
    return () => window.removeEventListener('shortcuts:changed', handleShortcutsChanged)
  }, [])

  useEffect(() => {
    if (!shortcutsEnabled) {
      return
    }

    shortcutManager.register({ key: 'k', ctrl: true, description: 'Open command palette', action: () => setShowCommandPalette(true) })
    shortcutManager.register({ key: ',', ctrl: true, description: 'Open settings', action: () => navigate('/settings') })
    shortcutManager.register({ key: 's', ctrl: true, description: 'Save current form', action: () => document.dispatchEvent(new CustomEvent('app:save-form')) })
    shortcutManager.register({ key: 'h', ctrl: true, description: 'Go home', action: () => navigate('/') })
    shortcutManager.register({ key: 'S', ctrl: true, shift: true, description: 'Go to scout', action: () => navigate('/scout') })
    shortcutManager.register({ key: 'A', ctrl: true, shift: true, description: 'Go to analysis', action: () => navigate('/analysis') })
    shortcutManager.register({ key: 'Y', ctrl: true, shift: true, description: 'Go to sync', action: () => navigate('/sync') })
    shortcutManager.register({
      key: 'Escape',
      description: 'Close dialogs',
      action: () => {
        setShowCommandPalette(false)
        setShowShortcutHelp(false)
        setShowDeviceReminder(false)
      },
    })
    shortcutManager.register({ key: '?', shift: true, description: 'Show shortcut help', action: () => setShowShortcutHelp(true) })

    const onKeyDown = (event: KeyboardEvent): void => shortcutManager.handleKeyPress(event)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      ;['k', ',', 's', 'h', 'S', 'A', 'Y', 'Escape', '?'].forEach((key) => {
        shortcutManager.unregister(key)
      })
    }
  }, [navigate, shortcutsEnabled])

  useEffect(() => {
    if (pathname) {
      mainRef.current?.focus()
    }
  }, [pathname])

  const commandItems = useMemo<CommandItem[]>(() => {
    const staticCommands: CommandItem[] = [
      { id: 'go-home', label: 'Go to Home', category: 'Navigation', keywords: 'home dashboard', action: () => navigate('/') },
      { id: 'go-scout', label: 'Go to Scout', category: 'Navigation', keywords: 'scout assignments form', action: () => navigate('/scout') },
      { id: 'go-analysis', label: 'Go to Analysis', category: 'Navigation', keywords: 'analysis charts', action: () => navigate('/analysis') },
      { id: 'go-sync', label: 'Go to Sync', category: 'Navigation', keywords: 'sync import export', action: () => navigate('/sync') },
      { id: 'go-settings', label: 'Open Settings', category: 'Navigation', keywords: 'settings preferences', action: () => navigate('/settings') },
      { id: 'quick-export', label: 'Quick Action: Open Sync export', category: 'Actions', keywords: 'export csv qr database', action: () => navigate('/sync') },
      { id: 'quick-shortcuts', label: 'Show Keyboard Shortcuts', category: 'Actions', keywords: 'help hotkeys shortcuts', action: () => setShowShortcutHelp(true) },
    ]

    const recentTeamsRaw = localStorage.getItem('recent_teams')
    const recentTeams = recentTeamsRaw ? (JSON.parse(recentTeamsRaw) as number[]) : []
    const recentTeamCommands = recentTeams.slice(0, 5).map((teamNumber) => ({
      id: `team-${teamNumber}`,
      label: `Recently viewed team ${teamNumber}`,
      category: 'Recent',
      keywords: `team ${teamNumber} analysis`,
      action: () => navigate('/analysis'),
    }))

    return [...staticCommands, ...recentTeamCommands]
  }, [navigate])

  const shortcutGroups = useMemo(
    () => [
      {
        category: 'Navigation',
        shortcuts: [
          { keys: 'Ctrl/Cmd + H', description: 'Go to Home' },
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
    ],
    [],
  )

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
      styles={{
        header: {
          backgroundColor: 'var(--mantine-color-slate-9)',
          borderBottom: '1px solid rgba(0, 102, 179, 0.2)',
        },
        navbar: {
          backgroundColor: 'var(--mantine-color-slate-9)',
          borderRight: '1px solid rgba(0, 102, 179, 0.2)',
        },
        main: {
          backgroundColor: 'var(--mantine-color-slate-8)',
        },
      }}
    >
      <AppShell.Header className="frc-accent-line">
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation menu" />
            <ThemeIcon size={32} radius="md" variant="light" color="frc-blue.5">
              <IconListCheck size={20} />
            </ThemeIcon>
            <Title order={4} c="white" fw={700}>Offline Scouting Manager</Title>
          </Group>
          <Group>
            <Tooltip label="Open command palette (Ctrl/Cmd + K)">
              <ActionIcon 
                variant="subtle" 
                onClick={() => setShowCommandPalette(true)} 
                aria-label="Open command palette"
                size="lg"
                color="gray"
                className="transition-fast"
                style={{
                  '&:hover': {
                    backgroundColor: 'rgba(0, 102, 179, 0.2)',
                  },
                }}
              >
                <IconCommand size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Show keyboard shortcuts (?)">
              <ActionIcon 
                variant="subtle" 
                onClick={() => setShowShortcutHelp(true)} 
                aria-label="Open keyboard shortcuts help"
                size="lg"
                color="gray"
                className="transition-fast"
              >
                <IconHelp size={18} />
              </ActionIcon>
            </Tooltip>
            <Badge variant="light" color="frc-orange.5" className="mono-number" size="lg">
              v{appVersion}
            </Badge>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={6}>
            {navItems.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to
              return (
                <Tooltip key={to} label={`Go to ${label}`} position="right">
                  <NavLink
                    component={Link}
                    to={to}
                    label={label}
                    leftSection={<Icon size={18} />}
                    active={isActive}
                    onClick={close}
                    aria-label={`Navigate to ${label}`}
                    className="transition-fast"
                    styles={{
                      root: {
                        borderRadius: 6,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'white' : 'var(--mantine-color-gray-4)',
                        padding: '12px 14px',
                        '&:hover': {
                          backgroundColor: 'rgba(0, 102, 179, 0.15)',
                        },
                        '&[data-active]': {
                          backgroundColor: 'rgba(0, 102, 179, 0.25)',
                          borderLeft: '3px solid #0066b3',
                          paddingLeft: '11px',
                          color: 'white',
                          '&:hover': {
                            backgroundColor: 'rgba(0, 102, 179, 0.3)',
                          },
                        },
                      },
                      label: {
                        fontSize: 14,
                      },
                    }}
                  />
                </Tooltip>
              )
            })}
          </Stack>
        </AppShell.Section>
        
        {/* Footer in sidebar */}
        <AppShell.Section>
          <Box pt="md" style={{ borderTop: '1px solid rgba(0, 102, 179, 0.2)' }}>
            <Text size="xs" c="dark.3" ta="center">
              FRC Scouting Tool
            </Text>
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppShell.Main id="main-content" tabIndex={-1} ref={mainRef}>
        <Text aria-live="polite" className="sr-only">
          Current page: {navItems.find((item) => item.to === location.pathname)?.label ?? 'App'}
        </Text>
        <Modal
          opened={showDeviceReminder}
          onClose={() => setShowDeviceReminder(false)}
          title="Device not registered"
        >
          <Stack gap="sm">
            <Text size="sm">
              This laptop has not been registered yet. Set up this device so it can be identified for sync.
            </Text>
            <Button component={Link} to="/device-setup" onClick={() => setShowDeviceReminder(false)}>
              Go to Device Setup
            </Button>
          </Stack>
        </Modal>

        <ShortcutHelp opened={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} groups={shortcutGroups} />
        <CommandPalette opened={showCommandPalette} onClose={() => setShowCommandPalette(false)} commands={commandItems} />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scout" element={<Scout />} />
          <Route path="/scout/form/:assignmentId" element={<Scout />} />
          <Route path="/events" element={<EventManagement />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/device-setup" element={<DeviceSetup />} />
          <Route path="/sync" element={<Sync />} />
          <Route
            path="/settings"
            element={<Settings appVersion={appVersion} onOpenAbout={() => setShowAbout(true)} />}
          />
          <Route path="/form-builder" element={<FormBuilder />} />
          <Route path="/help" element={<Help />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Box mt="xl" pt="md" style={{ borderTop: '1px solid rgba(0, 102, 179, 0.15)' }}>
          <Text c="dark.3" size="xs">
            Built with Electron, React, TypeScript, Mantine, and RxDB
          </Text>
        </Box>
        <AboutDialog
          opened={showAbout}
          onClose={() => setShowAbout(false)}
          version={appVersion}
          onCheckForUpdates={() => {
            void window.electronAPI?.checkForUpdates()
          }}
        />
        <FirstRunWizard opened={showFirstRun} onComplete={() => setShowFirstRun(false)} />
        <SplashScreen visible={showSplash} version={appVersion} />
      </AppShell.Main>
    </AppShell>
  )
}

export default App
