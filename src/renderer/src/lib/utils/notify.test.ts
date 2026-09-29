import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ShownToast = { id?: string; autoClose?: number; className?: string }
const show = vi.fn((options: ShownToast) => options.id ?? 'generated')
const hide = vi.fn()
const clean = vi.fn()

vi.mock('@mantine/notifications', () => ({
  notifications: { show, hide, clean },
}))

const { notify, dismissAllNotifications } = await import('./notify')

describe('notify', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    show.mockClear()
    hide.mockClear()
    clean.mockClear()
  })

  afterEach(() => {
    dismissAllNotifications()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('gives errors longer on screen than confirmations', () => {
    notify({ color: 'red', title: 'Failed', message: 'x' })
    notify({ color: 'green', title: 'Saved', message: 'y' })

    expect(show.mock.calls[0][0].autoClose).toBe(9_000)
    expect(show.mock.calls[1][0].autoClose).toBe(3_500)
  })

  it('never lets a toast stay open indefinitely', () => {
    notify({ color: 'red', title: 'Stuck?', message: 'x', autoClose: 10 * 60_000 })

    expect(show.mock.calls[0][0].autoClose).toBe(20_000)
  })

  it('lets clicks fall through unless the toast holds a button', () => {
    notify({ color: 'blue', title: 'Plain', message: 'x' })
    notify({ color: 'red', title: 'Retry', message: 'x', interactive: true })

    expect(show.mock.calls[0][0].className).toBe('mb-toast')
    expect(show.mock.calls[1][0].className).toBe('mb-toast mb-toast--interactive')
  })

  it('reuses one id for identical repeats so they collapse instead of stacking', () => {
    notify({ color: 'yellow', title: 'Sync required', message: 'No form' })
    notify({ color: 'yellow', title: 'Sync required', message: 'No form' })
    notify({ color: 'yellow', title: 'Sync required', message: 'A different message' })

    const ids = show.mock.calls.map(([options]) => options.id)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
  })

  it('removes the toast itself if its own timer was ever cancelled', () => {
    const id = notify({ color: 'green', title: 'Saved', message: 'x' })

    vi.advanceTimersByTime(3_500)
    expect(hide).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1_500)
    expect(hide).toHaveBeenCalledWith(id)
  })

  it('clears every pending backstop when everything is dismissed', () => {
    notify({ color: 'green', title: 'Saved', message: 'x' })
    dismissAllNotifications()
    vi.advanceTimersByTime(60_000)

    expect(clean).toHaveBeenCalledTimes(1)
    expect(hide).not.toHaveBeenCalled()
  })
})
