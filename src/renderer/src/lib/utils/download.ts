/**
 * Saves text as a file through the browser's download path, which in Electron opens the
 * system "Save as" dialog. The object URL is released after a delay: revoking it in the
 * same tick can cancel the download before it starts.
 */
export function downloadTextFile(content: string, fileName: string, type = 'application/json'): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** `Scout Laptop 3` on 14 March 2026 at 18:05 becomes `scout-laptop-3-2026-03-14-1805`. */
export function timestampedFileStem(deviceName: string | null | undefined, now = new Date()): string {
  const name = (deviceName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'matchbook'
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${name}-${date}-${pad(now.getHours())}${pad(now.getMinutes())}`
}
