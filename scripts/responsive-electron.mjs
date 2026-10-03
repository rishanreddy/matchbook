/** Resize the real desktop window and fail if the app stops fitting it. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'

// Content sizes, in CSS pixels. "minimum" is the smallest window the app lets a person drag to.
const SIZES = [
  ['minimum', null],
  ['small laptop', [1024, 600]],
  ['1366x768 laptop', [1366, 768]],
  ['1440x900', [1440, 900]],
]

const ROUTES = ['/', '/scout', '/entries', '/events', '/analysis', '/assignments', '/sync', '/form-builder', '/device-setup', '/settings', '/help']

// Below this height the navigation list is allowed to scroll; above it every destination must be on screen.
const NAV_FITS_FROM_HEIGHT = 520
const DRAWER_BELOW_WIDTH = 992

const profile = await mkdtemp(path.join(tmpdir(), 'matchbook-responsive-'))
const env = { ...process.env, MATCHBOOK_E2E_USER_DATA: profile }
delete env.ELECTRON_RUN_AS_NODE

const problems = []
const skipped = []
let application

/** Runs in the page: measures the things a person would call "broken" and returns what is wrong. */
function measureLayout({ route, expectNavFit }) {
  const found = []
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const rect = (element) => element.getBoundingClientRect()

  const shell = document.querySelector('.app-shell-root')
  if (!shell) {
    return [`${route}: the app shell is missing`]
  }

  const shellBox = rect(shell)
  if (Math.abs(shellBox.width - viewportWidth) > 1 || Math.abs(shellBox.height - viewportHeight) > 1) {
    found.push(`${route}: the app is ${Math.round(shellBox.width)}x${Math.round(shellBox.height)} inside a ${viewportWidth}x${viewportHeight} window`)
  }

  if (document.documentElement.scrollWidth > viewportWidth + 1) {
    found.push(`${route}: the page is wider than the window (${document.documentElement.scrollWidth} > ${viewportWidth})`)
  }

  const main = document.querySelector('.mantine-AppShell-main')
  if (main && main.scrollWidth > main.clientWidth + 1) {
    found.push(`${route}: the content scrolls sideways (${main.scrollWidth} > ${main.clientWidth})`)
  }

  const header = document.querySelector('.mantine-AppShell-header')
  if (header && header.scrollWidth > header.clientWidth + 1) {
    found.push(`${route}: the header buttons do not fit (${header.scrollWidth} > ${header.clientWidth})`)
  }

  const navbar = document.querySelector('.mantine-AppShell-navbar')
  if (navbar && rect(navbar).right > 1) {
    const list = navbar.querySelector('.app-nav-scroll')
    const visibleTop = rect(list).top
    const visibleBottom = rect(list).bottom
    for (const label of navbar.querySelectorAll('.app-nav-label')) {
      if (rect(label).height > 22) {
        found.push(`${route}: the navigation label "${label.textContent}" wraps onto two lines`)
      }
    }
    if (expectNavFit) {
      for (const item of navbar.querySelectorAll('.app-nav-root')) {
        const box = rect(item)
        if (box.top < visibleTop - 1 || box.bottom > visibleBottom + 1) {
          found.push(`${route}: "${item.textContent.trim()}" is cut off in the navigation at ${viewportHeight}px tall`)
        }
      }
    }
  }

  return found
}

async function settle(window) {
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await window.waitForTimeout(150)
}

async function resizeTo(window, size) {
  return application.evaluate(({ BrowserWindow, screen }, requested) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win.isMaximized()) win.unmaximize()
    if (win.isFullScreen()) win.setFullScreen(false)
    const [width, height] = requested ?? [1, 1]
    win.setContentSize(width, height)
    const [contentWidth, contentHeight] = win.getContentSize()
    return { contentWidth, contentHeight, work: screen.getPrimaryDisplay().workAreaSize }
  }, size)
}

async function visit(window, route) {
  await window.evaluate((hash) => {
    window.location.hash = `#${hash}`
  }, route)
  if (route === '/form-builder') {
    await window.locator('.svc-creator').waitFor({ timeout: 30_000 })
  } else {
    await window.waitForFunction(() => !document.body.innerText.includes('Loading page...'), null, { timeout: 30_000 })
  }
  await settle(window)
}

try {
  application = await electron.launch({ executablePath: electronPath, args: ['.'], env, timeout: 30_000 })
  const window = await application.firstWindow()
  const pageErrors = []
  window.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  await window.locator('.app-page-container').waitFor({ timeout: 30_000 })

  const wizard = window.getByRole('dialog')
  await wizard.getByRole('button', { name: 'Lead scout' }).click()
  await wizard.getByRole('textbox', { name: 'Laptop name' }).fill('Responsive Check')
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByRole('button', { name: 'Finish setup' }).click()
  await wizard.waitFor({ state: 'hidden', timeout: 30_000 })

  for (const [name, size] of SIZES) {
    const result = await resizeTo(window, size)
    const label = `${name} (${result.contentWidth}x${result.contentHeight})`

    if (size && (result.contentWidth !== size[0] || result.contentHeight !== size[1])) {
      skipped.push(`${label}: this screen is too small to open a ${size[0]}x${size[1]} window`)
      continue
    }

    await settle(window)
    const viewport = await window.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    if (viewport.width !== result.contentWidth || viewport.height !== result.contentHeight) {
      problems.push(`${label}: the page is ${viewport.width}x${viewport.height}, so it does not fill the window`)
    }

    const usesDrawer = result.contentWidth < DRAWER_BELOW_WIDTH
    const expectNavFit = result.contentHeight >= NAV_FITS_FROM_HEIGHT

    for (const route of ROUTES) {
      await visit(window, route)
      const found = await window.evaluate(measureLayout, { route, expectNavFit: expectNavFit && !usesDrawer })
      problems.push(...found.map((message) => `${label} ${message}`))
    }

    if (usesDrawer) {
      await visit(window, '/')
      await window.getByRole('button', { name: 'Toggle navigation menu' }).click()
      await settle(window)
      const found = await window.evaluate(measureLayout, { route: 'navigation drawer', expectNavFit })
      problems.push(...found.map((message) => `${label} ${message}`))
      await window.getByRole('button', { name: 'Toggle navigation menu' }).click()
      await settle(window)
    }
  }

  assert.equal(pageErrors.length, 0, `The page raised errors while resizing:\n${pageErrors.join('\n')}`)
  assert.ok(skipped.length < SIZES.length, 'No window size could be tested on this screen.')
  for (const note of skipped) {
    console.log(`Skipped ${note}`)
  }
  assert.deepEqual(problems, [], `Layout problems at real window sizes:\n${problems.join('\n')}`)
  console.log(`Responsive check passed: ${SIZES.length - skipped.length} window sizes, ${ROUTES.length} screens each.`)
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
