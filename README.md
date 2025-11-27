# UltraThink URL Saver

A powerful Microsoft Edge extension that captures URLs, text snippets, screenshots, and files directly to a markdown knowledge base file (`kb.md`). Features AI-powered grammar correction, smart type detection, a web-based knowledge base viewer with kanban boards, and external service integrations.

## Features

### Core Functionality
- **One-click saving**: Click the extension icon or use keyboard shortcuts
- **Auto-save timer**: Automatically saves after 3 seconds (resets on interaction)
- **Smart capture**: Automatically detects and saves selected text as snippets
- **Screenshot capture**: Full page or area selection with Ctrl+Shift+5
- **Bulk tab saving**: Save all tabs in current window at once
- **Tab groups support**: Preserves browser tab group names and colors as metadata

### Knowledge Base Viewer (`kb-viewer.html`)
- **Tabulator data grid**: Sortable, filterable table of all entries
- **Multiple views**: All Entries, Tasks, Topics, People, Visualise, Search
- **Kanban board**: Drag-and-drop task management with customisable columns
- **Network visualisation**: Interactive vis.js graph showing connections between entries, topics, and people
- **Modal details**: Full entry view with AI summaries, notes, and metadata
- **External search**: Search GitHub issues and commits directly from the viewer

### Intelligent Detection
- **Smart URL type detection**: Automatically detects content type from URL:
  - AI conversations (Claude, ChatGPT, Perplexity)
  - Microsoft Office docs (Word, Excel, PowerPoint, OneNote)
  - Notion pages
  - Videos (YouTube, Vimeo)
  - Generic links, snippets, and ideas

### AI-Powered Enhancement
- **Grammar correction**: Automatic spelling and grammar fixes using OpenAI GPT-5-nano
- **AI summaries**: Content-type-specific summaries for all entries
  - Images/screenshots: GPT-5 vision analysis
  - Audio: Whisper transcription + analysis with speaker identification
  - Documents: PDF/Markdown/Office content extraction and summarisation
  - Links: Web search + summarisation with sources
  - Long-notes: Contextual research using web search
- **Classification**: Automatic entity (project/task/knowledge), topics, and people extraction
- **Context-aware**: Sends page URL, title, type, and tab group to AI for domain-specific processing
- **Background processing**: All AI work happens after save, so UI responds instantly

### Kanban Board
- **Task management**: Toggle between list and board views on the Tasks page
- **Drag & drop**: Move task cards between columns to update status
- **Default columns**: Not started, In progress, Done
- **Custom columns**: Add your own columns via "+ Add Column" button
- **Inline editing**: Click column name to rename, double-click color bar to change color
- **Delete columns**: Custom columns can be deleted (if empty) via trash icon
- **Persistence**: Status saved to kb.md as `Status: column-id`

### External Service Search
- **GitHub integration**: Search repositories, code, issues, and commits across your repos
- **Notion integration**: Search pages and databases shared with your integration
- **Fastmail integration**: Search emails via JMAP protocol
- **Capsule CRM integration**: Search contacts, organisations, opportunities, tasks, and projects
- **Unified search**: Search multiple services from one interface

### Desktop Widget
- **Always-on-top**: PyQt6-based floating widget for quick captures
- **Audio recording**: Microphone and system audio capture
- **Screenshot capture**: Full screen or area selection
- **Multi-tab notes**: Expandable editor with markdown formatting toolbar

### Content Types
- **link**: Web page URLs
- **snippet**: Selected text from pages
- **para**: Longer text passages
- **idea**: Quick notes and thoughts
- **screenshot**: Full page or area captures
- **file**: Dropped or pasted files
- **ms-word**, **ms-excel**, **ms-powerpoint**, **ms-onenote**: Microsoft Office documents
- **notion**: Notion pages
- **video**: Video content
- **audio**: Audio recordings
- **chatgpt**, **claude**, **perplexity**: AI conversation threads

### User Experience
- **Keyboard shortcuts**:
  - `Ctrl+Shift+4` (Mac: `Cmd+Shift+4`): Open save popup
  - `Ctrl+Shift+5` (Mac: `Cmd+Shift+5`): Capture screenshot
