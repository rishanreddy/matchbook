import jsQR from 'jsqr'

export type PixelFrame = {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Reads one QR code out of a camera frame, or returns null if there is none.
 *
 * The sender always draws black modules on white, so the (slower) inverted pass is
 * skipped. Smoothing is the caller's job: jsQR fails outright on raw per-pixel sensor
 * noise that a 3x3 average removes, so the scanner blurs each frame lightly as it
 * draws it (see `SMOOTHING_FILTER`).
 */
export function decodeQr(frame: PixelFrame): string | null {
  const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
  return result ? result.data : null
}

/** Canvas filter applied while drawing a video frame, ahead of `getImageData`. */
export const SMOOTHING_FILTER = 'blur(0.7px)'
