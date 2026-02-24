# Offline Scouting Manager

<p align="center">
  A practical, offline-first scouting app for FRC/FTC teams.<br>
  Built for real match days where Wi-Fi is unreliable and speed matters.
</p>

<p align="center">
  <a href="https://github.com/rishanreddy/Offline_Scouting_Manager/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/rishanreddy/Offline_Scouting_Manager?display_name=tag&sort=semver&style=for-the-badge"></a>
  <a href="https://github.com/rishanreddy/Offline_Scouting_Manager/releases"><img alt="Total Downloads" src="https://img.shields.io/github/downloads/rishanreddy/Offline_Scouting_Manager/total?style=for-the-badge"></a>
  <a href="https://github.com/rishanreddy/Offline_Scouting_Manager/releases/latest"><img alt="Latest Downloads" src="https://img.shields.io/github/downloads/rishanreddy/Offline_Scouting_Manager/latest/total?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/rishanreddy/Offline_Scouting_Manager/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/rishanreddy/Offline_Scouting_Manager?style=flat-square"></a>
  <a href="https://github.com/rishanreddy/Offline_Scouting_Manager/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/rishanreddy/Offline_Scouting_Manager?style=flat-square"></a>
  <a href="https://github.com/rishanreddy/Offline_Scouting_Manager/issues"><img alt="Issues" src="https://img.shields.io/github/issues/rishanreddy/Offline_Scouting_Manager?style=flat-square"></a>
  <img alt="Last Commit" src="https://img.shields.io/github/last-commit/rishanreddy/Offline_Scouting_Manager?style=flat-square">
</p>

---

## What this software does

Offline Scouting Manager helps a scouting crew collect match observations on multiple devices, sync them with CSV, and review combined data in one place.

No cloud account required. No internet requirement during operation.

### Core features

- Custom SurveyJS scouting forms with validation
- Fast local data capture to CSV
- USB-friendly export/import across devices
- Team-level analysis and charts
- Setup wizard for event + form configuration

---

## Downloads

- Latest release: https://github.com/rishanreddy/Offline_Scouting_Manager/releases/latest
- All releases: https://github.com/rishanreddy/Offline_Scouting_Manager/releases

Notes on counters:

- `Total Downloads` = all GitHub release asset downloads over time
- `Latest Downloads` = downloads for only the most recent release

---

## Quick start

### Run from executable

1. Download your platform build from Releases.
2. Launch the app.
3. Open `http://127.0.0.1:8080` (the app also auto-opens browser on startup).

### Run from source

```bash
# macOS / Linux
./scripts/setup.sh

# Windows
scripts\setup.bat
```

Manual path:

```bash
uv sync

# Production mode
uv run main.py

# Development mode
uv run main.py --dev

# LAN mode
uv run main.py --lan

# Custom host/port
uv run main.py --host 0.0.0.0 --port 8080
```

---

## Match-day workflow

```text
Scout devices collect data -> each exports CSV -> one laptop imports all CSVs -> combined analysis
```

Typical flow:

1. Scouts submit forms during matches.
2. Each device stores local records in `data/scouting_data.csv`.
3. One device imports CSVs from all scouts.
4. Drive picklist and strategy discussions from combined data.

---

## Architecture snapshot

Built for **FTC/FRC scouting teams** operating in bandwidth-constrained environments. Collect match observations across multiple devices, synchronize via USB, and analyze aggregate performance—all without touching the cloud.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Scout A    │      │  Scout B    │      │  Scout C    │
│  Device     │      │  Device     │      │  Device     │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       │    Export CSV      │    Export CSV      │    Export CSV
       └────────────────────┼────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Analysis Hub  │
                    │  (Import All)  │
                    └────────────────┘
                            │
                    Unified Dataset → Insights
```

### Stack

| Layer           | Tech                            |
| --------------- | ------------------------------- |
| Backend         | Python 3.12+, Flask, Waitress   |
| Frontend        | Jinja2, Bootstrap 5, vanilla JS |
| Forms           | SurveyJS                        |
| Storage         | CSV + YAML + JSON               |
| Packaging       | PyInstaller                     |
| Package manager | uv                              |

---

## Build

```bash
# macOS / Linux
./scripts/build_executable.sh

# Windows
scripts\build_executable.bat
```

Artifacts are generated in `dist/`.

---

## Configuration

Use `/setup` on first run (or `/settings` later) to configure:

- Event name + season
- Device identity
- Survey schema
- Analysis graph fields

Required schema fields used by the app:

- `team`
- `auto_score`
- `teleop_score`

---

## Development

Manual validation loop:

1. `uv run main.py --dev`
2. Exercise affected pages
3. Check `logs/app.log`
4. Validate CSV import/export
5. Re-check analysis pages

---

<p align="center">
  Built by a team that has had scouting break at events and decided not to let that happen again.
</p>
