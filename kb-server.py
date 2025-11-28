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
import time
import webbrowser
import mimetypes
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote, parse_qs

PORT = 8080

# Cache for project folder (loaded once at startup)
_PROJECT_FOLDER_CACHE = None


def get_project_folder():
    """Get project folder from settings.json (single source of truth)."""
    global _PROJECT_FOLDER_CACHE
    if _PROJECT_FOLDER_CACHE is not None:
        return _PROJECT_FOLDER_CACHE

    # Try to load from settings.json
    settings_path = Path(__file__).parent / 'native-host' / 'settings.json'
    if settings_path.exists():
        try:
            with open(settings_path, 'r') as f:
                settings = json.load(f)
                folder = settings.get('project_folder')
                if folder:
                    _PROJECT_FOLDER_CACHE = Path(folder)
                    return _PROJECT_FOLDER_CACHE
        except Exception:
            pass

    # Fallback to script's parent directory
    _PROJECT_FOLDER_CACHE = Path(__file__).parent
    return _PROJECT_FOLDER_CACHE


# In-memory log store for API calls (max 500 entries, FIFO)
API_LOGS = []
MAX_LOGS = 500


def add_log(service, action, status, details=None, duration_ms=None, request_data=None, response_data=None):
    """Add entry to in-memory log store for real-time monitoring."""
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'service': service,       # 'openai', 'github', 'notion', etc.
        'action': action,         # 'search', 'summarize', 'classify', etc.
        'status': status,         # 'success', 'error', 'timeout'
        'details': details,       # Brief message
        'duration_ms': duration_ms,
        'request': request_data,  # Request info
        'response': response_data  # Response info
    }
    API_LOGS.insert(0, log_entry)  # Newest first
    if len(API_LOGS) > MAX_LOGS:
        API_LOGS.pop()


# Regex patterns for parsing kb.md
# NEW format: - `type` | `source` | `timestamp` | Title
# Or with URL: - `type` | `source` | `timestamp` | [Title](URL)
NEW_ENTRY_PATTERN = re.compile(
    r'^- `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| (?:\[([^\]]+)\]\(([^)]+)\)|(.+))$'
)

# OLD format (for backwards compatibility):
# Matches: - **[Title](URL)** - `type` - `timestamp`
# Or: - **Title** - `type` - `timestamp`
OLD_ENTRY_PATTERN = re.compile(
    r'^- \*\*(?:\[([^\]]+)\]\(([^)]+)\)|([^*]+))\*\* - `([^`]+)` - `([^`]+)`(?: - `group: ([^`]+)`)?$'
)

# Content line pattern (indented with "  - ")
CONTENT_PATTERN = re.compile(r'^  - (.+)$')

# Screenshot image pattern
SCREENSHOT_PATTERN = re.compile(r'!\[Screenshot\]\(([^)]+)\)')

# File attachment pattern
FILE_PATTERN = re.compile(r'\[.+\]\(([^)]+)\)')

# Notes pattern (for new format)
NOTES_PATTERN = re.compile(r'^  - Notes: (.+)$')

# AI metadata patterns
ENTITY_PATTERN = re.compile(r'^  - Entity: (.+)$')
TOPICS_PATTERN = re.compile(r'^  - Topics: (.+)$')
PEOPLE_PATTERN = re.compile(r'^  - People: (.+)$')

# Page metadata patterns
DESCRIPTION_PATTERN = re.compile(r'^  - Description: (.+)$')
IMAGE_PATTERN = re.compile(r'^  - Image: (.+)$')
AUTHOR_PATTERN = re.compile(r'^  - Author: (.+)$')
PUBLISHED_PATTERN = re.compile(r'^  - Published: (.+)$')
READTIME_PATTERN = re.compile(r'^  - ReadTime: (\d+) min$')

# Task status pattern
TASKSTATUS_PATTERN = re.compile(r'^  - Status: (.+)$')

# Category pattern (work/personal)
CATEGORY_PATTERN = re.compile(r'^  - Category: (.+)$')


