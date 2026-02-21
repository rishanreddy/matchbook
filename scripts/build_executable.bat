@echo off
echo Building Offline Scouting Manager executable

where uv >nul 2>&1
if %errorlevel% neq 0 (
    echo uv not found. Please install uv first:
    echo https://docs.astral.sh/uv/getting-started/installation/
    exit /b 1
)

uv sync
uv pip install pillow pyinstaller

for /f "usebackq tokens=*" %%v in (`uv run python scripts\get_version.py`) do set VERSION=%%v
if defined GITHUB_REF_NAME (
    set NAME=OfflineScoutingManager-%GITHUB_REF_NAME%
) else (
    set NAME=OfflineScoutingManager-v%VERSION%
)

uv run python scripts\make_icon.py

uv run pyinstaller ^
  --name "%NAME%" ^
  --onefile ^
  --add-data "pyproject.toml;." ^
  --add-data "templates;templates" ^
  --add-data "static;static" ^
  --add-data "config;config" ^
  --icon "build\icon.ico" ^
  main.py

copy /Y scripts\install_windows.bat dist\install_windows.bat >nul
if %errorlevel% neq 0 (
    echo Failed to copy installer script to dist folder.
    exit /b 1
)

copy /Y scripts\create_shortcut.vbs dist\create_shortcut.vbs >nul
if %errorlevel% neq 0 (
    echo Failed to copy shortcut helper script to dist folder.
    exit /b 1
)

echo Build complete: dist\%NAME%.exe
echo Installer script: dist\install_windows.bat
echo Shortcut helper: dist\create_shortcut.vbs
if not defined CI pause
