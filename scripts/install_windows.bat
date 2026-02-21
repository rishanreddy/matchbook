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
set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\Offline Scouting Manager.lnk"
set "START_MENU_SHORTCUT=%START_MENU_DIR%\Offline Scouting Manager.lnk"
set "VBSCRIPT=%INSTALL_DIR%\create_shortcut.vbs"

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%START_MENU_DIR%" mkdir "%START_MENU_DIR%"

copy /Y "%EXE_PATH%" "%INSTALLED_EXE%" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy executable into "%INSTALL_DIR%".
    pause
    exit /b 1
)

REM Copy VBScript helper for creating shortcuts
set "VBSCRIPT_SOURCE=%SCRIPT_DIR%create_shortcut.vbs"
if not exist "%VBSCRIPT_SOURCE%" (
    echo WARNING: create_shortcut.vbs not found, using fallback method
    goto :fallback_shortcuts
)

copy /Y "%VBSCRIPT_SOURCE%" "%VBSCRIPT%" >nul
if %errorlevel% neq 0 (
    echo WARNING: Failed to copy VBScript helper, using fallback method
    goto :fallback_shortcuts
)

REM Create proper .lnk shortcuts with icons
cscript //nologo "%VBSCRIPT%" "%INSTALLED_EXE%" "%DESKTOP_SHORTCUT%" "Offline Scouting Manager" >nul 2>&1
cscript //nologo "%VBSCRIPT%" "%INSTALLED_EXE%" "%START_MENU_SHORTCUT%" "Offline Scouting Manager" >nul 2>&1

if exist "%DESKTOP_SHORTCUT%" (
    echo Created desktop shortcut: "%DESKTOP_SHORTCUT%"
) else (
    echo WARNING: Failed to create desktop shortcut
)

if exist "%START_MENU_SHORTCUT%" (
    echo Created Start Menu shortcut: "%START_MENU_SHORTCUT%"
) else (
    echo WARNING: Failed to create Start Menu shortcut
)

goto :post_shortcuts

:fallback_shortcuts
REM Fallback: create .bat launchers if VBScript method fails
> "%USERPROFILE%\Desktop\Offline Scouting Manager.bat" (
    echo @echo off
    echo start "" "%INSTALLED_EXE%" %%*
)

> "%START_MENU_DIR%\Offline Scouting Manager.bat" (
    echo @echo off
    echo start "" "%INSTALLED_EXE%" %%*
)

echo Created fallback batch launchers

:post_shortcuts


echo.
echo Installed to: "%INSTALL_DIR%"
if exist "%DESKTOP_SHORTCUT%" (
    echo Desktop shortcut: "%DESKTOP_SHORTCUT%"
) else if exist "%USERPROFILE%\Desktop\Offline Scouting Manager.bat" (
    echo Desktop launcher: "%USERPROFILE%\Desktop\Offline Scouting Manager.bat"
)
if exist "%START_MENU_SHORTCUT%" (
    echo Start Menu shortcut: "%START_MENU_SHORTCUT%"
) else if exist "%START_MENU_DIR%\Offline Scouting Manager.bat" (
    echo Start Menu launcher: "%START_MENU_DIR%\Offline Scouting Manager.bat"
)
echo.

choice /M "Launch Offline Scouting Manager now"
if %errorlevel% equ 1 start "" "%INSTALLED_EXE%"

echo Installation complete.
pause
