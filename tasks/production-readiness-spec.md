# Spec: Matchbook production-readiness release

## Objective

Prepare Matchbook for reliable FRC event use by tomorrow. Scouts must be able to collect data without internet access, move supported scouting data safely to a hub over a local network, preserve local records through routine failures and updates, and select an alliance from trustworthy analysis. Hub operators must be able to publish a signed, versioned GitHub release and installed apps must discover, download, and install that update without affecting local scouting data.

This release also replaces the missing packaging artwork with an original Matchbook application icon. The generated logo is a transparent robot-and-matchbook mark; it will be converted into platform-specific package icons only after this plan is approved.

## Current evidence

- `pnpm verify:production` passes after dependencies are installed.
- No test runner or automated tests currently exist.
- The package icon files referenced by `electron-builder.yml` are deleted in the working tree, so a fresh release cannot be treated as reproducible until replacement assets are committed.
- The renderer advertises network sync for `analysisConfigs`, but the main-process sync server accepts only `scoutingData`, `formSchemas`, and `events`; the two contracts must match before release.
- Database recovery may automatically clear a local cache on a recoverable initialization error. That is unsafe for an event device holding unsynced scouting records and must become explicit, backed-up, and user-confirmed.
- A GitHub release workflow and Electron auto-updater handlers exist, but release publication currently uses draft releases and `--publish never`; the end-to-end update manifest, published-release visibility, and install flow must be verified.

## Tech stack

Electron 41, React 19, TypeScript 5.9, RxDB/Dexie IndexedDB, Mantine, electron-builder, electron-updater, GitHub Releases, pnpm 10.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm verify:production
pnpm build:mac
pnpm build:win
pnpm build:linux
pnpm dev
```

Focused tests will be added as `pnpm test -- --runInBand` (or the equivalent script selected with the test runner). Production packages will be manually smoke-tested before tagging a release.

## Project structure

```text
src/main/                 Electron lifecycle, updater, local sync server
src/preload/              narrowly exposed renderer IPC API
src/renderer/src/lib/db/  offline RxDB/Dexie database and schemas
src/renderer/src/routes/  event, scouting, sync, and analysis workflows
src/shared/               typed main/preload/renderer contracts
build/                    package icons and installer artwork
.github/workflows/        signed/tagged release automation
tasks/                    this release spec and execution checklist
```

## Code style

Use strict TypeScript, explicit `unknown` at IPC/network boundaries, small pure validation functions, and outcome-oriented error messages. Persist data before acknowledging a sync upload.

```ts
function isValidSyncPayload(value: unknown): value is SyncPayload {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Partial<SyncPayload>
  return payload.count === payload.data?.length
}
```

## Testing strategy

- Unit tests: sync payload validation, collection-contract parity, update-channel/version utilities, and import duplicate/error behavior.
- Main-process integration tests: local sync server rejects invalid/authless requests, persists accepted data, and survives a restart.
- Renderer/manual smoke tests: first-run setup, draft recovery, offline scouting submission, export/import, incoming queue processing, analysis display, and update check in a packaged build.
- Release gates: typecheck, lint, production build, at least one platform package, and a clean-install update test from the previous release.

## Boundaries

- Always: preserve unsynced data; make destructive actions explicit and confirmed; keep scouting usable with no internet; validate untrusted sync input; run release gates before publishing.
- Ask first: changing the RxDB schema/database name, adding a dependency, deleting or migrating local data, publishing a GitHub release, or changing signing credentials.
- Never: send scouting data to an internet service, commit API keys/tokens, silently reset data, or claim cross-platform updates are verified without testing a packaged app on that platform.

## Success criteria

1. An event device can create and retain scouting records while offline, close/reopen the app, and recover a saved draft without loss.
2. Every collection shown as network-syncable is accepted, validated, queued durably, imported idempotently, and reported accurately; unsupported data is not presented as synced.
3. Database startup never silently deletes scouting data. Any reset clearly states the loss risk and requires deliberate confirmation.
4. The release workflow builds package artifacts and update manifests for the intended platforms, publishes a non-draft GitHub release, and the existing updater UI completes check/download/install on a packaged app.
5. All package icon references exist and the generated Matchbook mark is used consistently.
6. Automated tests, typecheck, lint, production build, package build, and documented offline smoke checks pass.

## Open questions

- Which platforms must be usable tomorrow: Windows only, Windows + macOS, or Windows + macOS + Linux? Code signing and update behavior differ by platform.
- Is the hub always on a trusted private FRC pit LAN? The plan will require a token for LAN sync; this is important because event networks may be shared.
- Do scouts need network syncing of assignments/match schedules, or is QR/CSV the intended transfer for those? The current sync UI does not expose those collections.
