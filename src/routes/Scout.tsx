import type { ReactElement } from 'react'
import { Card, Group, Stack, Text, Title } from '@mantine/core'

export function Scout(): ReactElement {
  return (
    <Stack>
      <Title order={2}>Scout</Title>
      <Card withBorder shadow="sm" radius="md" p="lg">
        <Group justify="space-between">
          <Text fw={600}>Scouting interface placeholder</Text>
          <Text c="dimmed" size="sm">
            Coming soon
          </Text>
        </Group>
        <Text mt="sm" c="dimmed">
          This page will host match scouting forms, offline capture, and QR/data sync workflows.
        </Text>
      </Card>
    </Stack>
  )
}
