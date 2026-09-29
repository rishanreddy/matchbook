import { useMemo, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'sync_last_sent'

export type SendMethod = 'wifi' | 'file' | 'qr'

export type LastSent = {
  at: string
  entries: number
  method: SendMethod
}

const CHANGE_EVENT = 'sync:last-sent-changed'

export function recordLastSent(entry: LastSent): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // This only feeds a reminder on the home screen.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function parseLastSent(raw: string | null): LastSent | null {
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }

    const entry = parsed as Partial<LastSent>
    if (typeof entry.at !== 'string' || typeof entry.entries !== 'number' || !['wifi', 'file', 'qr'].includes(entry.method ?? '')) {
      return null
    }

    return { at: entry.at, entries: entry.entries, method: entry.method as SendMethod }
  } catch {
    return null
  }
}

export function readLastSent(): LastSent | null {
  return parseLastSent(readRaw())
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** The last successful send, kept current as it changes. */
export function useLastSent(): LastSent | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null)
  return useMemo(() => parseLastSent(raw), [raw])
}

export function describeMethod(method: SendMethod): string {
  return method === 'wifi' ? 'over Wi-Fi' : method === 'file' ? 'as a file' : 'with QR codes'
}
