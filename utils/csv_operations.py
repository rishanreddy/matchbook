"""CSV file operations for scouting data."""

import csv
import datetime

from .constants import CSV_FILE
from .config import (
    collect_survey_elements,
    get_device,
    get_event_ids,
    get_survey_field_names,
)
from .formatting import format_timestamp


def get_csv_header(survey_json):
    """Generate CSV header columns from SurveyJS elements.

    Args:
        survey_json: SurveyJS schema dict

    Returns:
        List of column names including base columns and field columns

    Base columns include metadata (timestamp, event info, device info).
    Field columns are derived from the field names in config.
    """
    base_cols = [
        "timestamp",
        "event_name",
        "event_season",
        "config_id",
        "device_id",
        "device_name",
    ]
    field_cols = get_survey_field_names(survey_json or {})
    return base_cols + field_cols


def ensure_csv_header(survey_json):
    """Create CSV file with header if it doesn't exist.

    Args:
        survey_json: SurveyJS schema dict
    """
    if CSV_FILE.exists():
        return

    header = get_csv_header(survey_json)
    with CSV_FILE.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)


def cast_value(element, raw_value: str) -> str:
    """Convert raw form input to appropriate type for CSV storage.

    Args:
        element: SurveyJS element dict with type/inputType keys
        raw_value: Raw string value from form input

    Returns:
        Converted value as string for CSV storage

    Supports SurveyJS types: text, dropdown, comment
    If conversion fails, returns the original string.
    """
    if raw_value is None:
        return ""

    raw_value = raw_value.strip()
    ftype = element.get("type", "text")
    input_type = element.get("inputType", "")

    if ftype == "text" and input_type == "number":
        if raw_value == "":
            return ""
        try:
            value_int = int(raw_value)
            return str(value_int)
        except ValueError:
            # Keep original string if conversion fails
            return raw_value

    # All other types -> return stripped string
    return raw_value


def append_row(device_cfg, event_cfg, survey_json, form_data):
    """Append a new scouting entry to the CSV file.

    Args:
        device_cfg: Device configuration dict
        event_cfg: Event configuration dict
        survey_json: SurveyJS schema dict
        form_data: Form data dict from request.form

    Creates the CSV file with headers if it doesn't exist.
    Adds metadata columns (timestamp, event, device) automatically.
    """
    ensure_csv_header(survey_json)

    timestamp = datetime.datetime.now().isoformat(timespec="seconds")
    config_id, event_name, event_season = get_event_ids(event_cfg)
    device_id, device_name = get_device(device_cfg)

    row = {
        "timestamp": timestamp,
        "event_name": event_name,
        "event_season": event_season,
        "config_id": config_id,
        "device_id": device_id,
        "device_name": device_name or "",
    }

    for element in collect_survey_elements(survey_json or {}):
        name = element.get("name")
        if not name:
            continue
        raw_value = form_data.get(name, "")
        row[name] = cast_value(element, raw_value)

    header = get_csv_header(survey_json)
    with CSV_FILE.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writerow(row)


def get_stats():
    """Get statistics about the local CSV file.

    Returns:
        Dict with 'entries' count and 'last_timestamp' formatted string
    """
    if not CSV_FILE.exists():
        return {
            "entries": 0,
            "last_timestamp": None,
        }

    with CSV_FILE.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    entries = len(rows)
    last_ts_raw = rows[-1].get("timestamp") if rows else None

    return {
        "entries": entries,
        "last_timestamp": format_timestamp(last_ts_raw),
    }


def load_all_rows():
    """Load all rows from the local CSV file.

    Returns:
        List of dicts, one per CSV row. Empty list if file doesn't exist.
    """
    if not CSV_FILE.exists():
        return []
    with CSV_FILE.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)
