"""GitHub release update client with stable-only filtering."""

from __future__ import annotations

import platform
import sys
import time

import requests
from packaging import version

from .version_check import CURRENT_VERSION

GITHUB_REPO = "rishanreddy/Offline_Scouting_Manager"
RELEASES_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
REQUEST_TIMEOUT_SECONDS = 10
NETWORK_RETRIES = 3
BACKOFF_BASE_SECONDS = 0.75


def _platform_os_key() -> str:
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def _platform_arch_key() -> str:
    machine = platform.machine().lower()
    mapping = {
        "amd64": "x86_64",
        "x86_64": "x86_64",
        "x64": "x86_64",
        "arm64": "arm64",
        "aarch64": "arm64",
    }
    return mapping.get(machine, machine or "x86_64")


def _retry_get_json(url: str) -> list[dict]:
    last_error = None
    for attempt in range(1, NETWORK_RETRIES + 1):
        try:
            response = requests.get(
                url,
                timeout=REQUEST_TIMEOUT_SECONDS,
                headers={"Accept": "application/vnd.github+json"},
            )
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list):
                return data
            raise requests.RequestException("Unexpected API payload")
        except requests.RequestException as exc:
            last_error = exc
            if attempt < NETWORK_RETRIES:
                time.sleep(BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))

    if last_error is not None:
        raise last_error
    raise requests.RequestException("Unknown network error")


def _is_newer_version(tag_name: str) -> bool:
    clean_tag = str(tag_name or "").lstrip("v")
    if not clean_tag:
        return False
    try:
        return version.parse(clean_tag) > version.parse(CURRENT_VERSION)
    except Exception:
        return False


def _find_sha256_asset(assets: list[dict], target_name: str) -> dict | None:
    lowered = target_name.lower()
    for asset in assets:
        name = str(asset.get("name") or "")
        n = name.lower()
        if n == f"{lowered}.sha256" or (n.endswith(".sha256") and lowered in n):
            return asset
    for asset in assets:
        name = str(asset.get("name") or "").lower()
        if name.endswith(".sha256"):
            return asset
    return None


def _pick_main_asset(assets: list[dict]) -> dict | None:
    os_key = _platform_os_key()
    arch_key = _platform_arch_key()
    candidates = []

    def is_sidecar(name_lower: str) -> bool:
        return name_lower.endswith(".sha256") or name_lower.endswith(".manifest.json")

    def is_archive(name_lower: str) -> bool:
        return name_lower.endswith(
            (".zip", ".tar.gz", ".tgz", ".dmg", ".pkg", ".deb", ".rpm")
        )

    def is_direct_binary(name: str) -> bool:
        lower = name.lower()
        if os_key == "windows":
            return lower.endswith(".exe")
        if is_sidecar(lower) or is_archive(lower):
            return False
        return True

    def score(asset: dict) -> tuple[int, int]:
        name = str(asset.get("name") or "")
        lower = name.lower()
        token_score = 0
        if f"-{os_key}-{arch_key}" in lower:
            token_score += 6
        if f"-{os_key}" in lower:
            token_score += 3
        if arch_key in lower:
            token_score += 2
        if "offlinescoutingmanager" in lower:
            token_score += 1
        size = int(asset.get("size") or 0)
        return (token_score, size)

    for asset in assets:
        name = str(asset.get("name") or "")
        lower = name.lower()
        if is_sidecar(lower):
            continue
        if not is_direct_binary(name):
            continue
        candidates.append(asset)

    if candidates:
        candidates.sort(key=score, reverse=True)
        return candidates[0]
    return None


def fetch_latest_stable_release() -> dict:
    """Fetch latest stable release metadata and selected assets."""
    releases = _retry_get_json(RELEASES_URL)

    for release in releases:
        if release.get("draft") or release.get("prerelease"):
            continue

        tag_name = str(release.get("tag_name") or "")
        latest_version = tag_name.lstrip("v")
        assets = release.get("assets") or []
        main_asset = _pick_main_asset(assets)
        checksum_asset = None
        if main_asset is not None:
            checksum_asset = _find_sha256_asset(
                assets, str(main_asset.get("name") or "")
            )

        return {
            "update_available": _is_newer_version(tag_name),
            "current_version": CURRENT_VERSION,
            "latest_version": latest_version or None,
            "download_url": release.get("html_url"),
            "release_id": release.get("id"),
            "asset": main_asset,
            "checksum_asset": checksum_asset,
        }

    return {
        "update_available": False,
        "current_version": CURRENT_VERSION,
        "latest_version": None,
        "download_url": f"https://github.com/{GITHUB_REPO}/releases",
        "release_id": None,
        "asset": None,
        "checksum_asset": None,
    }


def download_file(url: str, destination: str) -> None:
    """Download a file with retries to a destination path."""
    last_error = None
    for attempt in range(1, NETWORK_RETRIES + 1):
        try:
            with requests.get(
                url, timeout=REQUEST_TIMEOUT_SECONDS, stream=True
            ) as response:
                response.raise_for_status()
                with open(destination, "wb") as f:
                    for chunk in response.iter_content(chunk_size=1024 * 128):
                        if chunk:
                            f.write(chunk)
            return
        except requests.RequestException as exc:
            last_error = exc
            if attempt < NETWORK_RETRIES:
                time.sleep(BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))

    if last_error is not None:
        raise last_error
    raise requests.RequestException("Unknown download error")