- **Pin toggle**: Circle icon launches desktop widget for quick captures
- **Instant close**: Clicking pin icon closes popup immediately (no accidental saves)
- **Metadata tracking**: Each entry includes type, timestamp, source URL, and tab group info
- **Newest first**: New entries appear at the top of the file

## File Structure

```
ultrathink/
├── ultrathink-extension/       # Browser extension
│   ├── manifest.json            # Extension configuration (v2.2.0)
│   ├── popup.html/js            # Main popup interface
│   ├── background.js            # Service worker, native messaging
│   ├── selection-overlay.js     # Screenshot area selection
│   ├── page-metadata.js         # Page metadata extraction
│   ├── options.html/js          # Settings page
│   ├── logger.js                # Centralized logging utility
│   ├── shared-constants.js      # Shared constants and utilities
│   └── icons/                   # Extension icons
├── native-host/                 # Native messaging host
│   ├── host.py                  # Python script for file I/O and AI processing
│   ├── widget.pyw               # Desktop widget (PyQt6)
│   ├── settings.json            # API keys and configuration
│   ├── host.bat                 # Windows launcher
│   ├── com.ultrathink.kbsaver.json  # Native host manifest
│   ├── install.bat              # Installation script
│   └── uninstall.bat            # Uninstallation script
├── kb-server.py                 # HTTP server for knowledge base viewer
├── kb-viewer.html               # Web-based knowledge base UI
├── kb-viewer.js                 # Viewer JavaScript (Tabulator, vis.js)
├── kb.md                        # Knowledge base markdown file
├── topics.json                  # Extracted topics
├── entities.json                # Extracted people/entities
└── kanban-columns.json          # Kanban board column configuration
```

## Prerequisites

- Windows 10/11
- Microsoft Edge (Chromium-based) or Google Chrome
- Python 3.x installed and in PATH
- OpenAI API key (for AI features)
- Optional: GitHub Personal Access Token (for GitHub search)
- Optional: Notion Internal Integration Token (for Notion search)
- Optional: Fastmail API Token (for email search)
- Optional: Capsule CRM API Token (for CRM search)

## Installation

### Step 1: Generate Icons (Optional)

```bash
cd ultrathink-extension/icons
pip install pillow
python generate_icons.py
```

### Step 2: Load Extension in Edge/Chrome

1. Open `edge://extensions/` or `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `ultrathink-extension` folder
5. **Copy the Extension ID** (you'll need it in the next step)

### Step 3: Configure Native Host

1. Open `native-host/com.ultrathink.kbsaver.json`
2. Update line 7 with your extension ID:
   ```json
   "chrome-extension://YOUR_EXTENSION_ID_HERE/"
   ```
3. Save the file

### Step 4: Install Native Host

1. Open Command Prompt or PowerShell **as Administrator**
2. Navigate to the `native-host` folder
3. Run the installer:
   ```cmd
   install.bat
   ```

### Step 5: Configure Settings

1. Right-click the extension icon → **Options**
2. Set your project folder path
3. Enter your OpenAI API key
4. Click **Save Settings**

### Step 6: Configure GitHub Search (Optional)

1. Create a GitHub Personal Access Token at https://github.com/settings/tokens
2. Edit `native-host/settings.json`:
   ```json
   {
     "openai_key": "sk-...",
     "github_token": "ghp_...",
     "github_repos": "owner/repo1, owner/repo2"
   }
   ```

### Step 7: Configure Notion Search (Optional)

1. Create a Notion Internal Integration at https://www.notion.so/my-integrations
2. Share the pages/databases you want to search with the integration
3. Add to `native-host/settings.json`:
   ```json
   {
     "notion_token": "secret_..."
   }
   ```

### Step 8: Configure Fastmail Search (Optional)

1. Create an API Token at Fastmail Settings > API Tokens
2. Add to `native-host/settings.json`:
   ```json
   {
     "fastmail_token": "fmu1-..."
   }
   ```

### Step 9: Configure Capsule CRM Search (Optional)

1. Log into Capsule CRM
2. Go to My Preferences > API Authentication Tokens
3. Create a new token
4. Add to `native-host/settings.json`:
   ```json
   {
     "capsule_token": "your-token-here"
   }
   ```

## Usage

### Quick Save

1. Navigate to any webpage
2. Press `Ctrl+Shift+4` or click the extension icon
3. Wait 3 seconds for auto-save, or edit and wait

### Screenshot Capture

**Full page:** Press `Ctrl+Shift+5`

**Area selection:**
1. Press `Ctrl+Shift+5`
2. Click and drag to select area
3. Press `Enter` or double-click to capture
4. Press `Esc` to cancel

### Knowledge Base Viewer

1. Run the server: `python3 kb-server.py`
2. Browser opens automatically to `http://localhost:8080`
3. Use sidebar to navigate between views
4. Click entries to see full details in modal

