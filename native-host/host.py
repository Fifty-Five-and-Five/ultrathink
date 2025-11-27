#!/usr/bin/env python3
"""
Native messaging host for UltraThink Chrome extension.

This module handles:
- Native messaging communication with Chrome extension
- Saving entries to kb.md markdown knowledge base
- AI processing pipeline (grammar correction, summarisation, classification)
- File and screenshot management
- Desktop widget lifecycle

The host receives JSON messages from the extension via stdin and sends
responses via stdout. All AI processing runs in background threads to
avoid blocking the UI.

Entry format in kb.md:
    - `type` | `source` | `timestamp` | [Title](URL)
      - Notes: User's notes
      - Entity: project|task|knowledge
      - Topics: Topic1, Topic2
      - AI Summary: Generated summary
"""

import sys
import json
import struct
import os
import re
import base64
import urllib.request
import urllib.error
import urllib.parse
import threading
from pathlib import Path
from datetime import datetime


# =============================================================================
# SECURITY: Path and Input Validation
# =============================================================================

# Blocked system directories (case-insensitive)
BLOCKED_PATHS = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
]

# Type mappings for AI Summary strategies
IMAGE_TYPES = ['screenshot', 'image']
RESEARCH_TYPES = ['long-note']
AUDIO_TYPES = ['audio']
DOCUMENT_TYPES = ['pdf', 'markdown', 'ms-word', 'ms-excel', 'ms-powerpoint', 'ms-onenote']
LINK_TYPES = ['link', 'chatgpt', 'claude', 'perplexity', 'notion']  # Types that need URL browsing
TEXT_TYPES = ['snippet', 'note', 'para', 'idea']  # Types that just need text summarisation
NO_SUMMARY_TYPES = ['video']  # Types that don't get AI summary

# Settings file path (in same directory as this script)
SETTINGS_FILE = Path(__file__).parent / 'settings.json'


def load_settings():
    """
    Load settings from settings.json file.

    Returns:
        dict: Settings dictionary, or empty dict if file not found/invalid.

    Settings include:
        - openai_api_key: OpenAI API key for AI processing
        - github_token, notion_token, fastmail_token: Integration tokens
        - classification_prompt: Custom prompt for entry classification
        - grammar_prompt: Custom prompt for grammar correction
        - Other AI prompt customisations
    """
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def get_prompt(settings, key, default):
    """
    Get a prompt from settings, falling back to default if not set.

    Args:
        settings (dict): Settings dictionary from load_settings().
        key (str): Settings key for the prompt (e.g., 'classification_prompt').
        default (str): Default prompt to use if not in settings.

    Returns:
        str: The prompt to use (custom or default).
    """
    custom = settings.get(key, '').strip()
    return custom if custom else default


def validate_project_folder(project_folder):
    """
    Validate that a project folder path is safe and usable.

    Performs security checks to prevent path traversal attacks and
    writing to system directories.

    Args:
        project_folder (str): Path to validate.

    Returns:
        tuple: (is_valid: bool, result: Path|str)
            If valid, result is the resolved Path object.
            If invalid, result is an error message string.

    Security checks:
        - Must be absolute path
        - Must exist as a directory
        - Cannot be a system directory (Windows, Program Files, /etc, etc.)
        - Cannot contain '..' path traversal
    """
    if not project_folder:
        return False, "Project folder cannot be empty"

    try:
        folder_path = Path(project_folder).resolve()

        # Must be absolute
        if not folder_path.is_absolute():
            return False, "Project folder must be an absolute path"

        # Must exist and be a directory
        if not folder_path.exists():
            return False, f"Project folder does not exist: {project_folder}"

        if not folder_path.is_dir():
            return False, f"Project folder is not a directory: {project_folder}"

        # Block system directories
        folder_str = str(folder_path).lower()
        for blocked in BLOCKED_PATHS:
            if folder_str.startswith(blocked):
                return False, f"Cannot use system directory: {folder_path}"

        # Block path traversal attempts
        if '..' in project_folder:
            return False, "Path cannot contain '..'"

        return True, folder_path

    except Exception as e:
        return False, f"Invalid path: {str(e)}"


def sanitize_filename(filename):
    """
    Sanitize a filename to prevent path traversal and security issues.

    Args:
        filename (str): Original filename to sanitize.

    Returns:
        str: Safe filename with only alphanumeric chars, dashes,
            underscores, dots, and spaces. Max 200 characters.

    Security measures:
        - Strips path components (only keeps basename)
        - Removes path separators and null bytes
        - Removes leading dots (hidden files)
        - Limits length to 200 characters
    """
    if not filename:
        return 'unnamed_file'

    # Get just the basename (strip any path components)
    basename = Path(filename).name

    # Remove any remaining path separators and null bytes
    basename = basename.replace('/', '').replace('\\', '').replace('\x00', '')

    # Remove leading dots (hidden files / parent traversal)
    basename = basename.lstrip('.')

    # Whitelist: only allow alphanumeric, dash, underscore, dot, space
    basename = re.sub(r'[^a-zA-Z0-9\-_\. ]', '_', basename)

    # Limit length
    if len(basename) > 200:
        name_parts = basename.rsplit('.', 1)
        if len(name_parts) == 2:
            basename = name_parts[0][:190] + '.' + name_parts[1][:10]
        else:
            basename = basename[:200]

    # Ensure not empty after sanitization
    if not basename or basename == '.':
        basename = 'unnamed_file'

    return basename


def validate_entry(entry):
    """
    Validate entry object has required fields.
    Returns (is_valid, error_message).
    """
    if not isinstance(entry, dict):
        return False, "Entry must be an object"

    required_fields = ['type', 'captured', 'source']
    for field in required_fields:
        if field not in entry:
            return False, f"Missing required field: {field}"

    # Validate timestamp format (YYYY-MM-DD HH:MM:SS)
    timestamp = entry.get('captured', '')
    if not re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$', timestamp):
        return False, f"Invalid timestamp format: {timestamp}"

    return True, None


# =============================================================================
# External Service Integrations
# =============================================================================

