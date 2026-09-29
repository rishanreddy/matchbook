import { notifications } from '@mantine/notifications'
import type { NotificationData } from '@mantine/notifications'

export type NotifyOptions = Omit<NotificationData, 'autoClose' | 'className' | 'id'> & {
  /** Repeats of the same id are dropped while one is still on screen. Defaults to a hash of the text. */
  id?: string
  /** Milliseconds before the toast closes itself. Capped: a toast never stays up indefinitely. */
  autoClose?: number
  /** Only for toasts that hold a button. Ordinary toasts let clicks fall through to the page beneath. */
  interactive?: boolean
}

type Severity = 'error' | 'warning' | 'success' | 'info'

const DEFAULT_DURATION_MS: Record<Severity, number> = {
  error: 9_000,
  warning: 7_000,
  success: 3_500,
  info: 4_500,
}

const MAX_DURATION_MS = 20_000
// Mantine pauses a toast's timer while the pointer is over it. Toasts here do not take
// pointer events, but the backstop below still guarantees removal if anything ever
// leaves a timer cancelled.
const BACKSTOP_GRACE_MS = 1_500

const backstops = new Map<string, number>()

function severityOf(color: string | undefined): Severity {
  switch (color) {
    case 'red':
    case 'danger':
    case 'error':
      return 'error'
    case 'yellow':
    case 'orange':
    case 'amber':
    case 'warning':
    case 'frc-orange':
      return 'warning'
    case 'green':
    case 'success':
    case 'teal':
      return 'success'
    default:
      return 'info'
  }
}

function armBackstop(id: string, durationMs: number): void {
  const existing = backstops.get(id)
  if (existing !== undefined) {
    window.clearTimeout(existing)
  }

  backstops.set(
    id,
    window.setTimeout(() => {
      backstops.delete(id)
      notifications.hide(id)
    }, durationMs + BACKSTOP_GRACE_MS),
  )
}

/**
 * Shows a toast that is guaranteed to go away.
 *
 * Mantine's default toast is a trap on a laptop: it appears where the pointer just
 * clicked, gets a synthetic mouse-enter (which cancels its close timer), covers the
 * next button, and swallows the click meant for it. Here toasts are click-through,
 * always time out, and identical repeats collapse into one instead of stacking.
 */
export function notify(options: NotifyOptions): string {
  const { interactive = false, autoClose, id, ...rest } = options
  const severity = severityOf(typeof rest.color === 'string' ? rest.color : undefined)
  const duration = Math.min(autoClose ?? DEFAULT_DURATION_MS[severity], MAX_DURATION_MS)
  const title = typeof rest.title === 'string' ? rest.title : ''
  const message = typeof rest.message === 'string' ? rest.message : ''
  const resolvedId = id ?? `${severity}:${title}:${message}`

  const shownId = notifications.show({
    ...rest,
    id: resolvedId,
    autoClose: duration,
    withCloseButton: rest.withCloseButton ?? true,
    className: interactive ? 'mb-toast mb-toast--interactive' : 'mb-toast',
  })

  armBackstop(shownId, duration)
  return shownId
}

export function dismissAllNotifications(): void {
  backstops.forEach((timer) => window.clearTimeout(timer))
  backstops.clear()
  notifications.clean()
}

/** Escape clears every toast, so one can never be left covering something. */
export function setupToastKeyboardDismissal(): void {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      dismissAllNotifications()
    }
  })
}
