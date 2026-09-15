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
