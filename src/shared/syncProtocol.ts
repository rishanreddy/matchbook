export const NETWORK_SYNC_COLLECTIONS = [
  'scoutingData',
  'formSchemas',
  'analysisConfigs',
  'events',
  'matches',
  'assignments',
] as const

export type SyncCollection = (typeof NETWORK_SYNC_COLLECTIONS)[number]

export type SyncPayload = {
  exportedAt: string
  collection: SyncCollection
  count: number
  data: Record<string, unknown>[]
}

export const SYNC_TOKEN_LENGTH = 8
const SYNC_TOKEN_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/

export function isSyncCollection(value: unknown): value is SyncCollection {
  return typeof value === 'string' && NETWORK_SYNC_COLLECTIONS.includes(value as SyncCollection)
}

export function isValidSyncPayload(value: unknown): value is SyncPayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const payload = value as Partial<SyncPayload>
  if (!isSyncCollection(payload.collection) || typeof payload.exportedAt !== 'string' || payload.exportedAt.length === 0) {
    return false
  }

  if (!Array.isArray(payload.data) || !Number.isInteger(payload.count) || payload.count !== payload.data.length) {
    return false
  }

  const primaryField = payload.collection === 'matches' ? 'key' : 'id'
  return payload.data.every((row) => {
    if (typeof row !== 'object' || row === null) {
      return false
    }

    const primaryValue = (row as Record<string, unknown>)[primaryField]
    return typeof primaryValue === 'string' && primaryValue.length > 0
  })
}

export function validateSyncPayload(value: unknown): SyncPayload {
  if (!isValidSyncPayload(value)) {
    throw new Error('Invalid sync payload.')
  }

  return value
}

export function isValidSyncToken(value: unknown): value is string {
  return typeof value === 'string' && SYNC_TOKEN_PATTERN.test(value)
}

function parseIpv4Address(hostname: string): number[] | null {
  const octets = hostname.split('.')
  if (octets.length !== 4) {
    return null
  }

  const parsed = octets.map((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return null
    }

    const value = Number(octet)
    return value >= 0 && value <= 255 ? value : null
  })

  return parsed.every((octet): octet is number => octet !== null) ? parsed : null
}

export function isPrivateLanHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true
  }

  const ipv4 = parseIpv4Address(hostname)
  if (!ipv4) {
    return false
  }

  const [first, second] = ipv4
  if (first === 10 || (first === 192 && second === 168)) {
    return true
  }

  return first === 172 && second >= 16 && second <= 31
}

export function normalizeHubUrl(value: string): string {
  const trimmedValue = value.trim()
  const withProtocol = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `http://${trimmedValue}`

  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new Error('Enter a valid private hub IP address and port.')
  }

  if (url.protocol !== 'http:' || url.username || url.password || !isPrivateLanHost(url.hostname)) {
    throw new Error('Network sync is limited to a private local hub over HTTP.')
  }

  return url.origin
}
