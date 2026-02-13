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

# Run the app (production)
uv run main.py

# Run in development mode
uv run main.py --dev

# Allow LAN access (optional)
uv run main.py --lan
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
- Form fields and data types

## Usage

1. Fill out scouting forms during matches
2. Data saves to `data/scouting_data.csv`
3. Export CSV to USB drive
4. Import CSVs from all scouting devices on the Analysis page
5. View combined data from all scouts

## Tech Stack

- Flask + Jinja2
- Bootstrap 5 (offline local assets)
- YAML for config
