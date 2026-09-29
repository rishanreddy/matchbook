import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Modal, Text } from '@mantine/core'
import { IconAlertTriangle, IconCamera } from '@tabler/icons-react'
import { useWakeLock } from '../../lib/hooks/useWakeLock'
import { parsePairing } from './wifi'
import { useQrScanner } from './useQrScanner'

type PairingScannerProps = {
  opened: boolean
  onClose: () => void
  onPaired: (pairing: { url: string; token: string; name: string }) => void
}

/** Reads the small code on the lead scout's screen, which carries their address and code. */
export function PairingScanner({ opened, onClose, onPaired }: PairingScannerProps): ReactElement {
  const [note, setNote] = useState<string | null>(null)
  const paired = useRef(false)
  const stopRef = useRef<() => void>(() => undefined)

  const handleCode = useCallback(
    (text: string): void => {
      if (paired.current) {
        return
      }

      const pairing = parsePairing(text)
      if (!pairing) {
        setNote('That is not the lead scout’s pairing code. Point the camera at the code shown on their Wi-Fi screen.')
        return
      }

      paired.current = true
      stopRef.current()
      onPaired(pairing)
    },
    [onPaired],
  )

  const { videoRef, status, failure, start, stop } = useQrScanner(handleCode)

  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  useWakeLock(opened && status === 'scanning')

  useEffect(() => {
    if (!opened) {
      return
    }

    paired.current = false
    // The video element mounts with the modal; wait a tick so its ref is attached.
    const timer = window.setTimeout(() => void start(), 50)
    return () => {
      window.clearTimeout(timer)
      stop()
      setNote(null)
    }
    // start/stop are stable enough for this: re-running would restart the camera mid-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  return (
    <Modal opened={opened} onClose={onClose} title="Scan the lead scout’s code" size="lg">
      <div className="qr-preview" style={{ marginBottom: '16px' }}>
        <video ref={videoRef} muted playsInline aria-label="Camera view" />
      </div>

      {failure ? (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Could not start the camera">
          {failure.message}
        </Alert>
      ) : (
        <Text size="sm" c="slate.2" aria-live="polite">
          {status === 'starting' ? 'Starting the camera…' : 'Point the camera at the code on the lead scout’s screen.'}
        </Text>
      )}
      {note && (
        <Text size="sm" c="warning.4" mt="xs">
          {note}
        </Text>
      )}

      <Group justify="flex-end" mt="md">
        <Button variant="default" leftSection={<IconCamera size={16} />} onClick={onClose}>
          Cancel
        </Button>
      </Group>
    </Modal>
  )
}
