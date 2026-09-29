import { describe, expect, it } from 'vitest'
import { normalizeApplicationLogEntry, sanitizeLogData } from './logging'

describe('application logging sanitation', () => {
  it('redacts credentials and scouting content while keeping useful metadata', () => {
    expect(
      sanitizeLogData({
        operation: 'upload scouting entries',
        count: 4,
        apiKey: 'private-key',
        syncToken: 'private-token',
        refresh_token: 'private-refresh-token',
        rawError: { response: 'private-api-response' },
        formData: { autoScore: 7 },
        notes: 'team strategy',
      }),
    ).toEqual({
      operation: 'upload scouting entries',
      count: 4,
      apiKey: '[REDACTED]',
      syncToken: '[REDACTED]',
      refresh_token: '[REDACTED]',
      rawError: '[REDACTED]',
      formData: '[REDACTED]',
      notes: '[REDACTED]',
    })
  })

  it('serializes errors with stack traces and redacts inline secrets', () => {
    const error = new Error('request failed with Authorization: Bearer private-value')
    Object.assign(error, { code: 'ETIMEDOUT' })

    const sanitized = sanitizeLogData({ error }) as { error: { message: string; stack: string; code: string } }
    expect(sanitized.error.message).toContain('Authorization=[REDACTED]')
    expect(sanitized.error.stack).toContain('Error: request failed')
    expect(sanitized.error.code).toBe('ETIMEDOUT')
    expect(sanitized.error.message).not.toContain('private-value')
    expect(sanitizeLogData('request failed: token=private-token')).toBe('request failed: token=[REDACTED]')
  })

  it('rejects malformed renderer log entries and bounds valid metadata', () => {
    expect(normalizeApplicationLogEntry({ level: 'verbose', message: 'bad' })).toBeNull()
    expect(normalizeApplicationLogEntry({ level: 'info', message: '  ' })).toBeNull()

    const entry = normalizeApplicationLogEntry({
      level: 'info',
      message: '  operation complete  ',
      context: 'renderer',
      data: { apiKey: 'private-key', elapsedMs: 32 },
    })

    expect(entry).toMatchObject({
      level: 'info',
      message: 'operation complete',
      context: 'renderer',
      data: { apiKey: '[REDACTED]', elapsedMs: 32 },
    })
  })
})
