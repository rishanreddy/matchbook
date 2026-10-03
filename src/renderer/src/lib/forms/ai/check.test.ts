import { describe, expect, it } from 'vitest'
import { DEFAULT_SCOUTING_FORM } from '../defaultScoutingForm'
import { buildFixRequest, checkAiForm, suggestQuestionName } from './check'
import { createScoutSurvey, setScoutContext } from '../scoutSurvey'
import { calculatePhaseScores } from '../../utils/scoring'

type Question = Record<string, unknown>

function formWith(...questions: Question[]): Record<string, unknown> {
  return { title: 'T', pages: [{ name: 'p', elements: questions }] }
}

const count = { type: 'text', name: 'autoScored', title: 'Scored in auto', inputType: 'number', min: 0, defaultValue: 0 }
const notes = { type: 'comment', name: 'notes', title: 'Notes' }

function errorsOf(input: unknown): string[] {
  return checkAiForm(input).errors.map((issue) => issue.message)
}

function warningsOf(input: unknown): string[] {
  return checkAiForm(input).warnings.map((issue) => issue.message)
}

describe('checkAiForm: forms that work', () => {
  it('accepts the starter form Matchbook ships', () => {
    const result = checkAiForm(DEFAULT_SCOUTING_FORM)
    expect(result.errors).toEqual([])
    expect(result.form).not.toBeNull()
    expect(result.stats.pages).toBe(4)
  })

  it('counts which questions raise each phase score', () => {
    const { stats } = checkAiForm(
      formWith(
        count,
        { type: 'boolean', name: 'teleopDefended', title: 'Defended' },
        { type: 'boolean', name: 'climbHung', title: 'Hung' },
        { type: 'boolean', name: 'brokeDown', title: 'Broke down' },
        notes,
      ),
    )
    expect(stats.scored).toEqual({ auto: 1, teleop: 1, endgame: 1 })
    expect(stats.unscored).toBe(2)
    expect(stats.questions).toBe(5)
  })

  it('treats numeric choices as scorable and word choices as not', () => {
    const numeric = checkAiForm(formWith({ type: 'radiogroup', name: 'teleopLevel', title: 'Level', choices: [0, 1, 2, 3] }, notes))
    const words = checkAiForm(formWith({ type: 'radiogroup', name: 'teleopLevel', title: 'Level', choices: ['low', 'high'] }, notes))
    expect(numeric.stats.scored.teleop).toBe(1)
    expect(words.stats.scored.teleop).toBe(0)
  })

  it('wraps a form that has "elements" but no pages', () => {
    const result = checkAiForm({ elements: [count, notes] })
    expect(result.errors).toEqual([])
    expect(result.form?.pages).toEqual([{ name: 'page1', elements: [count, notes] }])
  })

  it('fills in the title and display settings the builder expects', () => {
    const result = checkAiForm({ pages: [{ name: 'p', elements: [count, notes] }] })
    expect(result.form).toMatchObject({ title: 'Match scouting', showQuestionNumbers: 'off', widthMode: 'responsive' })
  })

  it('removes the match and team number questions Matchbook adds itself, and says so', () => {
    const result = checkAiForm(formWith({ type: 'text', name: '_matchNumber', title: 'Match' }, { type: 'text', name: '_teamNumber', title: 'Team' }, count, notes))
    expect(result.errors).toEqual([])
    expect(result.stats.questions).toBe(2)
    expect(result.warnings.map((warning) => warning.message).join(' ')).toMatch(/Removed “_matchNumber”/)
  })

  it('looks inside groups', () => {
    const result = checkAiForm({ pages: [{ name: 'p', elements: [{ type: 'panel', name: 'group', elements: [count, notes] }] }] })
    expect(result.errors).toEqual([])
    expect(result.stats.questions).toBe(2)
  })

  it('does not change what it was given', () => {
    const input = formWith(count, notes)
    const before = JSON.stringify(input)
    checkAiForm(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('checkAiForm: forms it refuses', () => {
  it('refuses anything that is not an object', () => {
    expect(errorsOf('hello')[0]).toMatch(/not a scouting form/)
    expect(errorsOf(null)[0]).toMatch(/not a scouting form/)
    expect(errorsOf([1, 2])[0]).toMatch(/not a scouting form/)
  })

  it('refuses a form with no pages', () => {
    expect(errorsOf({ title: 'x' })[0]).toMatch(/no pages/)
    expect(errorsOf({ pages: [] })[0]).toMatch(/no pages/)
  })

  it('refuses a form with no questions', () => {
    expect(errorsOf({ pages: [{ name: 'p', elements: [] }] })).toContain('The form has no questions.')
  })

  it('refuses duplicate names', () => {
    expect(errorsOf(formWith(count, count, notes)).join(' ')).toMatch(/Two questions are both named “autoScored”/)
  })

  it('suggests a better name when a name is not usable', () => {
    const message = errorsOf(formWith({ type: 'boolean', name: 'Auto Scored!', title: 'x' }, notes)).join(' ')
    expect(message).toMatch(/not a valid name/)
    expect(message).toContain('“autoScored”')
  })

  it('refuses other underscore names, which Matchbook keeps for itself', () => {
    expect(errorsOf(formWith({ type: 'boolean', name: '_secret', title: 'x' }, notes)).join(' ')).toMatch(/underscore/)
  })

  it('refuses questions with no name or no type', () => {
    expect(errorsOf(formWith({ type: 'boolean', title: 'x' }, notes)).join(' ')).toMatch(/no "name"/)
    expect(errorsOf(formWith({ name: 'autoX', title: 'x' }, notes)).join(' ')).toMatch(/no "type"/)
  })

  it('allows native rich text, matrices and offline files but refuses server uploads', () => {
    expect(errorsOf(formWith({ type: 'html', name: 'banner', html: '<b>hi</b>' }, notes))).toEqual([])
    expect(errorsOf(formWith({ type: 'file', name: 'photo', title: 'x' }, notes))).toEqual([])
    expect(errorsOf(formWith({ type: 'matrix', name: 'grid', title: 'x', rows: ['auto', 'teleop'], columns: [1, 2, 3] }, notes))).toEqual([])
    expect(errorsOf(formWith({ type: 'file', name: 'photo', storeDataAsText: false }, notes)).join(' ')).toMatch(/server upload handler/)
  })

  it('refuses unknown question types and lists the allowed ones', () => {
    const message = errorsOf(formWith({ type: 'hologram', name: 'h', title: 'x' }, notes)).join(' ')
    expect(message).toMatch(/does not know/)
    expect(message).toContain('expression')
    expect(message).toContain('paneldynamic')
  })

  it('refuses choice questions with no choices, or repeated ones', () => {
    expect(errorsOf(formWith({ type: 'radiogroup', name: 'level', title: 'x' }, notes)).join(' ')).toMatch(/no "choices"/)
    expect(errorsOf(formWith({ type: 'dropdown', name: 'level', title: 'x', choices: ['a', 'a'] }, notes)).join(' ')).toMatch(/same choice twice/)
  })

  it('refuses choices loaded from the internet', () => {
    expect(errorsOf(formWith({ type: 'dropdown', name: 'teams', title: 'x', choices: ['a', 'b'], choicesByUrl: { url: 'https://x.test' } }, notes)).join(' ')).toMatch(/web address/)
  })

  it('allows formatted wording but refuses executable markup in questions and choices', () => {
    expect(errorsOf(formWith({ type: 'boolean', name: 'autoX', title: 'Did it <b>move</b>?' }, notes))).toEqual([])
    expect(errorsOf(formWith({ type: 'boolean', name: 'autoX', title: 'x', description: '<img src=x onerror=alert(1)>' }, notes)).join(' ')).toMatch(/unsafe or external HTML/)
    expect(errorsOf(formWith({ type: 'radiogroup', name: 'level', title: 'x', choices: ['ok', '<script>bad()</script>'] }, notes)).join(' ')).toMatch(/unsafe or external HTML/)
  })

  it('checks survey-level and page-level content as well', () => {
    const base = formWith(count, notes)
    expect(errorsOf({ ...base, completedHtml: '<img src=x onerror=alert(1)>' }).join(' ')).toMatch(/unsafe or external HTML/)
    expect(errorsOf({ ...base, title: 'Scouting <script>bad()</script>' }).join(' ')).toMatch(/unsafe or external HTML/)
    const page = { name: 'p', description: '<b>bold</b>', elements: [count, notes] }
    expect(errorsOf({ title: 'T', pages: [page] })).toEqual([])
  })

  it('does not mistake an ordinary comparison for markup', () => {
    expect(errorsOf(formWith({ type: 'boolean', name: 'autoQuick', title: 'Finished in <10s?' }, notes))).toEqual([])
    expect(errorsOf(formWith({ type: 'boolean', name: 'autoMany', title: 'Scored > 3 pieces, or one = 1 point?' }, notes))).toEqual([])
  })

  it('refuses forms that are far too long for a match', () => {
    const many = Array.from({ length: 130 }, (_, index) => ({ type: 'boolean', name: `teleopQuestion${index}`, title: `Question ${index}` }))
    expect(errorsOf(formWith(...many, notes)).join(' ')).toMatch(/far too many/)
  })

  it('refuses rules that SurveyJS cannot evaluate', () => {
    const broken = { type: 'boolean', name: 'autoBonus', title: 'Bonus', visibleIf: '{autoScored} >' }
    expect(errorsOf(formWith(count, broken, notes)).join(' ')).toMatch(/A rule on .* does not work/)
  })

  it('gives no form back when there are errors', () => {
    expect(checkAiForm(formWith(count, count)).form).toBeNull()
  })
})

describe('checkAiForm: warnings about ranking', () => {
  it('allows neutral metrics without claiming every team will tie in Analysis', () => {
    const result = checkAiForm(formWith({ type: 'boolean', name: 'brokeDown', title: 'x' }, notes))
    expect(result.errors).toEqual([])
    const warning = result.warnings.find((issue) => /No field contributes to phase totals/.test(issue.message))
    expect(warning?.ask).toBe(false)
    expect(warning?.message).toMatch(/compared individually/)
  })

  it('warns when a scoring name is on an answer that cannot score', () => {
    const messages = warningsOf(formWith(count, { type: 'comment', name: 'autoPlan', title: 'Plan' }, notes)).join(' ')
    expect(messages).toMatch(/“autoPlan” starts with “auto”.*will not add to the auto score/)
  })

  it('warns when an opinion rating would add to a score', () => {
    const messages = warningsOf(formWith(count, { type: 'rating', name: 'teleopDriving', title: 'Driving' }, notes)).join(' ')
    expect(messages).toMatch(/“teleopDriving” is a rating, and a rating adds its number to the teleop score/)
  })

  it('does not warn about a rating that has no scoring prefix', () => {
    expect(warningsOf(formWith(count, { type: 'rating', name: 'driverSkill', title: 'Driving' }, notes))).toEqual([])
  })

  it('warns when there is no notes question, or it is the wrong type', () => {
    expect(warningsOf(formWith(count)).join(' ')).toMatch(/no question named “notes”/)
    expect(warningsOf(formWith(count, { type: 'boolean', name: 'notes', title: 'x' })).join(' ')).toMatch(/should be a "comment"/)
  })

  it('warns when the form is long, or mostly required', () => {
    const many = Array.from({ length: 45 }, (_, index) => ({ type: 'boolean', name: `teleopQuestion${index}`, title: `Question ${index}`, isRequired: true }))
    const messages = warningsOf(formWith(...many, notes)).join(' ')
    expect(messages).toMatch(/46 questions/)
    expect(messages).toMatch(/Most questions are required/)
  })

  it('allows a web address as plain text without claiming the form needs the internet', () => {
    const result = checkAiForm(formWith(count, { type: 'comment', name: 'notes', title: 'Notes', description: 'See www.example.com' }))
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })
})

describe('buildFixRequest', () => {
  it('lists every error and the warnings that change how teams are ranked', () => {
    const result = checkAiForm(formWith(count, count, { type: 'rating', name: 'teleopDriving', title: 'x' }))
    const request = buildFixRequest(result)
    expect(request).toMatch(/found \d+ problems?/)
    expect(request).toContain('Two questions are both named “autoScored”')
    expect(request).toMatch(/complete corrected form in one ```json code block/)
  })

  it('is empty when there is nothing to fix', () => {
    expect(buildFixRequest(checkAiForm(formWith(count, notes)))).toBe('')
  })
})

describe('suggestQuestionName', () => {
  it('turns a sentence into a usable name', () => {
    expect(suggestQuestionName('Auto scored!')).toBe('autoScored')
    expect(suggestQuestionName('  Did the ROBOT climb? ')).toBe('didTheRobotClimb')
    expect(suggestQuestionName('3 balls')).toBe('q3Balls')
    expect(suggestQuestionName('???')).toBe('question')
  })
})

describe('native SurveyJS logic and saved results', () => {
  it('accepts match context, conditional requirements, validators and saved calculations', () => {
    const form = {
      ...formWith(count, { type: 'text', name: 'bonus', inputType: 'number', visibleIf: '{_matchNumber} > 0', requiredIf: '{autoScored} > 2', validators: [{ type: 'expression', expression: '{bonus} <= {autoScored}', text: 'Bonus cannot exceed pieces' }] }, notes),
      calculatedValues: [{ name: 'piecesWeighted', expression: '{autoScored} * 3', includeIntoResult: true }],
    }
    const checked = checkAiForm(form)
    expect(checked.errors).toEqual([])
    expect(checked.stats.calculatedValues).toBe(1)
    expect(checked.form?.calculatedValues).toEqual(form.calculatedValues)
    const model = createScoutSurvey(checked.form!)
    setScoutContext(model, 12, 254)
    model.setValue('autoScored', '4')
    model.setValue('bonus', '5')
    expect(model.validate()).toBe(false)
    model.setValue('bonus', '2')
    expect(model.validate()).toBe(true)
    model.doComplete()
    expect(model.data.piecesWeighted).toBe(12)
    expect(calculatePhaseScores(model.data).auto).toBe(4)
    model.dispose()
  })

  it('supports scoped dynamic templates and array aggregates without treating child values as phase totals', () => {
    const form = {
      ...formWith(
        { type: 'paneldynamic', name: 'cycles', templateElements: [{ type: 'text', inputType: 'number', name: 'pieces' }] },
        { type: 'paneldynamic', name: 'misses', templateElements: [{ type: 'text', inputType: 'number', name: 'pieces' }] },
        { type: 'expression', name: 'teleopTotal', expression: "sumInArray({cycles}, 'pieces')" },
        notes,
      ),
    }
    const result = checkAiForm(form)
    expect(result.errors).toEqual([])
    const model = createScoutSurvey(result.form!)
    model.setValue('cycles', [{ pieces: 2 }, { pieces: 3 }])
    model.doComplete()
    expect(model.data.cycles).toEqual([{ pieces: 2 }, { pieces: 3 }])
    expect(model.data.teleopTotal).toBe(5)
    expect(calculatePhaseScores(model.data).teleop).toBe(5)
    model.dispose()
  })

  it('uses valueName as the phase result key', () => {
    const result = checkAiForm(formWith({ type: 'text', name: 'pieces', valueName: 'autoPieces', inputType: 'number' }, notes))
    expect(result.errors).toEqual([])
    expect(result.stats.scored.auto).toBe(1)
    const model = createScoutSurvey(result.form!)
    model.setValue('autoPieces', '6')
    expect(calculatePhaseScores(model.data).auto).toBe(6)
    model.dispose()
  })

  it('accepts local copied and generated choices', () => {
    expect(errorsOf(formWith(
      { type: 'checkbox', name: 'capabilities', choices: ['Score', 'Defend'] },
      { type: 'dropdown', name: 'focus', choicesFromQuestion: 'capabilities', choicesFromQuestionMode: 'selected' },
      { type: 'dropdown', name: 'pieces', choicesMin: 0, choicesMax: 10 },
      notes,
    ))).toEqual([])
  })

  it('rejects unknown properties instead of silently dropping settings', () => {
    expect(errorsOf(formWith({ ...count, madeUpLogic: true }, notes)).join(' ')).toMatch(/Unknown property.*madeUpLogic/)
  })

  it('rejects unknown expression functions and references', () => {
    expect(errorsOf({ ...formWith(count, notes), calculatedValues: [{ name: 'derived', expression: 'notAFunction({autoScored})', includeIntoResult: true }] }).join(' ')).toMatch(/function that does not exist/)
    expect(errorsOf(formWith({ ...count, visibleIf: '{missingAnswer} > 0' }, notes)).join(' ')).toMatch(/value that does not exist/)
  })

  it('warns about prefixed derived fields and penalties that inflate totals', () => {
    const result = checkAiForm({
      ...formWith(count, { type: 'text', name: 'teleopFouls', inputType: 'number' }, notes),
      calculatedValues: [{ name: 'autoTotal', expression: '{autoScored} * 3', includeIntoResult: true }],
    })
    expect(result.errors).toEqual([])
    expect(result.warnings.some((warning) => warning.ask && /double-count/.test(warning.message))).toBe(true)
    expect(result.warnings.some((warning) => warning.ask && /penalties/.test(warning.message))).toBe(true)
  })

  it('rejects calculated names that collide with result keys', () => {
    expect(errorsOf({ ...formWith(count, notes), calculatedValues: [{ name: 'autoScored', expression: '1', includeIntoResult: true }] }).join(' ')).toMatch(/duplicates a question or result key/)
  })

  it('reports unsaved calculated values and leaves their logic intact', () => {
    const calculation = { name: 'derived', expression: '{autoScored} * 3' }
    const result = checkAiForm({ ...formWith(count, notes), calculatedValues: [calculation] })
    expect(result.errors).toEqual([])
    expect(result.form?.calculatedValues).toEqual([calculation])
    expect(result.warnings.map((warning) => warning.message).join(' ')).toMatch(/includeIntoResult/)
  })

  it('rejects remote media and completion redirects', () => {
    expect(errorsOf(formWith({ type: 'image', name: 'diagram', imageLink: 'https://example.com/diagram.png' }, notes)).join(' ')).toMatch(/external image/)
    expect(errorsOf({ ...formWith(count, notes), navigateToUrl: 'https://example.com' }).join(' ')).toMatch(/redirects away/)
    expect(errorsOf({ ...formWith(count, notes), logo: { default: 'https://example.com/logo.png' } }).join(' ')).toMatch(/external image/)
  })

  it('checks validator and localized text for unsafe HTML', () => {
    expect(errorsOf(formWith({ ...count, validators: [{ type: 'numeric', text: '<script>alert(1)</script>' }] }, notes)).join(' ')).toMatch(/unsafe or external HTML/)
    expect(errorsOf(formWith({ ...count, title: { default: 'Pieces', fr: '<img src=x onerror=alert(1)>' } }, notes)).join(' ')).toMatch(/unsafe or external HTML/)
  })

  it('returns errors for non-JSON and excessively deep data without throwing', () => {
    const circular: Record<string, unknown> = formWith(count, notes)
    circular.loop = circular
    expect(() => checkAiForm(circular)).not.toThrow()
    expect(checkAiForm(circular).form).toBeNull()
    expect(() => checkAiForm({ pages: [BigInt(1)] })).not.toThrow()
    let nested: Record<string, unknown> = { type: 'text', name: 'deep' }
    for (let i = 0; i < 30; i += 1) nested = { type: 'panel', name: 'group' + i, elements: [nested] }
    expect(errorsOf(formWith(nested)).join(' ')).toMatch(/nested too deeply/)
  })

  it('enforces UTF-8 bytes rather than JavaScript string length', () => {
    const tooLarge = formWith({ ...notes, description: '🤖'.repeat(60_000) })
    expect(errorsOf(tooLarge).join(' ')).toMatch(/far too large/)
  })
})
