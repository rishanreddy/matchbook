"""Survey schema normalization helpers."""

from .config import get_survey_field_names
from .constants import SYSTEM_FIELD_DEFAULTS


def ensure_system_fields(schema: dict) -> tuple[dict, list[str]]:
    """Ensure required system fields exist in SurveyJS schema."""
    if not isinstance(schema, dict):
        return {"elements": []}, [item["name"] for item in SYSTEM_FIELD_DEFAULTS]

    current_names = set(get_survey_field_names(schema))
    added: list[str] = []

    if isinstance(schema.get("pages"), list) and schema.get("pages"):
        first_page = schema["pages"][0]
        if not isinstance(first_page, dict):
            first_page = {}
            schema["pages"][0] = first_page
        if not isinstance(first_page.get("elements"), list):
            first_page["elements"] = []
        target_elements = first_page["elements"]
    else:
        if not isinstance(schema.get("elements"), list):
            schema["elements"] = []
        target_elements = schema["elements"]

    for field in reversed(SYSTEM_FIELD_DEFAULTS):
        name = field["name"]
        if name in current_names:
            continue
        target_elements.insert(0, dict(field))
        current_names.add(name)
        added.insert(0, name)

    return schema, added
