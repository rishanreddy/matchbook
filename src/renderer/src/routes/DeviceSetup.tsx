import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Badge, Box, Button, Card, Group, Paper, SegmentedControl, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notify } from '../lib/utils/notify'
import { IconDeviceLaptop, IconServer, IconUser, IconUsers } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { RouteHelpModal } from '../components/RouteHelpModal'
import { listRoster, saveMyScoutName, scoutsForDevice } from '../features/roster/rosterService'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { useDatabaseStore } from '../stores/useDatabase'
import { useDeviceStore } from '../stores/useDeviceStore'
import { handleError } from '../lib/utils/errorHandler'
import { logger } from '../lib/utils/logger'

type DeviceSetupFormValues = {
  deviceName: string
  isPrimary: boolean
  scoutName: string
}

export function DeviceSetup(): ReactElement {
  const navigate = useNavigate()
  const db = useDatabaseStore((state) => state.db)
  const setDevice = useDeviceStore((state) => state.setDevice)
  const [deviceId, setDeviceId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isInitializing, setIsInitializing] = useState<boolean>(false)
  const [hasExistingRegistration, setHasExistingRegistration] = useState<boolean>(false)

  const form = useForm<DeviceSetupFormValues>({
    initialValues: {
      deviceName: '',
      isPrimary: false,
      scoutName: '',
    },
    validate: {
      deviceName: (value) => (value.trim().length > 0 ? null : 'Device name is required'),
    },
  })
  const formRef = useRef(form)

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    const loadDeviceDetails = async (): Promise<void> => {
      setIsInitializing(true)
      try {
        const resolvedDeviceId = await getOrCreateDeviceId()
        setDeviceId(resolvedDeviceId)

        const fallbackName = localStorage.getItem('device_name')?.trim() || 'Laptop 1'
        const fallbackPrimary = localStorage.getItem('device_primary') === 'true'

        if (!db) {
          formRef.current.setValues({
            deviceName: '',
            isPrimary: fallbackPrimary,
            scoutName: '',
          })
          return
        }

        const existingDevice = await db.collections.devices.findOne(resolvedDeviceId).exec()
        const existingScout = scoutsForDevice(await listRoster(db), resolvedDeviceId)[0]

        setHasExistingRegistration(Boolean(existingDevice))

        formRef.current.setValues({
          deviceName: existingDevice?.name ?? '',
          isPrimary: existingDevice?.isPrimary ?? fallbackPrimary,
          // A scout who never typed a name appears on the roster under the laptop's name; showing
          // that here would pretend they chose it, so the field stays empty in that case.
          scoutName: existingScout && existingScout.name !== existingDevice?.name ? existingScout.name : '',
        })

        setDevice({
          deviceId: resolvedDeviceId,
          deviceName: existingDevice?.name ?? fallbackName,
          isPrimary: existingDevice?.isPrimary ?? fallbackPrimary,
        })
      } catch (error: unknown) {
        handleError(error, 'Load device setup defaults')
      } finally {
        setIsInitializing(false)
      }
    }

    void loadDeviceDetails()
  }, [db, setDevice])

  const handleSubmit = async (values: DeviceSetupFormValues): Promise<void> => {
    if (!db) {
      notify({
        color: 'red',
        title: 'Database unavailable',
        message: 'Please wait for database initialization and try again.',
      })
      return
    }

    setIsSubmitting(true)
    logger.info('Device setup submission started')
    try {
      const resolvedDeviceId = await getOrCreateDeviceId()
      setDeviceId(resolvedDeviceId)

      const now = new Date().toISOString()
      const existingDevice = await db.collections.devices.findOne(resolvedDeviceId).exec()

      const devicePayload = {
        id: resolvedDeviceId,
        name: values.deviceName.trim(),
        isPrimary: values.isPrimary,
        lastSeenAt: now,
        createdAt: existingDevice?.createdAt ?? now,
      }

      await db.collections.devices.upsert(devicePayload)
      setHasExistingRegistration(true)

      setDevice({
        deviceId: resolvedDeviceId,
        deviceName: values.deviceName.trim(),
        isPrimary: values.isPrimary,
      })

      await saveMyScoutName(
        db,
        { id: resolvedDeviceId, name: values.deviceName },
        // A scout who gives no name of their own is listed under their laptop's name, so the lead
        // scout still sees them. The lead scout's own laptop is only listed if they type a name.
        values.scoutName.trim() || (values.isPrimary ? '' : values.deviceName),
      )

      notify({
        color: 'green',
        title: 'Device registered',
        message: 'This laptop is ready for scouting.',
      })
      logger.info('Device setup submission successful', { deviceId: resolvedDeviceId })
      navigate('/')
    } catch (error: unknown) {
      handleError(error, 'Device registration')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Box className="container-wide">
      <Stack gap={24}>
        <Card
          p="lg"
          radius="lg"
          style={{
            background: 'linear-gradient(135deg, rgba(154, 166, 182, 0.08), rgba(154, 166, 182, 0.03))',
            border: '1px solid rgba(154, 166, 182, 0.2)',
          }}
          className="animate-fadeInUp"
        >
          <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
            <Group gap="md" align="center" wrap="nowrap">
              <ThemeIcon size={52} radius="xl" variant="light">
                <IconDeviceLaptop size={24} stroke={1.6} />
              </ThemeIcon>
              <Box>
                <Title order={1} c="slate.0" data-tour="device-setup" style={{ fontSize: 28, fontWeight: 700 }}>
                  Device Setup
                </Title>
                <Text size="sm" c="slate.4">
                  Register this laptop and assign its scouting role
                </Text>
              </Box>
            </Group>

            <RouteHelpModal
              title="Device Setup Guide"
              description="Register each laptop once before event use."
              steps={[
                { title: 'Name the Device', description: 'Use a clear label like Scout Laptop 1.' },
                { title: 'Pick Role', description: 'Lead scout for the one laptop that collects everything. Scout for every other laptop.' },
                { title: 'Save Registration', description: 'Store this identity for sync and assignments.' },
              ]}
              tips={[
                { text: 'Only one laptop should be the lead scout.' },
                { text: 'Your name is how the lead scout sees you on the roster when assigning matches.' },
              ]}
              tooltipLabel="Device setup help"
              color="frc-blue"
            />
          </Group>

          <Group gap="xs" mt="md" wrap="wrap">
            <Badge variant="light" color="frc-blue" radius="md" className="mono-number">
              Device ID: {deviceId || 'Not generated yet'}
            </Badge>
            {hasExistingRegistration && (
              <Badge color="success" variant="light" radius="md">
                Existing registration loaded
              </Badge>
            )}
          </Group>
        </Card>

        <Card
          p="lg"
          radius="lg"
          style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
          className="animate-fadeInUp stagger-1"
        >
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <TextInput
                label="Device name"
                placeholder="Scout Laptop 1"
                {...form.getInputProps('deviceName')}
                disabled={isInitializing}
                size="md"
              />

              <Paper p="md" radius="md" style={{ backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-subtle)' }}>
                <Stack gap={6}>
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={600} c="slate.1">Device Role</Text>
                    <Badge color={form.values.isPrimary ? 'frc-orange' : 'frc-blue'} variant="light" radius="md">
                      {form.values.isPrimary ? 'Lead scout' : 'Scout'}
                    </Badge>
                  </Group>
                  <SegmentedControl
                    value={form.values.isPrimary ? 'hub' : 'scout'}
                    onChange={(value) => form.setFieldValue('isPrimary', value === 'hub')}
                    data={[
                      {
                        label: (
                          <Group gap={6} justify="center" wrap="nowrap">
                            <IconUsers size={14} />
                            <span>Scout</span>
                          </Group>
                        ),
                        value: 'scout',
                      },
                      {
                        label: (
                          <Group gap={6} justify="center" wrap="nowrap">
                            <IconServer size={14} />
                            <span>Lead scout</span>
                          </Group>
                        ),
                        value: 'hub',
                      },
                    ]}
                    fullWidth
                    disabled={isInitializing}
                  />
                  <Text size="xs" c="slate.4">
                    The lead scout collects everyone’s scouting and builds the form. Scouts watch matches and record what they see.
                  </Text>
                </Stack>
              </Paper>

              <TextInput
                label={form.values.isPrimary ? 'Your name (only if you also scout)' : 'Your name'}
                description={
                  form.values.isPrimary
                    ? 'Adds you to the roster so you can be assigned matches too.'
                    : 'The lead scout sees this when they assign you matches. Leave it empty to use the laptop name.'
                }
                placeholder="Alex"
                leftSection={<IconUser size={14} />}
                {...form.getInputProps('scoutName')}
                disabled={isInitializing}
                size="md"
              />

              <Group justify="space-between" wrap="wrap">
                <Button variant="light" color="slate" onClick={() => navigate('/settings')}>
                  Back to Settings
                </Button>
                <Button
                  type="submit"
                  loading={isSubmitting}
                  disabled={isInitializing}
                  fw={700}
                >
                  {hasExistingRegistration ? 'Update Device' : 'Register Device'}
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      </Stack>
    </Box>
  )
}
