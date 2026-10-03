import { ExpressionErrorType, type Model } from 'survey-core'
import { createScoutSurvey } from '../scoutSurvey'
import { phaseForField, type Phase } from '../../utils/scoring'
import {
  CHOICE_TYPES, CONTAINER_TYPE, HTML_TAG, LIMITS, NAME_PATTERN, QUESTION_TYPES,
  RESERVED_NAMES, SURVEYJS_SCHEMA_URL, SURVEYJS_VERSION, UNSAFE_HTML, isOfflineImage,
} from './formRules'

export type Issue = {
  level: 'error' | 'warning'
  message: string
  /** Include warnings that could quietly change a team's ranking in the correction request. */
  ask?: boolean
}
export type FormStats = {
  pages: number
  questions: number
  /** Top-level result fields that can contribute to the saved phase totals. */
  scored: Record<Phase, number>
  unscored: number
  calculatedValues: number
}
export type CheckResult = {
  form: Record<string, unknown> | null
  errors: Issue[]
  warnings: Issue[]
  stats: FormStats
}
type Json = Record<string, unknown>
type ResultField = { name: string; expression?: string; phase: Phase | null }
const IMAGE_PROPERTIES = new Set(['imageLink', 'imageUrl', 'logo', 'backgroundImage'])
const EXPRESSION_PROPERTIES = new Set([
  'visibleIf', 'enableIf', 'requiredIf', 'defaultValueExpression', 'setValueExpression',
  'setValueIf', 'resetValueIf', 'choicesVisibleIf', 'choicesEnableIf', 'expression',
])
function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Suggest a stable result key without changing the AI's form silently. */
export function suggestQuestionName(text: string): string {
  const words = text.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'question'
  const joined = words.map((word, index) => index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()).join('')
  return /^[A-Za-z]/.test(joined) ? joined : 'q' + joined
}
function describeExpressionError(type: ExpressionErrorType): string {
  switch (type) {
    case ExpressionErrorType.SyntaxError: return 'it is not written correctly'
    case ExpressionErrorType.UnknownFunction: return 'it uses a function that does not exist'
    case ExpressionErrorType.UnknownVariable: return 'it refers to a question or value that does not exist'
    default: return 'it cannot be evaluated'
  }
}
function isNumeric(value: unknown): boolean {
  return typeof value === 'number' ? Number.isFinite(value)
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
}
function choiceValue(choice: unknown): unknown {
  return isRecord(choice) ? (choice.value ?? choice.text) : choice
}
function canScore(question: Json): boolean {
  switch (question.type) {
    case 'expression':
    case 'slider': return true
    case 'boolean': return [question.valueTrue ?? true, question.valueFalse ?? false].every((value) => typeof value === 'boolean' || isNumeric(value))
    case 'rating': {
      const values = Array.isArray(question.rateValues) ? question.rateValues : []
      return values.length === 0 || values.every((value) => isNumeric(choiceValue(value)))
    }
    case 'text': return question.inputType === 'number' || question.inputType === 'range'
    case 'radiogroup':
    case 'dropdown':
    case 'imagepicker': {
      const choices = Array.isArray(question.choices) ? question.choices : []
      return choices.length > 0 && choices.every((choice) => typeof choiceValue(choice) === 'boolean' || isNumeric(choiceValue(choice)))
        || isNumeric(question.choicesMin) && isNumeric(question.choicesMax)
    }
    default: return false
  }
}

