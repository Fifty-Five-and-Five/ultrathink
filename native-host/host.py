#!/usr/bin/env python3
"""
Native messaging host for UltraThink extension.
Handles saving URLs and content to kb.md markdown file.
"""

import sys
import json
import struct
import os
import base64
from pathlib import Path
from datetime import datetime


def read_message():
    """Read a message from stdin (sent by extension)."""
    # Read the message length (first 4 bytes)
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None

    # Unpack message length
    message_length = struct.unpack('=I', raw_length)[0]

    # Read the message
    message = sys.stdin.buffer.read(message_length).decode('utf-8')

    return json.loads(message)


def send_message(message):
    """Send a message to stdout (back to extension)."""
    encoded_message = json.dumps(message).encode('utf-8')
    encoded_length = struct.pack('=I', len(encoded_message))

    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_message)
    sys.stdout.buffer.flush()


def format_markdown_entry(entry, screenshot_path=None, file_path=None):
    """Format entry data as markdown with consistent structure.

    Format: - `type` | `source` | `timestamp` | [Title](URL) | `group: Name (color)`
    """
    lines = []

    # Extract fields
    title = entry.get('title', 'Untitled')
    url = entry.get('url', '')  # URL is now separate from source
    entry_type = entry['type']
    timestamp = entry['captured']
    source = entry.get('source', 'browser')  # 'browser' or 'widget'

    # Build main line: type | source | timestamp | title (with optional URL) | optional group
    main_line = f"- `{entry_type}` | `{source}` | `{timestamp}` | "

    # Add title with URL only if URL exists and is a valid URL (not a filename)
    if url and url.startswith(('http://', 'https://', 'file://', 'chrome-extension://')):
        main_line += f"[{title}]({url})"
    else:
        main_line += title

    # Add tab group if present
    tab_group = entry.get('tabGroup')
    if tab_group:
        group_name = tab_group.get('groupName', '')
        group_color = tab_group.get('groupColor', '')

        if group_name:
            main_line += f" | `group: {group_name} ({group_color})`"
        elif group_color:
            main_line += f" | `group: ({group_color})`"

    lines.append(main_line)

    # Add selected text as blockquote (if present)
    selected_text = entry.get('selectedText', '').strip()
    if selected_text:
        # Clean up and format as blockquote
        text_lines = [line.strip() for line in selected_text.split('\n') if line.strip()]
        if len(text_lines) <= 5:
            for line in text_lines:
                lines.append(f"  - > {line}")
        else:
            for line in text_lines[:5]:
                lines.append(f"  - > {line}")
            lines.append(f"  - > _(... {len(text_lines) - 5} more lines)_")

    # Add screenshot image reference
    if screenshot_path:
        lines.append(f"  - ![Screenshot]({screenshot_path})")

    # Add file attachment link
    if file_path:
        lines.append(f"  - [Attachment]({file_path})")

    # Add notes (user commentary) if present
    notes = entry.get('notes', '').strip()
    if notes:
        # Clean up and prefix with "Notes:"
        note_lines = [line.strip() for line in notes.split('\n') if line.strip()]
        if len(note_lines) == 1:
            lines.append(f"  - Notes: {note_lines[0]}")
        else:
            lines.append(f"  - Notes: {note_lines[0]}")
            for line in note_lines[1:5]:
                lines.append(f"    {line}")
            if len(note_lines) > 5:
                lines.append(f"    _(... {len(note_lines) - 5} more lines)_")

    lines.append('')  # Single blank line between entries

    return '\n'.join(lines)


