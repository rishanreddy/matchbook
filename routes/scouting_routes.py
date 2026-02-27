"""Scouting and setup route registrations."""

from __future__ import annotations

import csv
import datetime
import json

import yaml
from flask import (
    Flask,
    abort,
    redirect,
    render_template,
    request,
    send_file,
    url_for,
)

from utils.app_state import load_app_state, save_app_state
from utils.config import (
    backup_config,
    collect_survey_elements,
    get_device,
    load_config,
    save_config,
    validate_required_fields,
)
from utils.constants import (
    CSV_FILE,
    REQUIRED_FIELDS,
    REQUIRED_SURVEY_FIELD_GROUPS,
    TEMP_EXPORTS_DIR,
)
from utils.csv_operations import append_row, get_stats
from utils.data_lifecycle import reset_local_data
from utils.export_safety import escape_csv_cell, sanitize_filename
from utils.version_check import CURRENT_VERSION


def _is_missing_form_value(value: str | None) -> bool:
    """Return True when a submitted value should be treated as missing."""
    if value is None:
        return True
    if not isinstance(value, str):
        value = str(value)
    stripped = value.strip()
    if stripped == "":
        return True
    return stripped in {"[]", "{}"}


def register_scouting_routes(app: Flask) -> None:
    """Register scouting/setup routes."""

    @app.route("/", methods=["GET"])
    def show_form():
        """Render the scouting form page (Scouting tab)."""
        device_cfg, event, _, survey_json = load_config()
        device_id = get_device(device_cfg)

        try:
            validate_required_fields(survey_json)
        except ValueError as exc:
            app.logger.error("Configuration validation failed: %s", exc)
            return (
                render_template(
                    "error.html",
                    title="Configuration Error",
                    message=(
                        f"Configuration error: {str(exc)}. Please update your form in Settings."
                    ),
                ),
                500,
            )

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

    @app.route("/setup", methods=["GET", "POST"])
    def setup_wizard():
        """First-time setup wizard."""
        device_cfg, event, analysis_cfg, survey_json = load_config()
        device_id = get_device(device_cfg)

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
            if not event.get("name"):
                return render_template(
                    "setup_wizard.html",
                    current_version=CURRENT_VERSION,
                    device_id_preview=device_id,
                    error="Skip wizard requires an existing event. Please enter values or import a setup file.",
                )
            data_action = (request.form.get("data_action") or "keep").strip()
            if data_action == "reset":
                did_reset = reset_local_data(app.logger)
                if not did_reset:
                    app.logger.error("[Setup] Skip setup data reset failed")
                    return render_template(
                        "setup_wizard.html",
                        current_version=CURRENT_VERSION,
                        device_id_preview=device_id,
                        error="Unable to reset local data. Please check file permissions.",
                    )
                app.logger.info("[Setup] Skip setup requested with data reset")

            state = load_app_state()
            state["last_version"] = CURRENT_VERSION
            save_app_state(state)
            app.logger.info("[Setup] Wizard skipped; using existing settings")
            return redirect(url_for("show_form"))

        data_action = (request.form.get("data_action") or "keep").strip()
        should_reset_data = data_action == "reset"

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
            except (UnicodeDecodeError, yaml.YAMLError, OSError):
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

        if should_reset_data:
            did_reset = reset_local_data(app.logger)
            if not did_reset:
                app.logger.error("[Setup] Data reset failed")
                return render_template(
                    "setup_wizard.html",
                    current_version=CURRENT_VERSION,
                    device_id_preview=device_id,
                    error="Unable to reset local data. Please check file permissions.",
                )
            app.logger.info("[Setup] Data reset selected during setup")

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

        safe_name = sanitize_filename(device_id or "device")
        safe_event = sanitize_filename(event_cfg.get("name") or "event")
        ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"scouting_{safe_event}_{safe_name}_{ts}.csv"
        export_path = TEMP_EXPORTS_DIR / filename

        entry_count = 0
        try:
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
        except Exception as exc:
            app.logger.error("[Sync] Export failed: %s", exc)
            return (
                render_template(
                    "error.html",
                    title="Export Failed",
                    message="Unable to export CSV. Please check file permissions.",
                ),
                500,
            )

    @app.route("/submit", methods=["POST"])
    def submit_form():
        """Handle form submission and save to CSV."""
        device_cfg, event, _, survey_json = load_config()
        device_id = get_device(device_cfg)
        elements = collect_survey_elements(survey_json or {})

        missing: list[str] = []
        for req_field in REQUIRED_FIELDS:
            if _is_missing_form_value(request.form.get(req_field)):
                field_label = next(
                    (e.get("title") for e in elements if e.get("name") == req_field),
                    req_field,
                )
                missing.append(field_label)

        for element in elements:
            name = element.get("name")
            title = element.get("title") or name
            if str(name or "").strip().lower() in {
                "scout_name",
                "scout",
                "scouter_name",
            }:
                continue
            if element.get("isRequired") and name and _is_missing_form_value(
                request.form.get(name)
            ):
                if title not in missing:
                    missing.append(title)

        if missing:
            app.logger.warning("[Submit] Missing required fields: %s", ", ".join(missing))
            return f"Missing required fields: {', '.join(missing)}", 400

        try:
            append_row(device_cfg, event, survey_json, request.form)
        except Exception as exc:
            app.logger.error("[Submit] Failed to append CSV row: %s", exc)
            return (
                render_template(
                    "error.html",
                    title="Save Failed",
                    message="Unable to save this entry. Please check file permissions and try again.",
                ),
                500,
            )

        app.logger.info(
            "[Submit] Entry saved: device_id=%s event=%s fields=%s",
            device_id,
            event.get("name") or "",
            len(request.form),
        )
        return redirect(url_for("show_form", success="1"))

    @app.route("/reset", methods=["POST"])
    def reset_data():
        """Delete the local CSV so this device starts fresh."""
        did_reset = reset_local_data(app.logger)
        if not did_reset:
            app.logger.error("Reset failed")
            return (
                render_template(
                    "error.html",
                    title="Reset Failed",
                    message="Unable to reset data. Please check file permissions.",
                ),
                500,
            )
        app.logger.info("[Scouting] Reset data requested from scouting page")
        return redirect(url_for("show_form", reset="1"))
