import { describe, expect, it } from 'vitest'
import { isValidSyncToken } from '../../../../shared/syncProtocol'
import { createSyncToken, formatSyncToken, normalizeSyncToken } from './token'

describe('sync tokens', () => {
  it('always creates a code the hub will accept', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isValidSyncToken(createSyncToken())).toBe(true)
    }
  })

  it('does not create the same code twice in a row', () => {
    expect(new Set(Array.from({ length: 50 }, createSyncToken)).size).toBeGreaterThan(45)
  })

  it('accepts a code however it was typed or pasted', () => {
    expect(normalizeSyncToken('abcd 2345')).toBe('ABCD2345')
    expect(normalizeSyncToken(' AB-CD-23-45 ')).toBe('ABCD2345')
  })

  it('drops characters that can never appear in a code', () => {
    expect(normalizeSyncToken('AB0CD1O2')).toBe('ABCD2')
  })

  it('never returns more than a code’s worth', () => {
    expect(normalizeSyncToken('ABCDEFGHJKLMN')).toHaveLength(8)
  })

  it('groups a code for reading aloud', () => {
    expect(formatSyncToken('ABCD2345')).toBe('ABCD 2345')
    expect(formatSyncToken('ABC')).toBe('ABC')
  })
})
