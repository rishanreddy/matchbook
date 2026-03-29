import type { ReactElement } from 'react'
import { Card, SimpleGrid, Stack, Text, Title } from '@mantine/core'

export function Analysis(): ReactElement {
  return (
    <Stack>
      <Title order={2}>Analysis</Title>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Card withBorder radius="md" p="lg">
          <Text fw={600}>Team Metrics</Text>
          <Text c="dimmed" size="sm" mt="xs">
            Placeholder for aggregate performance indicators.
          </Text>
        </Card>
        <Card withBorder radius="md" p="lg">
          <Text fw={600}>Match Trends</Text>
          <Text c="dimmed" size="sm" mt="xs">
            Placeholder for historical and trend visualizations.
          </Text>
        </Card>
        <Card withBorder radius="md" p="lg">
          <Text fw={600}>Comparisons</Text>
          <Text c="dimmed" size="sm" mt="xs">
            Placeholder for side-by-side team comparisons.
          </Text>
        </Card>
      </SimpleGrid>
    </Stack>
  )
}
