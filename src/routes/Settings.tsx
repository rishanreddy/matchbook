import type { ReactElement } from 'react'
import { Card, Stack, Switch, Text, Title } from '@mantine/core'

export function Settings(): ReactElement {
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
    </Stack>
  )
}
