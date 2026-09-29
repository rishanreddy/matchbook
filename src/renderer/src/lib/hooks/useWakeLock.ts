import { useEffect } from 'react'

/** Keeps the screen awake while `active`, so a laptop does not dim halfway through a transfer. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return
    }

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async (): Promise<void> => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release().catch(() => undefined)
          return
        }
        sentinel = lock
      } catch {
        // Best effort: some machines refuse (battery saver). The transfer still works.
      }
    }

    const reacquireWhenVisible = (): void => {
      if (document.visibilityState === 'visible' && !cancelled && (!sentinel || sentinel.released)) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', reacquireWhenVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', reacquireWhenVisible)
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}
