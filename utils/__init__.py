"""Utility modules for Offline Scouting Manager."""

from .constants import (
    BASE_DIR,
    CONFIG_DIR,
    DATA_DIR,
    TEMP_UPLOADS_DIR,
    TEMP_EXPORTS_DIR,
    BACKUP_DIR,
    LOG_DIR,
    CONFIG_FILE,
    DEVICE_FILE,
    CSV_FILE,
    SECRET_FILE,
    APP_STATE_FILE,
    SYSTEM_FIELD_SPECS,
    SYSTEM_FIELD_DEFAULTS,
    REQUIRED_SURVEY_FIELD_GROUPS,
    REQUIRED_FIELDS,
)
from .config import (
    load_config,
    get_device,
    get_event_ids,
    collect_survey_elements,
    get_survey_field_names,
    validate_required_fields,
    backup_config,
    save_config,
    get_secret_key,
    get_device_names_from_csv,
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
from .formatting import format_timestamp, format_device_id
from .temp_uploads import (
    save_uploaded_file,
    load_combined_data_from_temp,
    clear_temp_uploads,
)
from .survey_display import (
    build_display_rows,
    build_choice_label_maps,
    build_choice_display_entries,
)
from .app_state import load_app_state, save_app_state
from .data_lifecycle import reset_local_data
from .export_safety import sanitize_filename, escape_csv_cell
from .survey_schema import ensure_system_fields
from .analysis_config import (
    sanitize_graph_field_config,
    get_enabled_graph_fields,
    build_graph_field_options,
    normalize_settings_graph_payload,
    build_settings_graph_config_json,
)
from .analysis_pipeline import prepare_analysis
from .version_check import CURRENT_VERSION, check_for_updates

__all__ = [
    # Constants
    "BASE_DIR",
    "CONFIG_DIR",
    "DATA_DIR",
    "TEMP_UPLOADS_DIR",
    "TEMP_EXPORTS_DIR",
    "BACKUP_DIR",
    "LOG_DIR",
    "CONFIG_FILE",
    "DEVICE_FILE",
    "CSV_FILE",
    "SECRET_FILE",
    "APP_STATE_FILE",
    "SYSTEM_FIELD_SPECS",
    "SYSTEM_FIELD_DEFAULTS",
    "REQUIRED_SURVEY_FIELD_GROUPS",
    "REQUIRED_FIELDS",
    # Config
    "load_config",
    "get_device",
    "get_event_ids",
    "collect_survey_elements",
    "get_survey_field_names",
    "validate_required_fields",
    "backup_config",
    "save_config",
    "get_secret_key",
    "get_device_names_from_csv",
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
    "get_radar_data",
    # Formatting
    "format_timestamp",
    "format_device_id",
    # Temp Uploads
    "save_uploaded_file",
    "load_combined_data_from_temp",
    "clear_temp_uploads",
    "build_display_rows",
    "build_choice_label_maps",
    "build_choice_display_entries",
    # App State
    "load_app_state",
    "save_app_state",
    # Data Lifecycle
    "reset_local_data",
    # Export Safety
    "sanitize_filename",
    "escape_csv_cell",
    # Survey Schema
    "ensure_system_fields",
    # Analysis Config
    "sanitize_graph_field_config",
    "get_enabled_graph_fields",
    "build_graph_field_options",
    "normalize_settings_graph_payload",
    "build_settings_graph_config_json",
    # Analysis Pipeline
    "prepare_analysis",
    # Version
    "CURRENT_VERSION",
    "check_for_updates",
]
