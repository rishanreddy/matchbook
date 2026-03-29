import axios from 'axios'

import type { TBAEvent, TBAMatch, TBATeam } from '../../types/tba'

const TBA_BASE_URL = 'https://www.blue-alliance.org/api/v3'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500

const tbaClient = axios.create({
  baseURL: TBA_BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getRetryDelay(attempt: number, retryAfterHeader?: string): number {
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader)
    if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1_000
    }
  }

  return INITIAL_BACKOFF_MS * 2 ** (attempt - 1)
}

function getEndpointErrorMessage(error: unknown, endpoint: string): string {
  if (!axios.isAxiosError(error)) {
    return `TBA request failed for ${endpoint}: Unknown error`
  }

  if (error.response) {
    const status = error.response.status
    const statusText = error.response.statusText || 'Unknown status'
    return `TBA request failed for ${endpoint}: HTTP ${status} ${statusText}`
  }

  if (error.request) {
    return `TBA request failed for ${endpoint}: No response received`
  }

  return `TBA request failed for ${endpoint}: ${error.message}`
}

function shouldRetry(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false
  }

  const status = error.response?.status

  if (status === 429) {
    return true
  }

  if (status !== undefined && status >= 500) {
    return true
  }

  return !status
}

async function requestWithRetry<T>(endpoint: string, apiKey: string): Promise<T> {
  if (!apiKey.trim()) {
    throw new Error(`TBA request failed for ${endpoint}: Missing API key`)
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await tbaClient.get<T>(endpoint, {
        headers: {
          'X-TBA-Auth-Key': apiKey,
        },
      })

      return response.data
    } catch (error) {
      lastError = error

      const canRetry = attempt < MAX_RETRIES && shouldRetry(error)
      if (!canRetry) {
        break
      }

      const retryAfterHeader = axios.isAxiosError(error)
        ? error.response?.headers?.['retry-after']
        : undefined
      const delayMs = getRetryDelay(attempt, retryAfterHeader)
      await sleep(delayMs)
    }
  }

  throw new Error(getEndpointErrorMessage(lastError, endpoint))
}

export async function getEventsByYear(year: number, apiKey: string): Promise<TBAEvent[]> {
  return requestWithRetry<TBAEvent[]>(`/events/${year}`, apiKey)
}

export async function getEvent(eventKey: string, apiKey: string): Promise<TBAEvent> {
  return requestWithRetry<TBAEvent>(`/event/${eventKey}`, apiKey)
}

export async function getEventMatches(eventKey: string, apiKey: string): Promise<TBAMatch[]> {
  return requestWithRetry<TBAMatch[]>(`/event/${eventKey}/matches`, apiKey)
}

export async function getEventTeams(eventKey: string, apiKey: string): Promise<TBATeam[]> {
  return requestWithRetry<TBATeam[]>(`/event/${eventKey}/teams`, apiKey)
}

export async function getTeam(teamKey: string, apiKey: string): Promise<TBATeam> {
  return requestWithRetry<TBATeam>(`/team/${teamKey}`, apiKey)
}
