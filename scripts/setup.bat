@echo off
echo Offline Scouting Manager setup
echo ------------------------------

where uv >nul 2>&1
if %errorlevel% neq 0 (
    echo uv not found. Attempting to install...
    powershell -Command "irm https://astral.sh/uv/install.ps1 | iex"
    if %errorlevel% neq 0 (
        echo ERROR: Could not install uv automatically.
        echo Please install uv first:
        echo https://docs.astral.sh/uv/getting-started/installation/
        pause
        exit /b 1
    )
)

echo Installing Python dependencies...
uv sync
if %errorlevel% neq 0 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)

echo Starting application...
uv run main.py %*
pause
