export type Rect = { x: number; y: number; width: number; height: number }

export type SavedWindowState = {
  bounds: Rect
  isMaximized: boolean
}

export type WindowPlan = {
  bounds: Rect
  minWidth: number
  minHeight: number
  maximize: boolean
}

const PREFERRED_SIZE = { width: 1400, height: 900 }
const MINIMUM_SIZE = { width: 900, height: 560 }
// Room the preferred window needs around it before centring it beats filling the screen.
const COMFORT_MARGIN = { width: 80, height: 40 }
// A saved window must keep at least this much of itself on a display to be trusted.
const MIN_VISIBLE = { width: 200, height: 120 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function isFiniteRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const rect = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]))
}

export function parseSavedWindowState(value: unknown): SavedWindowState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as { bounds?: unknown; isMaximized?: unknown }
  if (!isFiniteRect(candidate.bounds)) {
    return null
  }

  return { bounds: candidate.bounds, isMaximized: candidate.isMaximized === true }
}

function intersection(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { width: Math.max(0, width), height: Math.max(0, height) }
}

/**
 * Decides how big the main window should be on a given display.
 *
 * The window used to be a fixed 1400x900 with a 1024x720 floor. On a 1366x768 laptop,
 * or any Windows machine scaled to 125-150%, that is taller than the usable screen, so
 * the bottom of every page sat under the taskbar and its buttons could not be reached.
 * Nothing here may ever exceed the work area.
 */
export function planMainWindow(workArea: Rect, saved: SavedWindowState | null): WindowPlan {
  const minWidth = Math.min(MINIMUM_SIZE.width, workArea.width)
  const minHeight = Math.min(MINIMUM_SIZE.height, workArea.height)

  if (saved) {
    const visible = intersection(saved.bounds, workArea)
    if (visible.width >= MIN_VISIBLE.width && visible.height >= MIN_VISIBLE.height) {
      const width = clamp(saved.bounds.width, minWidth, workArea.width)
      const height = clamp(saved.bounds.height, minHeight, workArea.height)
      return {
        bounds: {
          width,
          height,
          x: clamp(saved.bounds.x, workArea.x, workArea.x + workArea.width - width),
          y: clamp(saved.bounds.y, workArea.y, workArea.y + workArea.height - height),
        },
        minWidth,
        minHeight,
        maximize: saved.isMaximized,
      }
    }
  }

  const width = Math.min(PREFERRED_SIZE.width, workArea.width)
  const height = Math.min(PREFERRED_SIZE.height, workArea.height)
  const fitsComfortably =
    workArea.width >= PREFERRED_SIZE.width + COMFORT_MARGIN.width &&
    workArea.height >= PREFERRED_SIZE.height + COMFORT_MARGIN.height

  return {
    bounds: {
      width,
      height,
      x: workArea.x + Math.floor((workArea.width - width) / 2),
      y: workArea.y + Math.floor((workArea.height - height) / 2),
    },
    minWidth,
    minHeight,
    maximize: !fitsComfortably,
  }
}