### Kanban Board

1. Go to **Tasks** in the sidebar
2. Click **Board** toggle to switch from list view
3. Drag cards between columns to update status
4. Click column name to rename
5. Double-click color bar to change column color
6. Click **+ Add Column** to create custom columns

### External Search

1. Go to **Search** in the sidebar
2. Enter search query
3. Check services to search (GitHub, etc.)
4. Click **Search** to find related issues and commits

### Entry Format

Each entry in `kb.md` looks like this:

```markdown
- `link` | `browser` | `2025-11-27 10:30:45` | [Article Title](https://example.com)
  - Notes: My notes about this article
  - Entity: knowledge
  - Topics: AI, Machine Learning
  - People: John Smith
  - AI Summary: A comprehensive guide to machine learning fundamentals...
  - Description: Page meta description
  - Author: Jane Doe
  - Published: 2025-01-15
  - Status: not-started
```

## API Reference

### Server Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/entries` | Get all kb.md entries |
| GET | `/api/entries/<timestamp>` | Get single entry |
| PATCH | `/api/entries` | Update entry status |
| DELETE | `/api/entries` | Delete entry |
| GET | `/api/topics` | Get all topics |
| GET | `/api/entities` | Get all people/entities |
| GET | `/api/kanban-columns` | Get kanban columns |
| POST | `/api/kanban-columns` | Add kanban column |
| PUT | `/api/kanban-columns` | Replace all columns |
| DELETE | `/api/kanban-columns` | Delete column |
| POST | `/api/search/github` | Search GitHub |

### Native Messaging Protocol

**Save entry:**
```json
{
  "action": "append",
  "projectFolder": "C:\\path\\to\\project\\",
  "entry": {
    "type": "link",
    "captured": "2025-11-27 10:30:45",
    "source": "https://example.com",
    "title": "Page Title",
    "notes": "User notes",
    "selectedText": "Selected text from page",
    "tabGroup": { "groupName": "Research", "groupColor": "blue" },
    "screenshot": "data:image/png;base64,...",
    "metadata": { "description": "...", "author": "..." }
  },
  "apiKey": "sk-..."
}
```

## Troubleshooting

### Extension can't connect to native host

1. Verify extension ID matches in `com.ultrathink.kbsaver.json`
2. Run `install.bat` as Administrator
3. Check registry: `HKEY_CURRENT_USER\Software\Microsoft\Edge\NativeMessagingHosts\com.ultrathink.kbsaver`
4. Check `native-host/host.log` for errors

### AI features not working

1. Verify OpenAI API key in extension Options
2. Check API key has credits at https://platform.openai.com
3. Check `native-host/host.log` for API errors

### GitHub search not working

1. Add `github_token` to `native-host/settings.json`
2. Ensure token has `repo` scope for private repos
3. Add repos to `github_repos` field (comma-separated)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  popup.js   │  │   widget     │  │  selection-      │   │
│  │ - UI logic  │  │ (PyQt6)      │  │  overlay.js      │   │
│  │ - Auto-save │  │ - Audio      │  │ - Area select    │   │
│  └──────┬──────┘  │ - Screenshot │  └────────┬─────────┘   │
│         │         └──────┬───────┘           │             │
│         └────────────────┴───────────────────┘             │
│                          │                                 │
│                          ▼                                 │
│              ┌───────────────────────┐                     │
│              │   background.js       │                     │
│              │  (Service Worker)     │                     │
│              └───────────┬───────────┘                     │
└──────────────────────────┼─────────────────────────────────┘
                           │ Chrome Native Messaging API
                           ▼
          ┌────────────────────────────────┐
          │     host.py (Native Host)      │
          │ - File I/O (kb.md)             │
          │ - AI Processing Pipeline       │
          │   - Grammar correction         │
          │   - AI summaries               │
          │   - Classification             │
          └────────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────┐
          │       kb-server.py             │
          │ - HTTP API for viewer          │
          │ - GitHub search integration    │
          │ - CRUD operations              │
          └────────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────┐
          │     kb-viewer.html/js          │
          │ - Tabulator grid               │
          │ - Kanban board                 │
          │ - vis.js network graph         │
          │ - External search UI           │
          └────────────────────────────────┘
