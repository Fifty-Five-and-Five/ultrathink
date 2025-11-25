#!/bin/bash
# Native messaging host launcher for macOS/Linux
# This script is called by the browser's native messaging system

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Try python3 first, then python
if command -v python3 &> /dev/null; then
    exec python3 "$SCRIPT_DIR/host.py"
elif command -v python &> /dev/null; then
    exec python "$SCRIPT_DIR/host.py"
else
    echo '{"success": false, "error": "Python not found"}' >&2
    exit 1
fi
