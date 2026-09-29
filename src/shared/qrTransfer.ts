/**
 * Moves a JSON document between two laptops as a looping series of QR codes.
 *
 * Design constraints, in order of importance:
 *
 * 1. Every frame must be readable on its own and in any order. The sender loops
 *    forever and the receiver may start on frame 17, so each frame carries the whole
 *    transfer's identity (session, total, checksum) rather than relying on frame 1.
 * 2. Frames use only the QR "alphanumeric" alphabet (A-Z, 0-9 and `$%*+-./:`). A QR
 *    encoder packs that alphabet at 5.5 bits a character instead of 8, so the same
 *    amount of data needs a smaller, coarser, easier-to-scan code.
 * 3. A finished transfer is verified by CRC-32 before anyone imports it.
 * 4. The document is deflated first. On scouting-shaped JSON that is 55-70% smaller
 *    than LZ-String, which is a third as many codes to capture.
 *
 * Frame layout:  MB1:<session>:<total>:<crc32>:<index>:<data>
 */

export const QR_FRAME_PREFIX = 'MB1'
export const MAX_QR_FRAMES = 600

async function runStream(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  // A fresh copy keeps the Blob from holding a view onto a larger shared buffer.
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function compressJson(json: string): Promise<Uint8Array> {
  return await runStream(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))
}

export async function decompressJson(bytes: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await runStream(bytes, new DecompressionStream('deflate-raw')))
}

/**
 * How much of each frame is data, in base-43 characters.
 *
 * With the ~26-character header these land on QR versions 6, 8 and 10 at error
 * correction level M (41, 49 and 57 modules across). Smaller versions have larger
 * modules for the same on-screen size, which is what a laptop webcam needs.
 */
export type QrDensity = 'easy' | 'balanced' | 'fast'

export const QR_DENSITY_CHARS: Record<QrDensity, number> = {
  easy: 120,
  balanced: 190,
  fast: 260,
}

const BASE43_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-./'
const BASE43_LOOKUP = new Map<string, number>(Array.from(BASE43_ALPHABET, (char, index) => [char, index]))

const SESSION_PATTERN = /^[0-9A-Z]{4}$/
const COUNT_PATTERN = /^[1-9][0-9]{0,3}$/
const CRC_PATTERN = /^[0-9A-F]{8}$/
const DATA_PATTERN = /^[0-9A-Z$%*+\-./]+$/

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function crcToHex(crc: number): string {
  return crc.toString(16).toUpperCase().padStart(8, '0')
}

/** Two bytes become three characters (43^3 > 2^16); a leftover byte becomes two. */
export function base43Encode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const value = bytes[i] * 256 + bytes[i + 1]
      out += BASE43_ALPHABET[value % 43]
      out += BASE43_ALPHABET[Math.floor(value / 43) % 43]
      out += BASE43_ALPHABET[Math.floor(value / 1849)]
    } else {
      const value = bytes[i]
      out += BASE43_ALPHABET[value % 43]
      out += BASE43_ALPHABET[Math.floor(value / 43)]
    }
  }
  return out
}

export function base43Decode(text: string): Uint8Array | null {
  const out: number[] = []
  for (let i = 0; i < text.length; i += 3) {
    const remaining = text.length - i
    if (remaining === 1) {
      return null
    }

    const c0 = BASE43_LOOKUP.get(text[i])
    const c1 = BASE43_LOOKUP.get(text[i + 1])
    if (c0 === undefined || c1 === undefined) {
      return null
    }

    if (remaining >= 3) {
      const c2 = BASE43_LOOKUP.get(text[i + 2])
      if (c2 === undefined) {
        return null
      }

      const value = c0 + c1 * 43 + c2 * 1849
      if (value > 0xffff) {
        return null
      }
      out.push(value >> 8, value & 0xff)
    } else {
      const value = c0 + c1 * 43
      if (value > 0xff) {
        return null
      }
      out.push(value)
    }
  }

  return Uint8Array.from(out)
}

export class QrTransferTooLargeError extends Error {
  readonly frameCount: number

  constructor(frameCount: number) {
    super(`This transfer needs ${frameCount} QR codes, more than the ${MAX_QR_FRAMES} that one transfer can carry.`)
    this.name = 'QrTransferTooLargeError'
    this.frameCount = frameCount
  }
}

export type QrTransfer = {
  sessionId: string
  frames: string[]
  compressedBytes: number
}

export type EncodeOptions = {
  density?: QrDensity
  /** Fixed session id, for tests. Defaults to a random one. */
  sessionId?: string
}

