import { describe, expect, it } from 'vitest'
import { encodeQrTransfer, QR_DENSITY_CHARS, type QrDensity } from '../../../../shared/qrTransfer'
import { decodeQr } from './decode'
import { addNoise, boxBlur, moduleGrid, placeInFrame, rotate, seededRandom, toRgba } from './cameraSim'

/**
 * These pin the envelope the scanner is designed for, measured with the real encoder
 * and the real decoder. `px` is how many camera pixels each QR module spans: a 1280px
 * wide webcam frame with a version-8 code (57 modules with its quiet zone) filling a
 * quarter of the frame gives about 5.6px per module.
 */

const DENSITIES = Object.keys(QR_DENSITY_CHARS) as QrDensity[]

const sampleJson = JSON.stringify({
  rows: Array.from({ length: 120 }, (_, i) => ({ id: (i * 7919) % 10007, name: `Team ${(i * 31) % 900}`, n: i * 0.37 })),
})

type Degradation = { blur: number; noise: number; tilt: number; smooth: boolean }

function decodeSample(frame: string, pxPerModule: number, seed: number, degrade: Degradation): string | null {
  let image = placeInFrame(moduleGrid(frame), pxPerModule, 640, 480)
  image = rotate(image, degrade.tilt)
  image = boxBlur(image, degrade.blur)
  image = addNoise(image, degrade.noise, seededRandom(seed))
  if (degrade.smooth) {
    image = boxBlur(image, 1)
  }

  return decodeQr({ data: toRgba(image), width: image.width, height: image.height })
}

describe('decodeQr', () => {
  it.each(DENSITIES)('reads a clean %s frame down to 2px per module', async (density) => {
    const { frames } = await encodeQrTransfer(sampleJson, { density })

    for (const px of [2, 3, 6]) {
      expect(decodeSample(frames[0], px, 1, { blur: 0, noise: 0, tilt: 0, smooth: false })).toBe(frames[0])
    }
  })

  it.each(DENSITIES)('reads %s frames at 4px per module through blur, sensor noise and a tilted screen', async (density) => {
    const { frames } = await encodeQrTransfer(sampleJson, { density })

    for (let i = 0; i < 3; i += 1) {
      const decoded = decodeSample(frames[i], 4, 1000 + i, { blur: 1, noise: 8, tilt: 6, smooth: true })
      expect(decoded).toBe(frames[i])
    }
  })

  it.each(DENSITIES)('reads %s frames at 5px per module even when the camera is badly out of focus', async (density) => {
    const { frames } = await encodeQrTransfer(sampleJson, { density })

    for (let i = 0; i < 3; i += 1) {
      const decoded = decodeSample(frames[i], 5, 2000 + i, { blur: 2, noise: 8, tilt: 6, smooth: true })
      expect(decoded).toBe(frames[i])
    }
  })

  it('is why the scanner smooths frames: heavy noise defeats the decoder without it', async () => {
    const { frames } = await encodeQrTransfer(sampleJson, { density: 'balanced' })

    const raw = decodeSample(frames[0], 6, 1000, { blur: 1, noise: 8, tilt: 0, smooth: false })
    const smoothed = decodeSample(frames[0], 6, 1000, { blur: 1, noise: 8, tilt: 0, smooth: true })

    expect(raw).toBeNull()
    expect(smoothed).toBe(frames[0])
  })

  it('returns null for a frame with no QR code in it', () => {
    const blank = placeInFrame({ size: 1, dark: new Uint8Array(1) }, 1, 320, 240)

    expect(decodeQr({ data: toRgba(blank), width: 320, height: 240 })).toBeNull()
  })
})
