import { describe, expect, it } from 'vitest'
import { checkAiForm } from './check'
import { extractFormJson } from './extract'
import { LIMITS, QUESTION_TYPES, SURVEYJS_LATEST_SCHEMA_URL, SURVEYJS_SCHEMA_URL, SURVEYJS_VERSION } from './formRules'
import { EXAMPLE_FORM, buildAiFormPrompt } from './prompt'

describe('the example form in the prompt', () => {
  it('passes the checker with no errors and no warnings', () => {
    const result = checkAiForm(EXAMPLE_FORM)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('scores the things that should raise a team’s score, and only those', () => {
    const { stats } = checkAiForm(EXAMPLE_FORM)
    expect(stats.scored).toEqual({ auto: 2, teleop: 1, endgame: 1 })
    expect(stats.unscored).toBe(5)
    expect(stats.calculatedValues).toBe(1)
  })

  it('survives being pulled back out of the prompt text, which is how an AI would copy it', () => {
    const prompt = buildAiFormPrompt()
    const extracted = extractFormJson(prompt)
    expect(extracted.ok && extracted.value).toEqual(EXAMPLE_FORM)
  })
})

describe('buildAiFormPrompt', () => {
  const prompt = buildAiFormPrompt()

  it('teaches the naming rule that decides how teams are ranked', () => {
    for (const word of ['auto', 'teleop', 'endgame', 'climb', 'notes', 'teleopFouls']) {
      expect(prompt).toContain(word)
    }
    expect(prompt).toMatch(/START of its name/)
  })

  it('names every question type the checker accepts', () => {
    for (const type of QUESTION_TYPES) {
      expect(prompt).toContain(`"${type}"`)
    }
  })

  it('makes the assistant interview the scout first and answer with one code block', () => {
    expect(prompt).toMatch(/Start by asking me about the game/)
    expect(prompt).toMatch(/single ```json code block/)
    expect(prompt).toMatch(/Begin now: ask me your first question/)
  })

  it('states the limits the checker enforces', () => {
    expect(prompt).toContain(String(LIMITS.comfortableQuestions))
  })

  it('keeps the match and team number out of the form', () => {
    expect(prompt).toMatch(/Do not ask for the match number or the team number/)
  })

  it('is long enough to teach and short enough to paste', () => {
    const words = prompt.split(/\s+/).length
    expect(words).toBeGreaterThan(500)
    expect(words).toBeLessThan(1800)
  })

  it('never leaks placeholder text', () => {
    expect(prompt).not.toMatch(/undefined|\[object Object\]|null/)
  })

  it('provides the requested schema and an installed-version compatibility reference', () => {
    expect(prompt).toContain(SURVEYJS_LATEST_SCHEMA_URL)
    expect(prompt).toContain(SURVEYJS_SCHEMA_URL)
    expect(prompt).toContain('SurveyJS ' + SURVEYJS_VERSION)
    expect(prompt).toContain('If you cannot access a reference, say so')
  })

  it('teaches saved calculations, conditional logic and actual analysis semantics', () => {
    for (const concept of ['includeIntoResult', 'visibleIf', 'requiredIf', 'validators', 'sumInArray', 'double-counting', 'valueName', 'rounded to an integer', 'Unanswered values are excluded']) {
      expect(prompt).toContain(concept)
    }
  })

  it('tells the assistant the season and event when they are known', () => {
    const text = buildAiFormPrompt({ season: 2026, eventName: 'San Diego Regional' })
    expect(text).toContain('2026 FIRST Robotics Competition season, at San Diego Regional')
  })

  it('asks for the season when it is not known', () => {
    expect(prompt).toMatch(/ask me first/)
  })

  it('carries the team’s own notes', () => {
    expect(buildAiFormPrompt({ extraNotes: '  We only care about climbing.  ' })).toContain('Things my team wants you to know: We only care about climbing.')
  })

  it('includes the current form so the assistant can improve it', () => {
    const current = { title: 'Ours', pages: [{ name: 'a', elements: [{ type: 'boolean', name: 'autoMoved', title: 'Moved' }] }] }
    const text = buildAiFormPrompt({ currentForm: current })
    expect(text).toMatch(/already has this form in Matchbook/)
    expect(text).toContain('"autoMoved"')
  })
})
