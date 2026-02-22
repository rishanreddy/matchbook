"""Constants and file paths used throughout the application."""

from pathlib import Path
import sys

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent

# Use a writable app data directory when running from a bundled executable
APP_DATA_DIR = BASE_DIR
if getattr(sys, "frozen", False) or getattr(sys, "_MEIPASS", None):
    APP_DATA_DIR = Path.home() / ".offline_scouting_manager"

APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_DIR = APP_DATA_DIR / "config"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

DATA_DIR = APP_DATA_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

LOG_DIR = APP_DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Temp uploads directory
TEMP_UPLOADS_DIR = DATA_DIR / "temp_uploads"
TEMP_UPLOADS_DIR.mkdir(exist_ok=True)

# Export/backup directories
TEMP_EXPORTS_DIR = DATA_DIR / "temp_exports"
TEMP_EXPORTS_DIR.mkdir(exist_ok=True)

BACKUP_DIR = DATA_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)


# File paths
CONFIG_FILE = CONFIG_DIR / "config.yaml"
DEVICE_FILE = CONFIG_DIR / "device.json"
CSV_FILE = DATA_DIR / "scouting_data.csv"
SECRET_FILE = CONFIG_DIR / "secret.key"
APP_STATE_FILE = CONFIG_DIR / "app_state.json"

# Single source of truth for system scouting fields.
SYSTEM_FIELD_SPECS = [
    {
        "name": "match",
        "label": "Match #",
        "aliases": ["match", "match_number"],
        "type": "text",
        "inputType": "number",
        "isRequired": True,
        "required_in_schema": True,
        "strict_required": False,
    },
    {
        "name": "team",
        "label": "Team Number",
        "aliases": ["team", "team_number"],
        "type": "text",
        "inputType": "number",
        "isRequired": True,
        "required_in_schema": True,
        "strict_required": True,
    },
    {
        "name": "alliance_color",
        "label": "Alliance Color",
        "aliases": ["alliance_color", "alliance"],
        "type": "dropdown",
        "isRequired": True,
        "choices": ["Red", "Blue"],
        "required_in_schema": True,
        "strict_required": False,
    },
    {
        "name": "auto_score",
        "label": "Auto Score",
        "aliases": ["auto_score", "auto"],
        "type": "text",
        "inputType": "number",
        "isRequired": True,
        "required_in_schema": True,
        "strict_required": True,
    },
    {
        "name": "teleop_score",
        "label": "Teleop Score",
        "aliases": ["teleop_score", "teleop", "tele_op_score"],
        "type": "text",
        "inputType": "number",
        "isRequired": True,
        "required_in_schema": True,
        "strict_required": True,
    },
]

SYSTEM_FIELD_DEFAULTS = [
    {
        key: value
        for key, value in spec.items()
        if key in {"type", "name", "label", "inputType", "isRequired", "choices"}
    }
    for spec in SYSTEM_FIELD_SPECS
]
for field in SYSTEM_FIELD_DEFAULTS:
    field["title"] = field.pop("label")

REQUIRED_SURVEY_FIELD_GROUPS = [
    {"label": spec["label"], "aliases": spec["aliases"]}
    for spec in SYSTEM_FIELD_SPECS
    if spec.get("required_in_schema")
]

# Required field names that must exist in config and submit payload.
REQUIRED_FIELDS = [
    spec["name"] for spec in SYSTEM_FIELD_SPECS if spec.get("strict_required")
]
