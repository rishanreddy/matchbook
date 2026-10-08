/**
 * Two real Matchbook laptops talking to each other: a lead scout and a scout, each with its own
 * profile, exchanging the event, entries, roster and assignments over Wi-Fi on this machine.
 *
 * It proves the things a lead scout depends on at a competition:
 *  - a scout laptop with no event still gets the lead scout's event when it fetches the setup;
 *  - entries filed under "no event" are never silently hidden: Review Entries says how many it is
 *    hiding, and offers to file them under the event in progress;
 *  - a scout's name reaches the roster, the lead scout can plan, and the scout sees their matches.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'

const EVENT = '2026test'
const SEASON = 2026
const NOW = '2026-03-14T12:00:00.000Z'
const startupTimeout = Number(process.env.MATCHBOOK_E2E_STARTUP_TIMEOUT_MS ?? 30_000)

const laptops = []

async function launchLaptop(label) {
  const profile = await mkdtemp(path.join(tmpdir(), `matchbook-${label}-`))
  const env = { ...process.env, MATCHBOOK_E2E_USER_DATA: profile }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: electronPath, args: ['.'], env, timeout: 30_000 })
  const window = await app.firstWindow()
  const pageErrors = []
  window.on('pageerror', (error) => pageErrors.push(`${label}: ${error.stack ?? error.message}`))
  await window.locator('.app-page-container').waitFor({ timeout: startupTimeout })
  const laptop = { label, app, window, profile, pageErrors }
  laptops.push(laptop)
  if (guideDir) {
    await resize(laptop, [1100, 780])
  }
  return laptop
}

async function finishSetup(window, { role, laptopName, yourName }) {
  const wizard = window.getByRole('dialog')
  if (role === 'hub') {
    await wizard.getByRole('button', { name: 'Lead scout' }).click()
  }
  await wizard.getByRole('textbox', { name: 'Laptop name' }).fill(laptopName)
  if (yourName) {
    await wizard.getByRole('textbox', { name: /^Your name/ }).fill(yourName)
  }
  await wizard.getByRole('button', { name: 'Continue' }).click()
  if (role === 'hub') {
    await wizard.getByRole('button', { name: 'Continue' }).click()
  }
  await wizard.getByRole('button', { name: 'Finish setup' }).click()
  await wizard.waitFor({ state: 'hidden', timeout: 30_000 })
}

function setupFixture() {
  const teams = Array.from({ length: 18 }, (_, index) => `frc${1000 + index + 1}`)
  const matches = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1
    const six = Array.from({ length: 6 }, (_, slot) => teams[(index * 6 + slot) % teams.length])
    return {
      key: `${EVENT}_qm${number}`,
      eventId: EVENT,
      matchNumber: number,
      compLevel: 'qm',
      predictedTime: new Date(Date.parse(NOW) + number * 600_000).toISOString(),
      redAlliance: six.slice(0, 3),
      blueAlliance: six.slice(3),
      createdAt: NOW,
    }
  })

  return {
    exportedAt: NOW,
    version: 2,
    collections: {
      formSchemas: [
        {
          id: 'form_e2e',
          name: 'Match scouting',
          isActive: true,
          createdAt: NOW,
          updatedAt: NOW,
          surveyJson: {
            title: 'Match scouting',
            pages: [{ name: 'p1', title: 'Match', elements: [{ type: 'text', name: 'autoScored', title: 'Scored in auto', inputType: 'number', defaultValue: 0 }, { type: 'comment', name: 'notes', title: 'Notes' }] }],
          },
        },
      ],
      events: [{ id: EVENT, name: 'E2E Regional', season: SEASON, startDate: '2026-03-12', endDate: '2026-03-14', syncedAt: NOW, createdAt: NOW }],
      matches,
    },
  }
}

function entriesFixture(deviceId, eventId, firstMatch, count) {
  return {
    collection: 'scoutingData',
    data: Array.from({ length: count }, (_, index) => ({
      id: `e2e-${deviceId}-${firstMatch + index}`,
      eventId,
      deviceId,
      matchNumber: firstMatch + index,
      teamNumber: 1001 + ((firstMatch + index - 1) * 6) % 18,
      timestamp: NOW,
      autoScore: 3,
      teleopScore: 0,
      endgameScore: 0,
      formData: { autoScored: 3 },
      notes: '',
      createdAt: NOW,
    })),
  }
}

async function importFile(window, name, content) {
  await window.evaluate(() => {
    window.location.hash = '#/sync?tab=file'
  })
  await window.getByRole('tab', { name: /file/i }).click()
  await window.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) })
  await window.getByRole('button', { name: 'Add to this laptop' }).click()
  await window.getByRole('tabpanel', { name: 'File' }).getByText(/\d+ added/).first().waitFor({ timeout: 30_000 })
}

const storage = (window, key) => window.evaluate((name) => localStorage.getItem(name), key)

// Set MATCHBOOK_GUIDE_DIR to also save the pictures the how-to guide uses (the whole run is then at the guide's window size).
const guideDir = process.env.MATCHBOOK_GUIDE_DIR

// Set MATCHBOOK_SHOTS_DIR to also save pictures of the screens a person would look at, at real window sizes.
const shotsDir = process.env.MATCHBOOK_SHOTS_DIR

async function settle(window) {
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await window.waitForTimeout(250)
}

/** Resizes the real window, not an emulated viewport, the way a person dragging its edge would. */
async function resize(laptop, [width, height]) {
  await laptop.app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win.isMaximized()) win.unmaximize()
    win.setContentSize(size[0], size[1])
  }, [width, height])
  await settle(laptop.window)
}