```

## Version History

- **v2.3.0** (Current)
  - Capsule CRM integration: Search contacts, organisations, opportunities, tasks, and projects
  - New Capsule CRM checkbox in Search page
  - Configurable via `capsule_token` in `native-host/settings.json`

- **v2.2.0**
  - Customisable AI prompts: Edit classification and grammar prompts in extension settings
  - Collapsible prompt sections with placeholder tags ({title}, {content}, etc.)
  - Reset to default buttons for prompt customisation
  - Multi-monitor widget support: Click monitor icon to show widget on all screens
  - Mirror widgets on secondary monitors forward drops to main widget
  - Real-time API logs page in kb-viewer for debugging external calls
  - Logs show timestamp, service, status, duration, request/response data

- **v2.1.0**
  - GitHub integration: Search issues and commits from your GitHub repos
  - New Search page in viewer for external service search
  - Kanban improvements: Click-to-rename columns, color picker on double-click
  - Delete icon for custom columns (disabled if tasks present)
  - Sentence case on default columns (Not started, In progress, Done)
  - Link AI prompt now explicitly searches web and cites sources
  - PUT /api/kanban-columns endpoint for saving all columns

- **v2.0.2**
  - Code quality improvements: Added JSDoc documentation across JS files
  - Refactored global state in kb-viewer.js to use module pattern (AppState, AiPollingState, VisState)
  - Added comprehensive docstrings to host.py key functions
  - Better code organisation with state containers to prevent race conditions

- **v2.0.1**
  - AI processing indicator: Spinner shows in modal when AI Summary is being generated
  - Modal polls API every 5 seconds until AI Summary appears (or 2 min timeout)
  - New API endpoint: GET /api/entries/<timestamp> for single entry lookup

- **v2.0.0**
  - Kanban board view for Tasks page: toggle between List and Board views
  - Drag-and-drop task cards between columns to update status
  - Default columns: Not Started, In Progress, Done
  - Add custom columns via + Add Column button
  - Task status persisted in kb.md as `Status: column-id`
  - New API endpoints: PATCH /api/entries, GET/POST/DELETE /api/kanban-columns

- **v1.9.x**
  - Visualisation: Interactive network graph with vis.js
  - Entity filter, stats panel, legend panel
  - Enhanced link summaries with web search and sources

- **v1.8.x**
  - Widget formatting toolbar with rich text
  - Copy buttons for notes and AI summaries
  - Multi-tab long notes in expanded mode

- **v1.7.x**
  - AI Summary feature for all entry types
  - Background processing moved to Python for reliability
  - Page metadata extraction (description, og:image, author, etc.)

- **v1.6.x**
  - Race condition fix: UI returns immediately
  - Spelling/grammar check before classification

- **v1.5.x**
  - Markdown formatting toolbar
  - Manual save in expanded mode

- **v1.4.x**
  - Expand notes button
  - High-DPI screenshot fix

- **v1.3.x**
  - Centralized logging with debug flag
  - Security fixes (XSS, path traversal)
  - New markdown format with separate fields

- **v1.2.x**
  - Pinned drop target dialog
  - Background grammar correction
  - Context-enhanced AI

- **v1.1.x**
  - Screenshot capture
  - Tab groups support
  - Bulk save all tabs

- **v1.0.0**
  - Initial release

## Contributing

This is a personal project for internal use at Fifty-Five-and-Five. For questions or suggestions, contact the development team.

## License

Proprietary - Fifty-Five-and-Five organization.

## Future Ideas

- [ ] Firefox support
- [ ] Cloud sync
- [ ] OCR for screenshot text extraction
- [ ] Notion integration
- [ ] Fastmail/Email integration
- [ ] Microsoft 365 integration
- [ ] Mobile companion app
