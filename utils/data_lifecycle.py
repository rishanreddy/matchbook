"""Local data reset lifecycle helpers."""

import datetime
import logging
import shutil

from .constants import (
    BACKUP_DIR,
    CSV_FILE,
    DEVICE_FILE,
    TEMP_EXPORTS_DIR,
    TEMP_UPLOADS_DIR,
)

logger = logging.getLogger(__name__)


def reset_local_data(active_logger: logging.Logger | None = None) -> None:
    """Clear local scouting data files."""
    log = active_logger or logger
    log.info("[Reset] Clearing local scouting data and temp exports/uploads")
    if CSV_FILE.exists():
        ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        backup_path = BACKUP_DIR / f"scouting_data_{ts}.csv"
        shutil.copy(CSV_FILE, backup_path)
        CSV_FILE.unlink(missing_ok=True)
        log.info("[Reset] Backed up and removed CSV: %s", backup_path)

    log.debug("[Reset] Preserving device file: %s", DEVICE_FILE)

    for temp_dir in [TEMP_UPLOADS_DIR, TEMP_EXPORTS_DIR]:
        if temp_dir.exists():
            for item in temp_dir.glob("*"):
                if item.is_file():
                    item.unlink(missing_ok=True)
    log.info("[Reset] Completed local data reset")