async function shoot(laptop, name) {
  if (shotsDir) {
    await hideToasts(laptop.window)
    await settle(laptop.window)
    await laptop.window.screenshot({ path: path.join(shotsDir, `${laptop.label}-${name}.png`) })
  }
}

async function scrollMainTo(window, fraction) {
  await window.evaluate((amount) => {
    const main = document.querySelector('.mantine-AppShell-main')
    if (main) main.scrollTop = (main.scrollHeight - main.clientHeight) * amount
  }, fraction)
  await settle(window)
}

// Pictures are about the screen, so toasts that are still fading out are taken off it.
const hideToasts = (window) => window.addStyleTag({ content: '.mantine-Notifications-root { display: none !important }' })

/** Numbered rings around the things a step tells the reader to use, like the guide's other pictures. */
async function guideShot(laptop, name, targets = []) {
  if (!guideDir) {
    return
  }

  await hideToasts(laptop.window)
  await settle(laptop.window)
  const boxes = []
  for (const { locator, number } of targets) {
    const box = await locator.boundingBox()
    if (box) {
      boxes.push({ box, number })
    }
  }

  await laptop.window.evaluate((items) => {
    for (const { box, number } of items) {
      const ring = document.createElement('div')
      ring.setAttribute('data-guide-callout', '')
      ring.style.cssText = `position:fixed;left:${box.x - 4}px;top:${box.y - 4}px;width:${box.width + 8}px;height:${box.height + 8}px;border:3px solid #fff;border-radius:12px;box-shadow:0 0 0 6px rgba(0,0,0,.45);pointer-events:none;z-index:2147483000`
      const badge = document.createElement('div')
      badge.setAttribute('data-guide-callout', '')
      badge.textContent = String(number)
      badge.style.cssText = `position:fixed;left:${box.x - 20}px;top:${box.y - 12}px;width:26px;height:26px;border-radius:50%;background:#f5b342;color:#1a1305;font:700 15px/26px system-ui,sans-serif;text-align:center;pointer-events:none;z-index:2147483001;box-shadow:0 0 0 3px #1a1305`
      document.body.append(ring, badge)
    }
  }, boxes)
  await laptop.window.screenshot({ path: path.join(guideDir, `${name}.png`) })
  await laptop.window.evaluate(() => document.querySelectorAll('[data-guide-callout]').forEach((element) => element.remove()))
}

async function scrollToSelector(window, selector) {
  await window.evaluate((target) => {
    document.querySelector(target)?.scrollIntoView({ block: 'center' })
  }, selector)
  await settle(window)
}

