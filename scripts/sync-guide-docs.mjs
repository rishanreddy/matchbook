/**
 * Writes docs/how-to-guide.md from the in-app guide.
 *
 * The Help screen and this printable copy both come from
 * src/renderer/src/content/guide.json, so they cannot disagree. Edit that file, then:
 *
 *   node scripts/sync-guide-docs.mjs          rewrite the markdown
 *   node scripts/sync-guide-docs.mjs --check  fail if it is stale (used by CI)
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const GUIDE = resolve('src/renderer/src/content/guide.json')
const IMAGES = resolve('src/renderer/src/content/guideImages.ts')
const OUTPUT = resolve('docs/how-to-guide.md')

const guide = JSON.parse(await readFile(GUIDE, 'utf8'))
const imageSource = await readFile(IMAGES, 'utf8')
const imageFiles = Object.fromEntries(
  [...imageSource.matchAll(/import (\w+) from '\.\.\/assets\/guide\/([\w-]+\.webp)'/g)].map((match) => [match[1], match[2]]),
)

function imageLine(image) {
  const file = imageFiles[image.key]
  if (!file) {
    throw new Error(`guide.json refers to an image "${image.key}" that guideImages.ts does not import.`)
  }
  return `![${image.alt}](../src/renderer/src/assets/guide/${file})\n*${image.caption}*`
}

function taskSection(task, index) {
  const lines = [`### ${index + 1}. ${task.title}`, '', task.summary, '']
  for (const image of task.images) {
    lines.push(imageLine(image), '')
  }
  task.steps.forEach((step, stepIndex) => {
    lines.push(`${stepIndex + 1}. ${step.text}`)
    if (step.detail) {
      lines.push(`   ${step.detail}`)
    }
  })
  if (task.tip) {
    lines.push('', `> **Tip:** ${task.tip}`)
  }
  lines.push('')
  return lines.join('\n')
}

const parts = [
  '# How to use Matchbook',
  '',
  '<!-- Generated from src/renderer/src/content/guide.json by scripts/sync-guide-docs.mjs. Do not edit by hand. -->',
  '',
  'Step-by-step guides for people who have never used Matchbook. The same guide, with',
  'clickable pictures and two short videos, is in the app under **Help**.',
  '',
  '## For scouts',
  '',
  ...guide.scoutTasks.map(taskSection),
  '## For the lead scout',
  '',
  ...guide.leadTasks.map(taskSection),
  '## Something is not working',
  '',
  ...guide.troubleshooting.flatMap((item) => [`### ${item.question}`, '', ...item.answer.flatMap((paragraph) => [paragraph, '']), '']),
  '## Words we use',
  '',
  ...guide.glossary.map((item) => `- **${item.term}**: ${item.meaning}`),
  '',
]

const generated = parts.join('\n').replace(/\n{3,}/g, '\n\n')

if (process.argv.includes('--check')) {
  const current = await readFile(OUTPUT, 'utf8').catch(() => '')
  if (current !== generated) {
    console.error('docs/how-to-guide.md is stale. Run `pnpm docs:sync`.')
    process.exit(1)
  }
  console.log('docs/how-to-guide.md is up to date.')
} else {
  await writeFile(OUTPUT, generated)
  console.log('Wrote docs/how-to-guide.md')
}
