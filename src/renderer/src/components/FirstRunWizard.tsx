import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Progress,
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
  IconMap,
  IconServer,
  IconUsers,
} from '@tabler/icons-react'
import { getTbaStatus } from '../lib/api/tba'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { getFriendlyErrorMessage, handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'
import { RouteHelpModal } from './RouteHelpModal'
import { useDeviceStore } from '../stores/useDeviceStore'
import { useDatabaseStore } from '../stores/useDatabase'
import { brand } from '../config/brand'
import { BrandIcon } from './BrandIcon'

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
  // Matchbook remains useful with no internet. TBA validation is helpful before importing an event,
  // but must never prevent a field device from being configured for offline collection.
  const canContinueFromApiStep = true

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

    setActiveStep((step) => Math.min(step + 1, 2))
  }

  const handleBackStep = (): void => {
    setActiveStep((step) => Math.max(step - 1, 0))
  }

  const handleRoleChange = (nextRole: 'hub' | 'scout'): void => {
    const defaultScoutName = deviceId ? `Scout Laptop ${deviceId.slice(0, 4)}` : ''
    const defaultHubName = deviceId ? `Hub Laptop ${deviceId.slice(0, 4)}` : ''
    const nameIsGenerated = deviceName === defaultScoutName || deviceName === defaultHubName

    setRole(nextRole)
    if (nameIsGenerated) {
      setDeviceName(nextRole === 'hub' ? defaultHubName : defaultScoutName)
    }
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
        message: 'Add a name for this device before finishing setup.',
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
      overlayProps={{ opacity: 0.8, blur: 10 }}
      classNames={{ content: 'wizard-modal-content', body: 'wizard-modal-body' }}
    >
      <Stack gap={0} className="onboarding-shell">
        <Box className="onboarding-header">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group gap="md" wrap="nowrap">
              <Box className="onboarding-mark">
                <BrandIcon size={34} color="#e8f4ff" accentColor="#7abfff" strokeWidth={1.7} />
              </Box>
              <Box>
                <Text className="onboarding-kicker">{brand.name}</Text>
                <Title order={2} className="onboarding-title">
                  Set up this field device
                </Title>
              </Box>
            </Group>
            <RouteHelpModal
              title="First-run setup"
              description="Set this device up once. You can change any of these choices later in Settings."
              steps={[
                { title: 'Choose device role', description: 'One laptop runs the hub; other laptops collect observations.' },
                { title: 'Add event access', description: 'A TBA key is optional and can be tested whenever internet is available.' },
                { title: 'Confirm', description: 'Review the device identity before entering Matchbook.' },
              ]}
              tips={[
                { text: 'You can complete hub setup without internet and import event data later.' },
                { text: 'Use a visible label on every laptop, such as “Red 2” or “Pit Hub”.' },
              ]}
              tooltipLabel="Setup guidance"
              color="frc-blue"
              iconSize={16}
            />
          </Group>
          <Text c="slate.3" maw={520} mt="sm">
            Name the laptop, choose its job, then decide whether to connect event data now or later.
          </Text>
        </Box>

        <Box className="onboarding-progress" aria-label={`Step ${activeStep + 1} of 3`}>
          <Group justify="space-between" mb={8}>
            <Text size="sm" fw={600} c="slate.2">
              {activeStep === 0 ? 'Device role' : activeStep === 1 ? 'Event access' : 'Ready to scout'}
            </Text>
            <Badge variant="light" color="frc-blue" className="mono-number">
              {activeStep + 1}/3
            </Badge>
          </Group>
          <Progress value={((activeStep + 1) / 3) * 100} color="frc-blue" size="xs" radius="xl" />
        </Box>

        <Box className="onboarding-content">

        {isLoadingDefaults ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text c="slate.4">Loading setup defaults...</Text>
          </Group>
        ) : (
          <>
            {activeStep === 0 && (
              <Stack gap="md">
                <Text fw={600} c="slate.1">What will this laptop do?</Text>
                <Group grow align="stretch" className="onboarding-role-group">
                  <Box
                    component="button"
                    type="button"
                    className={role === 'scout' ? 'onboarding-role onboarding-role--selected' : 'onboarding-role'}
                    onClick={() => handleRoleChange('scout')}
                    aria-pressed={role === 'scout'}
                  >
                    <Box component="span" className="onboarding-role-content">
                      <Box component="span" className="onboarding-role-icon onboarding-role-icon--scout"><IconUsers size={18} /></Box>
                      <Box component="span" className="onboarding-role-name">Scout device</Box>
                      <Box component="span" className="onboarding-role-detail">Records one robot at a time, even with no network.</Box>
                    </Box>
                  </Box>
                  <Box
                    component="button"
                    type="button"
                    className={role === 'hub' ? 'onboarding-role onboarding-role--selected' : 'onboarding-role'}
                    onClick={() => handleRoleChange('hub')}
                    aria-pressed={role === 'hub'}
                  >
                    <Box component="span" className="onboarding-role-content">
                      <Box component="span" className="onboarding-role-icon onboarding-role-icon--hub"><IconServer size={18} /></Box>
                      <Box component="span" className="onboarding-role-name">Hub device</Box>
                      <Box component="span" className="onboarding-role-detail">Manages forms, receives sync, and reviews team data.</Box>
                    </Box>
                  </Box>
                </Group>

                <Divider label="Device identity" labelPosition="left" />

                <TextInput
                  label="Device Name"
                  placeholder="Scout Laptop 1"
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.currentTarget.value)}
                  required
                />
                <Text size="xs" c="slate.4">Use the label scouts will recognize at a glance.</Text>

              </Stack>
            )}

            {activeStep === 1 && (
              <Stack gap="md">
                <Card withBorder radius="md" p="lg" className="onboarding-info-card">
                  <Stack gap="sm">
                    <Group gap="xs">
                      <ThemeIcon size={28} variant="light" color="frc-blue">
                        <IconKey size={14} />
                      </ThemeIcon>
                      <Text fw={700}>Event data is optional at setup</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {isHub
                        ? 'Add a TBA key to import schedules and teams. If you are offline, finish setup now and add it later in Settings.'
                        : 'Scouts do not need a TBA key to record matches. Add one only if this laptop will import event data.'}
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
                  Check connection
                </Button>

                {!tbaApiKey.trim() && (
                  <Alert color="frc-blue" variant="light" icon={<IconMap size={16} />}>
                    You can continue without a key. Import an event from the hub when internet is available.
                  </Alert>
                )}

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
                  <Stack gap="sm">
                    <Text fw={700}>This device is ready</Text>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Role</Text>
                      <Text size="sm">{isHub ? 'Hub' : 'Scout'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Device Name</Text>
                      <Text size="sm">{deviceName.trim() || '-'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Event data</Text>
                      <Text size="sm">{tbaApiKey.trim() ? (apiTestState === 'success' ? 'Connection checked' : 'Key saved') : 'Set up later'}</Text>
                    </Group>
                  </Stack>
                </Card>

                <Alert color="success" variant="light" icon={<IconCheck size={16} />}>
                  Your local database is ready. Match scouting works without internet; network sync can be configured from Sync Data.
                </Alert>
              </Stack>
            )}
          </>
        )}

        </Box>

        <Group justify="space-between" className="onboarding-footer">
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
