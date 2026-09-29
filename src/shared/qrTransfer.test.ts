import { describe, expect, it } from 'vitest'
import {
  MAX_QR_FRAMES,
  QR_DENSITY_CHARS,
  QrTransferAssembler,
  QrTransferTooLargeError,
  base43Decode,
  base43Encode,
  crc32,
  decompressJson,
  encodeQrFrames,
  encodeQrTransfer,
  type FrameResult,
  type QrDensity,
} from './qrTransfer'

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Shaped like a real scouting export: many rows sharing keys, with ids and timestamps.
function sampleScoutingJson(rows: number, seed = 1): string {
  const random = seededRandom(seed)
  const data = Array.from({ length: rows }, (_, index) => ({
    id: `${Math.floor(random() * 1e16).toString(16)}-4c1a-9f0e-${index.toString(16).padStart(12, '0')}`,
    eventId: '2026casd',
    deviceId: 'device_3248fa5f6547e7630316260b',
    matchNumber: index + 1,
    teamNumber: 200 + Math.floor(random() * 9000),
    timestamp: new Date(1_790_000_000_000 + index * 600_000).toISOString(),
    autoScore: Math.floor(random() * 6),
    teleopScore: Math.floor(random() * 20),
    endgameScore: Math.floor(random() * 10),
    formData: {
      autoMoved: random() > 0.3,
      autoScored: Math.floor(random() * 6),
      teleopScored: Math.floor(random() * 20),
      teleopCycles: Math.floor(random() * 9),
      driverSkill: 1 + Math.floor(random() * 5),
      endgameClimbed: random() > 0.5,
      playedDefense: random() > 0.7,
      notes: random() > 0.5 ? 'Fast intake, drops pieces when defended.' : '',
    },
    notes: '',
    createdAt: new Date(1_790_000_000_000 + index * 600_000).toISOString(),
  }))

  return JSON.stringify({ exportedAt: '2026-09-28T20:00:00.000Z', collection: 'scoutingData', count: rows, data })
}

async function documentOf(result: FrameResult | undefined): Promise<string | null> {
  return result?.kind === 'complete' ? await decompressJson(result.bytes) : null
}

const DENSITIES = Object.keys(QR_DENSITY_CHARS) as QrDensity[]
// Characters a QR encoder can pack at 5.5 bits each. Anything else forces byte mode.
const QR_ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/

describe('base43', () => {
  it('round-trips every length, including the odd byte left over', () => {
    const random = seededRandom(7)
    for (let length = 0; length <= 300; length += 1) {
      const bytes = Uint8Array.from({ length }, () => Math.floor(random() * 256))
      expect(Array.from(base43Decode(base43Encode(bytes)) ?? [])).toEqual(Array.from(bytes))
    }
  })

  it('round-trips the extremes that sit at the edge of each digit group', () => {
    for (const bytes of [[0, 0], [255, 255], [0], [255], [255, 255, 255], [0, 255, 0]]) {
      expect(Array.from(base43Decode(base43Encode(Uint8Array.from(bytes))) ?? [])).toEqual(bytes)
    }
  })

  it('rejects text outside the alphabet or that no encoder could have produced', () => {
    expect(base43Decode('abc')).toBeNull()
    expect(base43Decode('A')).toBeNull() // a lone trailing character is not a valid group
    expect(base43Decode('///')).toBeNull() // 42 + 42*43 + 42*1849 = 79506, above 16 bits
    expect(base43Decode('//')).toBeNull() // 42 + 42*43 = 1848, above one byte
  })
})

