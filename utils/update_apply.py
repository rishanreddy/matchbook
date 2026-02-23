"""Apply downloaded updates using platform helper scripts."""

from __future__ import annotations

import os
import stat
import subprocess
import sys
from pathlib import Path


def _can_write_target(target_path: Path) -> bool:
    if target_path.exists():
        return os.access(target_path, os.W_OK)
    parent = target_path.parent
    return os.access(parent, os.W_OK)


def _build_windows_script(
    script_path: Path, current_exe: Path, downloaded_asset: Path, pid: int
) -> str:
    backup_exe = current_exe.with_suffix(current_exe.suffix + ".bak")
    return "\n".join(
        [
            "@echo off",
            "setlocal",
            "timeout /t 2 /nobreak >nul",
            f"taskkill /PID {pid} /F >nul 2>&1",
            f'if exist "{backup_exe}" del /f /q "{backup_exe}" >nul 2>&1',
            f'if exist "{current_exe}" move /Y "{current_exe}" "{backup_exe}" >nul 2>&1',
            f'copy /Y "{downloaded_asset}" "{current_exe}" >nul 2>&1',
            f'start "" "{current_exe}"',
            f'del /f /q "{script_path}" >nul 2>&1',
            "endlocal",
        ]
    )


def _build_unix_script(
    script_path: Path, current_exe: Path, downloaded_asset: Path, pid: int
) -> str:
    backup_exe = current_exe.with_suffix(current_exe.suffix + ".bak")
    return "\n".join(
        [
            "#!/usr/bin/env sh",
            "sleep 2",
            f"kill -TERM {pid} >/dev/null 2>&1 || true",
            f"if [ -f '{current_exe}' ]; then mv -f '{current_exe}' '{backup_exe}'; fi",
            f"cp -f '{downloaded_asset}' '{current_exe}'",
            f"chmod +x '{current_exe}' >/dev/null 2>&1 || true",
            f"'{current_exe}' >/dev/null 2>&1 &",
            f"rm -f '{script_path}'",
        ]
    )


def apply_with_helper(downloaded_asset: Path, helper_dir: Path) -> dict:
    """Create and launch a helper script to replace executable in place."""
    current_exe = Path(sys.executable).resolve()
    if not downloaded_asset.exists():
        return {"success": False, "error": "Downloaded update asset not found."}

    helper_dir.mkdir(parents=True, exist_ok=True)
    pid = os.getpid()

    if sys.platform.startswith("win"):
        script_path = helper_dir / "apply_update.bat"
        script_path.write_text(
            _build_windows_script(script_path, current_exe, downloaded_asset, pid),
            encoding="utf-8",
        )

        if _can_write_target(current_exe):
            subprocess.Popen(["cmd", "/c", str(script_path)], close_fds=True)
            return {"success": True, "requires_elevation": False}

        cmd = f"Start-Process cmd -ArgumentList '/c \"{script_path}\"' -Verb RunAs"
        subprocess.Popen(
            ["powershell", "-NoProfile", "-Command", cmd],
            close_fds=True,
        )
        return {"success": True, "requires_elevation": True}

    if not _can_write_target(current_exe):
        return {
            "success": False,
            "error": "Install location is not writable on this OS. Reinstall in a user-writable directory or run with elevated permissions.",
        }

    script_path = helper_dir / "apply_update.sh"
    script_path.write_text(
        _build_unix_script(script_path, current_exe, downloaded_asset, pid),
        encoding="utf-8",
    )
    mode = script_path.stat().st_mode
    script_path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    subprocess.Popen([str(script_path)], close_fds=True)
    return {"success": True, "requires_elevation": False}
