@echo off
echo Building Offline Scouting Manager executable

where uv >nul 2>&1
if %errorlevel% neq 0 (
    echo uv not found. Please install uv first:
    echo https://docs.astral.sh/uv/getting-started/installation/
    exit /b 1
)

uv sync
uv pip install pyinstaller

uv run pyinstaller ^
  --name "OfflineScoutingManager" ^
  --onefile ^
  --add-data "pyproject.toml;." ^
  --add-data "templates;templates" ^
  --add-data "static;static" ^
  --add-data "config;config" ^
  main.py

echo Build complete: dist\OfflineScoutingManager.exe
pause