def search_github(query, github_token, repos=None, max_results=10):
    """
    Search GitHub for issues, commits, and code related to a query.

    Args:
        query (str): Search query string.
        github_token (str): GitHub Personal Access Token.
        repos (str|None): Comma-separated list of repos to search (e.g., "owner/repo1, owner/repo2").
                         If None, searches all accessible repos.
        max_results (int): Maximum results per search type.

    Returns:
        dict: {
            'success': bool,
            'issues': [...],
            'commits': [...],
            'error': str (if failed)
        }
    """
    log_file = Path(__file__).parent / 'host.log'

    if not github_token:
        return {'success': False, 'error': 'GitHub token not configured'}

    if not query or not query.strip():
        return {'success': False, 'error': 'Search query is empty'}

    results = {
        'success': True,
        'issues': [],
        'commits': [],
        'query': query
    }

    headers = {
        'Authorization': f'Bearer {github_token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }

    try:
        # Build query with optional repo filter
        base_query = query.strip()
        if repos:
            # Parse comma-separated repos and add to query
            repo_list = [r.strip() for r in repos.split(',') if r.strip()]
            if repo_list:
                repo_filter = ' '.join([f'repo:{r}' for r in repo_list])
                base_query = f'{base_query} {repo_filter}'

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: GitHub search query: {base_query}\n")

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

            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: GitHub found {len(results['issues'])} issues\n")

        except urllib.error.HTTPError as e:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: GitHub issues search error: {e.code} {e.reason}\n")

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
                    'message': commit.get('message', '').split('\n')[0][:100],  # First line only
                    'url': item.get('html_url'),
                    'repo': item.get('repository', {}).get('full_name', ''),
                    'author': commit.get('author', {}).get('name', ''),
                    'date': commit.get('committer', {}).get('date', '')
                })

            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: GitHub found {len(results['commits'])} commits\n")

        except urllib.error.HTTPError as e:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: GitHub commits search error: {e.code} {e.reason}\n")

        return results

    except urllib.error.HTTPError as e:
        error_msg = f'GitHub API error: {e.code} {e.reason}'
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: {error_msg}\n")
        return {'success': False, 'error': error_msg}
    except Exception as e:
        error_msg = f'GitHub search error: {str(e)}'
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: {error_msg}\n")
        return {'success': False, 'error': error_msg}


def format_github_results_for_context(github_results):
    """
    Format GitHub search results as context text for AI prompts.

    Args:
        github_results (dict): Results from search_github().

    Returns:
        str: Formatted text summarising the GitHub findings.
    """
    if not github_results.get('success'):
        return ''

    parts = []

    issues = github_results.get('issues', [])
    if issues:
        parts.append(f"**Related GitHub Issues ({len(issues)}):**")
        for issue in issues[:5]:  # Limit to 5 for context
            status = '✓' if issue['state'] == 'closed' else '○'
            labels = f" [{', '.join(issue['labels'][:3])}]" if issue['labels'] else ''
            parts.append(f"  {status} #{issue['number']}: {issue['title']}{labels}")
            if issue['body_preview']:
                parts.append(f"    {issue['body_preview'][:100]}...")

    commits = github_results.get('commits', [])
    if commits:
        parts.append(f"\n**Related GitHub Commits ({len(commits)}):**")
        for commit in commits[:5]:  # Limit to 5 for context
            parts.append(f"  • {commit['sha']}: {commit['message']} ({commit['author']})")

    return '\n'.join(parts) if parts else ''


# =============================================================================
# AI Classification with OpenAI
# =============================================================================

