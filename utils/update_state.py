"""Persistent update state storage."""

from __future__ import annotations

import datetime
import json
from pathlib import Path

from .constants import APP_DATA_DIR

UPDATES_DIR = APP_DATA_DIR / "updates"
UPDATE_STATE_FILE = UPDATES_DIR / "update_state.json"

DEFAULT_UPDATE_STATE: dict = {
    "status": "idle",
    "progress": 0,
    "error": None,
    "asset_path": None,
    "checksum_path": None,
    "expected_sha256": None,
    "latest_version": None,
    "download_url": None,
    "last_checked_at": None,
}


def _now_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def ensure_updates_dir() -> Path:
    """Ensure the updates directory exists."""
    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    return UPDATES_DIR


def load_update_state() -> dict:
    """Load update state from disk with defaults."""
    ensure_updates_dir()
    if not UPDATE_STATE_FILE.exists():
        state = dict(DEFAULT_UPDATE_STATE)
        save_update_state(state)
        return state

    try:
        with UPDATE_STATE_FILE.open("r", encoding="utf-8") as f:
            loaded = json.load(f)
        if not isinstance(loaded, dict):
            return dict(DEFAULT_UPDATE_STATE)
        state = dict(DEFAULT_UPDATE_STATE)
        state.update(loaded)
        return state
    except Exception:
        return dict(DEFAULT_UPDATE_STATE)


def save_update_state(state: dict) -> None:
    """Save update state to disk."""
    ensure_updates_dir()
    payload = dict(DEFAULT_UPDATE_STATE)
    payload.update(state or {})
    with UPDATE_STATE_FILE.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def update_state(**changes) -> dict:
    """Patch and persist update state."""
    state = load_update_state()
    state.update(changes)
    if changes:
        state["updated_at"] = _now_iso()
    save_update_state(state)
    return state
