#!/usr/bin/env bash
set -euo pipefail

echo "Building Offline Scouting Manager executable"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Please install uv first:"
  echo "https://docs.astral.sh/uv/getting-started/installation/"
  exit 1
fi

uv sync
uv pip install pillow pyinstaller

VERSION=$(uv run python scripts/get_version.py)
if [ -n "${RELEASE_ASSET_NAME:-}" ]; then
  NAME="${RELEASE_ASSET_NAME}"
elif [ -n "${GITHUB_REF_NAME:-}" ]; then
  NAME="OfflineScoutingManager-${GITHUB_REF_NAME}"
else
  NAME="OfflineScoutingManager-v${VERSION}"
fi

ICON_PATH=""
if command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
  ICONSET_DIR="build/icon.iconset"
  mkdir -p "$ICONSET_DIR"
  sips -s format png -z 16 16 static/logo.jpg --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
  sips -s format png -z 32 32 static/logo.jpg --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
  sips -s format png -z 32 32 static/logo.jpg --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
  sips -s format png -z 64 64 static/logo.jpg --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
  sips -s format png -z 128 128 static/logo.jpg --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
  sips -s format png -z 256 256 static/logo.jpg --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
  sips -s format png -z 256 256 static/logo.jpg --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
  sips -s format png -z 512 512 static/logo.jpg --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
  sips -s format png -z 512 512 static/logo.jpg --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
  sips -s format png -z 1024 1024 static/logo.jpg --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
  if iconutil -c icns "$ICONSET_DIR" -o build/icon.icns; then
    ICON_PATH="build/icon.icns"
  else
    echo "Icon build failed, continuing without icon."
  fi
fi

PYINSTALLER_ARGS=(
  "--name" "$NAME"
  "--onefile"
  "--add-data" "pyproject.toml:."
  "--add-data" "templates:templates"
  "--add-data" "static:static"
  "--add-data" "config:config"
)

if [ -n "$ICON_PATH" ]; then
  PYINSTALLER_ARGS+=("--icon" "$ICON_PATH")
fi

uv run pyinstaller "${PYINSTALLER_ARGS[@]}" main.py

echo "Build complete: dist/${NAME}"

if [ "${CREATE_MACOS_APP_BUNDLE:-0}" = "1" ] && [ "$(uname -s)" = "Darwin" ]; then
  APP_BUNDLE_NAME="${NAME}-app"
  APP_PYINSTALLER_ARGS=(
    "--name" "$APP_BUNDLE_NAME"
    "--onedir"
    "--windowed"
    "--add-data" "pyproject.toml:."
    "--add-data" "templates:templates"
    "--add-data" "static:static"
    "--add-data" "config:config"
  )

  if [ -n "$ICON_PATH" ]; then
    APP_PYINSTALLER_ARGS+=("--icon" "$ICON_PATH")
  fi

  echo "Building macOS app bundle: dist/${APP_BUNDLE_NAME}.app"
  uv run pyinstaller "${APP_PYINSTALLER_ARGS[@]}" main.py

  APP_BUNDLE_PATH="dist/${APP_BUNDLE_NAME}.app"
  APP_BUNDLE_ZIP_PATH="dist/${APP_BUNDLE_NAME}.zip"
  if [ -d "$APP_BUNDLE_PATH" ]; then
    if command -v ditto >/dev/null 2>&1; then
      if ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE_PATH" "$APP_BUNDLE_ZIP_PATH"; then
        echo "Packaged macOS app bundle: ${APP_BUNDLE_ZIP_PATH}"
      else
        echo "Warning: Failed to zip macOS app bundle at ${APP_BUNDLE_PATH}."
      fi
    else
      echo "Warning: 'ditto' not found, skipping macOS app bundle zip packaging."
    fi
  else
    echo "Warning: macOS app bundle not found at ${APP_BUNDLE_PATH}; skipping zip packaging."
  fi
fi