def load_topics(project_folder):
    """Load existing topics from topics.json."""
    try:
        topics_file = Path(project_folder) / 'topics.json'
        if topics_file.exists():
            with open(topics_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('topics', [])
        return []
    except Exception:
        return []


def save_topics(project_folder, topics):
    """Save topics to topics.json."""
    try:
        topics_file = Path(project_folder) / 'topics.json'
        # Deduplicate and sort
        unique_topics = sorted(list(set(topics)))
        with open(topics_file, 'w', encoding='utf-8') as f:
            json.dump({'topics': unique_topics}, f, indent=2)
    except Exception:
        pass


def load_entities(project_folder):
    """Load existing entities (people & roles) from entities.json."""
    try:
        entities_file = Path(project_folder) / 'entities.json'
        if entities_file.exists():
            with open(entities_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('entities', [])
        return []
    except Exception:
        return []


def save_entities(project_folder, entities):
    """Save entities to entities.json."""
    try:
        entities_file = Path(project_folder) / 'entities.json'
        # Deduplicate and sort
        unique_entities = sorted(list(set(entities)))
        with open(entities_file, 'w', encoding='utf-8') as f:
            json.dump({'entities': unique_entities}, f, indent=2)
    except Exception:
        pass


DEFAULT_CLASSIFICATION_PROMPT = """Analyze this knowledge base entry and classify it as "project", "task", or "knowledge".

Title: {title}
URL: {url}
Content: {content}

ENTITY CLASSIFICATION (in priority order):
- "project" = References a bigger initiative, project idea, feature request, or something to build. If you see the word "project" it is a project. A video or image on its own is rarely going to be a project unless associated text indicates.
- "task" = Action item, reminder, todo, something that needs to be done. If you see the word "task" it is a task. Unless you already decided it's a project.
- "knowledge" = Fact, reference, documentation, information to remember. Unless already decided it's a project or task.
- "unclassified" = Cannot determine from the content.

TOPIC EXTRACTION:
Extract 1-5 topic tags. STRONGLY prefer existing topics: {existing_topics}
- If a topic is similar to an existing one (e.g. "React" vs "ReactJS", "ML" vs "Machine Learning"), use the EXISTING one
- Only create a new topic if nothing similar exists

PEOPLE EXTRACTION:
Extract any people names mentioned.
STRONGLY prefer existing people: {existing_people}
- If a name matches an existing person's first name, use the FULL existing name (e.g. "Kevin" -> "Kevin Smith")
- If a name has a typo but is similar to existing (e.g. "Jon" vs "John"), use the EXISTING correct spelling
- Only add new people if no similar match exists

Return JSON only:
{
  "entity": "project|task|knowledge|unclassified",
  "topics": ["topic1", "topic2"],
  "people": ["Kevin Smith", "Jane Doe"]
}"""

DEFAULT_GRAMMAR_PROMPT = """Fix spelling and grammar errors in this note. Use UK spelling and sentence case. Never use em dash. If you can improve wording and flow without losing meaning do that. If you cannot work out meaning then don't make major changes.
Context: From {domain}
Page: {title}
Type: {type}
Preserve technical terms, jargon, domain-specific language, brands, names of things, people etc. and capitalise them correctly.

Original text: "{text}"

Return JSON only:
{{"corrected": "the corrected text here"}}"""

DEFAULT_IMAGE_PROMPT = """Describe what is shown in this image in 2-3 sentences. Focus on the key elements and purpose."""

DEFAULT_AUDIO_PROMPT = """Analyze this audio transcript and provide:

1. **Summary**: A 2-3 sentence description of what is discussed/happening in this audio.

2. **Speakers**: Based on the content, speaking styles, and any context provided, attempt to identify who is speaking. List speakers as "Speaker 1", "Speaker 2" etc, and if you can infer names or roles from context, include them (e.g., "Speaker 1 (likely John, the manager)").

3. **Transcript**: Include the full transcript below.
{notes}

TRANSCRIPT:
{transcript}"""

DEFAULT_DOCUMENT_PROMPT = """Summarise this document in 2-3 sentences. What is the main topic and key points?

{content}"""

DEFAULT_LINK_PROMPT = """Browse this URL and provide a comprehensive summary of the page content.

URL: {url}
Page title: {title}
User notes: {notes}

Search the web for useful links, evidence, extra context or additional information related to this page. Cite all sources in your response.

Provide:
1. A 2-3 sentence summary of what the page is about
2. Key information, facts, or takeaways from the content
3. Any relevant context, related links, or supporting evidence you found
4. List all sources at the end"""

DEFAULT_TEXT_PROMPT = """Summarise this text in 1-2 sentences:

{text}

Return just the summary."""

DEFAULT_RESEARCH_PROMPT = """Do background research on this topic and provide a 2-3 paragraph summary:

{notes}"""


def classify_entry(entry, api_key, existing_topics, existing_entities, ai_summary=None, custom_prompt=None):
    """
    Classify entry using OpenAI API.
    Returns dict with entity, topics, and people fields.
    ai_summary: Optional AI-generated summary to provide additional context for classification.
    custom_prompt: Optional custom prompt template with placeholders.
    """
    log_file = Path(__file__).parent / 'host.log'

    if not api_key:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: AI classification skipped - no API key\n")
        return None

    try:
        # Build content for classification
        title = entry.get('title', '')
        url = entry.get('url', '')
        notes = entry.get('notes', '')
        selected_text = entry.get('selectedText', '')

        # Combine all available text content
        content_parts = [selected_text, notes]
        if ai_summary:
            content_parts.append(f"AI Description: {ai_summary}")
        content = ' '.join(part for part in content_parts if part).strip()

        # Use custom prompt or default
        prompt_template = custom_prompt if custom_prompt else DEFAULT_CLASSIFICATION_PROMPT

        # Replace placeholders in prompt
        prompt = prompt_template.format(
            title=title,
            url=url,
            content=content,
            existing_topics=existing_topics,
            existing_people=existing_entities
        )

        # Call OpenAI Responses API
        request_data = json.dumps({
            'model': 'gpt-5-nano',
            'input': prompt
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))

        # Extract text from response
        output_message = None
        for item in result.get('output', []):
            if item.get('type') == 'message':
                output_message = item
                break

        if not output_message:
            return None

        text_content = None
        for content_item in output_message.get('content', []):
            if content_item.get('type') == 'output_text':
                text_content = content_item.get('text', '')
                break

        if not text_content:
            return None

        # Parse JSON from response (handle markdown code blocks)
        json_text = text_content.strip()
        if json_text.startswith('```'):
            # Remove markdown code block
            lines = json_text.split('\n')
            json_text = '\n'.join(lines[1:-1] if lines[-1] == '```' else lines[1:])

        classification = json.loads(json_text)

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: AI classification result: {classification}\n")

        return classification

    except urllib.error.HTTPError as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: AI classification HTTP error: {e.code} {e.reason}\n")
        return None
    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: AI classification error: {str(e)}\n")
        return None


def fix_grammar_openai(text, entry, api_key, custom_prompt=None):
    """
    Fix spelling and grammar using OpenAI API.
    Returns corrected text or original if API fails.
    custom_prompt: Optional custom prompt template with placeholders.
    """
    log_file = Path(__file__).parent / 'host.log'

    if not text or not text.strip():
        return text

    if not api_key:
        return text

    try:
        # Build context for better corrections
        url = entry.get('url', '')
        title = entry.get('title', '')[:100] if entry.get('title') else ''
        entry_type = entry.get('type', '')
        domain = ''

        if url:
            try:
                from urllib.parse import urlparse
                domain = urlparse(url).hostname or ''
            except Exception:
                pass

        # Use custom prompt or default
        prompt_template = custom_prompt if custom_prompt else DEFAULT_GRAMMAR_PROMPT

        # Replace placeholders in prompt
        prompt = prompt_template.format(
            text=text,
            domain=domain,
            title=title,
            type=entry_type
        )

        # Call OpenAI Responses API
        request_data = json.dumps({
            'model': 'gpt-5-nano',
            'input': prompt
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))

        # Extract text from response
        output_message = None
        for item in result.get('output', []):
            if item.get('type') == 'message':
                output_message = item
                break

        if not output_message:
            return text

        text_content = None
        for content_item in output_message.get('content', []):
            if content_item.get('type') == 'output_text':
                text_content = content_item.get('text', '')
                break

        if not text_content:
            return text

        # Parse JSON response (handle markdown code blocks)
        json_text = text_content.strip()
        if json_text.startswith('```'):
            lines = json_text.split('\n')
            json_text = '\n'.join(lines[1:-1] if lines[-1] == '```' else lines[1:])

        try:
            grammar_result = json.loads(json_text)
            fixed = grammar_result.get('corrected', text).strip()
        except json.JSONDecodeError:
            # Fallback: use raw text if JSON parsing fails
            fixed = json_text.strip()

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Grammar fix: '{text[:50]}...' -> '{fixed[:50]}...'\n")

        return fixed

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Grammar fix error: {str(e)}\n")
        return text


# =============================================================================
# AI Summary Functions
# =============================================================================

def summarize_image(image_path, api_key, custom_prompt=None):
    """Generate summary of an image using GPT-5 vision."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        # Read and encode image
        with open(image_path, 'rb') as f:
            image_data = f.read()
        base64_image = base64.b64encode(image_data).decode('utf-8')

        # Determine MIME type
        ext = Path(image_path).suffix.lower()
        mime_type = 'image/png' if ext == '.png' else 'image/jpeg'

        # Use custom prompt or default
        prompt = custom_prompt if custom_prompt else DEFAULT_IMAGE_PROMPT

        # Call GPT-5 vision API
        request_data = json.dumps({
            'model': 'gpt-5',
            'input': [{
                'role': 'user',
                'content': [
                    {'type': 'input_text', 'text': prompt},
                    {'type': 'input_image', 'image_url': f'data:{mime_type};base64,{base64_image}'}
                ]
            }]
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))

        # Extract text from response
        for item in result.get('output', []):
            if item.get('type') == 'message':
                for content_item in item.get('content', []):
                    if content_item.get('type') == 'output_text':
                        summary = content_item.get('text', '').strip()
                        with open(log_file, 'a', encoding='utf-8') as f:
                            f.write(f"{datetime.now()}: Image summary generated: {summary[:100]}...\n")
                        return summary

        return None

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: summarize_image error: {str(e)}\n")
        return None


def summarize_with_research(notes, api_key, custom_prompt=None):
    """Generate summary with web research using GPT-5 web search."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        # Use custom prompt or default
        prompt_template = custom_prompt if custom_prompt else DEFAULT_RESEARCH_PROMPT
        prompt = prompt_template.format(notes=notes)

        request_data = json.dumps({
            'model': 'gpt-5',
            'tools': [{'type': 'web_search'}],
            'input': prompt
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=90) as response:  # Longer timeout for web search
            result = json.loads(response.read().decode('utf-8'))

        # Extract text from response
        for item in result.get('output', []):
            if item.get('type') == 'message':
                for content_item in item.get('content', []):
                    if content_item.get('type') == 'output_text':
                        summary = content_item.get('text', '').strip()
                        with open(log_file, 'a', encoding='utf-8') as f:
                            f.write(f"{datetime.now()}: Research summary generated: {summary[:100]}...\n")
                        return summary

        return None

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: summarize_with_research error: {str(e)}\n")
        return None


def summarize_audio(audio_path, api_key, notes='', custom_prompt=None):
    """Transcribe audio with Whisper, then summarize with speaker identification."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        # Read audio file
        with open(audio_path, 'rb') as f:
            audio_data = f.read()

        # Get filename for API
        filename = Path(audio_path).name

        # Create multipart form data for transcription
        boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
        body = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f'Content-Type: audio/mpeg\r\n\r\n'
        ).encode('utf-8') + audio_data + (
            f'\r\n--{boundary}\r\n'
            f'Content-Disposition: form-data; name="model"\r\n\r\n'
            f'gpt-4o-transcribe\r\n'
            f'--{boundary}--\r\n'
        ).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/audio/transcriptions',
            data=body,
            headers={
                'Content-Type': f'multipart/form-data; boundary={boundary}',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=120) as response:
            transcription_result = json.loads(response.read().decode('utf-8'))

        transcript = transcription_result.get('text', '')

        if not transcript:
            return None

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Audio transcribed: {transcript[:100]}...\n")

        # Build prompt using template
        prompt_template = custom_prompt if custom_prompt else DEFAULT_AUDIO_PROMPT
        notes_context = f'\n\nUser notes about this audio: {notes}' if notes else ''
        prompt = prompt_template.format(notes=notes_context, transcript=transcript)

        summary_request = json.dumps({
            'model': 'gpt-5-nano',
            'input': prompt
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=summary_request,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))

        for item in result.get('output', []):
            if item.get('type') == 'message':
                for content_item in item.get('content', []):
                    if content_item.get('type') == 'output_text':
                        summary = content_item.get('text', '').strip()
                        with open(log_file, 'a', encoding='utf-8') as f:
                            f.write(f"{datetime.now()}: Audio summary generated: {summary[:100]}...\n")
                        return summary

        return None

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: summarize_audio error: {str(e)}\n")
        return None


def summarize_document(file_path, entry_type, api_key, custom_prompt=None):
    """Summarize a document (PDF, markdown, Office files)."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        content = None

        # Use custom prompt or default
        prompt_template = custom_prompt if custom_prompt else DEFAULT_DOCUMENT_PROMPT

        if entry_type == 'markdown':
            # Read markdown directly
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        elif entry_type == 'pdf':
            # Use GPT-5 vision for PDF (send as image)
            with open(file_path, 'rb') as f:
                pdf_data = f.read()
            base64_pdf = base64.b64encode(pdf_data).decode('utf-8')

            # For PDFs, use the template but strip the {content} placeholder
            pdf_prompt = prompt_template.replace('{content}', '').strip()

            request_data = json.dumps({
                'model': 'gpt-5',
                'input': [{
                    'role': 'user',
                    'content': [
                        {'type': 'input_text', 'text': pdf_prompt},
                        {'type': 'input_file', 'file_data': f'data:application/pdf;base64,{base64_pdf}'}
                    ]
                }]
            }).encode('utf-8')

            req = urllib.request.Request(
                'https://api.openai.com/v1/responses',
                data=request_data,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}'
                }
            )

            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))

            for item in result.get('output', []):
                if item.get('type') == 'message':
                    for content_item in item.get('content', []):
                        if content_item.get('type') == 'output_text':
                            summary = content_item.get('text', '').strip()
                            with open(log_file, 'a', encoding='utf-8') as f:
                                f.write(f"{datetime.now()}: PDF summary generated: {summary[:100]}...\n")
                            return summary
            return None
        else:
            # For Office docs, try to read as text (basic approach)
            # Full Office support would need python-docx, openpyxl, etc.
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()[:5000]  # Limit to first 5000 chars
            except Exception:
                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(f"{datetime.now()}: Could not read {entry_type} file as text\n")
                return None

        if not content or len(content.strip()) < 10:
            return None

        # Summarize the text content using template
        prompt = prompt_template.format(content=content[:4000])
        request_data = json.dumps({
            'model': 'gpt-5-nano',
            'input': prompt
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))

        for item in result.get('output', []):
            if item.get('type') == 'message':
                for content_item in item.get('content', []):
                    if content_item.get('type') == 'output_text':
                        summary = content_item.get('text', '').strip()
                        with open(log_file, 'a', encoding='utf-8') as f:
                            f.write(f"{datetime.now()}: Document summary generated: {summary[:100]}...\n")
                        return summary

        return None

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: summarize_document error: {str(e)}\n")
        return None


