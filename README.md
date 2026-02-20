# Offline Scouting Manager

A Flask web app for robotics competition scouting that works completely offline. Built for FTC/FRC teams who need to collect match data on devices without internet access.

## What it does

- **Collect data**: Custom forms for recording match observations
- **Sync between devices**: Export/import CSV files via USB
- **Analyze results**: View and filter all scouting data in one place
- **Works offline**: No internet required

## Setup

Recommended (auto‑install deps):

```bash
# Mac/Linux
./scripts/setup.sh

# Windows
scripts\setup.bat
```

Manual:

```bash
uv sync

# Run the app (production with Waitress)
uv run main.py

# Run in development mode (auto-reload)
uv run main.py --dev

# Allow LAN access (bind to 0.0.0.0)
uv run main.py --lan

# Custom host/port
uv run main.py --host 0.0.0.0 --port 8080
```

Open `http://127.0.0.1:8080` in your browser.

## Build an executable

```bash
# Mac/Linux
./scripts/build_executable.sh

# Windows
scripts\build_executable.bat
```

Executable will be in `dist/`.

## Configuration

Use the **Setup Wizard** at `/setup` (auto‑launches on first run) or the **Settings** page to configure:

- Event name and season
- Device name (unique per laptop)
- Survey form using SurveyJS JSON format (or import setup file)

## Usage

1. Fill out scouting forms during matches
2. Data saves to `data/scouting_data.csv`
3. Export CSV to USB drive
4. Import CSVs from all scouting devices on the Analysis page
5. View combined data from all scouts

## Tech Stack

- Python 3.12+ with Flask + Waitress
- SurveyJS Form Library for dynamic forms
- Bootstrap 5 (offline local assets)
- YAML for config, CSV for data storage

## Recent Changes

See `RELEASE_NOTES.md` for the latest production-ready improvements including:
- Comprehensive code cleanup and bloat removal
- Enhanced UI/UX with warm-dark theme
- Improved reliability and error handling
- Better accessibility support
- JavaScript extracted from templates for maintainability

## Development

For contributing or making changes, see `AGENTS.md` for coding guidelines and `TESTING_CHECKLIST.md` for validation procedures.
