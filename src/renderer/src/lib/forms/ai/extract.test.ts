import { describe, expect, it } from 'vitest'
import { cleanJson, extractFormJson } from './extract'

const FORM = { title: 'Scouting', pages: [{ name: 'p1', elements: [{ type: 'boolean', name: 'autoMoved', title: 'Moved?' }] }] }
const FORM_TEXT = JSON.stringify(FORM, null, 2)

function ok(result: ReturnType<typeof extractFormJson>): Record<string, unknown> {
  if (!result.ok) {
    throw new Error(`expected a form, got: ${result.reason}`)
  }
  return result.value
}

describe('extractFormJson', () => {
  it('reads plain JSON', () => {
    expect(ok(extractFormJson(FORM_TEXT))).toEqual(FORM)
  })

  it('finds the form in a code block surrounded by chat', () => {
    const reply = `Great, here is your form:\n\n\`\`\`json\n${FORM_TEXT}\n\`\`\`\n\nLet me know if you want changes!`
    expect(ok(extractFormJson(reply))).toEqual(FORM)
  })

  it('prefers the last code block, since assistants put the final version at the end', () => {
    const draft = { pages: [{ name: 'old', elements: [{ type: 'boolean', name: 'draftOnly', title: 'Draft' }] }] }
    const reply = `Draft:\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\`\nFinal:\n\`\`\`json\n${FORM_TEXT}\n\`\`\``
    expect(ok(extractFormJson(reply))).toEqual(FORM)
  })

  it('skips code blocks that are not forms', () => {
    const reply = `Example of one question:\n\`\`\`json\n{"type":"boolean","name":"x"}\n\`\`\`\nThe form:\n\`\`\`json\n${FORM_TEXT}\n\`\`\`\nDone.\n\`\`\`json\n{"note": "thanks"}\n\`\`\``
    expect(ok(extractFormJson(reply))).toEqual(FORM)
  })

  it('finds JSON with no code block at all', () => {
    expect(ok(extractFormJson(`Sure thing. ${FORM_TEXT} Hope that helps.`))).toEqual(FORM)
  })

  it('reads a code block the reply was cut off before closing', () => {
    expect(ok(extractFormJson(`Here you go:\n\`\`\`json\n${FORM_TEXT}`))).toEqual(FORM)
  })

  it('repairs comments, trailing commas and curly quotes, and says it did', () => {
    const messy = `{
      // the form
      “title”: “Scouting”,
      "pages": [ { "name": "p1", /* first page */ "elements": [ { "type": "boolean", "name": "autoMoved", "title": "Moved?", }, ], }, ],
    }`
    const result = extractFormJson(messy)
    expect(ok(result)).toMatchObject({ title: 'Scouting', pages: [{ name: 'p1' }] })
    expect(result.ok && result.repaired).toBe(true)
  })

  it('does not report a repair when the JSON was already valid', () => {
    const result = extractFormJson(FORM_TEXT)
    expect(result.ok && result.repaired).toBe(false)
  })

  it('never edits text inside strings', () => {
    const source = { pages: [{ name: 'p', elements: [{ type: 'comment', name: 'notes', title: 'See https://example.com // not a comment /* nor this */' }] }] }
    const result = extractFormJson(`{ "pages": ${JSON.stringify(source.pages)}, }`)
    expect(ok(result)).toEqual(source)
  })

  it('unwraps a form nested under a key', () => {
    expect(ok(extractFormJson(JSON.stringify({ form: FORM })))).toEqual(FORM)
    expect(ok(extractFormJson(JSON.stringify({ surveyJson: FORM })))).toEqual(FORM)
  })

  it('accepts a bare list of pages or of questions', () => {
    expect(ok(extractFormJson(JSON.stringify(FORM.pages)))).toEqual({ pages: FORM.pages })
    expect(ok(extractFormJson(JSON.stringify(FORM.pages[0].elements)))).toEqual({ pages: [{ name: 'page1', elements: FORM.pages[0].elements }] })
  })

  it('explains JSON that is not a form', () => {
    const result = extractFormJson('```json\n{"hello": "world", "n": 1}\n```')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/not a scouting form/i)
  })

  it('explains text with no JSON in it', () => {
    const result = extractFormJson('Sure! What game is your team playing this year?')
    expect(!result.ok && result.reason).toMatch(/could not find a form/i)
  })

  it('notices a reply that was cut off', () => {
    const result = extractFormJson(`\`\`\`json\n${FORM_TEXT.slice(0, FORM_TEXT.length - 12)}`)
    expect(!result.ok && result.reason).toMatch(/cut off/i)
  })

  it('asks for something when nothing was pasted', () => {
    expect(extractFormJson('   \n  ').ok).toBe(false)
  })

  it('refuses enormous input', () => {
    expect(extractFormJson('x'.repeat(300_000)).ok).toBe(false)
  })
})

describe('cleanJson', () => {
  it('leaves valid JSON unchanged', () => {
    expect(cleanJson(FORM_TEXT)).toBe(FORM_TEXT)
  })

  it('drops a comma only when it precedes a closing bracket', () => {
    expect(JSON.parse(cleanJson('{"a":[1,2,],"b":3,}'))).toEqual({ a: [1, 2], b: 3 })
  })
})
