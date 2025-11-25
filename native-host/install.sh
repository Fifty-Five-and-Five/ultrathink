#!/bin/bash
# Installation script for UltraThink Native Messaging Host (macOS/Linux)
# Run this after installing the extension

set -e

echo "============================================"
echo "UltraThink Native Host Installer (macOS)"
echo "============================================"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Script directory: $SCRIPT_DIR"
echo ""

# Prompt for extension ID
echo "First, load the extension in Chrome/Edge (developer mode)."
echo "Go to chrome://extensions or edge://extensions and find your Extension ID."
echo ""
read -p "Enter your Extension ID: " EXT_ID

if [ -z "$EXT_ID" ]; then
    echo "Error: Extension ID cannot be empty"
    exit 1
fi

echo ""
echo "Extension ID: $EXT_ID"
echo ""

# Determine target directory based on browser
echo "Which browser are you using?"
echo "1) Google Chrome"
echo "2) Microsoft Edge"
echo "3) Chromium"
read -p "Enter choice (1-3): " BROWSER_CHOICE

case $BROWSER_CHOICE in
    1)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        else
            TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
        fi
        ;;
    2)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            TARGET_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
        else
            TARGET_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"
        fi
        ;;
    3)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            TARGET_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
        else
            TARGET_DIR="$HOME/.config/chromium/NativeMessagingHosts"
        fi
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "Installing to: $TARGET_DIR"
echo ""

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Create the manifest file
MANIFEST_FILE="$TARGET_DIR/com.ultrathink.kbsaver.json"

cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.ultrathink.kbsaver",
  "description": "UltraThink Knowledge Base Saver",
  "path": "$SCRIPT_DIR/host.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "Manifest created: $MANIFEST_FILE"
echo ""

# Make host.sh executable
chmod +x "$SCRIPT_DIR/host.sh"
chmod +x "$SCRIPT_DIR/host.py"

echo "============================================"
echo "SUCCESS! Native host installed."
echo "============================================"
echo ""
echo "The extension should now be able to save to kb.md."
echo ""
echo "If you need to uninstall, run uninstall.sh"
echo ""