function randomSessionId(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const bytes = new Uint8Array(4)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export async function encodeQrTransfer(json: string, options: EncodeOptions = {}): Promise<QrTransfer> {
  return encodeQrFrames(await compressJson(json), options)
}

export function encodeQrFrames(bytes: Uint8Array, options: EncodeOptions = {}): QrTransfer {
  const charsPerFrame = QR_DENSITY_CHARS[options.density ?? 'balanced']
  const blockBytes = Math.floor(charsPerFrame / 3) * 2
  const total = Math.max(1, Math.ceil(bytes.length / blockBytes))

  if (total > MAX_QR_FRAMES) {
    throw new QrTransferTooLargeError(total)
  }

  const sessionId = options.sessionId ?? randomSessionId()
  if (!SESSION_PATTERN.test(sessionId)) {
    throw new Error('A QR session id is four characters from A-Z and 0-9.')
  }

  const crc = crcToHex(crc32(bytes))
  const frames: string[] = []
  for (let index = 0; index < total; index += 1) {
    const block = bytes.subarray(index * blockBytes, (index + 1) * blockBytes)
    frames.push(`${QR_FRAME_PREFIX}:${sessionId}:${total}:${crc}:${index + 1}:${base43Encode(block)}`)
  }

  return { sessionId, frames, compressedBytes: bytes.length }
}

type ParsedFrame = {
  sessionId: string
  total: number
  crc: string
  index: number
  block: Uint8Array
}

function parseFrame(text: string): ParsedFrame | null {
  const parts = text.split(':')
  if (parts.length !== 6 || parts[0] !== QR_FRAME_PREFIX) {
    return null
  }

  const [, sessionId, totalText, crc, indexText, data] = parts
  if (
    !SESSION_PATTERN.test(sessionId) ||
    !COUNT_PATTERN.test(totalText) ||
    !CRC_PATTERN.test(crc) ||
    !COUNT_PATTERN.test(indexText) ||
    !DATA_PATTERN.test(data)
  ) {
    return null
  }

  const total = Number(totalText)
  const index = Number(indexText)
  if (total > MAX_QR_FRAMES || index > total) {
    return null
  }

  const block = base43Decode(data)
  if (!block) {
    return null
  }

  return { sessionId, total, crc, index, block }
}

export type QrTransferProgress = {
  sessionId: string | null
  total: number
  received: number
  receivedIndexes: number[]
  missingIndexes: number[]
}

export type FrameResult =
  | { kind: 'ignored' }
  | { kind: 'duplicate'; progress: QrTransferProgress }
  | { kind: 'accepted'; progress: QrTransferProgress; startedNewTransfer: boolean }
  | { kind: 'corrupt'; progress: QrTransferProgress }
  | { kind: 'complete'; progress: QrTransferProgress; bytes: Uint8Array }

/** Collects frames in any order, from any point in the loop, and verifies the result. */
export class QrTransferAssembler {
  private sessionId: string | null = null
  private total = 0
  private crc = ''
  private blocks = new Map<number, Uint8Array>()

  addFrame(text: string): FrameResult {
    const frame = parseFrame(text.trim())
    if (!frame) {
      return { kind: 'ignored' }
    }

    const isSameTransfer =
      this.sessionId === frame.sessionId && this.total === frame.total && this.crc === frame.crc
    let startedNewTransfer = false
    if (!isSameTransfer) {
      startedNewTransfer = this.blocks.size > 0
      this.sessionId = frame.sessionId
      this.total = frame.total
      this.crc = frame.crc
      this.blocks = new Map()
    }

    if (this.blocks.has(frame.index)) {
      return { kind: 'duplicate', progress: this.progress() }
    }

    this.blocks.set(frame.index, frame.block)
    if (this.blocks.size < this.total) {
      return { kind: 'accepted', progress: this.progress(), startedNewTransfer }
    }

    return this.finish()
  }

  progress(): QrTransferProgress {
    const receivedIndexes = Array.from(this.blocks.keys()).sort((a, b) => a - b)
    const missingIndexes: number[] = []
    for (let index = 1; index <= this.total; index += 1) {
      if (!this.blocks.has(index)) {
        missingIndexes.push(index)
      }
    }

    return {
      sessionId: this.sessionId,
      total: this.total,
      received: this.blocks.size,
      receivedIndexes,
      missingIndexes,
    }
  }

  reset(): void {
    this.sessionId = null
    this.total = 0
    this.crc = ''
    this.blocks = new Map()
  }

  private finish(): FrameResult {
    const parts: Uint8Array[] = []
    let length = 0
    for (let index = 1; index <= this.total; index += 1) {
      const block = this.blocks.get(index)
      if (!block) {
        return { kind: 'corrupt', progress: this.discard() }
      }
      parts.push(block)
      length += block.length
    }

    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of parts) {
      bytes.set(part, offset)
      offset += part.length
    }

    if (crcToHex(crc32(bytes)) !== this.crc) {
      return { kind: 'corrupt', progress: this.discard() }
    }

    return { kind: 'complete', progress: this.progress(), bytes }
  }

  private discard(): QrTransferProgress {
    const before = this.progress()
    this.reset()
    return before
  }
}
