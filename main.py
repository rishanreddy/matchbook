# app_scout.py
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    send_file,
    abort,
    session,
    jsonify,
    g,
)
import csv
import datetime
import logging
import shutil
import re
import json
import subprocess
import sys
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

import yaml

from utils import (
    load_config,
    collect_survey_elements,
    get_survey_field_names,
    append_row,
    get_device,
    get_stats,
    CSV_FILE,
    CONFIG_DIR,
    DATA_DIR,
    TEMP_EXPORTS_DIR,
    BACKUP_DIR,
    LOG_DIR,
    DEVICE_FILE,
    TEMP_UPLOADS_DIR,
    validate_required_fields,
    calculate_team_stats,
    get_all_teams_summary,
    get_radar_data,
    REQUIRED_SURVEY_FIELD_GROUPS,
    SYSTEM_FIELD_DEFAULTS,
    REQUIRED_FIELDS,
    save_uploaded_file,
    load_combined_data_from_temp,
    clear_temp_uploads,
    build_display_rows,
    build_choice_label_maps,
    build_choice_display_entries,
    backup_config,
    save_config,
    get_secret_key,
    APP_STATE_FILE,
    CURRENT_VERSION,
    get_update_status,
    download_latest_release_asset,
    apply_update_now,
    get_update_instructions,
)

app = Flask(__name__)

# Persistent secret key for session encryption
app.secret_key = get_secret_key()

