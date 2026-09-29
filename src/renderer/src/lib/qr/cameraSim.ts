import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'

/**
 * Test-only: turns a frame string into pixels the way a laptop webcam would see it, so
 * the decoder can be measured against realistic degradation instead of a perfect bitmap.
 */

export type Grayscale = { width: number; height: number; data: Float32Array }

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function moduleGrid(frame: string): { size: number; dark: Uint8Array } {
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: frame, size: 400, level: 'M', marginSize: 4, bgColor: '#ffffff', fgColor: '#000000' }),
  )
  const viewBox = svg.match(/viewBox="0 0 (\d+) \d+"/)
  const paths = [...svg.matchAll(/<path fill="#000000" d="([^"]+)"/g)]
  if (!viewBox || paths.length === 0) {
    throw new Error('Unexpected QR SVG output')
  }

  const size = Number(viewBox[1])
  const dark = new Uint8Array(size * size)
  for (const run of paths[0][1].matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1/g)) {
    const [x, y, width] = [Number(run[1]), Number(run[2]), Number(run[3])]
    for (let dx = 0; dx < width; dx += 1) {
      dark[y * size + x + dx] = 1
    }
  }

  return { size, dark }
}

/** The QR, including its white quiet zone, on a dark bezel, at `pxPerModule` pixels per module. */
export function placeInFrame(
  grid: { size: number; dark: Uint8Array },
  pxPerModule: number,
  frameWidth: number,
  frameHeight: number,
): Grayscale {
  const data = new Float32Array(frameWidth * frameHeight).fill(28)
  const side = grid.size * pxPerModule
  const left = Math.floor((frameWidth - side) / 2)
  const top = Math.floor((frameHeight - side) / 2)

  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const isDark = grid.dark[Math.floor(y / pxPerModule) * grid.size + Math.floor(x / pxPerModule)] === 1
      const px = left + x
      const py = top + y
      if (px >= 0 && px < frameWidth && py >= 0 && py < frameHeight) {
        data[py * frameWidth + px] = isDark ? 14 : 238
      }
    }
  }

  return { width: frameWidth, height: frameHeight, data }
}

export function boxBlur(image: Grayscale, radius: number): Grayscale {
  if (radius <= 0) {
    return image
  }

  const out = new Float32Array(image.data.length)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let sum = 0
      let count = 0
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = x + dx
          const sy = y + dy
          if (sx >= 0 && sx < image.width && sy >= 0 && sy < image.height) {
            sum += image.data[sy * image.width + sx]
            count += 1
          }
        }
      }
      out[y * image.width + x] = sum / count
    }
  }

  return { ...image, data: out }
}

export function rotate(image: Grayscale, degrees: number): Grayscale {
  if (degrees === 0) {
    return image
  }

  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = image.width / 2
  const cy = image.height / 2
  const out = new Float32Array(image.data.length)

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sx = cos * (x - cx) + sin * (y - cy) + cx
      const sy = -sin * (x - cx) + cos * (y - cy) + cy
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      if (x0 < 0 || y0 < 0 || x0 + 1 >= image.width || y0 + 1 >= image.height) {
        out[y * image.width + x] = 28
        continue
      }

      const fx = sx - x0
      const fy = sy - y0
      const at = (px: number, py: number): number => image.data[py * image.width + px]
      out[y * image.width + x] =
        at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy
    }
  }

  return { ...image, data: out }
}

export function addNoise(image: Grayscale, sigma: number, random: () => number): Grayscale {
  const out = new Float32Array(image.data.length)
  for (let i = 0; i < out.length; i += 1) {
    // Box-Muller: two uniform samples become one Gaussian sample.
    const gauss = Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random())
    out[i] = image.data[i] + gauss * sigma
  }

  return { ...image, data: out }
}

export function toRgba(image: Grayscale): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(image.width * image.height * 4)
  for (let i = 0; i < image.data.length; i += 1) {
    const value = Math.max(0, Math.min(255, Math.round(image.data[i])))
    rgba[i * 4] = value
    rgba[i * 4 + 1] = value
    rgba[i * 4 + 2] = value
    rgba[i * 4 + 3] = 255
  }

  return rgba
}
