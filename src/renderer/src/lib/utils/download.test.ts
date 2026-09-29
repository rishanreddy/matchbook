import { describe, expect, it } from 'vitest'
import { timestampedFileStem } from './download'

describe('timestampedFileStem', () => {
  const when = new Date(2026, 2, 14, 18, 5)

  it('names the file after the laptop and the moment, so two saves never collide', () => {
    expect(timestampedFileStem('Scout Laptop 3', when)).toBe('scout-laptop-3-2026-03-14-1805')
  })

  it('removes characters that are not safe in a file name', () => {
    expect(timestampedFileStem('  Red/Blue: "Pit" Hub!  ', when)).toBe('red-blue-pit-hub-2026-03-14-1805')
  })

  it('still produces a usable name when the laptop has none', () => {
    expect(timestampedFileStem(null, when)).toBe('matchbook-2026-03-14-1805')
    expect(timestampedFileStem('???', when)).toBe('matchbook-2026-03-14-1805')
  })
})
