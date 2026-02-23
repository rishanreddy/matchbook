"""Safety helpers for exports and filenames."""

import re


def sanitize_filename(value: str) -> str:
    """Sanitize a string for safe filenames."""
    text = (value or "").strip().replace(" ", "_")
    text = re.sub(r"[^A-Za-z0-9._-]", "", text)
    return text or "file"


def escape_csv_cell(value) -> str:
    """Escape CSV cell values that may trigger spreadsheet formulas."""
    if value is None:
        return ""
    text = str(value)
    if text and text[0] in ("=", "+", "-", "@"):
        return f"'{text}"
    return text
