type Focusable = { focus?: () => void; closest?: (selector: string) => Element | null }

/**
 * The older route: select the text in a hidden field and ask the page to copy the selection.
 * It is allowed from any click, so it still works where the Clipboard API is refused.
 */
function copyBySelection(text: string): boolean {
  const active = document.activeElement as Focusable | null
  // Inside an open dialog the field has to live in the dialog, or its focus trap pushes focus back out.
  const host = (active?.closest?.('[role="dialog"]') as Element | null | undefined) ?? document.body

  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.setAttribute('aria-hidden', 'true')
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
  host.append(field)

  try {
    field.focus()
    field.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
    active?.focus?.()
  }
}

/** Puts text on the clipboard. Returns false, instead of throwing, when nothing could be copied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyBySelection(text)
  }
}
