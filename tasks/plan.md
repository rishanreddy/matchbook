# Implementation Plan: Matchbook production-readiness release

## Overview

Stabilize the existing offline-first Electron application for imminent event use. The order is deliberately data safety first, then safe local-network sync, then release/updater delivery, visual packaging, and finally a documented event rehearsal.

## Architecture decisions

- Keep RxDB/Dexie as the local, offline source of truth; do not introduce cloud storage.
- Treat local-network sync input as untrusted, even on a team network. Require a short per-session token and limit payload sizes and collections.
- Use a single collection registry shared by renderer and main-process sync code so the UI cannot advertise data that the server rejects.
- Replace automatic cache deletion with a non-destructive recovery path. A destructive reset remains an explicit last resort with backup/export guidance.
- Publish updates through GitHub Releases using electron-builder-compatible update manifests. A release must be public/published before clients can discover it.

## Dependency graph

```text
Persistent local data safety
  └─> Sync contract + import validation
        └─> Regression tests + offline rehearsal

Package assets + release workflow
  └─> GitHub update manifests
        └─> packaged-app update test
```

## Task list

### Phase 1: Data safety

- [ ] Task 1: Add a test runner and focused regression tests for pure sync/import validation.
- [ ] Task 2: Remove automatic destructive database recovery; present safe recovery instructions and retain explicit reset only.
- [ ] Task 3: Make the renderer and main-process network-sync collection contracts identical.

### Checkpoint: Data safety

- [ ] Fresh and existing databases initialize without silent deletion.
- [ ] Accepted/rejected payload behavior is regression-tested.
- [ ] `pnpm verify:production` passes.

### Phase 2: Reliable local sync

- [ ] Task 4: Enforce per-session LAN sync authentication and safe request handling.
- [ ] Task 5: Test queue persistence, acknowledgement, quarantine, and idempotent import behavior.
- [ ] Task 6: Perform two-device offline/LAN sync rehearsal with a real scouting payload.

### Checkpoint: Event workflow

- [ ] Scout records survive app restart before transfer.
- [ ] Hub receives each supported data type once, rejects invalid input, and preserves failed payloads for recovery.

### Phase 3: Package and updates

- [ ] Task 7: Place the generated Matchbook icon in the project and derive macOS, Windows, Linux, and installer assets.
- [ ] Task 8: Correct the GitHub release workflow so artifacts and update manifests publish to a non-draft versioned release.
- [ ] Task 9: Add updater status/error handling tests and exercise check/download/install in a packaged app.

### Checkpoint: Release candidate

- [ ] Every package asset referenced by electron-builder exists.
- [ ] A tagged release yields discoverable updater metadata and installable artifacts.
- [ ] A previous packaged build updates while preserving local database records.

### Phase 4: Competition handoff

- [ ] Task 10: Write a short pit-day checklist: hub setup, scout setup, token sharing, backup/export cadence, sync recovery, and rollback.
- [ ] Task 11: Run full release gates and record exact results/known limitations.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Automatic cache reset loses unsynced scouting | Critical | Remove automatic deletion; provide explicit backup/reset path |
| Sync UI/server mismatch drops data | Critical | Shared registry plus regression tests and two-device rehearsal |
| Draft or unsigned GitHub artifacts cannot update clients | High | Publish non-draft release/manifests and package-test before release |
| Deleted build icons break packaging | High | Restore all configured assets from one reviewed source image |
| No test suite catches release regressions | High | Add small, deterministic tests around safety-critical code |
| Large renderer bundles delay first load | Medium | Defer non-critical code splitting until after reliability gates unless startup smoke test shows a real issue |

## Open questions

See the platform, trust-model, and scope questions in `production-readiness-spec.md`.
