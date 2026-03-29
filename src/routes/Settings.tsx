import type { ReactElement } from 'react'
import { useState } from 'react'
import { Button, Card, PasswordInput, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getEventsByYear } from '../lib/api/tba'

export function Settings(): ReactElement {
  const [tbaApiKey, setTbaApiKey] = useState<string>(() => localStorage.getItem('tba_api_key') ?? '')
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false)

  const handleApiKeyChange = (value: string): void => {
    setTbaApiKey(value)
    localStorage.setItem('tba_api_key', value)
  }

  const handleTestConnection = async (): Promise<void> => {
    if (!tbaApiKey.trim()) {
      notifications.show({
        color: 'red',
        title: 'Missing API key',
        message: 'Enter a TBA API key before testing the connection.',
      })
      return
    }

    setIsTestingConnection(true)
    try {
      const events = await getEventsByYear(2024, tbaApiKey.trim())
      notifications.show({
        color: 'green',
        title: 'Connection successful',
        message: `Fetched ${events.length} events from The Blue Alliance API.`,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Connection failed',
        message: error instanceof Error ? error.message : 'Unable to reach The Blue Alliance API.',
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  return (
    <Stack>
      <Title order={2}>Settings</Title>
      <Card withBorder radius="md" p="lg">
        <Stack>
          <Text c="dimmed">Configure local preferences and app behavior.</Text>
          <Switch label="Enable offline autosave" defaultChecked />
          <Switch label="Show developer diagnostics" />
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={4}>The Blue Alliance API</Title>
          <PasswordInput
            label="TBA API Key"
            placeholder="Enter API key"
            value={tbaApiKey}
            onChange={(event) => handleApiKeyChange(event.currentTarget.value)}
          />
          <Button onClick={() => void handleTestConnection()} loading={isTestingConnection}>
            Test Connection
          </Button>
        </Stack>
      </Card>
    </Stack>
  )
}
