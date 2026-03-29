# Offline Scouting Manager

Offline Scouting Manager is a production-focused Electron desktop app for FRC scouting operations. It helps scouting teams run fully offline at events, collect match observations, assign scouts, and sync data through multiple transfer methods.

## Features

- **First-run setup wizard** for device naming and TBA key setup
- **Event import from The Blue Alliance** (events, teams, and matches)
- **Scout assignment manager** with manual and auto-assign workflows
- **Live scouting forms** powered by custom SurveyJS schemas
- **Quick match actions** (No Show / Broken Robot)
- **Form Builder** with event-scoped schema versioning
- **Sync tools**
  - Network sync (hub/spoke flow; backend integration staged)
  - QR export/import
  - CSV export/import
  - Full database snapshot export/import
- **Analysis dashboard** for team-level review and picklist prep
- **Keyboard shortcuts + command palette** for fast operation
- **Settings and diagnostics** including logs and update checks

## Screenshots (Placeholders)

> Replace these placeholders with real screenshots before release.

- `[Screenshot Placeholder] Home dashboard`
- `[Screenshot Placeholder] Event management and import`
- `[Screenshot Placeholder] Scout form in-match workflow`
- `[Screenshot Placeholder] Sync page (QR + CSV + DB)`
- `[Screenshot Placeholder] Analysis page and picklist tools`

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
pnpm install
```

### Run (web renderer)

```bash
pnpm dev
```

### Run (Electron mode)

```bash
pnpm electron:dev
```

### Build

```bash
pnpm build
pnpm electron:build
```

## Documentation

- **User manual:** [USER_GUIDE.md](./USER_GUIDE.md)
- **Developer guide:** [DEVELOPER.md](./DEVELOPER.md)
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

## License

Distributed under the [MIT License](./LICENSE).

## Credits

- Built with Electron, React, TypeScript, Mantine, RxDB, and SurveyJS
- FRC event and match data from [The Blue Alliance](https://www.thebluealliance.com/)
