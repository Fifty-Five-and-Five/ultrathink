# UltraThink Cross-Platform Packaging

This directory contains build scripts and configuration for packaging UltraThink as standalone applications for Windows and macOS.

## Quick Start

### For Users (Pre-built Releases)

Download the latest release for your platform from the Releases page.

#### Windows
1. Extract the zip file
2. Load the extension folder in Edge/Chrome (developer mode)
3. Run `install-bundled.bat` and enter your extension ID
4. Double-click `UltraThink Widget.exe` to start the widget

#### macOS
1. Open the DMG and drag UltraThink Widget to Applications
2. Load the extension folder in Chrome/Edge (developer mode)
3. Run `./install-bundled.sh` and enter your extension ID
4. Open UltraThink Widget from Applications

---

## For Developers (Building from Source)

### Prerequisites

- Python 3.9 or higher
- pip (Python package manager)

### Install Dependencies

```bash
# Core dependencies
pip install PyQt6 pyinstaller

# Full widget features (audio recording, screenshots)
pip install sounddevice scipy numpy mss

# Windows only - system audio capture
pip install pyaudiowpatch
```

Or use the pyproject.toml:

```bash
pip install -e ".[full,dev]"
```

### Building

#### Windows

```batch
cd packaging
build-windows.bat
```

Output will be in `dist/windows/`:
- `ultrathink-host.exe` - Native messaging host
- `UltraThink Widget.exe` - Desktop widget
- `extension/` - Browser extension files
- `install-bundled.bat` - Installation script

#### macOS

```bash
cd packaging
chmod +x build-macos.sh
./build-macos.sh
```

Output will be in `dist/macos/`:
- `ultrathink-host` - Native messaging host executable
- `UltraThink Widget.app` - Desktop widget app bundle
- `extension/` - Browser extension files
- `install-bundled.sh` - Installation script
- `UltraThink-Installer.dmg` - (if create-dmg is installed)

---

## Manual Installation (Without PyInstaller)

If you prefer to run from source with Python installed:

### Windows

1. Install Python 3.9+ and add to PATH
2. Install dependencies: `pip install PyQt6 sounddevice scipy numpy mss pyaudiowpatch`
3. Load extension in Edge/Chrome developer mode
4. Run `native-host/install.bat`
5. Run widget: `pythonw native-host/widget.pyw`

### macOS

1. Install Python 3.9+ (via Homebrew: `brew install python`)
2. Install dependencies: `pip3 install PyQt6 sounddevice scipy numpy mss`
3. Load extension in Chrome/Edge developer mode
4. Run `chmod +x native-host/install.sh && ./native-host/install.sh`
5. Run widget: `python3 native-host/widget.pyw`

---

## File Structure

```
packaging/
├── README.md           # This file
├── build-windows.bat   # Windows build script
├── build-macos.sh      # macOS build script
├── host.spec           # PyInstaller spec for native host
└── widget.spec         # PyInstaller spec for desktop widget
```

## Troubleshooting

### Native Host Not Working

1. Check that the extension ID is correct
2. Verify the manifest path in the registry (Windows) or Native Messaging Hosts directory (macOS)
3. Check `native-host/host.log` for error messages

### Widget Won't Start

1. Ensure PyQt6 is installed
2. On macOS, you may need to grant accessibility permissions
3. Check console/terminal for error messages

### Audio Recording Not Working

1. Ensure sounddevice is installed
2. On Windows, pyaudiowpatch is required for system audio
3. Check microphone permissions in system settings
