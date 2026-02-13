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


def load_config():
    """Load device, event, fields, and analysis config from config/config.yaml.

    Returns:
        Tuple of (device_cfg, event_cfg, fields, analysis_cfg)

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

        fields:
          - name: match
            label: "Match #"
            type: integer
            required: true
    """
    if not CONFIG_FILE.exists():
        template_path = BASE_DIR / "config" / "config.yaml"
        if template_path.exists():
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy(template_path, CONFIG_FILE)

    with CONFIG_FILE.open("r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    device = cfg.get("device", {}) or {}
    event = cfg.get("event", {}) or {}
    fields = cfg.get("fields", []) or []
    analysis = cfg.get("analysis", {}) or {}

    return device, event, fields, analysis


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


def validate_required_fields(fields):
    """Ensure required fields exist in the field configuration.

    Args:
        fields: List of field definition dicts from config.yaml

    Raises:
        ValueError: If any required fields are missing
    """
    field_names = [f["name"] for f in fields]
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


def save_config(device_cfg, event_cfg, fields, analysis_cfg):
    """Persist updated configuration to config/config.yaml."""
    CONFIG_DIR.mkdir(exist_ok=True)

    cfg = {
        "device": device_cfg,
        "event": event_cfg,
        "analysis": analysis_cfg,
        "fields": fields,
    }

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
