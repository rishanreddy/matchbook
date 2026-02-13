"""Version checking utilities."""

import requests
from packaging import version
import logging
import sys
import tomllib
from importlib import metadata
from pathlib import Path

logger = logging.getLogger(__name__)


def _read_version_from_pyproject() -> str:
    candidates = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass))

    candidates.append(Path(sys.executable).resolve().parent)
    candidates.append(Path(__file__).resolve().parent.parent)

    for base in candidates:
        path = base / "pyproject.toml"
        if path.exists():
            with path.open("rb") as f:
                data = tomllib.load(f)
            return data["project"]["version"]

    raise FileNotFoundError("pyproject.toml not found")


try:
    CURRENT_VERSION = _read_version_from_pyproject()
except Exception as e:
    logger.warning(f"Could not read version from pyproject.toml: {e}")
    try:
        CURRENT_VERSION = metadata.version("offline-scouting-manager")
    except Exception as meta_error:
        logger.warning(f"Could not read version metadata: {meta_error}")
        CURRENT_VERSION = "0.0.0"

GITHUB_REPO = "rishanreddy/Offline_Scouting_Manager"
# Use /releases endpoint to get all releases including pre-releases
RELEASES_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
DOWNLOAD_URL = f"https://github.com/{GITHUB_REPO}/releases"


def check_for_updates():
    """
    Check if a newer version is available on GitHub (includes pre-releases).

    Returns:
        dict: {
            'update_available': bool,
            'current_version': str,
            'latest_version': str,
            'download_url': str,
            'error': str (if any)
        }
    """
    result = {
        "update_available": False,
        "current_version": CURRENT_VERSION,
        "latest_version": None,
        "download_url": DOWNLOAD_URL,
        "error": None,
    }

    try:
        # Make request to GitHub API with timeout
        response = requests.get(RELEASES_URL, timeout=5)

        if response.status_code == 200:
            releases = response.json()

            # Get the first release (most recent, including pre-releases)
            if releases and len(releases) > 0:
                latest_release = releases[0]
                latest_version = latest_release.get("tag_name", "").lstrip("v")

                result["latest_version"] = latest_version

                # Use the specific release's HTML URL instead of /latest
                result["download_url"] = latest_release.get("html_url", DOWNLOAD_URL)

                # Compare versions
                if latest_version:
                    try:
                        if version.parse(latest_version) > version.parse(
                            CURRENT_VERSION
                        ):
                            result["update_available"] = True
                    except Exception as e:
                        logger.warning(f"Could not parse version numbers: {e}")
            else:
                result["error"] = "No releases found"
        elif response.status_code == 404:
            # No releases published yet
            result["error"] = "No releases found"
            logger.debug(
                "No GitHub releases found - this is normal for new repositories"
            )
        else:
            result["error"] = f"GitHub API returned status {response.status_code}"

    except requests.Timeout:
        result["error"] = "Request timed out"
        logger.debug("GitHub version check timed out")
    except requests.RequestException as e:
        result["error"] = f"Network error: {str(e)}"
        logger.debug(f"Could not check for updates: {e}")
    except Exception as e:
        result["error"] = f"Unexpected error: {str(e)}"
        logger.error(f"Unexpected error checking for updates: {e}")

    return result
