import { Button, Group, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import axios from 'axios'
import { logger } from './logger'

export class AppError extends Error {
  public readonly code: string
  public readonly context?: Record<string, unknown>

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.context = context
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  NO_INTERNET: 'No internet connection detected. Check your network and try again.',
  INVALID_TBA_API_KEY: 'Your TBA API key appears invalid. Update it in Settings and retry.',
  DATABASE_INIT_FAILED:
    'Unable to initialize local storage. Please ensure storage permissions are granted, there is sufficient disk space, and the app can write to local storage. Then restart the app.',
  FORM_VALIDATION_ERROR: 'Please review the highlighted form fields and try again.',
  SYNC_FAILED: 'Sync failed. Verify both devices are on the same network and retry.',
  FILE_PERMISSION_ERROR: 'File permission denied. Choose a writable location and try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
}

const recentNotifications = new Map<string, number>()
const NOTIFICATION_DEDUP_WINDOW_MS = 5000

export function getFriendlyErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return FRIENDLY_MESSAGES[error.code] ?? error.message
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (!status) {
      return FRIENDLY_MESSAGES.NO_INTERNET
    }
    if (status === 401 || status === 403) {
      return FRIENDLY_MESSAGES.INVALID_TBA_API_KEY
    }
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('permission')) {
      return FRIENDLY_MESSAGES.FILE_PERMISSION_ERROR
    }
    if (msg.includes('database')) {
      return FRIENDLY_MESSAGES.DATABASE_INIT_FAILED
    }
    if (msg.includes('validation')) {
      return FRIENDLY_MESSAGES.FORM_VALIDATION_ERROR
    }
    if (msg.includes('sync')) {
      return FRIENDLY_MESSAGES.SYNC_FAILED
    }
    return error.message
  }

  return FRIENDLY_MESSAGES.UNKNOWN
}

export function handleError(error: unknown, context?: string): void {
  logger.error(context ? `${context} failed` : 'Unhandled application error', error)

  const message = getFriendlyErrorMessage(error)
  const key = `${context ?? 'global'}::${message}`
  const now = Date.now()
  const lastShownAt = recentNotifications.get(key)

  if (lastShownAt && now - lastShownAt < NOTIFICATION_DEDUP_WINDOW_MS) {
    return
  }

  recentNotifications.set(key, now)
  window.setTimeout(() => {
    recentNotifications.delete(key)
  }, NOTIFICATION_DEDUP_WINDOW_MS)

  notifications.show({
    color: 'red',
    title: 'Action failed',
    message,
  })
}

export function notifyErrorWithRetry(
  error: unknown,
  retryLabel: string,
  onRetry: () => void,
  context?: string,
): void {
  logger.warn(context ? `${context} failed with retry option` : 'Retryable error', error)
  notifications.show({
    color: 'red',
    title: 'Action failed',
    autoClose: false,
    message: (
      <Stack gap={6}>
        <Text size="sm">{getFriendlyErrorMessage(error)}</Text>
        <Group>
          <Button size="xs" variant="light" onClick={onRetry}>
            {retryLabel}
          </Button>
        </Group>
      </Stack>
    ),
  })
}

export function setupGlobalErrorHandlers(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    logger.error('window.onerror', { message, source, lineno, colno, error })
  }

  window.onunhandledrejection = (event) => {
    logger.error('window.onunhandledrejection', event.reason)
  }
}
