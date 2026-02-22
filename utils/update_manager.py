"""Update management utilities for GitHub-based updates."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import requests

from .constants import APP_DATA_DIR
from .version_check import CURRENT_VERSION, RELEASES_URL, check_for_updates

ALLOWED_HOSTS = {
    "api.github.com",
    "github.com",
    "objects.githubusercontent.com",
}

UPDATES_DIR = APP_DATA_DIR / "updates"
UPDATES_DIR.mkdir(parents=True, exist_ok=True)
UPDATE_STATE_FILE = UPDATES_DIR / "state.json"
NETWORK_RETRIES = 3
NETWORK_BACKOFF_SECONDS = 1.0

logger = logging.getLogger(__name__)


def _is_allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return False
    return parsed.netloc in ALLOWED_HOSTS


def _write_state(payload: dict) -> None:
    payload["updated_at"] = datetime.now().isoformat(timespec="seconds")
    UPDATE_STATE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _read_state() -> dict:
    if not UPDATE_STATE_FILE.exists():
        return {"status": "idle"}
    try:
        return json.loads(UPDATE_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"status": "idle"}


def _get_with_retries(url: str, timeout: int = 10) -> requests.Response:
    """Perform GET with retries and exponential backoff."""
    last_error: Exception | None = None

    for attempt in range(1, NETWORK_RETRIES + 1):
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            if attempt > 1:
                logger.info(
                    "[Update] Request succeeded after retry attempt %s: %s",
                    attempt,
                    url,
                )
            return response
        except requests.RequestException as exc:
            last_error = exc
            logger.warning(
                "[Update] Request attempt %s/%s failed for %s: %s",
                attempt,
                NETWORK_RETRIES,
                url,
                exc,
            )
            if attempt < NETWORK_RETRIES:
                time.sleep(NETWORK_BACKOFF_SECONDS * (2 ** (attempt - 1)))

    raise last_error or RuntimeError("Unknown network error")


def is_packaged_mode() -> bool:
    """Return True when running from a packaged executable."""
    return bool(getattr(sys, "frozen", False) or getattr(sys, "_MEIPASS", None))


def _platform_tags() -> list[str]:
    system = platform.system().lower()
    machine = platform.machine().lower()

    tags = [system, machine]
    if system == "darwin":
        tags.extend(["mac", "macos", "osx"])
        if machine in {"arm64", "aarch64"}:
            tags.extend(["apple", "silicon"])
    elif system == "windows":
        tags.extend(["win", "windows"])
    elif system == "linux":
        tags.extend(["linux"])
    return list(dict.fromkeys(tags))


def _pick_release_asset(assets: list[dict]) -> dict | None:
    if not assets:
        return None

    tags = _platform_tags()
    candidates = []
    for asset in assets:
        name = (asset.get("name") or "").lower()
        if name.endswith((".sha256", ".txt")) or "checksum" in name:
            continue
        if any(tag in name for tag in tags):
            candidates.append(asset)

    if candidates:
        return candidates[0]

    for asset in assets:
        name = (asset.get("name") or "").lower()
        if name.endswith((".zip", ".tar.gz", ".exe", ".dmg", ".appimage")):
            return asset
    return None


def _download_file(
    url: str,
    dest: Path,
    timeout: int = 30,
    *,
    version: str,
    asset_name: str,
) -> None:
    if not _is_allowed_url(url):
        raise ValueError("Download URL is not in allowed host list")

    for attempt in range(1, NETWORK_RETRIES + 1):
        downloaded_bytes = 0
        last_reported_progress = -1
        try:
            with requests.get(url, timeout=timeout, stream=True) as response:
                response.raise_for_status()
                total_bytes = int(response.headers.get("Content-Length") or 0)

                with dest.open("wb") as f:
                    for chunk in response.iter_content(chunk_size=64 * 1024):
                        if not chunk:
                            continue

                        f.write(chunk)
                        downloaded_bytes += len(chunk)

                        progress_percent = 0
                        if total_bytes > 0:
                            progress_percent = int(
                                (downloaded_bytes / total_bytes) * 100
                            )

                        if (
                            total_bytes > 0
                            and progress_percent // 5 > last_reported_progress // 5
                        ):
                            last_reported_progress = progress_percent
                            _write_state(
                                {
                                    "status": "downloading",
                                    "version": version,
                                    "asset_name": asset_name,
                                    "downloaded_bytes": downloaded_bytes,
                                    "total_bytes": total_bytes,
                                    "progress_percent": max(
                                        0, min(progress_percent, 100)
                                    ),
                                }
                            )

                _write_state(
                    {
                        "status": "downloading",
                        "version": version,
                        "asset_name": asset_name,
                        "downloaded_bytes": downloaded_bytes,
                        "total_bytes": total_bytes,
                        "progress_percent": 100 if total_bytes > 0 else None,
                    }
                )
                return
        except requests.RequestException as exc:
            logger.warning(
                "[Update] Download attempt %s/%s failed for %s: %s",
                attempt,
                NETWORK_RETRIES,
                asset_name,
                exc,
            )
            try:
                if dest.exists():
                    dest.unlink()
            except Exception:
                pass

            if attempt < NETWORK_RETRIES:
                time.sleep(NETWORK_BACKOFF_SECONDS * (2 ** (attempt - 1)))
            else:
                raise


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(128 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_direct_executable_asset(path: Path) -> bool:
    """Return True for directly replaceable executable assets."""
    suffix = path.suffix.lower()
    if suffix in {".exe", ".appimage"}:
        return True
    if suffix:
        return False
    return platform.system().lower() != "windows"


def _write_apply_script(
    script_path: Path, pid: int, exe_path: Path, asset_path: Path
) -> None:
    """Write OS-specific helper script to replace running executable."""
    if platform.system().lower() == "windows":
        content = f"""@echo off
