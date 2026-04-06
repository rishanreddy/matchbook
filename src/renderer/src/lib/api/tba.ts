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

type IpcTbaResponse = {
  ok: boolean
  status: number
  statusText: string
  data: unknown
  retryAfter: string | null
}

function hasElectronTbaBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI?.tbaRequest === 'function'
}

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

function isLikelyInvalidApiKeyFailure(status: number | undefined, message: string): boolean {
  if (status === 401 || status === 403) {
    return true
  }

  const normalized = message.toLowerCase()
  return (
    (normalized.includes('invalid') && normalized.includes('api key')) ||
    normalized.includes('api_key') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('authentication')
  )
}

function shouldRetryFailure(failure: RequestFailure): boolean {
  if (isLikelyInvalidApiKeyFailure(failure.status, failure.message)) {
    return false
  }

  if (failure.status === undefined) {
    return true
  }

  if (failure.status === 429) {
    return true
  }

  return failure.status >= 500
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function isBrowserCorsBlockedFailure(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('access-control-allow-origin') ||
    normalized.includes('origin is not allowed') ||
    normalized.includes('request has been terminated') ||
    normalized.includes('cors')
  )
}

function mapClientFailure(operation: string, error: unknown, response: unknown): RequestFailure {
  const responseRecord = response as { status?: number; headers?: Record<string, string> } | undefined
  const errorRecord = error as { status?: number; message?: string } | undefined
  let status = responseRecord?.status ?? errorRecord?.status
  const retryAfter = responseRecord?.headers?.['retry-after']

  const rawMessage =
    (typeof errorRecord?.message === 'string' && errorRecord.message.trim().length > 0
      ? errorRecord.message
      : error instanceof Error
        ? error.message
        : '')

  if (status === undefined && isLikelyInvalidApiKeyFailure(undefined, rawMessage)) {
    status = 401
  }

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

    const canRetry = attempt < MAX_RETRIES && shouldRetryFailure(lastFailure)
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
    throw new AppError(`TBA request failed for ${operation}: Unknown error`, 'TBA_REQUEST_FAILED', { operation })
  }

  if (isLikelyInvalidApiKeyFailure(lastFailure.status, lastFailure.message)) {
    throw new AppError(lastFailure.message, 'INVALID_TBA_API_KEY', {
      operation,
      status: lastFailure.status,
      error: lastFailure.rawError,
      transport: 'tba-api-v3client',
    })
  }

  if (isBrowserOffline()) {
    throw new AppError(lastFailure.message, 'NO_INTERNET', {
      operation,
      status: lastFailure.status,
      error: lastFailure.rawError,
      transport: 'tba-api-v3client',
    })
  }

  if (!hasElectronTbaBridge() && isBrowserCorsBlockedFailure(lastFailure.message)) {
    throw new AppError(
      'TBA API requests are blocked in browser mode by CORS. Run Matchbook in Electron mode (pnpm dev) and retry.',
      'TBA_REQUEST_FAILED',
      {
        operation,
        status: lastFailure.status,
        error: lastFailure.rawError,
        transport: 'tba-api-v3client',
      },
    )
  }

  throw new AppError(lastFailure.message, 'TBA_REQUEST_FAILED', {
    operation,
    status: lastFailure.status,
    error: lastFailure.rawError,
    transport: 'tba-api-v3client',
  })
}