def parse_kb_markdown(content):
    """Parse kb.md content into list of entry objects.

    Supports both new format: - `type` | `source` | `timestamp` | Title
    And old format: - **[Title](URL)** - `type` - `timestamp`
    """
    entries = []
    lines = content.split('\n')
    current_entry = None

    for line in lines:
        # Try NEW format first: - `type` | `source` | `timestamp` | Title
        new_match = NEW_ENTRY_PATTERN.match(line)
        if new_match:
            # Save previous entry
            if current_entry:
                entries.append(current_entry)

            # Extract fields from regex groups
            entry_type = new_match.group(1)
            source = new_match.group(2)
            timestamp = new_match.group(3)
            title_linked = new_match.group(4)  # Title if linked
            url = new_match.group(5)           # URL if linked
            title_plain = new_match.group(6)   # Title if not linked

            current_entry = {
                'title': (title_linked or title_plain or '').strip(),
                'url': url or '',
                'type': entry_type,
                'source': source,
                'timestamp': timestamp,
                'group': '',
                'content': '',
                'selectedText': '',  # Blockquoted text (snippets)
                'screenshot': '',
                'file': '',
                'entity': '',
                'topics': [],
                'people': [],
                'category': '',  # work or personal
                # Page metadata (optional)
                'description': '',
                'ogImage': '',
                'author': '',
                'publishedDate': '',
                'readingTime': 0,
                'aiSummary': '',
                'taskStatus': ''  # For kanban board (not-started, in-progress, done, or custom)
            }
            continue

        # Try OLD format: - **[Title](URL)** - `type` - `timestamp`
        old_match = OLD_ENTRY_PATTERN.match(line)
        if old_match:
            # Save previous entry
            if current_entry:
                entries.append(current_entry)

            # Extract fields from regex groups
            title_linked = old_match.group(1)
            url = old_match.group(2)
            title_plain = old_match.group(3)
            entry_type = old_match.group(4)
            timestamp = old_match.group(5)
            group = old_match.group(6)

            current_entry = {
                'title': (title_linked or title_plain or '').strip(),
                'url': url or '',
                'type': entry_type,
                'source': 'browser',  # Default for old format
                'timestamp': timestamp,
                'group': group.split('(')[0].strip() if group else '',
                'content': '',
                'selectedText': '',  # Blockquoted text (snippets)
                'screenshot': '',
                'file': '',
                'entity': '',
                'topics': [],
                'people': [],
                'category': '',  # work or personal
                # Page metadata (optional)
                'description': '',
                'ogImage': '',
                'author': '',
                'publishedDate': '',
                'readingTime': 0,
                'aiSummary': '',
                'taskStatus': ''  # For kanban board
            }
            continue

        # Match content lines (indented with "  - ")
        if current_entry:
            content_match = CONTENT_PATTERN.match(line)
            # Also check for continuation lines (indented with 4 spaces, no "- ")
            continuation_match = re.match(r'^    ([^-].*)$', line)

            if continuation_match and current_entry.get('_in_notes'):
                # Continuation of multi-line notes
                cont_line = continuation_match.group(1).strip()
                if cont_line and not cont_line.startswith('_('):  # Skip truncation markers
                    current_entry['content'] += '\n' + cont_line
            elif content_match:
                content_line = content_match.group(1)
                current_entry['_in_notes'] = False  # Reset multi-line flag

                # Check for Notes: prefix (new format)
                if content_line.startswith('Notes: '):
                    current_entry['content'] = content_line[7:]  # Remove "Notes: " prefix
                    current_entry['_in_notes'] = True  # May have continuation lines
                # Check for Entity: metadata
                elif content_line.startswith('Entity: '):
                    current_entry['entity'] = content_line[8:]  # Remove "Entity: " prefix
                # Check for Topics: metadata
                elif content_line.startswith('Topics: '):
                    topics_str = content_line[8:]  # Remove "Topics: " prefix
                    current_entry['topics'] = [t.strip() for t in topics_str.split(',')]
                # Check for People: metadata
                elif content_line.startswith('People: '):
                    people_str = content_line[8:]  # Remove "People: " prefix
                    current_entry['people'] = [p.strip() for p in people_str.split(',')]
                # Check for page metadata fields
                elif content_line.startswith('Description: '):
                    current_entry['description'] = content_line[13:]
                elif content_line.startswith('Image: '):
                    current_entry['ogImage'] = content_line[7:]
                elif content_line.startswith('Author: '):
                    current_entry['author'] = content_line[8:]
                elif content_line.startswith('Published: '):
                    current_entry['publishedDate'] = content_line[11:]
                elif content_line.startswith('ReadTime: '):
                    # Parse "X min" format
                    rt_match = re.match(r'(\d+) min', content_line[10:])
                    if rt_match:
                        current_entry['readingTime'] = int(rt_match.group(1))
                # Check for AI Summary
                elif content_line.startswith('AI Summary: '):
                    current_entry['aiSummary'] = content_line[12:]
                # Check for Status (task kanban status)
                elif content_line.startswith('Status: '):
                    current_entry['taskStatus'] = content_line[8:]
                # Check for Category (work/personal)
                elif content_line.startswith('Category: '):
                    current_entry['category'] = content_line[10:]
                # Check for screenshot
                elif SCREENSHOT_PATTERN.match(content_line):
                    screenshot_match = SCREENSHOT_PATTERN.match(content_line)
                    current_entry['screenshot'] = screenshot_match.group(1)
                # Check for file attachment
                elif content_line.startswith('[') or content_line.startswith('!['):
                    file_match = FILE_PATTERN.search(content_line)
                    if file_match:
                        current_entry['file'] = file_match.group(1)
                # Check for blockquote content (snippet selected text with >)
                elif content_line.startswith('> '):
                    text = content_line[2:]  # Remove "> " prefix
                    if current_entry['selectedText']:
                        current_entry['selectedText'] += '\n'
                    current_entry['selectedText'] += text
                # Check for bold content (long-note format with **)
                elif content_line.startswith('**'):
                    text = content_line.strip('*').strip()
                    if current_entry['content']:
                        current_entry['content'] += '\n'
                    current_entry['content'] += text
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
    kb_file = get_project_folder() / 'kb.md'
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
        # Check if this is a new entry (new format starts with "- `", old format with "- **")
        if line.startswith('- `') or line.startswith('- **'):
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
            full_path = get_project_folder() / file_path
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


