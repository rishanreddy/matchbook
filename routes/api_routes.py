"""API endpoint registrations."""

from __future__ import annotations

import ipaddress
import subprocess
import sys

from flask import Flask, jsonify, request

from utils.constants import CONFIG_DIR, DATA_DIR, LOG_DIR
from utils.version_check import CURRENT_VERSION, check_for_updates


def _is_loopback_client(address: str | None) -> bool:
    """Return True for loopback client addresses."""
    if not address:
        return False
    normalized = address.split("%", 1)[0]
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return normalized in {"localhost"}


def register_api_routes(app: Flask) -> None:
    """Register API and readiness endpoints."""

    @app.route("/api/open-path", methods=["POST"])
    def open_path():
        """Open key local folders in the OS file browser."""
        if not _is_loopback_client(request.remote_addr):
            app.logger.warning(
                "[OpenPath] Blocked non-local open-path request from ip=%s",
                request.remote_addr,
            )
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Endpoint allowed only on local host.",
                    }
                ),
                403,
            )

        data = request.get_json(silent=True) or {}
        target = (data.get("target") or "").strip().lower()

        allowed = {
            "config": CONFIG_DIR,
            "data": DATA_DIR,
            "logs": LOG_DIR,
        }
        folder = allowed.get(target)
        if not folder:
            app.logger.warning("[OpenPath] Unknown target requested: %s", target)
            return jsonify({"success": False, "error": "Unknown target."}), 400

        try:
            folder.mkdir(parents=True, exist_ok=True)
            if sys.platform == "darwin":
                subprocess.Popen(["open", str(folder)])
            elif sys.platform.startswith("win"):
                subprocess.Popen(["explorer", str(folder)])
            else:
                subprocess.Popen(["xdg-open", str(folder)])

            return jsonify({"success": True, "path": str(folder.resolve())})
        except Exception as exc:
            app.logger.error("Open path failed: %s", exc)
            return jsonify({"success": False, "error": str(exc)}), 500

    @app.route("/api/version", methods=["GET"])
    def api_version():
        """Return app version and update status."""
        try:
            status = check_for_updates()
            return jsonify(status)
        except Exception as exc:
            app.logger.error("Version endpoint failed: %s", exc)
            return (
                jsonify(
                    {
                        "update_available": False,
                        "current_version": CURRENT_VERSION,
                        "latest_version": None,
                        "download_url": None,
                        "error": str(exc),
                    }
                ),
                500,
            )

    @app.route("/healthz", methods=["GET"])
    def healthz():
        """Readiness endpoint for runtime checks."""
        return jsonify({"status": "ok", "version": CURRENT_VERSION}), 200
