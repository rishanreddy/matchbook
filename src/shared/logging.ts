export type ApplicationLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type ApplicationLogEntry = {
  timestamp: string
  level: ApplicationLogLevel
  message: string
  context?: string
  data?: unknown
}

const SENSITIVE_INLINE_VALUE = /(x-tba-auth-key|api[ _-]?key|authorization|(?:api|sync|auth|access|refresh)?[ _-]?token|password|secret)(\s*[:=]\s*|\s+)(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const MAX_STRING_LENGTH = 4_000
const MAX_OBJECT_KEYS = 60
const MAX_ARRAY_LENGTH = 40
const MAX_DEPTH = 6

function sanitizeString(value: string): string {
  const redacted = value.replace(SENSITIVE_INLINE_VALUE, '$1=[REDACTED]')
  return redacted.length > MAX_STRING_LENGTH ? `${redacted.slice(0, MAX_STRING_LENGTH)}… [truncated]` : redacted
}

function isSensitiveField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return (
    normalized.endsWith('apikey') ||
    normalized.endsWith('authkey') ||
    normalized === 'authorization' ||
    /(?:api|auth|access|refresh|sync|csrf)token$/.test(normalized) ||
    normalized.endsWith('password') ||
    normalized.includes('secret') ||
    normalized.endsWith('credential') ||
    normalized.endsWith('credentials') ||
    normalized.endsWith('cookie') ||
    normalized === 'rawerror' ||
    normalized === 'errorresponse' ||
    normalized === 'responsedata' ||
    normalized === 'requestdata' ||
    normalized.endsWith('formdata') ||
    normalized.endsWith('surveyjson') ||
    normalized.endsWith('notes') ||
    normalized.endsWith('payload') ||
    normalized.endsWith('requestbody') ||
    normalized.endsWith('responsebody')
  )
}

function sanitizeValue(value: unknown, key: string | undefined, seen: WeakSet<object>, depth: number): unknown {
  if (key && isSensitiveField(key)) {
    return '[REDACTED]'
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return sanitizeString(value)
  }

  if (typeof value === 'undefined') {
    return '[undefined]'
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'symbol' || typeof value === 'function') {
    return `[${typeof value}]`
  }

  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? '[Invalid Date]' : value.toISOString()
  }

  if (depth >= MAX_DEPTH) {
    return '[Max depth reached]'
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]'
    }
    seen.add(value)

    if (value instanceof Error) {
      const error = value as Error & { code?: unknown; cause?: unknown }
      const result: Record<string, unknown> = {
        name: sanitizeString(error.name),
        message: sanitizeString(error.message),
      }
      if (error.stack) result.stack = sanitizeString(error.stack)
      if (error.code !== undefined) result.code = sanitizeValue(error.code, 'code', seen, depth + 1)
      if (error.cause !== undefined) result.cause = sanitizeValue(error.cause, 'cause', seen, depth + 1)
      return result
    }

    if (Array.isArray(value)) {
      return [
        ...value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, undefined, seen, depth + 1)),
        ...(value.length > MAX_ARRAY_LENGTH ? [`… ${value.length - MAX_ARRAY_LENGTH} more items`] : []),
      ]
    }

    const result: Record<string, unknown> = {}
    const entries = Object.entries(value)
    for (const [childKey, childValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
      result[childKey] = sanitizeValue(childValue, childKey, seen, depth + 1)
    }
    if (entries.length > MAX_OBJECT_KEYS) {
      result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS
    }
    return result
  }

  return '[unserializable]'
}

export function sanitizeLogData(value: unknown): unknown {
  return sanitizeValue(value, undefined, new WeakSet<object>(), 0)
}

export function normalizeApplicationLogEntry(value: unknown): ApplicationLogEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const entry = value as Record<string, unknown>
  const level = entry.level
  if (level !== 'debug' && level !== 'info' && level !== 'warn' && level !== 'error') {
    return null
  }
  if (typeof entry.message !== 'string' || entry.message.trim().length === 0) {
    return null
  }

  const timestamp = typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp))
    ? entry.timestamp
    : new Date().toISOString()
  const context = typeof entry.context === 'string'
    ? sanitizeString(entry.context.slice(0, 120))
    : undefined

  return {
    timestamp,
    level,
    message: sanitizeString(entry.message.trim()),
    ...(context ? { context } : {}),
    ...(Object.hasOwn(entry, 'data') ? { data: sanitizeLogData(entry.data) } : {}),
  }
}
