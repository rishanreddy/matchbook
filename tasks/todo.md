# Production-readiness tasks

## Task 1: Test safety-critical pure logic

**Description:** Add the smallest compatible test setup and cover payload validation, chunk reconstruction, and collection registration behavior.

**Acceptance criteria:**
- [ ] Invalid/mismatched payloads are rejected.
- [ ] Every UI-offered network collection is server-supported.
- [ ] Tests run with one documented pnpm command.

**Verification:** Focused tests; `pnpm verify:production`.

**Dependencies:** None.

**Files likely touched:** `package.json`, sync utility/test files, collection registry.

**Estimated scope:** Medium.

## Task 2: Preserve data on database initialization failure

**Description:** Replace automatic cache deletion with a user-directed recovery flow that makes data loss impossible to trigger silently.

**Acceptance criteria:**
- [ ] A recoverable startup error does not clear IndexedDB automatically.
- [ ] The reset UI warns about unsynced records and requires explicit confirmation.
- [ ] Recovery behavior has regression coverage.

**Verification:** Focused tests; packaged/manual startup check; `pnpm verify:production`.

**Dependencies:** Task 1.

**Files likely touched:** database utility, startup/recovery UI, tests.

**Estimated scope:** Medium.

## Task 3: Unify network-sync collections

**Description:** Establish one typed source of truth for collections permitted in the network sync protocol and make all advertised options match it.

**Acceptance criteria:**
- [ ] A collection cannot be advertised unless the server validates and queues it.
- [ ] The server rejects all unregistered collections.
- [ ] Contract parity is tested.

**Verification:** Focused tests; hub import smoke check; `pnpm verify:production`.

**Dependencies:** Task 1.

**Files likely touched:** shared types/registry, sync server, Sync route, tests.

**Estimated scope:** Medium.

## Task 4: Secure and bound LAN sync

**Description:** Require a valid session token for hub uploads and ensure errors, body limits, and CORS handling do not produce crashes or false acknowledgements.

**Acceptance criteria:**
- [ ] Hub cannot start LAN upload service without a generated/entered token.
- [ ] Missing or invalid tokens receive no queue acknowledgement.
- [ ] Oversized/malformed requests do not crash the service.

**Verification:** Main-process integration tests; manual LAN upload; `pnpm verify:production`.

**Dependencies:** Tasks 1 and 3.

**Files likely touched:** sync server, shared/preload types, Sync route, tests.

**Estimated scope:** Medium.

## Task 5: Test durable incoming-sync processing

**Description:** Prove queue persistence and payload lifecycle so a hub restart, duplicate upload, malformed item, or import error does not lose valid scouting data.

**Acceptance criteria:**
- [ ] Queued valid data survives a hub restart.
- [ ] Processed records are acknowledged only after successful import.
- [ ] Failed records remain quarantined with a readable reason.

**Verification:** Integration tests; manual restart/import check.

**Dependencies:** Tasks 3 and 4.

**Files likely touched:** sync server, Sync route import helper/tests.

**Estimated scope:** Medium.

## Task 6: Validate event data flow on two devices

**Description:** Rehearse a complete disconnected scouting-to-hub workflow using two app instances and a representative sample form.

**Acceptance criteria:**
- [ ] Scout can create draft, submit record, restart, and retain it offline.
- [ ] Hub imports it exactly once and analysis can read it.
- [ ] A failed transfer is recoverable with the documented UI.

**Verification:** Written manual test evidence with screenshots/logs as appropriate.

**Dependencies:** Tasks 2–5.

**Files likely touched:** none unless a defect is found.

**Estimated scope:** Small.

## Task 7: Restore production package artwork

**Description:** Add the reviewed generated logo as a source asset and derive non-destructive platform-specific package icons.

**Acceptance criteria:**
- [ ] Every `electron-builder.yml` icon path exists.
- [ ] macOS, Windows, and Linux package builds resolve their icon assets.
- [ ] New asset is visually legible at dock/taskbar size.

**Verification:** Inspect outputs; `pnpm build:mac`; platform-specific package checks where available.

**Dependencies:** Human approval of generated mark.

**Files likely touched:** `resources/`, `build/`, `electron-builder.yml` only if paths change.

**Estimated scope:** Small.

## Task 8: Make tagged GitHub releases update-capable

**Description:** Align package publishing and GitHub Actions so a semantic-version tag yields released installers plus electron-updater manifests that installed clients can discover.

**Acceptance criteria:**
- [ ] Release is published, not left as a draft.
- [ ] Artifacts include the platform installer and matching updater manifest/blockmap files.
- [ ] Workflow fails visibly if a package artifact is missing.

**Verification:** Workflow dry-run/config review; tagged-release test in GitHub after user authorization.

**Dependencies:** Task 7.

**Files likely touched:** release workflow, package scripts, electron-builder config/tests.

**Estimated scope:** Medium.

## Task 9: Verify client update experience

**Description:** Validate the existing updater UI against a real published release and make failures actionable without blocking offline scouting.

**Acceptance criteria:**
- [ ] Update check reports current/updatable/error state accurately.
- [ ] Download/install never disrupts active scouting without user action.
- [ ] Local database survives an installed update.

**Verification:** Packaged-app update test from old version to release candidate.

**Dependencies:** Task 8 and a test release.

**Files likely touched:** main updater handlers, Settings UI/tests if defects are found.

**Estimated scope:** Medium.

## Task 10: Write pit-day operating checklist

**Description:** Document the minimum reliable operating procedure and emergency recovery for the event crew.

**Acceptance criteria:**
- [ ] Covers setup, periodic backup, sync token, no-internet operation, failed-sync recovery, and update rollback.

**Verification:** Follow checklist on the two-device rehearsal.

**Dependencies:** Task 6.

**Files likely touched:** README or dedicated event guide.

**Estimated scope:** Small.