# Basic security and upload limits
app.config.update(
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

# Logging
log_file = LOG_DIR / "app.log"

handler = RotatingFileHandler(log_file, maxBytes=1_000_000, backupCount=3)
handler.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
handler.setFormatter(formatter)
app.logger.addHandler(handler)
app.logger.setLevel(logging.INFO)
app.logger.info("App started")


# Make version available to all templates
@app.context_processor
def inject_version():
    def format_device_id(value: str | None, compact: bool = False) -> str:
        """Format device IDs for human-readable display without changing identity."""
        text = str(value or "").strip()
        if not text:
            return ""

        if text.startswith("osm_did_v2_"):
            token = text[len("osm_did_v2_") :]
            grouped = "-".join(token[idx : idx + 4] for idx in range(0, len(token), 4))
            text = f"osm-v2-{grouped}"

        if compact and len(text) > 28:
            return f"{text[:12]}...{text[-8:]}"
        return text

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


def load_app_state() -> dict:
    """Load persisted app state from config directory."""
    if APP_STATE_FILE.exists():
        try:
            state = json.loads(APP_STATE_FILE.read_text(encoding="utf-8"))
            app.logger.debug("[State] Loaded app state keys=%s", list(state.keys()))
            return state
        except json.JSONDecodeError:
            app.logger.warning(
                "[State] Invalid JSON in %s; resetting state", APP_STATE_FILE
            )
            return {}
    return {}


def save_app_state(state: dict) -> None:
    """Persist app state to disk."""
    APP_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    APP_STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    app.logger.info("[State] Saved app state keys=%s", list(state.keys()))


def reset_local_data() -> None:
    """Clear local scouting data files."""
    app.logger.info("[Reset] Clearing local scouting data and temp exports/uploads")
    if CSV_FILE.exists():
        ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        backup_path = BACKUP_DIR / f"scouting_data_{ts}.csv"
        shutil.copy(CSV_FILE, backup_path)
        CSV_FILE.unlink(missing_ok=True)
        app.logger.info("[Reset] Backed up and removed CSV: %s", backup_path)

    # Preserve device ID across resets so this device remains stable for sync analysis.
    app.logger.debug("[Reset] Preserving device file: %s", DEVICE_FILE)

    for temp_dir in [TEMP_UPLOADS_DIR, TEMP_EXPORTS_DIR]:
        if temp_dir.exists():
            for item in temp_dir.glob("*"):
                if item.is_file():
                    item.unlink(missing_ok=True)
    app.logger.info("[Reset] Completed local data reset")


@app.before_request
def enforce_setup_wizard():
    if request.endpoint in {
        "setup_wizard",
        "static",
        "version_info",
        "update_check",
        "update_download",
        "update_apply",
        "update_instructions",
        "open_path",
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


def sanitize_filename(value: str) -> str:
    """Sanitize a string for safe filenames."""
    text = (value or "").strip().replace(" ", "_")
    text = re.sub(r"[^A-Za-z0-9._-]", "", text)
    return text or "file"


def ensure_system_fields(schema: dict) -> tuple[dict, list[str]]:
    """Ensure required system fields exist in SurveyJS schema."""
    if not isinstance(schema, dict):
        return {"elements": []}, [item["name"] for item in SYSTEM_FIELD_DEFAULTS]

    current_names = set(get_survey_field_names(schema))
    added: list[str] = []

    if isinstance(schema.get("pages"), list) and schema.get("pages"):
        first_page = schema["pages"][0]
        if not isinstance(first_page, dict):
            first_page = {}
            schema["pages"][0] = first_page
        if not isinstance(first_page.get("elements"), list):
            first_page["elements"] = []
        target_elements = first_page["elements"]
    else:
        if not isinstance(schema.get("elements"), list):
            schema["elements"] = []
        target_elements = schema["elements"]

    for field in reversed(SYSTEM_FIELD_DEFAULTS):
        name = field["name"]
        if name in current_names:
            continue
        target_elements.insert(0, dict(field))
        current_names.add(name)
        added.insert(0, name)

    return schema, added


def sanitize_graph_field_config(
    raw_graph_config, available_field_names: list[str]
) -> list[dict]:
    """Normalize graph field configuration from UI payload."""
    if not isinstance(raw_graph_config, list):
        return []

    allowed_chart_types = {"line", "bar", "radar", "pie", "doughnut"}
    available = set(available_field_names)
    result = []
    seen = set()

    for item in raw_graph_config:
        if not isinstance(item, dict):
            continue

        field = str(item.get("field") or "").strip()
        if not field or field in seen or field not in available:
            continue

        enabled = bool(item.get("enabled", True))

        chart_type = str(item.get("chart_type") or "line").strip().lower()
        if chart_type not in allowed_chart_types:
            chart_type = "line"

        seen.add(field)
        result.append(
            {
                "field": field,
                "enabled": enabled,
                "chart_type": chart_type,
            }
        )

    return result


def get_enabled_graph_fields(analysis_cfg: dict | None) -> list[dict]:
    """Return normalized enabled graph fields for chart generation."""
    items = []
    for item in (analysis_cfg or {}).get("graph_fields", []):
        if isinstance(item, dict):
            field = str(item.get("field") or "").strip()
            enabled = item.get("enabled", True)
            chart_type = str(item.get("chart_type") or "line").strip().lower()
        else:
            field = str(item or "").strip()
            enabled = True
            chart_type = "line"

        if not field or not bool(enabled):
            continue

        items.append({"field": field, "chart_type": chart_type})
    return items


def build_graph_field_options(
    survey_json: dict, analysis_cfg: dict | None = None
) -> list[dict]:
    """Build graph-field option metadata for settings UI."""
    configured_fields = set()
    for item in (analysis_cfg or {}).get("graph_fields", []):
        if isinstance(item, dict):
            name = str(item.get("field") or "").strip()
        else:
            name = str(item or "").strip()
        if name:
            configured_fields.add(name)

    options: list[dict] = []
    seen = set()
    for element in collect_survey_elements(survey_json or {}):
        if not isinstance(element, dict):
            continue

        name = str(element.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)

        field_type = str(element.get("type") or "text").strip().lower()
        input_type = str(element.get("inputType") or "").strip().lower()
        is_system_field = name in {"auto_score", "teleop_score"}
        is_analysis_friendly = (
            field_type in {"rating", "dropdown", "radiogroup", "boolean", "checkbox"}
            or (field_type == "text" and input_type == "number")
            or is_system_field
        )

        options.append(
            {
                "name": name,
                "title": str(element.get("title") or name),
                "type": field_type,
                "input_type": input_type,
                "is_system_field": is_system_field,
                "enabled_default": (name in configured_fields) or is_analysis_friendly,
            }
        )

    return options


def normalize_settings_graph_payload(raw_graph_config) -> list[dict]:
    """Convert settings UI graph payload into sanitize_graph_field_config format."""
    if not isinstance(raw_graph_config, list):
        return []

    normalized = []
    for item in raw_graph_config:
        if not isinstance(item, dict):
            continue

        field = str(item.get("field") or item.get("name") or "").strip()
        if not field:
            continue

        include = item.get("enabled")
        if include is None:
            include = item.get("include")
        if include is None:
            include = True

        normalized.append(
            {
                "field": field,
                "enabled": bool(include),
                "chart_type": str(item.get("chart_type") or "line").strip().lower(),
            }
        )

    return normalized


def build_settings_graph_config_json(analysis_cfg: dict | None) -> str:
    """Serialize current graph settings for Settings page editing."""
    rows = []
    for item in (analysis_cfg or {}).get("graph_fields", []):
        if isinstance(item, dict):
            field = str(item.get("field") or "").strip()
            chart_type = str(item.get("chart_type") or "line").strip().lower()
            include = bool(item.get("enabled", True))
        else:
            field = str(item or "").strip()
            chart_type = "line"
            include = True
        if not field:
            continue
        rows.append(
            {
                "name": field,
                "title": field.replace("_", " ").title(),
                "include": include,
                "chart_type": chart_type,
            }
        )
    return json.dumps(rows)


# --- Flask routes ---


@app.route("/", methods=["GET"])
def show_form():
    """Render the scouting form page (Scouting tab)."""
    device_cfg, event, _, survey_json = load_config()
    device_id = get_device(device_cfg)

    try:
        validate_required_fields(survey_json)
    except ValueError as e:
        app.logger.error(f"Configuration validation failed: {e}")
        return render_template(
            "error.html",
            error_code=500,
            error_message=f"Configuration error: {str(e)}. Please update your form in Settings.",
        ), 500

    stats = get_stats()

    if not event.get("name"):
        app.logger.info("[Scouting] Missing event config; redirecting to setup wizard")
        return redirect(url_for("setup_wizard"))

    data_path = str(CSV_FILE.resolve())

    survey_json_str = json.dumps(survey_json) if survey_json else "{}"

    app.logger.debug(
        "[Scouting] Rendering form event=%s device_id=%s entries=%s",
        event.get("name") or "",
        device_id,
        stats.get("entries"),
    )

    return render_template(
        "index.html",
        event=event,
        stats=stats,
        device_name=device_id,
        data_path=data_path,
        survey_json=survey_json_str,
    )


@app.route("/settings", methods=["GET", "POST"])
def settings():
    """Settings page for configuring event, device, and form fields."""
    device_cfg, event, analysis_cfg, survey_json = load_config()
    device_id = get_device(device_cfg)

    error = None
    saved = request.args.get("saved") == "1"
    reset_done = request.args.get("reset") == "1"

    if request.method == "POST":
        event_name = (request.form.get("event_name") or "").strip()
        event_season = (request.form.get("event_season") or "").strip()
        graph_config_raw = (request.form.get("graph_config_json") or "").strip()

        matches_per_page_raw = (request.form.get("matches_per_page") or "").strip()
        matches_per_page = analysis_cfg.get("matches_per_page", 25)
        if matches_per_page_raw.isdigit():
            matches_per_page = max(5, min(500, int(matches_per_page_raw)))

        errors = []

        if not event_name:
            errors.append("Event name is required.")

        if errors:
            error = " ".join(errors)
        else:
            updated_device = {"uniqueId": str(device_id)}

            updated_event = {
                "name": str(event_name),
                "season": str(event_season or ""),
            }
            config_id = event.get("config_id") if isinstance(event, dict) else None
            if config_id:
                updated_event["config_id"] = str(config_id)

            updated_analysis = dict(analysis_cfg or {})
            updated_analysis["matches_per_page"] = matches_per_page

            field_names = get_survey_field_names(survey_json or {})
            parsed_graph_config = []
            if graph_config_raw:
                try:
                    parsed_graph_config = json.loads(graph_config_raw)
                except json.JSONDecodeError:
                    parsed_graph_config = []
            updated_analysis["graph_fields"] = sanitize_graph_field_config(
                normalize_settings_graph_payload(parsed_graph_config),
                field_names,
            )

            backup_config()
            save_config(
                updated_device,
                updated_event,
                updated_analysis,
                survey_json,
            )

            app.logger.info(
                "[Settings] Saved event=%s season=%s matches_per_page=%s device_id=%s",
                event_name,
                event_season,
                matches_per_page,
                device_id,
            )

            state = load_app_state()
            state["last_version"] = CURRENT_VERSION
            save_app_state(state)
            return redirect(url_for("settings", saved="1"))

    return render_template(
        "settings.html",
        event=event,
        device_id=device_id,
        analysis=analysis_cfg,
        graph_field_options=build_graph_field_options(survey_json, analysis_cfg),
        graph_config_json=build_settings_graph_config_json(analysis_cfg),
        error=error,
        saved=saved,
        reset_done=reset_done,
    )


@app.route("/settings/form-builder", methods=["GET", "POST"])
def form_builder():
    """Full-page SurveyJS form builder."""
    device_cfg, event, analysis_cfg, survey_json = load_config()

    error = None
    saved = request.args.get("saved") == "1"
    auto_added = [
        item.strip()
        for item in (request.args.get("auto_added") or "").split(",")
        if item.strip()
    ]

    if request.method == "POST":
        survey_json_raw = (request.form.get("survey_json") or "").strip()

        if not survey_json_raw:
            error = "Survey JSON is required."
        else:
            try:
                new_survey_json = json.loads(survey_json_raw)
                new_survey_json, inserted_fields = ensure_system_fields(new_survey_json)

                field_names = get_survey_field_names(new_survey_json)
                if not field_names:
                    error = "Survey JSON must include at least one field element."
                else:
                    try:
                        validate_required_fields(new_survey_json)
                    except ValueError as exc:
                        error = str(exc)

                if not error:
                    updated_analysis = dict(analysis_cfg or {})
                    updated_analysis["graph_fields"] = sanitize_graph_field_config(
                        updated_analysis.get("graph_fields", []),
                        field_names,
                    )

                    backup_config()
                    save_config(device_cfg, event, updated_analysis, new_survey_json)
                    app.logger.info(
                        "[FormBuilder] Saved schema fields=%s graph_fields=%s auto_added=%s",
                        len(field_names),
                        len(updated_analysis.get("graph_fields", [])),
                        ",".join(inserted_fields) if inserted_fields else "none",
                    )
                    return redirect(
                        url_for(
                            "form_builder",
                            saved="1",
                            auto_added=",".join(inserted_fields),
                        )
                    )
            except json.JSONDecodeError as exc:
                error = f"Invalid JSON syntax: {str(exc)}"
                app.logger.warning("[FormBuilder] Invalid JSON submission: %s", exc)

    survey_json_str = (
        json.dumps(survey_json, indent=2) if survey_json else '{"elements": []}'
    )

    return render_template(
        "form_builder.html",
        event=event,
        survey_json_str=survey_json_str,
        required_field_groups=REQUIRED_SURVEY_FIELD_GROUPS,
        strict_required_fields=REQUIRED_FIELDS,
        error=error,
        saved=saved,
        auto_added=auto_added,
    )


@app.route("/api/form-builder/autosave", methods=["POST"])
def form_builder_autosave():
    """Autosave SurveyJS schema from form builder."""
    device_cfg, event, analysis_cfg, _survey_json = load_config()

    payload = request.get_json(silent=True) or {}
    survey_payload = payload.get("survey_json")
    if not isinstance(survey_payload, dict):
        return jsonify(
            {"success": False, "error": "survey_json must be an object"}
        ), 400

    try:
        normalized_schema, inserted_fields = ensure_system_fields(survey_payload)
        validate_required_fields(normalized_schema)
    except ValueError as exc:
        app.logger.warning("[FormBuilder] Autosave validation failed: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 400

    field_names = get_survey_field_names(normalized_schema)
    updated_analysis = dict(analysis_cfg or {})
    updated_analysis["graph_fields"] = sanitize_graph_field_config(
        updated_analysis.get("graph_fields", []),
        field_names,
    )

    save_config(device_cfg, event, updated_analysis, normalized_schema)
    app.logger.info(
        "[FormBuilder] Autosaved schema fields=%s auto_added=%s",
        len(field_names),
        ",".join(inserted_fields) if inserted_fields else "none",
    )
    return jsonify({"success": True, "auto_added": inserted_fields})


@app.route("/api/settings/autosave", methods=["POST"])
def settings_autosave():
    """Autosave settings changes without full page reload."""
    device_cfg, event, analysis_cfg, survey_json = load_config()

    payload = request.get_json(silent=True) or {}
    event_name = str(payload.get("event_name") or "").strip()
    event_season = str(payload.get("event_season") or "").strip()
    matches_per_page_raw = str(payload.get("matches_per_page") or "").strip()
    graph_config_raw = str(payload.get("graph_config_json") or "").strip()

    if not event_name:
        return jsonify({"success": False, "error": "Event name is required."}), 400

    matches_per_page = analysis_cfg.get("matches_per_page", 25)
    if matches_per_page_raw:
        if not matches_per_page_raw.isdigit():
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Matches per page must be a number between 5 and 500.",
                    }
                ),
                400,
            )
        matches_per_page = max(5, min(500, int(matches_per_page_raw)))

    parsed_graph_config = []
    if graph_config_raw:
        try:
            parsed_graph_config = json.loads(graph_config_raw)
        except json.JSONDecodeError:
            parsed_graph_config = []

    field_names = get_survey_field_names(survey_json or {})
    updated_analysis = dict(analysis_cfg or {})
    updated_analysis["matches_per_page"] = matches_per_page
    updated_analysis["graph_fields"] = sanitize_graph_field_config(
        normalize_settings_graph_payload(parsed_graph_config),
        field_names,
    )

    updated_event = {
        "name": event_name,
        "season": event_season,
    }
    config_id = event.get("config_id") if isinstance(event, dict) else None
    if config_id:
        updated_event["config_id"] = str(config_id)

    updated_device = {"uniqueId": str(get_device(device_cfg))}
    save_config(updated_device, updated_event, updated_analysis, survey_json)
    app.logger.info(
        "[Settings] Autosaved event=%s season=%s matches_per_page=%s graph_fields=%s",
        event_name,
        event_season,
        matches_per_page,
        len(updated_analysis.get("graph_fields", [])),
    )
    return jsonify({"success": True})


