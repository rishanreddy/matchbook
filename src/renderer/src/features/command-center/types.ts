import type { ReactElement } from 'react'

export type CommandItem = {
  id: string
  label: string
  keywords: string
  category: string
  action: () => void
  icon?: ReactElement
  shortcut?: string
}
