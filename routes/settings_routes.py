"""Settings and form-builder route registrations."""

from __future__ import annotations

import datetime
import json

import yaml
from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)

from utils.analysis_config import (
    build_graph_field_options,
    build_settings_graph_config_json,
    normalize_settings_graph_payload,
    sanitize_graph_field_config,
)
from utils.app_state import load_app_state, save_app_state
from utils.config import (
    backup_config,
    get_device,
    get_survey_field_names,
    load_config,
    save_config,
    validate_required_fields,
)
from utils.constants import (
    REQUIRED_FIELDS,
    REQUIRED_SURVEY_FIELD_GROUPS,
    TEMP_EXPORTS_DIR,
)
from utils.data_lifecycle import reset_local_data
from utils.export_safety import sanitize_filename
from utils.survey_schema import ensure_system_fields
from utils.version_check import CURRENT_VERSION


def _parse_graph_config_payload(raw_value: str) -> tuple[list, str | None]:
    """Parse graph config JSON payload into a list."""
    text = str(raw_value or "").strip()
    if not text:
        return [], None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [], "Graph configuration payload is not valid JSON."
    if not isinstance(parsed, list):
        return [], "Graph configuration payload must be a JSON array."
    return parsed, None


def register_settings_routes(app: Flask) -> None:
    """Register settings and form-builder routes."""

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
            graph_config_raw = request.form.get("graph_config_json") or ""

            matches_per_page_raw = (request.form.get("matches_per_page") or "").strip()
            matches_per_page = analysis_cfg.get("matches_per_page", 25)
            if matches_per_page_raw:
                if not matches_per_page_raw.isdigit():
                    error = "Matches per page must be a number between 5 and 500."
                else:
                    matches_per_page = max(5, min(500, int(matches_per_page_raw)))

            if not error and not event_name:
                error = "Event name is required."

            if not error:
                parsed_graph_config, graph_error = _parse_graph_config_payload(
                    graph_config_raw
                )
                if graph_error:
                    error = graph_error

            if not error:
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
                    new_survey_json, inserted_fields = ensure_system_fields(
                        new_survey_json
                    )

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
            return (
                jsonify({"success": False, "error": "survey_json must be an object"}),
                400,
            )

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
        graph_config_raw = str(payload.get("graph_config_json") or "")

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

        parsed_graph_config, graph_error = _parse_graph_config_payload(graph_config_raw)
        if graph_error:
            return jsonify({"success": False, "error": graph_error}), 400

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
        """Clear local scouting data from the settings page."""
        did_reset = reset_local_data(app.logger)
        if not did_reset:
            app.logger.error("Settings reset failed")
            return (
                render_template(
                    "error.html",
                    title="Reset Failed",
                    message="Unable to clear local data. Please check file permissions.",
                ),
                500,
            )
        app.logger.info("[Settings] Local data reset completed")
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

        try:
            with export_path.open("w", encoding="utf-8") as handle:
                yaml.safe_dump(setup_data, handle, sort_keys=False)

            app.logger.info("[Setup] Exported setup file: %s", export_path)
            return send_file(
                export_path,
                as_attachment=True,
                download_name=filename,
                mimetype="text/yaml",
            )
        except Exception as exc:
            app.logger.error("[Setup] Failed to export setup file: %s", exc)
            return (
                render_template(
                    "error.html",
                    title="Export Failed",
                    message="Unable to export setup file. Please check file permissions.",
                ),
                500,
            )
