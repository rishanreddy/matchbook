/**
 * Fills the generated blocks in README.md from the repo itself.
 *
 * Anything in the README that restates a fact already living in the code will drift
 * the moment someone adds a route or bumps a dependency. Those spots are marked with
 * `<!-- generated:NAME -->` / `<!-- /generated:NAME -->` and rewritten from source
 * here instead of by hand.
 *
 *   node scripts/sync-readme.mjs          rewrite the blocks
 *   node scripts/sync-readme.mjs --check  fail if they are stale (used by CI)
 *
 * Release version, download links and file sizes are deliberately NOT generated.
 * They are dynamic badges and a link to /releases/latest, so they never go stale and
 * never need a commit.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const README = resolve('README.md')

const HUB_ONLY = new Set(['EventManagement', 'Assignments', 'FormBuilder', 'Analysis'])
const DEV_ONLY = new Set(['DeveloperTools'])

const SCREEN_BLURBS = {
  Home: 'Event selection and what to do next',
  Scout: 'Record one robot for one match',
  EventManagement: 'Import events and schedules from The Blue Alliance',
  Assignments: 'Decide which scout covers which match',
  FormBuilder: 'Build the questions your scouts answer',
  Analysis: 'Compare teams and build a picklist',
  Sync: 'Move data between laptops',
  DeviceSetup: 'Name this laptop and set it as hub or scout',
  Settings: 'TBA key, shortcuts, updates',
  Help: 'In-app guidance',
  DeveloperTools: 'Database inspection, hidden unless developer mode is on',
}

async function screens() {
  const files = await readdir(resolve('src/renderer/src/routes'))
  const names = files.filter((f) => f.endsWith('.tsx')).map((f) => f.replace('.tsx', '')).sort()

  const rows = names.map((name) => {
    const label = name.replace(/([a-z])([A-Z])/g, '$1 $2')
    const where = DEV_ONLY.has(name) ? 'Developer' : HUB_ONLY.has(name) ? 'Hub' : 'Both'
    return `| ${label} | ${where} | ${SCREEN_BLURBS[name] ?? ''} |`
  })

  return ['| Screen | Shown on | What it does |', '|---|---|---|', ...rows].join('\n')
}

async function collections() {
  const src = await readFile(resolve('src/shared/syncProtocol.ts'), 'utf8')
  const block = src.match(/NETWORK_SYNC_COLLECTIONS = \[([^\]]+)\]/)
  if (!block) {
    throw new Error('Could not find NETWORK_SYNC_COLLECTIONS in src/shared/syncProtocol.ts')
  }

  const names = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  const pretty = names.map((n) => n.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
  return pretty.map((n) => `\`${n}\``).join(', ')
}

async function stack() {
  const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
  const major = (range) => (range ?? '').replace(/^[^0-9]*/, '').split('.')[0]
  const parts = [
    `Electron ${major(pkg.devDependencies.electron)}`,
    `React ${major(pkg.dependencies.react)}`,
    `TypeScript ${major(pkg.devDependencies.typescript)}`,
    `RxDB ${major(pkg.dependencies.rxdb)}`,
    'Mantine',
    'Vite',
  ]
  return parts.join(', ')
}

const BLOCKS = { screens, collections, stack }

let readme = await readFile(README, 'utf8')
const original = readme

for (const [name, build] of Object.entries(BLOCKS)) {
  const open = `<!-- generated:${name} -->`
  const close = `<!-- /generated:${name} -->`
  const pattern = new RegExp(`${open}[\\s\\S]*?${close}`)

  if (!pattern.test(readme)) {
    throw new Error(`README.md is missing the ${open} ... ${close} block.`)
  }

  readme = readme.replace(pattern, `${open}\n${await build()}\n${close}`)
}

if (process.argv.includes('--check')) {
  if (readme !== original) {
    console.error('README.md is out of date with the source it documents.')
    console.error('Run `pnpm docs:sync` and commit the result.')
    process.exit(1)
  }

  console.log('README.md generated blocks are up to date.')
} else {
  if (readme === original) {
    console.log('README.md already up to date.')
  } else {
    await writeFile(README, readme)
    console.log('README.md updated from source.')
  }
}
