# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for UltraThink Desktop Widget
Builds a standalone executable for Windows and macOS
"""

import sys
import os
from pathlib import Path

# Determine platform
is_windows = sys.platform == 'win32'
is_macos = sys.platform == 'darwin'

# Paths
project_root = Path(__file__).parent.parent
native_host_dir = project_root / 'native-host'

block_cipher = None

# Analysis
a = Analysis(
    [str(native_host_dir / 'widget.pyw')],
    pathex=[str(native_host_dir)],
    binaries=[],
    datas=[
        # Include host.py for the widget to import
        (str(native_host_dir / 'host.py'), '.'),
    ],
    hiddenimports=[
        'PyQt6',
        'PyQt6.QtCore',
        'PyQt6.QtGui',
        'PyQt6.QtWidgets',
        'PyQt6.QtSvg',
        'sounddevice',
        'scipy',
        'scipy.io',
        'scipy.io.wavfile',
        'numpy',
        'mss',
        'mss.tools',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if is_macos:
    # macOS: Create .app bundle
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name='UltraThink Widget',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    )

    app = BUNDLE(
        exe,
        name='UltraThink Widget.app',
        icon=str(project_root / 'ultrathink-extension' / 'icons' / 'icon128.png'),
        bundle_identifier='com.ultrathink.widget',
        info_plist={
            'NSHighResolutionCapable': 'True',
            'LSUIElement': 'False',
            'CFBundleShortVersionString': '1.5.1',
        },
    )
else:
    # Windows: Create single .exe
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name='UltraThink Widget',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,  # No console window
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=str(project_root / 'ultrathink-extension' / 'icons' / 'icon128.png'),
    )
