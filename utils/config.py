"""Configuration loading, validation, and device management."""

import csv
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

import yaml

from .constants import (
    BASE_DIR,
    CONFIG_DIR,
    CONFIG_FILE,
    CSV_FILE,
    REQUIRED_SURVEY_FIELD_GROUPS,
    REQUIRED_FIELDS,
    SECRET_FILE,
)
from .device_registry import get_or_create_device_id

logger = logging.getLogger(__name__)


def _atomic_write_text(file_path: Path, content: str) -> None:
    """Write text to a temp file and atomically replace destination."""
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


def collect_survey_elements(node) -> list[dict]:
    """Collect all survey elements from SurveyJS schema recursively."""
    elements: list[dict] = []

    def _walk(value) -> None:
        if isinstance(value, list):
            for item in value:
                _walk(item)
            return

        if not isinstance(value, dict):
            return

        current_elements = value.get("elements")
        if isinstance(current_elements, list):
            for item in current_elements:
                if isinstance(item, dict):
                    elements.append(item)
                _walk(item)

        pages = value.get("pages")
        if isinstance(pages, list):
            for page in pages:
                _walk(page)

        template_elements = value.get("templateElements")
        if isinstance(template_elements, list):
            for item in template_elements:
                _walk(item)

    _walk(node)
    return elements


def get_survey_field_names(survey_json: dict) -> list[str]:
    """Return ordered unique field names from SurveyJS schema."""
    names: list[str] = []
    seen = set()
    for element in collect_survey_elements(survey_json):
        name = element.get("name")
        if isinstance(name, str) and name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


