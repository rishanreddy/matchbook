"""Configuration helpers for analysis graphs and settings payloads."""

import json

from .config import collect_survey_elements


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
