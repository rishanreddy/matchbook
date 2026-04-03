# Matchbook

Matchbook is a production-focused Electron desktop app for FRC scouting operations. It helps scouting teams run fully offline at events, collect match observations, assign scouts, and sync data through multiple transfer methods.

## Features

- **Guided onboarding wizard** for role selection, device registration, and TBA API validation
- **Device setup route** to update role/name after onboarding
- **Event import from The Blue Alliance** with stale match cleanup on re-sync
- **Scout assignment manager** with manual and auto-assign workflows
- **Assigned-scout and manual scouting entry flows**
- **Live scouting forms** powered by custom SurveyJS schemas
- **Form Builder** with single active schema enforcement
- **Sync tools**
  - Network sync (hub/spoke over LAN) with optional auth token
  - QR export/import
  - CSV export/import
  - Full database snapshot export/import
- **Analysis dashboard** for team-level review and picklist prep
- **Keyboard shortcuts + command palette** for fast operation
- **Settings and diagnostics** including logs and update checks

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install

```bash
pnpm install
```

### Run (Electron dev)

```bash
pnpm dev
```

### Configure for Event Use

1. Open `Settings` and add your TBA API key.
2. Open `Device Setup` and register this machine as `Hub` or `Scout`.
3. If Hub, import event data and publish an active form from `Form Builder`.
4. If Scout, open `Scout` and either start assigned entries or manual entries.

### Build

```bash
pnpm build

# Platform packages
pnpm build:win
pnpm build:mac
pnpm build:linux
```

### Verification

```bash
pnpm typecheck
pnpm lint
pnpm build:unpack
```

Build outputs are intentionally split for clarity:

- `out/renderer` - Vite React frontend bundle
- `out/main` - Electron main bundle
- `out/preload` - Electron preload bundle

This separation keeps desktop/runtime code and web UI output easy to inspect.

## Extension Points (Contributor Friendly)

- `src/renderer/src/config/brand.ts` - central app name/tagline/repo links
- `src/renderer/src/config/navigation.ts` - centralized nav structure and labels
- `src/renderer/src/config/routes.tsx` - route registry and hub-only route metadata
- `src/renderer/src/config/shortcuts.ts` - global shortcut bindings + help group definitions
- `src/renderer/src/features/command-center/` - command palette component + configurable command definitions
- `tailwind.config.cjs` + `postcss.config.cjs` - Tailwind + PostCSS styling pipeline

Add new features under `src/renderer/src/features/<feature-name>/` to keep app logic modular and easy to extend.

## Documentation

- Architecture and extension guide: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- Project architecture and coding guidelines: [AGENTS.md](./AGENTS.md)
- Runtime and build configuration: [`electron-builder.yml`](./electron-builder.yml), [`electron.vite.config.ts`](./electron.vite.config.ts)
- Security policy: [SECURITY.md](./SECURITY.md)
- Support guide: [SUPPORT.md](./SUPPORT.md)

## License

Distributed under the [MIT License](./LICENSE).

## Credits

- Built with Electron, React, TypeScript, Mantine, RxDB, and SurveyJS
- FRC event and match data from [The Blue Alliance](https://www.thebluealliance.com/)
