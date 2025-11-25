#!/usr/bin/env python3
# Run with: python3 kb-server.py
"""
HTTP server for Ultrathink Knowledge Base viewer.
Run: python3 kb-server.py
Opens browser to http://localhost:8080
"""

import http.server
import json
import os
import re
import webbrowser
import mimetypes
from pathlib import Path
from urllib.parse import urlparse, unquote

PORT = 8080
PROJECT_FOLDER = Path(__file__).parent

# Regex patterns for parsing kb.md
# Matches: - **[Title](URL)** - `type` - `timestamp`
# Or: - **Title** - `type` - `timestamp`
ENTRY_PATTERN = re.compile(
    r'^- \*\*(?:\[([^\]]+)\]\(([^)]+)\)|([^*]+))\*\* - `([^`]+)` - `([^`]+)`(?: - `group: ([^`]+)`)?$'
)

# Content line pattern (indented with "  - ")
CONTENT_PATTERN = re.compile(r'^  - (.+)$')

# Screenshot image pattern
SCREENSHOT_PATTERN = re.compile(r'!\[Screenshot\]\(([^)]+)\)')

# File attachment pattern
FILE_PATTERN = re.compile(r'\[.+\]\(([^)]+)\)')


def parse_kb_markdown(content):
    """Parse kb.md content into list of entry objects."""
    entries = []
    lines = content.split('\n')
    current_entry = None

    for line in lines:
        # Try to match main entry line
        match = ENTRY_PATTERN.match(line)
        if match:
            # Save previous entry
            if current_entry:
                entries.append(current_entry)

            # Extract fields from regex groups
            title_linked = match.group(1)
            url = match.group(2)
            title_plain = match.group(3)
            entry_type = match.group(4)
            timestamp = match.group(5)
            group = match.group(6)

            current_entry = {
                'title': (title_linked or title_plain or '').strip(),
                'url': url or '',
                'type': entry_type,
                'timestamp': timestamp,
                'group': group.split('(')[0].strip() if group else '',
                'content': '',
                'screenshot': '',
                'file': ''
            }

        # Match content lines
        elif current_entry:
            content_match = CONTENT_PATTERN.match(line)
            if content_match:
                content_line = content_match.group(1)

                # Check for screenshot
                screenshot_match = SCREENSHOT_PATTERN.match(content_line)
                if screenshot_match:
                    current_entry['screenshot'] = screenshot_match.group(1)
                # Check for file attachment
                elif content_line.startswith('['):
                    file_match = FILE_PATTERN.match(content_line)
                    if file_match:
                        current_entry['file'] = file_match.group(1)
                # Regular content
                else:
                    if current_entry['content']:
                        current_entry['content'] += '\n'
                    current_entry['content'] += content_line

    # Don't forget last entry
    if current_entry:
        entries.append(current_entry)

    return entries


def delete_entry(timestamp):
    """Delete entry with matching timestamp from kb.md and associated files."""
    kb_file = PROJECT_FOLDER / 'kb.md'
    if not kb_file.exists():
        return {'success': False, 'error': 'kb.md not found'}

    with open(kb_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Find and remove entry with matching timestamp
    new_lines = []
    skip_until_next_entry = False
    deleted = False
    files_to_delete = []

    for i, line in enumerate(lines):
        # Check if this is a new entry
        if line.startswith('- **'):
            skip_until_next_entry = False

            # Check if this entry has the timestamp we want to delete
            if f'`{timestamp}`' in line:
                skip_until_next_entry = True
                deleted = True
                continue

        # Collect file paths to delete and skip content lines of deleted entry
        if skip_until_next_entry:
            if line.startswith('  - '):
                # Extract screenshot path
                screenshot_match = SCREENSHOT_PATTERN.search(line)
                if screenshot_match:
                    files_to_delete.append(screenshot_match.group(1))

                # Extract file path
                file_match = FILE_PATTERN.search(line)
                if file_match:
                    files_to_delete.append(file_match.group(1))

                continue
            elif line.strip() == '':
                continue

        new_lines.append(line)

    if deleted:
        # Delete associated files
        for file_path in files_to_delete:
            full_path = PROJECT_FOLDER / file_path
            if full_path.exists():
                try:
                    full_path.unlink()
                except Exception as e:
                    print(f"Warning: Could not delete {file_path}: {e}")

        # Write updated kb.md
        with open(kb_file, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

        return {'success': True, 'deleted_files': files_to_delete}
    else:
        return {'success': False, 'error': f'Entry with timestamp {timestamp} not found'}


class KBHandler(http.server.BaseHTTPRequestHandler):
    """Custom HTTP handler for KB API and static file serving."""

    def send_json(self, data, status=200):
        """Send JSON response with CORS headers."""
        content = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(content)

    def send_file(self, file_path):
        """Serve a static file."""
        if not file_path.exists():
            self.send_error(404, 'File not found')
            return

        mime_type, _ = mimetypes.guess_type(str(file_path))
        if mime_type is None:
            mime_type = 'application/octet-stream'

        with open(file_path, 'rb') as f:
            content = f.read()

        self.send_response(200)
        self.send_header('Content-Type', mime_type)
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == '/api/entries':
            # Return parsed kb.md entries
            kb_file = PROJECT_FOLDER / 'kb.md'
            if not kb_file.exists():
                self.send_json([])
                return

            with open(kb_file, 'r', encoding='utf-8') as f:
                content = f.read()

            entries = parse_kb_markdown(content)
            self.send_json(entries)

        elif path == '/' or path == '/kb-viewer.html':
            # Serve main HTML page
            self.send_file(PROJECT_FOLDER / 'kb-viewer.html')

        elif path == '/kb-viewer.js':
            # Serve JavaScript file
            self.send_file(PROJECT_FOLDER / 'kb-viewer.js')

        elif path.startswith('/screenshots/'):
            # Serve screenshot files
            self.send_file(PROJECT_FOLDER / path[1:])

        elif path.startswith('/files/'):
            # Serve uploaded files
            self.send_file(PROJECT_FOLDER / path[1:])

        else:
            self.send_error(404, 'Not found')

    def do_DELETE(self):
        """Handle DELETE requests."""
        parsed = urlparse(self.path)

        if parsed.path == '/api/entries':
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length))
            timestamp = body.get('timestamp')

            if timestamp:
                result = delete_entry(timestamp)
                self.send_json(result)
            else:
                self.send_json({'success': False, 'error': 'Missing timestamp'}, 400)
        else:
            self.send_error(404, 'Not found')

    def log_message(self, format, *args):
        """Suppress default logging for cleaner output."""
        pass


def main():
    """Start the HTTP server and open browser."""
    os.chdir(PROJECT_FOLDER)

    # Check if kb-viewer.html exists
    viewer_file = PROJECT_FOLDER / 'kb-viewer.html'
    if not viewer_file.exists():
        print(f"Error: kb-viewer.html not found in {PROJECT_FOLDER}")
        return

    with http.server.HTTPServer(('', PORT), KBHandler) as server:
        url = f'http://localhost:{PORT}'
        print(f'Ultrathink KB Viewer running at {url}')
        print('Press Ctrl+C to stop')

        # Open browser
        webbrowser.open(url)

        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nServer stopped')


if __name__ == '__main__':
    main()
