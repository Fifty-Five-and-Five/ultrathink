@echo off
REM Build script for UltraThink on Windows
REM Creates standalone executables using PyInstaller

echo ============================================
echo UltraThink Windows Build Script
echo ============================================
echo.

REM Get script directory
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

REM Create output directory
set OUTPUT_DIR=%PROJECT_ROOT%\dist\windows
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo Installing dependencies...
pip install pyinstaller PyQt6 sounddevice scipy numpy mss pyaudiowpatch

echo.
echo Building native host...
cd "%SCRIPT_DIR%"
pyinstaller --clean --noconfirm host.spec
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build native host
    pause
    exit /b 1
)

echo.
echo Building widget...
pyinstaller --clean --noconfirm widget.spec
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build widget
    pause
    exit /b 1
)

echo.
echo Copying files to output directory...

REM Copy executables
copy "%SCRIPT_DIR%dist\ultrathink-host.exe" "%OUTPUT_DIR%\"
copy "%SCRIPT_DIR%dist\UltraThink Widget.exe" "%OUTPUT_DIR%\"

REM Copy extension
xcopy /E /I /Y "%PROJECT_ROOT%\ultrathink-extension" "%OUTPUT_DIR%\extension"

REM Copy installer scripts
copy "%PROJECT_ROOT%\native-host\install.bat" "%OUTPUT_DIR%\"
copy "%PROJECT_ROOT%\native-host\uninstall.bat" "%OUTPUT_DIR%\"

REM Create install script for bundled executable
(
    echo @echo off
    echo REM Installation script for bundled UltraThink
    echo.
    echo set SCRIPT_DIR=%%~dp0
    echo.
    echo echo First, load the extension in Edge/Chrome (developer mode^).
    echo echo Go to edge://extensions and find your Extension ID.
    echo echo.
    echo set /p EXT_ID="Enter your Extension ID: "
    echo.
    echo REM Create manifest pointing to bundled executable
    echo set MANIFEST_FILE=%%SCRIPT_DIR%%com.ultrathink.kbsaver.json
    echo (
    echo     echo {
    echo     echo   "name": "com.ultrathink.kbsaver",
    echo     echo   "description": "UltraThink Knowledge Base Saver",
    echo     echo   "path": "%%SCRIPT_DIR%%ultrathink-host.exe",
    echo     echo   "type": "stdio",
    echo     echo   "allowed_origins": [
    echo     echo     "chrome-extension://%%EXT_ID%%/"
    echo     echo   ]
    echo     echo }
    echo ^) ^> "%%MANIFEST_FILE%%"
    echo.
    echo REG ADD "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ultrathink.kbsaver" /ve /t REG_SZ /d "%%MANIFEST_FILE%%" /f
    echo.
    echo echo SUCCESS! Native host installed.
    echo pause
) > "%OUTPUT_DIR%\install-bundled.bat"

echo.
echo ============================================
echo BUILD COMPLETE!
echo ============================================
echo.
echo Output directory: %OUTPUT_DIR%
echo.
echo Contents:
dir /b "%OUTPUT_DIR%"
echo.
pause
