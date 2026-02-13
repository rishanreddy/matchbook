"""Functions for managing temporary uploaded files."""

import csv
import os
import re
import uuid
from pathlib import Path
from .constants import TEMP_UPLOADS_DIR


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

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(file_content)

    return safe_filename


def load_combined_data_from_temp(filenames: list) -> list:
    """
    Load and combine data from multiple temp CSV files.

    Args:
        filenames: List of filenames stored in temp_uploads directory

    Returns:
        list: Combined list of row dictionaries from all files
    """
    combined_rows = []

    for filename in filenames:
        file_path = TEMP_UPLOADS_DIR / filename

        if not file_path.exists():
            continue

        try:
            with open(file_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    combined_rows.append(row)
        except Exception as e:
            print(f"Error reading temp file {filename}: {e}")
            continue

    return combined_rows


def clear_temp_uploads(filenames: list | None = None):
    """
    Clear temporary upload files.

    Args:
        filenames: Optional list of specific filenames to delete.
                  If None, clears all files in temp directory.
    """
    if filenames:
        # Delete specific files
        for filename in filenames:
            file_path = TEMP_UPLOADS_DIR / filename
            if file_path.exists():
                try:
                    file_path.unlink()
                except Exception as e:
                    print(f"Error deleting {filename}: {e}")
    else:
        # Clear all temp files
        for file_path in TEMP_UPLOADS_DIR.glob("*"):
            if file_path.is_file():
                try:
                    file_path.unlink()
                except Exception as e:
                    print(f"Error deleting {file_path.name}: {e}")
