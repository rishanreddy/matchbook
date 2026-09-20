/**
 * Turns electron-updater's `UpdateInfo` into something a scouting team can read.
 *
 * The Settings screen used to render `JSON.stringify(updateInfo)`, which put the
 * whole payload on screen: every file's sha512, byte sizes, and GitHub's release
 * notes with their HTML tags still in them.
 */

export type ReleaseSummary = {
  version: string | null
  releasedAt: string | null
  /** GitHub's release notes with markup removed. Empty when there are none. */
  notes: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * Strips markup from GitHub's release notes.
 *
 * The notes are parsed into a detached document and read back as text, so nothing
 * from the payload is ever interpreted as markup by the app itself.
 */
export function releaseNotesToText(raw: unknown): string {
  const html = asString(raw)
  if (!html) {
    return ''
  }

  if (typeof DOMParser !== 'undefined') {
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
    return text.replace(/\s+/g, ' ').trim()
  }

  // Fallback for non-browser environments. Tags become spaces so words either side of
  // a block element do not run together, then the space that leaves in front of
  // punctuation is removed so "Changelog</strong>:" does not read "Changelog :".
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:;,.!?])/g, '$1')
    .trim()
}

export function summarizeRelease(info: unknown): ReleaseSummary | null {
  const record = asRecord(info)
  if (!record) {
    return null
  }

  const version = asString(record.version)
  const rawDate = asString(record.releaseDate)
  let releasedAt: string | null = null

  if (rawDate) {
    const parsed = new Date(rawDate)
    releasedAt = Number.isNaN(parsed.getTime())
      ? null
      : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const summary: ReleaseSummary = {
    version,
    releasedAt,
    notes: releaseNotesToText(record.releaseNotes),
  }

  return summary.version || summary.notes ? summary : null
}
