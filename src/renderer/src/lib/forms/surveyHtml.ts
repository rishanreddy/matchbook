import DOMPurify from 'dompurify'
import type { Model } from 'survey-core'

/** Permit offline formatting without scripts, embedded media or CSS. */
export function sanitizeSurveyHtml(html: string): string {
  if (!DOMPurify.isSupported) return html.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'div', 'span', 'pre', 'code', 'blockquote', 'hr', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['colspan', 'rowspan', 'scope', 'title', 'aria-label'],
    ALLOW_DATA_ATTR: false,
  })
}

const protectedSurveys = new WeakSet<Model>()
export function protectSurveyHtml(model: Model): void {
  if (protectedSurveys.has(model)) return
  protectedSurveys.add(model)
  // onProcessHtml runs BEFORE answer substitution in this SurveyJS version. Sanitize
  // the final return value so an interpolated answer cannot introduce executable HTML.
  const processHtml = model.processHtml.bind(model)
  model.processHtml = (html, reason) => sanitizeSurveyHtml(processHtml(html, reason))
  // Titles, descriptions and choice labels use the Markdown rendering hook after
  // substitution. This also supports simple rich text without a remote Markdown plugin.
  const renderMarkdown = model.getSurveyMarkdownHtml.bind(model)
  model.getSurveyMarkdownHtml = (element, text, name, item) => {
    const html = renderMarkdown(element, text, name, item)
    return html ? sanitizeSurveyHtml(html) : /<\s*\/?\s*[a-zA-Z!]/.test(text) ? sanitizeSurveyHtml(text) : html
  }
}
