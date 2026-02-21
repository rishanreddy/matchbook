@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo Offline Scouting Manager installer
echo ---------------------------------

set "SCRIPT_DIR=%~dp0"
set "EXE_PATH="

if not "%~1"=="" (
    set "EXE_PATH=%SCRIPT_DIR%%~1"
) else (
    for %%F in ("%SCRIPT_DIR%OfflineScoutingManager-v*.exe") do (
        if exist "%%~fF" (
            set "EXE_PATH=%%~fF"
            goto :exe_found
        )
    )
)

:exe_found
if not defined EXE_PATH (
    echo ERROR: Could not find OfflineScoutingManager-v*.exe next to this installer.
    echo Place this installer in the same folder as the release executable.
    pause
    exit /b 1
)

if not exist "%EXE_PATH%" (
    echo ERROR: Executable not found: "%EXE_PATH%"
    pause
    exit /b 1
)

set "INSTALL_DIR=%LOCALAPPDATA%\OfflineScoutingManager"
set "START_MENU_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Offline Scouting Manager"
set "INSTALLED_EXE=%INSTALL_DIR%\OfflineScoutingManager.exe"
set "DESKTOP_LAUNCHER=%USERPROFILE%\Desktop\Offline Scouting Manager.bat"
set "START_MENU_LAUNCHER=%START_MENU_DIR%\Offline Scouting Manager.bat"

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%START_MENU_DIR%" mkdir "%START_MENU_DIR%"

copy /Y "%EXE_PATH%" "%INSTALLED_EXE%" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy executable into "%INSTALL_DIR%".
    pause
    exit /b 1
)

> "%DESKTOP_LAUNCHER%" (
    echo @echo off
    echo start "" "%INSTALLED_EXE%" %%*
)

> "%START_MENU_LAUNCHER%" (
    echo @echo off
    echo start "" "%INSTALLED_EXE%" %%*
)

echo.
echo Installed to: "%INSTALL_DIR%"
echo Desktop launcher: "%DESKTOP_LAUNCHER%"
echo Start Menu launcher: "%START_MENU_LAUNCHER%"
echo.

choice /M "Launch Offline Scouting Manager now"
if %errorlevel% equ 1 start "" "%INSTALLED_EXE%"

echo Installation complete.
pause