def load_config() -> tuple[dict, dict, dict, dict]:
    """Load device, event, analysis config, and SurveyJS schema.

    Returns:
        Tuple of (device_cfg, event_cfg, analysis_cfg, survey_json)

    Expected YAML structure:
        device:
          uniqueId: "swift-owl-214"

        event:
          name: "Example Robotics Event"
          season: "2024-2025"
          config_id: "example_v1"  # optional

        analysis:
          graph_fields: [...]
          matches_per_page: 25

        survey_json:
          elements:
            - type: text
              name: team
              title: "Team Number"
              isRequired: true
    """
    if not CONFIG_FILE.exists():
        template_path = BASE_DIR / "config" / "config.yaml"
        if template_path.exists():
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy(template_path, CONFIG_FILE)
            logger.info("[Config] Initialized config from template: %s", template_path)
        else:
            logger.warning("[Config] Template config missing: %s", template_path)

    try:
        with CONFIG_FILE.open("r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        logger.debug("[Config] Loaded configuration from %s", CONFIG_FILE)
    except Exception as exc:
        logger.warning("[Config] Failed to load config (%s): %s", CONFIG_FILE, exc)
        cfg = {}

    device = cfg.get("device", {}) or {}
    if not isinstance(device, dict):
        logger.warning("[Config] device config was not an object; using defaults")
        device = {}

    event = cfg.get("event", {}) or {}
    if not isinstance(event, dict):
        logger.warning("[Config] event config was not an object; using defaults")
        event = {}

    analysis = cfg.get("analysis", {}) or {}
    if not isinstance(analysis, dict):
        logger.warning("[Config] analysis config was not an object; using defaults")
        analysis = {}

    survey_json = cfg.get("survey_json") or {"elements": []}
    if not isinstance(survey_json, dict):
        logger.warning("[Config] survey_json was not an object; using empty schema")
        survey_json = {"elements": []}

    return device, event, analysis, survey_json


def get_device(device_cfg: dict | None = None) -> str:
    """Get or create persistent device ID.

    Args:
        device_cfg: Optional device configuration dict from config.yaml

    Returns:
        Stable, auto-generated device ID
    """
    device_id = get_or_create_device_id(device_cfg or {})
    logger.debug("[Device] Active device_id=%s", device_id)
    return device_id


def get_event_ids(event_cfg: dict) -> tuple[str, str, str]:
    """Derive event identifiers from event configuration.

    Args:
        event_cfg: Event configuration dict from config.yaml

    Returns:
        Tuple of (config_id, event_name, event_season)

    If event.config_id is missing, generates one from name + season, e.g.
    "Example Robotics Event", "2024-2025" -> "example_robotics_event_2024-2025"
    """
    event_name = (event_cfg.get("name") or "").strip()
    event_season = (event_cfg.get("season") or "").strip()
    config_id = (event_cfg.get("config_id") or "").strip()

    if not config_id:
        parts = [p for p in [event_name, event_season] if p]
        if parts:
            config_id = "_".join(parts).lower().replace(" ", "_")
        else:
            config_id = "unknown_config"

    return config_id, event_name, event_season


def get_missing_required_fields(survey_json: dict) -> list[str]:
    """Return missing required survey field labels.

    Required fields support aliases so older schemas can still pass validation.
    """
    field_names = {
        name.strip().lower() for name in get_survey_field_names(survey_json or {})
    }
    missing: list[str] = []

    for group in REQUIRED_SURVEY_FIELD_GROUPS:
        aliases = group["aliases"]
        if not any(alias in field_names for alias in aliases):
            missing.append(group["label"])

    return missing


def validate_required_fields(survey_json: dict) -> None:
    """Ensure required system fields exist in SurveyJS schema.

    Args:
        survey_json: SurveyJS schema dict from config.yaml

    Raises:
        ValueError: If any required fields are missing
    """
    missing = get_missing_required_fields(survey_json or {})
    if missing:
        raise ValueError(f"Missing required fields in config: {', '.join(missing)}")

    # Keep strict validation for system-calculated fields used throughout app logic.
    strict_field_names = set(get_survey_field_names(survey_json or {}))
    strict_missing = [
        field for field in REQUIRED_FIELDS if field not in strict_field_names
    ]
    if strict_missing:
        raise ValueError(
            "Missing required system fields in config: " + ", ".join(strict_missing)
        )


def backup_config() -> None:
    """Create a timestamped backup of config.yaml before changes."""
    if not CONFIG_FILE.exists():
        return

    backup_dir = CONFIG_DIR / "backups"
    backup_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
    backup_path = backup_dir / f"config_{timestamp}.yaml"
    try:
        shutil.copy(CONFIG_FILE, backup_path)
        logger.info("[Config] Created backup: %s", backup_path)
    except Exception as exc:
        logger.warning("[Config] Failed to create backup %s: %s", backup_path, exc)
        return

    # Keep the latest 20 backups
    backups = sorted(backup_dir.glob("config_*.yaml"))
    for old_backup in backups[:-20]:
        old_backup.unlink(missing_ok=True)
        logger.debug("[Config] Removed old backup: %s", old_backup)


def save_config(
    device_cfg: dict, event_cfg: dict, analysis_cfg: dict, survey_json: dict
) -> None:
    """Persist updated configuration to config/config.yaml.

    Args:
        device_cfg: Device configuration dict
        event_cfg: Event configuration dict
        analysis_cfg: Analysis settings dict
        survey_json: SurveyJS schema
    """
    CONFIG_DIR.mkdir(exist_ok=True)

    cfg = {
        "device": device_cfg,
        "event": event_cfg,
        "analysis": analysis_cfg,
    }

    cfg["survey_json"] = survey_json or {"elements": []}

    rendered_config = yaml.safe_dump(cfg, sort_keys=False)
    _atomic_write_text(CONFIG_FILE, rendered_config)

    logger.info(
        "[Config] Saved configuration: event=%s season=%s fields=%s",
        event_cfg.get("name") or "",
        event_cfg.get("season") or "",
        len(get_survey_field_names(survey_json or {})),
    )


def get_secret_key() -> str:
    """Load or generate a persistent secret key for session signing."""
    if SECRET_FILE.exists():
        secret = SECRET_FILE.read_text(encoding="utf-8").strip()
        if secret:
            return secret
        logger.warning("[Config] Secret file was empty; regenerating %s", SECRET_FILE)

    SECRET_FILE.parent.mkdir(exist_ok=True)
    secret = uuid.uuid4().hex + uuid.uuid4().hex
    _atomic_write_text(SECRET_FILE, secret)
    try:
        os.chmod(SECRET_FILE, 0o600)
    except Exception:
        pass
    logger.info("[Config] Generated new secret key at %s", SECRET_FILE)
    return secret


def get_device_names_from_csv() -> set[str]:
    """Extract unique device names from CSV data."""
    device_names = set()
    if not CSV_FILE.exists():
        return device_names

    try:
        with CSV_FILE.open("r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                device_name = (row.get("device_name") or "").strip()
                if device_name:
                    device_names.add(device_name)
    except Exception as exc:
        logger.warning("[CSV] Failed to extract device names: %s", exc)

    return device_names