/** Validate against the bundled engine while preserving native SurveyJS logic and result data. */
export function checkAiForm(input: unknown): CheckResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const stats: FormStats = { pages: 0, questions: 0, scored: { auto: 0, teleop: 0, endgame: 0 }, unscored: 0, calculatedValues: 0 }
  const fail = (message: string): void => {
    if (!errors.some((issue) => issue.message === message)) errors.push({ level: 'error', message })
  }
  const warn = (message: string, ask = false): void => {
    if (!warnings.some((issue) => issue.message === message)) warnings.push({ level: 'warning', message, ask })
  }
  const done = (form: Json | null): CheckResult => ({ form: errors.length === 0 ? form : null, errors, warnings, stats })
  if (!isRecord(input)) {
    fail('That is not a scouting form. A form is one JSON object that contains a list of pages.')
    return done(null)
  }
  let parsed: unknown
  try {
    const serialized = JSON.stringify(input)
    if (new TextEncoder().encode(serialized).byteLength > LIMITS.maxBytes) {
      fail('That form is far too large to be a scouting form.')
      return done(null)
    }
    parsed = JSON.parse(serialized)
  } catch {
    fail('The form is not valid JSON. Remove circular references or values that JSON cannot store.')
    return done(null)
  }
  if (!isRecord(parsed)) {
    fail('That is not a scouting form.')
    return done(null)
  }
  const form = parsed

  // Check localized text, validators, dynamic templates, choices, and completion content too.
  const checkOfflineContent = (value: unknown, place: string, depth: number, property = ''): void => {
    if (depth > LIMITS.maxDepth) {
      fail('The form is nested too deeply. Simplify its groups and templates.')
      return
    }
    if (typeof value === 'string') {
      if (!EXPRESSION_PROPERTIES.has(property) && HTML_TAG.test(value)) {
        if (UNSAFE_HTML.test(value) || /<\s*\/?\s*(?:img|audio|video|source|a)\b/i.test(value)) {
          fail(place + ' contains unsafe or external HTML. Use formatted text, lists or tables; use a native image question with an embedded image.')
        }
      }
      if (IMAGE_PROPERTIES.has(property) && value && !isOfflineImage(value)) {
        fail(place + ' loads an external image or unsupported media. Embed a PNG, JPEG, GIF or WebP data URI so it works offline.')
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => checkOfflineContent(item, place + '[' + index + ']', depth + 1, property))
    } else if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail(place + ' contains an unsupported object key: ' + key + '.')
        if (key === 'choicesByUrl' && child) fail(place + ' loads its choices from a web address. List the choices locally or use choicesFromQuestion.')
        if ((key === 'navigateToUrl' || key === 'navigateToUrlOnCondition') && child && (!Array.isArray(child) || child.length > 0)) {
          fail(place + ' redirects away from Matchbook after completion. Remove ' + key + '.')
        }
        checkOfflineContent(child, place + '.' + key, depth + 1, IMAGE_PROPERTIES.has(property) ? property : key)
      }
    }
  }
  checkOfflineContent(form, 'The form', 0)
  if (errors.length > 0) return done(null)
  if (!Array.isArray(form.pages) && Array.isArray(form.elements)) {
    form.pages = [{ name: 'page1', elements: form.elements }]
    delete form.elements
  }
  if (!Array.isArray(form.pages) || form.pages.length === 0) {
    fail('The form has no pages. It needs a "pages" list with the questions inside.')
    return done(null)
  }

  const resultFields: ResultField[] = []
  const rootNames = new Set<string>()
  const resultNames = new Set<string>()
  let required = 0
  const checkName = (name: string, label: string): void => {
    if (name.startsWith('_')) fail(label + ' starts with an underscore, which Matchbook keeps for its own fields. Try “' + suggestQuestionName(name) + '”.')
    else if (!NAME_PATTERN.test(name)) fail(label + ' is not a valid name. Use letters, numbers or underscores, starting with a letter. Try “' + suggestQuestionName(name) + '”.')
  }
  const recordResult = (question: Json, name: string): void => {
    const phase = phaseForField(name)
    resultFields.push({ name, phase, expression: typeof question.expression === 'string' ? question.expression : undefined })
    resultNames.add(name)
    if (phase && canScore(question)) {
      stats.scored[phase] += 1
      if (question.type === 'rating') warn('“' + name + '” is a rating, and a rating adds its number to the ' + phase + ' score. If it is an opinion, remove its phase prefix.', true)
      if (/foul|penalt|drop|miss|fail|broke|breakdown/i.test(name)) warn('“' + name + '” adds positive answers to the ' + phase + ' total. Keep penalties, missed actions and failures outside phase prefixes.', true)
    } else {
      stats.unscored += 1
      if (phase) warn('“' + name + '” starts with “' + phase + '”, but its answer is text or nested data, so it will not add to the ' + phase + ' score. For nested answers, save a top-level numeric expression or calculated value.', true)
    }
    if (name === 'notes' && question.type !== 'comment' && question.type !== 'text') warn('The question named “notes” should be a "comment" (a longer text box) so scouts can write freely.')
  }

  const visit = (raw: unknown, place: string, names: Set<string>, root: boolean): unknown[] => {
    if (!Array.isArray(raw)) {
      fail(place + ' has no list of questions.')
      return []
    }
    const kept: Json[] = []
    raw.forEach((element, index) => {
      const spot = place + ', item ' + (index + 1)
      if (!isRecord(element)) { fail(spot + ' is not a question.'); return }
      const type = typeof element.type === 'string' ? element.type : ''
      const name = typeof element.name === 'string' ? element.name : ''
      const label = name ? '“' + name + '”' : spot
      if (!type) { fail(spot + ' has no "type". Every question needs one, such as "boolean" or "text".'); return }
      if (type !== CONTAINER_TYPE && !(QUESTION_TYPES as readonly string[]).includes(type)) {
        fail(label + ' uses the question type "' + type + '", which Matchbook does not know. Use one of: ' + QUESTION_TYPES.join(', ') + ', panel.')
        return
      }
      if (RESERVED_NAMES.includes(name)) {
        warn('Removed “' + name + '”. Matchbook asks for the match and team number itself; expressions can still reference its hidden context.')
        return
      }
      if (!name && type !== CONTAINER_TYPE) fail(spot + ' has no "name". Every question needs a short name such as "autoScored".')
      if (name) {
        checkName(name, label)
        if (names.has(name)) fail('Two questions are both named “' + name + '”. Every name within the same answer scope must be different.')
        names.add(name)
      }
      kept.push(element)
      if (type === CONTAINER_TYPE) {
        element.elements = visit(element.elements, label, names, root)
        return
      }
      stats.questions += 1
      if (element.isRequired === true) required += 1
      const resultName = typeof element.valueName === 'string' && element.valueName ? element.valueName : name
      if (resultName !== name) checkName(resultName, 'Result key “' + resultName + '”')
      if (root && type !== 'html' && type !== 'image') recordResult(element, resultName)
      else stats.unscored += 1
      if (CHOICE_TYPES.includes(type)) {
        const choices = Array.isArray(element.choices) ? element.choices : []
        const generated = isNumeric(element.choicesMin) && isNumeric(element.choicesMax)
        const copied = typeof element.choicesFromQuestion === 'string' && element.choicesFromQuestion.length > 0
        if (choices.length === 0 && !generated && !copied) fail(label + ' has no "choices". List options or use choicesFromQuestion or numeric generated choices.')
        if (choices.length === 1 && !generated && !copied) warn(label + ' has only one choice, so there is nothing for a scout to decide.')
        const values = choices.map((choice) => JSON.stringify(choiceValue(choice)))
        if (new Set(values).size !== values.length) fail(label + ' lists the same choice twice.')
      }
      if ((type === 'file' || type === 'signaturepad') && element.storeDataAsText === false) fail(label + ' requires a server upload handler. Keep storeDataAsText enabled to store attachments offline.')
      if (type === 'file' || type === 'signaturepad') warn(label + ' saves attachments in the entry. Large attachments make QR transfers slower; use them only when they help scouts.')
      if (type === 'paneldynamic') element.templateElements = visit(element.templateElements, label + ' template', new Set<string>(), false)
    })
    return kept
  }
  form.pages.forEach((page, index) => {
    const place = 'Page ' + (index + 1)
    if (!isRecord(page)) { fail(place + ' is not a page.'); return }
    stats.pages += 1
    page.elements = visit(page.elements, place, rootNames, true)
  })

  if (Array.isArray(form.calculatedValues)) {
    const calculatedNames = new Set<string>()
    form.calculatedValues.forEach((calculation) => {
      if (!isRecord(calculation) || typeof calculation.name !== 'string' || !calculation.name) { fail('Every calculated value needs a name.'); return }
      const name = calculation.name
      checkName(name, 'Calculated value “' + name + '”')
      if (rootNames.has(name) || resultNames.has(name) || calculatedNames.has(name)) fail('Calculated value “' + name + '” duplicates a question or result key.')
      calculatedNames.add(name)
      if (typeof calculation.expression !== 'string' || !calculation.expression.trim()) fail('Calculated value “' + name + '” has no expression.')
      if (calculation.includeIntoResult === true) {
        stats.calculatedValues += 1
        const phase = phaseForField(name)
        resultFields.push({ name, phase, expression: typeof calculation.expression === 'string' ? calculation.expression : undefined })
        if (phase) stats.scored[phase] += 1
      } else warn('Calculated value “' + name + '” is not saved. Set includeIntoResult to true if it should be available in Analysis.')
    })
  }
  for (const field of resultFields) {
    if (!field.phase || !field.expression) continue
    const references = [...field.expression.matchAll(/\{([^}]+)\}/g)].map((match) => match[1].split('.')[0])
    const counted = resultFields.filter((candidate) => candidate.name !== field.name && candidate.phase === field.phase && references.includes(candidate.name))
    if (counted.length > 0) warn('“' + field.name + '” and its inputs (' + counted.map((value) => value.name).join(', ') + ') both add to the ' + field.phase + ' total. This can double-count the same actions. Keep raw inputs neutral or give the derived metric a neutral name.', true)
  }
  if (stats.pages > LIMITS.maxPages) fail('The form has ' + stats.pages + ' pages. Keep it to ' + LIMITS.maxPages + ' or fewer.')
  if (stats.questions === 0 && errors.length === 0) fail('The form has no questions.')
  if (stats.questions > LIMITS.maxQuestions) fail('The form has ' + stats.questions + ' questions, which is far too many for a scout to answer in a match.')
  else if (stats.questions > LIMITS.comfortableQuestions) warn('The form has ' + stats.questions + ' questions. A scout has about two and a half minutes per match, so ' + LIMITS.comfortableQuestions + ' or fewer works better.')
  if (stats.questions >= 6 && required / stats.questions > 0.6) warn('Most questions are required. Require only the answers needed to complete an observation.')
  if (!resultNames.has('notes')) warn('There is no question named “notes”, so scouts will not be able to add a free-text remark about a robot.')
  if (stats.scored.auto + stats.scored.teleop + stats.scored.endgame === 0) warn('No field contributes to phase totals. Numeric and boolean answers can still be compared individually in Analysis.')
  if (typeof form.title !== 'string' || !form.title.trim()) form.title = 'Match scouting'
  form.showQuestionNumbers ??= 'off'
  form.widthMode ??= 'responsive'
  if (errors.length === 0) {
    let model: Model | undefined
    try {
      model = createScoutSurvey(form)
      for (const error of model.jsonErrors ?? []) fail('SurveyJS ' + SURVEYJS_VERSION + ': ' + error.message)
      for (const result of model.validateExpressions()) {
        for (const error of result.errors) fail('A rule on ' + result.propertyName + ' does not work: ' + describeExpressionError(error.errorType) + (error.variableName ? ' (“' + error.variableName + '”)' : '') + '.')
      }
    } catch (error: unknown) {
      fail('The form could not be opened: ' + (error instanceof Error ? error.message : 'unknown problem') + '.')
    } finally {
      model?.dispose()
    }
  }
  return done(form)
}

/** A version-specific correction request that preserves working questions and logic. */
export function buildFixRequest(result: CheckResult): string {
  const problems = [...result.errors, ...result.warnings.filter((warning) => warning.ask)]
  if (problems.length === 0) return ''
  return [
    'Matchbook checked the form and found ' + problems.length + (problems.length === 1 ? ' problem:' : ' problems:'),
    '', ...problems.map((problem) => '- ' + problem.message), '',
    'Use SurveyJS ' + SURVEYJS_VERSION + '. Schema: ' + SURVEYJS_SCHEMA_URL,
    'Please fix these and reply with the complete corrected form in one ' + String.fromCharCode(96).repeat(3) + 'json code block. Preserve valid questions, expressions, validators and branching.',
  ].join('\n')
}
