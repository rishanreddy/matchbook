import { describe, expect, it } from 'vitest'
import { NETWORK_SYNC_COLLECTIONS, validateSyncPayload } from './syncProtocol'

describe('network sync protocol', () => {
  it('keeps every advertised collection available to the hub', () => {
    expect(NETWORK_SYNC_COLLECTIONS).toEqual([
      'scoutingData',
      'formSchemas',
      'analysisConfigs',
      'events',
    ])
  })

  it('accepts a complete payload with matching row count', () => {
    expect(
      validateSyncPayload({
        exportedAt: '2026-09-15T12:00:00.000Z',
        collection: 'analysisConfigs',
        count: 1,
        data: [{ id: 'analysis-2026' }],
      }),
    ).toMatchObject({ collection: 'analysisConfigs', count: 1 })
  })

  it.each([
    [{ collection: 'not-a-collection', count: 0, data: [] }],
    [{ collection: 'events', count: 2, data: [{ id: 'event-1' }] }],
    [{ collection: 'events', count: 1, data: [{ id: '' }] }],
    [{ collection: 'events', count: 1, data: ['not a document'] }],
  ])('rejects invalid payload %o', (payload) => {
    expect(() => validateSyncPayload({ exportedAt: '2026-09-15T12:00:00.000Z', ...payload })).toThrow()
  })
})
