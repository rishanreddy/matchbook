import { SYNC_TOKEN_LENGTH } from '../../../../shared/syncProtocol'

// No 0/O or 1/I: this is read off one screen and typed into another.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function createSyncToken(): string {
  const bytes = new Uint8Array(SYNC_TOKEN_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
}

const NOT_IN_ALPHABET = new RegExp(`[^${ALPHABET}]`, 'g')

/** Uppercases and drops anything that cannot be in a code, so pasted or mistyped text still works. */
export function normalizeSyncToken(value: string): string {
  return value.toUpperCase().replace(NOT_IN_ALPHABET, '').slice(0, SYNC_TOKEN_LENGTH)
}

/** Groups a code for reading aloud and typing: ABCD 2345. */
export function formatSyncToken(token: string): string {
  return token.length === SYNC_TOKEN_LENGTH ? `${token.slice(0, 4)} ${token.slice(4)}` : token
}
