/** Run the AI form through the production renderer, native SurveyJS and saved observations. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Version } from 'survey-core'

const FORM = {
  title: 'Alliance scouting test',
  clearInvisibleValues: 'onHidden',
  calculatedValues: [
    { name: 'piecesTotal', expression: 'sum({autoPieces}, {teleopPieces})', includeIntoResult: true },
    { name: 'contextMatch', expression: '{_matchNumber}', includeIntoResult: true },
  ],
  pages: [
    {
      name: 'actions', title: 'Match actions',
      elements: [
        { type: 'html', name: 'instructions', html: '<p><strong>Record observed actions.</strong> Match {_matchNumber}.</p>' },
        { type: 'boolean', name: 'attemptedClimb', title: 'Attempted a climb?', defaultValue: false },
        { type: 'text', name: 'autoPieces', title: 'Auto pieces', inputType: 'number', min: 0, max: 10, defaultValue: 0 },
        { type: 'text', name: 'teleopPieces', title: 'Teleop pieces', inputType: 'number', min: 0, max: 20, defaultValue: 0 },
      ],
    },
    {
      name: 'finish', title: 'Endgame and notes',
      elements: [
        { type: 'boolean', name: 'endgameClimbed', title: 'Climb succeeded?', visibleIf: '{attemptedClimb} = true', requiredIf: '{attemptedClimb} = true' },
        { type: 'text', name: 'attemptSeconds', title: 'Climb duration (seconds)', inputType: 'number', visibleIf: '{attemptedClimb} = true', validators: [{ type: 'expression', expression: '{attemptSeconds} >= 0 and {attemptSeconds} <= 30', text: 'Enter a duration between 0 and 30 seconds.' }] },
        { type: 'expression', name: 'weightedScoring', title: 'Weighted game pieces', expression: 'sum({autoPieces}, {teleopPieces}) * 2' },
        { type: 'comment', name: 'notes', title: 'Scout notes' },
        { type: 'html', name: 'echo', html: '<p>Scout note: {notes}</p>' },
      ],
    },
  ],
}

export async function testAiFormFlow({ application, window, profile }) {
  let exportNumber = 0
  const exportSnapshot = async () => {
    await window.keyboard.press('ControlOrMeta+Shift+Y')
    await window.getByRole('tab', { name: 'File', exact: true }).click()
    const output = path.join(profile, 'ai-export-' + (++exportNumber) + '.json')
    const complete = application.evaluate(({ session }, destination) => new Promise((resolve, reject) => {
      const onDownload = (_, item) => {
        clearTimeout(timer)
        item.setSavePath(destination)
        item.once('done', (_, state) => resolve(state))
      }
      const timer = setTimeout(() => {
        session.defaultSession.removeListener('will-download', onDownload)
        reject(new Error('The app did not start its data export.'))
      }, 15_000)
      session.defaultSession.once('will-download', onDownload)
    }), output)
    // Register the native handler before the browser action can start a download.
    complete.catch(() => {})
    await window.getByRole('button', { name: 'Save file', exact: true }).click()
    assert.equal(await complete, 'completed')
    return JSON.parse(await readFile(output, 'utf8'))
  }

  const openDialog = async () => {
    await window.getByLabel('Navigate to Form Builder', { exact: true }).click()
    await window.locator('.svc-creator').waitFor({ timeout: 30_000 })
    await window.getByRole('button', { name: 'Build with AI', exact: true }).first().click()
    const dialog = window.getByRole('dialog', { name: 'Build the form with AI', exact: true })
    await dialog.waitFor()
    return dialog
  }
  const goToPaste = async (dialog) => {
    await dialog.getByRole('button', { name: 'Next: chat with the AI', exact: true }).click()
    await dialog.getByRole('button', { name: 'Next: paste the form', exact: true }).click()
  }
  const pasteForm = async (dialog) => {
    const fence = String.fromCharCode(96).repeat(3)
    await dialog.getByRole('textbox', { name: 'The AI’s reply', exact: true }).fill('Here is the completed form.\n' + fence + 'json\n' + JSON.stringify(FORM) + '\n' + fence)
    await dialog.getByText('Ready to use', { exact: true }).waitFor()
  }
  const fillActions = async (survey, auto, teleop) => {
    await survey.getByRole('switch', { name: 'Attempted a climb?', exact: true }).locator('..').getByText('Yes', { exact: true }).click()
    await survey.getByRole('spinbutton', { name: 'Auto pieces', exact: true }).fill(String(auto))
    await survey.getByRole('spinbutton', { name: 'Teleop pieces', exact: true }).fill(String(teleop))
    await survey.getByRole('button', { name: 'Next', exact: true }).click()
  }

  try {
    const before = await exportSnapshot()
    const dialog = await openDialog()
    await dialog.getByRole('button', { name: 'Copy the prompt', exact: true }).click()
    await dialog.getByRole('button', { name: 'Copied', exact: true }).waitFor()
    const prompt = await application.evaluate(({ clipboard }) => clipboard.readText())
    assert.match(prompt, /HOW WE WILL WORK/)
    assert.ok(prompt.includes('https://unpkg.com/survey-core@' + Version + '/surveyjs_definition.json'))
    assert.match(prompt, /includeIntoResult/)
    assert.match(prompt, /double-counting/)
    assert.match(prompt, /valueName/)
    await goToPaste(dialog)

    const reply = dialog.getByRole('textbox', { name: 'The AI’s reply', exact: true })
    await reply.fill(JSON.stringify({ elements: [{ type: 'text', name: 'pieces', madeUpLogic: true }] }))
    await dialog.getByText('Needs fixes', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Use this form', exact: true }).isDisabled(), true)
    await reply.fill(JSON.stringify({ elements: [{ type: 'html', name: 'unsafe', html: '<img src=x onerror=alert(1)>' }] }))
    await dialog.getByText(/contains unsafe or external HTML/).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Use this form', exact: true }).isDisabled(), true)

    await pasteForm(dialog)
    await dialog.getByRole('button', { name: 'Preview what scouts will see', exact: true }).click()
    const preview = dialog.locator('.ai-form-preview')
    await dialog.getByLabel('Preview match number', { exact: true }).fill('12')
    await dialog.getByLabel('Preview team number', { exact: true }).fill('111')
    await preview.getByText('Match 12.', { exact: false }).waitFor()
    await preview.getByRole('spinbutton', { name: 'Auto pieces', exact: true }).fill('-1')
    await preview.getByRole('button', { name: 'Next', exact: true }).click()
    assert.equal(await preview.getByRole('spinbutton', { name: 'Auto pieces', exact: true }).getAttribute('aria-invalid'), 'true')
    await fillActions(preview, 4, 6)
    await preview.getByRole('switch', { name: /Climb succeeded/ }).locator('..').getByText('Yes', { exact: true }).click()
    await preview.getByRole('spinbutton', { name: 'Climb duration (seconds)', exact: true }).fill('40')
    await preview.getByText('Enter a duration between 0 and 30 seconds.', { exact: true }).waitFor()
    await preview.getByRole('spinbutton', { name: 'Climb duration (seconds)', exact: true }).fill('12')
    await preview.getByRole('textbox', { name: 'Scout notes', exact: true }).fill('<img src=x onerror="window.__aiFormInjection=1"><strong>Keep this note</strong>')
    await preview.locator('[data-name="echo"] strong').getByText('Keep this note', { exact: true }).waitFor()
    assert.equal(await preview.locator('[data-name="echo"] img, [data-name="echo"] script').count(), 0)
    assert.equal(await window.evaluate(() => window.__aiFormInjection), undefined)
    await window.screenshot({ path: path.join(tmpdir(), 'matchbook-ai-preview.png') })
    await preview.getByRole('button', { name: 'Complete', exact: true }).click()
    await preview.getByText('Preview complete. These answers were not saved.', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Reset preview', exact: true }).click()
    assert.equal(await preview.getByRole('spinbutton', { name: 'Auto pieces', exact: true }).inputValue(), '0')
    await preview.getByText('Match 12.', { exact: false }).waitFor()

    await dialog.getByRole('button', { name: 'Use this form', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const staged = await exportSnapshot()
    assert.deepEqual(staged.collections.formSchemas, before.collections.formSchemas, 'Preview and Use this form must not overwrite the saved form.')
    assert.deepEqual(staged.collections.scoutingData, before.collections.scoutingData, 'Preview answers must not become real scouting entries.')

    const saveDialog = await openDialog()
    await goToPaste(saveDialog)
    await pasteForm(saveDialog)
    await saveDialog.getByRole('button', { name: 'Use this form', exact: true }).click()
    await saveDialog.waitFor({ state: 'hidden' })
    await window.getByRole('button', { name: 'Save Form', exact: true }).click()
    await window.getByText('Form saved', { exact: true }).waitFor()

    await window.getByRole('tab', { name: 'Preview', exact: true }).click()
    await window.getByText('Match 1.', { exact: false }).waitFor()
    await window.getByRole('tab', { name: 'Designer', exact: true }).click()

    await window.getByLabel('Navigate to Scout Match', { exact: true }).click()
    await window.getByRole('button', { name: /Manual Entry/ }).click()
    await window.getByLabel('Match Number', { exact: true }).fill('12')
    await window.getByLabel('Team Number', { exact: true }).fill('254')
    await window.getByRole('button', { name: 'Start Scouting', exact: true }).click()
    await window.getByRole('heading', { name: 'Match 12 · Team 254', exact: true }).waitFor()
    const survey = window.locator('.scout-form-page')
    await fillActions(survey, 3, 7)
    await survey.getByRole('switch', { name: /Climb succeeded/ }).locator('..').getByText('Yes', { exact: true }).click()
    await survey.getByRole('spinbutton', { name: 'Climb duration (seconds)', exact: true }).fill('12')
    await survey.getByRole('textbox', { name: 'Scout notes', exact: true }).fill('Reliable output; clean climb.')
    await survey.getByRole('button', { name: 'Complete', exact: true }).click()
    await window.getByText('Saved!', { exact: true }).waitFor()

    const saved = await exportSnapshot()
    const activeForm = saved.collections.formSchemas.find((form) => form.isActive)
    assert.equal(activeForm.surveyJson.title, FORM.title)
    assert.deepEqual(activeForm.surveyJson.calculatedValues, FORM.calculatedValues)
    const entries = saved.collections.scoutingData.filter((entry) => entry.eventId === '2026e2er' && entry.teamNumber === 254 && entry.matchNumber === 12)
    assert.equal(entries.length, 1)
    assert.deepEqual([entries[0].autoScore, entries[0].teleopScore, entries[0].endgameScore], [3, 7, 1])
    assert.equal(entries[0].formData.piecesTotal, 10)
    assert.equal(entries[0].formData.weightedScoring, 20)
    assert.equal(Number(entries[0].formData.contextMatch), 12)
    assert.equal(entries[0].formData._teamNumber, '254')
    assert.equal(entries[0].notes, 'Reliable output; clean climb.')

    await window.keyboard.press('ControlOrMeta+Shift+A')
    const rankings = window.getByRole('table', { name: 'Team rankings', exact: true })
    await rankings.waitFor()
    await window.getByRole('textbox', { name: 'Rank teams by', exact: true }).click()
    await window.getByRole('option', { name: 'Weighted game pieces', exact: true }).click()
    await rankings.getByRole('columnheader', { name: 'Weighted game pieces', exact: true }).waitFor()
    await rankings.getByText('20', { exact: true }).waitFor()
    await window.getByRole('textbox', { name: 'Rank teams by', exact: true }).click()
    await window.getByRole('option', { name: 'Pieces Total', exact: true }).click()
    await rankings.getByRole('columnheader', { name: 'Pieces Total', exact: true }).waitFor()
    await rankings.getByText('10', { exact: true }).waitFor()

    const logs = await window.evaluate(() => window.electronAPI?.exportDiagnosticLogs())
    assert.match(logs ?? '', /Checked AI form applied to builder/)
    assert.match(logs ?? '', /AI form preview completed without saving answers/)
    assert.doesNotMatch(logs ?? '', /__aiFormInjection|Reliable output; clean climb/)
    console.log('AI form E2E passed: clipboard prompt, invalid settings, safe HTML substitution, interactive logic and validation, preview reset, explicit save, scouting, saved calculations, phase totals and Analysis.')
  } catch (error) {
    await window.screenshot({ path: path.join(tmpdir(), 'matchbook-ai-form-failure.png') }).catch(() => {})
    console.error('AI form failure state:', (await window.locator('body').innerText()).slice(-5_000))
    throw error
  }
}
