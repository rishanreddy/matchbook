/** Launch the built desktop app to catch blank screens and broken preload bridges. */
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const application = await electron.launch({
  executablePath: electronPath,
  args: ['.'],
  env,
  timeout: 30_000,
})

try {
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
  await application.close()
}
