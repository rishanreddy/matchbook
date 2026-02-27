"""Analysis route registrations."""

from __future__ import annotations

from flask import (
    Flask,
    abort,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from utils.analysis_config import get_enabled_graph_fields
from utils.analysis_pipeline import prepare_analysis
from utils.config import (
    collect_survey_elements,
    get_device,
    get_survey_field_names,
    load_config,
)
from utils.survey_display import (
    build_choice_display_entries,
    build_choice_label_maps,
    build_display_rows,
)
from utils.team_analysis import calculate_team_stats, get_radar_data
from utils.temp_uploads import (
    clear_stale_temp_uploads,
    clear_temp_uploads,
    load_combined_data_from_temp,
    save_uploaded_file,
)

DEFAULT_GRAPH_COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
]


def _coerce_session_filenames(value) -> list[str]:
    """Return a sanitized list of temp filenames from session state."""
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        text = str(item or "").strip()
        if text:
            result.append(text)
    return result


def _coerce_matches_per_page(value) -> int:
    """Return a bounded integer for team page match pagination."""
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
    else:
        parsed = 25
    return max(5, min(500, parsed))


def register_analysis_routes(app: Flask) -> None:
    """Register analysis routes."""

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

        stale_removed = clear_stale_temp_uploads(max_age_hours=24)
        if stale_removed:
            app.logger.info(
                "[Analyze] Pruned stale temp uploads: removed=%s", stale_removed
            )

        config_field_names = get_survey_field_names(survey_json or {})

        if request.method == "POST":
            files = request.files.getlist("csv_files")

            if not files or all(not f.filename for f in files):
                error = "Please choose at least one CSV file."
            else:
                saved_filenames = []

                for upload in files:
                    if not upload.filename:
                        continue
                    if not upload.filename.lower().endswith(".csv"):
                        error = f"{upload.filename}: only .csv uploads are supported."
                        app.logger.warning(
                            "[Analyze] Rejected non-CSV upload: %s", upload.filename
                        )
                        clear_temp_uploads(saved_filenames)
                        saved_filenames = []
                        uploaded_filenames = []
                        break
                    try:
                        content = upload.read().decode("utf-8-sig")
                        saved_filename = save_uploaded_file(content, upload.filename)
                        saved_filenames.append(saved_filename)
                        uploaded_filenames.append(upload.filename)
                    except UnicodeDecodeError:
                        error = (
                            f"Error reading {upload.filename}: file must be valid UTF-8 CSV."
                        )
                        app.logger.error(
                            "[Analyze] Failed reading upload %s: invalid UTF-8",
                            upload.filename,
                        )
                        clear_temp_uploads(saved_filenames)
                        saved_filenames = []
                        uploaded_filenames = []
                        break
                    except Exception as exc:
                        error = f"Error reading {upload.filename}: {exc}"
                        app.logger.error(
                            "[Analyze] Failed reading upload %s: %s",
                            upload.filename,
                            exc,
                        )
                        clear_temp_uploads(saved_filenames)
                        saved_filenames = []
                        uploaded_filenames = []
                        break

                if saved_filenames and not error:
                    combined_rows = load_combined_data_from_temp(saved_filenames)
                    app.logger.info(
                        "[Analyze] Uploaded files=%s rows=%s",
                        len(saved_filenames),
                        len(combined_rows),
                    )

                    prepared = prepare_analysis(
                        combined_rows,
                        config_field_names,
                        survey_json,
                        analysis_config,
                    )
                    table_columns = prepared["table_columns"]
                    table_rows = prepared["table_rows"]
                    teams_summary = prepared["teams_summary"]
                    warnings = prepared["warnings"]
                    device_statuses = prepared["device_statuses"]
                    analysis_insights = prepared["analysis_insights"]

                    session["temp_filenames"] = saved_filenames
                    session["uploaded_filenames"] = uploaded_filenames
                    if not table_rows:
                        warnings.append(
                            "Upload succeeded, but no data rows were found in the selected files."
                        )
        else:
            temp_filenames = _coerce_session_filenames(session.get("temp_filenames", []))
            if temp_filenames:
                combined_rows = load_combined_data_from_temp(temp_filenames)
                if not combined_rows:
                    session.pop("temp_filenames", None)
                    session.pop("uploaded_filenames", None)
                    warnings.append(
                        "Previously uploaded files are no longer available. Please upload CSV files again."
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
                uploaded_filenames = _coerce_session_filenames(
                    session.get("uploaded_filenames", [])
                )
                prepared = prepare_analysis(
                    combined_rows,
                    config_field_names,
                    survey_json,
                    analysis_config,
                )
                table_columns = prepared["table_columns"]
                table_rows = prepared["table_rows"]
                teams_summary = prepared["teams_summary"]
                warnings = prepared["warnings"]
                device_statuses = prepared["device_statuses"]
                analysis_insights = prepared["analysis_insights"]
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

    @app.route("/clear_session", methods=["POST"])
    def clear_session():
        """Clear uploaded data from session and delete temp files."""
        temp_filenames = _coerce_session_filenames(session.get("temp_filenames", []))
        if temp_filenames:
            clear_temp_uploads(temp_filenames)

        session.pop("temp_filenames", None)
        session.pop("uploaded_filenames", None)
        app.logger.info("[Analyze] Cleared uploaded temp session data")
        return redirect(url_for("analyze"))

    @app.route("/team/<int:team_number>")
    def team_info(team_number: int):
        """Display detailed analysis for a specific team."""
        if team_number <= 0:
            abort(404, description="Team number must be positive.")

        device_cfg, event, analysis_config, survey_json = load_config()
        device_id = get_device(device_cfg)

        graph_fields_list = get_enabled_graph_fields(analysis_config)
        if analysis_config.get("graph_fields") is None and not graph_fields_list:
            graph_fields_list = [{"field": "auto_score"}, {"field": "teleop_score"}]
        matches_per_page = _coerce_matches_per_page(
            analysis_config.get("matches_per_page", 25)
        )

        graph_fields = []
        stat_fields = []
        seen_graph_fields = set()
        for idx, field_config in enumerate(graph_fields_list):
            if isinstance(field_config, dict):
                field_name = field_config.get("field")
                chart_type = field_config.get("chart_type", "line")
            else:
                field_name = field_config
                chart_type = "line"

            if not field_name:
                continue

            normalized_field = str(field_name).strip().lower()
            if normalized_field in seen_graph_fields:
                continue
            seen_graph_fields.add(normalized_field)

            graph_fields.append(
                {
                    "field": field_name,
                    "chart_type": chart_type,
                    "label": field_name.replace("_", " ").title(),
                    "color": DEFAULT_GRAPH_COLORS[idx % len(DEFAULT_GRAPH_COLORS)],
                }
            )
            stat_fields.append(field_name)

        temp_filenames = _coerce_session_filenames(session.get("temp_filenames", None))
        if not temp_filenames:
            temp_filenames = None

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
            show_trends=True,
            show_radar=True,
            radar_data=radar_data,
            matches_per_page=matches_per_page,
            match_sort_order="desc",
        )
