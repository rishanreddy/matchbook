import guideData from './guide.json'
import type { GuideImageKey } from './guideImages'

export type GuideImage = {
  key: GuideImageKey
  alt: string
  caption: string
}

export type GuideStep = {
  /** `**bold**` marks the name of something on screen. */
  text: string
  detail?: string
}

export type GuideTask = {
  id: string
  title: string
  summary: string
  images: GuideImage[]
  steps: GuideStep[]
  tip?: string
}

export type TroubleshootingItem = {
  id: string
  question: string
  answer: string[]
}

export type GlossaryItem = {
  term: string
  meaning: string
}

type GuideContent = {
  scoutTasks: GuideTask[]
  leadTasks: GuideTask[]
  troubleshooting: TroubleshootingItem[]
  glossary: GlossaryItem[]
}

export const guide = guideData as GuideContent
