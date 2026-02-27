"""Application state persistence helpers."""

import json
import logging
import os
import tempfile
from pathlib import Path

from .constants import APP_STATE_FILE

logger = logging.getLogger(__name__)


def _atomic_write_text(file_path: Path, content: str) -> None:
    """Write text atomically using temporary sibling file."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=file_path.parent,
        delete=False,
        prefix=f".{file_path.name}.",
        suffix=".tmp",
    ) as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
        temp_path = Path(handle.name)
    temp_path.replace(file_path)


def load_app_state() -> dict:
    """Load persisted app state from config directory."""
    if APP_STATE_FILE.exists():
        try:
            state = json.loads(APP_STATE_FILE.read_text(encoding="utf-8"))
            logger.debug("[State] Loaded app state keys=%s", list(state.keys()))
            return state
        except json.JSONDecodeError:
            logger.warning(
                "[State] Invalid JSON in %s; resetting state", APP_STATE_FILE
            )
            return {}
    return {}


def save_app_state(state: dict) -> None:
    """Persist app state to disk."""
    APP_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write_text(APP_STATE_FILE, json.dumps(state, indent=2))
    logger.info("[State] Saved app state keys=%s", list(state.keys()))
