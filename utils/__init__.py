"""Utility modules for Offline Scouting Manager."""

from .constants import (
    BASE_DIR,
    CONFIG_DIR,
    DATA_DIR,
    TEMP_UPLOADS_DIR,
    TEMP_EXPORTS_DIR,
    BACKUP_DIR,
    CONFIG_FILE,
    DEVICE_FILE,
    DEVICE_REGISTRY_FILE,
    CSV_FILE,
    SECRET_FILE,
    REQUIRED_FIELDS,
)
from .config import (
    load_config,
    get_device,
    get_event_ids,
    validate_required_fields,
    backup_config,
    save_config,
    get_secret_key,
)
from .device_registry import (
    load_registry,
    save_registry,
    update_device,
    register_from_rows,
    list_devices,
    get_expected_devices,
    set_expected_devices,
)
from .csv_operations import (
    get_csv_header,
    ensure_csv_header,
    cast_value,
    append_row,
    load_all_rows,
    get_stats,
)
from .team_analysis import (
    get_team_data,
    calculate_team_stats,
    get_all_teams_summary,
    get_radar_data,
)
from .formatting import format_timestamp
from .temp_uploads import (
    save_uploaded_file,
    load_combined_data_from_temp,
    clear_temp_uploads,
)
from .version_check import check_for_updates, CURRENT_VERSION

__all__ = [
    # Constants
    "BASE_DIR",
    "CONFIG_DIR",
    "DATA_DIR",
    "TEMP_UPLOADS_DIR",
    "TEMP_EXPORTS_DIR",
    "BACKUP_DIR",
    "CONFIG_FILE",
    "DEVICE_FILE",
    "DEVICE_REGISTRY_FILE",
    "CSV_FILE",
    "SECRET_FILE",
    "REQUIRED_FIELDS",
    # Config
    "load_config",
    "get_device",
    "get_event_ids",
    "validate_required_fields",
    "backup_config",
    "save_config",
    "get_secret_key",
    "load_registry",
    "save_registry",
    "update_device",
    "register_from_rows",
    "list_devices",
    "get_expected_devices",
    "set_expected_devices",
    # CSV Operations
    "get_csv_header",
    "ensure_csv_header",
    "cast_value",
    "append_row",
    "load_all_rows",
    "get_stats",
    # Team Analysis
    "get_team_data",
    "calculate_team_stats",
    "get_all_teams_summary",
    # Formatting
    "format_timestamp",
    # Temp Uploads
    "save_uploaded_file",
    "load_combined_data_from_temp",
    "clear_temp_uploads",
    # Version Check
    "check_for_updates",
    "CURRENT_VERSION",
]
