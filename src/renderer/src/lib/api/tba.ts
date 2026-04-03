import type { TBAEvent, TBAMatch, TBATeam } from '../../types/tba'
import { AppError } from '../utils/errorHandler'
import { logger } from '../utils/logger'
import TbaApiV3client from 'tba-api-v3client'

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500

type TbaApiClient = {
  ApiClient: {
    instance: {
      authentications: {
        apiKey: {
          apiKey?: string
        }
      }
      defaultHeaders: Record<string, string>
    }
  }
  EventApi: new () => {
    getEventsByYear: (year: number, opts: Record<string, unknown>, callback: TbaCallback<unknown[]>) => void
    getEvent: (eventKey: string, opts: Record<string, unknown>, callback: TbaCallback<unknown>) => void
  }
  MatchApi: new () => {
    getEventMatches: (eventKey: string, opts: Record<string, unknown>, callback: TbaCallback<TBAMatch[]>) => void
  }
  TeamApi: new () => {
    getEventTeams: (eventKey: string, opts: Record<string, unknown>, callback: TbaCallback<TBATeam[]>) => void
    getTeam: (teamKey: string, opts: Record<string, unknown>, callback: TbaCallback<TBATeam>) => void
  }
  TBAApi: new () => {
    getStatus: (opts: Record<string, unknown>, callback: TbaCallback<Record<string, unknown>>) => void
  }
}

type TbaCallback<T> = (error: unknown, data: T, response: unknown) => void

const tbaClient = TbaApiV3client as TbaApiClient
const eventApi = new tbaClient.EventApi()
const matchApi = new tbaClient.MatchApi()
const teamApi = new tbaClient.TeamApi()
const statusApi = new tbaClient.TBAApi()

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

type RequestFailure = {
  status?: number
  retryAfter?: string
  message: string
  rawError?: unknown
}

function formatHttpErrorMessage(operation: string, status: number): string {
  return `TBA request failed for ${operation}: HTTP ${status}`
}

function shouldRetryStatus(status?: number): boolean {
  if (status === undefined) {
    return true
  }

  if (status === 429) {
    return true
  }

  return status >= 500
}

function mapClientFailure(operation: string, error: unknown, response: unknown): RequestFailure {
  const responseRecord = response as { status?: number; headers?: Record<string, string> } | undefined
  const errorRecord = error as { status?: number; message?: string } | undefined
  const status = responseRecord?.status ?? errorRecord?.status
  const retryAfter = responseRecord?.headers?.['retry-after']

  if (status !== undefined) {
    return {
      status,
      retryAfter,
      message: formatHttpErrorMessage(operation, status),
      rawError: error,
    }
  }

  if (error instanceof Error) {
    return {
      message: `TBA request failed for ${operation}: ${error.message}`,
      rawError: error,
    }
  }

  return {
    message: `TBA request failed for ${operation}: No response received`,
    rawError: error,
  }
}

function configureClient(apiKey: string): void {
  if (!apiKey.trim()) {
    throw new AppError('TBA request failed: Missing API key', 'INVALID_TBA_API_KEY')
  }

  const defaultClient = tbaClient.ApiClient.instance
  defaultClient.authentications.apiKey.apiKey = apiKey.trim()
  defaultClient.defaultHeaders['User-Agent'] = 'Matchbook/1.0.0'
}

function callClient<T>(operation: string, execute: (callback: TbaCallback<T>) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    execute((error: unknown, data: T, response: unknown) => {
      if (error) {
        reject(mapClientFailure(operation, error, response))
        return
      }

      resolve(data)
    })
  })
}

async function requestWithRetry<T>(operation: string, apiKey: string, execute: (callback: TbaCallback<T>) => void): Promise<T> {
  if (!apiKey.trim()) {
    throw new AppError('TBA request failed: Missing API key', 'INVALID_TBA_API_KEY', { operation })
  }

  configureClient(apiKey)

  let lastFailure: RequestFailure | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    logger.debug('TBA request started', { operation, attempt, transport: 'tba-api-v3client' })
    try {
      const data = await callClient(operation, execute)
      logger.info('TBA request successful', { operation, attempt, transport: 'tba-api-v3client' })
      return data
    } catch (error: unknown) {
      lastFailure = error as RequestFailure
    }

    const canRetry = attempt < MAX_RETRIES && shouldRetryStatus(lastFailure.status)
    if (!canRetry) {
      logger.error('TBA request failed without retry', {
        operation,
        transport: 'tba-api-v3client',
        status: lastFailure.status,
        message: lastFailure.message,
      })
      break
    }

    const delayMs = getRetryDelay(attempt, lastFailure.retryAfter)
    logger.warn('TBA request retry scheduled', {
      operation,
      attempt,
      delayMs,
      transport: 'tba-api-v3client',
      status: lastFailure.status,
    })
    await sleep(delayMs)
  }

  if (!lastFailure) {
    throw new AppError(`TBA request failed for ${operation}: Unknown error`, 'NO_INTERNET', { operation })
  }

  if ([401, 403].includes(lastFailure.status ?? -1)) {
    throw new AppError(lastFailure.message, 'INVALID_TBA_API_KEY', {
      operation,
      status: lastFailure.status,
      error: lastFailure.rawError,
      transport: 'tba-api-v3client',
    })
  }

  throw new AppError(lastFailure.message, 'NO_INTERNET', {
    operation,
    status: lastFailure.status,
    error: lastFailure.rawError,
    transport: 'tba-api-v3client',
  })
}

function normalizeDateOnly(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'string') {
    return value
  }

  return ''
}

function normalizeEvent(raw: unknown): TBAEvent {
  const event = raw as TBAEvent & { start_date?: unknown; end_date?: unknown }
  return {
    ...event,
    start_date: normalizeDateOnly(event.start_date),
    end_date: normalizeDateOnly(event.end_date),
  }
}

export async function getEventsByYear(year: number, apiKey: string): Promise<TBAEvent[]> {
  const events = await requestWithRetry<unknown[]>(
    `getEventsByYear(${year})`,
    apiKey,
    (callback) => eventApi.getEventsByYear(year, {}, callback),
  )
  return events.map((event) => normalizeEvent(event))
}

export async function getTbaStatus(apiKey: string): Promise<Record<string, unknown>> {
  return requestWithRetry<Record<string, unknown>>('getStatus()', apiKey, (callback) => statusApi.getStatus({}, callback))
}

export async function getEvent(eventKey: string, apiKey: string): Promise<TBAEvent> {
  const event = await requestWithRetry<unknown>(
    `getEvent(${eventKey})`,
    apiKey,
    (callback) => eventApi.getEvent(eventKey, {}, callback),
  )
  return normalizeEvent(event)
}

export async function getEventMatches(eventKey: string, apiKey: string): Promise<TBAMatch[]> {
  return requestWithRetry<TBAMatch[]>(
    `getEventMatches(${eventKey})`,
    apiKey,
    (callback) => matchApi.getEventMatches(eventKey, {}, callback),
  )
}

export async function getEventTeams(eventKey: string, apiKey: string): Promise<TBATeam[]> {
  return requestWithRetry<TBATeam[]>(
    `getEventTeams(${eventKey})`,
    apiKey,
    (callback) => teamApi.getEventTeams(eventKey, {}, callback),
  )
}

export async function getTeam(teamKey: string, apiKey: string): Promise<TBATeam> {
  return requestWithRetry<TBATeam>(
    `getTeam(${teamKey})`,
    apiKey,
    (callback) => teamApi.getTeam(teamKey, {}, callback),
  )
}
