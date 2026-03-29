# Offline Scouting Manager - Developer Guide

## Architecture Overview

### Tech stack
- **Desktop runtime:** Electron
- **UI:** React + TypeScript + Mantine
- **Routing:** React Router
- **State:** Zustand
- **Local data:** RxDB (LocalStorage storage plugin + AJV validation)
- **Forms:** SurveyJS Creator + SurveyJS runtime
- **Charts/analysis:** Recharts

### Project structure
- `src/routes/*` - feature pages
- `src/components/*` - shared UI components
- `src/lib/db/*` - RxDB setup, collections, schemas, hooks, migrations
- `src/lib/api/*` - external API clients (TBA)
- `src/lib/utils/*` - helpers (logging, errors, scoring, sync)
- `electron/main.ts` - Electron main process, app lifecycle, updater IPC
- `electron/preload.ts` - secure renderer bridge API

### Data flow
1. Renderer UI triggers operations (route components).
2. Data persists in RxDB collections.
3. TBA imports populate events/matches.
4. Scout form submissions append `scoutingData` rows.
5. Sync page exports/imports data via network, QR, CSV, or DB snapshot.

---

## Setup Instructions

### Prerequisites
- Node.js 20+
- pnpm 9+

### Installation
```bash
pnpm install
```

### Environment variables
- `VITE_DEV_SERVER_URL` (set automatically by vite-plugin-electron in dev)
- Add additional `.env` values as needed for future backend sync integrations.

---

## Development Workflow

### Run dev server
```bash
pnpm dev
pnpm electron:dev
```

### Build
```bash
pnpm build
pnpm electron:build
```

### Testing
- No dedicated automated test suite is currently wired.
- Use targeted manual test passes on: events import, assignments, scouting submit, sync import/export.

### Linting
```bash
pnpm lint
```

---

## Database Schema

RxDB collections are registered in `src/lib/db/collections.ts`.

### Collections
- `events`
- `devices`
- `scouts`
- `matches`
- `assignments`
- `formSchemas`
- `scoutingData`

### Schema definitions
See:
- `src/lib/db/schemas/events.schema.ts`
- `src/lib/db/schemas/devices.schema.ts`
- `src/lib/db/schemas/scouts.schema.ts`
- `src/lib/db/schemas/matches.schema.ts`
- `src/lib/db/schemas/assignments.schema.ts`
- `src/lib/db/schemas/formSchemas.schema.ts`
- `src/lib/db/schemas/scoutingData.schema.ts`

### Migrations
- Current schema versions are `version: 0`.
- Migration placeholder exists at `src/lib/db/utils/migrations.ts` (`emptyMigrationStrategies`).

---

## API Integration

### TBA API client
- Located in `src/lib/api/tba.ts`
- Used by Event Management and setup connectivity tests.

### Rate limiting
- Current implementation relies on client request discipline.
- Add request throttling/backoff wrapper for production scale.

### Error handling
- Centralized helpers in `src/lib/utils/errorHandler.ts`
- User-facing failures surfaced via Mantine notifications.

---

## Sync System

### RxDB replication
- Network replication UI is scaffolded in `src/routes/Sync.tsx`.
- Planned: CouchDB-compatible replication endpoint.

### Conflict resolution
- Duplicate detection commonly uses `syncHash` (especially `scoutingData`).
- Imports skip duplicates and preserve local records.

### Sync methods
- Network hub/spoke (staged)
- QR chunk transport
- CSV import/export
- Full DB JSON snapshot merge

---

## Adding Features

### Creating new routes
1. Add route component in `src/routes/`.
2. Register route and nav item in `src/App.tsx`.

### Adding components
- Place reusable components under `src/components/`.
- Keep route components focused on orchestration/state.

### Database operations
- Use `useDatabaseStore` and collection methods (`find`, `insert`, `upsert`).
- Keep `scoutingData` append-only in app logic.

### API calls
- Add API methods in `src/lib/api/`.
- Wrap network calls with retries and user-facing notifications.

---

## Building for Production

### Electron packaging
```bash
pnpm electron:pack
pnpm electron:dist
```

### Code signing (future)
- Add platform-specific signing certificates and electron-builder config.

### Auto-updates
- Managed via `electron-updater`.
- IPC handlers in `electron/main.ts`; renderer listeners in `Settings` route.

---

## API Documentation (Extension/Integration Surface)

### IPC handlers
Defined in `electron/main.ts` + `electron/database.ts` and exposed through `electron/preload.ts`:
- `app:get-version`
- `app:get-platform`
- `app:ping`
- `check-for-updates`
- `download-update`
- `install-update`
- `db:initialize`
- `db:query`
- `db:insert`
- `db:update`
- `db:delete`
- `db:sync`

Typed bridge interface: `src/types/electron.d.ts`.

### RxDB schema for extensions
- Extension code should respect collection schemas in `src/lib/db/schemas/*`.
- Prefer app-level helpers/utilities over direct schema mutation.

### Hook usage
- RxDB hooks:
  - `src/lib/db/hooks/useRxDB.ts`
  - `src/lib/db/hooks/useRxCollection.ts`
  - `src/lib/db/hooks/useRxDocument.ts`

---

## Contributing Guidelines

### Code style
- TypeScript strictness and readable, explicit types
- Consistent Mantine component patterns
- Keep side effects in hooks/callbacks, avoid inline complex logic in JSX

### Commit messages
- Prefer imperative style: `add`, `update`, `fix`, `refactor`, `docs`
- Include concise rationale (why)

### Pull requests
- Keep PRs focused and scoped
- Include screenshots for UI changes
- Document manual verification steps and known trade-offs
