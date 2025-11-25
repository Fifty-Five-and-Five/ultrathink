#!/bin/bash
# Build script for UltraThink on macOS
# Creates standalone executables and .app bundle using PyInstaller

set -e

echo "============================================"
echo "UltraThink macOS Build Script"
echo "============================================"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Create output directory
OUTPUT_DIR="$PROJECT_ROOT/dist/macos"
mkdir -p "$OUTPUT_DIR"

echo "Installing dependencies..."
pip3 install pyinstaller PyQt6 sounddevice scipy numpy mss

echo ""
echo "Building native host..."
cd "$SCRIPT_DIR"
pyinstaller --clean --noconfirm host.spec
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build native host"
    exit 1
fi

echo ""
echo "Building widget..."
pyinstaller --clean --noconfirm widget.spec
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build widget"
    exit 1
fi

echo ""
echo "Copying files to output directory..."

# Copy executables
cp "$SCRIPT_DIR/dist/ultrathink-host" "$OUTPUT_DIR/"
cp -R "$SCRIPT_DIR/dist/UltraThink Widget.app" "$OUTPUT_DIR/"

# Copy extension
cp -R "$PROJECT_ROOT/ultrathink-extension" "$OUTPUT_DIR/extension"

# Create install script for bundled executable
cat > "$OUTPUT_DIR/install-bundled.sh" << 'INSTALL_SCRIPT'
#!/bin/bash
# Installation script for bundled UltraThink

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "============================================"
echo "UltraThink Native Host Installer"
echo "============================================"
echo ""

echo "First, load the extension in Chrome/Edge (developer mode)."
echo "Go to chrome://extensions or edge://extensions and find your Extension ID."
echo ""
read -p "Enter your Extension ID: " EXT_ID

if [ -z "$EXT_ID" ]; then
    echo "Error: Extension ID cannot be empty"
    exit 1
fi

echo ""
echo "Which browser are you using?"
echo "1) Google Chrome"
echo "2) Microsoft Edge"
echo "3) Chromium"
read -p "Enter choice (1-3): " BROWSER_CHOICE

case $BROWSER_CHOICE in
    1) TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
    2) TARGET_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts" ;;
    3) TARGET_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
    *) echo "Invalid choice"; exit 1 ;;
esac

mkdir -p "$TARGET_DIR"

# Create manifest pointing to bundled executable
cat > "$TARGET_DIR/com.ultrathink.kbsaver.json" << EOF
{
  "name": "com.ultrathink.kbsaver",
  "description": "UltraThink Knowledge Base Saver",
  "path": "$SCRIPT_DIR/ultrathink-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

chmod +x "$SCRIPT_DIR/ultrathink-host"

echo ""
echo "============================================"
echo "SUCCESS! Native host installed."
echo "============================================"
INSTALL_SCRIPT

chmod +x "$OUTPUT_DIR/install-bundled.sh"

# Create DMG (optional, requires create-dmg)
if command -v create-dmg &> /dev/null; then
    echo ""
    echo "Creating DMG..."
    create-dmg \
        --volname "UltraThink" \
        --window-pos 200 120 \
        --window-size 600 400 \
        --icon-size 100 \
        --app-drop-link 450 185 \
        "$OUTPUT_DIR/UltraThink-Installer.dmg" \
        "$OUTPUT_DIR/"
fi

echo ""
echo "============================================"
echo "BUILD COMPLETE!"
echo "============================================"
echo ""
echo "Output directory: $OUTPUT_DIR"
echo ""
echo "Contents:"
ls -la "$OUTPUT_DIR"
echo ""