async function eventually(check, message, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out: ${message}`)
}

// Escape clears every toast, which is how a person gets one out of the way; the test does the same.
const dismissToasts = (window) => window.keyboard.press('Escape')

async function step(name, action) {
  const startedAt = Date.now()
  try {
    await action()
    console.log(`  ok  ${name} (${Date.now() - startedAt} ms)`)
  } catch (error) {
    console.error(`FAILED  ${name}`)
    for (const laptop of laptops) {
      // Kept outside the throwaway profile, which is deleted when the run ends.
      const shot = path.join(tmpdir(), `matchbook-assignments-failure-${laptop.label}.png`)
      await laptop.window.screenshot({ path: shot }).catch(() => undefined)
      console.error(`  ${laptop.label} screenshot: ${shot}`)
    }
    throw error
  }
}

let outcome = 0
try {
  const hub = await launchLaptop('hub')
  const scout = await launchLaptop('scout')

  await step('both laptops finish first-run setup', async () => {
    await finishSetup(hub.window, { role: 'hub', laptopName: 'Lead Laptop' })
    await finishSetup(scout.window, { role: 'scout', laptopName: 'Scout Laptop 1', yourName: 'Riley' })
  })

  await step('the lead scout adds the event and picks it', async () => {
    await importFile(hub.window, 'setup.json', setupFixture())
    assert.equal(await storage(hub.window, 'matchbook-current-event-id'), null, 'A file never chooses the event for the lead scout.')
    await hub.window.evaluate(() => {
      window.location.hash = '#/events'
    })
    await hub.window.getByRole('heading', { name: 'Events on this laptop' }).waitFor()
    await hub.window.getByRole('button', { name: 'Use this event' }).click()
    await eventually(async () => (await storage(hub.window, 'matchbook-current-event-id')) === EVENT, 'The lead scout laptop should be on the event it picked.')
  })

  let address
  await step('the lead scout starts receiving over Wi-Fi', async () => {
    await hub.window.evaluate(() => {
      window.location.hash = '#/sync?tab=wifi'
    })
    await hub.window.getByRole('button', { name: 'Start receiving' }).click()
    const label = await hub.window.locator('.wifi-code').getAttribute('aria-label', { timeout: 30_000 })
    const code = (label ?? '').replace(/^Code\s+/, '').replace(/\s+/g, '')
    assert.match(code, /^[A-Z0-9]{8}$/)
    address = { url: '127.0.0.1:41735', code }
  })

  const scoutDeviceId = await storage(scout.window, 'matchbook-device-id')
  assert.ok(scoutDeviceId, 'The scout laptop should have a device id.')

  await step('a scout laptop with no event gets the lead scout’s event with the setup', async () => {
    await scout.window.evaluate(() => {
      window.location.hash = '#/sync?tab=wifi'
    })
    assert.equal(await storage(scout.window, 'matchbook-current-event-id'), null, 'The scout laptop starts with no event.')
    await scout.window.getByRole('button', { name: 'Type the address by hand' }).click()
    await scout.window.getByRole('textbox', { name: /address/i }).fill(address.url)
    await scout.window.getByRole('textbox', { name: /Code from the lead scout/ }).fill(address.code)
    await scout.window.getByRole('button', { name: 'Get form, schedule and matches' }).click()
    await scout.window.getByText(/Got .* from the lead scout/).waitFor({ timeout: 30_000 })
    assert.equal(await storage(scout.window, 'matchbook-current-event-id'), EVENT, 'The scout laptop should start on the lead scout’s event.')
  })

  await step('entries saved with no event reach the lead scout and are not silently hidden', async () => {
    // Put the scout laptop back into the state that used to lose entries: no event selected.
    await scout.window.evaluate(() => {
      localStorage.removeItem('matchbook-current-event-id')
      localStorage.removeItem('matchbook-current-season')
    })
    await scout.window.reload()
    await scout.window.locator('.app-page-container').waitFor({ timeout: startupTimeout })
    await importFile(scout.window, 'entries.json', entriesFixture(scoutDeviceId, 'none', 1, 3))

    await scout.window.evaluate(() => {
      window.location.hash = '#/sync?tab=wifi'
    })
    const hubChoice = scout.window.locator('.hub-choice').first()
    if (guideDir) {
      await hubChoice.waitFor({ timeout: 15_000 }).catch(() => undefined)
    }
    if (guideDir && (await hubChoice.count()) > 0) {
      await hubChoice.click()
      await guideShot(scout, 'wifi-scout', [
        { locator: hubChoice, number: 1 },
        { locator: scout.window.getByRole('textbox', { name: /Code from the lead scout/ }), number: 2 },
        { locator: scout.window.getByRole('button', { name: /^Send my 3 entries$/ }), number: 3 },
      ])
    }
    await scout.window.getByRole('button', { name: /^Send my 3 entries$/ }).click()
    await scout.window.getByText(/Sent 3 entries to the lead scout/).waitFor({ timeout: 30_000 })
    await scout.window.getByText(/Your name is on their roster/).waitFor()

    await hub.window.getByText('Some entries are for a different event').waitFor({ timeout: 30_000 })
    await hub.window.getByText(/filed under no event/).first().waitFor()

    await hub.window.evaluate(() => {
      window.location.hash = '#/entries'
    })
    // The lead scout is on E2E Regional, which has no entries, so the page starts on everything instead of looking empty.
    await hub.window.getByText('3 entries shown', { exact: true }).waitFor({ timeout: 30_000 })
    await hub.window.getByText(/3 entries were saved with no event/).waitFor()
    await hub.window.getByText(/Riley/).first().waitFor()
    await shoot(hub, 'entries-no-event')
  })

  await step('the lead scout files those entries under the event in progress', async () => {
    await hub.window.getByRole('button', { name: /File under E2E Regional/ }).click()
    await hub.window.getByRole('dialog').getByRole('button', { name: 'File them' }).click()
    await hub.window.getByText('Entries filed').waitFor()
    await hub.window.getByText(/entries were saved with no event/).waitFor({ state: 'detached', timeout: 10_000 })

    await hub.window.getByRole('textbox', { name: 'Filter observations by event' }).click()
    await hub.window.getByRole('option', { name: 'E2E Regional', exact: true }).click()
    await hub.window.getByText('3 entries shown', { exact: true }).waitFor()
  })

  await step('Review Entries tells the lead scout when the filter is hiding entries', async () => {
    await importFile(hub.window, 'elsewhere.json', { ...entriesFixture('device_other', '2025oth', 20, 2) })
    await hub.window.evaluate(() => {
      window.location.hash = '#/entries'
    })
    // The page starts on the event the lead scout is on, which now has entries.
    await hub.window.getByText('3 of 5 entries shown').waitFor({ timeout: 30_000 })
    await hub.window.getByText(/2 more entries are filed under another event/).waitFor()
    await hub.window.getByText(/2025oth \(2\)/).waitFor()
    await shoot(hub, 'entries-hidden')
    await hub.window.getByRole('button', { name: 'Show all events' }).click()
    await hub.window.getByText('5 entries shown', { exact: true }).waitFor()
  })

  await step('the scout appears on the roster and the lead scout adds more by hand', async () => {
    await hub.window.evaluate(() => {
      window.location.hash = '#/settings'
    })
    await hub.window.getByRole('switch', { name: /^Enable Scout Assignments beta/ }).check()
    await hub.window.evaluate(() => {
      window.location.hash = '#/assignments'
    })
    const roster = hub.window.locator('[data-tour="assignments-roster"]')
    await roster.getByText('Riley', { exact: true }).waitFor({ timeout: 30_000 })
    await roster.getByText('Scout Laptop 1').waitFor()

    for (const name of ['Alex', 'Sam', 'Jo', 'Kim', 'Lee']) {
      await roster.getByRole('textbox', { name: 'Scout name' }).fill(name)
      await roster.getByRole('textbox', { name: 'Scout name' }).press('Enter')
      await roster.getByText(name, { exact: true }).waitFor()
    }
    await roster.getByText('6 available').waitFor()
  })

  await step('Fill open stations gives every match six scouts, fairly', async () => {
    const plan = hub.window.locator('[data-tour="assignments-plan"]')
    if (guideDir) {
      await resize(hub, [1100, 1040])
      await scrollToSelector(hub.window, '[data-tour="assignments-roster"]')
      await guideShot(hub, 'assignments', [
        { locator: hub.window.locator('[data-tour="assignments-roster"]').getByRole('textbox', { name: 'Scout name' }), number: 1 },
        { locator: plan.getByRole('button', { name: 'Fill open stations' }), number: 2 },
      ])
      await resize(hub, [1100, 780])
    }
    await plan.getByRole('button', { name: 'Fill open stations' }).click()
    const dialog = hub.window.getByRole('dialog', { name: 'Fill the open stations?' })
    // Three stations already have their entries, so only the other 69 need a scout.
    await dialog.getByText(/69 open stations get a scout/).waitFor()
    await dialog.getByRole('button', { name: 'Assign' }).click()
    await plan.getByText(/72 of 72 stations covered/).waitFor({ timeout: 30_000 })
    await plan.getByText('(69 assigned, 3 already scouted)').waitFor()
    await plan.getByText('Everything is covered').waitFor()
    // Six scouts and six stations a match: everyone watches nearly every match.
    await hub.window.locator('[data-tour="assignments-roster"]').getByText('12 matches').first().waitFor()
  })

  await step('a scout who goes away leaves their stations open when nobody else is free', async () => {
    await dismissToasts(hub.window)
    const roster = hub.window.locator('[data-tour="assignments-roster"]')
    await roster.getByRole('switch', { name: 'Sam is available' }).click()
    await roster.getByText('Away', { exact: true }).waitFor()

    const plan = hub.window.locator('[data-tour="assignments-plan"]')
    await plan.getByRole('button', { name: 'Fill open stations' }).click()
    const dialog = hub.window.getByRole('dialog', { name: 'Fill the open stations?' })
    // In the three matches that already have an entry, a scout is spare and takes Sam's place. In every
    // other match the other five scouts are already watching a robot, so Sam's station stays open.
    await dialog.getByText(/2 stations move to someone else/).waitFor()
    await dialog.getByText(/9 stations stay open/).waitFor()
    await dialog.getByRole('button', { name: 'Assign' }).click()
    await plan.getByText(/63 of 72 stations covered/).waitFor({ timeout: 30_000 })
    await plan.getByText('9 stations are open').waitFor()
  })

  await step('adding a scout covers the gaps again', async () => {
    await dismissToasts(hub.window)
    const roster = hub.window.locator('[data-tour="assignments-roster"]')
    await roster.getByRole('textbox', { name: 'Scout name' }).fill('Pat')
    await roster.getByRole('textbox', { name: 'Scout name' }).press('Enter')
    const plan = hub.window.locator('[data-tour="assignments-plan"]')
    await plan.getByRole('button', { name: 'Fill open stations' }).click()
    await hub.window.getByRole('dialog', { name: 'Fill the open stations?' }).getByRole('button', { name: 'Assign' }).click()
    await plan.getByText(/72 of 72 stations covered/).waitFor({ timeout: 30_000 })
  })

  await step('the lead scout can change one station by hand', async () => {
    await dismissToasts(hub.window)
    // Match 4 has no entries yet, so every station has a scout (matches 1 to 3 already have one).
    const first = hub.window.getByRole('combobox', { name: /Scout for match 4, Red 1/ })
    const before = await first.inputValue()
    const options = await first.locator('option').allTextContents()
    const other = options.find((label) => label !== 'Open' && !label.includes('(away)') && label !== before)
    assert.ok(other, 'There should be another scout to pick.')
    await first.selectOption({ label: other })
    await hub.window.waitForTimeout(400)
    assert.notEqual(await first.inputValue(), before)
  })

  await step('the scout picks their event, then sees their own matches after pressing Get latest', async () => {
    await scout.window.evaluate(() => {
      window.location.hash = '#/scout'
    })
    // An earlier step put this laptop back on no event, so the form asks for one before anything else.
    const notice = scout.window.getByRole('region', { name: 'Pick an event' })
    await notice.getByRole('textbox', { name: 'Event', exact: true }).click()
    await scout.window.getByRole('option', { name: /E2E Regional/ }).click()
    await notice.getByRole('button', { name: 'Use this event' }).click()
    await notice.waitFor({ state: 'detached', timeout: 10_000 })
    assert.equal(await storage(scout.window, 'matchbook-current-event-id'), EVENT)

    const card = scout.window.locator('[data-tour="my-assignments"]')
    await card.waitFor({ timeout: 30_000 })
    await card.getByText('None assigned yet').waitFor()
    await card.getByRole('button', { name: 'Get latest' }).click()
    await card.getByText(/\d+ to go/).waitFor({ timeout: 30_000 })
    await card.getByText('Up next').waitFor()
  })

  await step('Scout this match opens the form on the assigned match and team', async () => {
    const card = scout.window.locator('[data-tour="my-assignments"]')
    await card.getByRole('button', { name: 'Scout this match' }).first().click()
    await scout.window.getByRole('heading', { name: /^Match \d+ · Team \d+$/ }).waitFor({ timeout: 30_000 })
  })

  await step('a scout the lead scout added by name picks their name on their own laptop', async () => {
    // This laptop never typed a name, so the only way to be matched to a scout is to pick one.
    const second = await launchLaptop('scout2')
    await finishSetup(second.window, { role: 'scout', laptopName: 'Scout Laptop 2' })
    await second.window.evaluate(() => {
      window.location.hash = '#/sync?tab=wifi'
    })
    await second.window.getByRole('button', { name: 'Type the address by hand' }).click()
    await second.window.getByRole('textbox', { name: /address/i }).fill(address.url)
    await second.window.getByRole('textbox', { name: /Code from the lead scout/ }).fill(address.code)
    await second.window.getByRole('button', { name: 'Get form, schedule and matches' }).click()
    await second.window.getByText(/Got .* from the lead scout/).waitFor({ timeout: 30_000 })
    assert.equal(await storage(second.window, 'matchbook-current-event-id'), EVENT, 'The second scout laptop should start on the lead scout’s event.')

    await second.window.evaluate(() => {
      window.location.hash = '#/scout'
    })
    const card = second.window.locator('[data-tour="my-assignments"]')
    await card.getByText('Which scout are you?').waitFor({ timeout: 30_000 })
    await shoot(second, 'scout-picker')
    await card.getByRole('button', { name: 'Kim', exact: true }).click()
    await card.getByText(/\d+ to go/).waitFor({ timeout: 30_000 })
    await card.getByText('Up next').waitFor()
    await shoot(second, 'scout-matches')
    await guideShot(second, 'my-matches', [
      { locator: card.getByRole('button', { name: 'Get latest' }), number: 1 },
      { locator: card.getByRole('button', { name: 'Scout this match' }).first(), number: 2 },
    ])

    // The lead scout now sees Kim on that laptop: the same scout, listed once, with the matches already given to them.
    // The laptop's own default entry is retired, so it does not stay on the roster as a second scout.
    const roster = hub.window.locator('[data-tour="assignments-roster"]')
    await roster.locator('li', { hasText: 'Kim' }).getByText('Scout Laptop 2').waitFor({ timeout: 30_000 })
    await eventually(async () => (await roster.getByText('Scout Laptop 2', { exact: true }).count()) === 1, 'Scout Laptop 2 should only be shown as Kim’s laptop.')
    assert.equal(await roster.getByText('Kim', { exact: true }).count(), 1, 'Kim should be on the roster once.')
    assert.equal(await roster.getByText('Added by hand').count(), 5, 'Only the scouts nobody has claimed stay marked as added by hand.')
  })

  if (shotsDir) {
    await step('pictures of the screens at real window sizes', async () => {
      await dismissToasts(hub.window)
      for (const size of [[1366, 768], [900, 560]]) {
        const label = `${size[0]}x${size[1]}`
        const second = laptops.find((laptop) => laptop.label === 'scout2')
        await resize(hub, size)
        await resize(second, size)
        for (const [name, route] of [['assignments', '#/assignments'], ['entries', '#/entries?event=all'], ['sync', '#/sync?tab=wifi']]) {
          await hub.window.evaluate((hash) => {
            window.location.hash = hash
          }, route)
          await settle(hub.window)
          await scrollMainTo(hub.window, 0)
          await shoot(hub, `${name}-${label}-top`)
          if (name === 'assignments') {
            await scrollToSelector(hub.window, '[data-tour="assignments-plan"]')
            await shoot(hub, `${name}-${label}-plan`)
          }
          await scrollMainTo(hub.window, 0.5)
          await shoot(hub, `${name}-${label}-middle`)
          await scrollMainTo(hub.window, 1)
          await shoot(hub, `${name}-${label}-bottom`)
        }
        await second.window.evaluate(() => {
          window.location.hash = '#/scout'
        })
        await settle(second.window)
        await scrollMainTo(second.window, 0)
        await shoot(second, `scout-${label}-top`)
        await scrollMainTo(second.window, 1)
        await shoot(second, `scout-${label}-bottom`)
      }
    })
  }

  for (const laptop of laptops) {
    assert.deepEqual(laptop.pageErrors, [], `${laptop.label} raised page errors`)
  }
  console.log('Two-laptop E2E passed: event adoption, hidden-entry warnings, roster, planning, away scouts, hand edits, the scout’s own matches and picking a name.')
} catch (error) {
  outcome = 1
  console.error(error)
} finally {
  for (const laptop of laptops) {
    await laptop.app.close().catch(() => undefined)
    await rm(laptop.profile, { recursive: true, force: true }).catch(() => undefined)
  }
}

process.exit(outcome)
