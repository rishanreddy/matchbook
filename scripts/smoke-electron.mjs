/** Launch the built desktop app to catch blank screens and broken preload bridges. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'

const profile = await mkdtemp(path.join(tmpdir(), 'matchbook-smoke-'))
const env = { ...process.env, MATCHBOOK_E2E_USER_DATA: profile }
delete env.ELECTRON_RUN_AS_NODE

let application
try {
  application = await electron.launch({
    executablePath: process.env.MATCHBOOK_SMOKE_EXECUTABLE ?? electronPath,
    args: process.env.MATCHBOOK_SMOKE_EXECUTABLE ? [] : ['.'],
    env,
    timeout: 30_000,
  })
  const window = await application.firstWindow()
  await window.waitForFunction(
    () =>
      Boolean(document.querySelector('.app-page-container')) &&
      !document.querySelector('.db-init-root') &&
      !document.querySelector('[data-testid="startup-splash"]'),
    null,
    { timeout: 30_000 },
  )

  const result = await window.evaluate(async () => ({
    ping: await window.electronAPI?.ping(),
    text: document.querySelector('#root')?.textContent ?? '',
  }))

  assert.equal(result.ping, 'pong', 'The Electron preload bridge is unavailable.')
  assert.doesNotMatch(result.text, /Database setup needs attention|Something went wrong/)
  console.log('Electron smoke check passed: the desktop window rendered and its preload bridge responded.')
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