def save_screenshot(project_folder, screenshot_data_url, timestamp):
    """Save screenshot image to file."""
    log_file = Path(__file__).parent / 'host.log'
    try:
        # Create screenshots folder if it doesn't exist
        folder_path = Path(project_folder)
        screenshots_folder = folder_path / 'screenshots'
        screenshots_folder.mkdir(exist_ok=True)

        # Extract base64 data from data URL (format: data:image/png;base64,...)
        if ',' in screenshot_data_url:
            base64_data = screenshot_data_url.split(',', 1)[1]
        else:
            base64_data = screenshot_data_url

        # Decode base64 to binary
        image_data = base64.b64decode(base64_data)

        # Generate filename from timestamp
        filename = f"screenshot_{timestamp.replace(' ', '_').replace(':', '-')}.png"
        screenshot_path = screenshots_folder / filename

        # Save image file
        with open(screenshot_path, 'wb') as f:
            f.write(image_data)

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Screenshot saved: {screenshot_path}\n")

        # Return relative path for markdown
        return f"screenshots/{filename}"

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Screenshot error: {str(e)}\n")
        return None


def save_file(project_folder, file_data_url, filename, timestamp):
    """Save uploaded file to /files folder."""
    log_file = Path(__file__).parent / 'host.log'
    try:
        # Create files folder if it doesn't exist
        folder_path = Path(project_folder)
        files_folder = folder_path / 'files'
        files_folder.mkdir(exist_ok=True)

        # Extract base64 data from data URL (format: data:mime/type;base64,...)
        if ',' in file_data_url:
            base64_data = file_data_url.split(',', 1)[1]
        else:
            base64_data = file_data_url

        # Decode base64 to binary
        file_data = base64.b64decode(base64_data)

        # Generate filename with timestamp to avoid collisions
        name_parts = filename.rsplit('.', 1)
        if len(name_parts) == 2:
            base_name, extension = name_parts
            safe_filename = f"{base_name}_{timestamp.replace(' ', '_').replace(':', '-')}.{extension}"
        else:
            safe_filename = f"{filename}_{timestamp.replace(' ', '_').replace(':', '-')}"

        file_path = files_folder / safe_filename

        # Save file
        with open(file_path, 'wb') as f:
            f.write(file_data)

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: File saved: {file_path}\n")

        # Return relative path for markdown
        return f"files/{safe_filename}"

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: File save error: {str(e)}\n")
        return None


def append_to_kb(project_folder, entry):
    """Append entry to kb.md file (at the top)."""
    try:
        # Ensure project folder exists
        folder_path = Path(project_folder)
        if not folder_path.exists():
            return {'success': False, 'error': f'Project folder does not exist: {project_folder}'}

        kb_file = folder_path / 'kb.md'

        # Handle screenshot if present (browser screenshot capture)
        screenshot_path = None
        if entry.get('type') == 'screenshot' and 'screenshot' in entry:
            screenshot_path = save_screenshot(
                project_folder,
                entry['screenshot'],
                entry['captured']
            )
            if not screenshot_path:
                return {'success': False, 'error': 'Failed to save screenshot'}

        # Handle file data if present (files, audio, images, etc.)
        file_path = None
        if 'fileData' in entry:
            file_path = save_file(
                project_folder,
                entry['fileData'],
                entry['title'],  # Use title as filename
                entry['captured']
            )
            if not file_path:
                return {'success': False, 'error': 'Failed to save file'}

        # Format the new entry
        new_content = format_markdown_entry(entry, screenshot_path, file_path)

        # Read existing content if file exists
        existing_content = ''
        if kb_file.exists():
            with open(kb_file, 'r', encoding='utf-8') as f:
                existing_content = f.read()

        # Write new entry at top, followed by existing content
        with open(kb_file, 'w', encoding='utf-8') as f:
            f.write(new_content)
            if existing_content:
                f.write(existing_content)

        return {'success': True, 'file': str(kb_file)}

    except Exception as e:
        return {'success': False, 'error': str(e)}


