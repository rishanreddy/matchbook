import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Container,
  Group,
  Paper,
  PasswordInput,
  Progress,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Transition,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconCheck,
  IconDeviceLaptop,
  IconKey,
  IconPlugConnected,
  IconRocket,
  IconExternalLink,
} from '@tabler/icons-react'
import { getEventsByYear } from '../lib/api/tba'

type FirstRunWizardProps = {
  opened: boolean
  onComplete: () => void
}

const STEP_TITLES = [
  'Welcome',
  'Device Setup',
  'TBA API Key',
  'Test Connection',
  'Ready to Scout',
]

const STEP_ICONS = [
  IconRocket,
  IconDeviceLaptop,
  IconKey,
  IconPlugConnected,
  IconCheck,
]

export function FirstRunWizard({ opened, onComplete }: FirstRunWizardProps): ReactElement {
  const [active, setActive] = useState<number>(0)
  const [deviceName, setDeviceName] = useState<string>(localStorage.getItem('device_name') ?? '')
  const [isPrimary, setIsPrimary] = useState<boolean>(localStorage.getItem('device_primary') === 'true')
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('tba_api_key') ?? '')
  const [isTesting, setIsTesting] = useState<boolean>(false)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [eventCount, setEventCount] = useState<number>(0)
  const [stepTransition, setStepTransition] = useState<boolean>(true)

  const canContinue = useMemo(() => {
    if (active === 1) {
      return deviceName.trim().length > 1
    }
    if (active === 2) {
      return apiKey.trim().length > 0
    }
    if (active === 3) {
      return isConnected
    }
    return true
  }, [active, apiKey, deviceName, isConnected])

  const persistStepData = (): void => {
    localStorage.setItem('device_name', deviceName.trim())
    localStorage.setItem('device_primary', String(isPrimary))
    localStorage.setItem('tba_api_key', apiKey.trim())
  }

  const testConnection = async (): Promise<void> => {
    setIsTesting(true)
    setIsConnected(false)
    try {
      const events = await getEventsByYear(2024, apiKey.trim())
      setIsConnected(true)
      setEventCount(events.length)
      notifications.show({
        color: 'green',
        title: 'Connection successful',
        message: `Connected to TBA (${events.length} events fetched).`,
      })
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Connection failed',
        message: error instanceof Error ? error.message : 'Unable to connect to TBA.',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const completeWizard = (): void => {
    persistStepData()
    localStorage.setItem('first_run_complete', 'true')
    onComplete()
  }

  const nextStep = (): void => {
    setStepTransition(false)
    persistStepData()
    setTimeout(() => {
      setActive((value) => value + 1)
      setStepTransition(true)
    }, 150)
  }

  const prevStep = (): void => {
    setStepTransition(false)
    setTimeout(() => {
      setActive((value) => value - 1)
      setStepTransition(true)
    }, 150)
  }

  const openTBAAuthPage = (): void => {
    window.open('https://www.thebluealliance.com/account', '_blank')
  }

  const progressPercent = ((active + 1) / STEP_TITLES.length) * 100

  if (!opened) return <></>

  return (
    <Box
      pos="fixed"
      style={{ inset: 0, zIndex: 9999 }}
      className="grid-pattern noise-overlay"
    >
      {/* Progress bar at top */}
      <Box pos="absolute" top={0} left={0} right={0} className="frc-accent-line">
        <Progress
          value={progressPercent}
          size="sm"
          color="frc-blue.5"
          styles={{
            root: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
            section: { transition: 'width 0.4s ease-out' },
          }}
        />
      </Box>

      {/* Step indicator dots */}
      <Box pos="absolute" top={40} left={0} right={0}>
        <Container size="lg">
          <Group justify="center" gap="md">
            {STEP_TITLES.map((title, idx) => {
              const Icon = STEP_ICONS[idx]
              const isActive = idx === active
              const isCompleted = idx < active

              return (
                <Stack key={title} align="center" gap={4}>
                  <ThemeIcon
                    size={48}
                    radius="xl"
                    variant={isActive ? 'filled' : isCompleted ? 'light' : 'default'}
                    color={isActive ? 'frc-blue.5' : isCompleted ? 'frc-orange.5' : 'gray'}
                    className={isActive ? 'animate-pulseGlow' : ''}
                    style={{
                      transition: 'all 0.3s ease-out',
                      border: isActive ? '2px solid rgba(0, 102, 179, 0.5)' : 'none',
                    }}
                  >
                    {isCompleted ? <IconCheck size={24} /> : <Icon size={24} />}
                  </ThemeIcon>
                  <Text
                    size="xs"
                    fw={isActive ? 700 : 500}
                    c={isActive ? 'white' : isCompleted ? 'dimmed' : 'dark.3'}
                    style={{ transition: 'all 0.2s ease-out' }}
                  >
                    {title}
                  </Text>
                </Stack>
              )
            })}
          </Group>
        </Container>
      </Box>

      {/* Main content area */}
      <Center h="100%" pt={140} pb={80}>
        <Container size="md" w="100%">
          <Transition
            mounted={stepTransition}
            transition="fade"
            duration={200}
            timingFunction="ease-out"
          >
            {(styles) => (
              <Paper
                shadow="xl"
                p="xl"
                radius="md"
                style={{
                  ...styles,
                  backgroundColor: 'rgba(30, 41, 59, 0.95)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(0, 102, 179, 0.2)',
                }}
                className="sharp-shadow"
              >
                {/* Step 0: Welcome */}
                {active === 0 && (
                  <Stack gap="xl" align="center">
                    <ThemeIcon size={120} radius="xl" variant="light" color="frc-blue.5" className="animate-fadeInScale">
                      <IconRocket size={64} />
                    </ThemeIcon>
                    <Title order={1} ta="center" c="white" fw={800} className="animate-fadeInUp">
                      Welcome to Offline Scouting Manager
                    </Title>
                    <Text size="lg" ta="center" c="dimmed" maw={600} className="animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                      Your pit crew dashboard for fast, reliable FRC match data collection. Let's set up your scouting station.
                    </Text>
                    <Box mt="md">
                      <Badge size="lg" variant="light" color="frc-orange.5" className="mono-number">
                        Setup takes 2 minutes
                      </Badge>
                    </Box>
                  </Stack>
                )}

                {/* Step 1: Device setup */}
                {active === 1 && (
                  <Stack gap="xl">
                    <div>
                      <Title order={2} c="white" fw={700} mb="xs">
                        Configure This Device
                      </Title>
                      <Text size="md" c="dimmed">
                        Give this device a name so your team can identify it during sync operations.
                      </Text>
                    </div>

                    <TextInput
                      label="Device Name"
                      placeholder="e.g., Team 9999 - Tablet 1"
                      description="Use a descriptive name including your team number"
                      size="lg"
                      value={deviceName}
                      onChange={(event) => setDeviceName(event.currentTarget.value)}
                      styles={{
                        label: { color: 'white', fontWeight: 600, marginBottom: 8 },
                        input: {
                          backgroundColor: 'rgba(15, 23, 42, 0.8)',
                          borderColor: 'rgba(0, 102, 179, 0.3)',
                          color: 'white',
                          fontSize: 16,
                        },
                        description: { marginTop: 6 },
                      }}
                    />

                    <Paper p="md" radius="sm" style={{ backgroundColor: 'rgba(0, 102, 179, 0.1)', border: '1px solid rgba(0, 102, 179, 0.2)' }}>
                      <Checkbox
                        label="Primary sync device (hub)"
                        description="Check this if this device will be the main hub that collects data from other devices"
                        checked={isPrimary}
                        onChange={(event) => setIsPrimary(event.currentTarget.checked)}
                        size="md"
                        styles={{
                          label: { color: 'white', fontWeight: 500 },
                          description: { color: 'var(--mantine-color-dimmed)', marginTop: 4 },
                        }}
                      />
                      {isPrimary && (
                        <Badge mt="sm" color="frc-orange.5" variant="light" leftSection={<IconDeviceLaptop size={14} />}>
                          Hub Device
                        </Badge>
                      )}
                    </Paper>

                    <Paper p="sm" radius="sm" style={{ backgroundColor: 'rgba(245, 124, 0, 0.05)', border: '1px solid rgba(245, 124, 0, 0.2)' }}>
                      <Group gap="xs">
                        <Text size="sm" c="frc-orange.3" fw={500}>Device ID:</Text>
                        <Text size="sm" c="white" className="mono-number">{localStorage.getItem('device_id') || 'Generated on first save'}</Text>
                      </Group>
                    </Paper>
                  </Stack>
                )}

                {/* Step 2: TBA API */}
                {active === 2 && (
                  <Stack gap="xl">
                    <div>
                      <Title order={2} c="white" fw={700} mb="xs">
                        Connect to The Blue Alliance
                      </Title>
                      <Text size="md" c="dimmed">
                        Your API key allows OSM to fetch event schedules, team lists, and match data.
                      </Text>
                    </div>

                    <Paper p="md" radius="sm" style={{ backgroundColor: 'rgba(0, 102, 179, 0.1)', border: '1px solid rgba(0, 102, 179, 0.2)' }}>
                      <Stack gap="sm">
                        <Text size="sm" c="white" fw={500}>
                          How to get your API key:
                        </Text>
                        <Text size="sm" c="dimmed">
                          1. Log in to your Blue Alliance account<br />
                          2. Go to Account Settings → Read API Keys<br />
                          3. Generate a new key or copy an existing one<br />
                          4. Paste it below
                        </Text>
                        <Button
                          leftSection={<IconExternalLink size={16} />}
                          variant="light"
                          color="frc-blue.5"
                          onClick={openTBAAuthPage}
                          size="sm"
                        >
                          Open TBA Account Page
                        </Button>
                      </Stack>
                    </Paper>

                    <PasswordInput
                      label="TBA API Key"
                      placeholder="Paste your Read API Key here"
                      description="Your key is stored locally and never shared"
                      size="lg"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.currentTarget.value)}
                      styles={{
                        label: { color: 'white', fontWeight: 600, marginBottom: 8 },
                        input: {
                          backgroundColor: 'rgba(15, 23, 42, 0.8)',
                          borderColor: 'rgba(0, 102, 179, 0.3)',
                          color: 'white',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 14,
                        },
                        description: { marginTop: 6 },
                      }}
                    />
                  </Stack>
                )}

                {/* Step 3: Test connection */}
                {active === 3 && (
                  <Stack gap="xl" align="center">
                    <div style={{ textAlign: 'center' }}>
                      <Title order={2} c="white" fw={700} mb="xs">
                        Verify Connection
                      </Title>
                      <Text size="md" c="dimmed">
                        Test your API key to ensure data can be fetched from The Blue Alliance.
                      </Text>
                    </div>

                    <Button
                      size="xl"
                      leftSection={<IconPlugConnected size={24} />}
                      onClick={() => void testConnection()}
                      loading={isTesting}
                      disabled={isConnected}
                      color="frc-blue.5"
                      className={isConnected ? '' : 'glow-blue'}
                      styles={{
                        root: {
                          height: 64,
                          fontSize: 18,
                          fontWeight: 700,
                        },
                      }}
                    >
                      {isConnected ? 'Connection Verified' : 'Test Connection'}
                    </Button>

                    {isConnected && (
                      <Paper
                        p="xl"
                        radius="md"
                        w="100%"
                        className="animate-fadeInUp"
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          border: '2px solid rgba(16, 185, 129, 0.4)',
                        }}
                      >
                        <Stack align="center" gap="md">
                          <ThemeIcon size={64} radius="xl" color="green" variant="light">
                            <IconCheck size={36} />
                          </ThemeIcon>
                          <Text size="lg" fw={700} c="green.4" ta="center">
                            Connection Successful!
                          </Text>
                          <Text size="md" c="white" ta="center">
                            Fetched data for <span className="mono-number" style={{ fontWeight: 700, color: '#10b981' }}>{eventCount}</span> events
                          </Text>
                          <Text size="sm" c="dimmed" ta="center">
                            You can now pull event schedules and match data.
                          </Text>
                        </Stack>
                      </Paper>
                    )}

                    {!isConnected && !isTesting && (
                      <Text size="sm" c="dark.3" ta="center">
                        Click the button above to verify your setup before continuing.
                      </Text>
                    )}
                  </Stack>
                )}

                {/* Step 4: Complete */}
                {active === 4 && (
                  <Stack gap="xl" align="center">
                    <ThemeIcon size={120} radius="xl" variant="light" color="frc-orange.5" className="animate-fadeInScale">
                      <IconCheck size={64} />
                    </ThemeIcon>
                    <Title order={1} ta="center" c="white" fw={800} className="animate-fadeInUp">
                      You're Ready to Scout!
                    </Title>
                    <Text size="lg" ta="center" c="dimmed" maw={600} className="animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
                      Your scouting station is configured and connected. Start collecting match data, build forms, and sync with your team.
                    </Text>

                    <Stack gap="sm" w="100%" maw={500} mt="md">
                      <Paper p="md" radius="sm" style={{ backgroundColor: 'rgba(0, 102, 179, 0.1)', border: '1px solid rgba(0, 102, 179, 0.2)' }}>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Device Name</Text>
                          <Text size="sm" c="white" fw={600}>{deviceName}</Text>
                        </Group>
                      </Paper>
                      <Paper p="md" radius="sm" style={{ backgroundColor: 'rgba(0, 102, 179, 0.1)', border: '1px solid rgba(0, 102, 179, 0.2)' }}>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Device Role</Text>
                          <Badge variant="light" color={isPrimary ? 'frc-orange.5' : 'frc-blue.5'}>
                            {isPrimary ? 'Hub' : 'Scout'}
                          </Badge>
                        </Group>
                      </Paper>
                      <Paper p="md" radius="sm" style={{ backgroundColor: 'rgba(0, 102, 179, 0.1)', border: '1px solid rgba(0, 102, 179, 0.2)' }}>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">TBA Connection</Text>
                          <Badge variant="light" color="green">
                            Connected
                          </Badge>
                        </Group>
                      </Paper>
                    </Stack>
                  </Stack>
                )}

                {/* Navigation buttons */}
                <Group justify="space-between" mt={40} pt="xl" style={{ borderTop: '1px solid rgba(0, 102, 179, 0.2)' }}>
                  <Button
                    variant="subtle"
                    color="gray"
                    size="lg"
                    disabled={active === 0}
                    onClick={prevStep}
                    styles={{
                      root: {
                        '&:disabled': {
                          opacity: 0.3,
                        },
                      },
                    }}
                  >
                    Back
                  </Button>
                  {active < 4 ? (
                    <Button
                      size="lg"
                      color="frc-blue.5"
                      onClick={nextStep}
                      disabled={!canContinue}
                      className={canContinue ? 'glow-blue' : ''}
                      styles={{
                        root: {
                          fontWeight: 700,
                          minWidth: 120,
                        },
                      }}
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      color="frc-orange.5"
                      onClick={completeWizard}
                      className="glow-orange"
                      styles={{
                        root: {
                          fontWeight: 700,
                          minWidth: 180,
                        },
                      }}
                    >
                      Start Scouting
                    </Button>
                  )}
                </Group>
              </Paper>
            )}
          </Transition>
        </Container>
      </Center>

      {/* Footer hint */}
      <Box pos="absolute" bottom={20} left={0} right={0}>
        <Text size="xs" ta="center" c="dark.3">
          Step {active + 1} of {STEP_TITLES.length}
        </Text>
      </Box>
    </Box>
  )
}
