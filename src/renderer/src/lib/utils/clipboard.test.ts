import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

function fakeField() {
  return {
    value: '',
    readOnly: false,
    style: { cssText: '' },
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  }
}

function stubPage(execCommand: () => boolean) {
  const field = fakeField()
  const body = { append: vi.fn() }
  vi.stubGlobal('document', {
    activeElement: null,
    body,
    createElement: vi.fn(() => field),
    execCommand: vi.fn(execCommand),
  })
  return { field, body }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('uses the Clipboard API when it is allowed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('the prompt')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('the prompt')
  })

  it('falls back to selecting the text when the Clipboard API is refused', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Write permission denied.')) } })
    const { field, body } = stubPage(() => true)

    await expect(copyText('the prompt')).resolves.toBe(true)
    expect(field.value).toBe('the prompt')
    expect(field.select).toHaveBeenCalled()
    expect(body.append).toHaveBeenCalledWith(field)
    expect(field.remove).toHaveBeenCalled()
  })

  it('falls back when the Clipboard API does not exist at all', async () => {
    vi.stubGlobal('navigator', {})
    stubPage(() => true)

    await expect(copyText('code')).resolves.toBe(true)
  })

  it('reports failure, and cleans up, when nothing can copy', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const refused = stubPage(() => false)
    await expect(copyText('code')).resolves.toBe(false)
    expect(refused.field.remove).toHaveBeenCalled()

    const throwing = stubPage(() => {
      throw new Error('not allowed')
    })
    await expect(copyText('code')).resolves.toBe(false)
    expect(throwing.field.remove).toHaveBeenCalled()
  })
})
