import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { createSyncHash } from '../db/utils/syncHash'

export function compressData(data: object): string {
  return compressToEncodedURIComponent(JSON.stringify(data))
}

export function decompressData(compressed: string): object {
  const decompressed = decompressFromEncodedURIComponent(compressed)
  if (!decompressed) {
    throw new Error('Unable to decompress sync payload.')
  }

  return JSON.parse(decompressed) as object
}

export function splitIntoChunks(data: string, chunkSize: number): string[] {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be greater than 0.')
  }

  const chunks: string[] = []
  for (let index = 0; index < data.length; index += chunkSize) {
    chunks.push(data.slice(index, index + chunkSize))
  }
  return chunks
}

export function reconstructFromChunks(chunks: string[]): string {
  return chunks.join('')
}

export async function generateSyncHash(data: {
  eventKey: string
  matchKey: string
  teamKey: string
  originDeviceId: string
}): Promise<string> {
  return createSyncHash(data)
}
