import { LIMITS } from './formRules'

export type ExtractResult =
  | {
      ok: true
      /** The form as an object, before it is checked. */
      value: Record<string, unknown>
      /** True when the JSON needed small repairs (comments, trailing commas, curly quotes). */
      repaired: boolean
    }
  | { ok: false; reason: string }

type Parsed = { value: unknown; repaired: boolean }

const CURLY_OPEN = '\u201c'
const CURLY_CLOSE = '\u201d'

/**
 * Fixes the mistakes chat assistants most often make when writing JSON: comments, commas before
 * a closing bracket, and curly quotation marks used as JSON quotes. Text inside strings is never
 * touched.
 */
export function cleanJson(text: string): string {
  let withoutComments = ''
  let stringEnd: string | null = null

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (stringEnd !== null) {
      if (character === '\\') {
        withoutComments += character + (text[index + 1] ?? '')
        index += 1
      } else if (character === stringEnd || (stringEnd === CURLY_CLOSE && character === '"')) {
        withoutComments += '"'
        stringEnd = null
      } else {
        withoutComments += character
      }
      continue
    }

    if (character === '"') {
      withoutComments += character
      stringEnd = '"'
    } else if (character === CURLY_OPEN || character === CURLY_CLOSE) {
      withoutComments += '"'
      stringEnd = CURLY_CLOSE
    } else if (character === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') {
        index += 1
      }
      withoutComments += '\n'
    } else if (character === '/' && text[index + 1] === '*') {
      const close = text.indexOf('*/', index + 2)
      index = close === -1 ? text.length : close + 1
    } else {
      withoutComments += character
    }
  }

  let cleaned = ''
  let inString = false
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index]

    if (inString) {
      cleaned += character
      if (character === '\\') {
        cleaned += withoutComments[index + 1] ?? ''
        index += 1
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      cleaned += character
    } else if (character === ',') {
      let lookahead = index + 1
      while (lookahead < withoutComments.length && /\s/.test(withoutComments[lookahead])) {
        lookahead += 1
      }
      if (withoutComments[lookahead] !== '}' && withoutComments[lookahead] !== ']') {
        cleaned += character
      }
    } else {
      cleaned += character
    }
  }

  return cleaned
}

function tryParse(text: string): Parsed | null {
  try {
    return { value: JSON.parse(text), repaired: false }
  } catch {
    // Fall through to the repaired attempt.
  }

  const cleaned = cleanJson(text)
  if (cleaned === text) {
    return null
  }

  try {
    return { value: JSON.parse(cleaned), repaired: true }
  } catch {
    return null
  }
}

/** The bodies of ``` code blocks, including a last block the reply was cut off before closing. */
function codeBlocks(text: string): string[] {
  const blocks: string[] = []
  const pattern = /```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)(?:```|$)/g
  for (const match of text.matchAll(pattern)) {
    blocks.push(match[1].trim())
  }
  return blocks
}

/** Every outermost `{ ... }` in the text, found by matching brackets rather than by guessing. */
function topLevelObjects(text: string): string[] {
  const found: string[] = []
  let depth = 0
  let start = -1
  let inString = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (inString) {
      if (character === '\\') {
        index += 1
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = depth > 0
    } else if (character === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
    } else if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start !== -1) {
        found.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }

  return found
}

const WRAPPER_KEYS = ['form', 'survey', 'surveyJson', 'json', 'schema']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Finds the form inside what was parsed: the object itself, a list of pages, or one wrapped in a key. */
function findForm(value: unknown, depth = 0): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => isRecord(item) && Array.isArray(item.elements))) {
      return { pages: value }
    }
    if (value.length > 0 && value.every((item) => isRecord(item) && typeof item.type === 'string')) {
      return { pages: [{ name: 'page1', elements: value }] }
    }
    return null
  }

  if (!isRecord(value)) {
    return null
  }

  if (Array.isArray(value.pages) || Array.isArray(value.elements)) {
    return value
  }

  if (depth >= 2) {
    return null
  }

  for (const key of WRAPPER_KEYS) {
    const inner = findForm(value[key], depth + 1)
    if (inner) {
      return inner
    }
  }

  const keys = Object.keys(value)
  return keys.length === 1 ? findForm(value[keys[0]], depth + 1) : null
}

function looksCutOff(text: string): boolean {
  const opens = (text.match(/[{[]/g) ?? []).length
  const closes = (text.match(/[}\]]/g) ?? []).length
  return opens > closes + 1 || /```[a-zA-Z0-9_-]*[ \t]*\r?\n(?![\s\S]*```)/.test(text)
}

/**
 * Finds the scouting form in whatever was pasted.
 *
 * People paste the AI's whole last message: a sentence, then a code block, then another
 * sentence. The last code block that holds a form wins, since assistants put the final
 * version at the end. Plain JSON with no code block works too.
 */
export function extractFormJson(reply: string): ExtractResult {
  const text = reply.replace(/^\uFEFF/, '')

  if (text.trim().length === 0) {
    return { ok: false, reason: 'Paste the AI’s reply here.' }
  }

  if (new TextEncoder().encode(text).byteLength > LIMITS.maxBytes) {
    return { ok: false, reason: 'That is far too long to be a scouting form. Paste only the AI’s reply that contains the form.' }
  }

  const candidates: string[] = [...codeBlocks(text).reverse()]
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.push(trimmed)
  }
  candidates.push(...topLevelObjects(text).reverse())

  let foundJson = false
  for (const candidate of new Set(candidates)) {
    const parsed = tryParse(candidate)
    if (!parsed) {
      continue
    }

    foundJson = true
    const form = findForm(parsed.value)
    if (form) {
      return { ok: true, value: form, repaired: parsed.repaired }
    }
  }

  if (foundJson) {
    return { ok: false, reason: 'I found JSON, but it is not a scouting form. A form has a list called "pages" with the questions inside.' }
  }

  if (looksCutOff(text)) {
    return {
      ok: false,
      reason: 'The JSON looks cut off. Ask the AI to send the whole form again in one code block, then paste that.',
    }
  }

  return {
    ok: false,
    reason: 'I could not find a form in that. Copy the AI’s last message, the one with the form in a code block, and paste all of it.',
  }
}
