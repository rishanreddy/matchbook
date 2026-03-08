"""Reusable analysis data-preparation pipeline."""

from __future__ import annotations

import re

from .analysis_config import get_enabled_graph_fields
from .csv_operations import parse_numeric_value
from .survey_display import build_display_rows
from .team_analysis import get_all_teams_summary, normalize_team_id


def _as_clean_text(value) -> str:
    """Return a stripped string value, or empty string when blank."""
    if value is None:
        return ""
    return str(value).strip()


def _to_finite_float(value) -> float | None:
    """Return finite float value when possible, otherwise None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        if numeric != numeric or numeric in (float("inf"), float("-inf")):
            return None
        return numeric
    return None


def _extract_match_sort_value(row: dict, fallback_index: int) -> float:
    """Return sortable match position from row data."""
    match_raw = row.get("match") or row.get("match_number")
    numeric_match = parse_numeric_value(match_raw)
    if numeric_match is not None:
        return numeric_match

    match_text = _as_clean_text(match_raw)
    if match_text:
        match_num = re.search(r"-?\d+(?:\.\d+)?", match_text)
        if match_num:
            try:
                return float(match_num.group(0))
            except ValueError:
                pass

    return float(fallback_index)


def _score_row_performance(row: dict, stat_fields: list[str]) -> float | None:
    """Build a per-match performance proxy from selected stat fields."""
    values: list[float] = []
    for field in stat_fields:
        numeric = parse_numeric_value(row.get(field))
        if numeric is None:
            continue
        values.append(float(numeric))

    if not values:
        return None
    return sum(values)


def _collect_field_maxima(
    teams_summary: list[dict], stat_fields: list[str]
) -> dict[str, float]:
    """Return best team average per field for normalization."""
    maxima = {field: 0.0 for field in stat_fields}
    for team_item in teams_summary:
        team_stats = team_item.get("stats") or {}
        for field in stat_fields:
            avg_value = _to_finite_float((team_stats.get(field) or {}).get("average"))
            if avg_value is None:
                continue
            if avg_value > maxima[field]:
                maxima[field] = avg_value
    return maxima


def _build_reliability_rankings(
    teams_summary: list[dict], stat_fields: list[str]
) -> list[dict]:
    """Calculate team reliability score from performance, consistency, confidence."""
    if not teams_summary or not stat_fields:
        return []

    field_maxima = _collect_field_maxima(teams_summary, stat_fields)
    scored: list[dict] = []

    for team_item in teams_summary:
        team_stats = team_item.get("stats") or {}
        team_number = _as_clean_text(team_item.get("team_number"))
        matches = int(team_item.get("total_matches") or 0)
        if not team_number:
            continue

        avg_components: list[float] = []
        consistency_components: list[float] = []

        for field in stat_fields:
            field_stats = team_stats.get(field) or {}
            avg_value = _to_finite_float(field_stats.get("average"))
            min_value = _to_finite_float(field_stats.get("min"))
            max_value = _to_finite_float(field_stats.get("max"))

            if avg_value is None:
                continue

            max_reference = max(field_maxima.get(field, 0.0), 1.0)
            normalized_avg = max(0.0, min(avg_value / max_reference, 1.0))
            avg_components.append(normalized_avg)

            if min_value is None or max_value is None:
                continue

            spread = max(0.0, max_value - min_value)
            consistency = max(0.0, min(1.0 - (spread / max_reference), 1.0))
            consistency_components.append(consistency)

        if not avg_components:
            continue

        avg_component = sum(avg_components) / len(avg_components)
        consistency_component = (
            sum(consistency_components) / len(consistency_components)
            if consistency_components
            else 0.5
        )
        confidence_component = min(matches / 6.0, 1.0)

        reliability_score = (
            (avg_component * 0.50)
            + (consistency_component * 0.30)
            + (confidence_component * 0.20)
        ) * 100.0

        scored.append(
            {
                "team": team_number,
                "matches": matches,
                "score": round(reliability_score, 1),
                "avg_component": round(avg_component * 100.0, 1),
                "consistency_component": round(consistency_component * 100.0, 1),
                "confidence_component": round(confidence_component * 100.0, 1),
                "confidence_tier": (
                    "high" if matches >= 6 else "medium" if matches >= 3 else "low"
                ),
            }
        )

    scored.sort(key=lambda item: (item["score"], item["matches"]), reverse=True)

    total_ranked = len(scored)
    if total_ranked == 0:
        return []

    for index, item in enumerate(scored, start=1):
        if total_ranked == 1:
            percentile = 100.0
        else:
            percentile = ((total_ranked - index) / (total_ranked - 1)) * 100.0
        item["percentile"] = round(percentile, 0)

    return scored[:5]


def _build_team_rows_index(rows: list[dict]) -> dict[str, list[dict]]:
    """Index rows by normalized team ID."""
    by_team: dict[str, list[dict]] = {}
    for row in rows:
        team_id = normalize_team_id(row.get("team") or row.get("team_number"))
        if not team_id:
            continue
        by_team.setdefault(team_id, []).append(row)
    return by_team


def _build_trend_watch(
    team_rows: dict[str, list[dict]], stat_fields: list[str]
) -> list[dict]:
    """Detect improving or declining team performance trends."""
    trend_items: list[dict] = []

    for team_id, rows in team_rows.items():
        points: list[tuple[float, float]] = []
        for idx, row in enumerate(rows, start=1):
            score = _score_row_performance(row, stat_fields)
            if score is None:
                continue
            points.append((_extract_match_sort_value(row, idx), score))

        if len(points) < 3:
            continue

        points.sort(key=lambda pair: pair[0])
        y_values = [pair[1] for pair in points]
        count = len(y_values)
        x_values = list(range(1, count + 1))

        x_mean = (count + 1) / 2.0
        y_mean = sum(y_values) / count
        denominator = sum((x - x_mean) ** 2 for x in x_values)
        if denominator <= 0.0:
            continue

        numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values))
        slope = numerator / denominator
        relative_slope = slope / max(abs(y_mean), 1.0)

        segment_size = max(1, count // 3)
        early_avg = sum(y_values[:segment_size]) / segment_size
        late_avg = sum(y_values[-segment_size:]) / segment_size
        delta = late_avg - early_avg

        direction = ""
        if relative_slope >= 0.08 and delta > 0:
            direction = "up"
        elif relative_slope <= -0.08 and delta < 0:
            direction = "down"

        if not direction:
            continue

        trend_items.append(
            {
                "team": team_id,
                "direction": direction,
                "matches": count,
                "avg_score": round(y_mean, 2),
                "delta": round(delta, 2),
                "slope": round(slope, 2),
            }
        )

    trend_items.sort(key=lambda item: abs(item["delta"]), reverse=True)
    return trend_items[:6]


def _build_boom_bust_flags(
    teams_summary: list[dict], stat_fields: list[str]
) -> list[dict]:
    """Flag teams with high ceiling but high volatility."""
    flags: list[dict] = []

    for team_item in teams_summary:
        matches = int(team_item.get("total_matches") or 0)
        if matches < 3:
            continue

        team_number = _as_clean_text(team_item.get("team_number"))
        team_stats = team_item.get("stats") or {}

        avg_values: list[float] = []
        max_values: list[float] = []
        ranges: list[float] = []

        for field in stat_fields:
            field_stats = team_stats.get(field) or {}
            avg_value = _to_finite_float(field_stats.get("average"))
            min_value = _to_finite_float(field_stats.get("min"))
            max_value = _to_finite_float(field_stats.get("max"))
            if avg_value is None or min_value is None or max_value is None:
                continue

            avg_values.append(avg_value)
            max_values.append(max_value)
            ranges.append(max(0.0, max_value - min_value))

        if not avg_values:
            continue

        avg_score = sum(avg_values) / len(avg_values)
        peak_score = sum(max_values) / len(max_values)
        volatility = sum(ranges) / len(ranges)

        volatility_ratio = volatility / max(abs(avg_score), 1.0)
        peak_ratio = peak_score / max(abs(avg_score), 1.0)
        if volatility_ratio < 0.75 or peak_ratio < 1.35:
            continue

        flags.append(
            {
                "team": team_number,
                "matches": matches,
                "volatility_ratio": round(volatility_ratio, 2),
                "peak_ratio": round(peak_ratio, 2),
                "avg_score": round(avg_score, 2),
                "peak_score": round(peak_score, 2),
            }
        )

    flags.sort(key=lambda item: item["volatility_ratio"], reverse=True)
    return flags[:4]


def _build_red_flags(
    raw_rows: list[dict],
    teams_summary: list[dict],
    stat_fields: list[str],
    duplicate_count: int,
    invalid_rows_ignored: int,
) -> list[dict]:
    """Build reliability and data-confidence warnings."""
    total_rows = len(raw_rows)
    if total_rows <= 0:
        return []

    flags: list[dict] = []

    if invalid_rows_ignored > 0:
        flags.append(
            {
                "level": "warning",
                "message": f"Ignored {invalid_rows_ignored} malformed row(s) during analysis.",
            }
        )

    if duplicate_count > 0:
        flags.append(
            {
                "level": "warning",
                "message": (
                    f"Removed {duplicate_count} duplicate row(s)"
                    " (same device + match + team)."
                ),
            }
        )

    missing_team_rows = sum(
        1
        for row in raw_rows
        if not normalize_team_id(row.get("team") or row.get("team_number"))
    )
    if (missing_team_rows / total_rows) >= 0.05:
        flags.append(
            {
                "level": "danger",
                "message": (
                    f"{missing_team_rows}/{total_rows} rows are missing team IDs"
                    " (can hide true team performance)."
                ),
            }
        )

    missing_match_rows = sum(
        1
        for row in raw_rows
        if not _as_clean_text(row.get("match") or row.get("match_number"))
    )
    if (missing_match_rows / total_rows) >= 0.05:
        flags.append(
            {
                "level": "warning",
                "message": (
                    f"{missing_match_rows}/{total_rows} rows are missing match IDs"
                    " (trend detection confidence is reduced)."
                ),
            }
        )

    low_sample_teams = [
        _as_clean_text(item.get("team_number"))
        for item in teams_summary
        if int(item.get("total_matches") or 0) < 2
    ]
    if low_sample_teams:
        preview = ", ".join(low_sample_teams[:4])
        suffix = "..." if len(low_sample_teams) > 4 else ""
        flags.append(
            {
                "level": "info",
                "message": (
                    f"{len(low_sample_teams)} team(s) have fewer than 2 matches"
                    f" ({preview}{suffix})."
                ),
            }
        )

    for field in stat_fields:
        valid = 0
        for row in raw_rows:
            if parse_numeric_value(row.get(field)) is not None:
                valid += 1
        coverage = valid / total_rows
        if coverage >= 0.60:
            continue
        flags.append(
            {
                "level": "warning",
                "message": (
                    f"Field '{field}' has {round(coverage * 100)}% numeric coverage"
                    " (insights may be less reliable)."
                ),
            }
        )

    return flags[:6]


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
            "reliability": [],
            "trends": [],
            "boom_bust": [],
            "red_flags": [],
        },
    }

    if not isinstance(analysis_config, dict):
        analysis_config = {}
    if not isinstance(expected_field_names, list):
        expected_field_names = []

    if not rows:
        return result

    warnings = result["warnings"]

    valid_rows: list[dict] = []
    invalid_rows_ignored = 0
    for row in rows:
        if isinstance(row, dict):
            valid_rows.append(row)
        else:
            invalid_rows_ignored += 1

    if invalid_rows_ignored:
        warnings.append(
            f"Ignored {invalid_rows_ignored} malformed row(s) that were not valid records."
        )

    if not valid_rows:
        return result

    all_keys: set[str] = set()
    for row in valid_rows:
        for key in row.keys():
            normalized_key = _as_clean_text(key)
            if normalized_key:
                all_keys.add(normalized_key)

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

    deduped_rows: list[dict] = []
    seen = set()
    dup_count = 0
    for row in valid_rows:
        device_key = _as_clean_text(row.get("device_id") or row.get("device_name"))
        match_val = _as_clean_text(row.get("match") or row.get("match_number"))
        team_val = normalize_team_id(row.get("team") or row.get("team_number"))
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

    stat_fields: list[str] = []
    seen_fields = set()
    for field_item in graph_fields_config:
        if isinstance(field_item, dict):
            field_name = _as_clean_text(field_item.get("field"))
        else:
            field_name = _as_clean_text(field_item)
        if not field_name or field_name in seen_fields:
            continue
        seen_fields.add(field_name)
        stat_fields.append(field_name)

    if not stat_fields:
        stat_fields = ["auto_score", "teleop_score"]

    teams_summary = get_all_teams_summary(raw_table_rows, stat_fields)
    result["teams_summary"] = teams_summary

    result["analysis_insights"]["quality"] = {
        "rows_loaded": len(rows),
        "rows_kept": len(raw_table_rows),
        "duplicates_removed": dup_count,
        "invalid_rows_ignored": invalid_rows_ignored,
        "teams_with_data": len(teams_summary),
        "missing_team_rows": sum(
            1
            for row in raw_table_rows
            if not normalize_team_id(row.get("team") or row.get("team_number"))
        ),
        "missing_match_rows": sum(
            1
            for row in raw_table_rows
            if not _as_clean_text(row.get("match") or row.get("match_number"))
        ),
    }

    leaders: list[dict] = []
    consistency: list[dict] = []
    for field in stat_fields:
        best_team = ""
        best_avg = None
        best_range = None
        most_consistent_team = ""

        for team_item in teams_summary:
            team_number = _as_clean_text(team_item.get("team_number"))
            team_matches = int(team_item.get("total_matches") or 0)
            stats = (team_item.get("stats") or {}).get(field) or {}
            avg_value = _to_finite_float(stats.get("average"))
            min_value = _to_finite_float(stats.get("min"))
            max_value = _to_finite_float(stats.get("max"))

            if avg_value is not None:
                if best_avg is None or avg_value > best_avg:
                    best_avg = avg_value
                    best_team = team_number

            if team_matches < 2:
                continue
            if min_value is None or max_value is None:
                continue

            value_range = max(0.0, max_value - min_value)
            if best_range is None or value_range < best_range:
                best_range = value_range
                most_consistent_team = team_number

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
    result["analysis_insights"]["reliability"] = _build_reliability_rankings(
        teams_summary, stat_fields
    )

    team_rows = _build_team_rows_index(raw_table_rows)
    result["analysis_insights"]["trends"] = _build_trend_watch(team_rows, stat_fields)
    result["analysis_insights"]["boom_bust"] = _build_boom_bust_flags(
        teams_summary, stat_fields
    )
    result["analysis_insights"]["red_flags"] = _build_red_flags(
        raw_table_rows,
        teams_summary,
        stat_fields,
        dup_count,
        invalid_rows_ignored,
    )

    counts_by_name: dict[str, int] = {}
    for row in raw_table_rows:
        name = _as_clean_text(
            row.get("device_id") or row.get("device_name") or "Unknown"
        )
        name = name or "Unknown"
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
