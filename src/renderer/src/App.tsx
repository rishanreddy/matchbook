import {
  AppShell,
  Badge,
  Box,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  Title,
  ActionIcon,
  Tooltip,
  Kbd,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconCalendarEvent,
  IconCommand,
  IconHelp,
  IconServer,
  IconUsers,
} from '@tabler/icons-react'
import { useHotkey } from '@tanstack/react-hotkeys'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useDatabaseStore } from './stores/useDatabase'
import { useDeviceStore, useIsHub } from './stores/useDeviceStore'
import { useEventStore } from './stores/useEventStore'
import { handleError } from './lib/utils/errorHandler'
import { ShortcutHelp } from './components/ShortcutHelp'
import { CommandPalette, createCommandItems } from './features/command-center'
import { SplashScreen } from './components/SplashScreen'
import { AboutDialog } from './components/AboutDialog'
import { DatabaseInitScreen } from './components/DatabaseInitScreen'
import { FirstRunWizard } from './components/FirstRunWizard'
import { HubOnlyRoute } from './components/HubOnlyRoute'
import { resetDatabase } from './lib/db/database'
import { navGroups, navItems } from './config/navigation'
import { brand } from './config/brand'
import { createAppRoutes } from './config/routes'
import type { AppShortcutId } from './config/shortcuts'
import { appShortcuts, shortcutGroups } from './config/shortcuts'
import { getPublicAssetPath } from './lib/utils/assets'

const MAX_SPLASH_MS = 3500
const FIRST_RUN_COMPLETE_KEY = 'matchbook-first-run-complete'

function getShortcutHotkey(id: AppShortcutId): (typeof appShortcuts)[number]['hotkey'] {
  const shortcut = appShortcuts.find((item) => item.id === id)
  if (!shortcut) {
    return 'Escape'
  }

  return shortcut.hotkey
}