async function requestWithRetryIpc<T>(operation: string, endpoint: string, apiKey: string): Promise<T> {
  if (!apiKey.trim()) {
    throw new AppError('TBA request failed: Missing API key', 'INVALID_TBA_API_KEY', { operation })
  }

  if (!hasElectronTbaBridge()) {
    throw new AppError('TBA IPC bridge is unavailable in this runtime.', 'TBA_REQUEST_FAILED', {
      operation,
      endpoint,
    })
  }

  let lastFailure: RequestFailure | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    logger.debug('TBA request started', { operation, endpoint, attempt, transport: 'electron-ipc' })
    try {
      const response = (await window.electronAPI.tbaRequest(endpoint, apiKey)) as IpcTbaResponse

      if (response.ok) {
        logger.info('TBA request successful', { operation, endpoint, attempt, transport: 'electron-ipc' })
        return response.data as T
      }

      lastFailure = {
        status: response.status,
        retryAfter: response.retryAfter ?? undefined,
        message: formatHttpErrorMessage(operation, response.status),
        rawError: response.data,
      }
    } catch (error: unknown) {
      lastFailure = mapClientFailure(operation, error, undefined)
    }

    const canRetry = attempt < MAX_RETRIES && shouldRetryFailure(lastFailure)
    if (!canRetry) {
      logger.error('TBA request failed without retry', {
        operation,
        endpoint,
        transport: 'electron-ipc',
        status: lastFailure.status,
        message: lastFailure.message,
      })
      break
    }

    const delayMs = getRetryDelay(attempt, lastFailure.retryAfter)
    logger.warn('TBA request retry scheduled', {
      operation,
      endpoint,
      attempt,
      delayMs,
      transport: 'electron-ipc',
      status: lastFailure.status,
    })
    await sleep(delayMs)
  }

  if (!lastFailure) {
    throw new AppError(`TBA request failed for ${operation}: Unknown error`, 'TBA_REQUEST_FAILED', {
      operation,
      endpoint,
      transport: 'electron-ipc',
    })
  }

  if (isLikelyInvalidApiKeyFailure(lastFailure.status, lastFailure.message)) {
    throw new AppError(lastFailure.message, 'INVALID_TBA_API_KEY', {
      operation,
      endpoint,
      status: lastFailure.status,
      error: lastFailure.rawError,
      transport: 'electron-ipc',
    })
  }

  if (isBrowserOffline()) {
    throw new AppError(lastFailure.message, 'NO_INTERNET', {
      operation,
      endpoint,
      status: lastFailure.status,
      error: lastFailure.rawError,
      transport: 'electron-ipc',
    })
  }

  throw new AppError(lastFailure.message, 'TBA_REQUEST_FAILED', {
    operation,
    endpoint,
    status: lastFailure.status,
    error: lastFailure.rawError,
    transport: 'electron-ipc',
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
  const operation = `getEventsByYear(${year})`
  const events = hasElectronTbaBridge()
    ? await requestWithRetryIpc<unknown[]>(operation, `/events/${year}`, apiKey)
    : await requestWithRetry<unknown[]>(operation, apiKey, (callback) => eventApi.getEventsByYear(year, {}, callback))

  return events.map((event) => normalizeEvent(event))
}

export async function getTbaStatus(apiKey: string): Promise<Record<string, unknown>> {
  const operation = 'getStatus()'
  if (hasElectronTbaBridge()) {
    return requestWithRetryIpc<Record<string, unknown>>(operation, '/status', apiKey)
  }

  return requestWithRetry<Record<string, unknown>>(operation, apiKey, (callback) => statusApi.getStatus({}, callback))
}

export async function getEvent(eventKey: string, apiKey: string): Promise<TBAEvent> {
  const operation = `getEvent(${eventKey})`
  const event = hasElectronTbaBridge()
    ? await requestWithRetryIpc<unknown>(operation, `/event/${eventKey}`, apiKey)
    : await requestWithRetry<unknown>(operation, apiKey, (callback) => eventApi.getEvent(eventKey, {}, callback))

  return normalizeEvent(event)
}

export async function getEventMatches(eventKey: string, apiKey: string): Promise<TBAMatch[]> {
  const operation = `getEventMatches(${eventKey})`
  if (hasElectronTbaBridge()) {
    return requestWithRetryIpc<TBAMatch[]>(operation, `/event/${eventKey}/matches`, apiKey)
  }

  return requestWithRetry<TBAMatch[]>(operation, apiKey, (callback) => matchApi.getEventMatches(eventKey, {}, callback))
}

export async function getEventTeams(eventKey: string, apiKey: string): Promise<TBATeam[]> {
  const operation = `getEventTeams(${eventKey})`
  if (hasElectronTbaBridge()) {
    return requestWithRetryIpc<TBATeam[]>(operation, `/event/${eventKey}/teams`, apiKey)
  }

  return requestWithRetry<TBATeam[]>(operation, apiKey, (callback) => teamApi.getEventTeams(eventKey, {}, callback))
}

export async function getTeam(teamKey: string, apiKey: string): Promise<TBATeam> {
  const operation = `getTeam(${teamKey})`
  if (hasElectronTbaBridge()) {
    return requestWithRetryIpc<TBATeam>(operation, `/team/${teamKey}`, apiKey)
  }

  return requestWithRetry<TBATeam>(operation, apiKey, (callback) => teamApi.getTeam(teamKey, {}, callback))
}