@app.route("/settings/reset", methods=["POST"])
def settings_reset():
    try:
        reset_local_data()
        app.logger.info("[Settings] Local data reset completed")
    except Exception as exc:
        app.logger.error("Settings reset failed: %s", exc)
        return (
            render_template(
                "error.html",
                title="Reset Failed",
                message="Unable to clear local data. Please check file permissions.",
            ),
            500,
        )

    return redirect(url_for("settings", reset="1"))


@app.route("/settings/export-setup", methods=["GET"])
def export_setup():
    """Export setup file for sharing across devices."""
    _, event, analysis_cfg, survey_json = load_config()

    setup_data = {
        "setup_version": 1,
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
        "event": event,
        "survey_json": survey_json,
        "analysis": analysis_cfg,
    }

    event_name = sanitize_filename(event.get("name") or "event")
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"setup_{event_name}_{ts}.yaml"
    export_path = TEMP_EXPORTS_DIR / filename

    with export_path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(setup_data, f, sort_keys=False)

    app.logger.info("[Setup] Exported setup file: %s", export_path)

    return send_file(
        export_path,
        as_attachment=True,
        download_name=filename,
        mimetype="text/yaml",
    )


@app.route("/setup", methods=["GET", "POST"])
def setup_wizard():
    """First-time setup wizard."""
    device_cfg, event, analysis_cfg, survey_json = load_config()
    device_id = get_device(device_cfg)

    # If already configured and version seen, skip wizard
    if request.method == "GET":
        state = load_app_state()
        if event.get("name") and state.get("last_version") == CURRENT_VERSION:
            app.logger.info(
                "[Setup] Setup already complete for current version; redirecting"
            )
            return redirect(url_for("show_form"))
        return render_template(
            "setup_wizard.html",
            current_version=CURRENT_VERSION,
            device_id_preview=device_id,
        )

    if request.form.get("skip_setup") == "1":
        # Skip wizard requires existing event configuration
        if not event.get("name"):
            return render_template(
                "setup_wizard.html",
                current_version=CURRENT_VERSION,
                device_id_preview=device_id,
                error="Skip wizard requires an existing event. Please enter values or import a setup file.",
            )
        data_action = (request.form.get("data_action") or "keep").strip()
        if data_action == "reset":
            reset_local_data()
            app.logger.info("[Setup] Skip setup requested with data reset")
        state = load_app_state()
        state["last_version"] = CURRENT_VERSION
        save_app_state(state)
        app.logger.info("[Setup] Wizard skipped; using existing settings")
        return redirect(url_for("show_form"))

    data_action = (request.form.get("data_action") or "keep").strip()
    if data_action == "reset":
        reset_local_data()
        app.logger.info("[Setup] Data reset selected during setup")

    event_name = (request.form.get("event_name") or "").strip()
    event_season = (request.form.get("season") or "").strip()
    setup_file = request.files.get("setup_file")

    setup_payload = None
    if setup_file and setup_file.filename:
        filename = setup_file.filename.lower()
        if not (filename.endswith(".yaml") or filename.endswith(".yml")):
            return render_template(
                "setup_wizard.html",
                current_version=CURRENT_VERSION,
                device_id_preview=device_id,
                error="Setup file must be a .yaml file.",
            )
        try:
            content = setup_file.read().decode("utf-8")
            setup_payload = yaml.safe_load(content) or {}
            if not isinstance(setup_payload, dict):
                return render_template(
                    "setup_wizard.html",
                    current_version=CURRENT_VERSION,
                    device_id_preview=device_id,
                    error="Setup file must be a YAML object.",
                )
            app.logger.info("[Setup] Imported setup file: %s", setup_file.filename)
        except Exception:
            return render_template(
                "setup_wizard.html",
                current_version=CURRENT_VERSION,
                device_id_preview=device_id,
                error="Setup file could not be read.",
            )

    template_analysis = analysis_cfg
    template_event = {"name": event_name, "season": event_season}
    template_survey_json = survey_json

    if setup_payload:
        imported_event = setup_payload.get("event")
        if isinstance(imported_event, dict):
            template_event = imported_event
        elif imported_event is not None:
            app.logger.warning(
                "[Setup] Imported event payload is not an object; using form values"
            )
        imported_survey_json = setup_payload.get("survey_json")
        if not isinstance(imported_survey_json, dict):
            return render_template(
                "setup_wizard.html",
                current_version=CURRENT_VERSION,
                device_id_preview=device_id,
                error=(
                    "Setup file must include a valid survey_json object with required fields: "
                    + ", ".join(
                        [group["label"] for group in REQUIRED_SURVEY_FIELD_GROUPS]
                    )
                    + "."
                ),
            )
        try:
            validate_required_fields(imported_survey_json)
        except ValueError as exc:
            return render_template(
                "setup_wizard.html",
                current_version=CURRENT_VERSION,
                device_id_preview=device_id,
                error=(
                    f"Setup file survey_json is missing required fields. Details: {exc}"
                ),
            )
        template_survey_json = imported_survey_json
        imported_analysis = setup_payload.get("analysis")
        if isinstance(imported_analysis, dict):
            template_analysis = imported_analysis

    if not template_survey_json or not isinstance(template_survey_json, dict):
        return render_template(
            "setup_wizard.html",
            current_version=CURRENT_VERSION,
            device_id_preview=device_id,
            error="Setup file must include a valid survey_json schema.",
        )

    try:
        validate_required_fields(template_survey_json)
    except ValueError as exc:
        return render_template(
            "setup_wizard.html",
            current_version=CURRENT_VERSION,
            device_id_preview=device_id,
            error=f"Setup form is missing required fields. Details: {exc}",
        )

    event_name_value = str(template_event.get("name") or "")
    event_season_value = str(template_event.get("season") or "")
    template_event = {
        "name": event_name_value,
        "season": event_season_value,
    }

    if not event_name_value:
        return render_template(
            "setup_wizard.html",
            current_version=CURRENT_VERSION,
            device_id_preview=device_id,
            error="Event name is required.",
        )

    updated_device = {"uniqueId": str(device_id)}

    backup_config()
    save_config(
        updated_device,
        template_event,
        template_analysis,
        template_survey_json,
    )

    state = load_app_state()
    state["last_version"] = CURRENT_VERSION
    save_app_state(state)

    app.logger.info(
        "[Setup] Saved setup: event=%s season=%s device_id=%s",
        template_event.get("name") or "",
        template_event.get("season") or "",
        device_id,
    )

    return redirect(url_for("show_form", setup="1"))


