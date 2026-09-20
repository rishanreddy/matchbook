import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Alert, Anchor, Button, Group, Modal, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconCircleCheck, IconArrowUpCircle } from '@tabler/icons-react'
import { brand } from '../config/brand'
import { summarizeRelease } from '../lib/utils/updateInfo'

type AboutDialogProps = {
  opened: boolean
  onClose: () => void
  version: string
}

type CheckState = 'idle' | 'checking' | 'available' | 'up-to-date' | 'unsupported' | 'error'

export function AboutDialog({ opened, onClose, version }: AboutDialogProps): ReactElement {
  const [state, setState] = useState<CheckState>('idle')
  const [detail, setDetail] = useState<string>('')

  // The button used to fire the IPC call and show nothing at all, so from the user's
  // side it looked broken. The dialog sits above everything else, so it has to report
  // the result itself rather than relying on the Settings screen behind it.
  useEffect(() => {
    if (!window.electronAPI) {
      return
    }

    const offChecking = window.electronAPI.onUpdaterChecking(() => setState('checking'))
    const offAvailable = window.electronAPI.onUpdaterAvailable((info) => {
      const release = summarizeRelease(info)
      setDetail(release?.version ? `Version ${release.version} is ready to download.` : '')
      setState('available')
    })
    const offNotAvailable = window.electronAPI.onUpdaterNotAvailable(() => {
      setDetail('')
      setState('up-to-date')
    })
    const offError = window.electronAPI.onUpdaterError((message) => {
      setDetail(message)
      setState('error')
    })

    return () => {
      offChecking()
      offAvailable()
      offNotAvailable()
      offError()
    }
  }, [])

  // Every dismissal path (button, overlay, Escape) routes through Modal's onClose,
  // so clearing here covers them all without reaching for an effect.
  const handleClose = useCallback((): void => {
    setState('idle')
    setDetail('')
    onClose()
  }, [onClose])

  const handleCheck = useCallback(async (): Promise<void> => {
    setState('checking')
    setDetail('')

    if (!window.electronAPI) {
      setDetail('Update checks only work in the installed app.')
      setState('unsupported')
      return
    }

    try {
      // A dev or unpackaged build resolves without ever emitting an updater event,
      // so the result has to be read here or the button spins forever.
      const result = await window.electronAPI.checkForUpdates()
      if (!result.supported) {
        setDetail(result.reason ?? 'Update checks are disabled for this build.')
        setState('unsupported')
      }
    } catch (error: unknown) {
      setDetail(error instanceof Error ? error.message : 'Could not reach GitHub.')
      setState('error')
    }
  }, [])

  return (
    <Modal opened={opened} onClose={handleClose} title={`About ${brand.name}`} size="lg">
      <Stack>
        <Title order={4}>{brand.name}</Title>
        <Text size="sm">Version {version}</Text>
        <Text size="sm">License: MIT</Text>
        <Text size="sm">Built with Electron, React, TypeScript, Mantine, Vite, and RxDB.</Text>
        <Anchor href={brand.repoUrl} target="_blank" rel="noreferrer">
          GitHub repository
        </Anchor>

        {state === 'available' && (
          <Alert color="amber" variant="light" icon={<IconArrowUpCircle size={16} />} title="Update available">
            {detail || 'A newer version is ready to download.'} Close this dialog to download it from Settings.
          </Alert>
        )}
        {state === 'up-to-date' && (
          <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />}>
            You are on the latest version.
          </Alert>
        )}
        {(state === 'error' || state === 'unsupported') && (
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title="Could not check">
            {detail || 'Matchbook could not reach GitHub. This is expected with no internet.'}
          </Alert>
        )}

        <Group justify="space-between">
          <Button variant="default" onClick={handleClose}>
            Close
          </Button>
          <Button loading={state === 'checking'} onClick={() => void handleCheck()}>
            {state === 'checking' ? 'Checking' : 'Check for updates'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