function App() {
  const [opened, { toggle, close }] = useDisclosure()
  const [showShortcutHelp, setShowShortcutHelp] = useState<boolean>(false)
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false)
  const location = useLocation()
  const pathname = location.pathname
  const navigate = useNavigate()
  const [appVersion, setAppVersion] = useState<string>('unknown')
  const initializeDb = useDatabaseStore((state) => state.initialize)
  const clearDatabaseState = useDatabaseStore((state) => state.clearState)
  const setDatabaseError = useDatabaseStore((state) => state.setError)
  const db = useDatabaseStore((state) => state.db)
  const isDatabaseLoading = useDatabaseStore((state) => state.isLoading)
  const databaseError = useDatabaseStore((state) => state.error)
  const [showSplash, setShowSplash] = useState<boolean>(true)
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean>(false)
  const [showAbout, setShowAbout] = useState<boolean>(false)
  const [isResettingDatabase, setIsResettingDatabase] = useState<boolean>(false)
  const [shortcutsEnabled, setShortcutsEnabled] = useState<boolean>(() => localStorage.getItem('shortcuts_enabled') !== 'false')
  const [currentEventName, setCurrentEventName] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const initStartedRef = useRef<boolean>(false)
  const splashTimeoutRef = useRef<number | null>(null)
  
  // Check if this device is a Hub (lead scout) - affects which nav items are shown
  const isHub = useIsHub()
  const loadDeviceFromStorage = useDeviceStore((state) => state.loadFromStorage)
  const loadEventFromStorage = useEventStore((state) => state.loadFromStorage)
  const currentEventId = useEventStore((state) => state.currentEventId)
  const currentSeason = useEventStore((state) => state.currentSeason)
  
  // Load device and event settings from localStorage on mount
  useEffect(() => {
    loadDeviceFromStorage()
    loadEventFromStorage()
  }, [loadDeviceFromStorage, loadEventFromStorage])

  // Fetch event name when currentEventId changes
  useEffect(() => {
    if (!db || !currentEventId) {
      setCurrentEventName(null)
      return
    }

    const fetchEventName = async (): Promise<void> => {
      try {
        const event = await db.collections.events.findOne(currentEventId).exec()
        setCurrentEventName(event ? event.name : null)
      } catch (error: unknown) {
        handleError(error, 'Fetching event name')
        setCurrentEventName(null)
      }
    }

    void fetchEventName()
  }, [db, currentEventId])

  useEffect(() => {
    if (!db) {
      return
    }

    const checkOnboardingCompletion = async (): Promise<void> => {
      const localStorageComplete = localStorage.getItem(FIRST_RUN_COMPLETE_KEY) === 'true'

      if (localStorageComplete) {
        const deviceId = localStorage.getItem('matchbook-device-id')

        if (deviceId) {
          try {
            const device = await db.collections.devices.findOne(deviceId).exec()

            if (device) {
              const scout = await db.collections.scouts
                .findOne({ selector: { deviceId } })
                .exec()

              if (scout) {
                setIsOnboardingComplete(true)
                return
              }
            }
          } catch (error: unknown) {
            handleError(error, 'Checking onboarding completion')
          }
        }
      }

      setIsOnboardingComplete(false)
    }

    void checkOnboardingCompletion()
  }, [db])

  // Keep splash visible while startup work is in progress.
  useEffect(() => {
    if (databaseError) {
      if (splashTimeoutRef.current !== null) {
        window.clearTimeout(splashTimeoutRef.current)
        splashTimeoutRef.current = null
      }
      setShowSplash(false)
      return
    }

    if (!db && isDatabaseLoading) {
      setShowSplash(true)

      if (splashTimeoutRef.current !== null) {
        window.clearTimeout(splashTimeoutRef.current)
      }

      splashTimeoutRef.current = window.setTimeout(() => {
        setShowSplash(false)
        splashTimeoutRef.current = null
      }, MAX_SPLASH_MS)
      return
    }

    if (splashTimeoutRef.current !== null) {
      window.clearTimeout(splashTimeoutRef.current)
      splashTimeoutRef.current = null
    }

    const timer = window.setTimeout(() => {
      setShowSplash(false)
    }, 250)

    return () => {
      window.clearTimeout(timer)
      if (splashTimeoutRef.current !== null) {
        window.clearTimeout(splashTimeoutRef.current)
        splashTimeoutRef.current = null
      }
    }
  }, [databaseError, db, isDatabaseLoading])

  // Initialize app version and database
  useEffect(() => {
    if (initStartedRef.current) {
      return
    }

    initStartedRef.current = true

    const loadVersion = async (): Promise<void> => {
      try {
        if (window.electronAPI) {
          const version = await window.electronAPI.getVersion()
          setAppVersion(version)
        } else {
          setAppVersion('dev')
        }
      } catch (error: unknown) {
        handleError(error, 'App initialization')
        setAppVersion('dev')
      }
    }

    void loadVersion()
    void initializeDb()
  }, [initializeDb])

  const retryDatabaseInitialization = (): void => {
    clearDatabaseState()
    void initializeDb()
  }

  const resetDatabaseCache = (): void => {
    void (async () => {
      setIsResettingDatabase(true)
      try {
        clearDatabaseState()
        await resetDatabase()
        await initializeDb()
      } catch (error: unknown) {
        handleError(error, 'Database cache reset')
        setDatabaseError(
          error instanceof Error ? `Database reset failed: ${error.message}` : 'Database reset failed. Please retry.',
        )
      } finally {
        setIsResettingDatabase(false)
      }
    })()
  }

  const showDatabaseInitScreen =
    !db && (Boolean(databaseError) || isResettingDatabase || (isDatabaseLoading && !showSplash))
  const showOnboardingWizard = !showDatabaseInitScreen && !showSplash && Boolean(db) && !isOnboardingComplete

  const splashStatus = useMemo(() => {
    if (databaseError) {
      return 'Database startup needs attention. Check troubleshooting options.'
    }

    if (isDatabaseLoading) {
      return 'Opening local database, loading collections, and restoring offline workspace...'
    }

    if (!db) {
      return 'Preparing startup services...'
    }

    return 'Database ready. Finalizing startup...'
  }, [databaseError, db, isDatabaseLoading])

  useEffect(() => {
    if (!window.electronAPI) {
      return
    }

    const offOpenAbout = window.electronAPI.onOpenAbout(() => setShowAbout(true))
    const offShowShortcuts = window.electronAPI.onShowShortcuts(() => setShowShortcutHelp(true))
    return () => {
      offOpenAbout()
      offShowShortcuts()
    }
  }, [])

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

  useHotkey(getShortcutHotkey('open-command-palette'), () => setShowCommandPalette(true), {
    enabled: shortcutsEnabled,
    preventDefault: true,
  })

  useHotkey(getShortcutHotkey('open-settings'), () => navigate('/settings'), {
    enabled: shortcutsEnabled,
    preventDefault: true,
  })

  useHotkey(getShortcutHotkey('save-form'), () => {
    document.dispatchEvent(new CustomEvent('app:save-form'))
  }, {
    enabled: shortcutsEnabled,
    preventDefault: true,
    ignoreInputs: false,
  })

  useHotkey(getShortcutHotkey('go-home'), () => navigate('/'), {
    enabled: shortcutsEnabled,
    preventDefault: true,
  })

  useHotkey(getShortcutHotkey('go-scout'), () => navigate('/scout'), {
    enabled: shortcutsEnabled,
    preventDefault: true,
  })

  useHotkey(getShortcutHotkey('go-analysis'), () => navigate('/analysis'), {
    enabled: shortcutsEnabled,
    preventDefault: true,
  })

  useHotkey(getShortcutHotkey('go-sync'), () => navigate('/sync'), {
    enabled: shortcutsEnabled,
    preventDefault: true,
  })

  useHotkey(getShortcutHotkey('close-dialogs'), () => {
    setShowCommandPalette(false)
    setShowShortcutHelp(false)
  }, {
    enabled: shortcutsEnabled,
    preventDefault: false,
    ignoreInputs: false,
  })

  useHotkey(getShortcutHotkey('show-shortcut-help'), () => setShowShortcutHelp(true), {
    enabled: shortcutsEnabled,
    preventDefault: true,
  })

  useEffect(() => {
    if (pathname) {
      mainRef.current?.focus()
    }
  }, [pathname])

  const commandItems = useMemo(
    () =>
      createCommandItems({
        navigate,
        openShortcutHelp: () => setShowShortcutHelp(true),
      }),
    [navigate],
  )

  const appRoutes = useMemo(
    () => createAppRoutes({ appVersion, onOpenAbout: () => setShowAbout(true) }),
    [appVersion],
  )

  const logoSrc = useMemo(() => getPublicAssetPath('icons.svg'), [])

  const renderNavGroup = (groupKey: string, groupLabel: string) => {
    // Filter items by group and by Hub status (non-Hub devices don't see hubOnly items)
    const items = navItems.filter((item) => {
      if (item.group !== groupKey) return false
      if (item.hubOnly && !isHub) return false
      return true
    })
    if (items.length === 0) return null

    // Don't show group headers for non-Hub devices (simpler UI)
    const showGroupLabel = isHub

    return (
      <Box key={groupKey}>
        {showGroupLabel && <Text className="app-nav-group-title">{groupLabel}</Text>}
        {items.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to
          return (
            <NavLink
              key={to}
              component={Link}
              to={to}
              label={label}
              leftSection={
                <ThemeIcon
                  variant="transparent"
                  size={26}
                  radius="md"
                  className="app-nav-icon"
                >
                  <Icon size={16} stroke={1.6} />
                </ThemeIcon>
              }
              active={isActive}
              onClick={close}
              aria-label={`Navigate to ${label}`}
              classNames={{ root: 'app-nav-root', label: 'app-nav-label', section: 'app-nav-section' }}
            />
          )
        })}
      </Box>
    )
  }

  return (
    <AppShell
      className="app-shell-root"
      header={{ height: 64 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
      styles={{
        header: {
          backgroundColor: 'var(--surface-raised)',
          borderBottom: '1px solid var(--border-default)',
          backdropFilter: 'blur(12px)',
        },
        navbar: {
          backgroundColor: 'var(--surface-raised)',
          borderRight: '1px solid var(--border-default)',
        },
        main: {
          backgroundColor: 'var(--surface-base)',
          backgroundImage: 'radial-gradient(ellipse 100% 60% at 50% -10%, rgba(26, 140, 255, 0.06), transparent 60%)',
        },
      }}
    >
      <AppShell.Header className="frc-accent-line">
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="md">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation menu" />
            <Group gap="sm" className="app-logo-container">
              <Box
                component="img"
                src={logoSrc}
                alt={`${brand.name} logo`}
                w={52}
                h={52}
                style={{ 
                  objectFit: 'contain', 
                  filter: 'drop-shadow(0 4px 16px rgba(26, 140, 255, 0.4))',
                  transition: 'filter 0.3s ease'
                }}
              />
              <Box>
                <Title order={4} c="slate.0" fw={800} lh={1.15} style={{ letterSpacing: '-0.02em' }}>
                  {brand.name}
                </Title>
                <Text size="xs" c="slate.3" fw={600} style={{ letterSpacing: '0.03em' }}>
                  {brand.tagline}
                </Text>
              </Box>
            </Group>
          </Group>
          
          <Group gap="xs" className="app-header-actions">
            {/* Only show power-user tools for Hub devices */}
            {isHub && (
              <>
                <Tooltip 
                  label={
                    <Group gap="xs">
                      <Text size="xs">Command Palette</Text>
                      <Kbd size="xs">Ctrl</Kbd>
                      <Kbd size="xs">K</Kbd>
                    </Group>
                  }
                >
                  <ActionIcon 
                    variant="subtle" 
                    onClick={() => setShowCommandPalette(true)} 
                    aria-label="Open command palette"
                    size="lg"
                    radius="md"
                    color="gray"
                    className="app-icon-action"
                  >
                    <IconCommand size={18} stroke={1.6} />
                  </ActionIcon>
                </Tooltip>
                
                <Tooltip label="Keyboard shortcuts">
                  <ActionIcon 
                    variant="subtle" 
                    onClick={() => setShowShortcutHelp(true)} 
                    aria-label="Open keyboard shortcuts help"
                    size="lg"
                    radius="md"
                    color="gray"
                    className="app-icon-action"
                  >
                    <IconHelp size={18} stroke={1.6} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
            
            {/* Show device role badge */}
            <Badge 
              variant="light" 
              color={isHub ? 'frc-orange' : 'frc-blue'} 
              size="lg" 
              radius="xl"
              leftSection={isHub ? <IconServer size={14} /> : <IconUsers size={14} />}
              className="app-version-badge"
              styles={{
                root: {
                  paddingLeft: 10,
                  paddingRight: 14,
                  paddingTop: 7,
                  paddingBottom: 7,
                  border: isHub ? '1px solid rgba(255, 136, 0, 0.25)' : '1px solid rgba(26, 140, 255, 0.25)',
                  background: isHub 
                    ? 'linear-gradient(135deg, rgba(255, 136, 0, 0.12), rgba(255, 136, 0, 0.06))' 
                    : 'linear-gradient(135deg, rgba(26, 140, 255, 0.12), rgba(26, 140, 255, 0.06))',
                  boxShadow: isHub 
                    ? '0 2px 8px rgba(255, 136, 0, 0.15)' 
                    : '0 2px 8px rgba(26, 140, 255, 0.15)',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                },
              }}
            >
              {isHub ? 'Hub' : 'Scout'}
            </Badge>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <AppShell.Section grow p="lg" className="app-nav-scroll">
          <Stack gap={4}>
            {navGroups.map(({ key, label }) => renderNavGroup(key, label))}
          </Stack>
        </AppShell.Section>
        
        <AppShell.Section p="sm">
          <Box
            component={Link}
            to="/"
            onClick={() => close()}
            style={{
              display: 'block',
              textDecoration: 'none',
              backgroundColor: currentEventId ? 'rgba(255, 136, 0, 0.06)' : 'rgba(148, 163, 184, 0.04)',
              border: `1px solid ${currentEventId ? 'rgba(255, 136, 0, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
              borderRadius: 8,
              padding: '10px 12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = currentEventId 
                ? 'rgba(255, 136, 0, 0.1)' 
                : 'rgba(148, 163, 184, 0.06)'
              e.currentTarget.style.borderColor = currentEventId 
                ? 'rgba(255, 136, 0, 0.25)' 
                : 'rgba(148, 163, 184, 0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = currentEventId 
                ? 'rgba(255, 136, 0, 0.06)' 
                : 'rgba(148, 163, 184, 0.04)'
              e.currentTarget.style.borderColor = currentEventId 
                ? 'rgba(255, 136, 0, 0.15)' 
                : 'rgba(148, 163, 184, 0.12)'
            }}
          >
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon 
                size={32} 
                radius="md" 
                variant="light" 
                color={currentEventId ? 'frc-orange' : 'slate'}
                style={{
                  backgroundColor: currentEventId 
                    ? 'rgba(255, 136, 0, 0.12)' 
                    : 'rgba(148, 163, 184, 0.08)',
                }}
              >
                <IconCalendarEvent size={16} stroke={1.6} />
              </ThemeIcon>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text 
                  size="xs" 
                  c="slate.4" 
                  fw={600} 
                  tt="uppercase" 
                  style={{ letterSpacing: '0.05em' }}
                >
                  Current Event
                </Text>
                {currentEventId ? (
                  <Text size="sm" fw={600} c="slate.1" truncate="end">
                    {currentEventName || currentEventId} {currentSeason && `(${currentSeason})`}
                  </Text>
                ) : (
                  <Text size="sm" c="slate.5" fw={500} truncate="end">
                    No event selected
                  </Text>
                )}
              </Box>
            </Group>
          </Box>
        </AppShell.Section>
        
        <AppShell.Section className="app-sidebar-footer">
          <Text className="app-sidebar-footer-text">
            {brand.name} Platform
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      
      <AppShell.Main id="main-content" tabIndex={-1} ref={mainRef} className="app-main-content">
        <Text aria-live="polite" className="sr-only">
          Current page: {navItems.find((item) => item.to === location.pathname)?.label ?? 'App'}
        </Text>

        <ShortcutHelp opened={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} groups={shortcutGroups} />
        <CommandPalette opened={showCommandPalette} onClose={() => setShowCommandPalette(false)} commands={commandItems} />

        {showDatabaseInitScreen ? (
          <DatabaseInitScreen
            loading={isDatabaseLoading}
            error={databaseError}
            appVersion={appVersion}
            onRetry={retryDatabaseInitialization}
            onReset={resetDatabaseCache}
            isResetting={isResettingDatabase}
          />
        ) : (
          <Box className="app-page-container">
            <Suspense fallback={<Text size="sm" c="slate.4">Loading page...</Text>}>
              <Routes>
                {appRoutes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={route.hubOnly ? <HubOnlyRoute>{route.element}</HubOnlyRoute> : route.element}
                  />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Box>
        )}
        
        <AboutDialog
          opened={showAbout}
          onClose={() => setShowAbout(false)}
          version={appVersion}
          onCheckForUpdates={() => {
            void window.electronAPI?.checkForUpdates()
          }}
        />
        <FirstRunWizard
          opened={showOnboardingWizard}
          onComplete={() => {
            setIsOnboardingComplete(true)
          }}
        />
        <SplashScreen visible={showSplash} version={appVersion} status={splashStatus} />
      </AppShell.Main>
    </AppShell>
  )
}

export default App
