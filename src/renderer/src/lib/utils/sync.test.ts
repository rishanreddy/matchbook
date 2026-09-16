import { describe, expect, it } from 'vitest'
import { compressData, decompressData, reconstructFromChunks, splitIntoChunks } from './sync'

describe('QR sync encoding', () => {
  it('round-trips structured data through compression and chunk reconstruction', () => {
    const payload = { collection: 'scoutingData', data: [{ id: 'record-1', notes: 'climbed' }] }
    const compressed = compressData(payload)
    const chunks = splitIntoChunks(compressed, 8)

    expect(chunks.length).toBeGreaterThan(1)
    expect(decompressData(reconstructFromChunks(chunks))).toEqual(payload)
  })

  it('rejects an invalid chunk size and malformed compressed payload', () => {
    expect(() => splitIntoChunks('data', 0)).toThrow('Chunk size')
    expect(() => decompressData('not-a-valid-payload')).toThrow()
  })
})
