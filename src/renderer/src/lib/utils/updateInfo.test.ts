import { describe, expect, it } from 'vitest'
import { releaseNotesToText, summarizeRelease } from './updateInfo'

// The exact shape electron-updater handed the Settings screen, which it was printing
// verbatim with JSON.stringify.
const REAL_PAYLOAD = {
  tag: 'v2.1.2',
  version: '2.1.2',
  files: [
    { url: 'Matchbook-2.1.2-arm64-mac.zip', sha512: 'Mj1qlXl6aV/sv3sTxpUYJKexQlG/nZILyTG6', size: 177061665 },
    { url: 'Matchbook-2.1.2-arm64.dmg', sha512: '+twVWL7cx4TnHUT24QrbD+pUtL7HFHYej5UY', size: 183912924 },
  ],
  path: 'Matchbook-2.1.2-arm64-mac.zip',
  sha512: 'Mj1qlXl6aV/sv3sTxpUYJKexQlG/nZILyTG6',
  releaseDate: '2026-09-18T20:59:53.810Z',
  releaseName: 'v2.1.2',
  releaseNotes:
    '<p><strong>Full Changelog</strong>: <a class="commit-link" href="https://github.com/rishanreddy/matchbook/compare/v2.1.1...v2.1.2"><tt>v2.1.1...v2.1.2</tt></a></p>',
}

describe('summarizeRelease', () => {
  it('keeps only what a person would read', () => {
    const summary = summarizeRelease(REAL_PAYLOAD)

    expect(summary?.version).toBe('2.1.2')
    expect(summary?.notes).toBe('Full Changelog: v2.1.1...v2.1.2')
    expect(summary?.releasedAt).toMatch(/2026/)
  })

  it('never leaks checksums or byte sizes into the summary', () => {
    const rendered = JSON.stringify(summarizeRelease(REAL_PAYLOAD))

    expect(rendered).not.toContain('sha512')
    expect(rendered).not.toContain('177061665')
    expect(rendered).not.toContain('.zip')
  })

  it('returns null when there is nothing worth showing', () => {
    expect(summarizeRelease(null)).toBeNull()
    expect(summarizeRelease('nope')).toBeNull()
    expect(summarizeRelease({ files: [] })).toBeNull()
  })

  it('still summarizes a release that has no notes', () => {
    expect(summarizeRelease({ version: '3.0.0' })).toEqual({
      version: '3.0.0',
      releasedAt: null,
      notes: '',
    })
  })

  it('ignores an unparseable release date rather than printing Invalid Date', () => {
    expect(summarizeRelease({ version: '3.0.0', releaseDate: 'not a date' })?.releasedAt).toBeNull()
  })
})

describe('releaseNotesToText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(releaseNotesToText('<p>One</p>\n<p>Two</p>')).toBe('One Two')
  })

  it('does not execute or retain script content as markup', () => {
    const text = releaseNotesToText('<p>Safe</p><script>alert(1)</script>')

    expect(text).not.toContain('<script>')
    expect(text.startsWith('Safe')).toBe(true)
  })

  it('handles missing or non-string notes', () => {
    expect(releaseNotesToText(undefined)).toBe('')
    expect(releaseNotesToText(42)).toBe('')
    expect(releaseNotesToText('   ')).toBe('')
  })
})
