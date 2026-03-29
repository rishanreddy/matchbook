# Production Deployment

## Prerequisites
- Node.js + pnpm installed
- `pnpm install`
- Update server reachable at `publish.url` in `electron-builder.yml`

## Build commands
- Pack without installers: `pnpm electron:pack`
- All platform dist (host-dependent): `pnpm electron:dist`
- Windows installer: `pnpm electron:dist:win`
- macOS DMG: `pnpm electron:dist:mac`
- Linux AppImage: `pnpm electron:dist:linux`

## Build pipeline behavior
- `prebuild` runs `scripts/prepare-build.mjs`
  - Cleans `release/`, `dist/`, and `dist-electron/`
  - Generates `build/build-info.json` timestamp metadata
- Vite build includes chunk splitting for smaller startup bundles

## Auto-updates
- Configured through `electron-updater` and `publish` in `electron-builder.yml`
- Ensure your update server hosts release artifacts + metadata files from `release/`

## Code signing (future setup)
- **Windows**: configure `CSC_LINK` and `CSC_KEY_PASSWORD` env vars for signing cert
- **macOS**: configure Apple Developer cert + notarization (`APPLE_ID`, app-specific password, team ID)
- Keep secrets in CI environment variables; do not commit credentials

## Installer behavior
- NSIS includes:
  - directory chooser
  - desktop + start menu shortcuts
  - post-install launch option
  - license agreement (MIT via `LICENSE`)
