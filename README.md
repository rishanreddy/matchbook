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

## Tech stack

Built with Electron, React, TypeScript, Mantine UI, and RxDB for offline-first data storage.

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

MIT
