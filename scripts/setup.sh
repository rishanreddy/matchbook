#!/usr/bin/env bash
set -euo pipefail

echo "Offline Scouting Manager setup"
echo "--------------------------------"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Attempting install..."
  if command -v curl >/dev/null 2>&1; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
  else
    echo "curl not found. Please install uv manually:"
    echo "https://docs.astral.sh/uv/getting-started/installation/"
    exit 1
  fi
fi

echo "Installing Python dependencies..."
uv sync

echo "Starting application..."
uv run main.py "$@"
