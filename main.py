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
from logging.handlers import RotatingFileHandler
from pathlib import Path

import yaml

from utils import (
    load_config,
    append_row,
    get_device,
    get_stats,
    CSV_FILE,
    CONFIG_DIR,
    TEMP_EXPORTS_DIR,
    BACKUP_DIR,
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
    load_registry,
    save_registry,
    update_device,
    register_from_rows,
    list_devices,
    get_expected_devices,
    set_expected_devices,
    check_for_updates,
    CURRENT_VERSION,
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
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / "app.log"

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


@app.before_request
def enforce_setup_wizard():
    if request.endpoint in {
        "setup_wizard",
        "static",
        "version_info",
        "check_device_name",
    }:
        return None
    if request.path.startswith("/static/"):
        return None

    device_cfg, event, _, _ = load_config()
    if not event.get("name") or not (
        device_cfg.get("name") or device_cfg.get("uniqueId")
    ):
        return redirect(url_for("setup_wizard"))
    return None


# Check for updates on startup (non-blocking)
update_info = check_for_updates()
if update_info["update_available"]:
    print(
        f"\n⚠️  Update available! Current: v{CURRENT_VERSION}, Latest: v{update_info['latest_version']}"
    )
    print(f"   Download: {update_info['download_url']}\n")


def sanitize_filename(value: str) -> str:
    """Sanitize a string for safe filenames."""
    text = (value or "").strip().replace(" ", "_")
    text = re.sub(r"[^A-Za-z0-9._-]", "", text)
    return text or "file"


# --- Flask routes ---


@app.route("/", methods=["GET"])
def show_form():
    """Render the scouting form page (Scouting tab)."""
    device_cfg, event, fields, _ = load_config()
    validate_required_fields(fields)
    stats = get_stats()

    if not event.get("name") or not (
        device_cfg.get("name") or device_cfg.get("uniqueId")
    ):
        return redirect(url_for("setup_wizard"))

    device_name = device_cfg.get("name") or device_cfg.get("uniqueId")
    data_path = str(CSV_FILE.resolve())

    return render_template(
        "index.html",
        event=event,
        fields=fields,
        stats=stats,
        device_name=device_name,
        data_path=data_path,
    )


@app.route("/settings", methods=["GET", "POST"])
def settings():
    """Settings page for configuring event, device, and form fields."""
    device_cfg, event, fields, analysis_cfg = load_config()

    error = None
    saved = request.args.get("saved") == "1"

    if request.method == "POST":
        event_name = (request.form.get("event_name") or "").strip()
        event_season = (request.form.get("event_season") or "").strip()
        device_name = (request.form.get("device_name") or "").strip()

        matches_per_page_raw = (request.form.get("matches_per_page") or "").strip()
        expected_devices_raw = (request.form.get("expected_devices") or "").strip()
        matches_per_page = analysis_cfg.get("matches_per_page", 25)
        if matches_per_page_raw.isdigit():
            matches_per_page = max(5, min(500, int(matches_per_page_raw)))

        expected_devices = analysis_cfg.get("expected_devices", 8)
        if expected_devices_raw.isdigit():
            expected_devices = max(1, min(50, int(expected_devices_raw)))

        field_names = request.form.getlist("field_name")
        field_labels = request.form.getlist("field_label")
        field_types = request.form.getlist("field_type")
        field_required_flags = request.form.getlist("field_required")
        field_options = request.form.getlist("field_options")

        new_fields = []
        seen_names = set()
        errors = []

        for i, raw_name in enumerate(field_names):
            name = (raw_name or "").strip()
            if not name:
                continue

            label = (field_labels[i] if i < len(field_labels) else "").strip()
            field_type = field_types[i] if i < len(field_types) else "text"
            required_flag = (
                field_required_flags[i] if i < len(field_required_flags) else "false"
            )
            options_raw = field_options[i] if i < len(field_options) else ""

            if name in seen_names:
                errors.append(f"Duplicate field name: {name}")
                continue
            seen_names.add(name)

            field_def = {
                "name": name,
                "label": label or name,
                "type": field_type,
                "required": required_flag == "true",
            }

            if field_type == "select":
                options = [opt.strip() for opt in options_raw.split(",") if opt.strip()]
                if not options:
                    errors.append(
                        f"Select field '{label or name}' must include options."
                    )
                field_def["options"] = options

            new_fields.append(field_def)

        missing_required = [rf for rf in REQUIRED_FIELDS if rf not in seen_names]
        if missing_required:
            errors.append(f"Missing required fields: {', '.join(missing_required)}")

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
            updated_analysis["expected_devices"] = expected_devices

            registry = load_registry()
            registry = set_expected_devices(registry, expected_devices)
            save_registry(registry)

            backup_config()
            save_config(updated_device, updated_event, new_fields, updated_analysis)
            return redirect(url_for("settings", saved="1"))

    return render_template(
        "settings.html",
        event=event,
        device=device_cfg,
        device_name=device_cfg.get("name") or device_cfg.get("uniqueId"),
        fields=fields,
        analysis=analysis_cfg,
        required_fields=REQUIRED_FIELDS,
        error=error,
        saved=saved,
    )


@app.route("/settings/export-setup", methods=["GET"])
def export_setup():
    """Export setup file for sharing across devices."""
    device_cfg, event, fields, analysis_cfg = load_config()

    setup_data = {
        "setup_version": 1,
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
        "event": event,
        "fields": fields,
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
    device_cfg, event, fields, analysis_cfg = load_config()

    # If already configured, skip wizard
    if request.method == "GET":
        if event.get("name") and device_cfg.get("name"):
            return redirect(url_for("show_form"))
        return render_template("setup_wizard.html")

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

    template_fields = fields
    template_analysis = analysis_cfg
    template_event = {"name": event_name, "season": event_season}

    if setup_payload:
        template_event = setup_payload.get("event") or template_event
        template_fields = setup_payload.get("fields") or template_fields
        template_analysis = setup_payload.get("analysis") or template_analysis

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
    save_config(updated_device, template_event, template_fields, template_analysis)

    expected_devices = template_analysis.get("expected_devices", 8)
    registry = load_registry()
    registry = set_expected_devices(registry, expected_devices)
    registry = update_device(
        registry,
        device_id=updated_device.get("uniqueId") or "",
        device_name=device_name,
        entry_count=0,
        event=event_name_value,
        source="setup",
    )
    save_registry(registry)

    return redirect(url_for("show_form", setup="1"))


@app.route("/api/check-device-name", methods=["POST"])
def check_device_name():
    """Check if a device name already exists in local data."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"conflict": False, "suggestions": []})

    existing_names = set()
    registry = load_registry()
    for device in list_devices(registry):
        device_name = (device.get("name") or "").strip()
        if device_name:
            existing_names.add(device_name)

    if CSV_FILE.exists():
        with CSV_FILE.open("r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                device_name = (row.get("device_name") or "").strip()
                if device_name:
                    existing_names.add(device_name)

    conflict = name in existing_names
    suggestions = []
    if conflict:
        suggestions = [f"{name} A", f"{name} B", f"{name} 2"]

    expected_devices = get_expected_devices(registry)
    for idx in range(1, expected_devices + 1):
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
    device_cfg, event, _, analysis_config = load_config()
    device_name = device_cfg.get("name") or device_cfg.get("uniqueId")

    table_columns = []
    table_rows = []
    teams_summary = []
    error = None
    uploaded_filenames = []
    device_statuses = []
    expected_devices = analysis_config.get("expected_devices", 8)

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

                # Build columns from CSV headers dynamically
                if combined_rows:
                    headers = list(combined_rows[0].keys())
                    table_columns = [
                        {"id": header, "label": header} for header in headers
                    ]

                table_rows = combined_rows

                if combined_rows:
                    registry = register_from_rows(
                        combined_rows,
                        event.get("name") or "",
                        source="analysis",
                    )
                else:
                    registry = load_registry()

                expected_devices = analysis_config.get(
                    "expected_devices", get_expected_devices(registry)
                )
                registry = set_expected_devices(registry, expected_devices)
                save_registry(registry)

                counts_by_name = {}
                for row in combined_rows:
                    name = (row.get("device_name") or "Unknown").strip() or "Unknown"
                    counts_by_name[name] = counts_by_name.get(name, 0) + 1

                device_statuses = []
                for device in list_devices(registry):
                    name = device.get("name") or device.get("device_id") or "Unknown"
                    device_statuses.append(
                        {
                            "name": name,
                            "entries": counts_by_name.get(name, 0),
                            "last_seen": device.get("last_seen"),
                            "status": "synced" if name in counts_by_name else "missing",
                        }
                    )

                # Store only filenames in session (not the data!)
                session["temp_filenames"] = saved_filenames
                session["uploaded_filenames"] = uploaded_filenames

                # Generate team summaries - extract field names from graph_fields
                graph_fields_config = analysis_config.get(
                    "graph_fields", ["auto_score", "teleop_score"]
                )
                stat_fields = []
                for field_item in graph_fields_config:
                    if isinstance(field_item, dict):
                        stat_fields.append(field_item.get("field"))
                    else:
                        stat_fields.append(field_item)
                teams_summary = get_all_teams_summary(combined_rows, stat_fields)
    else:
        # On GET request, check if we have temp files in session
        temp_filenames = session.get("temp_filenames", [])
        if temp_filenames:
            # Load data from temp files
            combined_rows = load_combined_data_from_temp(temp_filenames)
            table_rows = combined_rows
            uploaded_filenames = session.get("uploaded_filenames", [])

            # Rebuild columns
            if combined_rows:
                headers = list(combined_rows[0].keys())
                table_columns = [{"id": header, "label": header} for header in headers]

            # Regenerate team summaries - extract field names from graph_fields
            graph_fields_config = analysis_config.get(
                "graph_fields", ["auto_score", "teleop_score"]
            )
            stat_fields = []
            for field_item in graph_fields_config:
                if isinstance(field_item, dict):
                    stat_fields.append(field_item.get("field"))
                else:
                    stat_fields.append(field_item)
            teams_summary = get_all_teams_summary(combined_rows, stat_fields)

            if combined_rows:
                registry = register_from_rows(
                    combined_rows,
                    event.get("name") or "",
                    source="analysis",
                )
            else:
                registry = load_registry()

            expected_devices = analysis_config.get(
                "expected_devices", get_expected_devices(registry)
            )
            registry = set_expected_devices(registry, expected_devices)
            save_registry(registry)

            counts_by_name = {}
            for row in combined_rows:
                name = (row.get("device_name") or "Unknown").strip() or "Unknown"
                counts_by_name[name] = counts_by_name.get(name, 0) + 1

            device_statuses = []
            for device in list_devices(registry):
                name = device.get("name") or device.get("device_id") or "Unknown"
                device_statuses.append(
                    {
                        "name": name,
                        "entries": counts_by_name.get(name, 0),
                        "last_seen": device.get("last_seen"),
                        "status": "synced" if name in counts_by_name else "missing",
                    }
                )

    return render_template(
        "analyze.html",
        event=event,
        device_name=device_name,
        table_columns=table_columns,
        table_rows=table_rows,
        teams_summary=teams_summary,
        error=error,
        uploaded_filenames=uploaded_filenames,
        device_statuses=device_statuses,
        expected_devices=expected_devices,
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
    device_cfg, event_cfg, _, analysis_cfg = load_config()
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

    registry = load_registry()
    registry = update_device(
        registry,
        device_id=device_id or "",
        device_name=device_name or "",
        entry_count=entry_count,
        event=event_cfg.get("name") or "",
        source="export",
    )
    registry = set_expected_devices(
        registry,
        analysis_cfg.get("expected_devices", 8),
    )
    save_registry(registry)

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
    device_cfg, event, fields, _ = load_config()

    # Enforce system required fields
    missing = []
    for req_field in REQUIRED_FIELDS:
        if not request.form.get(req_field):
            field_label = next(
                (f["label"] for f in fields if f["name"] == req_field), req_field
            )
            missing.append(field_label)

    # Check user-defined required fields
    for field in fields:
        if field.get("required") and not request.form.get(field["name"]):
            if field["label"] not in missing:
                missing.append(field["label"])

    if missing:
        return f"Missing required fields: {', '.join(missing)}", 400

    append_row(device_cfg, event, fields, request.form)

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
    device_cfg, event, fields, analysis_config = load_config()
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
    if CSV_FILE.exists():
        try:
            ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            backup_path = BACKUP_DIR / f"scouting_data_{ts}.csv"
            shutil.copy(CSV_FILE, backup_path)
            CSV_FILE.unlink()
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
    return check_for_updates()


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
    import sys

    # Default to production; use --dev for local debugging
    dev_mode = "--dev" in sys.argv
    lan_mode = "--lan" in sys.argv

    if dev_mode:
        app.run(debug=True, host="127.0.0.1", port=5000)
    else:
        from waitress import serve

        host = "0.0.0.0" if lan_mode else "127.0.0.1"
        print("Starting in production mode (Waitress)...")
        print(f"Serving on http://{host}:8080")
        serve(app, host=host, port=8080)
