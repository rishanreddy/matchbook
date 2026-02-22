"""Stable hardware-derived device ID generation and persistence."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import platform
import re
import secrets
import socket
import subprocess
import uuid
from datetime import datetime, timezone

from .constants import DEVICE_FILE

logger = logging.getLogger(__name__)

DEVICE_ID_PREFIX = "osm_did_v2_"
INVALID_SIGNAL_VALUES = {
    "",
    "unknown",
    "default string",
    "to be filled by o.e.m.",
    "none",
    "null",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
    "00000000-0000-0000-0000-000000000000",
}
SIGNAL_PRIORITY = [
    "platform_uuid",
    "product_uuid",
    "machine_guid",
    "machine_id",
    "board_serial",
    "product_serial",
    "bios_serial",
    "mac_node",
]


def _sanitize_device_id(value: str) -> str:
    """Normalize an arbitrary identifier into a lowercase slug."""
    text = (value or "").strip().lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-")


def _normalize_signal(value: str | None) -> str:
    """Normalize potential hardware signal values."""
    text = str(value or "").strip()
    if not text:
        return ""
    lowered = text.lower()
    if lowered in INVALID_SIGNAL_VALUES:
        return ""
    return text


def _read_text_if_exists(path: str) -> str:
    """Read text from a file path, returning empty string on failure."""
    if not os.path.exists(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return _normalize_signal(handle.read())
    except Exception:
        return ""


def _run_command(command: list[str]) -> str:
    """Run command and return stripped stdout on success."""
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
            timeout=2,
        )
        return _normalize_signal(result.stdout)
    except Exception:
        return ""


def _extract_macos_value(raw_text: str, key: str) -> str:
    """Extract value from ioreg output like '"Key" = "VALUE"'."""
    for line in raw_text.splitlines():
        if key not in line:
            continue
        parts = line.split("=")
        if len(parts) != 2:
            continue
        return _normalize_signal(parts[1].strip().strip('"'))
    return ""


def _extract_windows_reg_value(raw_text: str, value_name: str) -> str:
    """Extract value from reg query output."""
    for line in raw_text.splitlines():
        if value_name.lower() not in line.lower():
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        return _normalize_signal(parts[-1])
    return ""


def _read_device_record() -> dict:
    """Read persisted device record from disk."""
    if not DEVICE_FILE.exists():
        return {}

    try:
        return json.loads(DEVICE_FILE.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        logger.warning("[Device] Failed to parse %s: %s", DEVICE_FILE, exc)
        return {}


def _write_device_record(record: dict) -> None:
    """Persist device record to disk."""
    payload = dict(record)
    payload.setdefault("updated_at", datetime.now(timezone.utc).isoformat())
    DEVICE_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEVICE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _collect_hardware_signals() -> dict[str, str]:
    """Collect candidate hardware identifiers across platforms."""
    signals: dict[str, str] = {}

    node = uuid.getnode()
    valid_node = isinstance(node, int) and 0 < node < (1 << 48)
    multicast_node = bool(node & (1 << 40)) if valid_node else True
    if valid_node and not multicast_node:
        signals["mac_node"] = f"{node:012x}"

    sys_name = platform.system().lower()

    if sys_name == "darwin":
        ioreg = _run_command(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"])
        platform_uuid = _extract_macos_value(ioreg, "IOPlatformUUID")
        if platform_uuid:
            signals["platform_uuid"] = platform_uuid
        serial = _extract_macos_value(ioreg, "IOPlatformSerialNumber")
        if serial:
            signals["product_serial"] = serial

    if sys_name == "windows":
        machine_guid_raw = _run_command(
            [
                "reg",
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ]
        )
        machine_guid = _extract_windows_reg_value(machine_guid_raw, "MachineGuid")
        if machine_guid:
            signals["machine_guid"] = machine_guid

        csproduct_uuid_raw = _run_command(
            ["wmic", "csproduct", "get", "uuid", "/value"]
        )
        for line in csproduct_uuid_raw.splitlines():
            if line.lower().startswith("uuid="):
                value = _normalize_signal(line.split("=", 1)[1])
                if value:
                    signals["product_uuid"] = value

    if sys_name == "linux":
        machine_id = _read_text_if_exists("/etc/machine-id") or _read_text_if_exists(
            "/var/lib/dbus/machine-id"
        )
        if machine_id:
            signals["machine_id"] = machine_id

        product_uuid = _read_text_if_exists("/sys/class/dmi/id/product_uuid")
        if product_uuid:
            signals["product_uuid"] = product_uuid

        board_serial = _read_text_if_exists("/sys/class/dmi/id/board_serial")
        if board_serial:
            signals["board_serial"] = board_serial

        product_serial = _read_text_if_exists("/sys/class/dmi/id/product_serial")
        if product_serial:
            signals["product_serial"] = product_serial

        bios_serial = _read_text_if_exists("/sys/class/dmi/id/chassis_serial")
        if bios_serial:
            signals["bios_serial"] = bios_serial

    hostname = _normalize_signal(socket.gethostname())
    if hostname:
        signals["hostname"] = hostname

    return signals


def _select_basis_keys(signals: dict[str, str], max_keys: int = 2) -> list[str]:
    """Select strongest available basis keys for deterministic ID generation."""
    keys: list[str] = []
    for key in SIGNAL_PRIORITY:
        if signals.get(key):
            keys.append(key)
        if len(keys) >= max_keys:
            break

    if not keys and signals.get("hostname"):
        keys.append("hostname")
    return keys


def _derive_id_from_basis(signals: dict[str, str], basis_keys: list[str]) -> str | None:
    """Derive v2 device ID from selected basis keys and current signals."""
    basis_pairs: list[str] = []
    for key in basis_keys:
        value = _normalize_signal(signals.get(key, ""))
        if not value:
            return None
        basis_pairs.append(f"{key}={value}")

    material = "osm|device-id|v2\n" + "\n".join(basis_pairs)
    digest = hashlib.sha256(material.encode("utf-8")).digest()
    token = base64.b32encode(digest[:16]).decode("ascii").lower().rstrip("=")
    return f"{DEVICE_ID_PREFIX}{token}"


def _generate_random_v2_id() -> str:
    """Generate a persisted random v2 device ID as final fallback."""
    token = (
        base64.b32encode(secrets.token_bytes(16)).decode("ascii").lower().rstrip("=")
    )
    return f"{DEVICE_ID_PREFIX}{token}"


def get_or_create_device_id(device_cfg: dict | None = None) -> str:
    """Return stable device ID, creating a hardware-derived v2 ID if needed.

    Priority:
      1) Existing persisted `config/device.json` device_id
      2) Hardware-derived v2 ID from stable basis keys
      3) Legacy `device.uniqueId` from config.yaml
      4) Persisted random v2 fallback
    """
    existing = _read_device_record()
    existing_id = _sanitize_device_id(str(existing.get("device_id") or ""))
    if existing_id:
        return existing_id

    signals = _collect_hardware_signals()
    basis_keys = _select_basis_keys(signals)
    hardware_id = _derive_id_from_basis(signals, basis_keys) if basis_keys else None

    if hardware_id:
        _write_device_record(
            {
                "device_id": hardware_id,
                "version": 2,
                "source": "hardware",
                "basis_keys": basis_keys,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info("[Device] Generated hardware-derived v2 device_id")
        return hardware_id

    legacy_id = _sanitize_device_id(str((device_cfg or {}).get("uniqueId") or ""))
    if legacy_id:
        _write_device_record(
            {
                "device_id": legacy_id,
                "version": 1,
                "source": "config.uniqueId",
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info("[Device] Migrated legacy uniqueId to %s", DEVICE_FILE)
        return legacy_id

    fallback_id = _generate_random_v2_id()
    _write_device_record(
        {
            "device_id": fallback_id,
            "version": 2,
            "source": "random-fallback",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    logger.warning("[Device] Hardware signals unavailable; generated random v2 ID")
    return fallback_id