describe('crc32', () => {
  it('matches the well-known check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('encodeQrTransfer', () => {
  it.each(DENSITIES)('emits only QR-alphanumeric characters at %s density', async (density) => {
    const { frames } = await encodeQrTransfer(sampleScoutingJson(30), { density })

    expect(frames.length).toBeGreaterThan(1)
    for (const frame of frames) {
      expect(frame).toMatch(QR_ALPHANUMERIC)
    }
  })

  it('keeps every frame inside the QR version each density is meant to land on', async () => {
    // Alphanumeric capacity at error-correction level M: version 6 = 154, 8 = 221, 10 = 311.
    const capacity: Record<QrDensity, number> = { easy: 154, balanced: 221, fast: 311 }

    for (const density of DENSITIES) {
      const { frames } = await encodeQrTransfer(sampleScoutingJson(120, 3), { density })
      const longest = Math.max(...frames.map((frame) => frame.length))
      expect(longest).toBeLessThanOrEqual(capacity[density])
    }
  })

  it('needs fewer, denser frames as density rises', async () => {
    const json = sampleScoutingJson(60)
    const counts = await Promise.all(DENSITIES.map(async (density) => (await encodeQrTransfer(json, { density })).frames.length))

    expect(counts[0]).toBeGreaterThan(counts[1])
    expect(counts[1]).toBeGreaterThan(counts[2])
  })

  it('compresses a real-shaped export to a fraction of its raw size', async () => {
    const json = sampleScoutingJson(40)
    const { compressedBytes } = await encodeQrTransfer(json)

    expect(compressedBytes).toBeLessThan(new TextEncoder().encode(json).length * 0.3)
  })

  it('refuses a transfer that would need an unreasonable number of codes', () => {
    const random = seededRandom(99)
    const incompressible = Uint8Array.from({ length: 60_000 }, () => Math.floor(random() * 256))

    expect(() => encodeQrFrames(incompressible, { density: 'easy' })).toThrow(QrTransferTooLargeError)
    expect(MAX_QR_FRAMES).toBeGreaterThan(100)
  })

  it('rejects a malformed session id', () => {
    const bytes = new Uint8Array([1, 2, 3])

    expect(() => encodeQrFrames(bytes, { sessionId: 'abc' })).toThrow()
    expect(() => encodeQrFrames(bytes, { sessionId: 'abcd' })).toThrow()
  })
})

describe('QrTransferAssembler', () => {
  const json = sampleScoutingJson(25)

  it('rebuilds the original document from frames in order', async () => {
    const { frames } = await encodeQrTransfer(json, { sessionId: 'K3Q7' })
    const assembler = new QrTransferAssembler()

    let last: FrameResult | undefined
    for (const frame of frames) {
      last = assembler.addFrame(frame)
    }

    expect(last?.kind).toBe('complete')
    expect(await documentOf(last)).toBe(json)
  })

  it.each(DENSITIES)('rebuilds it from frames in a shuffled order at %s density', async (density) => {
    const { frames } = await encodeQrTransfer(json, { density })
    const random = seededRandom(11)
    const shuffled = [...frames].sort(() => random() - 0.5)
    const assembler = new QrTransferAssembler()

    const outcomes = shuffled.map((frame) => assembler.addFrame(frame))

    expect(await documentOf(outcomes.at(-1))).toBe(json)
  })

  it('starts mid-loop: a receiver that joins on frame 9 still finishes', async () => {
    const { frames } = await encodeQrTransfer(json, { density: 'easy' })
    const assembler = new QrTransferAssembler()
    const rotated = [...frames.slice(8), ...frames.slice(0, 8)]

    const outcomes = rotated.map((frame) => assembler.addFrame(frame))

    expect(outcomes.at(-1)?.kind).toBe('complete')
  })

  it('ignores a repeat of a frame it already has, without disturbing progress', async () => {
    const { frames } = await encodeQrTransfer(json, { density: 'easy' })
    const assembler = new QrTransferAssembler()

    assembler.addFrame(frames[0])
    const repeat = assembler.addFrame(frames[0])

    expect(repeat.kind).toBe('duplicate')
    expect(assembler.progress().received).toBe(1)
  })

  it('reports exactly which frames are still missing', async () => {
    const { frames } = await encodeQrTransfer(json, { density: 'easy' })
    const assembler = new QrTransferAssembler()

    assembler.addFrame(frames[0])
    assembler.addFrame(frames[2])
    const { missingIndexes, total, received } = assembler.progress()

    expect(total).toBe(frames.length)
    expect(received).toBe(2)
    expect(missingIndexes).not.toContain(1)
    expect(missingIndexes).not.toContain(3)
    expect(missingIndexes).toContain(2)
  })

  it('ignores QR codes that are not Matchbook frames', () => {
    const assembler = new QrTransferAssembler()

    for (const text of ['https://example.com', 'WIFI:T:WPA;S:cafe;P:secret;;', '', 'MB1:bad', 'MB1:ABCD:3:00000000:9:AAA', '{"index":1,"total":2}']) {
      expect(assembler.addFrame(text).kind).toBe('ignored')
    }
    expect(assembler.progress().received).toBe(0)
  })

  it('abandons a half-received transfer when a different one begins', async () => {
    const first = await encodeQrTransfer(json, { density: 'easy', sessionId: 'AAAA' })
    const second = await encodeQrTransfer(sampleScoutingJson(10, 5), { density: 'easy', sessionId: 'BBBB' })
    const assembler = new QrTransferAssembler()

    assembler.addFrame(first.frames[0])
    assembler.addFrame(first.frames[1])
    const switched = assembler.addFrame(second.frames[0])

    expect(switched.kind === 'accepted' && switched.startedNewTransfer).toBe(true)
    expect(assembler.progress().received).toBe(1)
    expect(assembler.progress().sessionId).toBe('BBBB')
  })

  it('never hands back a document whose checksum does not match', async () => {
    const { frames } = await encodeQrTransfer(json, { density: 'easy' })
    const assembler = new QrTransferAssembler()

    // Swap one data character for a different valid one: still parses, but is wrong.
    const parts = frames[1].split(':')
    parts[5] = (parts[5][0] === 'A' ? 'B' : 'A') + parts[5].slice(1)
    const tampered = [frames[0], parts.join(':'), ...frames.slice(2)]

    const outcomes = tampered.map((frame) => assembler.addFrame(frame))

    expect(outcomes.some((outcome) => outcome.kind === 'complete')).toBe(false)
    expect(outcomes.at(-1)?.kind).toBe('corrupt')
    expect(assembler.progress().received).toBe(0)
  })

  it('finishes despite half the frames going unread on every pass', async () => {
    const { frames } = await encodeQrTransfer(sampleScoutingJson(40), { density: 'balanced' })
    const random = seededRandom(2026)
    const assembler = new QrTransferAssembler()

    let finished = false
    let passes = 0
    while (!finished && passes < 40) {
      passes += 1
      for (const frame of frames) {
        if (random() < 0.5) {
          continue
        }
        finished = assembler.addFrame(frame).kind === 'complete'
        if (finished) {
          break
        }
      }
    }

    expect(finished).toBe(true)
    expect(passes).toBeLessThan(15)
  })
})