@app.route("/analyze", methods=["GET", "POST"])
def analyze():
    """
    Simple analysis page:
    - User uploads one or more CSV files.
    - We merge them and show every row in a big table.
    - Columns are built from uploaded CSV headers.
    """
    device_cfg, event, analysis_config, survey_json = load_config()
    device_id = get_device(device_cfg)

    table_columns = []
    table_rows = []
    teams_summary = []
    error = None
    warnings = []
    uploaded_filenames = []
    device_statuses = []
    analysis_insights = {
        "quality": None,
        "leaders": [],
        "consistency": [],
    }

    config_field_names = get_survey_field_names(survey_json or {})

    def prepare_analysis(rows: list, expected_field_names: list):
        nonlocal warnings, table_columns, table_rows, teams_summary
        nonlocal device_statuses

        if not rows:
            table_columns = []
            table_rows = []
            teams_summary = []
            device_statuses = []
            return

        all_keys = set().union(*(row.keys() for row in rows))
        if "device_id" in all_keys:
            all_keys.discard("device_name")
        table_columns = [{"id": k, "label": k} for k in sorted(all_keys)]

        base_cols = {
            "timestamp",
            "event_name",
            "event_season",
            "config_id",
            "device_id",
            "device_name",
        }
        missing_fields = [f for f in expected_field_names if f not in all_keys]
        if missing_fields:
            warnings.append(
                f"Missing fields in uploaded CSVs: {', '.join(missing_fields)}"
            )

        extra_fields = sorted(all_keys - base_cols - set(expected_field_names))
        if extra_fields:
            warnings.append(
                "Extra fields found in uploads (not in current config): "
                + ", ".join(extra_fields)
            )

        deduped_rows = []
        seen = set()
        dup_count = 0
        for row in rows:
            device_key = (row.get("device_id") or row.get("device_name") or "").strip()
            match_val = (row.get("match") or row.get("match_number") or "").strip()
            team_val = (row.get("team") or row.get("team_number") or "").strip()
            if not (device_key or match_val or team_val):
                deduped_rows.append(row)
                continue
            key = (device_key, match_val, team_val)
            if key in seen:
                dup_count += 1
                continue
            seen.add(key)
            deduped_rows.append(row)

        if dup_count:
            warnings.append(
                f"Removed {dup_count} duplicate rows (same device + match + team)."
            )

        raw_table_rows = deduped_rows
        table_rows = build_display_rows(raw_table_rows, survey_json)

        graph_fields_config = get_enabled_graph_fields(analysis_config)
        if analysis_config.get("graph_fields") is None and not graph_fields_config:
            graph_fields_config = [{"field": "auto_score"}, {"field": "teleop_score"}]
        stat_fields = []
        for field_item in graph_fields_config:
            if isinstance(field_item, dict):
                stat_fields.append(field_item.get("field"))
            else:
                stat_fields.append(field_item)
        teams_summary = get_all_teams_summary(raw_table_rows, stat_fields)

        analysis_insights["quality"] = {
            "rows_loaded": len(rows),
            "rows_kept": len(raw_table_rows),
            "duplicates_removed": dup_count,
            "teams_with_data": len(teams_summary),
            "missing_team_rows": sum(
                1 for row in raw_table_rows if not str(row.get("team") or "").strip()
            ),
            "missing_match_rows": sum(
                1
                for row in raw_table_rows
                if not str((row.get("match") or row.get("match_number") or "")).strip()
            ),
        }

        leaders = []
        consistency = []
        for field in stat_fields:
            best_team = None
            best_avg = None
            best_range = None
            most_consistent_team = None

            for team_item in teams_summary:
                stats = (team_item.get("stats") or {}).get(field) or {}
                avg_value = stats.get("average")
                min_value = stats.get("min")
                max_value = stats.get("max")

                if isinstance(avg_value, (int, float)):
                    if best_avg is None or avg_value > best_avg:
                        best_avg = float(avg_value)
                        best_team = str(team_item.get("team_number") or "")

                if isinstance(min_value, (int, float)) and isinstance(
                    max_value, (int, float)
                ):
                    value_range = float(max_value) - float(min_value)
                    if best_range is None or value_range < best_range:
                        best_range = value_range
                        most_consistent_team = str(team_item.get("team_number") or "")

            if best_team and best_avg is not None:
                leaders.append(
                    {
                        "field": field,
                        "label": field.replace("_", " ").title(),
                        "team": best_team,
                        "value": round(best_avg, 2),
                    }
                )

            if most_consistent_team and best_range is not None:
                consistency.append(
                    {
                        "field": field,
                        "label": field.replace("_", " ").title(),
                        "team": most_consistent_team,
                        "range": round(best_range, 2),
                    }
                )

        analysis_insights["leaders"] = leaders[:3]
        analysis_insights["consistency"] = consistency[:3]

        counts_by_name = {}
        for row in raw_table_rows:
            name = (
                row.get("device_id") or row.get("device_name") or "Unknown"
            ).strip() or "Unknown"
            counts_by_name[name] = counts_by_name.get(name, 0) + 1

        device_statuses = []
        for name, count in sorted(counts_by_name.items()):
            device_statuses.append(
                {
                    "name": name,
                    "entries": count,
                    "status": "synced",
                }
            )

    if request.method == "POST":
        files = request.files.getlist("csv_files")

        if not files or all(not f.filename for f in files):
            error = "Please choose at least one CSV file."
        else:
            saved_filenames = []

            for f in files:
                if not f.filename:
                    continue
                try:
                    content = f.read().decode("utf-8-sig")
                    # Save to temp directory and get unique filename
                    saved_filename = save_uploaded_file(content, f.filename)
                    saved_filenames.append(saved_filename)
                    uploaded_filenames.append(f.filename)
                except Exception as exc:
                    error = f"Error reading {f.filename}: {exc}"
                    app.logger.error(
                        "[Analyze] Failed reading upload %s: %s", f.filename, exc
                    )
                    # Clean up any saved files on error
                    clear_temp_uploads(saved_filenames)
                    saved_filenames = []
                    uploaded_filenames = []
                    break

            if saved_filenames and not error:
                # Load combined data from temp files
                combined_rows = load_combined_data_from_temp(saved_filenames)
                app.logger.info(
                    "[Analyze] Uploaded files=%s rows=%s",
                    len(saved_filenames),
                    len(combined_rows),
                )

                prepare_analysis(combined_rows, config_field_names)

                # Store only filenames in session (not the data!)
                session["temp_filenames"] = saved_filenames
                session["uploaded_filenames"] = uploaded_filenames

                # Summary computed in prepare_analysis
    else:
        # On GET request, check if we have temp files in session
        temp_filenames = session.get("temp_filenames", [])
        if temp_filenames:
            # Load data from temp files
            combined_rows = load_combined_data_from_temp(temp_filenames)
            uploaded_filenames = session.get("uploaded_filenames", [])
            prepare_analysis(combined_rows, config_field_names)
            app.logger.debug(
                "[Analyze] Restored session data files=%s rows=%s",
                len(temp_filenames),
                len(combined_rows),
            )

    return render_template(
        "analyze.html",
        event=event,
        device_name=device_id,
        table_columns=table_columns,
        table_rows=table_rows,
        teams_summary=teams_summary,
        error=error,
        warnings=warnings,
        uploaded_filenames=uploaded_filenames,
        device_statuses=device_statuses,
        analysis_insights=analysis_insights,
    )


