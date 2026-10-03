import { Version } from 'survey-core'
import { MATCHBOOK_META_NAMES } from '../scoutSurvey'

/** Native types in the bundled SurveyJS engine; no remote widgets or JavaScript plugins. */
export const QUESTION_TYPES = [
  'boolean', 'checkbox', 'comment', 'dropdown', 'expression', 'file', 'html', 'image',
  'imagepicker', 'matrix', 'matrixdropdown', 'matrixdynamic', 'multipletext', 'paneldynamic',
  'radiogroup', 'ranking', 'rating', 'signaturepad', 'slider', 'tagbox', 'text',
] as const

export const CONTAINER_TYPE = 'panel'
export const CHOICE_TYPES: readonly string[] = ['radiogroup', 'checkbox', 'dropdown', 'tagbox', 'ranking', 'imagepicker']
export const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/
export const RESERVED_NAMES = MATCHBOOK_META_NAMES
export const SURVEYJS_VERSION = Version
export const SURVEYJS_SCHEMA_URL = `https://unpkg.com/survey-core@${Version}/surveyjs_definition.json`
export const SURVEYJS_LATEST_SCHEMA_URL = 'https://unpkg.com/survey-core/surveyjs_definition.json'
export const SURVEYJS_LOGIC_URL = 'https://surveyjs.io/form-library/documentation/design-survey/conditional-logic'

export const LIMITS = {
  maxQuestions: 120,
  comfortableQuestions: 40,
  maxPages: 12,
  maxBytes: 200_000,
  maxDepth: 24,
} as const

export const HTML_TAG = /<\s*\/?\s*[a-zA-Z!]/
/** Rich text is allowed. Executable markup, embedded documents, and CSS are not. */
export const UNSAFE_HTML = /<\s*\/?\s*(?:script|iframe|object|embed|style|link|meta|base|svg|math|form|input|button)\b|\bon[a-z]+\s*=|\bstyle\s*=|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i

export function isOfflineImage(value: string): boolean {
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
}
