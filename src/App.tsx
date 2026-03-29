import {
  AppShell,
  Modal,
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
  IconCalendarEvent,
  IconChartBar,
  IconHome,
  IconListCheck,
  IconSettings,
  IconDeviceLaptop,
  IconTargetArrow,
} from '@tabler/icons-react'
import { type ComponentType, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Analysis } from './routes/Analysis'
import { DeviceSetup } from './routes/DeviceSetup'
import { EventManagement } from './routes/EventManagement'
import { Home } from './routes/Home'
import { Scout } from './routes/Scout'
import { Settings } from './routes/Settings'
import { getOrCreateDeviceId } from './lib/db/utils/deviceId'
import { useDatabaseStore } from './stores/useDatabase'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: IconHome },
  { to: '/scout', label: 'Scout', icon: IconTargetArrow },
  { to: '/events', label: 'Events', icon: IconCalendarEvent },
  { to: '/analysis', label: 'Analysis', icon: IconChartBar },
  { to: '/device-setup', label: 'Device Setup', icon: IconDeviceLaptop },
  { to: '/settings', label: 'Settings', icon: IconSettings },
]

function App() {
  const [opened, { toggle, close }] = useDisclosure()
  const location = useLocation()
  const [appVersion, setAppVersion] = useState<string>('unknown')
  const initializeDb = useDatabaseStore((state) => state.initialize)
  const db = useDatabaseStore((state) => state.db)
  const [showDeviceReminder, setShowDeviceReminder] = useState<boolean>(false)

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

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scout" element={<Scout />} />
          <Route path="/events" element={<EventManagement />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/device-setup" element={<DeviceSetup />} />
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
