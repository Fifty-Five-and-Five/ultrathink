@echo off
REM Uninstallation script for UltraThink Native Messaging Host

echo ============================================
echo UltraThink Native Host Uninstaller
echo ============================================
echo.

REM Remove registry key
echo Removing registry entry...
REG DELETE "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ultrathink.kbsaver" /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo SUCCESS! Native host uninstalled.
    echo ============================================
    echo.
    echo The extension will no longer be able to save files.
    echo You can safely delete the native-host folder.
    echo.
) else (
    echo.
    echo ============================================
    echo ERROR: Failed to remove registry entry
    echo ============================================
    echo.
    echo The entry may not exist or you may need Administrator rights.
    echo.
)

pause
