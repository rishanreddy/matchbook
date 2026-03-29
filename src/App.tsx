import {
  AppShell,
  Burger,
  Button,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconChartBar,
  IconHome,
  IconListCheck,
  IconSettings,
  IconTargetArrow,
} from '@tabler/icons-react'
import { type ComponentType, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Analysis } from './routes/Analysis'
import { Home } from './routes/Home'
import { Scout } from './routes/Scout'
import { Settings } from './routes/Settings'
import { useDatabaseStore } from './stores/useDatabase'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: IconHome },
  { to: '/scout', label: 'Scout', icon: IconTargetArrow },
  { to: '/analysis', label: 'Analysis', icon: IconChartBar },
  { to: '/settings', label: 'Settings', icon: IconSettings },
]

function App() {
  const [opened, { toggle, close }] = useDisclosure()
  const location = useLocation()
  const [appVersion, setAppVersion] = useState<string>('unknown')
  const initializeDb = useDatabaseStore((state) => state.initialize)

  useEffect(() => {
    const loadVersion = async (): Promise<void> => {
      try {
        if (window.electronAPI) {
          const version = await window.electronAPI.getVersion()
          setAppVersion(version)
        }
      } catch (error: unknown) {
        console.error('Failed to load app version:', error)
      }
    }

    void loadVersion()
    void initializeDb()
  }, [initializeDb])

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <IconListCheck size={22} />
            <Title order={4}>Offline Scouting Manager</Title>
          </Group>
          <Button variant="light" size="xs" disabled>
            v{appVersion}
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap="xs">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                component={Link}
                to={to}
                label={label}
                leftSection={<Icon size={16} />}
                active={location.pathname === to}
                onClick={close}
              />
            ))}
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scout" element={<Scout />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Text c="dimmed" size="xs" mt="xl">
          Built with Electron, React, TypeScript, Mantine, and RxDB foundations.
        </Text>
      </AppShell.Main>
    </AppShell>
  )
}

export default App
