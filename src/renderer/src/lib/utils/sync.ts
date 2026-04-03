import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

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
