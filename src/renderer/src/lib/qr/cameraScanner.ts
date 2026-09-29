import { decodeQr, SMOOTHING_FILTER } from './decode'

export type ScannerFailureKind = 'macos-blocked' | 'permission' | 'no-camera' | 'in-use' | 'unknown'

export type ScannerFailure = {
  kind: ScannerFailureKind
  message: string
}

export class ScannerFailureError extends Error {
  readonly failure: ScannerFailure

  constructor(failure: ScannerFailure) {
    super(failure.message)
    this.name = 'ScannerFailureError'
    this.failure = failure
  }
}

export type CameraDevice = { id: string; label: string }

type ScannerOptions = {
  video: HTMLVideoElement
  onCode: (text: string) => void
  onFailure: (failure: ScannerFailure) => void
}

// A frame is drawn at each of these fractions in turn. Full size finds a small or
// distant code; the smaller pass is quicker and averages away more sensor noise.
const DECODE_SCALES = [0.75, 1]
const MAX_DECODE_WIDTH = 1280
const SCAN_INTERVAL_MS = 30

function describeFailure(error: unknown): ScannerFailure {
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        kind: 'permission',
        message:
          'Matchbook is not allowed to use the camera. Allow camera access for Matchbook in your computer’s privacy settings, then try again.',
      }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        kind: 'no-camera',
        message: 'No camera was found. Plug one in, or choose a different camera, then try again.',
      }
    case 'NotReadableError':
      return {
        kind: 'in-use',
        message: 'The camera is busy. Close any other app that is using it (video calls, Photo Booth), then try again.',
      }
    default:
      return { kind: 'unknown', message: 'The camera could not be started. Unplug and re-plug it, then try again.' }
  }
}

export async function listCameras(): Promise<CameraDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === 'videoinput' && device.deviceId !== '')
    .map((device, index) => ({
      id: device.deviceId,
      label: device.label.trim() || `Camera ${index + 1}`,
    }))
}

async function createNativeDetector(): Promise<BarcodeDetector | null> {
  if (typeof BarcodeDetector === 'undefined') {
    return null
  }

  try {
    const formats = await BarcodeDetector.getSupportedFormats()
    return formats.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : null
  } catch {
    return null
  }
}

/**
 * Watches a camera for QR codes and reports each one it reads.
 *
 * The whole frame is searched. The previous scanner cropped to a fixed 220-340px box in
 * the middle of a small preview, so a code had to be lined up inside it by hand and a
 * larger one could never be read at all.
 */
export class CameraQrScanner {
  private readonly video: HTMLVideoElement
  private readonly onCode: (text: string) => void
  private readonly onFailure: (failure: ScannerFailure) => void
  private stream: MediaStream | null = null
  private running = false
  private timer: number | null = null
  private detector: BarcodeDetector | null = null
  private tick = 0
  private canvas: HTMLCanvasElement | null = null
  // Bumped by every start and stop, so a start that is still awaiting the camera can
  // tell it has been overtaken and must not switch scanning back on.
  private generation = 0

  constructor(options: ScannerOptions) {
    this.video = options.video
    this.onCode = options.onCode
    this.onFailure = options.onFailure
  }

  /** Starts the camera and returns the id of the camera actually opened. */
  async start(preferredDeviceId: string | null): Promise<string | null> {
    this.stop()
    const generation = this.generation

    // macOS keeps a camera hidden until the user has been asked, and a refusal sticks
    // until changed in System Settings. Ask first so a refusal can be explained.
    const access = await window.electronAPI?.ensureCameraAccess()
    if (access && !access.granted) {
      throw new ScannerFailureError({
        kind: 'macos-blocked',
        message:
          'macOS is blocking the camera for Matchbook. Open System Settings > Privacy & Security > Camera, switch Matchbook on, then reopen the app.',
      })
    }

    let stream: MediaStream
    try {
      stream = await this.openStream(preferredDeviceId)
    } catch (error: unknown) {
      throw new ScannerFailureError(describeFailure(error))
    }

    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop())
      return null
    }

    this.stream = stream
    const track = stream.getVideoTracks()[0]
    track?.addEventListener('ended', () => {
      if (this.running) {
        this.stop()
        this.onFailure({ kind: 'no-camera', message: 'The camera stopped working. Check the cable, then start again.' })
      }
    })

    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = stream
    try {
      await this.video.play()
    } catch (error: unknown) {
      if (generation !== this.generation) {
        return null
      }
      this.stop()
      throw new ScannerFailureError(describeFailure(error))
    }

    const detector = await createNativeDetector()
    if (generation !== this.generation) {
      return null
    }

    this.detector = detector
    this.running = true
    this.schedule()

    return track?.getSettings().deviceId ?? null
  }

  stop(): void {
    this.generation += 1
    this.running = false
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }

    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.video.srcObject = null
  }

  private async openStream(preferredDeviceId: string | null): Promise<MediaStream> {
    const quality = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
    const attempts: MediaTrackConstraints[] = []
    if (preferredDeviceId) {
      attempts.push({ ...quality, deviceId: { exact: preferredDeviceId } })
    }
    attempts.push({ ...quality, facingMode: 'environment' })

    let lastError: unknown
    for (const video of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: false, video })
      } catch (error: unknown) {
        lastError = error
        // A missing saved camera is worth retrying with the default; a refusal is not.
        const name = error instanceof Error ? error.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          break
        }
      }
    }

    throw lastError
  }

  private schedule(): void {
    if (!this.running) {
      return
    }

    this.timer = window.setTimeout(() => {
      this.timer = null
      void this.scanOnce().finally(() => this.schedule())
    }, SCAN_INTERVAL_MS)
  }

  private async scanOnce(): Promise<void> {
    if (!this.running || document.hidden || this.video.readyState < 2 || this.video.videoWidth === 0) {
      return
    }

    const text = await this.readFrame()
    if (text && this.running) {
      this.onCode(text)
    }
  }

  private async readFrame(): Promise<string | null> {
    this.tick += 1

    if (this.detector) {
      try {
        const codes = await this.detector.detect(this.video)
        const hit = codes.find((code) => code.rawValue.length > 0)
        if (hit) {
          return hit.rawValue
        }
      } catch {
        // Some platforms advertise the detector but cannot run it. Use the JS decoder.
        this.detector = null
      }

      // The native detector is quick, so the JS decoder only backs it up every other pass.
      if (this.detector && this.tick % 2 === 0) {
        return null
      }
    }

    return this.readWithJs()
  }

  private readWithJs(): string | null {
    const { videoWidth, videoHeight } = this.video
    const scale = DECODE_SCALES[this.tick % DECODE_SCALES.length]
    const width = Math.round(Math.min(videoWidth, MAX_DECODE_WIDTH) * scale)
    const height = Math.round((width * videoHeight) / videoWidth)

    const canvas = this.canvas ?? document.createElement('canvas')
    this.canvas = canvas
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return null
    }

    context.filter = SMOOTHING_FILTER
    context.drawImage(this.video, 0, 0, width, height)
    context.filter = 'none'

    const image = context.getImageData(0, 0, width, height)
    return decodeQr({ data: image.data, width, height })
  }
}
