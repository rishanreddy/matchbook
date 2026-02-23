"""Generate release checksum and manifest metadata for a built asset."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def compute_sha256(file_path: Path) -> str:
    """Compute the SHA256 digest for a file."""
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def strip_version_prefix(tag: str) -> str:
    """Return tag without a leading v prefix."""
    if tag.startswith("v"):
        return tag[1:]
    return tag


def main() -> None:
    """Generate .sha256 and .manifest.json files beside an asset."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", required=True, help="Path to release asset")
    parser.add_argument("--tag", required=True, help="Release tag (example: v0.1.6)")
    args = parser.parse_args()

    asset_path = Path(args.asset)
    if not asset_path.exists() or not asset_path.is_file():
        raise SystemExit(f"Asset not found: {asset_path}")

    sha256 = compute_sha256(asset_path)
    size_bytes = asset_path.stat().st_size
    generated_at_utc = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    version = strip_version_prefix(args.tag)

    checksum_path = Path(f"{asset_path}.sha256")
    checksum_path.write_text(f"{sha256}  {asset_path.name}\n", encoding="utf-8")

    manifest_path = Path(f"{asset_path}.manifest.json")
    manifest_data = {
        "tag": args.tag,
        "version": version,
        "file_name": asset_path.name,
        "size_bytes": size_bytes,
        "sha256": sha256,
        "generated_at_utc": generated_at_utc,
    }
    manifest_path.write_text(
        json.dumps(manifest_data, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
