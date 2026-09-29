import type { ReactElement, ReactNode } from 'react'
import { Box, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core'

type SyncCardProps = {
  title: string
  description?: string
  icon: ReactNode
  /** Shown at the right of the title row, usually a status pill. */
  aside?: ReactNode
  children: ReactNode
}

/** One consistent card for every transfer method, in place of the old per-card inline styling. */
export function SyncCard({ title, description, icon, aside, children }: SyncCardProps): ReactElement {
  return (
    <Card p="lg" className="sync-card">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm" mb="md">
        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
          <ThemeIcon variant="default" size={36} radius="md">
            {icon}
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} c="slate.0" lh={1.3}>
              {title}
            </Text>
            {description ? (
              <Text size="sm" c="slate.3" mt={2}>
                {description}
              </Text>
            ) : null}
          </Box>
        </Group>
        {aside ? <Box style={{ flexShrink: 0 }}>{aside}</Box> : null}
      </Group>
      <Stack gap="md">{children}</Stack>
    </Card>
  )
}