def update_entry_status(timestamp, status):
    """Update task status for entry with matching timestamp in kb.md."""
    kb_file = get_project_folder() / 'kb.md'
    if not kb_file.exists():
        return {'success': False, 'error': 'kb.md not found'}

    with open(kb_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    found_entry = False
    in_target_entry = False
    status_updated = False
    entry_content_lines = []

    for i, line in enumerate(lines):
        # Check if this is a new entry
        if line.startswith('- `') or line.startswith('- **'):
            # If we were in target entry but didn't update status, add it now
            if in_target_entry and not status_updated:
                # Add status line before the entry ends
                new_lines.extend(entry_content_lines)
                new_lines.append(f'  - Status: {status}\n')
                status_updated = True
                entry_content_lines = []

            in_target_entry = False

            # Check if this entry has the timestamp we want
            if f'`{timestamp}`' in line:
                found_entry = True
                in_target_entry = True
                new_lines.append(line)
                continue

        if in_target_entry:
            # Check if this is a content line (starts with "  - ")
            if line.startswith('  - '):
                # Check if this is the status line
                if line.startswith('  - Status: '):
                    # Replace existing status
                    new_lines.append(f'  - Status: {status}\n')
                    status_updated = True
                else:
                    entry_content_lines.append(line)
            elif line.strip() == '' or line.startswith('- `') or line.startswith('- **'):
                # Entry ended - add status if not updated
                if not status_updated:
                    new_lines.extend(entry_content_lines)
                    new_lines.append(f'  - Status: {status}\n')
                    status_updated = True
                    entry_content_lines = []
                new_lines.append(line)
                in_target_entry = False
            else:
                entry_content_lines.append(line)
        else:
            new_lines.append(line)

    # Handle case where target entry is at end of file
    if in_target_entry and not status_updated:
        new_lines.extend(entry_content_lines)
        new_lines.append(f'  - Status: {status}\n')
        status_updated = True

    if found_entry:
        with open(kb_file, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        return {'success': True}
    else:
        return {'success': False, 'error': f'Entry with timestamp {timestamp} not found'}


def search_github(query, github_token, org=None, repos=None, max_results=10):
    """
    Search GitHub for issues and commits related to a query.

    Args:
        query: Search query string
        github_token: GitHub Personal Access Token
        org: Organization name to search within (e.g., "Fifty-Five-and-Five")
        repos: Comma-separated list of repos (e.g., "owner/repo1, owner/repo2")
        max_results: Maximum results per search type

    Returns:
        dict with success, issues, commits, and optional error
    """
    if not github_token:
        return {'success': False, 'error': 'GitHub token not configured'}

    if not query or not query.strip():
        return {'success': False, 'error': 'Search query is empty'}

    results = {
        'success': True,
        'repositories': [],
        'code': [],
        'issues': [],
        'commits': [],
        'query': query
    }

    headers = {
        'Authorization': f'Bearer {github_token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'UltraThink-KB-Server'
    }

    # Build query with org or repo filter
    base_query = query.strip()

    # Prefer org filter if set, otherwise use repos
    if org and org.strip():
        base_query = f'{base_query} org:{org.strip()}'
    elif repos:
        repo_list = [r.strip() for r in repos.split(',') if r.strip()]
        if repo_list:
            repo_filter = ' '.join([f'repo:{r}' for r in repo_list])
            base_query = f'{base_query} {repo_filter}'

    # Search repositories (use original query for repo search, org filter doesn't work the same way)
    try:
        repo_query = query.strip()
        if org and org.strip():
            repo_query = f'{repo_query} org:{org.strip()}'
        repos_url = f'https://api.github.com/search/repositories?q={urllib.parse.quote(repo_query)}&per_page={max_results}&sort=updated'
        req = urllib.request.Request(repos_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            repos_data = json.loads(response.read().decode('utf-8'))

        for item in repos_data.get('items', [])[:max_results]:
            results['repositories'].append({
                'name': item.get('name'),
                'full_name': item.get('full_name'),
                'description': (item.get('description') or '')[:200],
                'url': item.get('html_url'),
                'language': item.get('language'),
                'stars': item.get('stargazers_count', 0),
                'updated_at': item.get('updated_at')
            })
    except urllib.error.HTTPError as e:
        print(f'GitHub repos search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'GitHub repos search error: {e}')

    # Search code (files)
    try:
        code_url = f'https://api.github.com/search/code?q={urllib.parse.quote(base_query)}&per_page={max_results}'
        req = urllib.request.Request(code_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            code_data = json.loads(response.read().decode('utf-8'))

        for item in code_data.get('items', [])[:max_results]:
            results['code'].append({
                'name': item.get('name'),
                'path': item.get('path'),
                'url': item.get('html_url'),
                'repo': item.get('repository', {}).get('full_name', ''),
                'sha': item.get('sha', '')[:7]
            })
    except urllib.error.HTTPError as e:
        print(f'GitHub code search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'GitHub code search error: {e}')

    # Search issues
    try:
        issues_url = f'https://api.github.com/search/issues?q={urllib.parse.quote(base_query)}&per_page={max_results}&sort=updated'
        req = urllib.request.Request(issues_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            issues_data = json.loads(response.read().decode('utf-8'))

        for item in issues_data.get('items', [])[:max_results]:
            results['issues'].append({
                'number': item.get('number'),
                'title': item.get('title'),
                'state': item.get('state'),
                'url': item.get('html_url'),
                'repo': item.get('repository_url', '').split('/')[-1] if item.get('repository_url') else '',
                'labels': [l.get('name') for l in item.get('labels', [])],
                'created_at': item.get('created_at'),
                'updated_at': item.get('updated_at'),
                'body_preview': (item.get('body') or '')[:200]
            })
    except urllib.error.HTTPError as e:
        print(f'GitHub issues search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'GitHub issues search error: {e}')

    # Search commits
    try:
        commits_url = f'https://api.github.com/search/commits?q={urllib.parse.quote(base_query)}&per_page={max_results}&sort=committer-date'
        req = urllib.request.Request(commits_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            commits_data = json.loads(response.read().decode('utf-8'))

        for item in commits_data.get('items', [])[:max_results]:
            commit = item.get('commit', {})
            results['commits'].append({
                'sha': item.get('sha', '')[:7],
                'message': commit.get('message', '').split('\n')[0][:100],
                'url': item.get('html_url'),
                'repo': item.get('repository', {}).get('full_name', ''),
                'author': commit.get('author', {}).get('name', ''),
                'date': commit.get('committer', {}).get('date', '')
            })
    except urllib.error.HTTPError as e:
        print(f'GitHub commits search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'GitHub commits search error: {e}')

    return results


def search_notion(query, notion_token, max_results=10):
    """
    Search Notion pages shared with the integration.

    Args:
        query: Search query string
        notion_token: Notion internal integration token
        max_results: Maximum results to return

    Returns:
        dict with success, results, and optional error
    """
    if not notion_token:
        return {'success': False, 'error': 'Notion token not configured'}

    if not query or not query.strip():
        return {'success': False, 'error': 'Search query is empty'}

    headers = {
        'Authorization': f'Bearer {notion_token}',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    }

    results = {
        'success': True,
        'pages': [],
        'databases': [],
        'query': query
    }

    try:
        # POST to /v1/search
        search_url = 'https://api.notion.com/v1/search'
        request_body = json.dumps({
            'query': query.strip(),
            'page_size': max_results
        }).encode('utf-8')

        req = urllib.request.Request(search_url, data=request_body, headers=headers, method='POST')

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        for item in data.get('results', []):
            obj_type = item.get('object')  # 'page' or 'database'

            # Extract title based on type
            title = ''
            if obj_type == 'page':
                # Page title is in properties.title or properties.Name
                props = item.get('properties', {})
                for prop_name, prop_value in props.items():
                    if prop_value.get('type') == 'title':
                        title_arr = prop_value.get('title', [])
                        if title_arr:
                            title = title_arr[0].get('plain_text', '')
                        break
                # Fallback: check parent for database name
                if not title:
                    parent = item.get('parent', {})
                    if parent.get('type') == 'database_id':
                        title = '(Untitled page)'
            elif obj_type == 'database':
                title_arr = item.get('title', [])
                if title_arr:
                    title = title_arr[0].get('plain_text', '')

            icon_data = item.get('icon') or {}
            entry = {
                'id': item.get('id'),
                'title': title or '(Untitled)',
                'url': item.get('url'),
                'last_edited': item.get('last_edited_time'),
                'icon': icon_data.get('emoji') if icon_data.get('type') == 'emoji' else None
            }

            if obj_type == 'page':
                results['pages'].append(entry)
            elif obj_type == 'database':
                results['databases'].append(entry)

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ''
        print(f'Notion search error: {e.code} {e.reason} - {error_body}')
        return {'success': False, 'error': f'Notion API error: {e.code} {e.reason}'}
    except Exception as e:
        print(f'Notion search error: {e}')
        return {'success': False, 'error': str(e)}

    return results


def search_fastmail(query, fastmail_token, max_results=10):
    """
    Search Fastmail emails using JMAP protocol.

    Args:
        query: Search query string
        fastmail_token: Fastmail API token
        max_results: Maximum number of results to return

    Returns:
        dict with success status and emails list
    """
    if not fastmail_token:
        return {'success': False, 'error': 'Fastmail token not configured'}

    if not query.strip():
        return {'success': False, 'error': 'Search query is required'}

    headers = {
        'Authorization': f'Bearer {fastmail_token}',
        'Content-Type': 'application/json'
    }

    try:
        # Step 1: Get session info to find API URL and account ID
        session_req = urllib.request.Request(
            'https://api.fastmail.com/jmap/session',
            headers=headers,
            method='GET'
        )

        with urllib.request.urlopen(session_req, timeout=30) as response:
            session = json.loads(response.read().decode('utf-8'))

        api_url = session.get('apiUrl')
        accounts = session.get('primaryAccounts', {})
        account_id = accounts.get('urn:ietf:params:jmap:mail')

        if not api_url or not account_id:
            return {'success': False, 'error': 'Could not get Fastmail session info'}

        # Step 2: JMAP request with Email/query + Email/get
        jmap_request = {
            'using': ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
            'methodCalls': [
                ['Email/query', {
                    'accountId': account_id,
                    'filter': {'text': query},
                    'sort': [{'property': 'receivedAt', 'isAscending': False}],
                    'limit': max_results
                }, '0'],
                ['Email/get', {
                    'accountId': account_id,
                    '#ids': {'resultOf': '0', 'name': 'Email/query', 'path': '/ids'},
                    'properties': [
                        'subject', 'from', 'to', 'cc', 'receivedAt',
                        'preview', 'hasAttachment', 'attachments'
                    ]
                }, '1']
            ]
        }

        jmap_req = urllib.request.Request(
            api_url,
            data=json.dumps(jmap_request).encode('utf-8'),
            headers=headers,
            method='POST'
        )

        with urllib.request.urlopen(jmap_req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        emails = []
        for method_response in data.get('methodResponses', []):
            if method_response[0] == 'Email/get':
                for email in method_response[1].get('list', []):
                    emails.append({
                        'id': email.get('id'),
                        'subject': email.get('subject', '(No subject)'),
                        'from': email.get('from', []),
                        'to': email.get('to', []),
                        'cc': email.get('cc', []),
                        'date': email.get('receivedAt'),
                        'preview': email.get('preview', ''),
                        'hasAttachment': email.get('hasAttachment', False),
                        'attachments': len(email.get('attachments') or [])
                    })

        return {'success': True, 'emails': emails, 'query': query}

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else ''
        print(f'Fastmail search error: {e.code} {e.reason} - {error_body}')
        return {'success': False, 'error': f'Fastmail API error: {e.code} {e.reason}'}
    except Exception as e:
        print(f'Fastmail search error: {e}')
        return {'success': False, 'error': str(e)}


def search_capsule(query, capsule_token, max_results=10):
    """
    Search Capsule CRM for parties, opportunities, tasks, and projects.

    Args:
        query: Search query string
        capsule_token: Capsule CRM API token
        max_results: Maximum number of results to return

    Returns:
        dict with success status and results for each entity type
    """
    if not capsule_token:
        return {'success': False, 'error': 'Capsule token not configured'}

    if not query.strip():
        return {'success': False, 'error': 'Search query is empty'}

    headers = {
        'Authorization': f'Bearer {capsule_token}',
        'Accept': 'application/json'
    }

    results = {
        'success': True,
        'parties': [],
        'opportunities': [],
        'tasks': [],
        'projects': [],
        'query': query
    }

    base_url = 'https://api.capsulecrm.com/api/v2'

    # 1. Search Parties (contacts/organisations)
    try:
        parties_url = f'{base_url}/parties/search?q={urllib.parse.quote(query)}&perPage={max_results}'
        req = urllib.request.Request(parties_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        for party in data.get('parties', [])[:max_results]:
            # Build name based on type
            if party.get('type') == 'person':
                name = f"{party.get('firstName', '')} {party.get('lastName', '')}".strip()
            else:
                name = party.get('name', '')

            # Get first email and phone if available
            emails = party.get('emailAddresses', [])
            phones = party.get('phoneNumbers', [])

            results['parties'].append({
                'id': party.get('id'),
                'type': party.get('type'),
                'name': name or '(Unnamed)',
                'email': emails[0].get('address', '') if emails else '',
                'phone': phones[0].get('number', '') if phones else '',
                'url': f"https://app.capsulecrm.com/party/{party.get('id')}"
            })
    except urllib.error.HTTPError as e:
        print(f'Capsule parties search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'Capsule parties search error: {e}')

    # 2. Search Opportunities
    try:
        opps_url = f'{base_url}/opportunities/search?q={urllib.parse.quote(query)}&perPage={max_results}'
        req = urllib.request.Request(opps_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        for opp in data.get('opportunities', [])[:max_results]:
            value_obj = opp.get('value') or {}
            results['opportunities'].append({
                'id': opp.get('id'),
                'name': opp.get('name', ''),
                'description': (opp.get('description') or '')[:200],
                'value': value_obj.get('amount'),
                'currency': value_obj.get('currency'),
                'milestone': (opp.get('milestone') or {}).get('name', ''),
                'party_name': (opp.get('party') or {}).get('name', ''),
                'expected_close': opp.get('expectedCloseOn'),
                'url': f"https://app.capsulecrm.com/opportunity/{opp.get('id')}"
            })
    except urllib.error.HTTPError as e:
        print(f'Capsule opportunities search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'Capsule opportunities search error: {e}')

    # 3. List Tasks (no search endpoint - get open tasks and filter)
    try:
        tasks_url = f'{base_url}/tasks?perPage={max_results}&status=open&embed=party'
        req = urllib.request.Request(tasks_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        query_lower = query.lower()
        for task in data.get('tasks', []):
            desc = task.get('description', '')
            # Filter tasks by query in description
            if query_lower in desc.lower():
                results['tasks'].append({
                    'id': task.get('id'),
                    'description': desc,
                    'status': task.get('status', ''),
                    'due_on': task.get('dueOn'),
                    'category': (task.get('category') or {}).get('name', ''),
                    'party_name': (task.get('party') or {}).get('name', ''),
                    'url': f"https://app.capsulecrm.com/task/{task.get('id')}"
                })
                if len(results['tasks']) >= max_results:
                    break
    except urllib.error.HTTPError as e:
        print(f'Capsule tasks search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'Capsule tasks search error: {e}')

    # 4. Search Projects/Cases
    try:
        projects_url = f'{base_url}/kases/search?q={urllib.parse.quote(query)}&perPage={max_results}'
        req = urllib.request.Request(projects_url, headers=headers)

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        for proj in data.get('kases', [])[:max_results]:
            results['projects'].append({
                'id': proj.get('id'),
                'name': proj.get('name', ''),
                'description': (proj.get('description') or '')[:200],
                'status': proj.get('status', ''),
                'party_name': (proj.get('party') or {}).get('name', ''),
                'url': f"https://app.capsulecrm.com/kase/{proj.get('id')}"
            })
    except urllib.error.HTTPError as e:
        print(f'Capsule projects search error: {e.code} {e.reason}')
    except Exception as e:
        print(f'Capsule projects search error: {e}')

    return results


class KBHandler(http.server.BaseHTTPRequestHandler):
    """Custom HTTP handler for KB API and static file serving."""

    def send_json(self, data, status=200):
        """Send JSON response with CORS headers."""
        content = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == '/api/entries':
            # Return parsed kb.md entries
            kb_file = get_project_folder() / 'kb.md'
            if not kb_file.exists():
                self.send_json([])
                return

            with open(kb_file, 'r', encoding='utf-8') as f:
                content = f.read()

            entries = parse_kb_markdown(content)
            self.send_json(entries)

        elif path == '/api/topics':
            # Return all topics from topics.json
            topics_file = get_project_folder() / 'topics.json'
            if topics_file.exists():
                with open(topics_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self.send_json(data.get('topics', []))
            else:
                self.send_json([])

        elif path == '/api/entities':
            # Return all entities (people & roles) from entities.json
            entities_file = get_project_folder() / 'entities.json'
            if entities_file.exists():
                with open(entities_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self.send_json(data.get('entities', []))
            else:
                self.send_json([])

        elif path == '/api/logs':
            # Return API logs for real-time monitoring
            query_params = parse_qs(parsed.query)
            since = query_params.get('since', [None])[0]
            limit = int(query_params.get('limit', [100])[0])

            if since:
                # Return only logs newer than 'since' timestamp
                logs = [l for l in API_LOGS if l['timestamp'] > since]
            else:
                logs = API_LOGS[:limit]
            self.send_json(logs)

        elif path == '/api/settings':
            # Return settings from native-host/settings.json (masks sensitive tokens)
            settings_file = get_project_folder() / 'native-host' / 'settings.json'
            if settings_file.exists():
                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                # Mask tokens for display (same length as original, show last 4 chars)
                masked = {}
                for key, value in settings.items():
                    if 'token' in key.lower() or 'key' in key.lower():
                        if value and len(value) > 4:
                            masked[key] = '•' * (len(value) - 4) + value[-4:]
                        else:
                            masked[key] = value
                    else:
                        masked[key] = value
                self.send_json(masked)
            else:
                self.send_json({})

        elif path == '/api/kanban-columns':
            # Return kanban columns from kanban-columns.json
            # Default columns if file doesn't exist
            default_columns = [
                {'id': 'not-started', 'name': 'Not started', 'color': '#6b7280'},
                {'id': 'in-progress', 'name': 'In progress', 'color': '#3b82f6'},
                {'id': 'done', 'name': 'Done', 'color': '#22c55e'}
            ]
            columns_file = get_project_folder() / 'kanban-columns.json'
            if columns_file.exists():
                with open(columns_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                self.send_json(data.get('columns', default_columns))
            else:
                self.send_json(default_columns)

        elif path.startswith('/api/entries/'):
            # Return single entry by timestamp
            timestamp = unquote(path.split('/api/entries/')[1])
            kb_file = get_project_folder() / 'kb.md'
            if not kb_file.exists():
                self.send_json({'error': 'kb.md not found'}, 404)
                return

            with open(kb_file, 'r', encoding='utf-8') as f:
                content = f.read()

            entries = parse_kb_markdown(content)
            entry = next((e for e in entries if e['timestamp'] == timestamp), None)
            if entry:
                self.send_json(entry)
            else:
                self.send_json({'error': 'Entry not found'}, 404)

        elif path == '/' or path == '/kb-viewer.html':
            # Serve main HTML page
            self.send_file(get_project_folder() / 'kb-viewer.html')

        elif path == '/kb-viewer.js':
            # Serve JavaScript file
            self.send_file(get_project_folder() / 'kb-viewer.js')

        elif path.startswith('/screenshots/'):
            # Serve screenshot files
            self.send_file(get_project_folder() / path[1:])

        elif path.startswith('/files/'):
            # Serve uploaded files
            self.send_file(get_project_folder() / path[1:])

        elif path.startswith('/ultrathink-extension/'):
            # Serve extension assets (icons)
            self.send_file(get_project_folder() / path[1:])

        else:
            self.send_error(404, 'Not found')

    def do_POST(self):
        """Handle POST requests (create)."""
        parsed = urlparse(self.path)
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length))
        except Exception as e:
            self.send_json({'success': False, 'error': f'Invalid JSON: {str(e)}'}, 400)
            return

        if parsed.path == '/api/topics':
            name = body.get('name', '').strip()
            if not name:
                self.send_json({'success': False, 'error': 'Name required'}, 400)
                return

            topics_file = get_project_folder() / 'topics.json'
            topics = []
            if topics_file.exists():
                with open(topics_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    topics = data.get('topics', [])

            if name in topics:
                self.send_json({'success': False, 'error': 'Topic already exists'}, 400)
                return

            topics.append(name)
            topics.sort()
            with open(topics_file, 'w', encoding='utf-8') as f:
                json.dump({'topics': topics}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/entities':
            name = body.get('name', '').strip()
            if not name:
                self.send_json({'success': False, 'error': 'Name required'}, 400)
                return

            entities_file = get_project_folder() / 'entities.json'
            entities = []
            if entities_file.exists():
                with open(entities_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    entities = data.get('entities', [])

            if name in entities:
                self.send_json({'success': False, 'error': 'Already exists'}, 400)
                return

            entities.append(name)
            entities.sort()
            with open(entities_file, 'w', encoding='utf-8') as f:
                json.dump({'entities': entities}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/kanban-columns':
            # Add a new column
            col_id = body.get('id', '').strip()
            col_name = body.get('name', '').strip()
            col_color = body.get('color', '#6b7280').strip()

            if not col_id or not col_name:
                self.send_json({'success': False, 'error': 'Column id and name required'}, 400)
                return

            columns_file = get_project_folder() / 'kanban-columns.json'
            default_columns = [
                {'id': 'not-started', 'name': 'Not started', 'color': '#6b7280'},
                {'id': 'in-progress', 'name': 'In progress', 'color': '#3b82f6'},
                {'id': 'done', 'name': 'Done', 'color': '#22c55e'}
            ]

            if columns_file.exists():
                with open(columns_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    columns = data.get('columns', default_columns)
            else:
                columns = default_columns

            # Check if column already exists
            if any(c['id'] == col_id for c in columns):
                self.send_json({'success': False, 'error': 'Column already exists'}, 400)
                return

            columns.append({'id': col_id, 'name': col_name, 'color': col_color})
            with open(columns_file, 'w', encoding='utf-8') as f:
                json.dump({'columns': columns}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/search/github':
            # Search GitHub for issues and commits
            try:
                query = body.get('query', '').strip()
                if not query:
                    self.send_json({'success': False, 'error': 'Query required'}, 400)
                    return

                # Load settings from native-host/settings.json
                settings_file = get_project_folder() / 'native-host' / 'settings.json'
                if not settings_file.exists():
                    self.send_json({'success': False, 'error': 'Settings file not found. Configure GitHub token in native-host/settings.json'}, 400)
                    return

                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)

                github_token = settings.get('github_token', '')
                github_org = settings.get('github_org', '')
                github_repos = settings.get('github_repos', '')

                if not github_token:
                    self.send_json({'success': False, 'error': 'GitHub token not configured. Add "github_token" to native-host/settings.json'}, 400)
                    return

                max_results = body.get('maxResults', 10)

                # Log the GitHub API call
                start_time = time.time()
                result = search_github(query, github_token, github_org, github_repos, max_results)
                duration = int((time.time() - start_time) * 1000)

                add_log(
                    service='github',
                    action='search',
                    status='success' if result.get('success') else 'error',
                    details=f"Query: {query}" + (f" (org: {github_org})" if github_org else ""),
                    duration_ms=duration,
                    request_data={'query': query, 'org': github_org, 'max_results': max_results},
                    response_data={
                        'repositories': len(result.get('repositories', [])),
                        'code': len(result.get('code', [])),
                        'issues': len(result.get('issues', [])),
                        'commits': len(result.get('commits', [])),
                        'error': result.get('error')
                    }
                )

                self.send_json(result)
            except Exception as e:
                print(f'GitHub search endpoint error: {e}')
                add_log(
                    service='github',
                    action='search',
                    status='error',
                    details=f"Exception: {str(e)}",
                    request_data={'query': body.get('query', '')}
                )
                self.send_json({'success': False, 'error': str(e)}, 500)

        elif parsed.path == '/api/search/notion':
            # Search Notion pages and databases
            try:
                query = body.get('query', '').strip()
                if not query:
                    self.send_json({'success': False, 'error': 'Query required'}, 400)
                    return

                # Load settings from native-host/settings.json
                settings_file = get_project_folder() / 'native-host' / 'settings.json'
                if not settings_file.exists():
                    self.send_json({'success': False, 'error': 'Settings file not found. Configure Notion token in native-host/settings.json'}, 400)
                    return

                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)

                notion_token = settings.get('notion_token', '')

                if not notion_token:
                    self.send_json({'success': False, 'error': 'Notion token not configured. Add "notion_token" to native-host/settings.json'}, 400)
                    return

                max_results = body.get('maxResults', 10)

                # Log the Notion API call
                start_time = time.time()
                result = search_notion(query, notion_token, max_results)
                duration = int((time.time() - start_time) * 1000)

                add_log(
                    service='notion',
                    action='search',
                    status='success' if result.get('success') else 'error',
                    details=f"Query: {query}",
                    duration_ms=duration,
                    request_data={'query': query, 'max_results': max_results},
                    response_data={
                        'pages': len(result.get('pages', [])),
                        'databases': len(result.get('databases', [])),
                        'error': result.get('error')
                    }
                )

                self.send_json(result)
            except Exception as e:
                print(f'Notion search endpoint error: {e}')
                add_log(
                    service='notion',
                    action='search',
                    status='error',
                    details=f"Exception: {str(e)}",
                    request_data={'query': body.get('query', '')}
                )
                self.send_json({'success': False, 'error': str(e)}, 500)

        elif parsed.path == '/api/search/fastmail':
            # Search Fastmail emails using JMAP
            try:
                query = body.get('query', '').strip()
                if not query:
                    self.send_json({'success': False, 'error': 'Query required'}, 400)
                    return

                # Load settings from native-host/settings.json
                settings_file = get_project_folder() / 'native-host' / 'settings.json'
                if not settings_file.exists():
                    self.send_json({'success': False, 'error': 'Settings file not found. Configure Fastmail token in native-host/settings.json'}, 400)
                    return

                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)

                fastmail_token = settings.get('fastmail_token', '')

                if not fastmail_token:
                    self.send_json({'success': False, 'error': 'Fastmail token not configured. Add "fastmail_token" to native-host/settings.json'}, 400)
                    return

                max_results = body.get('maxResults', 10)

                # Log the Fastmail API call
                start_time = time.time()
                result = search_fastmail(query, fastmail_token, max_results)
                duration = int((time.time() - start_time) * 1000)

                add_log(
                    service='fastmail',
                    action='search',
                    status='success' if result.get('success') else 'error',
                    details=f"Query: {query}",
                    duration_ms=duration,
                    request_data={'query': query, 'max_results': max_results},
                    response_data={
                        'emails': len(result.get('emails', [])),
                        'error': result.get('error')
                    }
                )

                self.send_json(result)
            except Exception as e:
                print(f'Fastmail search endpoint error: {e}')
                add_log(
                    service='fastmail',
                    action='search',
                    status='error',
                    details=f"Exception: {str(e)}",
                    request_data={'query': body.get('query', '')}
                )
                self.send_json({'success': False, 'error': str(e)}, 500)

        elif parsed.path == '/api/search/capsule':
            # Search Capsule CRM for parties, opportunities, tasks, and projects
            try:
                query = body.get('query', '').strip()
                if not query:
                    self.send_json({'success': False, 'error': 'Query required'}, 400)
                    return

                # Load settings from native-host/settings.json
                settings_file = get_project_folder() / 'native-host' / 'settings.json'
                if not settings_file.exists():
                    self.send_json({'success': False, 'error': 'Settings file not found. Configure Capsule token in native-host/settings.json'}, 400)
                    return

                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)

                capsule_token = settings.get('capsule_token', '')

                if not capsule_token:
                    self.send_json({'success': False, 'error': 'Capsule token not configured. Add "capsule_token" to native-host/settings.json'}, 400)
                    return

                max_results = body.get('maxResults', 10)

                # Log the Capsule API call
                start_time = time.time()
                result = search_capsule(query, capsule_token, max_results)
                duration = int((time.time() - start_time) * 1000)

                add_log(
                    service='capsule',
                    action='search',
                    status='success' if result.get('success') else 'error',
                    details=f"Query: {query}",
                    duration_ms=duration,
                    request_data={'query': query, 'max_results': max_results},
                    response_data={
                        'parties': len(result.get('parties', [])),
                        'opportunities': len(result.get('opportunities', [])),
                        'tasks': len(result.get('tasks', [])),
                        'projects': len(result.get('projects', [])),
                        'error': result.get('error')
                    }
                )

                self.send_json(result)
            except Exception as e:
                print(f'Capsule search endpoint error: {e}')
                add_log(
                    service='capsule',
                    action='search',
                    status='error',
                    details=f"Exception: {str(e)}",
                    request_data={'query': body.get('query', '')}
                )
                self.send_json({'success': False, 'error': str(e)}, 500)

        else:
            self.send_error(404, 'Not found')

    def do_PUT(self):
        """Handle PUT requests (update/rename)."""
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length))

        if parsed.path == '/api/kanban-columns':
            # Replace all columns
            columns = body.get('columns', [])
            if not columns:
                self.send_json({'success': False, 'error': 'Columns required'}, 400)
                return

            columns_file = get_project_folder() / 'kanban-columns.json'
            with open(columns_file, 'w', encoding='utf-8') as f:
                json.dump({'columns': columns}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/topics':
            old_name = body.get('oldName', '').strip()
            new_name = body.get('newName', '').strip()
            if not old_name or not new_name:
                self.send_json({'success': False, 'error': 'Names required'}, 400)
                return

            topics_file = get_project_folder() / 'topics.json'
            if not topics_file.exists():
                self.send_json({'success': False, 'error': 'Not found'}, 404)
                return

            with open(topics_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                topics = data.get('topics', [])

            if old_name not in topics:
                self.send_json({'success': False, 'error': 'Topic not found'}, 404)
                return

            topics = [new_name if t == old_name else t for t in topics]
            topics.sort()
            with open(topics_file, 'w', encoding='utf-8') as f:
                json.dump({'topics': topics}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/entities':
            old_name = body.get('oldName', '').strip()
            new_name = body.get('newName', '').strip()
            if not old_name or not new_name:
                self.send_json({'success': False, 'error': 'Names required'}, 400)
                return

            entities_file = get_project_folder() / 'entities.json'
            if not entities_file.exists():
                self.send_json({'success': False, 'error': 'Not found'}, 404)
                return

            with open(entities_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                entities = data.get('entities', [])

            if old_name not in entities:
                self.send_json({'success': False, 'error': 'Not found'}, 404)
                return

            entities = [new_name if e == old_name else e for e in entities]
            entities.sort()
            with open(entities_file, 'w', encoding='utf-8') as f:
                json.dump({'entities': entities}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/settings':
            # Update settings in native-host/settings.json
            # Only update fields that are provided and not masked
            settings_file = get_project_folder() / 'native-host' / 'settings.json'

            # Load existing settings
            if settings_file.exists():
                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
            else:
                settings = {}

            # Update only provided fields that aren't masked values
            for key, value in body.items():
                if value and not value.startswith('•'):
                    settings[key] = value
                elif value == '':
                    # Empty string means clear the field
                    settings[key] = ''

            # Write updated settings
            with open(settings_file, 'w', encoding='utf-8') as f:
                json.dump(settings, f, indent=2)

            self.send_json({'success': True})

        else:
            self.send_error(404, 'Not found')

    def do_PATCH(self):
        """Handle PATCH requests (partial update)."""
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}

        if parsed.path == '/api/entries':
            # Update task status
            timestamp = body.get('timestamp')
            task_status = body.get('taskStatus')

            if not timestamp:
                self.send_json({'success': False, 'error': 'Missing timestamp'}, 400)
                return

            if task_status is None:
                self.send_json({'success': False, 'error': 'Missing taskStatus'}, 400)
                return

            result = update_entry_status(timestamp, task_status)
            self.send_json(result)

        else:
            self.send_error(404, 'Not found')

    def do_DELETE(self):
        """Handle DELETE requests."""
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}

        if parsed.path == '/api/entries':
            timestamp = body.get('timestamp')
            if timestamp:
                result = delete_entry(timestamp)
                self.send_json(result)
            else:
                self.send_json({'success': False, 'error': 'Missing timestamp'}, 400)

        elif parsed.path == '/api/logs':
            # Clear all API logs
            API_LOGS.clear()
            self.send_json({'success': True})

        elif parsed.path == '/api/topics':
            name = body.get('name', '').strip()
            if not name:
                self.send_json({'success': False, 'error': 'Name required'}, 400)
                return

            topics_file = get_project_folder() / 'topics.json'
            if not topics_file.exists():
                self.send_json({'success': False, 'error': 'Not found'}, 404)
                return

            with open(topics_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                topics = data.get('topics', [])

            if name not in topics:
                self.send_json({'success': False, 'error': 'Topic not found'}, 404)
                return

            topics.remove(name)
            with open(topics_file, 'w', encoding='utf-8') as f:
                json.dump({'topics': topics}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/entities':
            name = body.get('name', '').strip()
            if not name:
                self.send_json({'success': False, 'error': 'Name required'}, 400)
                return

            entities_file = get_project_folder() / 'entities.json'
            if not entities_file.exists():
                self.send_json({'success': False, 'error': 'Not found'}, 404)
                return

            with open(entities_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                entities = data.get('entities', [])

            if name not in entities:
                self.send_json({'success': False, 'error': 'Not found'}, 404)
                return

            entities.remove(name)
            with open(entities_file, 'w', encoding='utf-8') as f:
                json.dump({'entities': entities}, f, indent=2)
            self.send_json({'success': True})

        elif parsed.path == '/api/kanban-columns':
            col_id = body.get('id', '').strip()
            if not col_id:
                self.send_json({'success': False, 'error': 'Column id required'}, 400)
                return

            # Don't allow deleting default columns
            if col_id in ['not-started', 'in-progress', 'done']:
                self.send_json({'success': False, 'error': 'Cannot delete default columns'}, 400)
                return

            columns_file = get_project_folder() / 'kanban-columns.json'
            if not columns_file.exists():
                self.send_json({'success': False, 'error': 'Not found'}, 404)
                return

            with open(columns_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                columns = data.get('columns', [])

            original_len = len(columns)
            columns = [c for c in columns if c['id'] != col_id]

            if len(columns) == original_len:
                self.send_json({'success': False, 'error': 'Column not found'}, 404)
                return

            with open(columns_file, 'w', encoding='utf-8') as f:
                json.dump({'columns': columns}, f, indent=2)
            self.send_json({'success': True})

        else:
            self.send_error(404, 'Not found')

    def log_message(self, format, *args):
        """Suppress default logging for cleaner output."""
        pass


def main():
    """Start the HTTP server and open browser."""
    project_folder = get_project_folder()
    os.chdir(project_folder)

    # Check if kb-viewer.html exists
    viewer_file = project_folder / 'kb-viewer.html'
    if not viewer_file.exists():
        print(f"Error: kb-viewer.html not found in {project_folder}")
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
