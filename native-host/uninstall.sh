#!/bin/bash
# Uninstallation script for UltraThink Native Messaging Host (macOS/Linux)

set -e

echo "============================================"
echo "UltraThink Native Host Uninstaller (macOS)"
echo "============================================"
echo ""

# Possible locations for the manifest
POSSIBLE_DIRS=(
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/microsoft-edge/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
)

MANIFEST_NAME="com.ultrathink.kbsaver.json"
REMOVED=0

for DIR in "${POSSIBLE_DIRS[@]}"; do
    MANIFEST_FILE="$DIR/$MANIFEST_NAME"
    if [ -f "$MANIFEST_FILE" ]; then
        echo "Removing: $MANIFEST_FILE"
        rm "$MANIFEST_FILE"
        REMOVED=1
    fi
done

if [ $REMOVED -eq 1 ]; then
    echo ""
    echo "============================================"
    echo "SUCCESS! Native host uninstalled."
    echo "============================================"
else
    echo "No native host manifests found to remove."
fi

echo ""
