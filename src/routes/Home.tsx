import type { ReactElement } from 'react'
import { Alert, Code, List, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconCircleCheck, IconInfoCircle } from '@tabler/icons-react'

export function Home(): ReactElement {
  return (
    <Stack>
      <Title order={2}>Offline Scouting Manager</Title>
      <Text c="dimmed">
        Welcome! This Electron + React + TypeScript project is set up and ready for feature development.
      </Text>

      <Alert icon={<IconInfoCircle size={16} />} title="Setup status" color="blue" variant="light">
        The application shell, routing, theme, and Electron bridge are configured.
      </Alert>

      <List
        spacing="sm"
        icon={
          <ThemeIcon color="green" size={20} radius="xl">
            <IconCircleCheck size={12} />
          </ThemeIcon>
        }
      >
        <List.Item>Mantine providers and notifications mounted</List.Item>
        <List.Item>React Router navigation configured</List.Item>
        <List.Item>
          Electron preload API available via <Code>window.electronAPI</Code>
        </List.Item>
      </List>
    </Stack>
  )
}
