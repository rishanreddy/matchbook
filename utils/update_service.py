"""High-level update service entrypoints used by Flask routes."""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import requests

from .update_apply import apply_with_helper
from .update_client import download_file, fetch_latest_stable_release
from .update_integrity import parse_sha256_text, verify_sha256
from .update_state import UPDATES_DIR, load_update_state, update_state
from .version_check import CURRENT_VERSION

CHECK_COOLDOWN_SECONDS = 24 * 60 * 60


def _is_packaged_mode() -> bool:
    return bool(getattr(sys, "frozen", False) or getattr(sys, "_MEIPASS", None))


def _now_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _parse_iso_datetime(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _build_status_payload(state: dict, extra: dict | None = None) -> dict:
    payload = {
        "update_available": False,
        "current_version": CURRENT_VERSION,
        "latest_version": state.get("latest_version"),
        "download_url": state.get("download_url"),
        "mode": "packaged" if _is_packaged_mode() else "source",
        "state": {
            "status": state.get("status"),
            "progress": state.get("progress"),
            "error": state.get("error"),
            "asset_path": state.get("asset_path"),
            "last_checked_at": state.get("last_checked_at"),
        },
    }
    latest = payload.get("latest_version")
    if latest:
        try:
            from packaging import version

            payload["update_available"] = version.parse(latest) > version.parse(
                CURRENT_VERSION
            )
        except Exception:
            payload["update_available"] = False

    if extra:
        payload.update(extra)
    return payload


def get_update_status(force_check: bool = False) -> dict:
    """Return cached or refreshed update status."""
    state = load_update_state()
    now = datetime.datetime.now(datetime.UTC)
    last_checked = _parse_iso_datetime(state.get("last_checked_at"))

    should_refresh = force_check
    if not should_refresh:
        if last_checked is None:
            should_refresh = True
        else:
            should_refresh = (
                now - last_checked
            ).total_seconds() >= CHECK_COOLDOWN_SECONDS

    if not should_refresh:
        return _build_status_payload(state)

    update_state(status="checking", error=None)
    try:
        latest = fetch_latest_stable_release()
        state = update_state(
            status="available" if latest.get("update_available") else "up_to_date",
            latest_version=latest.get("latest_version"),
            download_url=latest.get("download_url"),
            error=None,
            last_checked_at=_now_iso(),
        )
        return _build_status_payload(state)
    except requests.RequestException as exc:
        state = update_state(
            status="error",
            error=f"Network error while checking updates: {exc}",
            last_checked_at=_now_iso(),
        )
        return _build_status_payload(state)
    except Exception as exc:
        state = update_state(
            status="error",
            error=f"Failed to check updates: {exc}",
            last_checked_at=_now_iso(),
        )
        return _build_status_payload(state)


def download_latest_update() -> dict:
    """Download latest release asset in packaged mode only."""
    if not _is_packaged_mode():
        return {
            "success": False,
            "error": "Update download is unavailable in source mode.",
            "mode": "source",
        }

    latest = get_update_status(force_check=True)
    if not latest.get("update_available"):
        return {
            "success": False,
            "error": "No update available.",
            "mode": latest.get("mode"),
        }

    try:
        metadata = fetch_latest_stable_release()
        asset = metadata.get("asset")
        checksum_asset = metadata.get("checksum_asset")
        if not asset:
            raise RuntimeError(
                "No compatible release asset found for this operating system."
            )

        browser_download_url = asset.get("browser_download_url")
        asset_name = str(asset.get("name") or "update.exe")
        if not browser_download_url:
            raise RuntimeError("Release asset has no download URL.")

        UPDATES_DIR.mkdir(parents=True, exist_ok=True)
        final_path = UPDATES_DIR / asset_name
        part_path = Path(f"{final_path}.part")
        if part_path.exists():
            part_path.unlink()

        update_state(status="downloading", progress=5, error=None)
        download_file(browser_download_url, str(part_path))
        update_state(progress=85)
        part_path.replace(final_path)

        expected_sha256 = None
        checksum_path = None
        if checksum_asset and checksum_asset.get("browser_download_url"):
            checksum_name = str(checksum_asset.get("name") or f"{asset_name}.sha256")
            checksum_path = UPDATES_DIR / checksum_name
            download_file(
                checksum_asset.get("browser_download_url"), str(checksum_path)
            )
            checksum_text = checksum_path.read_text(encoding="utf-8", errors="replace")
            expected_sha256 = parse_sha256_text(
                checksum_text, target_filename=asset_name
            )

        state = update_state(
            status="downloaded",
            progress=100,
            asset_path=str(final_path),
            checksum_path=str(checksum_path) if checksum_path else None,
            expected_sha256=expected_sha256,
            latest_version=metadata.get("latest_version"),
            download_url=metadata.get("download_url"),
            error=None,
        )
        return {
            "success": True,
            "mode": "packaged",
            "asset_path": state.get("asset_path"),
            "latest_version": state.get("latest_version"),
        }
    except requests.RequestException as exc:
        update_state(status="error", progress=0, error=f"Download failed: {exc}")
        return {
            "success": False,
            "error": f"Download failed: {exc}",
            "mode": "packaged",
        }
    except Exception as exc:
        update_state(status="error", progress=0, error=f"Download failed: {exc}")
        return {
            "success": False,
            "error": f"Download failed: {exc}",
            "mode": "packaged",
        }


def apply_downloaded_update() -> dict:
    """Verify and apply a downloaded update in packaged mode only."""
    if not _is_packaged_mode():
        return {
            "success": False,
            "error": "Update apply is unavailable in source mode.",
            "mode": "source",
        }

    state = load_update_state()
    asset_path = state.get("asset_path")
    expected_sha256 = state.get("expected_sha256")
    if not asset_path:
        return {
            "success": False,
            "error": "No downloaded update found.",
            "mode": "packaged",
        }
    if not expected_sha256:
        return {
            "success": False,
            "error": "Missing SHA-256 sidecar checksum; cannot apply update.",
            "mode": "packaged",
        }

    asset = Path(asset_path)
    if not asset.exists():
        update_state(status="error", error="Downloaded asset is missing.")
        return {
            "success": False,
            "error": "Downloaded asset is missing.",
            "mode": "packaged",
        }

    if not verify_sha256(asset, expected_sha256):
        update_state(status="error", error="Checksum mismatch. Update aborted.")
        return {
            "success": False,
            "error": "Checksum mismatch. Update aborted.",
            "mode": "packaged",
        }

    try:
        update_state(status="applying", progress=100, error=None)
        applied = apply_with_helper(asset, UPDATES_DIR)
        if not applied.get("success"):
            update_state(status="error", error=applied.get("error") or "Apply failed")
            return {
                "success": False,
                "error": applied.get("error") or "Apply failed",
                "mode": "packaged",
            }

        update_state(status="applied", error=None)
        return {
            "success": True,
            "mode": "packaged",
            "requires_elevation": bool(applied.get("requires_elevation")),
            "message": "Update helper launched. Application will restart shortly.",
        }
    except Exception as exc:
        update_state(status="error", error=f"Apply failed: {exc}")
        return {"success": False, "error": f"Apply failed: {exc}", "mode": "packaged"}
