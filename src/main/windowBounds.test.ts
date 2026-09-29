import { describe, expect, it } from 'vitest'
import { parseSavedWindowState, planMainWindow, type Rect } from './windowBounds'

const screen = (width: number, height: number, x = 0, y = 0): Rect => ({ x, y, width, height })

describe('planMainWindow', () => {
  it('never produces a window larger than the usable screen', () => {
    const smallScreens = [
      screen(1366, 728), // 1366x768 laptop minus the taskbar
      screen(1280, 680), // 1080p laptop at 150% scaling
      screen(1536, 824), // 1080p laptop at 125% scaling
      screen(1024, 728),
      screen(800, 560),
    ]

    for (const workArea of smallScreens) {
      const plan = planMainWindow(workArea, null)
      expect(plan.bounds.width).toBeLessThanOrEqual(workArea.width)
      expect(plan.bounds.height).toBeLessThanOrEqual(workArea.height)
      expect(plan.minWidth).toBeLessThanOrEqual(workArea.width)
      expect(plan.minHeight).toBeLessThanOrEqual(workArea.height)
    }
  })

  it('fills a small screen instead of floating a cramped window on it', () => {
    expect(planMainWindow(screen(1366, 728), null).maximize).toBe(true)
    expect(planMainWindow(screen(1280, 680), null).maximize).toBe(true)
  })

  it('centres a comfortably sized window on a large screen', () => {
    const plan = planMainWindow(screen(2560, 1400), null)

    expect(plan.maximize).toBe(false)
    expect(plan.bounds).toEqual({ width: 1400, height: 900, x: 580, y: 250 })
  })

  it('respects the work-area origin, such as a macOS menu bar or a second display', () => {
    const plan = planMainWindow(screen(2560, 1400, 1920, 25), null)

    expect(plan.bounds.x).toBeGreaterThanOrEqual(1920)
    expect(plan.bounds.y).toBeGreaterThanOrEqual(25)
  })

  it('restores where the window was last left', () => {
    const plan = planMainWindow(screen(2560, 1400), {
      bounds: { x: 300, y: 200, width: 1100, height: 700 },
      isMaximized: false,
    })

    expect(plan.bounds).toEqual({ x: 300, y: 200, width: 1100, height: 700 })
    expect(plan.maximize).toBe(false)
  })

  it('pulls a saved window back on screen after the display changed', () => {
    const plan = planMainWindow(screen(1366, 728), {
      bounds: { x: 900, y: 500, width: 1400, height: 900 },
      isMaximized: false,
    })

    expect(plan.bounds.x + plan.bounds.width).toBeLessThanOrEqual(1366)
    expect(plan.bounds.y + plan.bounds.height).toBeLessThanOrEqual(728)
  })

  it('ignores a saved window that is now entirely off every screen', () => {
    const plan = planMainWindow(screen(1920, 1040), {
      bounds: { x: 5000, y: 3000, width: 1000, height: 700 },
      isMaximized: false,
    })

    expect(plan.bounds.x).toBeLessThan(1920)
    expect(plan.bounds.y).toBeLessThan(1040)
  })

  it('keeps the maximised state a person left it in', () => {
    const plan = planMainWindow(screen(2560, 1400), {
      bounds: { x: 100, y: 100, width: 1200, height: 800 },
      isMaximized: true,
    })

    expect(plan.maximize).toBe(true)
  })
})

describe('parseSavedWindowState', () => {
  it('accepts a well-formed record', () => {
    expect(parseSavedWindowState({ bounds: { x: 1, y: 2, width: 3, height: 4 }, isMaximized: true })).toEqual({
      bounds: { x: 1, y: 2, width: 3, height: 4 },
      isMaximized: true,
    })
  })

  it.each([null, 'text', 42, {}, { bounds: null }, { bounds: { x: 1, y: 2, width: 'wide', height: 4 } }, { bounds: { x: NaN, y: 0, width: 1, height: 1 } }])(
    'rejects a corrupt record: %j',
    (value) => {
      expect(parseSavedWindowState(value)).toBeNull()
    },
  )
})