setlocal
set PID={pid}
set EXE={exe_path}
set ASSET={asset_path}
set BACKUP={exe_path}.bak

timeout /t 2 /nobreak >nul
tasklist /FI "PID eq %PID%" | find "%PID%" >nul
if %ERRORLEVEL%==0 taskkill /PID %PID% /F >nul 2>&1

copy /Y "%EXE%" "%BACKUP%" >nul 2>&1
copy /Y "%ASSET%" "%EXE%" >nul 2>&1
start "" "%EXE%"
"""
    else:
        content = f"""#!/bin/sh
PID={pid}
EXE=\"{exe_path}\"
ASSET=\"{asset_path}\"
BACKUP=\"{exe_path}.bak\"

sleep 2
if kill -0 \"$PID\" >/dev/null 2>&1; then
  kill -9 \"$PID\" >/dev/null 2>&1 || true
fi

cp -f \"$EXE\" \"$BACKUP\" >/dev/null 2>&1 || true
cp -f \"$ASSET\" \"$EXE\"
chmod +x \"$EXE\" >/dev/null 2>&1 || true
nohup \"$EXE\" >/dev/null 2>&1 &
"""

    script_path.write_text(content, encoding="utf-8")
    if platform.system().lower() != "windows":
        script_path.chmod(0o700)


def _launch_apply_script(script_path: Path) -> None:
    """Launch helper script detached so current process can exit."""
    if platform.system().lower() == "windows":
        creation_flags = 0
        creation_flags |= getattr(subprocess, "DETACHED_PROCESS", 0)
        creation_flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        subprocess.Popen(
            ["cmd", "/c", str(script_path)],
            creationflags=creation_flags,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        subprocess.Popen(
            ["/bin/sh", str(script_path)],
            start_new_session=True,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def get_update_status() -> dict:
    """Return update check data plus local updater state.

    Auto-update is only supported in packaged mode (EXE).
    Source mode returns update_available=False to disable prompts.
    """
    check = check_for_updates()
    state = _read_state()
    mode = "packaged" if is_packaged_mode() else "source"
    check["mode"] = mode
    check["state"] = state

    # Disable update prompts in source mode
    if mode == "source":
        check["update_available"] = False

    logger.debug(
        "[Update] Status checked: mode=%s available=%s latest=%s state=%s",
        mode,
        check.get("update_available"),
        check.get("latest_version"),
        state.get("status"),
    )
    return check


def download_latest_release_asset() -> dict:
    """Download the latest matching release asset into local update staging dir."""
    try:
        check = check_for_updates()
        if not check.get("update_available"):
            return {
                "success": False,
                "error": "No update available.",
                "current_version": CURRENT_VERSION,
            }

        response = _get_with_retries(RELEASES_URL, timeout=10)
        releases = response.json() or []
        if not releases:
            return {"success": False, "error": "No releases found."}

        release = releases[0]
        latest_version = (release.get("tag_name") or "").lstrip("v")
        assets = release.get("assets") or []
        asset = _pick_release_asset(assets)
        if not asset:
            return {
                "success": False,
                "error": "No matching release asset found for this platform.",
                "latest_version": latest_version,
            }

        asset_name = asset.get("name") or "update.bin"
        asset_url = asset.get("browser_download_url") or ""
        if not asset_url:
            return {"success": False, "error": "Release asset has no download URL."}

        logger.info(
            "[Update] Starting asset download: version=%s asset=%s",
            latest_version,
            asset_name,
        )

        target_dir = UPDATES_DIR / latest_version
        target_dir.mkdir(parents=True, exist_ok=True)
        target_file = target_dir / asset_name
        temp_file = target_file.with_suffix(target_file.suffix + ".tmp")

        _write_state(
            {
                "status": "downloading",
                "version": latest_version,
                "asset_name": asset_name,
                "progress_percent": 0,
            }
        )

        _download_file(
            asset_url,
            temp_file,
            timeout=30,
            version=latest_version,
            asset_name=asset_name,
        )
        temp_file.replace(target_file)

        checksum = _sha256(target_file)
        _write_state(
            {
                "status": "downloaded",
                "version": latest_version,
                "asset_name": asset_name,
                "asset_path": str(target_file),
                "sha256": checksum,
                "release_url": release.get("html_url"),
                "progress_percent": 100,
            }
        )

        logger.info(
            "[Update] Download complete: version=%s asset=%s sha256=%s",
            latest_version,
            asset_name,
            checksum[:12],
        )
        return {
            "success": True,
            "latest_version": latest_version,
            "asset_name": asset_name,
            "asset_path": str(target_file),
            "sha256": checksum,
            "release_url": release.get("html_url"),
        }
    except Exception as exc:
        logger.error("[Update] Download failed: %s", exc)
        _write_state(
            {
                "status": "error",
                "error": f"Download failed: {exc}",
            }
        )
        return {
            "success": False,
            "error": f"Failed to download update: {exc}",
            "current_version": CURRENT_VERSION,
        }


def apply_update_now() -> dict:
    """Apply update immediately when safe.

    Auto-update is only supported in packaged mode (EXE).
    Source mode updates must be done manually via git pull.
    """
    if not is_packaged_mode():
        return {
            "success": False,
            "error": "Auto-update is only available when running the packaged EXE. Use 'git pull' to update from source.",
            "mode": "source",
        }

    check = check_for_updates()
    if not check.get("update_available"):
        return {"success": False, "error": "No update available."}

    # Packaged mode: apply executable replacement
    state = _read_state()
    asset_path_str = state.get("asset_path")
    asset_path = Path(asset_path_str) if asset_path_str else None

    if not asset_path or not asset_path.exists():
        try:
            download = download_latest_release_asset()
        except Exception as exc:
            logger.error("[Update] Failed to stage release asset: %s", exc)
            return {
                "success": False,
                "error": f"Failed to stage release asset: {exc}",
                "mode": "packaged",
            }
        if not download.get("success"):
            return {
                "success": False,
                "error": download.get("error") or "Failed to stage release asset.",
                "mode": "packaged",
            }
        asset_path_str = download.get("asset_path")
        asset_path = Path(asset_path_str) if asset_path_str else None
        if not asset_path or not asset_path.exists():
            return {
                "success": False,
                "error": "Downloaded update asset path is invalid.",
                "mode": "packaged",
            }

    asset_name = asset_path.name.lower()
    if asset_name.endswith((".zip", ".tar.gz", ".dmg")):
        return {
            "success": False,
            "error": "Downloaded asset is an archive/installer and cannot be auto-applied.",
            "mode": "packaged",
            "asset_path": str(asset_path),
        }
    if not _is_direct_executable_asset(asset_path):
        return {
            "success": False,
            "error": "Downloaded asset is not a direct executable for auto-apply.",
            "mode": "packaged",
            "asset_path": str(asset_path),
        }

    exe_path = Path(sys.executable)
    if not exe_path.exists():
        return {
            "success": False,
            "error": "Current executable path is missing.",
            "mode": "packaged",
            "exe_path": str(exe_path),
        }

    script_ext = ".bat" if platform.system().lower() == "windows" else ".sh"
    script_path = UPDATES_DIR / f"apply_update_{os.getpid()}{script_ext}"
    try:
        _write_apply_script(script_path, os.getpid(), exe_path, asset_path)
        _launch_apply_script(script_path)
        logger.info(
            "[Update] Launched apply helper: script=%s exe=%s asset=%s",
            script_path,
            exe_path,
            asset_path,
        )
    except Exception as exc:
        logger.error("[Update] Failed to launch update helper: %s", exc)
        return {
            "success": False,
            "error": f"Failed to launch update helper: {exc}",
            "mode": "packaged",
            "asset_path": str(asset_path),
            "exe_path": str(exe_path),
        }

    _write_state(
        {
            "status": "applying",
            "mode": "packaged",
            "asset_path": str(asset_path),
            "exe_path": str(exe_path),
            "latest_version": check.get("latest_version"),
        }
    )
    logger.info("[Update] Applying update now: latest=%s", check.get("latest_version"))
    return {
        "success": True,
        "mode": "packaged",
        "asset_path": str(asset_path),
        "exe_path": str(exe_path),
        "message": "Update is being applied now. The app will restart automatically.",
    }


def get_update_instructions() -> dict:
    """Return mode-specific update instructions for UI."""
    mode = "packaged" if is_packaged_mode() else "source"
    if mode == "source":
        return {
            "mode": mode,
            "steps": [
                "git pull --ff-only",
                "uv sync",
                "uv run main.py",
            ],
        }
    return {
        "mode": mode,
        "steps": [
            "Download the latest release asset",
            "Replace the existing executable",
            "Restart the application",
        ],
    }
