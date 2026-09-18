import { describe, expect, it } from 'vitest'
import {
  NETWORK_SYNC_COLLECTIONS,
  isPrivateLanHost,
  isValidSyncToken,
  normalizeHubUrl,
  validateSyncPayload,
} from './syncProtocol'

describe('network sync protocol', () => {
  it('keeps every explicitly transferable collection available', () => {
    expect(NETWORK_SYNC_COLLECTIONS).toEqual([
      'scoutingData',
      'formSchemas',
      'analysisConfigs',
      'events',
      'matches',
      'assignments',
    ])
  })

  it('uses the match key as the primary field for schedule payloads', () => {
    expect(
      validateSyncPayload({
        exportedAt: '2026-09-15T12:00:00.000Z',
        collection: 'matches',
        count: 1,
        data: [{ key: '2026test_qm1' }],
      }),
    ).toMatchObject({ collection: 'matches', count: 1 })
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
    [{ collection: 'matches', count: 1, data: [{ id: 'not-the-match-key' }] }],
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

  it.each(['192.168.999.1', '10.300.0.1', '172.15.0.1', '172.32.0.1', '192.169.1.1'])(
    'does not treat invalid or public IPv4 host %s as local',
    (hostname) => {
      expect(isPrivateLanHost(hostname)).toBe(false)
    },
  )

  it('rejects credentials in a hub URL', () => {
    expect(() => normalizeHubUrl('http://user:password@192.168.1.44:41735')).toThrow()
  })

  it('accepts only generated-format sync tokens', () => {
    expect(isValidSyncToken('AB23CD45')).toBe(true)
    expect(isValidSyncToken('abc12345')).toBe(false)
    expect(isValidSyncToken('AB10CD34')).toBe(false)
    expect(isValidSyncToken('AB12CD3')).toBe(false)
  })
})
