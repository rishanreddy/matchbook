"""Functions for managing temporary uploaded files."""

import csv
import datetime
import logging
import re
import uuid
from pathlib import Path

from .constants import TEMP_UPLOADS_DIR

logger = logging.getLogger(__name__)
SAFE_TEMP_FILENAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _resolve_temp_path(filename: str) -> Path | None:
    """Resolve a temp-upload filename safely inside TEMP_UPLOADS_DIR."""
    name = str(filename or "").strip()
    if not name or "/" in name or "\\" in name or not SAFE_TEMP_FILENAME_RE.match(name):
        return None

    resolved = (TEMP_UPLOADS_DIR / name).resolve()
    try:
        resolved.relative_to(TEMP_UPLOADS_DIR.resolve())
    except ValueError:
        return None
    return resolved


def save_uploaded_file(file_content: str, original_filename: str) -> str:
    """
    Save uploaded file content to temp directory.

    Args:
        file_content: The decoded CSV file content
        original_filename: Original filename from upload

    Returns:
        str: Unique filename that was saved
    """
    # Generate unique filename to avoid collisions
    unique_id = uuid.uuid4().hex[:8]
    base_name = Path(original_filename).name
    base_name = re.sub(r"[^A-Za-z0-9._-]", "_", base_name)
    if not base_name:
        base_name = "upload.csv"
    safe_filename = f"{unique_id}_{base_name}"
    file_path = TEMP_UPLOADS_DIR / safe_filename

    TEMP_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    with file_path.open("w", encoding="utf-8") as f:
        f.write(file_content)

    return safe_filename


def load_combined_data_from_temp(filenames: list[str]) -> list[dict]:
    """
    Load and combine data from multiple temp CSV files.

    Args:
        filenames: List of filenames stored in temp_uploads directory

    Returns:
        list: Combined list of row dictionaries from all files
    """
    combined_rows: list[dict] = []

    for filename in filenames:
        file_path = _resolve_temp_path(filename)
        if file_path is None:
            logger.warning("Skipping invalid temp filename: %s", filename)
            continue
        if not file_path.exists() or not file_path.is_file():
            continue

        try:
            with file_path.open("r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    combined_rows.append(row)
        except Exception as exc:
            logger.warning("Error reading temp file %s: %s", filename, exc)
            continue

    return combined_rows


def clear_temp_uploads(filenames: list[str] | None = None) -> None:
    """
    Clear temporary upload files.

    Args:
        filenames: Optional list of specific filenames to delete.
                  If None, clears all files in temp directory.
    """
    if filenames:
        # Delete specific files
        for filename in set(filenames):
            file_path = _resolve_temp_path(filename)
            if file_path is None:
                logger.warning("Skipping invalid temp filename for delete: %s", filename)
                continue
            if file_path.exists() and file_path.is_file():
                try:
                    file_path.unlink()
                except Exception as exc:
                    logger.warning("Error deleting %s: %s", filename, exc)
    else:
        # Clear all temp files
        for file_path in TEMP_UPLOADS_DIR.glob("*"):
            if file_path.is_file():
                try:
                    file_path.unlink()
                except Exception as exc:
                    logger.warning("Error deleting %s: %s", file_path.name, exc)


def clear_stale_temp_uploads(max_age_hours: int = 24) -> int:
    """Delete temp upload files older than max_age_hours."""
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(hours=max_age_hours)
    removed = 0

    for file_path in TEMP_UPLOADS_DIR.glob("*"):
        if not file_path.is_file():
            continue
        try:
            mtime = datetime.datetime.fromtimestamp(
                file_path.stat().st_mtime, tz=datetime.timezone.utc
            )
            if mtime < cutoff:
                file_path.unlink(missing_ok=True)
                removed += 1
        except Exception as exc:
            logger.warning("Error pruning stale temp upload %s: %s", file_path.name, exc)

    return removed
