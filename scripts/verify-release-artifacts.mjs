import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

/**
 * Gate on the contents of release/ before anything is published.
 *
 * This used to assert only that files with the right names existed. That is not
 * enough: `electron-builder --publish never` does not regenerate the update
 * manifest, so a release/ directory reused between builds keeps a latest-*.yml
 * pointing at a previous build's sha512. Clients would download the update and
 * then reject it on checksum, which is far harder to diagnose than a missing file.
 * The manifest is now checked against the bytes actually on disk.
 */

const platform = process.argv[2]
const version = JSON.parse(await readFile(resolve('package.json'), 'utf8')).version

const expectedByPlatform = {
  linux: {
    manifest: (file) => file.startsWith('latest-linux') && file.endsWith('.yml'),
    artifacts: [(file) => file.includes(version) && file.endsWith('.AppImage')],
  },
  mac: {
    manifest: (file) => file === 'latest-mac.yml',
    artifacts: [
      (file) => file.includes(version) && file.endsWith('.dmg'),
      (file) => file.includes(version) && file.endsWith('.zip'),
    ],
  },
  win: {
    manifest: (file) => file === 'latest.yml',
    artifacts: [(file) => file.includes(version) && file.endsWith('-Setup.exe')],
  },
}

if (!Object.hasOwn(expectedByPlatform, platform)) {
  throw new Error('Usage: node scripts/verify-release-artifacts.mjs <linux|mac|win>')
}

const releaseDirectory = resolve('release')
const files = await readdir(releaseDirectory)
const { manifest: matchesManifest, artifacts } = expectedByPlatform[platform]

const missing = artifacts.filter((matches) => !files.some(matches))
if (missing.length > 0) {
  throw new Error(`Missing required ${platform} release artifact(s). Found: ${files.join(', ')}`)
}

const manifestName = files.find(matchesManifest)
if (!manifestName) {
  throw new Error(`Missing ${platform} update manifest. Found: ${files.join(', ')}`)
}

const manifest = load(await readFile(resolve(releaseDirectory, manifestName), 'utf8'))

if (manifest.version !== version) {
  throw new Error(
    `${manifestName} declares version ${manifest.version} but package.json is ${version}. ` +
      'The manifest is stale; clean release/ and rebuild.',
  )
}

async function sha512Base64(fileName) {
  const hash = createHash('sha512')
  hash.update(await readFile(resolve(releaseDirectory, fileName)))
  return hash.digest('base64')
}

// Older manifests only carry the top-level `path`/`sha512` pair; newer ones also
// list every file. Check whatever the manifest actually claims.
const claims = [
  ...(Array.isArray(manifest.files) ? manifest.files : []),
  ...(manifest.path ? [{ url: manifest.path, sha512: manifest.sha512 }] : []),
]

if (claims.length === 0) {
  throw new Error(`${manifestName} lists no files to verify.`)
}

const seen = new Set()
for (const { url, sha512 } of claims) {
  if (!url || seen.has(url)) {
    continue
  }

  seen.add(url)

  if (!files.includes(url)) {
    throw new Error(`${manifestName} references ${url}, which is not in release/.`)
  }

  const actual = await sha512Base64(url)
  if (actual !== sha512) {
    throw new Error(
      `${manifestName} has a stale checksum for ${url}.\n` +
        `  manifest: ${sha512}\n  actual:   ${actual}\n` +
        'Auto-update would download this file and then reject it. Clean release/ and rebuild.',
    )
  }
}

// `--universal` is easy to accidentally remove while changing a release command.
// File names alone cannot tell an Intel-compatible macOS release from an ARM-only
// one, so inspect the app Electron Builder leaves beside the distributables.
if (platform === 'mac') {
  const executable = resolve(releaseDirectory, 'mac-universal', 'Matchbook.app', 'Contents', 'MacOS', 'Matchbook')
  const result = spawnSync('lipo', ['-archs', executable], { encoding: 'utf8' })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const architectures = stdout.trim().split(/\s+/).filter(Boolean)

  if (result.status !== 0 || !architectures.includes('x86_64') || !architectures.includes('arm64')) {
    throw new Error(
      `The macOS app must be universal (x86_64 and arm64). lipo reported: ${
        stderr.trim() || stdout.trim() || 'no architectures'
      }`,
    )
  }
}

console.log(
  `Verified ${platform} release ${version}: ${manifestName} matches ${seen.size} artifact(s) on disk.`,
)
