"""Reusable analysis data-preparation pipeline."""

from .analysis_config import get_enabled_graph_fields
from .survey_display import build_display_rows
from .team_analysis import get_all_teams_summary


def prepare_analysis(
    rows: list[dict],
    expected_field_names: list[str],
    survey_json: dict,
    analysis_config: dict,
) -> dict:
    """Prepare analysis table, summaries, warnings, and insights for the Analyze view."""
    result = {
        "table_columns": [],
        "table_rows": [],
        "teams_summary": [],
        "warnings": [],
        "device_statuses": [],
        "analysis_insights": {
            "quality": None,
            "leaders": [],
            "consistency": [],
        },
    }

    if not rows:
        return result

    warnings = result["warnings"]
    all_keys = set().union(*(row.keys() for row in rows))
    if "device_id" in all_keys:
        all_keys.discard("device_name")
    result["table_columns"] = [{"id": key, "label": key} for key in sorted(all_keys)]

    base_cols = {
        "timestamp",
        "event_name",
        "event_season",
        "config_id",
        "device_id",
        "device_name",
    }
    missing_fields = [field for field in expected_field_names if field not in all_keys]
    if missing_fields:
        warnings.append(f"Missing fields in uploaded CSVs: {', '.join(missing_fields)}")

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
    result["table_rows"] = build_display_rows(raw_table_rows, survey_json)

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
    result["teams_summary"] = teams_summary

    result["analysis_insights"]["quality"] = {
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

    result["analysis_insights"]["leaders"] = leaders[:3]
    result["analysis_insights"]["consistency"] = consistency[:3]

    counts_by_name = {}
    for row in raw_table_rows:
        name = (
            row.get("device_id") or row.get("device_name") or "Unknown"
        ).strip() or "Unknown"
        counts_by_name[name] = counts_by_name.get(name, 0) + 1

    result["device_statuses"] = [
        {
            "name": name,
            "entries": count,
            "status": "synced",
        }
        for name, count in sorted(counts_by_name.items())
    ]

    return result
