import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Badge, Box, Button, Group, Text, ThemeIcon } from '@mantine/core'
import { IconWifi } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useWifiHub } from '../../stores/useWifiHub'
import { formatSyncToken } from './token'

/** The lead scout's Home shortcut: is receiving on, and what code do scouts type. */
export function HubWifiSummary(): ReactElement | null {
  const status = useWifiHub((state) => state.status)
  const token = useWifiHub((state) => state.token)
  const received = useWifiHub((state) => state.receivedThisSession)
  const running = status?.running ?? false
  const desktop = typeof window !== 'undefined' && Boolean(window.electronAPI)

  useEffect(() => {
    void useWifiHub.getState().refresh()
  }, [])

  if (!desktop) {
    return null
  }

  return (
    <Box className="home-next-step">
      <Group justify="space-between" wrap="nowrap" gap="md" align="center">
        <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size={40} radius="md" variant="default">
            <IconWifi size={20} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} c="slate.0">
                Scouts’ Wi-Fi
              </Text>
              <Badge variant="light" color={running ? 'green' : 'gray'} radius="sm">
                {running ? 'Receiving' : 'Off'}
              </Badge>
            </Group>
            <Text size="sm" c="slate.3">
              {running
                ? `Code ${formatSyncToken(token)}${received > 0 ? ` · ${received.toLocaleString()} ${received === 1 ? 'entry' : 'entries'} received` : ' · waiting for the first scout'}`
                : 'Press Start receiving so scouts can send you their entries.'}
            </Text>
          </Box>
        </Group>
        <Button component={Link} to="/sync?tab=wifi" variant={running ? 'default' : 'filled'} style={{ flexShrink: 0 }}>
          {running ? 'Open' : 'Start receiving'}
        </Button>
      </Group>
    </Box>
  )
}
