# Matchbook

Desktop scouting app for FIRST Robotics Competition teams. Works offline at events, handles scout assignments, and syncs data between devices.

[Download the latest release](https://github.com/rishanreddy/matchbook/releases/latest)

## What it does

- Import event schedules from The Blue Alliance
- Assign scouts to specific matches
- Collect match data using custom forms
- Sync data between devices (QR codes, network, or CSV export)
- Analyze team performance for alliance selection

## Installation

Download the installer for your platform from the [releases page](https://github.com/rishanreddy/matchbook/releases/latest):

- **Windows**: `.exe` installer (~150 MB)
- **macOS**: `.dmg` installer (~160 MB)
- **Linux**: `.AppImage` or `.deb` package (~140 MB)

## Getting started

First time setup:

1. Open Settings and add your TBA API key
2. Register your device as either "Hub" or "Scout"

**If you're the hub device:**

- Import your event from The Blue Alliance
- Create a scouting form in the Form Builder
- Assign scouts to matches

**If you're a scout device:**

- Open the Scout tab and start scouting
- Submit data back to the hub using QR codes or network sync

For the team lead: follow the [competition-day checklist](docs/competition-day.md) before each event. It covers hub setup, offline fallback, backups, sync recovery, releases, and rollback.

## How teams get scored

Matchbook does not know the rules of the current game, and every team builds its own
form, so scores are derived from what your form collected. A question counts toward a
phase based on how its **name** starts:

| Question name starts with | Counts toward |
| --- | --- |
| `auto` | Autonomous |
| `teleop` | Teleop |
| `endgame` or `climb` | Endgame |

A number answer contributes its value, a checked box contributes 1, and free text
contributes nothing. Questions named anything else are still collected and can still
be charted in Analysis, they just do not affect the ranking.

This is an activity count, not official FRC points. It is a consistent relative measure
for comparing teams, which is what alliance selection needs. If every observation
scores zero, Analysis says so rather than showing a ranking of tied teams.

## Shipping an update

Installed copies check GitHub for a new release on launch and show a banner when one
is found. Downloads are never automatic, so a laptop on a shared venue hotspot is not
pulled into a 150 MB transfer mid-event; the user chooses when to download and when to
restart.

To publish one:

1. Bump `version` in `package.json` and commit.
2. Tag it and push: `git tag v2.1.0 && git push origin v2.1.0`. The tag must match the
   `package.json` version or the release workflow stops before building anything.
3. GitHub Actions runs the release gates (`pnpm verify:production`), builds all three
   platforms, verifies the artifacts, and publishes the release.

Users see "Matchbook 2.1.0 is available" the next time they open the app, or they can
check from Settings.

Before publishing, CI checks that each `latest-*.yml` update manifest matches the
bytes of the artifacts beside it. A manifest left over from an earlier build would
otherwise ship a checksum that no longer matches, and every client would download the
update and then reject it. Local packaging (`pnpm build:mac`) wipes `release/` first
for the same reason.

**macOS caveat:** in-app updates on macOS only work if the build is signed with an
Apple Developer ID. Without the `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` repository secrets, the
workflow still produces a working `.dmg` but logs a warning, macOS users must
right-click > Open on first launch, and they have to install new versions by hand.
Windows and Linux updates work either way.

## Tech stack

Built with Electron, React, TypeScript, Mantine UI, and RxDB for offline-first data storage.

## Acknowledgments

This project was inspired in part by resources from [Lovat](https://learn.lovat.app/guides/welcome), which were useful in shaping ideas for Matchbook.

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

MIT