def summarize_link(entry, api_key, custom_prompt=None, text_prompt=None):
    """
    Summarize a web link by browsing and analysing its content.

    Uses GPT-5 with web search capability to fetch and understand the
    linked page, then generates a comprehensive summary with sources.

    Args:
        entry (dict): Entry containing 'url', 'title', and optional 'notes'.
        api_key (str): OpenAI API key.
        custom_prompt (str|None): Custom prompt template for link summary.
        text_prompt (str|None): Custom prompt for text fallback.

    Returns:
        str|None: Summary text with sources appended, or None on failure.

    API configuration:
        - Model: gpt-5
        - Tools: web_search (to fetch page content)
        - Reasoning effort: medium
        - Timeout: 90 seconds
    """
    log_file = Path(__file__).parent / 'host.log'

    try:
        title = entry.get('title', '')
        url = entry.get('url', '')
        notes = entry.get('notes', '')

        if not url:
            # No URL to browse - fall back to basic summary
            return summarize_text(entry, api_key, text_prompt)

        # Use custom prompt or default
        prompt_template = custom_prompt if custom_prompt else DEFAULT_LINK_PROMPT
        prompt = prompt_template.format(url=url, title=title, notes=notes if notes else 'None')

        request_data = json.dumps({
            'model': 'gpt-5',
            'tools': [{'type': 'web_search'}],
            'include': ['web_search_call.action.sources'],
            'reasoning': {'effort': 'medium'},
            'input': prompt
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=90) as response:  # Longer timeout for reasoning
            result = json.loads(response.read().decode('utf-8'))

        # Extract summary text and sources
        summary_text = None
        sources = []

        for item in result.get('output', []):
            if item.get('type') == 'message':
                for content_item in item.get('content', []):
                    if content_item.get('type') == 'output_text':
                        summary_text = content_item.get('text', '').strip()
            elif item.get('type') == 'web_search_call':
                # Extract sources if available
                action = item.get('action', {})
                for source in action.get('sources', []):
                    source_url = source.get('url', '')
                    source_title = source.get('title', '')
                    if source_url:
                        sources.append(f"[{source_title}]({source_url})" if source_title else source_url)

        if summary_text:
            # Append sources if available
            if sources:
                summary_text += f"\n\nSources: {', '.join(sources[:3])}"  # Limit to 3 sources

            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: Link summary generated (web+reasoning): {summary_text[:100]}...\n")
            return summary_text

        return None

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: summarize_link error: {str(e)}\n")
        return None


def summarize_text(entry, api_key, custom_prompt=None):
    """Summarize text content (snippets, notes, ideas, paragraphs)."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        notes = entry.get('notes', '')
        selected_text = entry.get('selectedText', '')

        # Use whichever text is available
        text = selected_text or notes
        if not text or not text.strip():
            return None

        # Use custom prompt or default
        prompt_template = custom_prompt if custom_prompt else DEFAULT_TEXT_PROMPT
        prompt = prompt_template.format(text=text[:2000])

        request_data = json.dumps({
            'model': 'gpt-5-nano',
            'input': prompt
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.openai.com/v1/responses',
            data=request_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode('utf-8'))

        for item in result.get('output', []):
            if item.get('type') == 'message':
                for content_item in item.get('content', []):
                    if content_item.get('type') == 'output_text':
                        summary = content_item.get('text', '').strip()
                        with open(log_file, 'a', encoding='utf-8') as f:
                            f.write(f"{datetime.now()}: Text summary generated: {summary[:100]}...\n")
                        return summary

        return None

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: summarize_text error: {str(e)}\n")
        return None


def generate_ai_summary(entry_type, entry, file_path, api_key, prompts=None):
    """
    Route to the appropriate AI summary function based on entry type.

    Dispatches to specialised summary functions depending on content type:
    - Images/screenshots: Vision analysis
    - Audio: Whisper transcription + analysis
    - Documents: Text extraction + summarisation
    - Links: Web browsing + summarisation
    - Text: Direct summarisation

    Args:
        entry_type (str): Type of entry ('screenshot', 'audio', 'pdf', etc.).
        entry (dict): Entry data with notes, selectedText, url, etc.
        file_path (str|None): Path to associated file, if any.
        api_key (str): OpenAI API key.
        prompts (dict|None): Custom prompts for each summary type.

    Returns:
        str|None: Generated summary text, or None if skipped/failed.
    """
    log_file = Path(__file__).parent / 'host.log'
    prompts = prompts or {}

    try:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Generating AI summary for type: {entry_type}\n")

        # Skip types that don't need summary
        if entry_type in NO_SUMMARY_TYPES:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: Skipping AI summary for type: {entry_type}\n")
            return None

        if entry_type in IMAGE_TYPES:
            if file_path:
                return summarize_image(file_path, api_key, prompts.get('image'))
        elif entry_type in RESEARCH_TYPES:
            notes = entry.get('notes', '')
            if notes:
                return summarize_with_research(notes, api_key, prompts.get('research'))
        elif entry_type in AUDIO_TYPES:
            if file_path:
                notes = entry.get('notes', '')
                return summarize_audio(file_path, api_key, notes, prompts.get('audio'))
        elif entry_type in DOCUMENT_TYPES:
            if file_path:
                return summarize_document(file_path, entry_type, api_key, prompts.get('document'))
        elif entry_type in TEXT_TYPES:
            return summarize_text(entry, api_key, prompts.get('text'))
        elif entry_type in LINK_TYPES:
            return summarize_link(entry, api_key, prompts.get('link'), prompts.get('text'))
        else:
            # Default: try text summary for unknown types
            return summarize_text(entry, api_key, prompts.get('text'))

        return None

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: generate_ai_summary error: {str(e)}\n")
        return None


def add_summary_to_entry(project_folder, timestamp, summary):
    """Add AI Summary metadata line to an existing kb.md entry."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            return False

        folder_path = result
        kb_file = folder_path / 'kb.md'

        if not kb_file.exists():
            return False

        with open(kb_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Find entry with matching timestamp
        i = 0
        while i < len(lines):
            if f'`{timestamp}`' in lines[i]:
                # Found entry - find where to insert summary (after classification)
                j = i + 1
                insert_pos = j

                while j < len(lines):
                    if lines[j].startswith('- '):
                        # Hit next entry
                        insert_pos = j
                        break
                    elif lines[j].strip() == '':
                        # Hit blank line (end of entry)
                        insert_pos = j
                        break
                    j += 1
                else:
                    insert_pos = len(lines)

                # Clean up summary (remove newlines, keep full content)
                clean_summary = ' '.join(summary.split())

                # Insert summary line
                lines.insert(insert_pos, f"  - AI Summary: {clean_summary}\n")

                # Write back
                with open(kb_file, 'w', encoding='utf-8') as f:
                    f.writelines(lines)

                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(f"{datetime.now()}: AI Summary added for {timestamp}\n")

                return True

            i += 1

        return False

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: add_summary_to_entry error: {str(e)}\n")
        return False


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


def format_markdown_entry(entry, screenshot_path=None, file_path=None, classification=None):
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
        for line in text_lines:
            lines.append(f"  - > {line}")

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
            for line in note_lines[1:]:
                lines.append(f"    {line}")

    # Add page metadata if present (optional fields)
    page_meta = entry.get('pageMetadata')
    if page_meta:
        desc = page_meta.get('description', '').strip()
        og_image = page_meta.get('ogImage', '').strip()
        author = page_meta.get('author', '').strip()
        pub_date = page_meta.get('publishedDate', '').strip()
        read_time = page_meta.get('readingTime')

        if desc:
            # Truncate long descriptions
            if len(desc) > 200:
                desc = desc[:197] + '...'
            lines.append(f"  - Description: {desc}")
        if og_image:
            lines.append(f"  - Image: {og_image}")
        if author:
            lines.append(f"  - Author: {author}")
        if pub_date:
            lines.append(f"  - Published: {pub_date}")
        if read_time and read_time > 0:
            lines.append(f"  - ReadTime: {read_time} min")

    # Add AI classification metadata if present
    if classification:
        entity = classification.get('entity', '')
        topics = classification.get('topics', [])
        people = classification.get('people', [])

        if entity:
            lines.append(f"  - Entity: {entity}")
        if topics:
            lines.append(f"  - Topics: {', '.join(topics)}")
        if people:
            lines.append(f"  - People: {', '.join(people)}")

    lines.append('')  # Single blank line between entries

    return '\n'.join(lines)


def save_screenshot(project_folder, screenshot_data_url, timestamp):
    """Save screenshot image to file."""
    log_file = Path(__file__).parent / 'host.log'
    try:
        # Validate project folder
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: Screenshot validation error: {result}\n")
            return None

        folder_path = result  # result is the validated Path object
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
        # Validate project folder
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: File save validation error: {result}\n")
            return None

        folder_path = result  # result is the validated Path object
        files_folder = folder_path / 'files'
        files_folder.mkdir(exist_ok=True)

        # Extract base64 data from data URL (format: data:mime/type;base64,...)
        if ',' in file_data_url:
            base64_data = file_data_url.split(',', 1)[1]
        else:
            base64_data = file_data_url

        # Decode base64 to binary
        file_data = base64.b64decode(base64_data)

        # Sanitize filename to prevent path traversal
        safe_base = sanitize_filename(filename)

        # Generate filename with timestamp to avoid collisions
        name_parts = safe_base.rsplit('.', 1)
        if len(name_parts) == 2:
            base_name, extension = name_parts
            safe_filename = f"{base_name}_{timestamp.replace(' ', '_').replace(':', '-')}.{extension}"
        else:
            safe_filename = f"{safe_base}_{timestamp.replace(' ', '_').replace(':', '-')}"

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


def append_to_kb(project_folder, entry, api_key=None):
    """Append entry to kb.md file (at the top) with optional AI classification."""
    try:
        # Validate project folder
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            return {'success': False, 'error': result}

        folder_path = result  # result is the validated Path object

        # Validate entry structure
        is_valid, error = validate_entry(entry)
        if not is_valid:
            return {'success': False, 'error': error}

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

        # Format entry WITHOUT classification (classification runs in background via separate call)
        new_content = format_markdown_entry(entry, screenshot_path, file_path, classification=None)

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

        # Return success and background task info
        # main() will send response first, then run background processing
        # Include file path for AI summary (screenshot or uploaded file)
        saved_file_path = screenshot_path or file_path  # Relative path like "screenshots/file.png"
        return {
            'success': True,
            'file': str(kb_file),
            '_background_task': {
                'project_folder': project_folder,
                'timestamp': entry['captured'],
                'entry': entry,
                'api_key': api_key,
                'file_path': str(folder_path / saved_file_path) if saved_file_path else None
            } if api_key else None
        }

    except Exception as e:
        return {'success': False, 'error': str(e)}


def update_last_entry(project_folder, timestamp, new_content):
    """Update the content of the most recent entry with matching timestamp."""
    try:
        # Validate project folder
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            return {'success': False, 'error': result}

        folder_path = result  # result is the validated Path object

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


def update_entry_notes(project_folder, timestamp, new_notes):
    """Update the Notes: line of an entry with matching timestamp."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        # Validate project folder
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            return False

        folder_path = result
        kb_file = folder_path / 'kb.md'

        if not kb_file.exists():
            return False

        with open(kb_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Find entry with matching timestamp
        updated = False
        i = 0
        while i < len(lines):
            if f'`{timestamp}`' in lines[i]:
                # Found entry - look for Notes: line and any continuation lines
                j = i + 1
                notes_start = -1
                notes_end = -1

                while j < len(lines):
                    if lines[j].startswith('  - Notes:'):
                        notes_start = j
                        notes_end = j + 1
                        # Find continuation lines (4-space indent, not starting with "  - ")
                        while notes_end < len(lines):
                            if lines[notes_end].startswith('    ') and not lines[notes_end].startswith('  - '):
                                notes_end += 1
                            else:
                                break
                        break
                    elif lines[j].startswith('- ') or lines[j].strip() == '':
                        # Hit next entry or blank line - no notes found
                        break
                    j += 1

                # Build new notes lines
                note_lines_list = [line.strip() for line in new_notes.split('\n') if line.strip()]
                new_note_lines = []
                if note_lines_list:
                    new_note_lines.append(f"  - Notes: {note_lines_list[0]}\n")
                    for line in note_lines_list[1:]:
                        new_note_lines.append(f"    {line}\n")

                if notes_start >= 0:
                    # Replace existing notes (including continuation lines)
                    lines[notes_start:notes_end] = new_note_lines
                    updated = True
                elif new_notes.strip():
                    # Insert new notes after selected text, screenshots, attachments
                    insert_pos = i + 1
                    while insert_pos < len(lines):
                        line = lines[insert_pos]
                        if line.startswith('  - >') or line.startswith('  - ![') or line.startswith('  - ['):
                            insert_pos += 1
                        else:
                            break
                    for idx, note_line in enumerate(new_note_lines):
                        lines.insert(insert_pos + idx, note_line)
                    updated = True

                break
            i += 1

        if updated:
            with open(kb_file, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: Notes updated for {timestamp}\n")
            return True

        return False

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: update_entry_notes error: {str(e)}\n")
        return False


def background_process_entry(project_folder, timestamp, entry, api_key, file_path=None):
    """
    Background thread for AI processing pipeline.

    Runs after the initial save returns to the UI, performing:
    1. Grammar correction on user notes
    2. AI summary generation (type-specific)
    3. Classification (entity, topics, people extraction)

    Each step's results are written back to kb.md incrementally.
    Prompts are loaded from settings.json file.

    Args:
        project_folder (str): Path to project folder containing kb.md.
        timestamp (str): Entry timestamp for identification.
        entry (dict): Original entry data.
        api_key (str): OpenAI API key.
        file_path (str|None): Path to associated file for summarisation.
    """
    log_file = Path(__file__).parent / 'host.log'

    try:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Background thread started for {timestamp}\n")

        # Load custom prompts from settings.json
        settings = load_settings()
        classification_prompt = get_prompt(settings, 'classification_prompt', DEFAULT_CLASSIFICATION_PROMPT)
        grammar_prompt = get_prompt(settings, 'grammar_prompt', DEFAULT_GRAMMAR_PROMPT)

        # Load all summary prompts
        summary_prompts = {
            'image': get_prompt(settings, 'image_prompt', DEFAULT_IMAGE_PROMPT),
            'audio': get_prompt(settings, 'audio_prompt', DEFAULT_AUDIO_PROMPT),
            'document': get_prompt(settings, 'document_prompt', DEFAULT_DOCUMENT_PROMPT),
            'link': get_prompt(settings, 'link_prompt', DEFAULT_LINK_PROMPT),
            'text': get_prompt(settings, 'text_prompt', DEFAULT_TEXT_PROMPT),
            'research': get_prompt(settings, 'research_prompt', DEFAULT_RESEARCH_PROMPT),
        }

        notes = entry.get('notes', '').strip()

        # STEP 1: Grammar fix (faster) - only fix notes, not selectedText
        if notes and api_key:
            fixed_notes = fix_grammar_openai(notes, entry, api_key, grammar_prompt)
            if fixed_notes and fixed_notes != notes:
                update_entry_notes(project_folder, timestamp, fixed_notes)
                # Update entry dict for later steps to use corrected notes
                entry['notes'] = fixed_notes

        # STEP 2: AI Summary (before classification so summary can inform classification)
        summary = None
        if api_key:
            entry_type = entry.get('type', '')
            summary = generate_ai_summary(entry_type, entry, file_path, api_key, summary_prompts)
            if summary:
                add_summary_to_entry(project_folder, timestamp, summary)

        # STEP 3: Classification (uses notes + summary for better context)
        if api_key:
            existing_topics = load_topics(project_folder)
            existing_entities = load_entities(project_folder)
            classification = classify_entry(entry, api_key, existing_topics, existing_entities, summary, classification_prompt)

            if classification:
                # Save topics/entities to JSON files
                new_topics = classification.get('topics', [])
                new_entities = classification.get('people', [])

                if new_topics:
                    save_topics(project_folder, existing_topics + new_topics)
                if new_entities:
                    save_entities(project_folder, existing_entities + new_entities)

                # Add classification metadata to kb.md entry
                add_classification_to_entry(project_folder, timestamp, classification)

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Background thread completed for {timestamp}\n")

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Background thread error: {str(e)}\n")


def add_classification_to_entry(project_folder, timestamp, classification):
    """Add Entity/Topics/People metadata lines to an existing kb.md entry."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            return False

        folder_path = result
        kb_file = folder_path / 'kb.md'

        if not kb_file.exists():
            return False

        with open(kb_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Find entry with matching timestamp
        i = 0
        while i < len(lines):
            if f'`{timestamp}`' in lines[i]:
                # Found entry - find where to insert classification
                j = i + 1
                insert_pos = j

                while j < len(lines):
                    if lines[j].startswith('- '):
                        # Hit next entry
                        insert_pos = j
                        break
                    elif lines[j].strip() == '':
                        # Hit blank line (end of entry)
                        insert_pos = j
                        break
                    j += 1
                else:
                    insert_pos = len(lines)

                # Build classification lines
                class_lines = []
                entity = classification.get('entity', '')
                topics = classification.get('topics', [])
                people = classification.get('people', [])

                if entity:
                    class_lines.append(f"  - Entity: {entity}\n")
                    # If classified as task, add default Status for kanban board
                    if entity == 'task':
                        class_lines.append(f"  - Status: not-started\n")
                if topics:
                    class_lines.append(f"  - Topics: {', '.join(topics)}\n")
                if people:
                    class_lines.append(f"  - People: {', '.join(people)}\n")

                # Insert classification lines
                for idx, cl in enumerate(class_lines):
                    lines.insert(insert_pos + idx, cl)

                # Write back
                with open(kb_file, 'w', encoding='utf-8') as f:
                    f.writelines(lines)

                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(f"{datetime.now()}: Classification added for {timestamp}: {classification}\n")

                return True

            i += 1

        return False

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: add_classification_to_entry error: {str(e)}\n")
        return False


def classify_and_update_entry(project_folder, timestamp, entry, api_key):
    """Classify entry and update kb.md with Entity/Topics/People metadata (background process)."""
    log_file = Path(__file__).parent / 'host.log'

    try:
        # Validate project folder
        is_valid, result = validate_project_folder(project_folder)
        if not is_valid:
            return {'success': False, 'error': result}

        folder_path = result
        kb_file = folder_path / 'kb.md'

        if not kb_file.exists():
            return {'success': False, 'error': 'kb.md file does not exist'}

        # Load existing topics and entities
        existing_topics = load_topics(project_folder)
        existing_entities = load_entities(project_folder)

        # Perform AI classification
        classification = classify_entry(entry, api_key, existing_topics, existing_entities)

        if not classification:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: Classification returned no result for {timestamp}\n")
            return {'success': True, 'message': 'No classification data'}

        # Update topics and entities JSON files
        new_topics = classification.get('topics', [])
        new_entities = classification.get('people', [])

        if new_topics:
            save_topics(project_folder, existing_topics + new_topics)
        if new_entities:
            save_entities(project_folder, existing_entities + new_entities)

        # Read kb.md and find entry by timestamp
        with open(kb_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Find the entry with matching timestamp and add classification metadata
        updated = False
        i = 0
        while i < len(lines):
            line = lines[i]

            if f'`{timestamp}`' in line:
                # Found the entry - find where to insert classification metadata
                # Look for end of this entry (next main entry line or end of file)
                j = i + 1
                insert_pos = j

                while j < len(lines):
                    if lines[j].startswith('- '):
                        # Hit next entry
                        insert_pos = j
                        break
                    elif lines[j].strip() == '':
                        # Hit blank line (end of entry)
                        insert_pos = j
                        break
                    j += 1
                else:
                    insert_pos = len(lines)

                # Build classification lines
                class_lines = []
                entity = classification.get('entity', '')
                topics = classification.get('topics', [])
                people = classification.get('people', [])

                if entity:
                    class_lines.append(f"  - Entity: {entity}\n")
                if topics:
                    class_lines.append(f"  - Topics: {', '.join(topics)}\n")
                if people:
                    class_lines.append(f"  - People: {', '.join(people)}\n")

                # Insert classification lines before blank line / next entry
                for idx, cl in enumerate(class_lines):
                    lines.insert(insert_pos + idx, cl)

                updated = True
                break

            i += 1

        if updated:
            with open(kb_file, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()}: Classification metadata added for {timestamp}\n")
            return {'success': True, 'message': 'Classification added', 'classification': classification}
        else:
            return {'success': False, 'error': f'Entry with timestamp {timestamp} not found'}

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: classify_and_update_entry error: {str(e)}\n")
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


def browse_folder():
    """Open folder picker dialog and return selected path."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()  # Hide main window
        root.attributes('-topmost', True)  # Bring dialog to front

        folder = filedialog.askdirectory(title="Select UltraThink Project Folder")
        root.destroy()

        if folder:
            # Normalize to Windows path with trailing backslash
            folder = folder.replace('/', '\\')
            if not folder.endswith('\\'):
                folder += '\\'
            return {'success': True, 'path': folder}
        return {'success': False, 'error': 'No folder selected'}
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
                api_key = message.get('apiKey')  # API key for AI classification
                # Note: prompts are now read from settings.json by background_process_entry

                result = append_to_kb(project_folder, entry, api_key)

                # Extract background task before sending (don't send internal field to extension)
                background_task = result.pop('_background_task', None)

                # Send response immediately so UI is unblocked
                send_message(result)

                # Now run background processing (grammar + classification + summary)
                # Prompts are read from settings.json by background_process_entry
                if background_task:
                    try:
                        background_process_entry(
                            background_task['project_folder'],
                            background_task['timestamp'],
                            background_task['entry'],
                            background_task['api_key'],
                            background_task.get('file_path')
                        )
                    except Exception as bg_error:
                        with open(log_file, 'a', encoding='utf-8') as f:
                            f.write(f"{datetime.now()}: Background processing error: {str(bg_error)}\n")

                continue  # Skip the send_message at the end since we already sent
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
            elif message.get('action') == 'browse_folder':
                result = browse_folder()
                send_message(result)
            elif message.get('action') == 'classify_entry':
                # Background classification - called after grammar fix completes
                project_folder = message.get('projectFolder')
                timestamp = message.get('timestamp')
                entry = message.get('entry')
                api_key = message.get('apiKey')

                result = classify_and_update_entry(project_folder, timestamp, entry, api_key)
                send_message(result)
            elif message.get('action') == 'search_github':
                # Search GitHub for issues/commits related to a query
                query = message.get('query')
                github_token = message.get('githubToken')
                repos = message.get('githubRepos')
                max_results = message.get('maxResults', 10)

                result = search_github(query, github_token, repos, max_results)
                send_message(result)
            else:
                send_message({'success': False, 'error': 'Unknown action'})

    except Exception as e:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(f"{datetime.now()}: Error: {str(e)}\n")
        send_message({'success': False, 'error': str(e)})


if __name__ == '__main__':
    main()
