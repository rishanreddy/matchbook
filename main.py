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
)
import datetime

from utils import (
    load_config,
    append_row,
    get_device,
    get_stats,
    CSV_FILE,
    validate_required_fields,
    calculate_team_stats,
    get_all_teams_summary,
    REQUIRED_FIELDS,
    save_uploaded_file,
    load_combined_data_from_temp,
    clear_temp_uploads,
    check_for_updates,
    CURRENT_VERSION,
)
import hashlib

app = Flask(__name__)

# Generate stable secret key from device ID for session encryption
device_cfg, _, _, _ = load_config()
device_id, _ = get_device(device_cfg)
app.secret_key = hashlib.sha256(f"offline-scouting-{device_id}".encode()).hexdigest()


# Make version available to all templates
@app.context_processor
def inject_version():
    return {"app_version": CURRENT_VERSION}


# Check for updates on startup (non-blocking)
update_info = check_for_updates()
if update_info["update_available"]:
    print(
        f"\n⚠️  Update available! Current: v{CURRENT_VERSION}, Latest: v{update_info['latest_version']}"
    )
    print(f"   Download: {update_info['download_url']}\n")


# --- Flask routes ---


@app.route("/", methods=["GET"])
def show_form():
    """Render the scouting form page (Scouting tab)."""
    device_cfg, event, fields, _ = load_config()
    validate_required_fields(fields)
    stats = get_stats()

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

                # Build columns from CSV headers dynamically
                if combined_rows:
                    headers = list(combined_rows[0].keys())
                    table_columns = [
                        {"id": header, "label": header} for header in headers
                    ]

                table_rows = combined_rows

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

    return render_template(
        "analyze.html",
        event=event,
        device_name=device_name,
        table_columns=table_columns,
        table_rows=table_rows,
        teams_summary=teams_summary,
        error=error,
        uploaded_filenames=uploaded_filenames,
    )


@app.route("/sync", methods=["GET"])
def download_sync():
    """
    Let the user download the current CSV file.
    They can save it onto a USB drive via the browser's Save dialog.
    """
    device_cfg, _, _, _ = load_config()
    device_id, device_name = get_device(device_cfg)

    if not CSV_FILE.exists():
        abort(404, description="No data file found yet.")

    # Build a useful filename
    safe_name = (device_name or device_id or "device").replace(" ", "_")
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"scouting_{safe_name}_{ts}.csv"

    return send_file(
        CSV_FILE,
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
    temp_filenames = session.get("temp_filenames", [])

    if temp_filenames:
        # Load data from temp files
        uploaded_data = load_combined_data_from_temp(temp_filenames)

        # Filter matches for this team from uploaded data
        team_matches = [
            row for row in uploaded_data if str(row.get("team", "")) == str(team_number)
        ]

        if not team_matches:
            abort(404, description=f"No data found for team {team_number}")

        # Calculate stats from uploaded data
        stats = {}
        for field in stat_fields:
            values = []
            for match in team_matches:
                val = match.get(field, "")
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    continue

            if values:
                stats[field] = {
                    "average": round(sum(values) / len(values), 2),
                    "max": max(values),
                    "min": min(values),
                    "total": sum(values),
                }
            else:
                stats[field] = {"average": 0, "max": 0, "min": 0, "total": 0}

        team_data = {
            "team_number": team_number,
            "total_matches": len(team_matches),
            "stats": stats,
            "matches": team_matches,
        }
    else:
        # Fall back to local CSV file
        team_data = calculate_team_stats(team_number, stat_fields)

        if team_data["total_matches"] == 0:
            abort(404, description=f"No data found for team {team_number}")

    return render_template(
        "team_info.html",
        event=event,
        device_name=device_name,
        team_data=team_data,
        graph_fields=graph_fields,
        show_trends=show_trends,
        show_radar=show_radar,
        matches_per_page=matches_per_page,
        match_sort_order=match_sort_order,
    )


@app.route("/reset", methods=["POST"])
def reset_data():
    """Delete the local CSV so this device starts fresh."""
    if CSV_FILE.exists():
        CSV_FILE.unlink()

    return redirect(url_for("show_form", reset="1"))


@app.route("/api/version")
def version_info():
    """API endpoint to get version and update information."""
    return check_for_updates()


if __name__ == "__main__":
    import sys

    # Check for --production flag
    production_mode = "--production" in sys.argv
    if production_mode:
        from waitress import serve

        print("Starting in production mode (Waitress)...")
        print("Serving on http://127.0.0.1:8080")
        serve(app, host="0.0.0.0", port=8080)
    else:
        app.run(debug=True, host="127.0.0.1", port=5000)
