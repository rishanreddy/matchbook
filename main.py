"""Application entrypoint and Flask app bootstrap."""

from __future__ import annotations

import argparse
import datetime
import logging
import os
import sys
import threading
import time
import webbrowser
from logging.handlers import RotatingFileHandler
from urllib.parse import urlparse

from flask import Flask, abort, g, redirect, request, url_for

from routes import (
    register_analysis_routes,
    register_api_routes,
    register_error_handlers,
    register_scouting_routes,
    register_settings_routes,
)
from utils.app_state import load_app_state
from utils.config import get_secret_key, load_config
from utils.constants import LOG_DIR
from utils.formatting import format_device_id
from utils.version_check import CURRENT_VERSION

app = Flask(__name__)

# Persistent secret key for session encryption
app.secret_key = get_secret_key()

# Basic security and upload limits
app.config.update(
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    MAX_FORM_MEMORY_SIZE=500 * 1024,
    MAX_FORM_PARTS=1_000,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_NAME="osm_session",
    SESSION_COOKIE_SECURE=(os.environ.get("OSM_SESSION_COOKIE_SECURE", "0") == "1"),
    PERMANENT_SESSION_LIFETIME=datetime.timedelta(hours=12),
)

# Logging
log_file = LOG_DIR / "app.log"
handler = RotatingFileHandler(log_file, maxBytes=1_000_000, backupCount=3)
handler.setLevel(logging.INFO)
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s"))

existing_rotating = [
    h
    for h in app.logger.handlers
    if isinstance(h, RotatingFileHandler)
    and getattr(h, "baseFilename", None) == str(log_file)
]
if not existing_rotating:
    app.logger.addHandler(handler)
app.logger.setLevel(logging.INFO)
app.logger.info("App started")

# Modular route/handler registration
register_api_routes(app)
register_error_handlers(app)
register_settings_routes(app)
register_analysis_routes(app)
register_scouting_routes(app)


def _get_request_source_host() -> str | None:
    """Extract source host from Origin/Referer headers."""
    source = (request.headers.get("Origin") or request.headers.get("Referer") or "").strip()
    if not source:
        return None
    parsed = urlparse(source)
    return parsed.netloc or None


def _env_int(name: str, default: int, min_value: int, max_value: int) -> int:
    """Return bounded int value from environment variable."""
    raw_value = os.environ.get(name, "").strip()
    if not raw_value:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        app.logger.warning("Invalid %s=%r. Using default=%s", name, raw_value, default)
        return default

    if value < min_value:
        app.logger.warning("%s=%s below min=%s. Clamping.", name, value, min_value)
        return min_value
    if value > max_value:
        app.logger.warning("%s=%s above max=%s. Clamping.", name, value, max_value)
        return max_value
    return value


@app.context_processor
def inject_version():
    """Inject app version and formatting helpers into templates."""
    return {"app_version": CURRENT_VERSION, "format_device_id": format_device_id}


@app.before_request
def log_request_start():
    """Record request start time and basic request metadata."""
    g.request_started_at = time.perf_counter()
    if request.path.startswith("/static/"):
        return None

    app.logger.info(
        "[HTTP] --> %s %s endpoint=%s ip=%s",
        request.method,
        request.path,
        request.endpoint,
        request.remote_addr,
    )
    return None


@app.after_request
def log_request_end(response):
    """Log request completion status and latency."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers[
        "Content-Security-Policy"
    ] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"

    if request.path.startswith("/static/"):
        return response

    started = getattr(g, "request_started_at", None)
    elapsed_ms = None
    if started is not None:
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

    app.logger.info(
        "[HTTP] <-- %s %s status=%s duration_ms=%s",
        request.method,
        request.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.before_request
def enforce_setup_wizard():
    """Redirect all routes to setup wizard until app setup is complete."""
    if request.endpoint in {
        "setup_wizard",
        "static",
        "open_path",
        "api_version",
        "healthz",
    }:
        return None
    if request.path.startswith("/static/"):
        return None

    _, event, _, _ = load_config()
    state = load_app_state()
    last_version = state.get("last_version")

    if last_version != CURRENT_VERSION:
        app.logger.info("[Setup] Redirecting to setup wizard due to new app version")
        return redirect(url_for("setup_wizard"))

    if not event.get("name"):
        app.logger.info("[Setup] Redirecting to setup wizard due to missing event name")
        return redirect(url_for("setup_wizard"))
    return None


@app.before_request
def enforce_request_origin():
    """Block cross-site state-changing requests."""
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return None
    if request.endpoint == "static":
        return None

    source_host = _get_request_source_host()
    if source_host and source_host != request.host:
        app.logger.warning(
            "[Security] Blocked request with mismatched origin host=%s source=%s path=%s",
            request.host,
            source_host,
            request.path,
        )
        abort(400, description="Invalid request origin.")
    return None


def open_browser_for_server(host: str, port: int, delay_seconds: float = 0.8) -> None:
    """Open the local app URL in the default browser without blocking startup."""
    open_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    url = f"http://{open_host}:{port}"

    def _open() -> None:
        time.sleep(delay_seconds)
        try:
            webbrowser.open(url, new=2)
        except Exception as exc:
            app.logger.warning("Failed to auto-open browser for %s: %s", url, exc)

    threading.Thread(target=_open, daemon=True).start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run the Offline Scouting Manager server."
    )
    parser.add_argument(
        "--dev", action="store_true", help="Run with Flask debug development server."
    )
    parser.add_argument(
        "--lan",
        action="store_true",
        help="Bind to 0.0.0.0 for LAN access in production mode.",
    )
    parser.add_argument("--host", type=str, help="Explicit host override.")
    parser.add_argument("--port", type=int, help="Explicit port override.")
    parser.add_argument(
        "--version", action="store_true", help="Print the application version and exit."
    )
    args = parser.parse_args()

    if args.version:
        print(CURRENT_VERSION)
        sys.exit(0)

    host = (args.host or "").strip()
    if not host:
        host = "127.0.0.1"

    if args.dev:
        port = args.port if args.port is not None else 5000
        if not (1 <= port <= 65535):
            parser.error("--port must be between 1 and 65535")
        app.run(debug=True, host=host, port=port)
    else:
        from waitress import serve

        if args.lan and not args.host:
            host = "0.0.0.0"

        port = args.port if args.port is not None else 8080
        if not (1 <= port <= 65535):
            parser.error("--port must be between 1 and 65535")

        open_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
        print("Starting in production mode (Waitress)...")
        print(f"Serving on http://{host}:{port}")
        print(f"Opening browser at http://{open_host}:{port}")

        waitress_threads = _env_int("OSM_WAITRESS_THREADS", 6, 1, 64)
        waitress_connection_limit = _env_int(
            "OSM_WAITRESS_CONNECTION_LIMIT", 100, 10, 2000
        )
        waitress_backlog = _env_int("OSM_WAITRESS_BACKLOG", 1024, 128, 8192)

        open_browser_for_server(host, port)
        serve(
            app,
            host=host,
            port=port,
            threads=waitress_threads,
            connection_limit=waitress_connection_limit,
            backlog=waitress_backlog,
            ident="offline-scouting-manager",
        )
