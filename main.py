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
)
import csv
import datetime
import logging
import shutil
import re
import json
import subprocess
import sys
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
    REQUIRED_FIELDS,
    save_uploaded_file,
    load_combined_data_from_temp,
    clear_temp_uploads,
    backup_config,
    save_config,
    get_secret_key,
    get_device_names_from_csv,
    APP_STATE_FILE,
    check_for_updates,
    CURRENT_VERSION,
    get_update_status,
    download_latest_release_asset,
    apply_update_now,
    get_update_instructions,
)

SYSTEM_FIELD_DEFAULTS = [
    {
        "type": "text",
        "name": "team",
        "title": "Team Number",
        "inputType": "number",
        "isRequired": True,
    },
    {
        "type": "text",
        "name": "auto_score",
        "title": "Auto score",
        "inputType": "number",
        "isRequired": True,
    },
    {
        "type": "text",
        "name": "teleop_score",
        "title": "Tele-op score",
        "inputType": "number",
        "isRequired": True,
    },
]

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
    return {"app_version": CURRENT_VERSION}


def load_app_state() -> dict:
    if APP_STATE_FILE.exists():
        try:
            return json.loads(APP_STATE_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_app_state(state: dict) -> None:
    APP_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    APP_STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def reset_local_data() -> None:
    """Clear local scouting data files."""
    if CSV_FILE.exists():
        ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        backup_path = BACKUP_DIR / f"scouting_data_{ts}.csv"
        shutil.copy(CSV_FILE, backup_path)
        CSV_FILE.unlink(missing_ok=True)

    if DEVICE_FILE.exists():
        DEVICE_FILE.unlink(missing_ok=True)

    for temp_dir in [TEMP_UPLOADS_DIR, TEMP_EXPORTS_DIR]:
        if temp_dir.exists():
            for item in temp_dir.glob("*"):
                if item.is_file():
                    item.unlink(missing_ok=True)


@app.before_request
def enforce_setup_wizard():
    if request.endpoint in {
        "setup_wizard",
        "static",
        "version_info",
        "check_device_name",
        "update_check",
        "update_download",
        "update_apply",
        "update_instructions",
        "open_path",
    }:
        return None
    if request.path.startswith("/static/"):
        return None

    device_cfg, event, _, _ = load_config()
    state = load_app_state()
    last_version = state.get("last_version")

    if last_version != CURRENT_VERSION:
        return redirect(url_for("setup_wizard"))

    if not event.get("name") or not device_cfg.get("name"):
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

    for field in SYSTEM_FIELD_DEFAULTS:
        name = field["name"]
        if name in current_names:
            continue
        target_elements.insert(0, dict(field))
        current_names.add(name)
        added.append(name)

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
        if not enabled:
            continue

        chart_type = str(item.get("chart_type") or "line").strip().lower()
        if chart_type not in allowed_chart_types:
            chart_type = "line"

        seen.add(field)
        result.append({"field": field, "chart_type": chart_type})

    return result


# --- Flask routes ---


@app.route("/", methods=["GET"])
def show_form():
    """Render the scouting form page (Scouting tab)."""
    device_cfg, event, _, survey_json = load_config()

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

    if not event.get("name") or not device_cfg.get("name"):
        return redirect(url_for("setup_wizard"))

    device_name = device_cfg.get("name") or device_cfg.get("uniqueId")
    data_path = str(CSV_FILE.resolve())

    survey_json_str = json.dumps(survey_json) if survey_json else "{}"

    return render_template(
        "index.html",
        event=event,
        stats=stats,
        device_name=device_name,
        data_path=data_path,
        survey_json=survey_json_str,
    )


@app.route("/settings", methods=["GET", "POST"])
def settings():
    """Settings page for configuring event, device, and form fields."""
    device_cfg, event, analysis_cfg, survey_json = load_config()

    error = None
    saved = request.args.get("saved") == "1"
    reset_done = request.args.get("reset") == "1"

    if request.method == "POST":
        event_name = (request.form.get("event_name") or "").strip()
        event_season = (request.form.get("event_season") or "").strip()
        device_name = (request.form.get("device_name") or "").strip()

        matches_per_page_raw = (request.form.get("matches_per_page") or "").strip()
        matches_per_page = analysis_cfg.get("matches_per_page", 25)
        if matches_per_page_raw.isdigit():
            matches_per_page = max(5, min(500, int(matches_per_page_raw)))

        errors = []

        if not event_name:
            errors.append("Event name is required.")
        if not device_name:
            errors.append("Device name is required.")

        if errors:
            error = " ".join(errors)
        else:
            updated_device = {"name": str(device_name)}
            unique_id = device_cfg.get("uniqueId")
            if unique_id:
                updated_device["uniqueId"] = str(unique_id)

            updated_event = {
                "name": str(event_name),
                "season": str(event_season or ""),
            }
            config_id = event.get("config_id") if isinstance(event, dict) else None
            if config_id:
                updated_event["config_id"] = str(config_id)

            updated_analysis = dict(analysis_cfg or {})
            updated_analysis["matches_per_page"] = matches_per_page

            backup_config()
            save_config(
                updated_device,
                updated_event,
                updated_analysis,
                survey_json,
            )

            state = load_app_state()
            state["last_version"] = CURRENT_VERSION
            save_app_state(state)
            return redirect(url_for("settings", saved="1"))

    return render_template(
        "settings.html",
        event=event,
        device=device_cfg,
        device_name=device_cfg.get("name") or device_cfg.get("uniqueId"),
        analysis=analysis_cfg,
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
        graph_config_raw = (request.form.get("graph_config_json") or "").strip()

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
                    missing_required = [
                        rf for rf in REQUIRED_FIELDS if rf not in field_names
                    ]
                    if missing_required:
                        error = "Missing required system fields: " + ", ".join(
                            missing_required
                        )

                if not error:
                    parsed_graph_config = []
                    if graph_config_raw:
                        try:
                            parsed_graph_config = json.loads(graph_config_raw)
                        except json.JSONDecodeError:
                            parsed_graph_config = []

                    updated_analysis = dict(analysis_cfg or {})
                    updated_analysis["graph_fields"] = sanitize_graph_field_config(
                        parsed_graph_config,
                        field_names,
                    )

                    backup_config()
                    save_config(device_cfg, event, updated_analysis, new_survey_json)
                    return redirect(
                        url_for(
                            "form_builder",
                            saved="1",
                            auto_added=",".join(inserted_fields),
                        )
                    )
            except json.JSONDecodeError as exc:
                error = f"Invalid JSON syntax: {str(exc)}"

    survey_json_str = (
        json.dumps(survey_json, indent=2) if survey_json else '{"elements": []}'
    )
    graph_config_json = json.dumps(analysis_cfg.get("graph_fields", []))

    return render_template(
        "form_builder.html",
        event=event,
        survey_json_str=survey_json_str,
        graph_config_json=graph_config_json,
        error=error,
        saved=saved,
        auto_added=auto_added,
    )


@app.route("/settings/reset", methods=["POST"])
def settings_reset():
    try:
        reset_local_data()
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

    # If already configured and version seen, skip wizard
    if request.method == "GET":
        state = load_app_state()
        if (
            event.get("name")
            and device_cfg.get("name")
            and state.get("last_version") == CURRENT_VERSION
        ):
            return redirect(url_for("show_form"))
        return render_template("setup_wizard.html", current_version=CURRENT_VERSION)

    if request.form.get("skip_setup") == "1":
        data_action = (request.form.get("data_action") or "keep").strip()
        if data_action == "reset":
            reset_local_data()
        state = load_app_state()
        state["last_version"] = CURRENT_VERSION
        save_app_state(state)
        return redirect(url_for("show_form"))

    data_action = (request.form.get("data_action") or "keep").strip()
    if data_action == "reset":
        reset_local_data()

    event_name = (request.form.get("event_name") or "").strip()
    event_season = (request.form.get("season") or "").strip()
    device_name = (request.form.get("device_name") or "").strip()
    setup_file = request.files.get("setup_file")

    setup_payload = None
    if setup_file and setup_file.filename:
        filename = setup_file.filename.lower()
        if not (filename.endswith(".yaml") or filename.endswith(".yml")):
            return render_template(
                "setup_wizard.html",
                error="Setup file must be a .yaml file.",
            )
        try:
            content = setup_file.read().decode("utf-8")
            setup_payload = yaml.safe_load(content) or {}
        except Exception:
            return render_template(
                "setup_wizard.html",
                error="Setup file could not be read.",
            )

    if not device_name:
        return render_template(
            "setup_wizard.html",
            error="Device name is required.",
        )

    template_analysis = analysis_cfg
    template_event = {"name": event_name, "season": event_season}
    template_survey_json = survey_json

    if setup_payload:
        template_event = setup_payload.get("event") or template_event
        template_survey_json = setup_payload.get("survey_json") or template_survey_json
        template_analysis = setup_payload.get("analysis") or template_analysis

    if not template_survey_json or not isinstance(template_survey_json, dict):
        return render_template(
            "setup_wizard.html",
            error="Setup file must include a valid survey_json schema.",
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
            error="Event name is required.",
        )

    updated_device = {"name": str(device_name)}
    unique_id = device_cfg.get("uniqueId")
    if unique_id:
        updated_device["uniqueId"] = str(unique_id)

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

    return redirect(url_for("show_form", setup="1"))


@app.route("/api/check-device-name", methods=["POST"])
def check_device_name():
    """Check if a device name already exists in local data."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"conflict": False, "suggestions": []})

    existing_names = get_device_names_from_csv()

    conflict = name in existing_names
    suggestions = []
    if conflict:
        suggestions = [f"{name} A", f"{name} B", f"{name} 2"]
        for idx in range(1, 21):
            candidate = f"Scout {idx}"
            if candidate not in existing_names:
                suggestions.append(candidate)
                break

    return jsonify({"conflict": conflict, "suggestions": suggestions})


@app.route("/analyze", methods=["GET", "POST"])
def analyze():
    """
    Simple analysis page:
    - User uploads one or more CSV files.
    - We merge them and show every row in a big table.
    - Columns are built from uploaded CSV headers.
    """
    device_cfg, event, analysis_config, survey_json = load_config()
    device_name = device_cfg.get("name") or device_cfg.get("uniqueId")

    table_columns = []
    table_rows = []
    teams_summary = []
    error = None
    warnings = []
    uploaded_filenames = []
    device_statuses = []

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

        table_rows = deduped_rows

        graph_fields_config = analysis_config.get(
            "graph_fields", ["auto_score", "teleop_score"]
        )
        stat_fields = []
        for field_item in graph_fields_config:
            if isinstance(field_item, dict):
                stat_fields.append(field_item.get("field"))
            else:
                stat_fields.append(field_item)
        teams_summary = get_all_teams_summary(table_rows, stat_fields)

        counts_by_name = {}
        for row in table_rows:
            name = (row.get("device_name") or "Unknown").strip() or "Unknown"
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
                    # Clean up any saved files on error
                    clear_temp_uploads(saved_filenames)
                    saved_filenames = []
                    uploaded_filenames = []
                    break

            if saved_filenames and not error:
                # Load combined data from temp files
                combined_rows = load_combined_data_from_temp(saved_filenames)
                app.logger.info(
                    "Uploaded %s files, %s rows",
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

    return render_template(
        "analyze.html",
        event=event,
        device_name=device_name,
        table_columns=table_columns,
        table_rows=table_rows,
        teams_summary=teams_summary,
        error=error,
        warnings=warnings,
        uploaded_filenames=uploaded_filenames,
        device_statuses=device_statuses,
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
    device_cfg, event_cfg, analysis_cfg, _ = load_config()
    device_id, device_name = get_device(device_cfg)

    if not CSV_FILE.exists():
        abort(404, description="No data file found yet.")

    # Build a useful filename
    safe_name = (device_name or device_id or "device").replace(" ", "_")
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
        "Exported CSV: device=%s event=%s entries=%s",
        device_name or device_id,
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
        if element.get("isRequired") and name and not request.form.get(name):
            if title not in missing:
                missing.append(title)

    if missing:
        return f"Missing required fields: {', '.join(missing)}", 400

    append_row(device_cfg, event, survey_json, request.form)

    app.logger.info(
        "Entry saved: device=%s event=%s",
        device_cfg.get("name") or device_cfg.get("uniqueId"),
        event.get("name") or "",
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
    return redirect(url_for("analyze"))


@app.route("/team/<int:team_number>")
def team_info(team_number):
    """Display detailed analysis for a specific team."""
    device_cfg, event, analysis_config, survey_json = load_config()
    device_name = device_cfg.get("name") or device_cfg.get("uniqueId")

    # Get analysis config with defaults
    graph_fields_list = analysis_config.get(
        "graph_fields", ["auto_score", "teleop_score"]
    )
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

    if team_data["total_matches"] == 0:
        abort(404, description=f"No data found for team {team_number}")

    radar_data = get_radar_data(team_number, stat_fields, temp_filenames)

    return render_template(
        "team_info.html",
        event=event,
        device_name=device_name,
        team_data=team_data,
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
    return get_update_status()


@app.route("/api/update/check", methods=["POST"])
def update_check():
    """Re-check update status and return mode details."""
    return jsonify(get_update_status())


@app.route("/api/update/download", methods=["POST"])
def update_download():
    """Download latest release asset into local staging."""
    try:
        result = download_latest_release_asset()
        status = 200 if result.get("success") else 400
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
        return jsonify(result), status
    except Exception as exc:
        app.logger.error("Update apply failed: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/update/instructions", methods=["GET"])
def update_instructions():
    """Return manual update instructions for current mode."""
    return jsonify(get_update_instructions())


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
    app.logger.error("Server error: %s", error)
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
