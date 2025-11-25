# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for UltraThink Native Messaging Host
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
    [str(native_host_dir / 'host.py')],
    pathex=[str(native_host_dir)],
    binaries=[],
    datas=[],
    hiddenimports=[
        'tkinter',
        'tkinter.filedialog',
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

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ultrathink-host' if not is_windows else 'ultrathink-host.exe',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Native messaging uses stdio, not console
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