def update_last_entry(project_folder, timestamp, new_content):
    """Update the content of the most recent entry with matching timestamp."""
    try:
        folder_path = Path(project_folder)
        if not folder_path.exists():
            return {'success': False, 'error': f'Project folder does not exist: {project_folder}'}

        kb_file = folder_path / 'kb.md'

        if not kb_file.exists():
            return {'success': False, 'error': 'kb.md file does not exist'}

        # Read the entire file
        with open(kb_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Find the entry with matching timestamp and update its content
        updated = False
        i = 0
        while i < len(lines):
            line = lines[i]

            # Check if this line contains the timestamp we're looking for
            if f'`{timestamp}`' in line:
                # Found the entry - now look for content lines (indented with '  - ')
                # Skip until we find content or hit the next entry
                j = i + 1
                content_found = False

                # Look ahead to find where content starts
                while j < len(lines):
                    if lines[j].startswith('  - ') and not lines[j].startswith('  - ![') and not lines[j].startswith('  - [📎'):
                        # Found content line - replace it
                        if not content_found:
                            lines[j] = f'  - {new_content}\n'
                            content_found = True
                            updated = True
                        else:
                            # Remove additional old content lines
                            lines.pop(j)
                            continue
                    elif lines[j].startswith('- ') or (j + 1 < len(lines) and lines[j].strip() == ''):
                        # Hit next entry or blank line separator
                        break
                    j += 1

                # If no content was found, insert it after the main line
                if not content_found and new_content.strip():
                    # Find where to insert (after screenshot/file link if present)
                    insert_pos = i + 1
                    while insert_pos < len(lines) and (lines[insert_pos].startswith('  - ![') or lines[insert_pos].startswith('  - [📎')):
                        insert_pos += 1
                    lines.insert(insert_pos, f'  - {new_content}\n')
                    updated = True

                break

            i += 1

        if updated:
            # Write back to file
            with open(kb_file, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            return {'success': True, 'message': 'Entry updated'}
        else:
            return {'success': False, 'error': f'Entry with timestamp {timestamp} not found'}

    except Exception as e:
        return {'success': False, 'error': str(e)}


def launch_widget():
    """Launch the desktop widget in a separate process."""
    import subprocess
    widget_path = Path(__file__).parent / 'widget.pyw'

    if not widget_path.exists():
        return {'success': False, 'error': 'Widget not found'}

    try:
        # Launch with pythonw (no console window)
        subprocess.Popen(
            ['pythonw', str(widget_path)],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True
        )
        return {'success': True}
    except FileNotFoundError:
        # Try with python if pythonw not found
        try:
            subprocess.Popen(
                ['python', str(widget_path)],
                creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                close_fds=True
            )
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': f'Failed to launch: {str(e)}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def close_widget():
    """Close the desktop widget by finding and terminating the process."""
    import subprocess
    try:
        # Find and kill pythonw processes running widget.pyw
        result = subprocess.run(
            ['taskkill', '/F', '/IM', 'pythonw.exe', '/FI', 'WINDOWTITLE eq UltraThink*'],
            capture_output=True,
            text=True
        )
        # Also try killing by window title using powershell
        subprocess.run(
            ['powershell', '-Command',
             "Get-Process | Where-Object {$_.MainWindowTitle -like '*UltraThink*'} | Stop-Process -Force"],
            capture_output=True
        )
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def main():
    """Main loop for native messaging."""
    # Log to file for debugging (optional)
    log_file = Path(__file__).parent / 'host.log'

    try:
        while True:
            # Read message from extension
            message = read_message()

            if message is None:
                break

            # Debug logging
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: Received message: {json.dumps(message)}\n")

            # Handle the message
            if message.get('action') == 'append':
                project_folder = message.get('projectFolder')
                entry = message.get('entry')

                result = append_to_kb(project_folder, entry)
                send_message(result)
            elif message.get('action') == 'update_last_entry':
                project_folder = message.get('projectFolder')
                timestamp = message.get('timestamp')
                new_content = message.get('newContent')

                result = update_last_entry(project_folder, timestamp, new_content)
                send_message(result)
            elif message.get('action') == 'launch_widget':
                result = launch_widget()
                send_message(result)
            elif message.get('action') == 'close_widget':
                result = close_widget()
                send_message(result)
            else:
                send_message({'success': False, 'error': 'Unknown action'})

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Error: {str(e)}\n")
        send_message({'success': False, 'error': str(e)})


if __name__ == '__main__':
    main()
