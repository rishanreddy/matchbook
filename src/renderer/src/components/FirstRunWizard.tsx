import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle,
  IconCheck,
  IconKey,
  IconServer,
  IconUsers,
  IconRocket,
} from '@tabler/icons-react'
import { getTbaStatus } from '../lib/api/tba'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { getFriendlyErrorMessage, handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'
import { RouteHelpModal } from './RouteHelpModal'
import { useDeviceStore } from '../stores/useDeviceStore'
import { useDatabaseStore } from '../stores/useDatabase'
import { brand } from '../config/brand'

type FirstRunWizardProps = {
  opened: boolean
  onComplete: () => void
}

export function FirstRunWizard({ opened, onComplete }: FirstRunWizardProps): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const setDevice = useDeviceStore((state) => state.setDevice)
  const [activeStep, setActiveStep] = useState<number>(0)
  const [deviceId, setDeviceId] = useState<string>('')
  const [deviceName, setDeviceName] = useState<string>('')
  const [role, setRole] = useState<'hub' | 'scout'>('scout')
  const [scoutName, setScoutName] = useState<string>('')
  const [tbaApiKey, setTbaApiKey] = useState<string>('')
  const [apiTestState, setApiTestState] = useState<'idle' | 'success' | 'error'>('idle')
  const [apiTestMessage, setApiTestMessage] = useState<string>('')
  const [isLoadingDefaults, setIsLoadingDefaults] = useState<boolean>(false)
  const [isTestingApiKey, setIsTestingApiKey] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const isHub = role === 'hub'
  const canContinueFromDeviceStep = deviceName.trim().length > 0
  const canContinueFromApiStep = !isHub || (tbaApiKey.trim().length > 0 && apiTestState === 'success')

  useEffect(() => {
    if (!opened) {
      return
    }

    let isCancelled = false
    const loadDefaults = async (): Promise<void> => {
      setIsLoadingDefaults(true)
      try {
        const resolvedDeviceId = await getOrCreateDeviceId()
        if (isCancelled) {
          return
        }

        const fallbackName = localStorage.getItem('device_name')?.trim() || `Scout Laptop ${resolvedDeviceId.slice(0, 4)}`
        const fallbackRole = localStorage.getItem('device_primary') === 'true' ? 'hub' : 'scout'
        const persistedApiKey = localStorage.getItem('tba_api_key')?.trim() ?? ''

        setDeviceId(resolvedDeviceId)
        setDeviceName(fallbackName)
        setRole(fallbackRole)
        setScoutName('')
        setTbaApiKey(persistedApiKey)
        setApiTestState('idle')
        setApiTestMessage('')

        if (!db) {
          return
        }

        const existingDevice = await db.collections.devices.findOne(resolvedDeviceId).exec()
        const existingScout = await db.collections.scouts.findOne({ selector: { deviceId: resolvedDeviceId } }).exec()

        if (isCancelled) {
          return
        }

        if (existingDevice) {
          setDeviceName(existingDevice.name)
          setRole(existingDevice.isPrimary ? 'hub' : 'scout')
        }

        if (existingScout) {
          setScoutName(existingScout.name)
        }
      } catch (error: unknown) {
        handleError(error, 'Load onboarding defaults')
      } finally {
        if (!isCancelled) {
          setIsLoadingDefaults(false)
        }
      }
    }

    void loadDefaults()

    return () => {
      isCancelled = true
    }
  }, [db, opened])

  const handleTestApiKey = async (): Promise<void> => {
    if (!tbaApiKey.trim()) {
      setApiTestState('error')
      setApiTestMessage('Enter a TBA API key before testing.')
      return
    }

    setIsTestingApiKey(true)
    setApiTestState('idle')
    setApiTestMessage('')
    try {
      await getTbaStatus(tbaApiKey.trim())
      setApiTestState('success')
      setApiTestMessage('Connection succeeded. TBA API key validated successfully.')
    } catch (error: unknown) {
      setApiTestState('error')
      setApiTestMessage(getFriendlyErrorMessage(error))
    } finally {
      setIsTestingApiKey(false)
    }
  }

  const handleNextStep = (): void => {
    if (activeStep === 0 && !canContinueFromDeviceStep) {
      notifications.show({
        color: 'yellow',
        title: 'Device name required',
        message: 'Give this laptop a device name before continuing.',
      })
      return
    }

    if (activeStep === 1 && !canContinueFromApiStep) {
      notifications.show({
        color: 'yellow',
        title: 'Test the API key',
        message: 'Hub devices must provide and validate a TBA API key before finishing onboarding.',
      })
      return
    }

    setActiveStep((step) => Math.min(step + 1, 2))
  }

  const handleBackStep = (): void => {
    setActiveStep((step) => Math.max(step - 1, 0))
  }

  const completeWizard = async (): Promise<void> => {
    if (!db) {
      notifications.show({
        color: 'red',
        title: 'Database unavailable',
        message: 'Please wait for the local database to initialize.',
      })
      return
    }

    if (!canContinueFromDeviceStep || !canContinueFromApiStep) {
      notifications.show({
        color: 'yellow',
        title: 'Onboarding incomplete',
        message: 'Complete the required onboarding steps before finishing.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const resolvedDeviceId = deviceId || (await getOrCreateDeviceId())
      const now = new Date().toISOString()
      const existingDevice = await db.collections.devices.findOne(resolvedDeviceId).exec()
      const devicePayload = {
        id: resolvedDeviceId,
        name: deviceName.trim(),
        isPrimary: isHub,
        lastSeenAt: now,
        createdAt: existingDevice?.createdAt ?? now,
      }

      await db.collections.devices.upsert(devicePayload)

      const existingScout = await db.collections.scouts.findOne({ selector: { deviceId: resolvedDeviceId } }).exec()
      const cleanedScoutName = scoutName.trim()
      if (cleanedScoutName) {
        if (existingScout) {
          await existingScout.incrementalPatch({ name: cleanedScoutName })
        } else {
          await db.collections.scouts.insert({
            id: `scout_${crypto.randomUUID()}`,
            name: cleanedScoutName,
            deviceId: resolvedDeviceId,
            createdAt: now,
          })
        }
      } else if (existingScout) {
        await existingScout.remove()
      }

      setDevice({
        deviceId: resolvedDeviceId,
        deviceName: deviceName.trim(),
        isPrimary: isHub,
      })

      localStorage.setItem('tba_api_key', tbaApiKey.trim())

      await db.collections.appState.upsert({
        id: 'global',
        onboardingCompleted: true,
        setupCompletedAt: now,
        updatedAt: now,
      })

      logger.info('First-run onboarding completed', {
        deviceId: resolvedDeviceId,
        role: isHub ? 'hub' : 'scout',
      })

      notifications.show({
        color: 'green',
        title: 'Setup complete',
        message: `${brand.name} is ready for event use.`,
      })

      onComplete()
    } catch (error: unknown) {
      handleError(error, 'Complete onboarding wizard')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!opened) return <></>

  return (
    <Modal
      opened={opened}
      onClose={() => undefined}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      size="lg"
      overlayProps={{ opacity: 0.78, blur: 7 }}
      classNames={{ content: 'wizard-modal-content', body: 'wizard-modal-body' }}
    >
      <Stack gap="xl" p="xl">
        <Box ta="center">
          <ThemeIcon 
            size={72} 
            radius="xl" 
            variant="gradient" 
            gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
            mb="md"
          >
            <IconRocket size={36} />
          </ThemeIcon>
          <Title order={2} c="slate.0" mb="xs">
            Welcome to {brand.name}
          </Title>
          <Text c="slate.3" size="md">
            Complete setup before using the app at an event.
          </Text>
          <Group justify="center" mt="sm">
            <RouteHelpModal
              title="First-Run Setup"
              description="Complete onboarding once per device before event use."
              steps={[
                { title: 'Register Device', description: 'Set a device name and choose Hub or Scout role.' },
                { title: 'Validate Hub API', description: 'Hub devices must verify TBA API connectivity.' },
                { title: 'Finish Setup', description: 'Save onboarding state and proceed to the app.' },
              ]}
              tips={[
                { text: 'Hub role should be used only on the lead scout laptop.' },
                { text: 'Scout name is optional but improves assignment visibility.' },
              ]}
              tooltipLabel="Onboarding help"
              color="frc-blue"
              iconSize={16}
            />
          </Group>
        </Box>

        <Group justify="space-between">
          <Badge variant="light" color="frc-blue">Step {activeStep + 1} of 3</Badge>
          {deviceId && <Badge variant="outline">Device ID: {deviceId}</Badge>}
        </Group>

        {isLoadingDefaults ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text c="slate.4">Loading setup defaults...</Text>
          </Group>
        ) : (
          <>
            {activeStep === 0 && (
              <Stack gap="md">
                <Card withBorder radius="md" p="lg">
                  <Stack>
                    <Text fw={600}>Select Device Role</Text>
                    <SegmentedControl
                      value={role}
                      onChange={(value) => setRole(value === 'hub' ? 'hub' : 'scout')}
                      data={[
                        {
                          value: 'scout',
                          label: (
                            <Group gap={6} justify="center" wrap="nowrap">
                              <IconUsers size={14} />
                              <span>Scout</span>
                            </Group>
                          ),
                        },
                        {
                          value: 'hub',
                          label: (
                            <Group gap={6} justify="center" wrap="nowrap">
                              <IconServer size={14} />
                              <span>Hub</span>
                            </Group>
                          ),
                        },
                      ]}
                      fullWidth
                    />
                    <Text size="xs" c="dimmed">
                      Hub devices manage assignments, forms, and sync ingestion. Scout devices capture match entries.
                    </Text>
                  </Stack>
                </Card>

                <TextInput
                  label="Device Name"
                  placeholder="Scout Laptop 1"
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.currentTarget.value)}
                  required
                />

                <TextInput
                  label="Scout Name (optional)"
                  placeholder="Alex"
                  value={scoutName}
                  onChange={(event) => setScoutName(event.currentTarget.value)}
                />
              </Stack>
            )}

            {activeStep === 1 && (
              <Stack gap="md">
                <Card withBorder radius="md" p="lg">
                  <Stack>
                    <Group gap="xs">
                      <ThemeIcon size={24} variant="light" color="frc-blue">
                        <IconKey size={14} />
                      </ThemeIcon>
                      <Text fw={600}>The Blue Alliance API Key</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {isHub
                        ? 'Hub devices must validate a TBA API key to import event data.'
                        : 'Scouts can skip this now, but adding a key here is recommended.'}
                    </Text>
                  </Stack>
                </Card>

                <PasswordInput
                  label="TBA API Key"
                  placeholder="Enter API key"
                  value={tbaApiKey}
                  onChange={(event) => {
                    setTbaApiKey(event.currentTarget.value)
                    setApiTestState('idle')
                    setApiTestMessage('')
                  }}
                />

                <Button
                  variant="light"
                  onClick={() => void handleTestApiKey()}
                  loading={isTestingApiKey}
                  disabled={!tbaApiKey.trim()}
                >
                  Test API Connection
                </Button>

                {apiTestState !== 'idle' && (
                  <Alert
                    color={apiTestState === 'success' ? 'green' : 'red'}
                    icon={apiTestState === 'success' ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
                  >
                    {apiTestMessage}
                  </Alert>
                )}
              </Stack>
            )}

            {activeStep === 2 && (
              <Stack gap="md">
                <Card withBorder radius="md" p="lg">
                  <Stack>
                    <Text fw={600}>Review Setup</Text>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Role</Text>
                      <Text size="sm">{isHub ? 'Hub' : 'Scout'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Device Name</Text>
                      <Text size="sm">{deviceName.trim() || '-'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Scout Name</Text>
                      <Text size="sm">{scoutName.trim() || 'Not set'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">TBA API Key</Text>
                      <Text size="sm">{tbaApiKey.trim() ? 'Saved' : 'Not set'}</Text>
                    </Group>
                  </Stack>
                </Card>

                {isHub && apiTestState !== 'success' && (
                  <Alert color="yellow">
                    Hub setup requires a validated TBA API key. Go back and run connection test.
                  </Alert>
                )}
              </Stack>
            )}
          </>
        )}

        <Group justify="space-between">
          <Button variant="subtle" onClick={handleBackStep} disabled={activeStep === 0 || isLoadingDefaults || isSubmitting}>
            Back
          </Button>

          {activeStep < 2 ? (
            <Button
              onClick={handleNextStep}
              disabled={
                isLoadingDefaults ||
                isSubmitting ||
                (activeStep === 0 && !canContinueFromDeviceStep) ||
                (activeStep === 1 && !canContinueFromApiStep)
              }
              variant="gradient"
              gradient={{ from: 'frc-blue.5', to: 'frc-blue.7' }}
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={() => void completeWizard()}
              loading={isSubmitting}
              disabled={isLoadingDefaults}
              variant="gradient"
              gradient={{ from: 'success.5', to: 'success.7' }}
            >
              Finish Setup
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
