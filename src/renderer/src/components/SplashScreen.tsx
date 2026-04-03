import type { ReactElement } from 'react'
import { Badge, Box, Center, Group, Paper, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconCheck, IconDatabase, IconLayoutDashboard, IconLoader2 } from '@tabler/icons-react'
import { brand } from '../config/brand'
import { getPublicAssetPath } from '../lib/utils/assets'

type SplashScreenProps = {
  visible: boolean
  version: string
  status?: string
}

type StartupStep = {
  id: string
  title: string
  detail: string
}

const STARTUP_STEPS: StartupStep[] = [
  {
    id: 'shell',
    title: 'Load interface shell',
    detail: 'Preparing navigation, shortcuts, and window controls.',
  },
  {
    id: 'database',
    title: 'Open local database',
    detail: 'Connecting to IndexedDB and validating offline collections.',
  },
  {
    id: 'workspace',
    title: 'Restore scouting workspace',
    detail: 'Loading forms, events, and synced team data for this device.',
  },
]

function getStepIndex(status: string): number {
  const normalized = status.toLowerCase()

  if (normalized.includes('ready') || normalized.includes('finalizing') || normalized.includes('launch')) {
    return 2
  }

  if (normalized.includes('database') || normalized.includes('collection')) {
    return 1
  }

  return 0
}

export function SplashScreen({ visible, version, status = 'Preparing startup services...' }: SplashScreenProps): ReactElement | null {
  if (!visible) {
    return null
  }

  const activeStep = getStepIndex(status)
  const progressValue = activeStep <= 0 ? 26 : activeStep === 1 ? 62 : 92
  const logoSrc = getPublicAssetPath('icons.svg')

  return (
    <Box
      pos="fixed"
      style={{
        inset: 0,
        zIndex: 9999,
        background:
          'radial-gradient(circle at 16% 18%, rgba(26, 140, 255, 0.1), transparent 40%), radial-gradient(circle at 85% 78%, rgba(255, 136, 0, 0.08), transparent 42%), linear-gradient(170deg, #0b1320 0%, #101b2f 100%)',
      }}
    >
      <Center h="100%" px="md">
        <Paper
          p="xl"
          radius="xl"
          maw={640}
          w="100%"
          style={{
            backgroundColor: 'rgba(11, 21, 38, 0.78)',
            border: '1px solid rgba(101, 132, 171, 0.3)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Stack gap="lg">
            <Group align="center" justify="space-between" wrap="wrap">
              <Group gap="md" wrap="nowrap">
                <Box
                  component="img"
                  src={logoSrc}
                  alt={`${brand.name} logo`}
                  w={72}
                  h={72}
                  style={{ objectFit: 'contain', filter: 'drop-shadow(0 6px 20px rgba(26, 140, 255, 0.35))' }}
                />
                <Box>
                  <Title order={1} c="slate.0" fw={800} lh={1.15}>
                    {brand.name}
                  </Title>
                  <Text c="slate.3" size="sm">
                    {brand.tagline}
                  </Text>
                </Box>
              </Group>

              <Badge color="frc-orange" variant="light" radius="md" className="mono-number">
                v{version}
              </Badge>
            </Group>

            <Paper
              p="md"
              radius="md"
              style={{
                backgroundColor: 'rgba(9, 18, 32, 0.72)',
                border: '1px solid rgba(101, 132, 171, 0.25)',
              }}
            >
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <IconLoader2 size={16} style={{ color: 'var(--mantine-color-frc-blue-4)', animation: 'spin 1.1s linear infinite' }} />
                    <Text c="slate.1" fw={600}>
                      Starting up
                    </Text>
                  </Group>
                  <Text size="sm" c="slate.4" className="mono-number">
                    {progressValue}%
                  </Text>
                </Group>
                <Progress value={progressValue} color="frc-blue" radius="xl" />
                <Text size="sm" c="slate.3">
                  {status}
                </Text>
              </Stack>
            </Paper>

            <Stack gap="xs">
              {STARTUP_STEPS.map((step, index) => {
                const completed = index < activeStep
                const active = index === activeStep

                return (
                  <Group key={step.id} align="flex-start" gap="sm" wrap="nowrap">
                    <ThemeIcon
                      size={24}
                      radius="xl"
                      variant={completed || active ? 'light' : 'subtle'}
                      color={completed ? 'success' : active ? 'frc-blue' : 'slate'}
                    >
                      {completed ? (
                        <IconCheck size={14} />
                      ) : active ? (
                        <IconDatabase size={14} />
                      ) : (
                        <IconLayoutDashboard size={14} />
                      )}
                    </ThemeIcon>
                    <Box>
                      <Text size="sm" fw={600} c={completed || active ? 'slate.1' : 'slate.4'}>
                        {step.title}
                      </Text>
                      <Text size="xs" c="slate.5">
                        {step.detail}
                      </Text>
                    </Box>
                  </Group>
                )
              })}
            </Stack>
          </Stack>
        </Paper>
      </Center>
    </Box>
  )
}
