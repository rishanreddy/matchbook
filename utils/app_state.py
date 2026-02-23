"""Application state persistence helpers."""

import json
import logging

from .constants import APP_STATE_FILE

logger = logging.getLogger(__name__)


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
    APP_STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    logger.info("[State] Saved app state keys=%s", list(state.keys()))
