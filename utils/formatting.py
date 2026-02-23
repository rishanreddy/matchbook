"""Formatting utilities for data display."""

import datetime


def format_timestamp(ts: str | None) -> str:
    """Convert an ISO timestamp string to a human-readable format.

    Args:
        ts: ISO format timestamp string

    Returns:
        Formatted timestamp string like "Dec 09, 2025 02:34 PM"
    """
    if not ts:
        return ""
    try:
        dt = datetime.datetime.fromisoformat(ts)
    except ValueError:
        # If it isn't a valid ISO string, just show whatever it is
        return ts
    # Example: "Dec 09, 2025 02:34 PM"
    return dt.strftime("%b %d, %Y %I:%M %p")


def format_device_id(value: str | None, compact: bool = False) -> str:
    """Format device IDs for readable display without changing identity."""
    text = str(value or "").strip()
    if not text:
        return ""

    if text.startswith("osm_did_v2_"):
        token = text[len("osm_did_v2_") :]
        grouped = "-".join(token[idx : idx + 4] for idx in range(0, len(token), 4))
        text = f"osm-v2-{grouped}"

    if compact and len(text) > 28:
        return f"{text[:12]}...{text[-8:]}"
    return text
