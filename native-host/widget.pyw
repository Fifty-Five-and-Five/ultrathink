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
    QLabel, QPushButton, QTextEdit, QFrame, QSizeGrip
)
from PyQt6.QtCore import Qt, QTimer, QSize, QEvent
from PyQt6.QtGui import QCursor

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

# Import save functions from host.py
sys.path.insert(0, str(Path(__file__).parent))
from host import append_to_kb

# Config
PROJECT_FOLDER = r'C:\Users\ChrisWright\OneDrive - Fifty Five and Five\dev\ultrathink'
BORDER_COLOR = "#ff5200"
BORDER_WIDTH = 2


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
        self.audio_data = []

        self.init_ui()

    def init_ui(self):
        # Frameless, always on top
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setMouseTracking(True)

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

        # Notes - bottom half (always visible by default)
        self.notes = QTextEdit()
        self.notes.setPlaceholderText("Add notes...")
        self.notes.setStyleSheet("""
            QTextEdit {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 6px;
                font-size: 13px;
            }
        """)
        self.notes.textChanged.connect(self.on_notes_changed)
        layout.addWidget(self.notes, 1)  # stretch factor 1 - equal to drop zone

        # Audio recording buttons
        if AUDIO_AVAILABLE:
            audio_row = QHBoxLayout()
            audio_row.setSpacing(8)

            self.mic_btn = QPushButton("● Mic")
            self.mic_btn.setCursor(Qt.CursorShape.ArrowCursor)
            self.mic_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 12px;
                    font-size: 12px;
                    background: white;
                    color: #666;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.mic_btn.clicked.connect(self.toggle_mic_recording)
            audio_row.addWidget(self.mic_btn)

            self.system_btn = QPushButton("● System")
            self.system_btn.setCursor(Qt.CursorShape.ArrowCursor)
            self.system_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 12px;
                    font-size: 12px;
                    background: white;
                    color: #666;
                }
                QPushButton:hover {
                    background: #f5f5f5;
                }
            """)
            self.system_btn.clicked.connect(self.toggle_system_recording)
            audio_row.addWidget(self.system_btn)

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
            with open(path, 'rb') as f:
                data = base64.b64encode(f.read()).decode()
            self.pending_files.append({
                'type': 'file',
                'name': os.path.basename(path),
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
        import tempfile
        temp_path = tempfile.mktemp(suffix='.png')
        image.save(temp_path, 'PNG')

        with open(temp_path, 'rb') as f:
            data = base64.b64encode(f.read()).decode()

        self.pending_files = [{
            'type': 'screenshot',  # Clipboard paste = screenshot
            'name': 'screenshot.png',
            'path': temp_path,
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
        """Handle notes text changes - start or reset timer."""
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
                        'type': 'snippet',
                        'source': 'widget',              # New: 'browser' or 'widget'
                        'captured': timestamp,
                        'title': 'Note',
                        'url': '',                       # No URL for widget
                        'tabGroup': None,
                        'selectedText': user_notes,      # Text content goes to selectedText
                        'notes': ''                      # No separate notes for pure text
                    }
                elif item['type'] == 'screenshot':
                    # Clipboard paste - keep as image type
                    entry = {
                        'type': 'image',
                        'source': 'widget',
                        'captured': timestamp,
                        'title': f"clipboard-image_{timestamp.replace(' ', '_').replace(':', '-')}.png",
                        'url': '',
                        'tabGroup': None,
                        'selectedText': '',
                        'notes': user_notes,
                        'fileData': f"data:image/png;base64,{item['data']}"
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

                result = append_to_kb(PROJECT_FOLDER, entry)
                if not result.get('success'):
                    raise Exception(result.get('error', 'Unknown error'))

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

            # Update UI
            self.mic_btn.setText("■ Stop")
            self.mic_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #dc3545;
                    border-radius: 4px;
                    padding: 6px 12px;
                    font-size: 12px;
                    background: #dc3545;
                    color: white;
                }
            """)
            self.system_btn.setEnabled(False)

            # Start recording timer
            self.recording_start_time = datetime.now()
            self.recording_label.setText("● 0:00")
            self.recording_label.show()
            self.recording_timer.start(1000)

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

            # Update UI
            self.system_btn.setText("■ Stop")
            self.system_btn.setStyleSheet("""
                QPushButton {
                    border: 1px solid #dc3545;
                    border-radius: 4px;
                    padding: 6px 12px;
                    font-size: 12px;
                    background: #dc3545;
                    color: white;
                }
            """)
            self.mic_btn.setEnabled(False)

            # Start recording timer
            self.recording_start_time = datetime.now()
            self.recording_label.setText("● 0:00")
            self.recording_label.show()
            self.recording_timer.start(1000)

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
        if self.recording_start_time:
            elapsed = datetime.now() - self.recording_start_time
            minutes = int(elapsed.total_seconds() // 60)
            seconds = int(elapsed.total_seconds() % 60)
            self.recording_label.setText(f"● {minutes}:{seconds:02d}")

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

                # Add to kb.md with consistent format
                with open(filepath, 'rb') as f:
                    data = base64.b64encode(f.read()).decode()

                entry = {
                    'type': 'audio',
                    'source': 'widget',
                    'captured': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'title': filename,
                    'url': '',
                    'tabGroup': None,
                    'selectedText': '',
                    'notes': self.notes.toPlainText(),
                    'fileData': f"data:audio/wav;base64,{data}"
                }

                result = append_to_kb(PROJECT_FOLDER, entry)
                if result.get('success'):
                    self.status_label.setText(f"Saved: {filename}")
                    self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #d4edda; color: #155724;")
                    self.status_label.show()
                    QTimer.singleShot(2000, lambda: self.status_label.hide())

            self.audio_data = []

        except Exception as e:
            self.status_label.setText(f"Save error: {str(e)}")
            self.status_label.setStyleSheet("font-size: 12px; padding: 6px; border-radius: 4px; background: #f8d7da; color: #721c24;")
            self.status_label.show()

        finally:
            # Stop recording timer
            self.recording_timer.stop()
            self.recording_label.hide()
            self.recording_start_time = None

            # Reset UI
            self.recording_type = None
            if AUDIO_AVAILABLE:
                self.mic_btn.setText("● Mic")
                self.mic_btn.setStyleSheet("""
                    QPushButton {
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 6px 12px;
                        font-size: 12px;
                        background: white;
                        color: #666;
                    }
                    QPushButton:hover {
                        background: #f5f5f5;
                    }
                """)
                self.mic_btn.setEnabled(True)

                self.system_btn.setText("● System")
                self.system_btn.setStyleSheet("""
                    QPushButton {
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 6px 12px;
                        font-size: 12px;
                        background: white;
                        color: #666;
                    }
                    QPushButton:hover {
                        background: #f5f5f5;
                    }
                """)
                self.system_btn.setEnabled(True)


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(True)

    widget = UltraThinkWidget()
    widget.show()

    sys.exit(app.exec())


if __name__ == '__main__':
    main()
