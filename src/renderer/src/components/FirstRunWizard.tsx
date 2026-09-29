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
import { notify } from '../lib/utils/notify'
import { useNavigate } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconCheck,
  IconKey,
  IconServer,
  IconUsers,
} from '@tabler/icons-react'
import { getTbaStatus } from '../lib/api/tba'
import { getDeviceTag, getOrCreateDeviceId } from '../lib/db/utils/deviceId'
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

type WizardStep = 'role' | 'event' | 'ready'

const STEP_TITLES: Record<WizardStep, string> = {
  role: 'Who is using this laptop?',
  event: 'The Blue Alliance (optional)',
  ready: 'All set',
}

export function FirstRunWizard({ opened, onComplete }: FirstRunWizardProps): ReactElement {
  const db = useDatabaseStore((state) => state.db)
  const setDevice = useDeviceStore((state) => state.setDevice)
  const navigate = useNavigate()
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
  // Only the lead scout imports events, so only the lead scout is asked about a Blue Alliance key.
  const steps: WizardStep[] = isHub ? ['role', 'event', 'ready'] : ['role', 'ready']
  const currentStep: WizardStep = steps[Math.min(activeStep, steps.length - 1)]
  const lastStepIndex = steps.length - 1
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

        const fallbackName = localStorage.getItem('device_name')?.trim() || `Scout Laptop ${getDeviceTag(resolvedDeviceId)}`
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
    if (currentStep === 'role' && !canContinueFromDeviceStep) {
      notify({
        color: 'yellow',
        title: 'Device name required',
        message: 'Give this laptop a device name before continuing.',
      })
      return
    }

    setActiveStep((step) => Math.min(step + 1, lastStepIndex))
  }

  const handleBackStep = (): void => {
    setActiveStep((step) => Math.max(step - 1, 0))
  }

  const handleRoleChange = (nextRole: 'hub' | 'scout'): void => {
    const defaultScoutName = deviceId ? `Scout Laptop ${getDeviceTag(deviceId)}` : ''
    const defaultHubName = deviceId ? `Hub Laptop ${getDeviceTag(deviceId)}` : ''
    const nameIsGenerated = deviceName === defaultScoutName || deviceName === defaultHubName

    setRole(nextRole)
    if (nameIsGenerated) {
      setDeviceName(nextRole === 'hub' ? defaultHubName : defaultScoutName)
    }
  }

  const completeWizard = async (options: { openGuide?: boolean } = {}): Promise<void> => {
    if (!db) {
      notify({
        color: 'red',
        title: 'Database unavailable',
        message: 'Please wait for the local database to initialize.',
      })
      return
    }

    if (!canContinueFromDeviceStep || !canContinueFromApiStep) {
      notify({
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

      notify({
        color: 'green',
        title: 'Setup complete',
        message: `${brand.name} is ready for event use.`,
      })

      onComplete()
      if (options.openGuide) {
        navigate('/help')
      }
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
                { title: 'Choose a role', description: 'One laptop is the lead scout. Every other laptop is a scout.' },
                { title: 'Blue Alliance key (lead scout only)', description: 'Optional. It lets Matchbook load the match schedule when you have internet.' },
                { title: 'Finish', description: 'Check the name, then start using Matchbook.' },
              ]}
              tips={[
                { text: 'You can finish setup with no internet and load the event later.' },
                { text: 'Give every laptop a name your team will recognize, such as “Red 2” or “Pit laptop”.' },
              ]}
              tooltipLabel="Setup guidance"
              color="frc-blue"
              iconSize={16}
            />
          </Group>
          <Text c="slate.3" maw={520} mt="sm" className="onboarding-lede">
            {isHub
              ? 'Name this laptop, then we will set up the lead scout tools.'
              : 'Name this laptop. It takes about a minute, and you can change it later in Settings.'}
          </Text>
        </Box>

        <Box className="onboarding-progress" aria-label={`Step ${activeStep + 1} of ${steps.length}`}>
          <Group justify="space-between" mb={8}>
            <Text size="sm" fw={600} c="slate.2">
              {STEP_TITLES[currentStep]}
            </Text>
            <Badge variant="light" color="frc-blue" className="mono-number">
              {activeStep + 1}/{steps.length}
            </Badge>
          </Group>
          <Progress value={((activeStep + 1) / steps.length) * 100} color="frc-blue" size="xs" radius="xl" />
        </Box>

        <Box className="onboarding-content">

        {isLoadingDefaults ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text c="slate.4">Loading setup defaults...</Text>
          </Group>
        ) : (
          <>
            {currentStep === 'role' && (
              <Stack gap="md">
                <Text fw={600} c="slate.1">What will this laptop be used for?</Text>
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
                      <Box component="span" className="onboarding-role-name">Scout</Box>
                      <Box component="span" className="onboarding-role-detail">I will watch matches and record what the robots do. Works with no Wi-Fi.</Box>
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
                      <Box component="span" className="onboarding-role-name">Lead scout</Box>
                      <Box component="span" className="onboarding-role-detail">I will build the form, collect everyone’s scouting, and compare teams.</Box>
                    </Box>
                  </Box>
                </Group>

                <Divider label="Name this laptop" labelPosition="left" />

                <TextInput
                  label="Laptop name"
                  placeholder="Scout Laptop 1"
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.currentTarget.value)}
                  description="Something your team will recognize, like “Scout 3” or “Red Alliance”."
                  required
                />

              </Stack>
            )}

            {currentStep === 'event' && (
              <Stack gap="md">
                <Card withBorder radius="md" p="lg" className="onboarding-info-card">
                  <Stack gap="sm">
                    <Group gap="xs">
                      <ThemeIcon size={28} variant="light" color="frc-blue">
                        <IconKey size={14} />
                      </ThemeIcon>
                      <Text fw={600}>You can skip this</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      Matchbook can load the match schedule for you from The Blue Alliance (thebluealliance.com). That needs a
                      free key from their website and an internet connection. No internet right now? Skip it, and add the key
                      later in Settings.
                    </Text>
                  </Stack>
                </Card>

                <PasswordInput
                  label="The Blue Alliance key"
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

            {currentStep === 'ready' && (
              <Stack gap="md">
                <Card withBorder radius="md" p="lg">
                  <Stack gap="sm">
                    <Text fw={700}>This device is ready</Text>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Role</Text>
                      <Text size="sm">{isHub ? 'Hub' : 'Scout'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Device name</Text>
                      <Text size="sm">{deviceName.trim() || '-'}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Event data</Text>
                      <Text size="sm">{tbaApiKey.trim() ? (apiTestState === 'success' ? 'Connection checked' : 'Key saved') : 'Set up later'}</Text>
                    </Group>
                  </Stack>
                </Card>

                <Card withBorder radius="md" p="lg">
                  <Stack gap="xs">
                    <Text fw={600}>What happens next</Text>
                    <Text size="sm" c="dimmed" component="div">
                      {isHub ? (
                        <ol style={{ margin: 0, paddingInlineStart: 18 }}>
                          <li>Import your event, in Events.</li>
                          <li>Build or check the scouting form, in Form Builder.</li>
                          <li>In Sync Data, press Start receiving, so scouts can send you their entries.</li>
                        </ol>
                      ) : (
                        <ol style={{ margin: 0, paddingInlineStart: 18 }}>
                          <li>Get the scouting form from the lead scout, in Sync Data.</li>
                          <li>Press Scout Match for each match you watch.</li>
                          <li>Every few matches, send your entries to the lead scout.</li>
                        </ol>
                      )}
                    </Text>
                  </Stack>
                </Card>
              </Stack>
            )}
          </>
        )}

        </Box>

        <Group justify="space-between" className="onboarding-footer">
          <Button variant="subtle" onClick={handleBackStep} disabled={activeStep === 0 || isLoadingDefaults || isSubmitting}>
            Back
          </Button>

          {activeStep < lastStepIndex ? (
            <Button
              onClick={handleNextStep}
              disabled={
                isLoadingDefaults ||
                isSubmitting ||
                (currentStep === 'role' && !canContinueFromDeviceStep) ||
                (currentStep === 'event' && !canContinueFromApiStep)
              }
            >
              Continue
            </Button>
          ) : (
            <Group gap="xs">
              <Button
                variant="default"
                onClick={() => void completeWizard({ openGuide: true })}
                disabled={isLoadingDefaults || isSubmitting}
              >
                Finish and show me how
              </Button>
              <Button onClick={() => void completeWizard()} loading={isSubmitting} disabled={isLoadingDefaults}>
                Finish setup
              </Button>
            </Group>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
