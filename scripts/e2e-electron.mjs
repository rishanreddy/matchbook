/** Exercise the built Electron app with a disposable first-run profile. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'
import { testAiFormFlow } from './e2e-ai-form-flow.mjs'

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
    formData: { ...(teamNumber === 254 ? { cycles: totalScore } : {}), climbed: teamNumber === 254 },
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
  await window.getByText('2 teams with 120 observations. Select up to 4 teams to compare.').waitFor()
  const rankings = window.getByRole('table', { name: 'Team rankings', exact: true })
  assert.equal(await rankings.locator('tbody tr').first().getByRole('button', { name: 'View team 111' }).count(), 1,
    'Teams should start ranked by the average, not by entry volume.')

  await window.getByRole('button', { name: 'Review individual observations' }).click()
  const table = window.getByRole('table', { name: 'Individual scouting observations', exact: true })
  await table.getByRole('button', { name: 'Total', exact: true }).click()
  await table.locator('tbody tr').first().locator('td').first().waitFor()
  assert.equal(await table.locator('tbody tr').first().locator('td').first().textContent(), '111')
  assert.ok(await table.locator('tbody tr').count() < entries.length, 'The table should virtualize offscreen rows.')

  await window.getByRole('checkbox', { name: 'Compare team 111', exact: true }).check()
  await window.getByRole('checkbox', { name: 'Compare team 254', exact: true }).check()
  await window.getByRole('button', { name: 'Compare selected (2)', exact: true }).click()
  const comparison = window.getByRole('dialog', { name: 'Compare selected teams', exact: true })
  await comparison.waitFor()
  const comparisonValues = comparison.getByRole('table', { name: 'Team comparison' }).getByRole('row', { name: 'Average total 25 1.1', exact: true })
  await comparisonValues.waitFor()
  assert.ok(await comparison.getByRole('img', { name: 'Average total for selected teams' }).locator('path').count() > 0,
    'The comparison chart should draw the same recorded values as the table.')
  await window.keyboard.press('Escape')
  await comparison.waitFor({ state: 'hidden' })

  await window.getByRole('button', { name: 'View team 254', exact: true }).click()
  const teamDetail = window.getByRole('dialog', { name: 'Team 254', exact: true })
  await teamDetail.waitFor()
  const matchChart = teamDetail.getByRole('img', { name: 'Average total by recorded match number for team 254', exact: true })
  await matchChart.waitFor()
  assert.ok(await matchChart.locator('path').count() > 0, 'Team trends should draw recorded matches.')
  assert.ok(await teamDetail.getByRole('table', { name: 'Individual scouting observations' }).locator('tbody tr').count() < 119,
    'The team details should virtualize individual observations.')
  await teamDetail.getByRole('tab', { name: 'Scout notes', exact: true }).click()
  await teamDetail.getByText('E2E team 254', { exact: true }).first().waitFor()
  await teamDetail.getByRole('tab', { name: 'Form answers', exact: true }).click()
  await teamDetail.getByRole('button', { name: 'Match 1 e2e-scout', exact: true }).click()
  const answers = teamDetail.getByRole('table', { name: 'Form answers for match 1', exact: true })
  await answers.getByText('Cycles', { exact: true }).waitFor()
  await answers.getByText('12', { exact: true }).waitFor()
  await answers.getByText('Yes', { exact: true }).waitFor()
  await teamDetail.getByRole('button', { name: 'Review or correct these entries' }).click()
  await window.getByText('119 entries shown', { exact: true }).waitFor()
  assert.equal(await window.getByRole('textbox', { name: 'Find a team' }).inputValue(), '254')
  assert.equal(await window.getByRole('textbox', { name: 'Filter observations by event' }).inputValue(), 'e2e-event')
  assert.equal(await window.getByText(/Match \d+ · Team 111/).count(), 0, 'Team review should preserve the event and team scope.')
  await window.getByRole('link', { name: 'Back to Analysis', exact: true }).click()
  await rankings.waitFor()

  const chooseMetric = async (label) => {
    await window.getByRole('textbox', { name: 'Rank teams by', exact: true }).click()
    await window.getByRole('option', { name: label, exact: true }).click()
    await rankings.getByRole('columnheader', { name: label, exact: true }).waitFor()
  }
  await chooseMetric('Cycles')
  assert.equal(await rankings.locator('tbody tr').first().getByRole('button', { name: 'View team 254' }).count(), 1)
  await rankings.getByText('No data', { exact: true }).waitFor()
  await window.getByRole('button', { name: 'Highest first', exact: true }).click()
  assert.equal(await rankings.locator('tbody tr').first().getByRole('button', { name: 'View team 254' }).count(), 1,
    'Missing answers should remain last even when sorting lowest first.')
  await window.getByRole('textbox', { name: 'Summarize answers', exact: true }).click()
  await window.getByRole('option', { name: 'Highest answer', exact: true }).click()
  await rankings.locator('tbody tr').first().getByText('12', { exact: true }).waitFor()
  await window.getByRole('button', { name: 'View team 254', exact: true }).click()
  await teamDetail.waitFor()
  await teamDetail.getByRole('table', { name: 'Individual scouting observations' }).getByRole('columnheader', { name: 'Cycles', exact: true }).waitFor()
  await window.keyboard.press('Escape')
  await teamDetail.waitFor({ state: 'hidden' })

  await chooseMetric('Climbed')
  await rankings.getByText('100%', { exact: true }).waitFor()
  await rankings.getByText('0%', { exact: true }).waitFor()
  await rankings.getByText('119 of 119 answered Yes', { exact: true }).waitFor()
  await window.getByRole('switch', { name: 'Only teams with 3+ matches' }).check()
  await window.getByText('1 of 2 teams shown', { exact: true }).waitFor()
  assert.equal(await rankings.getByRole('button', { name: 'View team 111' }).count(), 0)
  await window.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await window.getByText('2 of 2 teams shown', { exact: true }).waitFor()
  await window.getByRole('textbox', { name: 'Find a team', exact: true }).fill('9999')
  await window.getByText('No teams match these filters', { exact: true }).waitFor()
  await window.getByRole('button', { name: 'Reset filters', exact: true }).first().click()
  await rankings.waitFor()

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

  await window.getByLabel('Navigate to Home', { exact: true }).click()
  await window.getByText('Collected for the current event.', { exact: true }).waitFor({ state: 'hidden' })
  await window.getByText('No observations for this event yet. Receive scout data to begin.', { exact: true }).waitFor()
  await window.getByText('match observations', { exact: true }).locator('..').getByText('0', { exact: true }).waitFor()
  await window.getByText('teams covered', { exact: true }).locator('..').getByText('0', { exact: true }).waitFor()

  await window.keyboard.press('ControlOrMeta+Shift+A')
  await window.getByText('No scouting for this event yet', { exact: true }).waitFor()
  assert.equal(await window.getByRole('textbox', { name: 'Analysis event', exact: true }).inputValue(), 'E2E Transfer Event (2026)',
    'Analysis should follow the current event, including events with no scouting data.')
  await window.getByRole('button', { name: 'Show other events', exact: true }).click()
  await rankings.waitFor()
  await window.getByRole('textbox', { name: 'Analysis event', exact: true }).click()
  await window.getByRole('option', { name: 'E2E Transfer Event (2026)', exact: true }).click()
  await window.getByText('No scouting for this event yet', { exact: true }).waitFor()

  await testAiFormFlow({ application, window, profile })

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

  await window.keyboard.press('ControlOrMeta+Shift+A')
  await window.getByText('Nothing to analyze yet', { exact: true }).waitFor()
  assert.equal(await window.getByRole('textbox', { name: 'Analysis event', exact: true }).inputValue(), 'All events')
  assert.equal(await window.getByRole('button', { name: /Compare selected \(/ }).count(), 0,
    'Resetting the database must not leave a comparison of deleted teams.')

  const analysisLogs = await window.evaluate(() => window.electronAPI?.exportDiagnosticLogs())
  assert.match(analysisLogs ?? '', /Team comparison opened/)
  assert.match(analysisLogs ?? '', /Team analysis opened/)
  assert.match(analysisLogs ?? '', /Analysis metric selected/)

  assert.deepEqual(pageErrors, [], `Renderer errors: ${pageErrors.join('; ')}`)
  assert.equal(consoleMessages.filter((message) => /sortingFn|Could not find column/.test(message)).length, 0,
    'Tables should register their sort functions and sort only existing columns.')
  console.log('Electron E2E passed: setup, onboarding reset, preload, tour, diagnostic logs, hotkeys, QR setup delay, synced events, database reset, analysis rankings, comparisons, filters, form metrics, notes, team review, charts, and virtual tables.')
} finally {
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
