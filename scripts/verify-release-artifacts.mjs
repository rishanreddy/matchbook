import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const platform = process.argv[2]
const version = JSON.parse(await readFile(resolve('package.json'), 'utf8')).version
const expectedByPlatform = {
  linux: [
    (file) => file.includes(version) && file.endsWith('.AppImage'),
    (file) => file.startsWith('latest-linux') && file.endsWith('.yml'),
  ],
  mac: [
    (file) => file.includes(version) && file.endsWith('.dmg'),
    (file) => file.includes(version) && file.endsWith('.zip'),
    (file) => file === 'latest-mac.yml',
  ],
  win: [
    (file) => file.includes(version) && file.endsWith('-Setup.exe'),
    (file) => file === 'latest.yml',
  ],
}

if (!Object.hasOwn(expectedByPlatform, platform)) {
  throw new Error('Usage: node scripts/verify-release-artifacts.mjs <linux|mac|win>')
}

const releaseDirectory = resolve('release')
const files = await readdir(releaseDirectory)
const missing = expectedByPlatform[platform].filter((matches) => !files.some(matches))

if (missing.length > 0) {
  throw new Error(`Missing required ${platform} release artifact(s). Found: ${files.join(', ')}`)
}

console.log(`Verified ${platform} release artifacts: ${files.join(', ')}`)
