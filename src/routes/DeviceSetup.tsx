import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, Checkbox, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { getOrCreateDeviceId } from '../lib/db/utils/deviceId'
import { useDatabaseStore } from '../stores/useDatabase'

type DeviceSetupFormValues = {
  deviceName: string
  isPrimary: boolean
  scoutName: string
}

export function DeviceSetup(): ReactElement {
  const navigate = useNavigate()
  const db = useDatabaseStore((state) => state.db)
  const [deviceId, setDeviceId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  useEffect(() => {
    const loadDeviceId = async (): Promise<void> => {
      const resolvedDeviceId = await getOrCreateDeviceId()
      setDeviceId(resolvedDeviceId)
    }

    void loadDeviceId()
  }, [])

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

      if (values.scoutName.trim()) {
        await db.collections.scouts.insert({
          id: `scout_${crypto.randomUUID()}`,
          name: values.scoutName.trim(),
          deviceId: resolvedDeviceId,
          createdAt: now,
        })
      }

      notifications.show({
        color: 'green',
        title: 'Device registered',
        message: 'This laptop is ready for scouting.',
      })
      navigate('/')
    } catch (error: unknown) {
      notifications.show({
        color: 'red',
        title: 'Registration failed',
        message: error instanceof Error ? error.message : 'Unable to register device.',
      })
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
          <Badge variant="light">Device ID: {deviceId || 'Not generated yet'}</Badge>

          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack>
              <TextInput
                label="Device Name"
                placeholder="Scout Laptop 1"
                required
                {...form.getInputProps('deviceName')}
              />
              <Checkbox
                label="Is Primary Device?"
                description="Hub device for synchronization"
                {...form.getInputProps('isPrimary', { type: 'checkbox' })}
              />
              <TextInput
                label="Scout Name (optional)"
                placeholder="Alex"
                {...form.getInputProps('scoutName')}
              />
              <Button type="submit" loading={isSubmitting}>
                Register Device
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Stack>
  )
}
