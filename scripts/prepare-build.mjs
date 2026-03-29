import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const artifacts = ['release', 'dist', 'dist-electron']

await Promise.all(
  artifacts.map(async (directory) => {
    await rm(path.join(rootDir, directory), { recursive: true, force: true })
  }),
)

const buildMetaDir = path.join(rootDir, 'build')
await mkdir(buildMetaDir, { recursive: true })

const timestamp = new Date().toISOString()
await writeFile(path.join(buildMetaDir, 'build-info.json'), JSON.stringify({ timestamp }, null, 2), 'utf8')

console.log(`Prepared build directories and metadata (${timestamp}).`)
