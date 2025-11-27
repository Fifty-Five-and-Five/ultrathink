"""
UltraThink Desktop Widget - Always on top drop target
Requires: pip install PyQt6 sounddevice scipy numpy
Run: pythonw widget.pyw (or double-click)
"""

import sys
import os
import base64
from pathlib import Path
from datetime import datetime
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QTextEdit, QFrame, QSizeGrip, QCheckBox
)
from PyQt6.QtCore import Qt, QTimer, QSize, QEvent, QRect, pyqtSignal
from PyQt6.QtGui import QCursor, QGuiApplication, QPixmap, QPainter, QColor, QPen, QShortcut, QKeySequence, QTextCursor, QIcon, QFont, QTextCharFormat

# Audio recording
try:
    import sounddevice as sd
    import numpy as np
    from scipy.io.wavfile import write as write_wav
    AUDIO_AVAILABLE = True
except ImportError:
    AUDIO_AVAILABLE = False

# System audio (WASAPI loopback) - requires pyaudiowpatch
try:
    import pyaudiowpatch as pyaudio
    WASAPI_AVAILABLE = True
except ImportError:
    WASAPI_AVAILABLE = False

# Screen capture - requires mss
try:
    import mss
    MSS_AVAILABLE = True
except ImportError:
    MSS_AVAILABLE = False

# SVG icons support
try:
    from PyQt6.QtSvg import QSvgRenderer
    SVG_AVAILABLE = True
except ImportError:
    SVG_AVAILABLE = False

import shutil

# Import save functions from host.py
sys.path.insert(0, str(Path(__file__).parent))
from host import append_to_kb, update_entry_notes, background_process_entry
import json
import threading


def load_settings():
    """Load settings from settings.json"""
    settings_file = Path(__file__).parent / 'settings.json'
    try:
        if settings_file.exists():
            with open(settings_file, 'r') as f:
                return json.load(f)
    except Exception:
        pass
    return {}


# Load settings
SETTINGS = load_settings()
API_KEY = SETTINGS.get('openai_api_key', '')

# Config
PROJECT_FOLDER = r'C:\Users\ChrisWright\OneDrive - Fifty Five and Five\dev\ultrathink'
BORDER_COLOR = "#ff5200"
BORDER_WIDTH = 2

# Phosphor Icons SVG paths (regular weight, 256x256 viewBox)
ICON_MICROPHONE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.6V240a8,8,0,0,1-16,0V207.6A80.11,80.11,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.11,80.11,0,0,1,136,207.6Z"/></svg>'
ICON_SPEAKER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M163.51,24.81a8,8,0,0,0-8.42.88L85.25,80H40A16,16,0,0,0,24,96v64a16,16,0,0,0,16,16H85.25l69.84,54.31A8,8,0,0,0,168,224V32A8,8,0,0,0,163.51,24.81ZM152,207.64,92.91,161.69A7.94,7.94,0,0,0,88,160H40V96H88a7.94,7.94,0,0,0,4.91-1.69L152,48.36ZM208,104v48a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg>'
ICON_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z"/></svg>'
ICON_STOP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,160H56V56H200V200Z"/></svg>'
# Waveform animation frames (3 frames for animation)
ICON_WAVEFORM_1 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><rect x="52" y="96" width="24" height="64" rx="4"/><rect x="92" y="72" width="24" height="112" rx="4"/><rect x="132" y="56" width="24" height="144" rx="4"/><rect x="172" y="80" width="24" height="96" rx="4"/></svg>'
ICON_WAVEFORM_2 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><rect x="52" y="72" width="24" height="112" rx="4"/><rect x="92" y="96" width="24" height="64" rx="4"/><rect x="132" y="80" width="24" height="96" rx="4"/><rect x="172" y="56" width="24" height="144" rx="4"/></svg>'
ICON_WAVEFORM_3 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><rect x="52" y="80" width="24" height="96" rx="4"/><rect x="92" y="56" width="24" height="144" rx="4"/><rect x="132" y="96" width="24" height="64" rx="4"/><rect x="172" y="72" width="24" height="112" rx="4"/></svg>'
ICON_NOTEPAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M168,128a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,128Zm-8,24H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16ZM216,40V200a32,32,0,0,1-32,32H72a32,32,0,0,1-32-32V40a8,8,0,0,1,8-8H72V24a8,8,0,0,1,16,0v8h32V24a8,8,0,0,1,16,0v8h32V24a8,8,0,0,1,16,0v8h24A8,8,0,0,1,216,40Zm-16,8H184v8a8,8,0,0,1-16,0V48H136v8a8,8,0,0,1-16,0V48H88v8a8,8,0,0,1-16,0V48H56V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16Z"/></svg>'

# Formatting toolbar icons (Phosphor Icons - regular weight)
ICON_BOLD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M170.48,115.7A44,44,0,0,0,140,40H72a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8h80a48,48,0,0,0,18.48-92.3ZM80,56h60a28,28,0,0,1,0,56H80Zm72,136H80V128h72a32,32,0,0,1,0,64Z"/></svg>'
ICON_ITALIC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M200,56a8,8,0,0,1-8,8H157.77L115.1,192H144a8,8,0,0,1,0,16H64a8,8,0,0,1,0-16H98.23L140.9,64H112a8,8,0,0,1,0-16h80A8,8,0,0,1,200,56Z"/></svg>'
ICON_CODE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z"/></svg>'
ICON_LINK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M240,88.23a54.43,54.43,0,0,1-16,37L189.25,160a54.27,54.27,0,0,1-38.63,16h-.05A54.63,54.63,0,0,1,96,119.84a8,8,0,0,1,16,.45A38.62,38.62,0,0,0,150.58,160h0a38.39,38.39,0,0,0,27.31-11.31l34.75-34.75a38.63,38.63,0,0,0-54.63-54.63l-11,11A8,8,0,0,1,135.7,59l11-11A54.65,54.65,0,0,1,224,48,54.86,54.86,0,0,1,240,88.23ZM109,185.66l-11,11A38.41,38.41,0,0,1,70.6,208h0a38.63,38.63,0,0,1-27.29-65.94L78,107.31A38.63,38.63,0,0,1,144,135.71a8,8,0,0,0,16,.45A54.86,54.86,0,0,0,144,96a54.65,54.65,0,0,0-77.27,0L32,130.75A54.62,54.62,0,0,0,70.56,224h0a54.28,54.28,0,0,0,38.64-16l11-11A8,8,0,0,0,109,185.66Z"/></svg>'
ICON_HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M208,56V200a8,8,0,0,1-16,0V136H64v64a8,8,0,0,1-16,0V56a8,8,0,0,1,16,0v64H192V56a8,8,0,0,1,16,0Z"/></svg>'
ICON_QUOTE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M100,56H40A16,16,0,0,0,24,72v64a16,16,0,0,0,16,16h60v8a32,32,0,0,1-32,32,8,8,0,0,0,0,16,48.05,48.05,0,0,0,48-48V72A16,16,0,0,0,100,56Zm0,80H40V72h60ZM216,56H156a16,16,0,0,0-16,16v64a16,16,0,0,0,16,16h60v8a32,32,0,0,1-32,32,8,8,0,0,0,0,16,48.05,48.05,0,0,0,48-48V72A16,16,0,0,0,216,56Zm0,80H156V72h60Z"/></svg>'
ICON_LIST = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z"/></svg>'
ICON_SAVE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M219.31,80,176,36.69A15.86,15.86,0,0,0,164.69,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V91.31A15.86,15.86,0,0,0,219.31,80ZM168,208H88V152h80Zm40,0H184V152a16,16,0,0,0-16-16H88a16,16,0,0,0-16,16v56H48V48H164.69L208,91.31ZM160,72a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h56A8,8,0,0,1,160,72Z"/></svg>'
ICON_SPINNER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M136,32V64a8,8,0,0,1-16,0V32a8,8,0,0,1,16,0Zm37.25,58.75a8,8,0,0,0,5.66-2.35l22.63-22.62a8,8,0,0,0-11.32-11.32L167.6,77.09a8,8,0,0,0,5.65,13.66ZM224,120H192a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16Zm-45.09,47.6a8,8,0,0,0-11.31,11.31l22.62,22.63a8,8,0,0,0,11.32-11.32ZM128,184a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V192A8,8,0,0,0,128,184ZM77.09,167.6,54.46,190.22a8,8,0,0,0,11.32,11.32L88.4,178.91A8,8,0,0,0,77.09,167.6ZM72,128a8,8,0,0,0-8-8H32a8,8,0,0,0,0,16H64A8,8,0,0,0,72,128ZM65.78,54.46A8,8,0,0,0,54.46,65.78L77.09,88.4A8,8,0,0,0,88.4,77.09Z"/></svg>'
ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/></svg>'
ICON_MINUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z"/></svg>'
ICON_MONITOR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="{color}"><path d="M208,40H48A24,24,0,0,0,24,64V176a24,24,0,0,0,24,24H96v16H72a8,8,0,0,0,0,16h112a8,8,0,0,0,0-16H160V200h48a24,24,0,0,0,24-24V64A24,24,0,0,0,208,40ZM48,56H208a8,8,0,0,1,8,8V160H40V64A8,8,0,0,1,48,56ZM208,184H48a8,8,0,0,1-8-8v-0H216v0A8,8,0,0,1,208,184Zm-64,16v16H112V200Z"/></svg>'


