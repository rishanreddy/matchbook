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


def reset_local_data(active_logger: logging.Logger | None = None) -> bool:
    """Clear local scouting data files.

    Returns:
        True when reset completes without file-operation errors; otherwise False.
    """
    log = active_logger or logger
    success = True
    log.info("[Reset] Clearing local scouting data and temp exports/uploads")
    if CSV_FILE.exists():
        try:
            ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S_%f")
            backup_path = BACKUP_DIR / f"scouting_data_{ts}.csv"
            shutil.copy(CSV_FILE, backup_path)
            CSV_FILE.unlink(missing_ok=True)
            log.info("[Reset] Backed up and removed CSV: %s", backup_path)
        except Exception as exc:
            success = False
            log.error("[Reset] Failed handling CSV reset: %s", exc)

    log.debug("[Reset] Preserving device file: %s", DEVICE_FILE)

    for temp_dir in [TEMP_UPLOADS_DIR, TEMP_EXPORTS_DIR]:
        if not temp_dir.exists():
            continue
        for item in temp_dir.glob("*"):
            if item.is_file():
                try:
                    item.unlink(missing_ok=True)
                except Exception as exc:
                    success = False
                    log.warning("[Reset] Failed deleting %s: %s", item, exc)

    if success:
        log.info("[Reset] Completed local data reset")
    else:
        log.warning("[Reset] Completed with errors")
    return success
