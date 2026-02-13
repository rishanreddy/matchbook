"""Device registry utilities for tracking scouting devices."""

import json
from collections import defaultdict
from datetime import datetime, timezone

from .constants import DEVICE_REGISTRY_FILE


def load_registry() -> dict:
    """Load the device registry from disk."""
    if DEVICE_REGISTRY_FILE.exists():
        try:
            return json.loads(DEVICE_REGISTRY_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"expected_devices": 8, "devices": {}}
    return {"expected_devices": 8, "devices": {}}


def save_registry(registry: dict) -> None:
    """Persist device registry to disk."""
    DEVICE_REGISTRY_FILE.parent.mkdir(exist_ok=True)
    DEVICE_REGISTRY_FILE.write_text(json.dumps(registry, indent=2), encoding="utf-8")


def get_device_key(device_id: str, device_name: str) -> str:
    """Generate a stable registry key."""
    if device_id:
        return device_id
    if device_name:
        return f"name:{device_name}"
    return "unknown"


def update_device(
    registry: dict,
    device_id: str,
    device_name: str,
    entry_count: int,
    event: str,
    source: str,
) -> dict:
    """Update or insert a device record in the registry."""
    key = get_device_key(device_id, device_name)
    now = datetime.now(timezone.utc).isoformat()

    devices = registry.setdefault("devices", {})
    device = devices.get(key, {})

    device["device_id"] = device_id or device.get("device_id")
    device["name"] = device_name or device.get("name")
    device["last_seen"] = now
    device["last_event"] = event or device.get("last_event")
    device["entry_count"] = entry_count
    device["last_source"] = source

    if source == "export":
        device["last_export"] = now

    devices[key] = device
    return registry


def register_from_rows(rows: list, event: str, source: str) -> dict:
    """Build a registry update from CSV rows."""
    registry = load_registry()
    counts = defaultdict(int)
    names = {}

    for row in rows:
        device_id = (row.get("device_id") or "").strip()
        device_name = (row.get("device_name") or "").strip()
        key = get_device_key(device_id, device_name)
        counts[key] += 1
        names[key] = (device_id, device_name)

    for key, count in counts.items():
        device_id, device_name = names.get(key, ("", ""))
        registry = update_device(
            registry,
            device_id=device_id,
            device_name=device_name,
            entry_count=count,
            event=event,
            source=source,
        )

    save_registry(registry)
    return registry


def list_devices(registry: dict) -> list:
    """Return device list sorted by name."""
    devices = list(registry.get("devices", {}).values())
    devices.sort(key=lambda d: (d.get("name") or "", d.get("device_id") or ""))
    return devices


def get_expected_devices(registry: dict, fallback: int = 8) -> int:
    """Get expected device count from registry or fallback."""
    return int(registry.get("expected_devices") or fallback)


def set_expected_devices(registry: dict, count: int) -> dict:
    """Set expected device count in registry."""
    registry["expected_devices"] = int(count)
    return registry
