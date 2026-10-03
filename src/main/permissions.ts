/**
 * What the app window may ask the browser for.
 *
 * Everything is refused except two things Matchbook uses: the camera, to scan QR codes, and
 * writing text to the clipboard, so every Copy button works. Reading the clipboard stays
 * refused, so a page can never look at what a person copied somewhere else.
 *
 * Refusing the clipboard write is what once made every Copy button do nothing: Chromium asks for
 * this permission before `navigator.clipboard.writeText` runs, and an answer of "no" rejects it.
 */

type RequestDetails = { isMainFrame?: boolean; mediaTypes?: readonly string[] }
type CheckDetails = { isMainFrame?: boolean; mediaType?: string }

/** The permission behind `navigator.clipboard.writeText`: plain text out, nothing read back. */
const CLIPBOARD_WRITE = 'clipboard-sanitized-write'

function isClipboardWrite(permission: string, fromAppWindow: boolean, isMainFrame: boolean | undefined): boolean {
  return permission === CLIPBOARD_WRITE && fromAppWindow && isMainFrame === true
}

/** Electron groups camera and microphone under `media`, so only a video-only request is granted. */
export function isPermissionRequestAllowed(permission: string, fromAppWindow: boolean, details: RequestDetails): boolean {
  const isCamera =
    permission === 'media' &&
    fromAppWindow &&
    details.isMainFrame === true &&
    details.mediaTypes?.includes('video') === true &&
    details.mediaTypes.includes('audio') === false

  return isCamera || isClipboardWrite(permission, fromAppWindow, details.isMainFrame)
}

export function isPermissionCheckAllowed(permission: string, fromAppWindow: boolean, details: CheckDetails): boolean {
  const isCamera = permission === 'media' && fromAppWindow && details.isMainFrame === true && details.mediaType === 'video'

  return isCamera || isClipboardWrite(permission, fromAppWindow, details.isMainFrame)
}
