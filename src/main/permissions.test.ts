import { describe, expect, it } from 'vitest'
import { isPermissionCheckAllowed, isPermissionRequestAllowed } from './permissions'

describe('permission requests', () => {
  it('lets the app window write text to the clipboard, so Copy buttons work', () => {
    expect(isPermissionRequestAllowed('clipboard-sanitized-write', true, { isMainFrame: true })).toBe(true)
  })

  it('never lets anything read the clipboard', () => {
    expect(isPermissionRequestAllowed('clipboard-read', true, { isMainFrame: true })).toBe(false)
  })

  it('refuses clipboard writes from embedded content or another window', () => {
    expect(isPermissionRequestAllowed('clipboard-sanitized-write', true, { isMainFrame: false })).toBe(false)
    expect(isPermissionRequestAllowed('clipboard-sanitized-write', false, { isMainFrame: true })).toBe(false)
  })

  it('allows the camera for QR scanning, and only the camera', () => {
    expect(isPermissionRequestAllowed('media', true, { isMainFrame: true, mediaTypes: ['video'] })).toBe(true)
    expect(isPermissionRequestAllowed('media', true, { isMainFrame: true, mediaTypes: ['video', 'audio'] })).toBe(false)
    expect(isPermissionRequestAllowed('media', true, { isMainFrame: true, mediaTypes: ['audio'] })).toBe(false)
    expect(isPermissionRequestAllowed('media', true, { isMainFrame: true })).toBe(false)
    expect(isPermissionRequestAllowed('media', false, { isMainFrame: true, mediaTypes: ['video'] })).toBe(false)
    expect(isPermissionRequestAllowed('media', true, { isMainFrame: false, mediaTypes: ['video'] })).toBe(false)
  })

  it('refuses everything else', () => {
    for (const permission of ['display-capture', 'geolocation', 'notifications', 'midi', 'fullscreen', 'openExternal', 'clipboard-read']) {
      expect(isPermissionRequestAllowed(permission, true, { isMainFrame: true })).toBe(false)
    }
  })
})

describe('permission checks', () => {
  it('reports clipboard writes as allowed for the app window only', () => {
    expect(isPermissionCheckAllowed('clipboard-sanitized-write', true, { isMainFrame: true })).toBe(true)
    expect(isPermissionCheckAllowed('clipboard-sanitized-write', true, { isMainFrame: false })).toBe(false)
    expect(isPermissionCheckAllowed('clipboard-sanitized-write', false, { isMainFrame: true })).toBe(false)
  })

  it('reports clipboard reads as refused', () => {
    expect(isPermissionCheckAllowed('clipboard-read', true, { isMainFrame: true })).toBe(false)
  })

  it('reports only the camera as allowed among devices', () => {
    expect(isPermissionCheckAllowed('media', true, { isMainFrame: true, mediaType: 'video' })).toBe(true)
    expect(isPermissionCheckAllowed('media', true, { isMainFrame: true, mediaType: 'audio' })).toBe(false)
    expect(isPermissionCheckAllowed('media', true, { isMainFrame: false, mediaType: 'video' })).toBe(false)
  })
})
