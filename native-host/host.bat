@echo off
REM Wrapper script to launch Python native messaging host
REM This ensures Python runs correctly on Windows

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0

REM Launch Python script (assumes python3 is in PATH)
python "%SCRIPT_DIR%host.py"
