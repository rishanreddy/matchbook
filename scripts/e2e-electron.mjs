/** Exercise the built Electron app with a disposable first-run profile. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'

const profile = await mkdtemp(path.join(tmpdir(), 'matchbook-e2e-'))
const startupTimeout = Number(process.env.MATCHBOOK_E2E_STARTUP_TIMEOUT_MS ?? 30_000)
const env = { ...process.env, MATCHBOOK_E2E_USER_DATA: profile }
delete env.ELECTRON_RUN_AS_NODE

let application
try {
  application = await electron.launch({
    executablePath: electronPath,
    args: ['.'],
    env,
    timeout: 30_000,
  })
  const window = await application.firstWindow()
  const pageErrors = []
  const consoleMessages = []
  window.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message))
  window.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))

  try {
    await window.locator('.app-page-container').waitFor({ timeout: startupTimeout })
  } catch (error) {
    const state = await window.evaluate(() => ({
      url: location.href,
      title: document.title,
      root: document.querySelector('#root')?.innerHTML.slice(0, 2_000) ?? null,
      bodyText: document.body.innerText.slice(0, 1_000),
    }))
    await window.screenshot({ path: path.join(profile, 'startup-failure.png') })
    console.error('Electron startup diagnostics:', JSON.stringify({ state, pageErrors, consoleMessages }, null, 2))
    throw error
  }
  assert.equal(await window.evaluate(() => window.electronAPI?.ping()), 'pong')
  const contentSecurityPolicy = await window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  assert.match(contentSecurityPolicy ?? '', /script-src 'self' 'unsafe-eval'/)
  assert.doesNotMatch(contentSecurityPolicy ?? '', /script-src[^;]*'unsafe-inline'/)
  assert.match(contentSecurityPolicy ?? '', /object-src 'none'/)

  const wizard = window.getByRole('dialog')
  await wizard.getByRole('button', { name: 'Lead scout' }).click()
  await wizard.getByRole('textbox', { name: 'Laptop name' }).fill('E2E Lead Scout')
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await wizard.getByRole('button', { name: 'Finish setup' }).click()
  await wizard.waitFor({ state: 'hidden', timeout: 30_000 })

  await window.evaluate(() => localStorage.setItem('developer_mode', 'true'))
  await window.reload()
  await window.locator('.app-page-container').waitFor({ timeout: 30_000 })

  const tourButton = window.getByRole('button', { name: 'Take a tour of Matchbook' })
  await tourButton.waitFor()
  await tourButton.click()
  const tourSteps = [
    ['Your competition workspace', '#/'],
    ['Bring in the event schedule', '#/events'],
    ['Keep everyone on the same event', '#/'],
    ['Record what happens in a match', '#/scout'],
    ['Review and correct observations', '#/entries'],
    ['Compare teams with collected evidence', '#/analysis'],
    ['Move scouting between laptops', '#/sync'],
    ['Plan scout coverage', '#/assignments'],
    ['Shape the scouting form', '#/form-builder'],
    ['Give each laptop a clear role', '#/device-setup'],
    ['Tune Matchbook for your team', '#/settings'],
    ['Find guides when you need them', '#/help'],
    ['Diagnostics for advanced operators', '#/developer-tools'],
  ]
  for (const [index, [title, route]] of tourSteps.entries()) {
    await window.getByText(title, { exact: true }).waitFor()
    await window.waitForFunction((expectedRoute) => {
      const hash = window.location.hash
      const currentPath = hash.startsWith('#/') ? hash.slice(1) : hash === '' || hash === '#' ? '/' : hash
      return currentPath.split('?')[0] === expectedRoute.slice(1)
    }, route)
    assert.equal(
      await window.getByText(/(?:Tour sample|Chesapeake Regional|Q58|Team 254|Scout 03|Fictional example)/).count(),
      0,
      'The tour should not display fabricated competition data.',
    )
    await window.getByRole('button', { name: index === tourSteps.length - 1 ? 'Finish' : 'Next' }).click()
  }
  await window.getByText('Diagnostics for advanced operators', { exact: true }).waitFor({ state: 'hidden' })

  await window.evaluate(() => {
    window.electronAPI?.writeLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      context: 'e2e',
      message: 'Production diagnostic bridge check',
      data: { elapsedMs: 18, syncToken: 'SECRET88' },
    })
  })
  const diagnosticLogs = await window.evaluate(() => window.electronAPI?.exportDiagnosticLogs())
  assert.match(diagnosticLogs ?? '', /Production diagnostic bridge check/)
  assert.match(diagnosticLogs ?? '', /\[REDACTED\]/)
  assert.doesNotMatch(diagnosticLogs ?? '', /SECRET88/)

  await window.keyboard.press('ControlOrMeta+Shift+A')
  await window.getByRole('heading', { name: 'Analysis' }).waitFor()
  await window.getByText('Nothing to analyze yet').waitFor()

  await window.keyboard.press('ControlOrMeta+,')
  await window.getByRole('heading', { name: 'Settings' }).waitFor()
  await window.getByRole('button', { name: 'Open Diagnostic Log' }).waitFor()

  await window.keyboard.press('ControlOrMeta+K')
  await window.getByRole('textbox', { name: 'Search commands' }).waitFor()
  await window.keyboard.press('Escape')
  await window.getByRole('textbox', { name: 'Search commands' }).waitFor({ state: 'hidden' })

  const timestamp = '2026-09-29T12:00:00.000Z'
  const entry = (teamNumber, matchNumber, totalScore) => ({
    id: `e2e-${teamNumber}-${matchNumber}`,
    eventId: 'e2e-event',
    deviceId: 'e2e-scout',
    teamNumber,
    matchNumber,
    timestamp,
    autoScore: totalScore,
    teleopScore: 0,
    endgameScore: 0,
    formData: {},
    notes: `E2E team ${teamNumber}`,
    createdAt: timestamp,
  })
  await window.keyboard.press('ControlOrMeta+Shift+Y')
  await window.getByRole('tab', { name: /file/i }).click()
  const entries = [entry(254, 1, 12), entry(111, 2, 25), ...Array.from({ length: 118 }, (_, index) => entry(254, index + 3, 1))]
  await window.locator('input[type="file"]').setInputFiles({
    name: 'e2e-scouting.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ collection: 'scoutingData', data: entries })),
  })
  await window.getByRole('button', { name: 'Add to this laptop' }).click()
  await window.getByRole('tabpanel', { name: 'File' }).getByText('120 added.').waitFor({ timeout: 30_000 })

  await window.keyboard.press('ControlOrMeta+Shift+A')
  await window.getByText('120 observations across 2 teams').waitFor()
  await window.getByText('Raw Data Table').waitFor()
  await window.getByRole('button', { name: 'Total', exact: true }).click()
  const table = window.getByRole('table').last()
  await table.locator('tbody tr').first().locator('td').first().waitFor()
  assert.equal(await table.locator('tbody tr').first().locator('td').first().textContent(), '111')
  assert.ok(await table.locator('tbody tr').count() < entries.length, 'The table should virtualize offscreen rows.')
  assert.equal(await window.locator('[aria-label="Team scores by match"]').count(), 2)
  assert.ok(await window.locator('[aria-label="Team scores by match"] path').count() > 0, 'Team charts should draw data.')

  await window.keyboard.press('ControlOrMeta+Shift+Y')
  await window.getByRole('tab', { name: 'QR codes' }).click()
  await window.getByText('Line up the camera, then keep the screen open', { exact: true }).waitFor()
  assert.equal(await window.getByText(/press Start transfer on the sending laptop/i).count(), 0)
  await window.getByRole('textbox', { name: 'What do you want to send?' }).click()
  await window.getByRole('option', { name: 'My scouting entries' }).click()
  await window.waitForFunction(
    () => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Show QR codes') && !button.disabled),
    undefined,
    { timeout: 30_000 },
  )
  await window.getByRole('button', { name: 'Show QR codes' }).click()
  await window.getByRole('button', { name: 'Start transfer' }).waitFor({ state: 'detached' })
  await window.waitForFunction(
    () => document.querySelector('.qr-send__controls')?.textContent?.includes('starts in'),
    undefined,
    { timeout: 5_000 },
  )
  const qrTitle = window.locator('.qr-send__code title')
  const initialCode = await qrTitle.textContent()
  assert.match(initialCode ?? '', /^QR code 1 of \d+$/)
  await window.waitForTimeout(1_200)
  assert.equal(await qrTitle.textContent(), initialCode, 'The first QR frame should stay still during the setup delay.')
  await window.waitForFunction(
    (previousCode) => document.querySelector('.qr-send__code title')?.textContent !== previousCode,
    initialCode,
    { timeout: 6_000 },
  )
  await window.getByRole('button', { name: 'Pause' }).waitFor()
  await window.getByRole('button', { name: 'Done' }).click()

  await window.getByRole('tab', { name: 'File' }).click()
  const syncedEvent = {
    id: '2026e2er',
    name: 'E2E Transfer Event',
    season: 2026,
    startDate: '2026-03-12',
    endDate: '2026-03-14',
    syncedAt: timestamp,
    createdAt: timestamp,
  }
  await window.locator('input[type="file"]').setInputFiles({
    name: 'e2e-event-snapshot.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ exportedAt: timestamp, version: 2, collections: { events: [syncedEvent] } })),
  })
  const fileTab = window.getByRole('tabpanel', { name: 'File' })
  await fileTab.getByText('File is ready').waitFor()
  await fileTab.getByRole('button', { name: 'Add to this laptop' }).click()
  await fileTab.getByText('1 added.').waitFor()
  await window.getByLabel('Navigate to Events').click()
  await window.getByRole('heading', { name: 'Events on this laptop' }).waitFor()
  await window.getByText('E2E Transfer Event').waitFor()
  await window.getByRole('button', { name: 'Use this event' }).click()
  await window.locator('.current-event-card').getByText('E2E Transfer Event (2026)').waitFor()

  await window.evaluate(() => {
    localStorage.setItem('developer_mode', 'true')
    localStorage.setItem('matchbook-current-event-id', '2026vaale1')
    localStorage.setItem('matchbook-current-season', '2026')
  })
  await window.reload()
  await window.locator('.current-event-card').getByText('2026vaale1 (2026)').waitFor()
  await window.getByLabel('Navigate to Developer Tools').click()
  await window.getByRole('heading', { name: 'Developer Tools' }).waitFor()
  await window.getByRole('button', { name: 'Reset Onboarding' }).click()
  await window.waitForFunction(
    () => document.querySelector('.onboarding-progress')?.getAttribute('aria-label') === 'Step 1 of 3',
    undefined,
    { timeout: 5_000 },
  )
  await wizard.getByRole('button', { name: 'Lead scout' }).click()
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await window.waitForFunction(
    () => document.querySelector('.onboarding-progress')?.getAttribute('aria-label') === 'Step 2 of 3',
    undefined,
    { timeout: 5_000 },
  )
  await wizard.getByRole('button', { name: 'Continue' }).click()
  await window.waitForFunction(
    () => document.querySelector('.onboarding-progress')?.getAttribute('aria-label') === 'Step 3 of 3',
    undefined,
    { timeout: 5_000 },
  )
  await wizard.getByRole('button', { name: 'Finish setup' }).click()
  await wizard.waitFor({ state: 'hidden', timeout: 30_000 })

  await window.getByRole('button', { name: 'Reset Database' }).first().click()
  const resetDialog = window.getByRole('dialog', { name: 'Reset Database' })
  await resetDialog.getByRole('textbox', { name: 'Type RESET to confirm' }).fill('RESET')
  await resetDialog.getByRole('button', { name: 'Reset Database' }).click()
  await window.locator('.current-event-card').getByText('No event selected').waitFor({ timeout: 30_000 })
  assert.equal(
    await window.evaluate(() => localStorage.getItem('matchbook-current-event-id')),
    null,
    'Resetting the database should clear the saved current event.',
  )
  assert.equal(await window.evaluate(() => localStorage.getItem('matchbook-current-season')), null)

  assert.deepEqual(pageErrors, [], `Renderer errors: ${pageErrors.join('; ')}`)
  console.log('Electron E2E passed: setup, onboarding reset, preload, all 13 tour steps, Electron log redaction/export, hotkeys, QR setup delay, synced event visibility, database reset, charts, and table.')
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
