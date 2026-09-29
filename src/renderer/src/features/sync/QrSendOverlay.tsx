import type { ReactElement } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Group, SegmentedControl, Text } from '@mantine/core'
import { IconPlayerPause, IconPlayerPlay, IconX } from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import type { QrDensity, QrTransfer } from '../../../../shared/qrTransfer'
import { useWakeLock } from '../../lib/hooks/useWakeLock'

type Speed = 'slow' | 'normal' | 'fast'

// How long each code stays up. The receiving camera reads the screen many times a
// second, so even the fast setting gives it several looks at every code.
const SPEED_MS: Record<Speed, number> = { slow: 700, normal: 400, fast: 250 }

type QrSendOverlayProps = {
  transfer: QrTransfer
  /** What is being sent, in words: "24 scouting entries". */
  summary: string
  density: QrDensity
  onDensityChange: (density: QrDensity) => void
  onClose: () => void
}

/**
 * Shows a transfer as a full-window loop of QR codes.
 *
 * It fills the window because how large the code is on screen is the single biggest
 * factor in whether a laptop webcam can read it. The size follows the window as it
 * changes, and codes advance on their own: the receiver collects them in any order
 * as the loop repeats, so nobody has to press Next in step with anybody else.
 *
 * The parent keys this component by session, so a new transfer starts from code 1.
 */
export function QrSendOverlay({ transfer, summary, density, onDensityChange, onClose }: QrSendOverlayProps): ReactElement {
  const frames = transfer.frames
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<Speed>('normal')
  const [size, setSize] = useState(320)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const doneRef = useRef<HTMLButtonElement | null>(null)

  useWakeLock(true)

  useEffect(() => {
    if (paused || frames.length <= 1) {
      return
    }

    const timer = window.setInterval(() => setIndex((current) => (current + 1) % frames.length), SPEED_MS[speed])
    return () => window.clearInterval(timer)
  }, [paused, frames.length, speed])

  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) {
      return
    }

    const measure = (): void => setSize(Math.max(160, Math.floor(Math.min(area.clientWidth, area.clientHeight)) - 16))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    doneRef.current?.focus()
    return () => previouslyFocused?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === ' ' && event.target === document.body) {
        event.preventDefault()
        setPaused((value) => !value)
      } else if (event.key === 'ArrowRight') {
        setIndex((current) => (current + 1) % frames.length)
      } else if (event.key === 'ArrowLeft') {
        setIndex((current) => (current - 1 + frames.length) % frames.length)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [frames.length, onClose])

  const passSeconds = Math.max(1, Math.round((frames.length * SPEED_MS[speed]) / 1000))

  return (
    <div className="qr-send" role="dialog" aria-modal="true" aria-label="Showing QR codes">
      <div className="qr-send__bar">
        <Button ref={doneRef} leftSection={<IconX size={16} />} onClick={onClose}>
          Done
        </Button>
        <div className="qr-send__title">
          <Text fw={600} c="slate.0" truncate>
            Sending {summary}
          </Text>
          <Text size="xs" c="slate.3" truncate>
            On the other laptop: Sync Data, then QR codes, then Receive. Point its camera at this screen.
          </Text>
        </div>
      </div>

      <div ref={areaRef} className="qr-send__area">
        <div className="qr-send__code" style={{ width: size, height: size }}>
          <QRCodeSVG
            value={frames[index] ?? ''}
            size={size}
            level="M"
            marginSize={4}
            bgColor="#ffffff"
            fgColor="#000000"
            title={`QR code ${index + 1} of ${frames.length}`}
          />
        </div>
      </div>

      <div className="qr-send__controls">
        <Text size="sm" c="slate.2" className="mono-number" aria-live="off">
          Code {index + 1} of {frames.length}
          {frames.length > 1 ? ` · repeats about every ${passSeconds} s` : ''}
        </Text>

        <Group gap="md" justify="center" wrap="wrap">
          {frames.length > 1 && (
            <Button
              variant="default"
              size="compact-md"
              leftSection={paused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
          )}

          {frames.length > 1 && (
            <SegmentedControl
              size="xs"
              value={speed}
              onChange={(value) => setSpeed(value as Speed)}
              aria-label="How long each code stays on screen"
              data={[
                { value: 'slow', label: 'Slower' },
                { value: 'normal', label: 'Normal' },
                { value: 'fast', label: 'Faster' },
              ]}
            />
          )}

          <SegmentedControl
            size="xs"
            value={density}
            onChange={(value) => onDensityChange(value as QrDensity)}
            aria-label="How detailed each code is"
            data={[
              { value: 'easy', label: 'Bigger squares' },
              { value: 'balanced', label: 'Standard' },
              { value: 'fast', label: 'Fewer codes' },
            ]}
          />
        </Group>

        <Text size="xs" c="slate.4" ta="center">
          Turn the screen brightness up and hold both laptops still. If the other laptop struggles, choose Bigger squares.
          When it says everything arrived, press Done.
        </Text>
      </div>
    </div>
  )
}
