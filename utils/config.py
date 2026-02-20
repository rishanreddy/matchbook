"""Configuration loading and device management."""

import json
import shutil
import uuid
from datetime import datetime

import yaml

from .constants import (
    BASE_DIR,
    CONFIG_DIR,
    CONFIG_FILE,
    DEVICE_FILE,
    REQUIRED_FIELDS,
    SECRET_FILE,
)


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


def load_config():
    """Load device, event, analysis config, and SurveyJS schema.

    Returns:
        Tuple of (device_cfg, event_cfg, analysis_cfg, survey_json)

    Expected YAML structure:
        device:
          uniqueId: "scout_device_001"
          name: "Main Scout Tablet"

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

    try:
        with CONFIG_FILE.open("r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
    except Exception:
        cfg = {}

    device = cfg.get("device", {}) or {}
    event = cfg.get("event", {}) or {}
    analysis = cfg.get("analysis", {}) or {}
    survey_json = cfg.get("survey_json") or {"elements": []}
    return device, event, analysis, survey_json


def get_device(device_cfg):
    """Get or create persistent device identification.

    Args:
        device_cfg: Device configuration dict from config.yaml

    Returns:
        Tuple of (device_id, device_name)

    Priority for device_id:
      1) device.uniqueId from config.yaml (if present)
      2) existing ID stored in config/device.json
      3) a new random UUID

    device_name comes from device.name in config.yaml if present.

    The chosen values are persisted to config/device.json for stability.
    """
    existing = {}
    if DEVICE_FILE.exists():
        try:
            with DEVICE_FILE.open("r", encoding="utf-8") as f:
                existing = json.load(f) or {}
        except Exception:
            existing = {}

    device_id = (
        device_cfg.get("uniqueId") or existing.get("device_id") or uuid.uuid4().hex[:12]
    )
    device_name = device_cfg.get("name") or existing.get("device_name")

    DEVICE_FILE.parent.mkdir(exist_ok=True)
    to_store = {"device_id": device_id}
    if device_name:
        to_store["device_name"] = device_name
    with DEVICE_FILE.open("w", encoding="utf-8") as f:
        json.dump(to_store, f)

    return device_id, device_name


def get_event_ids(event_cfg):
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


def validate_required_fields(survey_json):
    """Ensure required system fields exist in SurveyJS schema.

    Args:
        survey_json: SurveyJS schema dict from config.yaml

    Raises:
        ValueError: If any required fields are missing
    """
    field_names = get_survey_field_names(survey_json or {})
    missing = [rf for rf in REQUIRED_FIELDS if rf not in field_names]
    if missing:
        raise ValueError(f"Missing required fields in config: {', '.join(missing)}")


def backup_config():
    """Create a timestamped backup of config.yaml before changes."""
    if not CONFIG_FILE.exists():
        return

    backup_dir = CONFIG_DIR / "backups"
    backup_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = backup_dir / f"config_{timestamp}.yaml"
    shutil.copy(CONFIG_FILE, backup_path)

    # Keep the latest 20 backups
    backups = sorted(backup_dir.glob("config_*.yaml"))
    for old_backup in backups[:-20]:
        old_backup.unlink(missing_ok=True)


def save_config(device_cfg, event_cfg, analysis_cfg, survey_json):
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

    with CONFIG_FILE.open("w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, sort_keys=False)


def get_secret_key() -> str:
    """Load or generate a persistent secret key for session signing."""
    if SECRET_FILE.exists():
        return SECRET_FILE.read_text(encoding="utf-8").strip()

    SECRET_FILE.parent.mkdir(exist_ok=True)
    secret = uuid.uuid4().hex + uuid.uuid4().hex
    SECRET_FILE.write_text(secret, encoding="utf-8")
    return secret


def get_device_names_from_csv() -> set[str]:
    """Extract unique device names from CSV data."""
    from .constants import CSV_FILE
    import csv

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
    except Exception:
        pass

    return device_names
