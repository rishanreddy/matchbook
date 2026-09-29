import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CameraQrScanner,
  ScannerFailureError,
  listCameras,
  type CameraDevice,
  type ScannerFailure,
} from '../../lib/qr/cameraScanner'

const CAMERA_STORAGE_KEY = 'sync_qr_camera_id'

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'failed'

function readSavedCamera(): string | null {
  try {
    return localStorage.getItem(CAMERA_STORAGE_KEY) || null
  } catch {
    return null
  }
}

function saveCamera(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(CAMERA_STORAGE_KEY, id)
    } else {
      localStorage.removeItem(CAMERA_STORAGE_KEY)
    }
  } catch {
    // Remembering the camera is a convenience only.
  }
}

/** React wrapper around the camera scanner. Attach `videoRef` to a <video> element. */
export function useQrScanner(onCode: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<CameraQrScanner | null>(null)
  const onCodeRef = useRef(onCode)
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [failure, setFailure] = useState<ScannerFailure | null>(null)
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [cameraId, setCameraId] = useState<string | null>(readSavedCamera)

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  const refreshCameras = useCallback(async (): Promise<void> => {
    try {
      setCameras(await listCameras())
    } catch {
      setCameras([])
    }
  }, [])

  const stop = useCallback((): void => {
    scannerRef.current?.stop()
    scannerRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(
    async (deviceId?: string | null): Promise<void> => {
      const video = videoRef.current
      if (!video) {
        return
      }

      scannerRef.current?.stop()
      const scanner = new CameraQrScanner({
        video,
        onCode: (text) => onCodeRef.current(text),
        onFailure: (problem) => {
          setFailure(problem)
          setStatus('failed')
        },
      })
      scannerRef.current = scanner
      setStatus('starting')
      setFailure(null)

      try {
        const openedId = await scanner.start(deviceId !== undefined ? deviceId : cameraId)
        if (scannerRef.current !== scanner) {
          return
        }

        setStatus('scanning')
        if (openedId) {
          setCameraId(openedId)
          saveCamera(openedId)
        }
        await refreshCameras()
      } catch (error: unknown) {
        if (scannerRef.current !== scanner) {
          return
        }

        setStatus('failed')
        setFailure(
          error instanceof ScannerFailureError
            ? error.failure
            : { kind: 'unknown', message: 'The camera could not be started. Unplug and re-plug it, then try again.' },
        )
      }
    },
    [cameraId, refreshCameras],
  )

  const selectCamera = useCallback(
    (id: string): void => {
      setCameraId(id)
      saveCamera(id)
      if (scannerRef.current) {
        void start(id)
      }
    },
    [start],
  )

  useEffect(() => {
    return () => {
      scannerRef.current?.stop()
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    const devices = navigator.mediaDevices
    if (!devices?.addEventListener) {
      return
    }

    const onChange = (): void => void refreshCameras()
    devices.addEventListener('devicechange', onChange)
    return () => devices.removeEventListener('devicechange', onChange)
  }, [refreshCameras])

  return { videoRef, status, failure, cameras, cameraId, start, stop, selectCamera }
}
