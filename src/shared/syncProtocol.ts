export const NETWORK_SYNC_COLLECTIONS = [
  'scoutingData',
  'formSchemas',
  'analysisConfigs',
  'events',
] as const

export type SyncCollection = (typeof NETWORK_SYNC_COLLECTIONS)[number]

export type SyncPayload = {
  exportedAt: string
  collection: SyncCollection
  count: number
  data: Record<string, unknown>[]
}

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

  return payload.data.every((row) => {
    if (typeof row !== 'object' || row === null) {
      return false
    }

    const id = (row as Record<string, unknown>).id
    return typeof id === 'string' && id.length > 0
  })
}

export function validateSyncPayload(value: unknown): SyncPayload {
  if (!isValidSyncPayload(value)) {
    throw new Error('Invalid sync payload.')
  }

  return value
}

function isPrivateLanHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true
  }

  if (/^10(?:\.\d{1,3}){3}$/.test(hostname) || /^192\.168(?:\.\d{1,3}){2}$/.test(hostname)) {
    return true
  }

  const private172 = hostname.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/)
  return private172 !== null && Number(private172[1]) >= 16 && Number(private172[1]) <= 31
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

  if (url.protocol !== 'http:' || !isPrivateLanHost(url.hostname)) {
    throw new Error('Network sync is limited to a private local hub over HTTP.')
  }

  return url.origin
}
