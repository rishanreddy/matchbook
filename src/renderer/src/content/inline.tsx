import type { ReactNode } from 'react'

/** Renders `**bold**` markers as <strong>. Guide text names on-screen buttons this way. */
export function renderInline(text: string): ReactNode[] {
  return text.split('**').map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))
}
