import { Model } from 'survey-core'

export const MATCHBOOK_META_NAMES: readonly string[] = ['_matchNumber', '_teamNumber']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withoutContextFields(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((element) => {
    if (!isRecord(element)) return [element]
    if (typeof element.name === 'string' && MATCHBOOK_META_NAMES.includes(element.name)) return []
    const copy = { ...element }
    if (Array.isArray(copy.elements)) copy.elements = withoutContextFields(copy.elements)
    if (Array.isArray(copy.templateElements)) copy.templateElements = withoutContextFields(copy.templateElements)
    return [copy]
  })
}

/** The checker, preview, and Scout screen must run the same hidden match context. */
export function withMatchbookContext(form: Record<string, unknown>): Record<string, unknown> {
  const pages = Array.isArray(form.pages) ? form.pages.filter(isRecord).map((page) => ({ ...page, elements: withoutContextFields(page.elements) }))
    : [{ name: 'scouting', elements: withoutContextFields(form.elements) }]
  const first = pages[0] ?? { name: 'scouting', elements: [] }
  const elements = [...first.elements]
  for (const name of MATCHBOOK_META_NAMES) {
    elements.unshift({ type: 'text', name, visible: false, clearIfInvisible: 'none' })
  }
  const result: Record<string, unknown> = { ...form, pages: [{ ...first, elements }, ...pages.slice(1)] }
  delete result.elements
  return result
}

export function createScoutSurvey(form: Record<string, unknown>): Model {
  return new Model(withMatchbookContext(form))
}

export function setScoutContext(model: Model, matchNumber: number, teamNumber: number): void {
  model.setValue('_matchNumber', String(matchNumber))
  model.setValue('_teamNumber', String(teamNumber))
}
