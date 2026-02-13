#!/usr/bin/env bash
set -euo pipefail

echo "Building Offline Scouting Manager executable"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Please install uv first:"
  echo "https://docs.astral.sh/uv/getting-started/installation/"
  exit 1
fi

uv sync
uv pip install pyinstaller

uv run pyinstaller \
  --name "OfflineScoutingManager" \
  --onefile \
  --add-data "pyproject.toml:." \
  --add-data "templates:templates" \
  --add-data "static:static" \
  --add-data "config:config" \
  main.py

echo "Build complete: dist/OfflineScoutingManager"
