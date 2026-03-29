export async function createSyncHash(payload: Record<string, unknown>): Promise<string> {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort())
  const encoded = new TextEncoder().encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
