"""Constants and file paths used throughout the application."""

from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = BASE_DIR / "config"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

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
DEVICE_REGISTRY_FILE = CONFIG_DIR / "device_registry.json"
CSV_FILE = DATA_DIR / "scouting_data.csv"
SECRET_FILE = CONFIG_DIR / "secret.key"

# Required field names that must exist in config
REQUIRED_FIELDS = ["team", "auto_score", "teleop_score"]
