"""SurveyJS display helpers for rendering human-friendly values."""

from __future__ import annotations

import json

from .config import collect_survey_elements


def _choice_entries(element: dict, key: str) -> list[tuple[str, str]]:
    """Extract ordered (value, text) pairs from SurveyJS choice collections."""
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

        if value or text:
            entries.append((value or text, text or value))

    return entries


def _field_choice_label_map(element: dict) -> dict[str, str]:
    """Build lookup map from stored value to display label for one field."""
    field_type = str(element.get("type") or "").strip().lower()

    if field_type == "rating":
        entries = _choice_entries(element, "rateValues")
        if not entries:
            rate_min = int(element.get("rateMin") or 1)
            rate_count = int(element.get("rateCount") or 0)
            if rate_count <= 0:
                rate_max = int(element.get("rateMax") or rate_min)
                if rate_max >= rate_min:
                    rate_count = rate_max - rate_min + 1
            rate_max = rate_min + max(rate_count - 1, 0)
            entries = [
                (str(idx), f"Level {idx} of {rate_max}")
                for idx in range(rate_min, rate_max + 1)
            ]
    elif field_type in {"dropdown", "radiogroup", "checkbox", "tagbox"}:
        entries = _choice_entries(element, "choices")
    elif field_type == "boolean":
        true_label = str(element.get("labelTrue") or "Yes").strip()
        false_label = str(element.get("labelFalse") or "No").strip()
        entries = [
            ("true", true_label),
            ("false", false_label),
            ("1", true_label),
            ("0", false_label),
            ("yes", true_label),
            ("no", false_label),
        ]
    else:
        entries = []

    mapping: dict[str, str] = {}
    for value, text in entries:
        value_key = str(value).strip().lower()
        text_value = str(text).strip()
        if value_key and text_value:
            mapping[value_key] = text_value
            mapping[str(text_value).strip().lower()] = text_value
    return mapping


def _field_choice_display_entries(element: dict) -> list[dict[str, str]]:
    """Build canonical ordered value/label entries for one field."""
    field_type = str(element.get("type") or "").strip().lower()

    if field_type == "rating":
        entries = _choice_entries(element, "rateValues")
        if not entries:
            rate_min = int(element.get("rateMin") or 1)
            rate_count = int(element.get("rateCount") or 0)
            if rate_count <= 0:
                rate_max = int(element.get("rateMax") or rate_min)
                if rate_max >= rate_min:
                    rate_count = rate_max - rate_min + 1
            rate_max = rate_min + max(rate_count - 1, 0)
            entries = [
                (str(idx), f"Level {idx} of {rate_max}")
                for idx in range(rate_min, rate_max + 1)
            ]
    elif field_type in {"dropdown", "radiogroup", "checkbox", "tagbox"}:
        entries = _choice_entries(element, "choices")
    elif field_type == "boolean":
        true_label = str(element.get("labelTrue") or "Yes").strip()
        false_label = str(element.get("labelFalse") or "No").strip()
        entries = [("true", true_label), ("false", false_label)]
    else:
        entries = []

    result: list[dict[str, str]] = []
    seen = set()
    for value, label in entries:
        value_text = str(value).strip()
        label_text = str(label).strip() or value_text
        if not value_text or value_text in seen:
            continue
        seen.add(value_text)
        result.append({"value": value_text, "label": label_text})

    return result


def build_choice_label_maps(survey_json: dict) -> dict[str, dict[str, str]]:
    """Build field_name -> (stored_value -> label) maps for SurveyJS schema."""
    maps: dict[str, dict[str, str]] = {}
    for element in collect_survey_elements(survey_json or {}):
        if not isinstance(element, dict):
            continue
        name = str(element.get("name") or "").strip()
        if not name:
            continue
        mapping = _field_choice_label_map(element)
        if mapping:
            maps[name] = mapping
    return maps


def build_choice_display_entries(survey_json: dict) -> dict[str, list[dict[str, str]]]:
    """Build ordered field_name -> [{value,label}] for choice-like fields."""
    entries_by_field: dict[str, list[dict[str, str]]] = {}
    for element in collect_survey_elements(survey_json or {}):
        if not isinstance(element, dict):
            continue
        name = str(element.get("name") or "").strip()
        if not name:
            continue
        entries = _field_choice_display_entries(element)
        if entries:
            entries_by_field[name] = entries
    return entries_by_field


def _split_multi_values(raw_text: str) -> list[str]:
    """Split checkbox-like serialized values into atomic tokens."""
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


def decode_value_for_display(
    field_name: str, raw_value, label_maps: dict[str, dict[str, str]]
):
    """Decode a raw field value into a user-facing label where possible."""
    if raw_value is None:
        return ""

    mapping = label_maps.get(field_name)
    if not mapping:
        return raw_value

    tokens = _split_multi_values(str(raw_value))
    if not tokens:
        return raw_value

    decoded = [mapping.get(token.lower(), token) for token in tokens]
    if len(decoded) == 1:
        return decoded[0]
    return ", ".join(decoded)


def build_display_rows(rows: list[dict], survey_json: dict) -> list[dict]:
    """Return display rows with decoded SurveyJS labels and no duplicate device name."""
    label_maps = build_choice_label_maps(survey_json or {})
    display_rows: list[dict] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        display_row = dict(row)
        if str(display_row.get("device_id") or "").strip():
            display_row.pop("device_name", None)

        for field_name in label_maps:
            if field_name in display_row:
                display_row[field_name] = decode_value_for_display(
                    field_name,
                    display_row.get(field_name),
                    label_maps,
                )

        display_rows.append(display_row)

    return display_rows
