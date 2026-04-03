import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Group, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
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
        const existingScout = await db.collections.scouts.findOne({ selector: { deviceId: resolvedDeviceId } }).exec()

        setHasExistingRegistration(Boolean(existingDevice))

        formRef.current.setValues({
          deviceName: existingDevice?.name ?? '',
          isPrimary: existingDevice?.isPrimary ?? fallbackPrimary,
          scoutName: existingScout?.name ?? '',
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
      notifications.show({
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

      const existingScout = await db.collections.scouts.findOne({ selector: { deviceId: resolvedDeviceId } }).exec()
      const scoutName = values.scoutName.trim()

      if (scoutName) {
        if (existingScout) {
          await existingScout.incrementalPatch({ name: scoutName })
        } else {
          await db.collections.scouts.insert({
            id: `scout_${crypto.randomUUID()}`,
            name: scoutName,
            deviceId: resolvedDeviceId,
            createdAt: now,
          })
        }
      } else if (existingScout) {
        await existingScout.remove()
      }

      notifications.show({
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
    <Stack>
      <Title order={2}>Device Setup</Title>
      <Card withBorder radius="md" p="lg">
        <Stack>
          <Text c="dimmed">Register this laptop so it can be identified and configured for sync.</Text>
          <Text size="sm" c="slate.4">
            Tip: choose <strong>Hub</strong> for the lead scout laptop, and <strong>Scout</strong> for data-entry laptops.
          </Text>
          <Badge variant="light">Device ID: {deviceId || 'Not generated yet'}</Badge>
          {hasExistingRegistration && (
            <Badge color="green" variant="light">
              Existing registration loaded
            </Badge>
          )}

          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack>
              <TextInput
                label="Device Name"
                placeholder="Scout Laptop 1"
                {...form.getInputProps('deviceName')}
                disabled={isInitializing}
              />
              <Stack gap={6}>
                <Text size="sm" fw={500}>Device Role</Text>
                <SegmentedControl
                  value={form.values.isPrimary ? 'hub' : 'scout'}
                  onChange={(value) => form.setFieldValue('isPrimary', value === 'hub')}
                  data={[
                    { label: 'Scout Device', value: 'scout' },
                    { label: 'Hub Device', value: 'hub' },
                  ]}
                  fullWidth
                  disabled={isInitializing}
                />
                <Text size="xs" c="dimmed">Hub devices collect data from scout devices and manage assignments.</Text>
              </Stack>
              <TextInput
                label="Scout Name (optional)"
                placeholder="Alex"
                {...form.getInputProps('scoutName')}
                disabled={isInitializing}
              />
              <Group justify="space-between">
                <Button variant="light" onClick={() => navigate('/settings')}>
                  Back to Settings
                </Button>
                <Button type="submit" loading={isSubmitting} disabled={isInitializing}>
                  {hasExistingRegistration ? 'Update Device' : 'Register Device'}
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Stack>
  )
}
