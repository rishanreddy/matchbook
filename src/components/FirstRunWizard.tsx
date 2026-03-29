import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getEventsByYear } from '../lib/api/tba'

type FirstRunWizardProps = {
  opened: boolean
  onComplete: () => void
}

export function FirstRunWizard({ opened, onComplete }: FirstRunWizardProps): ReactElement {
  const [active, setActive] = useState<number>(0)
  const [deviceName, setDeviceName] = useState<string>(localStorage.getItem('device_name') ?? '')
  const [isPrimary, setIsPrimary] = useState<boolean>(localStorage.getItem('device_primary') === 'true')
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('tba_api_key') ?? '')
  const [isTesting, setIsTesting] = useState<boolean>(false)
  const [isConnected, setIsConnected] = useState<boolean>(false)

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

  return (
    <Modal opened={opened} onClose={() => undefined} withCloseButton={false} closeOnEscape={false} closeOnClickOutside={false} size="xl" title="Welcome Setup">
      <Stack>
        <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
          <Stepper.Step label="Welcome">
            <Title order={4}>Welcome to Offline Scouting Manager</Title>
            <Text size="sm" c="dimmed">
              Let&apos;s configure this device before your first event.
            </Text>
          </Stepper.Step>
          <Stepper.Step label="Device setup">
            <Stack>
              <TextInput
                label="Device name"
                placeholder="e.g. Team 9999 - Tablet 1"
                value={deviceName}
                onChange={(event) => setDeviceName(event.currentTarget.value)}
              />
              <Checkbox
                label="This is the primary sync device"
                checked={isPrimary}
                onChange={(event) => setIsPrimary(event.currentTarget.checked)}
              />
            </Stack>
          </Stepper.Step>
          <Stepper.Step label="TBA API">
            <PasswordInput
              label="TBA API key"
              placeholder="Paste your key"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
            />
          </Stepper.Step>
          <Stepper.Step label="Test connection">
            <Stack>
              <Button onClick={() => void testConnection()} loading={isTesting}>
                Test Connection
              </Button>
              {isConnected ? (
                <Alert color="green" title="Connected">
                  API key works. You can continue.
                </Alert>
              ) : (
                <Text size="sm" c="dimmed">
                  Verify your API key before finishing setup.
                </Text>
              )}
            </Stack>
          </Stepper.Step>
          <Stepper.Step label="Complete">
            <Alert color="blue" title="Setup complete">
              You&apos;re ready to scout offline and sync when available.
            </Alert>
          </Stepper.Step>
        </Stepper>

        <Group justify="space-between">
          <Button variant="default" disabled={active === 0} onClick={() => setActive((value) => value - 1)}>
            Back
          </Button>
          {active < 4 ? (
            <Button
              onClick={() => {
                persistStepData()
                setActive((value) => value + 1)
              }}
              disabled={!canContinue}
            >
              Next
            </Button>
          ) : (
            <Button onClick={completeWizard}>Start using app</Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
