const DEVICE_ID_KEY = 'matchbook-device-id'

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generates a stable renderer-local device ID.
 * We persist it so it survives restarts and remains deterministic per installation.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) {
    return existing
  }

  const platform = navigator.platform
  const userAgent = navigator.userAgent
  const language = navigator.language
  const seed = `${platform}|${userAgent}|${language}|${crypto.randomUUID()}`
  const fingerprint = await sha256Hex(seed)
  const deviceId = `device_${fingerprint.slice(0, 24)}`
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}

/**
 * Short, human-readable tag for a device ID, for use in default device names.
 *
 * Device IDs are all prefixed `device_`, so the leading characters are identical on
 * every installation. Taking them from the front produced the same default name
 * ("Scout Laptop devi") on every laptop, which made devices indistinguishable in the
 * hub's sync list. The suffix is the random part.
 */
export function getDeviceTag(deviceId: string): string {
  return deviceId.slice(-4).toUpperCase()
}