def escape_csv_cell(value) -> str:
    """Escape CSV cell values that may trigger spreadsheet formulas."""
    if value is None:
        return ""
    text = str(value)
    if text and text[0] in ("=", "+", "-", "@"):
        return f"'{text}"
    return text


@app.route("/sync", methods=["GET"])
def download_sync():
    """
    Let the user download the current CSV file.
    They can save it onto a USB drive via the browser's Save dialog.
    """
    device_cfg, event_cfg, _, _ = load_config()
    device_id = get_device(device_cfg)

    if not CSV_FILE.exists():
        abort(404, description="No data file found yet.")

    # Build a useful filename
    safe_name = (device_id or "device").replace(" ", "_")
    safe_event = (event_cfg.get("name") or "event").replace(" ", "_")
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"scouting_{safe_event}_{safe_name}_{ts}.csv"

    export_path = TEMP_EXPORTS_DIR / filename

    entry_count = 0
    with CSV_FILE.open("r", newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        fieldnames = reader.fieldnames or []

        with export_path.open("w", newline="", encoding="utf-8") as target:
            writer = csv.DictWriter(target, fieldnames=fieldnames)
            writer.writeheader()
            for row in reader:
                entry_count += 1
                safe_row = {
                    key: escape_csv_cell(row.get(key, "")) for key in fieldnames
                }
                writer.writerow(safe_row)

    app.logger.info(
        "[Sync] Exported CSV: device=%s event=%s entries=%s",
        device_id,
        event_cfg.get("name") or "",
        entry_count,
    )

    return send_file(
        export_path,
        as_attachment=True,
        download_name=filename,
        mimetype="text/csv",
    )


@app.route("/submit", methods=["POST"])
def submit_form():
    """Handle form submission and save to CSV."""
    device_cfg, event, _, survey_json = load_config()
    device_id = get_device(device_cfg)

    elements = collect_survey_elements(survey_json or {})

    # Enforce system required fields
    missing = []
    for req_field in REQUIRED_FIELDS:
        if not request.form.get(req_field):
            field_label = next(
                (e.get("title") for e in elements if e.get("name") == req_field),
                req_field,
            )
            missing.append(field_label)

    # Check user-defined required fields
    for element in elements:
        name = element.get("name")
        title = element.get("title") or name
        if str(name or "").strip().lower() in {
            "scout_name",
            "scout",
            "scouter_name",
        }:
            continue
        if element.get("isRequired") and name and not request.form.get(name):
            if title not in missing:
                missing.append(title)

    if missing:
        app.logger.warning("[Submit] Missing required fields: %s", ", ".join(missing))
        return f"Missing required fields: {', '.join(missing)}", 400

    append_row(device_cfg, event, survey_json, request.form)

    app.logger.info(
        "[Submit] Entry saved: device_id=%s event=%s fields=%s",
        device_id,
        event.get("name") or "",
        len(request.form),
    )

    # After saving, go back to the Scouting tab
    return redirect(url_for("show_form", success="1"))


@app.route("/clear_session", methods=["POST"])
def clear_session():
    """Clear uploaded data from session and delete temp files"""
    # Get temp filenames and delete the actual files
    temp_filenames = session.get("temp_filenames", [])
    if temp_filenames:
        clear_temp_uploads(temp_filenames)

    # Clear session data
    session.pop("temp_filenames", None)
    session.pop("uploaded_filenames", None)
    app.logger.info("[Analyze] Cleared uploaded temp session data")
    return redirect(url_for("analyze"))


@app.route("/team/<int:team_number>")
def team_info(team_number):
    """Display detailed analysis for a specific team."""
    device_cfg, event, analysis_config, survey_json = load_config()
    device_id = get_device(device_cfg)

    # Get analysis config with defaults
    graph_fields_list = get_enabled_graph_fields(analysis_config)
    if analysis_config.get("graph_fields") is None and not graph_fields_list:
        graph_fields_list = [{"field": "auto_score"}, {"field": "teleop_score"}]
    matches_per_page = analysis_config.get("matches_per_page", 25)

    # Auto-generate colors for fields
    default_colors = [
        "#3b82f6",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#8b5cf6",
        "#ec4899",
        "#06b6d4",
        "#84cc16",
    ]

    # Convert to full config with defaults
    graph_fields = []
    stat_fields = []
    for i, field_config in enumerate(graph_fields_list):
        # Support both string format and dict format
        if isinstance(field_config, dict):
            field_name = field_config.get("field")
            chart_type = field_config.get("chart_type", "line")
        else:
            # Simple string format, default to line chart
            field_name = field_config
            chart_type = "line"

        if not field_name:
            continue

        graph_fields.append(
            {
                "field": field_name,
                "chart_type": chart_type,
                "label": field_name.replace("_", " ").title(),
                "color": default_colors[i % len(default_colors)],
            }
        )
        stat_fields.append(field_name)

    show_trends = True
    show_radar = True
    match_sort_order = "desc"

    # Try to get data from uploaded temp files first, fall back to local CSV
    temp_filenames = session.get("temp_filenames", None)

    team_data = calculate_team_stats(team_number, stat_fields, temp_filenames)
    team_matches_display = build_display_rows(team_data.get("matches", []), survey_json)
    choice_label_maps = build_choice_label_maps(survey_json)
    choice_display_entries = build_choice_display_entries(survey_json)

    if team_data["total_matches"] == 0:
        app.logger.warning("[Team] No data found for team=%s", team_number)
        abort(404, description=f"No data found for team {team_number}")

    radar_data = get_radar_data(team_number, stat_fields, temp_filenames)
    field_types = {}
    for element in collect_survey_elements(survey_json or {}):
        if not isinstance(element, dict):
            continue
        name = str(element.get("name") or "").strip()
        if not name:
            continue
        field_types[name] = str(element.get("type") or "").strip().lower()

    return render_template(
        "team_info.html",
        event=event,
        device_name=device_id,
        team_data=team_data,
        team_matches_display=team_matches_display,
        choice_label_maps=choice_label_maps,
        choice_display_entries=choice_display_entries,
        field_types=field_types,
        graph_fields=graph_fields,
        show_trends=show_trends,
        show_radar=show_radar,
        radar_data=radar_data,
        matches_per_page=matches_per_page,
        match_sort_order=match_sort_order,
    )


@app.route("/reset", methods=["POST"])
def reset_data():
    """Delete the local CSV so this device starts fresh."""
    try:
        reset_local_data()
        app.logger.info("[Scouting] Reset data requested from scouting page")
    except Exception as exc:
        app.logger.error("Reset failed: %s", exc)
        return (
            render_template(
                "error.html",
                title="Reset Failed",
                message="Unable to reset data. Please check file permissions.",
            ),
            500,
        )

    return redirect(url_for("show_form", reset="1"))


@app.route("/api/version")
def version_info():
    """API endpoint to get version and update information."""
    status = get_update_status()
    app.logger.debug(
        "[Update] Version info requested: current=%s latest=%s available=%s",
        status.get("current_version"),
        status.get("latest_version"),
        status.get("update_available"),
    )
    return status


@app.route("/api/update/check", methods=["POST"])
def update_check():
    """Re-check update status and return mode details."""
    status = get_update_status()
    app.logger.info(
        "[Update] Manual check requested: available=%s latest=%s",
        status.get("update_available"),
        status.get("latest_version"),
    )
    return jsonify(status)


@app.route("/api/update/download", methods=["POST"])
def update_download():
    """Download latest release asset into local staging."""
    try:
        result = download_latest_release_asset()
        status = 200 if result.get("success") else 400
        app.logger.info(
            "[Update] Download endpoint result: success=%s latest=%s",
            result.get("success"),
            result.get("latest_version"),
        )
        return jsonify(result), status
    except Exception as exc:
        app.logger.error("Update download failed: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/update/apply", methods=["POST"])
def update_apply():
    """Apply available update now when supported."""
    try:
        result = apply_update_now()
        status = 200 if result.get("success") else 400
        app.logger.info(
            "[Update] Apply endpoint result: success=%s", result.get("success")
        )
        return jsonify(result), status
    except Exception as exc:
        app.logger.error("Update apply failed: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/update/instructions", methods=["GET"])
def update_instructions():
    """Return manual update instructions for current mode."""
    instructions = get_update_instructions()
    app.logger.debug(
        "[Update] Instructions requested for mode=%s", instructions.get("mode")
    )
    return jsonify(instructions)


@app.route("/api/open-path", methods=["POST"])
def open_path():
    """Open key local folders in the OS file browser."""
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


@app.errorhandler(400)
def handle_bad_request(error):
    app.logger.warning("[HTTP 400] path=%s error=%s", request.path, error)
    return (
        render_template(
            "error.html",
            title="Bad Request",
            message="The request could not be processed. Please check your inputs.",
        ),
        400,
    )


@app.errorhandler(404)
def handle_not_found(error):
    app.logger.warning("[HTTP 404] path=%s error=%s", request.path, error)
    return (
        render_template(
            "error.html",
            title="Page Not Found",
            message="We could not find that page.",
        ),
        404,
    )


@app.errorhandler(413)
def handle_too_large(error):
    app.logger.warning("[HTTP 413] path=%s error=%s", request.path, error)
    return (
        render_template(
            "error.html",
            title="Upload Too Large",
            message="Uploaded file is too large. Please select smaller CSV files.",
        ),
        413,
    )


@app.errorhandler(500)
def handle_server_error(error):
    app.logger.exception("[HTTP 500] path=%s error=%s", request.path, error)
    return (
        render_template(
            "error.html",
            title="Server Error",
            message="Something went wrong. Please try again.",
        ),
        500,
    )


if __name__ == "__main__":
    import argparse

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
    args = parser.parse_args()

    if args.dev:
        host = args.host if args.host else "127.0.0.1"
        port = args.port if args.port is not None else 5000
        app.run(debug=True, host=host, port=port)
    else:
        from waitress import serve

        host = args.host if args.host else ("0.0.0.0" if args.lan else "127.0.0.1")
        port = args.port if args.port is not None else 8080
        print("Starting in production mode (Waitress)...")
        print(f"Serving on http://{host}:{port}")
        serve(app, host=host, port=port)
