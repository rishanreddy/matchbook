"""Checksum parsing and verification for updates."""

from __future__ import annotations

import hashlib
from pathlib import Path


def compute_sha256(file_path: Path) -> str:
    """Compute SHA-256 for a file."""
    digest = hashlib.sha256()
    with file_path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 256), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def parse_sha256_text(contents: str, target_filename: str | None = None) -> str | None:
    """Parse sha256sum-style text and return hash."""
    lines = [line.strip() for line in str(contents or "").splitlines() if line.strip()]
    if not lines:
        return None

    if target_filename:
        lowered_target = target_filename.lower()
        for line in lines:
            parts = line.split()
            if (
                len(parts) >= 2
                and parts[0]
                and parts[-1].lower().endswith(lowered_target)
            ):
                return parts[0].lower()

    first = lines[0].split()[0]
    if len(first) == 64:
        return first.lower()
    return None


def verify_sha256(file_path: Path, expected_sha256: str) -> bool:
    """Verify file hash against expected SHA-256."""
    if not expected_sha256:
        return False
    actual = compute_sha256(file_path)
    return actual == expected_sha256.lower()
