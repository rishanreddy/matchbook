import type { ReactElement } from 'react'
import { Badge, Box, Center, Group, Progress, Stack, Text, ThemeIcon, Title, Transition } from '@mantine/core'
import { IconListCheck } from '@tabler/icons-react'

type SplashScreenProps = {
  visible: boolean
  version: string
  status?: string
}

export function SplashScreen({ visible, version, status = 'Initializing database...' }: SplashScreenProps): ReactElement {
  return (
    <Transition mounted={visible} transition="fade" duration={400} timingFunction="ease-out">
      {(styles) => (
        <Box
          pos="fixed"
          style={{ inset: 0, zIndex: 1000, ...styles }}
          className="grid-pattern noise-overlay"
        >
          <Center h="100%">
            <Stack align="center" gap="xl">
              {/* Animated logo with glow */}
              <Box className="animate-fadeInScale">
                <ThemeIcon
                  size={160}
                  radius="xl"
                  variant="light"
                  color="frc-blue.5"
                  className="glow-blue"
                  style={{
                    border: '3px solid rgba(0, 102, 179, 0.3)',
                  }}
                >
                  <IconListCheck size={80} />
                </ThemeIcon>
              </Box>

              {/* App title with FRC accent */}
              <Stack gap="xs" align="center" className="animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                <Title order={1} fw={800} c="white" ta="center" size={42}>
                  Offline Scouting Manager
                </Title>
                <Group gap="xs">
                  <Box
                    w={40}
                    h={3}
                    style={{
                      backgroundColor: '#0066b3',
                      borderRadius: 2,
                    }}
                  />
                  <Box
                    w={40}
                    h={3}
                    style={{
                      backgroundColor: '#f57c00',
                      borderRadius: 2,
                    }}
                  />
                </Group>
                <Text size="md" c="dimmed" fw={500} ta="center">
                  FRC Competition Data Collection
                </Text>
              </Stack>

              {/* Loading indicator */}
              <Stack gap="md" w={300} className="animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
                <Progress
                  value={100}
                  animated
                  size="sm"
                  color="frc-blue.5"
                  styles={{
                    root: { backgroundColor: 'rgba(0, 102, 179, 0.2)' },
                  }}
                />
                <Text size="sm" c="dimmed" ta="center" fw={500}>
                  {status}
                </Text>
              </Stack>

              {/* Version badge */}
              <Badge
                size="lg"
                variant="light"
                color="frc-orange.5"
                className="mono-number animate-fadeInUp"
                style={{ animationDelay: '0.3s' }}
              >
                v{version}
              </Badge>
            </Stack>
          </Center>
        </Box>
      )}
    </Transition>
  )
}
