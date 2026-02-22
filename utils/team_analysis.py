"""Team data analysis and statistics calculations."""

from __future__ import annotations

import logging
import json

from .config import collect_survey_elements, load_config
from .csv_operations import load_all_rows, parse_numeric_value
from .temp_uploads import load_combined_data_from_temp

logger = logging.getLogger(__name__)


def _load_rows(temp_filenames: list[str] | None) -> list[dict]:
    """Load rows from local CSV or uploaded temp files."""
    if temp_filenames is None:
        rows = load_all_rows()
        logger.debug("[Analysis] Loaded %s local rows", len(rows))
        return rows

    rows = load_combined_data_from_temp(temp_filenames)
    logger.debug(
        "[Analysis] Loaded %s rows from %s uploaded temp files",
        len(rows),
        len(temp_filenames),
    )
    return rows


def _normalize_stat_fields(stat_fields: list[str] | None) -> list[str]:
    """Normalize stat field names and apply defaults."""
    if not stat_fields:
        return ["auto_score", "teleop_score"]

    cleaned: list[str] = []
    seen = set()
    for field in stat_fields:
        name = str(field or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        cleaned.append(name)

    return cleaned or ["auto_score", "teleop_score"]


def _get_field_metadata() -> dict[str, dict]:
    """Build a map of field name -> SurveyJS element metadata."""
    _, _, _, survey_json = load_config()
    metadata: dict[str, dict] = {}
    for element in collect_survey_elements(survey_json or {}):
        name = element.get("name")
        if isinstance(name, str) and name:
            metadata[name] = element
    return metadata


def _choice_entries(element: dict, key: str) -> list[tuple[str, str]]:
    """Extract ordered (value, text) entries for choice-like SurveyJS configs."""
    raw_choices = element.get(key)
    if not isinstance(raw_choices, list):
        return []

    entries: list[tuple[str, str]] = []
    for item in raw_choices:
        if isinstance(item, dict):
            value = str(
                item.get("value")
                if item.get("value") is not None
                else item.get("text") or ""
            ).strip()
            text = str(
                item.get("text") if item.get("text") is not None else value
            ).strip()
        else:
            value = str(item).strip()
            text = value

        if not value and not text:
            continue
        entries.append((value or text, text or value))

    return entries


def _build_choice_score_map(element: dict) -> dict[str, float]:
    """Build a lookup map for categorical values to numeric scores."""
    ftype = str(element.get("type") or "").strip().lower()

    if ftype == "rating":
        entries = _choice_entries(element, "rateValues")
        if not entries:
            rate_count = int(element.get("rateCount") or 0)
            entries = [(str(idx), str(idx)) for idx in range(1, rate_count + 1)]
    else:
        entries = _choice_entries(element, "choices")

    if not entries:
        return {}

    numeric_values = [parse_numeric_value(value) for value, _ in entries]
    can_use_numeric = all(value is not None for value in numeric_values)

    score_map: dict[str, float] = {}
    for index, (value, text) in enumerate(entries, start=1):
        numeric_value = numeric_values[index - 1]
        if can_use_numeric and numeric_value is not None:
            score = float(numeric_value)
        else:
            score = float(index)
        score_map[str(value).strip().lower()] = score
        score_map[str(text).strip().lower()] = score

    return score_map


def _score_field_value(
    field_name: str, raw_value, metadata: dict[str, dict]
) -> float | None:
    """Convert a raw field value into a comparable numeric score."""

    def _split_multi_values(raw_text: str) -> list[str]:
        text = str(raw_text or "").strip()
        if not text:
            return []

        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                pass

        if "," in text:
            return [chunk.strip() for chunk in text.split(",") if chunk.strip()]

        if ";" in text:
            return [chunk.strip() for chunk in text.split(";") if chunk.strip()]

        return [text]

    element = metadata.get(field_name, {})
    if isinstance(element, dict):
        field_type = str(element.get("type") or "").strip().lower()
        if field_type in {"checkbox", "tagbox"}:
            choice_map = _build_choice_score_map(element)
            tokens = _split_multi_values(raw_value)
            scores: list[float] = []
            for token in tokens:
                mapped = choice_map.get(token.lower()) if choice_map else None
                if mapped is None:
                    mapped = parse_numeric_value(token)
                if mapped is not None:
                    scores.append(float(mapped))
            if scores:
                return max(scores)

    direct_numeric = parse_numeric_value(raw_value)
    if direct_numeric is not None:
        return direct_numeric

    text = str(raw_value or "").strip()
    if not text:
        return None

    if not isinstance(element, dict):
        return None

    choice_map = _build_choice_score_map(element)
    if not choice_map:
        return None

    return choice_map.get(text.lower())


def _calculate_stats_for_matches(
    matches: list[dict], stat_fields: list[str], metadata: dict[str, dict]
) -> dict[str, dict[str, float]]:
    """Calculate aggregate stats for selected fields across matches."""
    stats: dict[str, dict[str, float]] = {}

    for field in stat_fields:
        values: list[float] = []
        for match in matches:
            scored = _score_field_value(field, match.get(field, ""), metadata)
            if scored is None:
                continue
            values.append(scored)

        if values:
            total = float(sum(values))
            stats[field] = {
                "average": round(total / len(values), 2),
                "max": max(values),
                "min": min(values),
                "total": round(total, 2),
            }
        else:
            stats[field] = {"average": 0.0, "max": 0.0, "min": 0.0, "total": 0.0}

    return stats


def get_team_data(team_number, temp_filenames=None):
    """Get all match data for a specific team."""
    all_rows = _load_rows(temp_filenames)
    team_matches = [
        row
        for row in all_rows
        if str(row.get("team", "")).strip() == str(team_number).strip()
    ]
    logger.debug(
        "[Analysis] Team %s matches=%s source=%s",
        team_number,
        len(team_matches),
        "temp" if temp_filenames is not None else "local",
    )
    return team_matches


def calculate_team_stats(team_number, stat_fields=None, temp_filenames=None):
    """Calculate statistics for a team across all matches."""
    matches = get_team_data(team_number, temp_filenames)
    if not matches:
        return {
            "team_number": team_number,
            "total_matches": 0,
            "stats": {},
            "matches": [],
        }

    normalized_fields = _normalize_stat_fields(stat_fields)
    metadata = _get_field_metadata()
    stats = _calculate_stats_for_matches(matches, normalized_fields, metadata)

    return {
        "team_number": team_number,
        "total_matches": len(matches),
        "stats": stats,
        "matches": matches,
    }


def get_all_teams_summary(rows, stat_fields=None):
    """Generate a summary for all teams from CSV data."""
    if not rows:
        return []

    normalized_fields = _normalize_stat_fields(stat_fields)
    metadata = _get_field_metadata()

    teams_data: dict[str, list[dict]] = {}
    for row in rows:
        team = str(row.get("team", "")).strip()
        if not team:
            continue
        teams_data.setdefault(team, []).append(row)

    summaries: list[dict] = []
    for team_number, matches in teams_data.items():
        stats = _calculate_stats_for_matches(matches, normalized_fields, metadata)
        summaries.append(
            {
                "team_number": team_number,
                "total_matches": len(matches),
                "stats": {
                    field: {
                        "average": value.get("average", 0.0),
                        "max": value.get("max", 0.0),
                        "min": value.get("min", 0.0),
                    }
                    for field, value in stats.items()
                },
            }
        )

    summaries.sort(
        key=lambda item: (
            int(item["team_number"]) if item["team_number"].isdigit() else 0
        )
    )
    logger.debug("[Analysis] Generated team summaries: %s teams", len(summaries))
    return summaries


def get_all_teams(temp_filenames=None):
    """Return all unique numeric team numbers from available data."""
    all_rows = _load_rows(temp_filenames)
    teams = set()
    for row in all_rows:
        team = str(row.get("team", "")).strip()
        if team.isdigit():
            teams.add(int(team))
    return teams


def get_radar_data(team_number, stat_fields, temp_filenames=None):
    """Generate radar scores relative to best team averages per field."""
    normalized_fields = _normalize_stat_fields(stat_fields)
    rows = _load_rows(temp_filenames)
    if not rows:
        return {field: 0.0 for field in normalized_fields}

    teams_data: dict[int, list[dict]] = {}
    for row in rows:
        team_text = str(row.get("team", "")).strip()
        if not team_text.isdigit():
            continue
        teams_data.setdefault(int(team_text), []).append(row)

    if not teams_data:
        return {field: 0.0 for field in normalized_fields}

    team_number_int = int(team_number)
    if team_number_int not in teams_data:
        return {field: 0.0 for field in normalized_fields}

    metadata = _get_field_metadata()
    team_stats_by_team = {
        team: _calculate_stats_for_matches(matches, normalized_fields, metadata)
        for team, matches in teams_data.items()
    }

    team_stats = team_stats_by_team.get(team_number_int, {})

    radar_data: dict[str, float] = {}
    for field in normalized_fields:
        best = 0.0
        for stats in team_stats_by_team.values():
            field_avg = float(stats.get(field, {}).get("average", 0.0))
            best = max(best, field_avg)

        team_avg = float(team_stats.get(field, {}).get("average", 0.0))
        radar_data[field] = round((team_avg / best) * 100, 2) if best > 0 else 0.0

    logger.debug(
        "[Analysis] Radar data generated for team=%s fields=%s",
        team_number,
        len(normalized_fields),
    )
    return radar_data
