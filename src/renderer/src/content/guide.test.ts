import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { guide, type GuideTask } from './guide'
import { GUIDE_IMAGES } from './guideImages'

const allTasks: GuideTask[] = [...guide.scoutTasks, ...guide.leadTasks]

function allStrings(): string[] {
  const strings: string[] = []
  for (const task of allTasks) {
    strings.push(task.title, task.summary, task.tip ?? '')
    task.images.forEach((image) => strings.push(image.alt, image.caption))
    task.steps.forEach((step) => strings.push(step.text, step.detail ?? ''))
  }
  guide.troubleshooting.forEach((item) => strings.push(item.question, ...item.answer))
  guide.glossary.forEach((item) => strings.push(item.term, item.meaning))
  return strings
}

describe('how-to guide content', () => {
  it('has something for both kinds of user', () => {
    expect(guide.scoutTasks.length).toBeGreaterThanOrEqual(4)
    expect(guide.leadTasks.length).toBeGreaterThanOrEqual(4)
    expect(guide.troubleshooting.length).toBeGreaterThanOrEqual(6)
  })

  it('gives every task at least one step and a picture', () => {
    for (const task of allTasks) {
      expect(task.steps.length, task.id).toBeGreaterThan(0)
      expect(task.images.length, task.id).toBeGreaterThan(0)
    }
  })

  it('only refers to screenshots that exist', () => {
    for (const task of allTasks) {
      for (const image of task.images) {
        expect(Object.keys(GUIDE_IMAGES), `${task.id} -> ${image.key}`).toContain(image.key)
        expect(GUIDE_IMAGES[image.key], image.key).toMatch(/\.webp$|^data:/)
        expect(image.alt.length, `${task.id} needs alt text for screen readers`).toBeGreaterThan(20)
      }
    }
  })

  it('has unique ids, so accordion sections do not collide', () => {
    const ids = [...allTasks.map((task) => task.id), ...guide.troubleshooting.map((item) => item.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('closes every bold marker it opens', () => {
    for (const text of allStrings()) {
      expect((text.match(/\*\*/g) ?? []).length % 2, text).toBe(0)
    }
  })

  it('stays away from developer vocabulary a first-time scout would not know', () => {
    const jargon = /\b(collection|schema|payload|token|json|database|snapshot|localhost|port \d|http)/i
    for (const text of allStrings()) {
      expect(text, 'jargon in guide text').not.toMatch(jargon)
    }
  })

  it('names buttons and screens exactly as the app spells them', () => {
    // A rename in the app must fail here rather than leave the guide quietly wrong.
    // Labels that do not live in this app (the operating system, SurveyJS's own buttons,
    // the Blue Alliance website, keys, and words that are only bolded for emphasis) are
    // listed so that everything else has to be found in the source.
    const notInThisApp = new Set([
      '-', '0', '1', '1.', '2.', '3.', 'I', 'O', 'Ctrl', 'Command', 'Esc', '☰',
      'Complete', 'Next', 'Yes', 'No', 'Camera', 'Allow', 'Allow access', 'Private networks',
      'System Settings', 'Privacy & Security', 'Privacy & security', 'Let desktop apps access your camera',
      'On a Mac:', 'On Windows:', 'Account', 'Read API Key', 'Matchbook',
      'auto', 'teleop', 'endgame', 'before', 'code', 'sending', 'receiving',
    ])

    const root = path.join(process.cwd(), 'src', 'renderer', 'src')
    const source = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => /\.(tsx?|ts)$/.test(file) && !file.startsWith('content') && !/\.test\./.test(file))
      .map((file) => readFileSync(path.join(root, file), 'utf8'))
      .join('\n')

    const labels = allStrings()
      .flatMap((text) => Array.from(text.matchAll(/\*\*([^*]+)\*\*/g), (match) => match[1]))
      .flatMap((label) => label.split(', '))
      .filter((label) => !notInThisApp.has(label))

    const missing = Array.from(new Set(labels)).filter((label) => !source.includes(label))
    expect(missing, 'guide names things the app does not say').toEqual([])
  })
})