def create_icon_from_svg(svg_data, size=16, color="#666"):
    """Create QIcon from SVG data string."""
    from PyQt6.QtGui import QIcon
    svg_colored = svg_data.format(color=color)

    if SVG_AVAILABLE:
        from PyQt6.QtCore import QByteArray
        renderer = QSvgRenderer(QByteArray(svg_colored.encode()))
        pixmap = QPixmap(size, size)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        renderer.render(painter)
        painter.end()
        return QIcon(pixmap)
    else:
        # Fallback - return empty icon (button will use text)
        return QIcon()


def detect_file_type(filename):
    """Detect type from filename extension."""
    if not filename:
        return 'file'

    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''

    # Markdown
    if ext == 'md':
        return 'markdown'

    # PDF
    if ext == 'pdf':
        return 'pdf'

    # MS Office
    if ext in ('doc', 'docx', 'rtf'):
        return 'ms-word'
    if ext in ('ppt', 'pptx'):
        return 'ms-powerpoint'
    if ext in ('xls', 'xlsx', 'csv'):
        return 'ms-excel'
    if ext in ('one', 'onetoc2'):
        return 'ms-onenote'

    # Audio
    if ext in ('mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'aiff'):
        return 'audio'

    # Video
    if ext in ('mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'):
        return 'video'

    # Image (dragged files)
    if ext in ('jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'):
        return 'image'

    return 'file'


def html_to_markdown(html):
    """Convert QTextEdit HTML to markdown format."""
    import re

    # Extract body content
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if body_match:
        html = body_match.group(1)

    # Replace common HTML tags with markdown
    # Bold: <span style="font-weight:700;"> or <b>
    html = re.sub(r'<span[^>]*font-weight:\s*(?:700|bold)[^>]*>(.*?)</span>', r'**\1**', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<b>(.*?)</b>', r'**\1**', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<strong>(.*?)</strong>', r'**\1**', html, flags=re.DOTALL | re.IGNORECASE)

    # Italic: <span style="font-style:italic;"> or <i>
    html = re.sub(r'<span[^>]*font-style:\s*italic[^>]*>(.*?)</span>', r'*\1*', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<i>(.*?)</i>', r'*\1*', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<em>(.*?)</em>', r'*\1*', html, flags=re.DOTALL | re.IGNORECASE)

    # Code: <span style="font-family:'Courier New'"> or <code>
    html = re.sub(r'<span[^>]*font-family:[^>]*(?:Courier|monospace)[^>]*>(.*?)</span>', r'`\1`', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<code>(.*?)</code>', r'`\1`', html, flags=re.DOTALL | re.IGNORECASE)

    # Links: <a href="...">text</a>
    html = re.sub(r'<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', r'[\2](\1)', html, flags=re.DOTALL | re.IGNORECASE)

    # Line breaks
    html = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    html = re.sub(r'</p>\s*<p[^>]*>', '\n\n', html, flags=re.IGNORECASE)
    html = re.sub(r'<p[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</p>', '', html, flags=re.IGNORECASE)

    # Remove remaining HTML tags
    html = re.sub(r'<[^>]+>', '', html)

    # Decode HTML entities
    html = html.replace('&nbsp;', ' ')
    html = html.replace('&lt;', '<')
    html = html.replace('&gt;', '>')
    html = html.replace('&amp;', '&')
    html = html.replace('&quot;', '"')

    # Clean up extra whitespace
    html = re.sub(r'\n\s*\n\s*\n', '\n\n', html)

    return html.strip()


class SelectionOverlay(QWidget):
    """
    Full-screen overlay for selecting screenshot/video area.
    - Click = full screen
    - Drag = select area
    - ESC = cancel
    - Auto-capture after 2s (like selection-overlay.js)
    """
    area_selected = pyqtSignal(object)  # QRect or None (fullscreen)
    cancelled = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.start_pos = None
        self.current_pos = None
        self.is_selecting = False

        # Fullscreen, frameless, on top
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setCursor(Qt.CursorShape.CrossCursor)

        # Cover all screens
        geo = self._get_virtual_geometry()
        self.setGeometry(geo)

        # Auto-capture after 2s (matches selection-overlay.js)
        self.auto_timer = QTimer()
        self.auto_timer.setSingleShot(True)
        self.auto_timer.timeout.connect(lambda: self._finish(None))
        self.auto_timer.start(2000)

    def _get_virtual_geometry(self):
        screens = QGuiApplication.screens()
        if not screens:
            return QRect(0, 0, 1920, 1080)
        min_x = min(s.geometry().x() for s in screens)
        min_y = min(s.geometry().y() for s in screens)
        max_x = max(s.geometry().x() + s.geometry().width() for s in screens)
        max_y = max(s.geometry().y() + s.geometry().height() for s in screens)
        return QRect(min_x, min_y, max_x - min_x, max_y - min_y)

    def paintEvent(self, event):
        painter = QPainter(self)
        # Semi-transparent overlay: rgba(0,0,0,0.3)
        painter.fillRect(self.rect(), QColor(0, 0, 0, 77))

        if self.start_pos and self.current_pos:
            rect = QRect(self.start_pos, self.current_pos).normalized()
            # Clear selection area
            painter.setCompositionMode(QPainter.CompositionMode.CompositionMode_Clear)
            painter.fillRect(rect, Qt.GlobalColor.transparent)
            # Draw border: #4266cc
            painter.setCompositionMode(QPainter.CompositionMode.CompositionMode_SourceOver)
            painter.setPen(QPen(QColor("#4266cc"), 2))
            painter.drawRect(rect)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.auto_timer.stop()
            self.is_selecting = True
            self.start_pos = event.pos()
            self.current_pos = event.pos()
            self.update()

    def mouseMoveEvent(self, event):
        if self.is_selecting:
            self.current_pos = event.pos()
            self.update()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.is_selecting:
            rect = QRect(self.start_pos, self.current_pos).normalized()
            # Small selection = fullscreen
            if rect.width() < 10 or rect.height() < 10:
                self._finish(None)
            else:
                # Convert widget-local coords to screen coords for mss
                # mapToGlobal returns logical coords, but mss needs physical pixels
                top_left = self.mapToGlobal(rect.topLeft())

                # Get DPR for the screen where selection was made
                screen = QGuiApplication.screenAt(top_left)
                if screen:
                    dpr = screen.devicePixelRatio()
                else:
                    dpr = QGuiApplication.primaryScreen().devicePixelRatio()

                # Scale to physical pixels for mss
                screen_rect = QRect(
                    int(top_left.x() * dpr),
                    int(top_left.y() * dpr),
                    int(rect.width() * dpr),
                    int(rect.height() * dpr)
                )
                self._finish(screen_rect)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.auto_timer.stop()
            self.close()
            self.cancelled.emit()

    def _finish(self, rect):
        self.close()
        self.area_selected.emit(rect)


class UltraThinkWidget(QWidget):
    def __init__(self):
        super().__init__()
        self.pending_files = []
        self.countdown = 3
        self.timer = QTimer()
        self.timer.timeout.connect(self.tick)

        # For resizing
        self._resize_edge = None
        self._drag_pos = None
        self._resize_margin = 12  # Larger grab zone for easier resizing

        # Audio recording state
        self.recording_type = None  # 'mic' or 'system'
        self.audio_stream = None
        self.waveform_frame = 0  # For waveform animation

        # Expanded notes mode
        self.expanded_mode = False
        self.default_size = (280, 320)
        self.expanded_size = (560, 640)
        self.audio_data = []

        # Auto-save timer for expanded mode (every 10s)
        self.autosave_timer = QTimer()
        self.autosave_timer.timeout.connect(self._autosave_expanded)

        # Track current long note timestamp (for updating same entry)
        self.current_note_timestamp = None

        # Multi-tab support for expanded mode
        # Each tab: {'text': str, 'timestamp': str or None}
        self.note_tabs = [{'html': '', 'timestamp': None}]
        self.current_tab_index = 0

        # Multi-monitor mode
        self.multi_monitor_enabled = False
        self.mirror_widgets = []  # List of mirror widgets on other screens

        self.init_ui()

    def init_ui(self):
        # Frameless, always on top, but show in taskbar (Window flag required)
        self.setWindowFlags(
            Qt.WindowType.Window |
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMouseTracking(True)

        # Set window title for taskbar
        self.setWindowTitle("UltraThink")

        self.setMinimumSize(200, 200)
        self.resize(280, 320)

        # Move to right side of screen
        screen = QApplication.primaryScreen().geometry()
        self.move(screen.width() - 300, 100)

        # Main container with rounded corners
        self.container = QFrame(self)
        self.container.setStyleSheet(f"""
            QFrame#container {{
                background: white;
                border: {BORDER_WIDTH}px solid {BORDER_COLOR};
                border-radius: 8px;
            }}
        """)
        self.container.setObjectName("container")

        layout = QVBoxLayout(self.container)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(8)

        # Header
        header = QHBoxLayout()
        title = QLabel("Ultrathink")
        title.setStyleSheet("font-size: 14px; font-weight: 600; color: #333;")
        header.addWidget(title)
        header.addStretch()

        # Multi-monitor toggle button
        self.monitor_btn = QPushButton()
        self.monitor_btn.setFixedSize(24, 24)
        self.monitor_btn.setCursor(Qt.CursorShape.ArrowCursor)
        self.monitor_btn.setIcon(create_icon_from_svg(ICON_MONITOR, 16, "#666"))
        self.monitor_btn.setIconSize(QSize(16, 16))
        self.monitor_btn.setToolTip("Show on all monitors")
        self._update_monitor_btn_style()
        self.monitor_btn.clicked.connect(self.toggle_multi_monitor)
        header.addWidget(self.monitor_btn)

        close_btn = QPushButton("×")
        close_btn.setFixedSize(24, 24)
        close_btn.setCursor(Qt.CursorShape.ArrowCursor)
        close_btn.setStyleSheet("""
            QPushButton {
                border: none;
                font-size: 18px;
                color: #666;
                border-radius: 4px;
            }
            QPushButton:hover {
                background: #f5f5f5;
                color: #333;
            }
        """)
        close_btn.clicked.connect(self.close)
        header.addWidget(close_btn)
        layout.addLayout(header)

        # Drop zone - top half
        self.drop_zone = QFrame()
        self.drop_zone.setAcceptDrops(True)
        self.drop_zone.setStyleSheet(f"""
            QFrame {{
                border: {BORDER_WIDTH}px dashed #ccc;
                border-radius: 4px;
                background: white;
            }}
        """)

        drop_layout = QVBoxLayout(self.drop_zone)
        self.drop_label = QLabel("Drop files here")
        self.drop_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.drop_label.setStyleSheet("color: #666; font-size: 13px; border: none;")
        drop_layout.addWidget(self.drop_label)

        layout.addWidget(self.drop_zone, 1)  # stretch factor 1

        # File list (hidden when empty)
        self.file_label = QLabel("")
        self.file_label.setStyleSheet("font-size: 12px; color: #666;")
        self.file_label.setWordWrap(True)
        self.file_label.hide()
        layout.addWidget(self.file_label)

        # Timer (hidden when empty)
        self.timer_label = QLabel("")
        self.timer_label.setStyleSheet("font-size: 12px; color: #666;")
        self.timer_label.hide()
        layout.addWidget(self.timer_label)

        # Formatting toolbar (only visible in expanded mode)
        self.toolbar_widget = QWidget()
        toolbar_layout = QHBoxLayout(self.toolbar_widget)
        toolbar_layout.setContentsMargins(0, 0, 0, 0)
        toolbar_layout.setSpacing(2)

        # Helper to create small toolbar buttons
        def create_toolbar_btn(icon_svg, tooltip):
            btn = QPushButton()
            btn.setIcon(create_icon_from_svg(icon_svg, 14, "#666"))
            btn.setIconSize(QSize(14, 14))
            btn.setToolTip(tooltip)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setFixedSize(28, 28)
            btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    background: white;
                }
                QPushButton:hover {
                    background: #f0f0f0;
                    border-color: #ccc;
                }
            """)
            return btn

        # Add tab button (left of formatting buttons)
        self.add_tab_btn = create_toolbar_btn(ICON_PLUS, "Add new note tab")
        self.add_tab_btn.clicked.connect(self.add_note_tab)
        toolbar_layout.addWidget(self.add_tab_btn)

        # Close tab button (next to plus)
        self.close_tab_btn = create_toolbar_btn(ICON_MINUS, "Close current tab")
        self.close_tab_btn.clicked.connect(self.close_current_tab)
        self.close_tab_btn.setEnabled(False)  # Disabled when only 1 tab
        toolbar_layout.addWidget(self.close_tab_btn)

        # Small separator after tab buttons
        separator = QFrame()
        separator.setFixedWidth(8)
        toolbar_layout.addWidget(separator)

        # Create formatting buttons
        self.bold_btn = create_toolbar_btn(ICON_BOLD, "Bold (Ctrl+B)")
        self.bold_btn.clicked.connect(self.apply_bold_format)
        toolbar_layout.addWidget(self.bold_btn)

        self.italic_btn = create_toolbar_btn(ICON_ITALIC, "Italic (Ctrl+I)")
        self.italic_btn.clicked.connect(self.apply_italic_format)
        toolbar_layout.addWidget(self.italic_btn)

        self.code_btn = create_toolbar_btn(ICON_CODE, "Code (Ctrl+`)")
        self.code_btn.clicked.connect(self.apply_code_format)
        toolbar_layout.addWidget(self.code_btn)

        self.link_btn = create_toolbar_btn(ICON_LINK, "Link (Ctrl+K)")
        self.link_btn.clicked.connect(self.apply_link_format)
        toolbar_layout.addWidget(self.link_btn)

        self.header_btn = create_toolbar_btn(ICON_HEADER, "Header (Ctrl+H)")
        self.header_btn.clicked.connect(lambda: self.apply_line_prefix("## "))
        toolbar_layout.addWidget(self.header_btn)

        self.quote_btn = create_toolbar_btn(ICON_QUOTE, "Quote (Ctrl+Q)")
        self.quote_btn.clicked.connect(lambda: self.apply_line_prefix("> "))
        toolbar_layout.addWidget(self.quote_btn)

        self.list_btn = create_toolbar_btn(ICON_LIST, "Bullet (Ctrl+L)")
        self.list_btn.clicked.connect(lambda: self.apply_line_prefix("- "))
        toolbar_layout.addWidget(self.list_btn)

        toolbar_layout.addStretch()

        # Save button (manual save in expanded mode)
        self.save_btn = create_toolbar_btn(ICON_SAVE, "Save (Ctrl+S)")
        self.save_btn.clicked.connect(self.manual_save)
        toolbar_layout.addWidget(self.save_btn)

        self.toolbar_widget.hide()  # Hidden by default
        layout.addWidget(self.toolbar_widget)

        # Container for tab bar + notes (no spacing between them)
        self.notes_container = QWidget()
        notes_container_layout = QVBoxLayout(self.notes_container)
        notes_container_layout.setContentsMargins(0, 0, 0, 0)
        notes_container_layout.setSpacing(0)  # No gap between tab bar and notes

        # Tab bar (only visible in expanded mode with multiple tabs)
        self.tab_bar_widget = QWidget()
        self.tab_bar_layout = QHBoxLayout(self.tab_bar_widget)
        self.tab_bar_layout.setContentsMargins(0, 0, 0, 0)
        self.tab_bar_layout.setSpacing(0)  # No spacing - tabs touch each other
        self.tab_bar_layout.addStretch()  # Push tabs to the left
        self.tab_buttons = []
        self.tab_bar_widget.hide()  # Hidden by default
        notes_container_layout.addWidget(self.tab_bar_widget)

        # Notes - bottom half (always visible by default)
        self.notes = QTextEdit()
        self.notes.setPlaceholderText("Add notes...")
        self.notes.setStyleSheet("""
            QTextEdit {
                border: 1px solid #ddd;
                border-radius: 4px;
                border-top-left-radius: 0px;
                padding: 6px;
                font-size: 13px;
            }
        """)
        self.notes.textChanged.connect(self.on_notes_changed)
        notes_container_layout.addWidget(self.notes, 1)

        layout.addWidget(self.notes_container, 1)  # stretch factor 1 - equal to drop zone

        # Keyboard shortcuts for formatting (work when notes has focus)
        QShortcut(QKeySequence("Ctrl+B"), self.notes, self.apply_bold_format)
        QShortcut(QKeySequence("Ctrl+I"), self.notes, self.apply_italic_format)
        QShortcut(QKeySequence("Ctrl+`"), self.notes, self.apply_code_format)
        QShortcut(QKeySequence("Ctrl+K"), self.notes, self.apply_link_format)
        QShortcut(QKeySequence("Ctrl+H"), self.notes, lambda: self.apply_line_prefix("## "))
        QShortcut(QKeySequence("Ctrl+Q"), self.notes, lambda: self.apply_line_prefix("> "))
        QShortcut(QKeySequence("Ctrl+L"), self.notes, lambda: self.apply_line_prefix("- "))
        QShortcut(QKeySequence("Ctrl+S"), self.notes, self.manual_save)

        # Recording/capture buttons
        if AUDIO_AVAILABLE:
            audio_row = QHBoxLayout()
            audio_row.setSpacing(8)

            # Mic button with Phosphor icon
            self.mic_btn = QPushButton()
            self.mic_btn.setIcon(create_icon_from_svg(ICON_MICROPHONE, 16, "#666"))
            self.mic_btn.setIconSize(QSize(16, 16))
            self.mic_btn.setToolTip("Record microphone")
            self.mic_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            self.mic_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: white;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.mic_btn.clicked.connect(self.toggle_mic_recording)
            audio_row.addWidget(self.mic_btn)

            # System audio button with Phosphor icon
            self.system_btn = QPushButton()
            self.system_btn.setIcon(create_icon_from_svg(ICON_SPEAKER, 16, "#666"))
            self.system_btn.setIconSize(QSize(16, 16))
            self.system_btn.setToolTip("Record system audio")
            self.system_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            self.system_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: white;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.system_btn.clicked.connect(self.toggle_system_recording)
            audio_row.addWidget(self.system_btn)

            # Screenshot button with Phosphor icon
            self.screenshot_btn = QPushButton()
            self.screenshot_btn.setIcon(create_icon_from_svg(ICON_IMAGE, 16, "#666"))
            self.screenshot_btn.setIconSize(QSize(16, 16))
            self.screenshot_btn.setToolTip("Screenshot")
            self.screenshot_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            self.screenshot_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: white;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.screenshot_btn.clicked.connect(self.start_screenshot)
            audio_row.addWidget(self.screenshot_btn)

            # Expand notes button with Phosphor icon
            self.expand_btn = QPushButton()
            self.expand_btn.setIcon(create_icon_from_svg(ICON_NOTEPAD, 16, "#666"))
            self.expand_btn.setIconSize(QSize(16, 16))
            self.expand_btn.setToolTip("Expand notes")
            self.expand_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            self.expand_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: white;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.expand_btn.clicked.connect(self.toggle_expanded_mode)
            audio_row.addWidget(self.expand_btn)

            # Recording timer label
            self.recording_label = QLabel("")
            self.recording_label.setStyleSheet("font-size: 12px; color: #dc3545;")
            self.recording_label.hide()
            audio_row.addWidget(self.recording_label)

            audio_row.addStretch()
            layout.addLayout(audio_row)

            # Recording duration timer
            self.recording_timer = QTimer()
            self.recording_timer.timeout.connect(self.update_recording_time)
            self.recording_start_time = None

        # Status (hidden when empty)
        self.status_label = QLabel("")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px;")
        self.status_label.hide()
        layout.addWidget(self.status_label)

        # Set up drop zone events
        self.drop_zone.dragEnterEvent = self.dropzone_drag_enter
        self.drop_zone.dragLeaveEvent = self.dropzone_drag_leave
        self.drop_zone.dropEvent = self.dropzone_drop

        # Install event filter on all children for cursor updates
        self.install_event_filter_recursive(self)

    def resizeEvent(self, event):
        # Make container fill the widget
        self.container.setGeometry(0, 0, self.width(), self.height())
        super().resizeEvent(event)

    def get_resize_edge(self, pos):
        """Determine which edge/corner the mouse is near for resizing."""
        rect = self.rect()
        m = self._resize_margin

        left = pos.x() < m
        right = pos.x() > rect.width() - m
        top = pos.y() < m
        bottom = pos.y() > rect.height() - m

        if top and left:
            return 'tl'
        elif top and right:
            return 'tr'
        elif bottom and left:
            return 'bl'
        elif bottom and right:
            return 'br'
        elif left:
            return 'l'
        elif right:
            return 'r'
        elif top:
            return 't'
        elif bottom:
            return 'b'
        return None

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            edge = self.get_resize_edge(event.pos())
            if edge:
                self._resize_edge = edge
                self._drag_pos = event.globalPosition().toPoint()
            else:
                self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
                self._resize_edge = None

    def mouseMoveEvent(self, event):
        # Update cursor based on position
        edge = self.get_resize_edge(event.pos())
        if event.buttons() == Qt.MouseButton.LeftButton and self._drag_pos and not self._resize_edge:
            # Dragging - show closed hand
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
        elif edge in ('l', 'r'):
            self.setCursor(Qt.CursorShape.SizeHorCursor)
        elif edge in ('t', 'b'):
            self.setCursor(Qt.CursorShape.SizeVerCursor)
        elif edge in ('tl', 'br'):
            self.setCursor(Qt.CursorShape.SizeFDiagCursor)
        elif edge in ('tr', 'bl'):
            self.setCursor(Qt.CursorShape.SizeBDiagCursor)
        else:
            # Show open hand when hovering over draggable area
            self.setCursor(Qt.CursorShape.OpenHandCursor)

        if event.buttons() == Qt.MouseButton.LeftButton and self._drag_pos:
            if self._resize_edge:
                # Resizing
                delta = event.globalPosition().toPoint() - self._drag_pos
                self._drag_pos = event.globalPosition().toPoint()

                geo = self.geometry()
                min_w, min_h = self.minimumWidth(), self.minimumHeight()

                if 'l' in self._resize_edge:
                    new_w = geo.width() - delta.x()
                    if new_w >= min_w:
                        geo.setLeft(geo.left() + delta.x())
                if 'r' in self._resize_edge:
                    geo.setWidth(max(min_w, geo.width() + delta.x()))
                if 't' in self._resize_edge:
                    new_h = geo.height() - delta.y()
                    if new_h >= min_h:
                        geo.setTop(geo.top() + delta.y())
                if 'b' in self._resize_edge:
                    geo.setHeight(max(min_h, geo.height() + delta.y()))

                self.setGeometry(geo)
            else:
                # Dragging
                self.move(event.globalPosition().toPoint() - self._drag_pos)

    def mouseReleaseEvent(self, event):
        self._drag_pos = None
        self._resize_edge = None

    def install_event_filter_recursive(self, widget):
        """Install event filter on widget and all children for cursor updates."""
        widget.installEventFilter(self)
        widget.setMouseTracking(True)
        for child in widget.findChildren(QWidget):
            child.installEventFilter(self)
            child.setMouseTracking(True)

    def eventFilter(self, obj, event):
        """Intercept mouse events and key events from children."""
        if event.type() == QEvent.Type.MouseMove:
            # Map position to main widget coordinates
            global_pos = event.globalPosition().toPoint()
            local_pos = self.mapFromGlobal(global_pos)

            # Update cursor based on edge detection
            edge = self.get_resize_edge(local_pos)
            if edge in ('l', 'r'):
                self.setCursor(Qt.CursorShape.SizeHorCursor)
            elif edge in ('t', 'b'):
                self.setCursor(Qt.CursorShape.SizeVerCursor)
            elif edge in ('tl', 'br'):
                self.setCursor(Qt.CursorShape.SizeFDiagCursor)
            elif edge in ('tr', 'bl'):
                self.setCursor(Qt.CursorShape.SizeBDiagCursor)
            else:
                self.setCursor(Qt.CursorShape.OpenHandCursor)

        # Intercept Ctrl+V for image paste from any child (especially notes)
        elif event.type() == QEvent.Type.KeyPress:
            if event.key() == Qt.Key.Key_V and event.modifiers() == Qt.KeyboardModifier.ControlModifier:
                clipboard = QApplication.clipboard()
                mime = clipboard.mimeData()

                # Only intercept if it's an image or file - let text paste through to notes
                if mime.hasImage():
                    image = clipboard.image()
                    if not image.isNull():
                        self.handle_clipboard_image(image)
                        return True  # Consume the event
                elif mime.hasUrls():
                    files = [url.toLocalFile() for url in mime.urls() if url.isLocalFile()]
                    if files:
                        self.handle_files(files)
                        return True  # Consume the event

        return super().eventFilter(obj, event)

    def dropzone_drag_enter(self, event):
        if event.mimeData().hasUrls() or event.mimeData().hasText():
            event.acceptProposedAction()
            self.drop_zone.setStyleSheet(f"""
                QFrame {{
                    border: {BORDER_WIDTH}px dashed #0066cc;
                    border-radius: 4px;
                    background: #f0f7ff;
                }}
            """)

    def dropzone_drag_leave(self, event):
        self.drop_zone.setStyleSheet(f"""
            QFrame {{
                border: {BORDER_WIDTH}px dashed #ccc;
                border-radius: 4px;
                background: white;
            }}
        """)

    def dropzone_drop(self, event):
        self.drop_zone.setStyleSheet(f"""
            QFrame {{
                border: {BORDER_WIDTH}px dashed #ccc;
                border-radius: 4px;
                background: white;
            }}
        """)

        mime = event.mimeData()
        if mime.hasUrls():
            files = [url.toLocalFile() for url in mime.urls() if url.isLocalFile()]
            if files:
                self.handle_files(files)
        elif mime.hasText():
            self.handle_text(mime.text())

    def keyPressEvent(self, event):
        # Handle Ctrl+V paste
        if event.key() == Qt.Key.Key_V and event.modifiers() == Qt.KeyboardModifier.ControlModifier:
            clipboard = QApplication.clipboard()
            mime = clipboard.mimeData()

            if mime.hasUrls():
                files = [url.toLocalFile() for url in mime.urls() if url.isLocalFile()]
                if files:
                    self.handle_files(files)
            elif mime.hasImage():
                image = clipboard.image()
                if not image.isNull():
                    self.handle_clipboard_image(image)
            elif mime.hasText():
                self.handle_text(mime.text())

    def handle_files(self, file_paths):
        self.pending_files = []
        for path in file_paths:
            filename = os.path.basename(path)
            file_type = detect_file_type(filename)

            # For video files, copy to /videos/ folder
            if file_type == 'video':
                videos_folder = Path(PROJECT_FOLDER) / 'videos'
                videos_folder.mkdir(exist_ok=True)
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                ext = Path(path).suffix
                dest_path = str(videos_folder / f'video_{timestamp}{ext}')
                shutil.copy2(path, dest_path)
                with open(dest_path, 'rb') as f:
                    data = base64.b64encode(f.read()).decode()
                self.pending_files.append({
                    'type': 'video',
                    'name': os.path.basename(dest_path),
                    'path': dest_path,
                    'data': data
                })
            else:
                with open(path, 'rb') as f:
                    data = base64.b64encode(f.read()).decode()
                self.pending_files.append({
                    'type': file_type,
                    'name': filename,
                    'path': path,
                    'data': data
                })
        self.update_file_list()
        self.start_timer()

    def handle_text(self, text):
        # Text goes directly into notes, triggers save timer
        self.pending_files = [{'type': 'text', 'name': 'Note', 'content': text}]
        self.notes.setPlainText(text)
        self.update_file_list()
        self.start_timer()

    def handle_clipboard_image(self, image):
        """Handle pasted image from clipboard (Ctrl+V) - treated as screenshot."""
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        screenshots_folder = Path(PROJECT_FOLDER) / 'screenshots'
        screenshots_folder.mkdir(exist_ok=True)
        screenshot_path = str(screenshots_folder / f'screenshot_{timestamp}.png')
        image.save(screenshot_path, 'PNG')

        with open(screenshot_path, 'rb') as f:
            data = base64.b64encode(f.read()).decode()

        self.pending_files = [{
            'type': 'screenshot',  # Clipboard paste = screenshot
            'name': f'screenshot_{timestamp}.png',
            'path': screenshot_path,
            'data': data
        }]
        self.update_file_list()
        self.start_timer()

    def update_file_list(self):
        if not self.pending_files:
            # Reset to default: show drop zone and notes
            self.drop_zone.show()
            self.file_label.hide()
            self.timer_label.hide()
            return

        # Hide drop zone, show file info
        self.drop_zone.hide()
        names = ", ".join(f["name"] for f in self.pending_files)
        self.file_label.setText(f"📄 {names}")
        self.file_label.show()
        self.notes.setFocus()

    def start_timer(self):
        self.countdown = 3
        self.timer_label.setText(f"Auto-saving in {self.countdown}s...")
        self.timer_label.show()
        self.timer.start(1000)

    def on_notes_changed(self):
        """Handle notes text changes - start or reset timer (unless in expanded mode)."""
        # In expanded mode, don't auto-save - user will manually save
        if self.expanded_mode:
            return

        text = self.notes.toPlainText().strip()

        if self.pending_files:
            # Already have pending items, reset timer to give more time
            self.countdown = 3
            self.timer_label.setText(f"Auto-saving in {self.countdown}s...")
            if not self.timer.isActive():
                self.timer_label.show()
                self.timer.start(1000)
        elif text:
            # New text typed, start save process
            self.pending_files = [{'type': 'text', 'name': 'Note', 'content': text}]
            self.drop_zone.hide()
            self.file_label.setText("📝 Note")
            self.file_label.show()
            self.start_timer()

    def reset_timer(self):
        if self.pending_files and self.timer.isActive():
            self.countdown = 3
            self.timer_label.setText(f"Auto-saving in {self.countdown}s...")

    def tick(self):
        self.countdown -= 1
        if self.countdown > 0:
            self.timer_label.setText(f"Auto-saving in {self.countdown}s...")
        else:
            self.timer.stop()
            self.timer_label.hide()
            self.save_files()

    def save_files(self):
        if not self.pending_files:
            return

        try:
            self.timer_label.setText("Saving...")
            self.timer_label.show()
            QApplication.processEvents()

            user_notes = self.notes.toPlainText()
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            for item in self.pending_files:
                if item['type'] == 'text':
                    # Text note - use consistent format
                    entry = {
                        'type': 'note',
                        'source': 'widget',              # New: 'browser' or 'widget'
                        'captured': timestamp,
                        'title': 'Note',
                        'url': '',                       # No URL for widget
                        'tabGroup': None,
                        'selectedText': '',              # No selected text for widget notes
                        'notes': user_notes              # User notes go here
                    }
                elif item['type'] == 'screenshot':
                    # Screenshot - use 'screenshot' key (matches extension)
                    entry = {
                        'type': 'screenshot',
                        'source': 'widget',
                        'captured': timestamp,
                        'title': item.get('name', f"screenshot_{timestamp.replace(' ', '_').replace(':', '-')}.png"),
                        'url': '',
                        'tabGroup': None,
                        'selectedText': '',
                        'notes': user_notes,
                        'screenshot': f"data:image/png;base64,{item['data']}"
                    }
                elif item['type'] == 'video':
                    # Video recording
                    entry = {
                        'type': 'video',
                        'source': 'widget',
                        'captured': timestamp,
                        'title': item.get('name', f"video_{timestamp.replace(' ', '_').replace(':', '-')}.mp4"),
                        'url': '',
                        'tabGroup': None,
                        'selectedText': '',
                        'notes': user_notes,
                        'fileData': f"data:video/mp4;base64,{item['data']}"
                    }
                else:
                    # Dragged file - detect type from extension
                    file_type = detect_file_type(item['name'])
                    entry = {
                        'type': file_type,
                        'source': 'widget',
                        'captured': timestamp,
                        'title': item['name'],
                        'url': '',
                        'tabGroup': None,
                        'selectedText': '',
                        'notes': user_notes,
                        'fileData': f"data:application/octet-stream;base64,{item['data']}"
                    }

                result = append_to_kb(PROJECT_FOLDER, entry, API_KEY)
                if not result.get('success'):
                    raise Exception(result.get('error', 'Unknown error'))

                # Run background processing (grammar, classification, summary) in thread
                if API_KEY:
                    background_task = result.pop('_background_task', None)
                    if background_task:
                        thread = threading.Thread(
                            target=background_process_entry,
                            args=(
                                background_task['project_folder'],
                                background_task['timestamp'],
                                background_task['entry'],
                                background_task['api_key'],
                                background_task.get('file_path')
                            )
                        )
                        thread.start()

            # Success - just reset UI
            self.timer_label.hide()
            self.pending_files = []
            self.notes.clear()
            self.update_file_list()

        except Exception as e:
            self.status_label.setText(f"Error: {str(e)}")
            self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
            self.status_label.show()

    # Audio recording methods
    def toggle_mic_recording(self):
        if not AUDIO_AVAILABLE:
            return

        if self.recording_type == 'mic':
            self.stop_recording()
        else:
            if self.recording_type:
                self.stop_recording()
            self.start_mic_recording()

    def toggle_system_recording(self):
        if not AUDIO_AVAILABLE:
            return

        if self.recording_type == 'system':
            self.stop_recording()
        else:
            if self.recording_type:
                self.stop_recording()
            self.start_system_recording()

    def start_mic_recording(self):
        try:
            self.audio_data = []
            self.recording_type = 'mic'

            # Get actual device sample rate
            device_info = sd.query_devices(kind='input')
            self.mic_samplerate = int(device_info['default_samplerate'])

            self.audio_stream = sd.InputStream(
                samplerate=self.mic_samplerate,
                channels=1,
                callback=self.audio_callback
            )
            self.audio_stream.start()

            # Update UI - show animated waveform icon with #ff5200 background
            self.waveform_frame = 0
            self.mic_btn.setIcon(create_icon_from_svg(ICON_WAVEFORM_1, 16, "white"))
            self.mic_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ff5200;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: #ff5200;
                }
            """)
            self.system_btn.setEnabled(False)

            # Start waveform animation timer (200ms for smooth animation)
            self.recording_start_time = datetime.now()
            self.recording_timer.start(200)

        except Exception as e:
            self.status_label.setText(f"Mic error: {str(e)}")
            self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
            self.status_label.show()
            self.recording_type = None

    def start_system_recording(self):
        try:
            if not WASAPI_AVAILABLE:
                raise Exception("Install pyaudiowpatch: pip install pyaudiowpatch")

            self.audio_data = []
            self.recording_type = 'system'

            # Use PyAudioWPatch for WASAPI loopback
            self.pyaudio_instance = pyaudio.PyAudio()

            # Find WASAPI loopback device (speakers)
            wasapi_info = self.pyaudio_instance.get_host_api_info_by_type(pyaudio.paWASAPI)
            default_speakers = self.pyaudio_instance.get_device_info_by_index(wasapi_info["defaultOutputDevice"])

            # Find the loopback device for the speakers
            loopback_device = None
            for i in range(self.pyaudio_instance.get_device_count()):
                dev = self.pyaudio_instance.get_device_info_by_index(i)
                if dev["name"] == default_speakers["name"] + " [Loopback]":
                    loopback_device = dev
                    break

            if not loopback_device:
                # Fallback: look for any loopback device
                for i in range(self.pyaudio_instance.get_device_count()):
                    dev = self.pyaudio_instance.get_device_info_by_index(i)
                    if "loopback" in dev["name"].lower():
                        loopback_device = dev
                        break

            if not loopback_device:
                raise Exception("No loopback device found")

            self.system_samplerate = int(loopback_device["defaultSampleRate"])
            self.system_channels = loopback_device["maxInputChannels"]

            self.pyaudio_stream = self.pyaudio_instance.open(
                format=pyaudio.paInt16,
                channels=self.system_channels,
                rate=self.system_samplerate,
                input=True,
                input_device_index=loopback_device["index"],
                frames_per_buffer=1024,
                stream_callback=self.pyaudio_callback
            )
            self.pyaudio_stream.start_stream()

            # Update UI - show animated waveform icon with #ff5200 background
            self.waveform_frame = 0
            self.system_btn.setIcon(create_icon_from_svg(ICON_WAVEFORM_1, 16, "white"))
            self.system_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ff5200;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: #ff5200;
                }
            """)
            self.mic_btn.setEnabled(False)

            # Start waveform animation timer (200ms for smooth animation)
            self.recording_start_time = datetime.now()
            self.recording_timer.start(200)

        except Exception as e:
            self.status_label.setText(f"{str(e)}")
            self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
            self.status_label.show()
            self.recording_type = None
            if hasattr(self, 'pyaudio_instance') and self.pyaudio_instance:
                self.pyaudio_instance.terminate()
                self.pyaudio_instance = None

    def pyaudio_callback(self, in_data, frame_count, time_info, status):
        self.audio_data.append(in_data)
        return (in_data, pyaudio.paContinue)

    def audio_callback(self, indata, frames, time, status):
        self.audio_data.append(indata.copy())

    def update_recording_time(self):
        """Animate waveform icon while recording."""
        if self.recording_type:
            # Cycle through waveform frames
            self.waveform_frame = (self.waveform_frame + 1) % 3
            waveforms = [ICON_WAVEFORM_1, ICON_WAVEFORM_2, ICON_WAVEFORM_3]
            icon = create_icon_from_svg(waveforms[self.waveform_frame], 16, "white")

            if self.recording_type == 'mic':
                self.mic_btn.setIcon(icon)
            elif self.recording_type == 'system':
                self.system_btn.setIcon(icon)

    def stop_recording(self):
        if not self.audio_stream and not hasattr(self, 'pyaudio_stream'):
            return

        try:
            # Stop the appropriate stream
            if self.recording_type == 'system' and hasattr(self, 'pyaudio_stream') and self.pyaudio_stream:
                self.pyaudio_stream.stop_stream()
                self.pyaudio_stream.close()
                self.pyaudio_stream = None
                if hasattr(self, 'pyaudio_instance') and self.pyaudio_instance:
                    self.pyaudio_instance.terminate()
                    self.pyaudio_instance = None
            elif self.audio_stream:
                self.audio_stream.stop()
                self.audio_stream.close()
                self.audio_stream = None

            if self.audio_data:
                # Concatenate all audio chunks
                if self.recording_type == 'system':
                    # PyAudio returns bytes, convert to numpy
                    audio_bytes = b''.join(self.audio_data)
                    audio = np.frombuffer(audio_bytes, dtype=np.int16)
                    samplerate = getattr(self, 'system_samplerate', 44100)
                    channels = getattr(self, 'system_channels', 2)
                    # Reshape stereo audio to 2D array (samples, channels)
                    if channels > 1:
                        audio = audio.reshape(-1, channels)
                else:
                    audio = np.concatenate(self.audio_data)
                    # Normalize mic audio to int16 range
                    audio = np.int16(audio * 32767)
                    samplerate = getattr(self, 'mic_samplerate', 44100)

                # Ensure files folder exists
                files_folder = Path(PROJECT_FOLDER) / 'files'
                files_folder.mkdir(exist_ok=True)

                # Generate filename
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                prefix = 'mic' if self.recording_type == 'mic' else 'system'
                filename = f"{prefix}_{timestamp}.wav"
                filepath = files_folder / filename

                # Save WAV file (audio is already int16)
                write_wav(str(filepath), samplerate, audio)

                # Read file data for pending save
                with open(filepath, 'rb') as f:
                    data = base64.b64encode(f.read()).decode()

                # Add to pending files and start timer (like other handlers)
                self.pending_files = [{
                    'type': 'audio',
                    'name': filename,
                    'path': str(filepath),
                    'data': data
                }]
                self.update_file_list()
                self.start_timer()  # Give 3s to add notes

            self.audio_data = []

        except Exception as e:
            self.status_label.setText(f"Save error: {str(e)}")
            self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
            self.status_label.show()

        finally:
            # Stop waveform animation timer
            self.recording_timer.stop()
            self.recording_start_time = None
            self.waveform_frame = 0

            # Reset UI
            self.recording_type = None
            if AUDIO_AVAILABLE:
                self.mic_btn.setIcon(create_icon_from_svg(ICON_MICROPHONE, 16, "#666"))
                self.mic_btn.setStyleSheet("""
                    QPushButton {
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 6px 10px;
                        background: white;
                    }
                    QPushButton:hover {
                        background: #f5f5f5;
                    }
                """)
                self.mic_btn.setEnabled(True)

                self.system_btn.setIcon(create_icon_from_svg(ICON_SPEAKER, 16, "#666"))
                self.system_btn.setStyleSheet("""
                    QPushButton {
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 6px 10px;
                        background: white;
                    }
                    QPushButton:hover {
                        background: #f5f5f5;
                    }
                """)
                self.system_btn.setEnabled(True)

    # Expand/collapse notes mode
    def toggle_expanded_mode(self):
        self.expanded_mode = not self.expanded_mode

        if self.expanded_mode:
            # Expand: hide drop zone, show toolbar, make widget bigger
            self.drop_zone.hide()
            self.toolbar_widget.show()
            self.resize(self.expanded_size[0], self.expanded_size[1])
            # Update button to selected state
            self.expand_btn.setIcon(create_icon_from_svg(ICON_NOTEPAD, 16, "white"))
            self.expand_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ff5200;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: #ff5200;
                }
                QPushButton:hover {
                    background: #e64a00;
                }
            """)
            self.expand_btn.setToolTip("Collapse notes")
            # Start auto-save timer (every 10 seconds)
            self.autosave_timer.start(10000)
            # Reset note timestamp for fresh note
            self.current_note_timestamp = None
        else:
            # Stop auto-save timer
            self.autosave_timer.stop()
            # Clear note timestamp
            self.current_note_timestamp = None
            # Collapse: hide toolbar, restore default size
            self.toolbar_widget.hide()
            self.resize(self.default_size[0], self.default_size[1])
            # Update button to default state
            self.expand_btn.setIcon(create_icon_from_svg(ICON_NOTEPAD, 16, "#666"))
            self.expand_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 10px;
                    background: white;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.expand_btn.setToolTip("Expand notes")

            # Save all tabs before closing, then clear
            self._save_all_tabs()

            # Clear notes and reset to default state (plain text only)
            self.notes.clear()
            # Reset text formatting to plain (no bold, italic, etc.)
            self.notes.setCurrentCharFormat(QTextCharFormat())
            self.pending_files = []
            self.file_label.hide()
            self.drop_zone.show()

            # Reset tabs
            self.note_tabs = [{'html': '', 'timestamp': None}]
            self.current_tab_index = 0
            self.tab_bar_widget.hide()
            self._rebuild_tab_bar()

    # Tab management methods
    def add_note_tab(self):
        """Add a new note tab."""
        # Save current tab's HTML first (preserves formatting)
        self.note_tabs[self.current_tab_index]['html'] = self.notes.toHtml()

        # Create new tab
        self.note_tabs.append({'html': '', 'timestamp': None})
        new_index = len(self.note_tabs) - 1

        # Switch to new tab
        self._switch_to_tab(new_index)

        # Show tab bar now that we have multiple tabs
        if len(self.note_tabs) > 1:
            self.tab_bar_widget.show()

        self._rebuild_tab_bar()

    def close_current_tab(self):
        """Close the current tab (save first, then remove)."""
        if len(self.note_tabs) <= 1:
            return  # Can't close the last tab

        # Save current tab before closing (if has content)
        if self.notes.toPlainText().strip():
            self._save_single_tab(self.current_tab_index)

        # Remove the tab
        del self.note_tabs[self.current_tab_index]

        # Adjust current index if needed
        if self.current_tab_index >= len(self.note_tabs):
            self.current_tab_index = len(self.note_tabs) - 1

        # Load the new current tab (using HTML to preserve formatting)
        html = self.note_tabs[self.current_tab_index].get('html', '')
        if html:
            self.notes.setHtml(html)
        else:
            self.notes.clear()
        self.current_note_timestamp = self.note_tabs[self.current_tab_index]['timestamp']

        # Rebuild tab bar
        self._rebuild_tab_bar()

        # Hide tab bar if only 1 tab left
        if len(self.note_tabs) <= 1:
            self.tab_bar_widget.hide()

    def _save_single_tab(self, tab_index):
        """Save a single tab's content (converts HTML to markdown)."""
        tab = self.note_tabs[tab_index]

        # Get HTML content - from tab storage or current notes widget
        if tab_index == self.current_tab_index:
            html = self.notes.toHtml()
        else:
            html = tab.get('html', '')

        # Convert HTML to markdown for saving
        text = html_to_markdown(html).strip()
        if not text:
            return

        try:
            if tab['timestamp']:
                # Update existing entry
                if not update_entry_notes(PROJECT_FOLDER, tab['timestamp'], text):
                    raise Exception('Failed to update entry')
            else:
                # Create new entry
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                entry = {
                    'type': 'long-note',
                    'source': 'widget',
                    'captured': timestamp,
                    'title': 'Long Note',
                    'url': '',
                    'tabGroup': None,
                    'selectedText': '',
                    'notes': text
                }

                result = append_to_kb(PROJECT_FOLDER, entry, API_KEY)
                if not result.get('success'):
                    raise Exception(result.get('error', 'Unknown error'))

                # Store timestamp
                self.note_tabs[tab_index]['timestamp'] = timestamp

                # Run background processing in thread
                if API_KEY:
                    background_task = result.pop('_background_task', None)
                    if background_task:
                        thread = threading.Thread(
                            target=background_process_entry,
                            args=(
                                background_task['project_folder'],
                                background_task['timestamp'],
                                background_task['entry'],
                                background_task['api_key'],
                                background_task.get('file_path')
                            )
                        )
                        thread.start()
        except Exception as e:
            self.status_label.setText(f"Error saving: {str(e)}")
            self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
            self.status_label.show()

    def _switch_to_tab(self, index):
        """Switch to a different note tab."""
        if index < 0 or index >= len(self.note_tabs):
            return

        # Save current tab's HTML content (preserves formatting)
        self.note_tabs[self.current_tab_index]['html'] = self.notes.toHtml()

        # Switch index
        self.current_tab_index = index

        # Load new tab's HTML content (restores formatting)
        html = self.note_tabs[index].get('html', '')
        if html:
            self.notes.setHtml(html)
        else:
            self.notes.clear()

        # Update current_note_timestamp for auto-save
        self.current_note_timestamp = self.note_tabs[index]['timestamp']

        # Rebuild tab bar to update active styling
        self._rebuild_tab_bar()

    def _rebuild_tab_bar(self):
        """Rebuild the tab bar buttons."""
        # Remove old buttons
        for btn in self.tab_buttons:
            self.tab_bar_layout.removeWidget(btn)
            btn.deleteLater()
        self.tab_buttons = []

        # Update close button enabled state
        self.close_tab_btn.setEnabled(len(self.note_tabs) > 1)

        # Only show tab bar if more than 1 tab
        if len(self.note_tabs) <= 1:
            self.tab_bar_widget.hide()
            return

        # Remove stretch temporarily
        stretch_item = self.tab_bar_layout.takeAt(self.tab_bar_layout.count() - 1)

        # Create new buttons
        tab_size = 24  # Square tabs
        for i, tab in enumerate(self.note_tabs):
            btn = QPushButton()
            btn.setFixedSize(tab_size, tab_size)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)

            # Active tab: solid grey fill (#ddd), grey border
            # Inactive tabs: no background, grey border
            if i == self.current_tab_index:
                btn.setStyleSheet("""
                    QPushButton {
                        background: #ddd;
                        border: 1px solid #ddd;
                        border-bottom: none;
                        border-radius: 4px;
                        border-bottom-left-radius: 0px;
                        border-bottom-right-radius: 0px;
                    }
                """)
            else:
                btn.setStyleSheet("""
                    QPushButton {
                        background: transparent;
                        border: 1px solid #ddd;
                        border-bottom: none;
                        border-radius: 4px;
                        border-bottom-left-radius: 0px;
                        border-bottom-right-radius: 0px;
                    }
                    QPushButton:hover {
                        background: rgba(255, 82, 0, 0.1);
                    }
                """)

            # Connect click to switch
            btn.clicked.connect(lambda checked, idx=i: self._switch_to_tab(idx))
            self.tab_bar_layout.insertWidget(i, btn)
            self.tab_buttons.append(btn)

        # Re-add stretch at end
        self.tab_bar_layout.addStretch()

    def _save_all_tabs(self):
        """Save all tabs that have content (converts HTML to markdown)."""
        # Save current tab's HTML first
        self.note_tabs[self.current_tab_index]['html'] = self.notes.toHtml()

        for i, tab in enumerate(self.note_tabs):
            # Convert HTML to markdown for saving
            html = tab.get('html', '')
            text = html_to_markdown(html).strip()
            if not text:
                continue

            try:
                if tab['timestamp']:
                    # Update existing entry
                    if not update_entry_notes(PROJECT_FOLDER, tab['timestamp'], text):
                        raise Exception('Failed to update entry')
                else:
                    # Create new entry
                    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    entry = {
                        'type': 'long-note',
                        'source': 'widget',
                        'captured': timestamp,
                        'title': 'Long Note',
                        'url': '',
                        'tabGroup': None,
                        'selectedText': '',
                        'notes': text
                    }

                    result = append_to_kb(PROJECT_FOLDER, entry, API_KEY)
                    if not result.get('success'):
                        raise Exception(result.get('error', 'Unknown error'))

                    # Store timestamp
                    self.note_tabs[i]['timestamp'] = timestamp

                    # Run background processing in thread
                    if API_KEY:
                        background_task = result.pop('_background_task', None)
                        if background_task:
                            thread = threading.Thread(
                                target=background_process_entry,
                                args=(
                                    background_task['project_folder'],
                                    background_task['timestamp'],
                                    background_task['entry'],
                                    background_task['api_key'],
                                    background_task.get('file_path')
                                )
                            )
                            thread.start()
            except Exception as e:
                self.status_label.setText(f"Error saving tab {i+1}: {str(e)}")
                self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
                self.status_label.show()

    # Rich text formatting methods
    def apply_bold_format(self):
        """Toggle bold on selected text."""
        cursor = self.notes.textCursor()
        fmt = cursor.charFormat()
        if fmt.fontWeight() == QFont.Weight.Bold:
            fmt.setFontWeight(QFont.Weight.Normal)
        else:
            fmt.setFontWeight(QFont.Weight.Bold)
        cursor.mergeCharFormat(fmt)
        self.notes.setFocus()

    def apply_italic_format(self):
        """Toggle italic on selected text."""
        cursor = self.notes.textCursor()
        fmt = cursor.charFormat()
        fmt.setFontItalic(not fmt.fontItalic())
        cursor.mergeCharFormat(fmt)
        self.notes.setFocus()

    def apply_code_format(self):
        """Toggle monospace font on selected text."""
        cursor = self.notes.textCursor()
        fmt = cursor.charFormat()
        current_family = fmt.fontFamily()
        if 'Courier' in current_family or 'monospace' in current_family.lower():
            fmt.setFontFamily('')  # Reset to default
        else:
            fmt.setFontFamily('Courier New')
        cursor.mergeCharFormat(fmt)
        self.notes.setFocus()

    def apply_line_prefix(self, prefix):
        """Insert prefix at start of current line (for headers, quotes, bullets)."""
        cursor = self.notes.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.StartOfBlock)
        cursor.insertText(prefix)
        self.notes.setTextCursor(cursor)
        self.notes.setFocus()

    def apply_link_format(self):
        """Insert markdown link syntax (kept as markdown since HTML links are complex)."""
        cursor = self.notes.textCursor()
        selected = cursor.selectedText()

        if selected:
            cursor.insertText(f"[{selected}](url)")
            # Select "url" for easy replacement
            cursor.movePosition(QTextCursor.MoveOperation.Left, QTextCursor.MoveMode.MoveAnchor, 1)
            cursor.movePosition(QTextCursor.MoveOperation.Left, QTextCursor.MoveMode.KeepAnchor, 3)
        else:
            cursor.insertText("[text](url)")
            # Select "text" for easy replacement
            cursor.movePosition(QTextCursor.MoveOperation.Left, QTextCursor.MoveMode.MoveAnchor, 6)
            cursor.movePosition(QTextCursor.MoveOperation.Left, QTextCursor.MoveMode.KeepAnchor, 4)

        self.notes.setTextCursor(cursor)
        self.notes.setFocus()

    def manual_save(self):
        """Manual save triggered by button or Ctrl+S in expanded mode."""
        # Get HTML and convert to markdown for saving
        html = self.notes.toHtml()
        text = html_to_markdown(html).strip()
        if not text:
            return

        # Show spinner icon
        self.save_btn.setIcon(create_icon_from_svg(ICON_SPINNER, 14, "#666"))
        self.save_btn.setEnabled(False)
        QApplication.processEvents()

        try:
            if self.current_note_timestamp:
                # Update existing entry
                if not update_entry_notes(PROJECT_FOLDER, self.current_note_timestamp, text):
                    raise Exception('Failed to update entry')
            else:
                # Create new entry (first save)
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                entry = {
                    'type': 'long-note',
                    'source': 'widget',
                    'captured': timestamp,
                    'title': 'Long Note',
                    'url': '',
                    'tabGroup': None,
                    'selectedText': '',
                    'notes': text              # Markdown text saved here
                }

                result = append_to_kb(PROJECT_FOLDER, entry, API_KEY)
                if not result.get('success'):
                    raise Exception(result.get('error', 'Unknown error'))

                # Run background processing (grammar, classification, summary) in thread
                if API_KEY:
                    background_task = result.pop('_background_task', None)
                    if background_task:
                        thread = threading.Thread(
                            target=background_process_entry,
                            args=(
                                background_task['project_folder'],
                                background_task['timestamp'],
                                background_task['entry'],
                                background_task['api_key'],
                                background_task.get('file_path')
                            )
                        )
                        thread.start()

                # Store timestamp for subsequent updates
                self.current_note_timestamp = timestamp
                # Also update the tab's timestamp
                self.note_tabs[self.current_tab_index]['timestamp'] = timestamp

            # Update tab's HTML (preserve formatting for display)
            self.note_tabs[self.current_tab_index]['html'] = html

            # Show spinner for 1 second then restore save icon
            QTimer.singleShot(1000, self._restore_save_button)

        except Exception as e:
            self.status_label.setText(f"Error: {str(e)}")
            self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
            self.status_label.show()
            self._restore_save_button()

    def _restore_save_button(self):
        """Restore save button to default state."""
        self.save_btn.setIcon(create_icon_from_svg(ICON_SAVE, 14, "#666"))
        self.save_btn.setEnabled(True)

    def _autosave_expanded(self):
        """Auto-save in expanded mode every 10s if there's text."""
        if not self.expanded_mode:
            return
        text = self.notes.toPlainText().strip()
        if text:
            self.manual_save()

    # Screenshot methods
    def start_screenshot(self):
        """Hide widget, show selection overlay."""
        self.hide()
        QTimer.singleShot(150, self._show_screenshot_overlay)

    def _show_screenshot_overlay(self):
        self.overlay = SelectionOverlay()
        self.overlay.area_selected.connect(self._capture_screenshot)
        self.overlay.cancelled.connect(self.show)
        self.overlay.show()
        self.overlay.activateWindow()

    def _capture_screenshot(self, rect):
        """Capture screen and add to pending_files."""
        QTimer.singleShot(100, lambda: self._do_capture(rect))

    def _do_capture(self, rect):
        try:
            with mss.mss() as sct:
                if rect:
                    # rect is in physical screen coordinates from overlay
                    monitor = {
                        'left': rect.x(),
                        'top': rect.y(),
                        'width': rect.width(),
                        'height': rect.height()
                    }
                else:
                    monitor = sct.monitors[1]  # Primary screen

                img = sct.grab(monitor)

                # Save to screenshots folder
                from mss.tools import to_png
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                screenshots_folder = Path(PROJECT_FOLDER) / 'screenshots'
                screenshots_folder.mkdir(exist_ok=True)
                screenshot_path = str(screenshots_folder / f'screenshot_{timestamp}.png')
                to_png(img.rgb, img.size, output=screenshot_path)

            with open(screenshot_path, 'rb') as f:
                data = base64.b64encode(f.read()).decode()

            self.pending_files = [{
                'type': 'screenshot',
                'name': f'screenshot_{timestamp}.png',
                'path': screenshot_path,
                'data': data
            }]
            self.update_file_list()
            self.start_timer()

        except Exception as e:
            self.status_label.setText(f"Screenshot error: {e}")
            self.status_label.setStyleSheet("background: #f8d7da; color: #721c24;")
            self.status_label.show()
        finally:
            self.show()

    def _update_monitor_btn_style(self):
        """Update monitor button style based on multi-monitor state."""
        if self.multi_monitor_enabled:
            # Active state - orange highlight
            self.monitor_btn.setStyleSheet(f"""
                QPushButton {{
                    border: none;
                    border-radius: 4px;
                    background: {BORDER_COLOR};
                }}
                QPushButton:hover {{
                    background: #e04900;
                }}
            """)
            self.monitor_btn.setIcon(create_icon_from_svg(ICON_MONITOR, 16, "#fff"))
            self.monitor_btn.setToolTip("Showing on all monitors (click to disable)")
        else:
            # Inactive state
            self.monitor_btn.setStyleSheet("""
                QPushButton {
                    border: none;
                    border-radius: 4px;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.monitor_btn.setIcon(create_icon_from_svg(ICON_MONITOR, 16, "#666"))
            self.monitor_btn.setToolTip("Show on all monitors")

    def toggle_multi_monitor(self):
        """Toggle display on all monitors."""
        self.multi_monitor_enabled = not self.multi_monitor_enabled
        self._update_monitor_btn_style()

        if self.multi_monitor_enabled:
            self._create_mirror_widgets()
        else:
            self._destroy_mirror_widgets()

    def _create_mirror_widgets(self):
        """Create mirror widgets on all other screens."""
        screens = QGuiApplication.screens()
        primary_screen = QGuiApplication.primaryScreen()

        # Get current position relative to primary screen
        current_pos = self.pos()
        current_size = self.size()

        # Calculate position as percentage of screen for consistent placement
        primary_geo = primary_screen.geometry()
        rel_x = (current_pos.x() - primary_geo.x()) / primary_geo.width()
        rel_y = (current_pos.y() - primary_geo.y()) / primary_geo.height()

        for screen in screens:
            if screen == primary_screen:
                continue  # Skip primary - main widget is there

            # Create a simple mirror widget for this screen
            mirror = MirrorWidget(self)
            mirror.resize(current_size)

            # Position relative to this screen
            screen_geo = screen.geometry()
            x = screen_geo.x() + int(rel_x * screen_geo.width())
            y = screen_geo.y() + int(rel_y * screen_geo.height())
            mirror.move(x, y)
            mirror.show()
            self.mirror_widgets.append(mirror)

    def _destroy_mirror_widgets(self):
        """Close and remove all mirror widgets."""
        for mirror in self.mirror_widgets:
            mirror.close()
        self.mirror_widgets.clear()

    def closeEvent(self, event):
        """Clean up mirror widgets when main widget closes."""
        self._destroy_mirror_widgets()
        super().closeEvent(event)


class MirrorWidget(QWidget):
    """Lightweight mirror widget for secondary monitors - just a drop target."""

    def __init__(self, main_widget):
        super().__init__()
        self.main_widget = main_widget

        # Frameless, always on top
        self.setWindowFlags(
            Qt.WindowType.Window |
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool  # Don't show in taskbar
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMouseTracking(True)
        self.setWindowTitle("UltraThink (Mirror)")
        self.setMinimumSize(200, 200)

        # For dragging
        self._drag_pos = None

        # Main container
        self.container = QFrame(self)
        self.container.setStyleSheet(f"""
            QFrame#container {{
                background: white;
                border: {BORDER_WIDTH}px solid {BORDER_COLOR};
                border-radius: 8px;
            }}
        """)
        self.container.setObjectName("container")

        layout = QVBoxLayout(self.container)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(8)

        # Header
        header = QHBoxLayout()
        title = QLabel("Ultrathink")
        title.setStyleSheet("font-size: 14px; font-weight: 600; color: #333;")
        header.addWidget(title)
        header.addStretch()
        layout.addLayout(header)

        # Drop zone
        self.drop_zone = QFrame()
        self.drop_zone.setAcceptDrops(True)
        self.drop_zone.setStyleSheet(f"""
            QFrame {{
                border: {BORDER_WIDTH}px dashed #ccc;
                border-radius: 4px;
                background: white;
            }}
        """)

        drop_layout = QVBoxLayout(self.drop_zone)
        drop_label = QLabel("Drop files here\n(Mirror)")
        drop_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        drop_label.setStyleSheet("color: #666; font-size: 13px; border: none;")
        drop_layout.addWidget(drop_label)
        layout.addWidget(self.drop_zone, 1)

        # Install event filter for drag/drop
        self.drop_zone.installEventFilter(self)
        self.setAcceptDrops(True)

    def resizeEvent(self, event):
        """Keep container filling the widget."""
        self.container.setGeometry(0, 0, self.width(), self.height())

    def eventFilter(self, obj, event):
        """Handle drag/drop events on drop zone."""
        if obj == self.drop_zone:
            if event.type() == QEvent.Type.DragEnter:
                event.acceptProposedAction()
                self.drop_zone.setStyleSheet(f"""
                    QFrame {{
                        border: {BORDER_WIDTH}px dashed {BORDER_COLOR};
                        border-radius: 4px;
                        background: #fff5f0;
                    }}
                """)
                return True
            elif event.type() == QEvent.Type.DragLeave:
                self.drop_zone.setStyleSheet(f"""
                    QFrame {{
                        border: {BORDER_WIDTH}px dashed #ccc;
                        border-radius: 4px;
                        background: white;
                    }}
                """)
                return True
            elif event.type() == QEvent.Type.Drop:
                # Forward drop to main widget
                self._forward_drop(event)
                self.drop_zone.setStyleSheet(f"""
                    QFrame {{
                        border: {BORDER_WIDTH}px dashed #ccc;
                        border-radius: 4px;
                        background: white;
                    }}
                """)
                return True
        return super().eventFilter(obj, event)

    def _forward_drop(self, event):
        """Forward drop event to main widget for processing."""
        mime = event.mimeData()
        if mime.hasUrls():
            files = [url.toLocalFile() for url in mime.urls() if url.isLocalFile()]
            if files:
                self.main_widget.handle_files(files)
        elif mime.hasText():
            self.main_widget.handle_text(mime.text())

    def dragEnterEvent(self, event):
        """Accept drag events on the widget itself."""
        event.acceptProposedAction()

    def dropEvent(self, event):
        """Forward drops to main widget."""
        self._forward_drop(event)

    def mousePressEvent(self, event):
        """Start drag if in title area."""
        if event.button() == Qt.MouseButton.LeftButton and event.position().y() < 40:
            self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        """Handle dragging."""
        if self._drag_pos and event.buttons() == Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self._drag_pos)
            event.accept()

    def mouseReleaseEvent(self, event):
        """End drag."""
        self._drag_pos = None


def main():
    # Set Windows AppUserModelID for correct taskbar icon
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('ultrathink.widget')
    except Exception:
        pass

    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(True)

    # Set application icon
    icon_path = Path(__file__).parent.parent / 'ultrathink-extension' / 'icons' / 'icon128.png'
    if icon_path.exists():
        app.setWindowIcon(QIcon(str(icon_path)))

    widget = UltraThinkWidget()
    widget.show()

    sys.exit(app.exec())


if __name__ == '__main__':
    main()
