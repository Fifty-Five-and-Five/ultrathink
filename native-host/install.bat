@echo off
REM Installation script for UltraThink Native Messaging Host
REM Run this as Administrator after installing the extension

echo ============================================
echo UltraThink Native Host Installer
echo ============================================
echo.

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0

REM Remove trailing backslash if present
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

echo Script directory: %SCRIPT_DIR%
echo.

REM Prompt for extension ID
echo First, load the extension in Edge (developer mode).
echo Go to edge://extensions and find your Extension ID.
echo.
set /p EXT_ID="Enter your Extension ID: "

if "%EXT_ID%"=="" (
    echo Error: Extension ID cannot be empty
    pause
    exit /b 1
)

echo.
echo Extension ID: %EXT_ID%
echo.

REM Create the manifest file path
set MANIFEST_FILE=%SCRIPT_DIR%\com.ultrathink.kbsaver.json

REM Update the manifest file with the extension ID
echo Creating manifest with extension ID...
(
    echo {
    echo   "name": "com.ultrathink.kbsaver",
    echo   "description": "UltraThink Knowledge Base Saver",
    echo   "path": "%SCRIPT_DIR%\\host.bat",
    echo   "type": "stdio",
    echo   "allowed_origins": [
    echo     "chrome-extension://%EXT_ID%/"
    echo   ]
    echo }
) > "%MANIFEST_FILE%"

echo Manifest created: %MANIFEST_FILE%
echo.

REM Register in Windows Registry for Microsoft Edge
echo Registering native host in Windows Registry...
echo.

REG ADD "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ultrathink.kbsaver" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo SUCCESS! Native host installed.
    echo ============================================
    echo.
    echo The extension should now be able to save to kb.md.
    echo.
    echo If you need to uninstall, run uninstall.bat
    echo.
) else (
    echo.
    echo ============================================
    echo ERROR: Failed to register in registry
    echo ============================================
    echo.
    echo Try running this script as Administrator.
    echo.
)

pause
