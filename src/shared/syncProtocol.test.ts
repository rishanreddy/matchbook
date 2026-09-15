import { describe, expect, it } from 'vitest'
import { NETWORK_SYNC_COLLECTIONS, normalizeHubUrl, validateSyncPayload } from './syncProtocol'

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

  it('allows uploads only to local hub addresses', () => {
    expect(normalizeHubUrl('192.168.1.44:41735/upload')).toBe('http://192.168.1.44:41735')
    expect(normalizeHubUrl('http://10.0.0.2:41735')).toBe('http://10.0.0.2:41735')
    expect(normalizeHubUrl('127.0.0.1:41735')).toBe('http://127.0.0.1:41735')
  })

  it.each(['https://example.com', 'http://8.8.8.8:41735', 'http://172.32.0.1:41735', 'not a URL'])('rejects non-local hub address %s', (url) => {
    expect(() => normalizeHubUrl(url)).toThrow()
  })
})
