import { normalizeSyncToken } from './token'

export const HUB_URL_KEY = 'sync_server_url_input'
export const HUB_TOKEN_KEY = 'sync_client_auth_token'

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Remembering the lead scout is a convenience only.
  }
}

export function readSavedHubUrl(): string {
  return read(HUB_URL_KEY)
}

export function readSavedHubToken(): string {
  return normalizeSyncToken(read(HUB_TOKEN_KEY))
}

export function saveHubUrl(url: string): void {
  write(HUB_URL_KEY, url)
}

export function saveHubToken(token: string): void {
  write(HUB_TOKEN_KEY, token)
}

/** The lead scout this laptop was last paired with, or null when it has not been paired. */
export function readSavedHub(): { url: string; token: string } | null {
  const url = readSavedHubUrl().trim()
  const token = readSavedHubToken()
  return url !== '' && token.length === 8 ? { url, token } : null
}
