import type { ReactElement } from 'react'
import { Center, Loader, Paper, Stack, Text, ThemeIcon, Title, Transition } from '@mantine/core'
import { IconListCheck } from '@tabler/icons-react'

type SplashScreenProps = {
  visible: boolean
  version: string
  status?: string
}

export function SplashScreen({ visible, version, status = 'Initializing database...' }: SplashScreenProps): ReactElement {
  return (
    <Transition mounted={visible} transition="fade" duration={300} timingFunction="ease">
      {(styles) => (
        <Center
          pos="fixed"
          inset={0}
          bg="var(--mantine-color-dark-9)"
          style={{ ...styles, zIndex: 1000 }}
        >
          <Paper withBorder radius="md" p="xl" miw={320}>
            <Stack align="center" gap="sm">
              <ThemeIcon variant="light" color="blue" size={64} radius="xl">
                <IconListCheck size={36} />
              </ThemeIcon>
              <Title order={3}>Offline Scouting Manager</Title>
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                {status}
              </Text>
              <Text size="xs" c="dimmed">
                v{version}
              </Text>
            </Stack>
          </Paper>
        </Center>
      )}
    </Transition>
  )
}
