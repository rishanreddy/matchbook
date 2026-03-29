export interface Shortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

function shortcutId(shortcut: Pick<Shortcut, 'key' | 'ctrl' | 'shift' | 'alt'>): string {
  return `${shortcut.ctrl ? '1' : '0'}:${shortcut.shift ? '1' : '0'}:${shortcut.alt ? '1' : '0'}:${normalizeKey(shortcut.key)}`
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export class ShortcutManager {
  private shortcuts: Map<string, Shortcut>

  constructor() {
    this.shortcuts = new Map()
  }

  register(shortcut: Shortcut): void {
    this.shortcuts.set(shortcutId(shortcut), { ...shortcut, key: normalizeKey(shortcut.key) })
  }

  unregister(key: string): void {
    const normalized = normalizeKey(key)
    for (const [id, shortcut] of this.shortcuts.entries()) {
      if (shortcut.key === normalized) {
        this.shortcuts.delete(id)
      }
    }
  }

  list(): Shortcut[] {
    return Array.from(this.shortcuts.values())
  }

  handleKeyPress(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) {
      return
    }

    const key = normalizeKey(event.key)
    for (const shortcut of this.shortcuts.values()) {
      const ctrlMatched = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey
      const shiftMatched = shortcut.shift ? event.shiftKey : !event.shiftKey
      const altMatched = shortcut.alt ? event.altKey : !event.altKey
      const keyMatched = shortcut.key === key

      if (ctrlMatched && shiftMatched && altMatched && keyMatched) {
        event.preventDefault()
        shortcut.action()
        return
      }
    }
  }
}

export const shortcutManager = new ShortcutManager()
