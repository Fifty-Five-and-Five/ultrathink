# UltraThink URL Saver

## TODO
- [ ] Fix table column squishing on page navigation (Tabulator redraw timing issue)

---

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

- **v3.3.16** (Current) - Add browser console logging for AI pipeline
  - New AI logger module in background.js for consistent logging
  - Logs entry details, metadata extraction, and AI pipeline steps
  - Shows expected AI processing (summary type, classification, relationships)
  - Timestamps correlate with host.log for debugging

- **v3.3.15** - Move dark mode toggle to header
  - Dark mode icon now in top-right of header
  - Version number moved to sit right of "Ultrathink" text

- **v3.3.14** - Add model/web info to settings prompts UI
  - Each prompt textarea now shows: model name, web search status, applicable entry types

- **v3.3.13** - Enable web search for text summaries
  - `summarize_text` now uses `gpt-5` with web search (was `gpt-5-nano` without web)
  - Applies to snippet, paragraph, claude, chatgpt, perplexity, notion, long-note types
  - Increased timeout to 90s to allow for web search

- **v3.3.12** - Fix page navigation bug
  - Added missing `.classList.remove('active')` for settingsPage and visualise2Page
  - Fixes old page content bleeding through when navigating between pages

- **v3.3.11** - Merge grammar correction into classification call
  - Grammar correction now done in same API call as classification (saves 1 API call per entry)
  - Removed separate `fix_grammar_openai()` function and `grammar_prompt`
  - Classification prompt now includes grammar correction and returns `corrected_notes`

- **v3.3.10** - Topics/People list width
  - Management list now max-width 50% instead of full width

- **v3.3.9** - Topics/People pages UI improvements
  - Moved "Add new" input to top of page, shorter width, no indent
  - Fixed dark mode: all hardcoded colors now use CSS variables

- **v3.3.8** - Settings dark mode fix, remove work/personal prompt UI
  - Fixed settings panel white background in dark mode (now uses CSS variables)
  - Removed Work/Personal classification prompt textarea (merged into classification prompt)

- **v3.3.7** - Fix row hover in dark mode
  - Override Tabulator's cell hover background to transparent
  - Prevents bright white hover on grid rows

- **v3.3.6** - Fix type badge text color for readability
  - Changed type badge text from white to dark gray (#1f2937) for better contrast on pastel backgrounds

- **v3.3.5** - Merge work/personal classification into main classification call
  - Combined work/personal classification with entity/topics/people classification in single API call
  - Reduces API calls by 1 per entry, saves tokens and improves processing speed
  - Removed separate `classify_work_personal()` function and `work_personal_prompt`

- **v3.3.4** - Fix duplicate entries in filter dropdowns
  - `populateFilters()` now clears existing options before adding new ones
  - Prevents duplicates accumulating on each data refresh

- **v3.3.3** - Fix dark mode grid header
  - Grid header now uses `var(--bg-surface)` instead of hardcoded white

- **v3.3.2** - Fix grid column reset on any refresh
  - `loadEntries()` now uses `replaceData()` instead of recreating table, preserving column visibility
  - Fixes column reset on delete, command palette refresh, and any other data reload

- **v3.3.1** - Fix AI processing bugs, use structured outputs
  - Fixed KeyError bugs in grammar fix, classification, and relationship extraction
  - Converted all AI functions to use OpenAI Structured Outputs for guaranteed valid JSON
  - Removed JSON examples from prompts (schema now defines output format)
  - Grid columns now preserve their visibility when deleting items

- **v3.3.0** - Entity relationships, auto-save on blur
  - Parent/child relationships for sub-notes in long note mode
  - AI-powered relationship extraction from notes (parses references like "related to project X")
  - AI-powered content similarity detection between entries
  - New Related section in detail panel showing parent, children, mentions, and similar entries
  - Widget session tracking for sub-note capture with visual indicator
  - Three new configurable AI prompts for relationship processing
  - **Popup auto-save on focus loss**: Clicking away from popup now immediately saves instead of losing data

- **v3.2.25** - Fix refresh button preserving column visibility
  - Refresh button on Projects, Tasks, Knowledge grids now maintains current column configuration
  - Added `skipColumnReset` parameter to `navigateToPage()` function
  - Previously, refresh would reset columns to page-specific defaults, losing user customizations

- **v3.2.24** - Fix slideover delete button not working
  - Removed dead code referencing non-existent detailOpenUrl/detailCopyUrl buttons
  - This was causing JS error that prevented delete button onclick from being assigned

- **v3.2.23** - Harden all kb.md update functions
  - Added `if status:` checks to `update_entry_status()` for consistency
  - Comprehensive audit confirmed: kb.md is only source of truth
  - All update functions now handle empty values safely

- **v3.2.22** - Fix data loss bug in due date updates
  - Fixed critical bug in `update_entry_duedate()` that lost entry metadata (Notes, Topics, People, etc.)
  - Root cause: buffer not flushed when due_date was empty string
  - Reduced comment "+" button from 12x12 to 6x6

- **v3.2.21** - Fix delete modal callback bug
  - Fixed delete modal showing but not actually deleting (callback was being nulled before execution)
  - Fixes both toolbar delete and slideover delete button

- **v3.2.20** - Fix delete confirmation modal
  - Added missing CSS variables for danger colors (light and dark mode)
  - Toolbar "delete selected" now uses styled modal instead of browser confirm
  - Modal shows entry title for single delete, count for multi-delete

- **v3.2.19** - Nice confirmation modal for delete
  - Replaced browser confirm dialog with styled modal for delete confirmation
  - Shows entry title in confirmation message
  - Modal supports Escape key to cancel
  - Both slideover delete button and inline delete button now use modal

- **v3.2.18** - Refresh button now honors current grid view
  - Fixed refresh button showing all entries instead of respecting filtered view (projects/tasks/knowledge)

- **v3.2.17** - Bug fixes for task data persistence
  - Fixed task data loss when moving on kanban board (lines after Status were lost)
  - Fixed due dates not saving to kb.md (same data loss bug)
  - Fixed comments not saving (simplified add_entry_comment logic)
  - Moved "hide completed" button next to delete button in toolbar
  - Fixed notes text color to black (was warning color)
  - Made comment add button icon smaller (12px)
  - Added proper error handling for comment add failures

- **v3.2.16** - UI polish and comment bug fix
  - Fixed comment add button not working (added missing showToast function)
  - Kanban color bar doubled in height (8px)
  - Removed topics from kanban cards
  - Kanban dates consolidated: "Added x and due y" on single line
  - Add column button moved inline with columns (far right, no gap)
  - Work/personal badge: #ff5200 outline only, no background, black text
  - MY NOTES title now black (not warning color)
  - Status and Due on same line in detail panel, renamed "Due by" to "Due"
  - Removed "No comments yet" placeholder text
  - Comment add button: orange circle with white + icon, bottom right of textarea
  - Added toast notification system for user feedback

- **v3.2.15** - Tasks entity and grid improvements
  - Fixed critical bug where tasks disappeared when moved on kanban board
  - Added due date picker for tasks (stored in kb.md)
  - Added timestamped comments section for tasks
  - Snippet box now yellow like notes section
  - Entity badge hidden on project/task/knowledge pages (shown only on "all")
  - Entity and work/personal badges inline with "Captured by" text
  - Status now clickable text with dropdown (not select element)
  - Tasks grid: hidden topics/people columns, added due date column
  - Kanban cards show due date (with overdue highlighting)
  - Removed "Task Board" text from kanban
  - Kanban title edit field auto-sizes to content
  - Kanban columns: uniform colors, thinner color bar, click header for color picker
  - More pastel color options with hex code input

- **v3.2.14** - Long notes AI processing on exit only
  - AI analysis (grammar, summary, classification) now runs when exiting expanded mode
  - Previously ran on first save, now waits until user finishes the note

- **v3.2.13** - Image analysis web search
  - Added web search capability to image summaries (like link/research summaries)
  - Updated image prompt to mention web search availability
  - Increased image analysis timeout from 60s to 120s

- **v3.2.12** - Fixed screenshot drag selection
  - Added `pointer-events: none` to selection box so mouseup events reach overlay
  - Single click (< 5px) triggers full screen, drag captures region
  - Removed 2-second auto-capture timeout

- **v3.2.8** - Moved type badge to bottom tags bar
  - Type badge (link, screenshot, etc.) now appears first in bottom status bar
  - Alongside topics and people tags for cleaner header area

- **v3.2.7** - AI Summary display improvements
  - Removed "Summary:" prefix from brief summaries
  - Changed headers to lowercase: "Detailed analysis", "Key points", "Paragraph summary"
  - Made Key points collapsible like other sections
  - Combined context and sources into "Content and sources" collapsible
  - Sources now displayed as bulleted list, not comma-separated
  - Strip OpenAI citation artifacts (citeturn...) from all text
  - Reduced paragraph spacing in detailed sections

- **v3.2.6** - Widget minimal mode
  - Added shrink button to widget header (arrows-in icon)
  - Minimal mode: compact view with 40% transparent background
  - Shows only drop zone (single row), notes, and 4 action buttons
  - Double-click to restore to standard view
  - Replaced monitor icon with cleaner desktop icon

- **v3.2.5** - Widget code review fixes
  - Fixed duplicate cleanup handlers in widget.pyw (removed atexit, kept aboutToQuit)
  - Fixed close_widget() in host.py to check taskkill return code before reporting success
  - Added 5-second timeout to popup.js debounce to prevent button lockup on hang

- **v3.2.4** - Wider delete column
  - Increased actions column width from 50px to 60px to prevent text overflow

- **v3.2.3** - Hidden row handle/collapse toggle via CSS
  - Force hidden Tabulator responsive collapse and row handle elements

- **v3.2.2** - Settings UI prompt sync
  - Synced all prompt defaults in Settings page with host.py (v3.2.0 changes)
  - Added work/personal classification prompt to Settings UI
  - Updated placeholder documentation for image/text prompts
  - Removed responsive collapse button from grid

- **v3.2.1** - Fixed search box focus outline
  - Removed orange outline on search box input focus (has its own focus styling)

- **v3.2.0** - AI Structured Outputs
  - All AI prompts updated with improved instructions and {notes} placeholders
  - summarize_audio: structured output (summary, speakers, transcript)
  - summarize_document: multi-level summaries (brief, paragraph, detailed) with entities
  - summarize_link: structured output with key points, context, and sources
  - summarize_text: now uses both selectedText AND notes
  - summarize_with_research: improved formatting with line breaks
  - Frontend updated to parse and display structured JSON summaries

- **v3.1.12** - Fixed widget single-instance check
  - Changed `is_widget_running()` to check for UltraThink window instead of just any Python process
  - Automatically cleans up stale lock files when widget window not found

- **v3.1.11** - Consolidated document summarization
  - All document types now use proper text extraction libraries
  - PDF: PyPDF2, Word: python-docx, Excel: openpyxl, PowerPoint: python-pptx
  - All use gpt-5-nano (fast, cheap) with no web search
  - Consistent 30s timeout across all document types

- **v3.1.10** - Moved delete button next to category toggle
  - Delete button now positioned right of All/Work/Personal toggle for better UX

- **v3.1.9** - Widget crash fix with single-instance protection
  - Fixed Edge crash when rapidly clicking widget button
  - Added lock file with PID tracking in widget.pyw
  - Added state file coordination between host.py and widget
  - Replaced wildcard taskkill with PID-based process termination
  - Added debouncing to popup.js button handler

- **v3.1.8** - Moved dark mode toggle to toolbar
  - Dark mode button now next to refresh and delete buttons in toolbar

- **v3.1.7** - Detail panel spacing fix
  - Removed white gap between AI Summary and Topics sections in slide-out panel

- **v3.1.6** - Structured Outputs for classification
  - Entity/topics/people classification now uses OpenAI Structured Outputs for guaranteed valid JSON
  - Fixes classification failures on screenshots, audio, and notes

- **v3.1.5** - Widget screenshot area fix
  - Fixed screen capture selecting wrong area on multi-monitor/high-DPI setups
  - Now uses mss monitor info to get accurate physical screen coordinates

- **v3.1.4** - PDF summarization and link speed improvements
  - Fixed PDF summarization: Now extracts text locally (PyPDF2/pdfplumber) then sends to GPT-5 with web search
  - Removed reasoning from link summary for faster response times
  - PDF summary uses 120s timeout with web search capability

- **v3.1.3** - UK spelling for Organise nav label
  - Changed "Organize" to "Organise" in navigation section label

- **v3.1.2** - Detail panel meta improvements
  - Changed meta line to read "Captured by [source] at [date], [time]"
  - Reduced gap between title and meta info

- **v3.1.1** - Detail panel header cleanup
  - Removed grey type badge from detail panel header
  - Moved delete and close buttons inline with title for cleaner layout
  - Removed redundant header section

- **v3.1.0** - Visualise 2: Multi-View Visualization
  - New "Visualise 2" page with four view modes:
    - Network: Force-directed graph (vis.js) showing entries, topics, and people
    - Topics: D3.js circle pack showing topic popularity with entity-colored bubbles
    - People: D3.js radial layout showing people connections via shared topics
    - Timeline: vis.js Timeline showing entries chronologically by entity type
  - Added D3.js v7 and vis.js Timeline libraries
  - Click-to-select shows detailed info in selection panel
  - Entity and type filters for all views

- **v3.0.13** - Grid column improvements
  - Title and Notes columns now wider for better readability
  - Status and Category columns hidden on All/Project/Knowledge pages (shown only on Tasks)
  - Source column removed from grid (available in slide-out panel)
  - Removed unused modal code for cleaner codebase

- **v3.0.12** - AI Summary simplification
  - AI Summary section now only shows if there is content (no more spinners)
  - Removed AI polling logic - section hidden if no summary exists
  - Fixed in both modal and slide-out detail panel

- **v3.0.11** - Date and spinner fixes
  - Fixed "Today" showing for yesterday's entries (now compares calendar dates, not 24-hour periods)
  - Fixed AI spinner date parsing (timestamp format with space now handled correctly)
  - Added NaN check for invalid dates

- **v3.0.10** - AI spinner fix
  - Fixed infinite spinner on old entries without AI summaries
  - Spinner now only shows for entries created within last 5 minutes
  - Old entries without AI summary no longer show the AI Summary section

- **v3.0.9** - UI polish and task view improvements
  - Stronger pastels: More saturated badge colours for better visibility
  - Dashboard icons: Recent item icons now use full pastel background
  - Task view toggle: List/Board now uses compact icon toggle
  - Hide completed: Now an eye icon button instead of checkbox
  - Removed duplicate task category filter
  - Visualise date slider: Dual-handle range slider replaces date inputs
  - Visualise buttons: Reset/Fit now icon-only
  - Search page: Removed header text for cleaner look

- **v3.0.8** - Grid UI improvements
  - Pastel badge colours: All type, entity, and category badges now use softer pastel palette
  - Row numbers: Added row number column to left of selection checkbox
  - Category toggle buttons: Replaced category dropdown with All/Work/Personal toggle
  - Cleaner header: White background, sort arrows only on hover (▲/▼)
  - Sentence case headers: Column titles no longer uppercase
  - Reduced row height: Compact row padding
  - Icon-only toolbar buttons: Refresh and delete are now icon-only
  - Entity filter visibility: Hidden on project/task/knowledge pages, shown on All
  - Removed sources filter

- **v3.0.7** - Settings consolidation
  - Moved project folder setting from extension options to KB Viewer Settings
  - Added browse button for project folder selection (uses native folder picker)
  - Extension options page now only contains debug mode toggle
  - Simplified extension options UI

- **v3.0.6** - Settings page improvements
  - General settings section: Project folder and Extension ID now editable in KB Viewer Settings
  - Auto-update native manifest: Extension ID changes automatically update `com.ultrathink.kbsaver.json`
  - Hash-based URL routing: Page state now persists in URL (e.g., `#tasks`, `#settings`)
  - Browser refresh stays on current page instead of returning to home
  - Browser back/forward buttons navigate between pages

- **v3.0.5** - Task status improvements
  - Status dropdown in detail panel: Change task status directly from the slide-over panel
  - Clickable grid status: Click status badge in grid to cycle through statuses
  - Disabled Done column: Grey out Done column when "Hide completed" is on, shows hidden count
  - Completion toast: Shows "Task completed (X hidden)" when marking done with hide completed on
  - Bug fix: Background refresh now updates kanban board, not just the table
  - Bug fix: Prevent dropping tasks on Done column when hiding completed

- **v3.0.4** - Task page filters
  - Work/Personal toggle: Filter tasks by category on Tasks page
  - Hide completed toggle: Checkbox to hide done tasks from grid and kanban
  - Status column: New column in grid showing task status (Not started/In progress/Done)
  - Completed task styling: Grey out completed tasks with strikethrough in grid and kanban

- **v3.0.3** - Category badge colour update
  - Changed category (work/personal) badge colour to #ff5200 (orange)

- **v3.0.2** - Dashboard UI improvements
  - Enhanced stat card icons with gradient backgrounds and shadows
  - Improved quick action buttons with vertical layout and hover effects
  - Type-specific colored icons in recent items list
  - Replaced type breakdown boxes with interactive donut chart
  - Consistent section title spacing and sentence case

- **v3.0.1** - Navigation fixes
  - Added "All" nav item in sidebar to show all entries grid
  - Fixed initial page load to show dashboard instead of grid
  - Added nav badge counts for All, Projects, Tasks, Knowledge

- **v3.0.0** - Major UI Redesign
  - **Dashboard Home**: New home page with stats cards, quick actions, recent items, and type breakdown
  - **Slide-out Detail Panel**: Modern slide-out panel replaces modal for viewing entries (like Asana/Linear)
  - **Command Palette**: Cmd+K (or Ctrl+K) for quick navigation and entry search
  - **Enhanced Design System**: 100+ CSS custom properties for consistent theming
  - **Dark Mode**: Full dark mode support with system preference detection and toggle
  - **Visual Polish**: Smooth animations, focus states, hover effects, custom scrollbars
  - **Progressive Disclosure**: Empty states, loading skeletons, filter chips
  - **Accessibility**: WCAG 2.2 compliant focus rings and keyboard navigation
  - **Modern Shadows**: Layered, realistic depth with color-aware shadows

- **v2.6.0**
  - Work/Personal classification: New AI Step 4 categorises entries as "work" or "personal"
  - Category column: New column in KB Viewer grid with blue (work) / green (personal) badges
  - Category filter: Dropdown filter to show only work or personal entries
  - Custom prompt support: `work_personal_prompt` in settings.json

- **v2.5.0**
  - Modern UI redesign: CSS design system with custom properties
  - Dark mode support: Theme toggle with system preference detection
  - Enhanced sidebar: Grouped navigation sections (Main, Workspace, Explore, Organize, Settings)
  - Visual polish: Modern shadows, hover effects, smooth animations
  - Accessibility: WCAG 2.2 compliant focus states
  - Modal animations: Entrance animations with backdrop blur

- **v2.4.0**
  - Settings consolidation: API keys and AI prompts moved from extension to `native-host/settings.json`
  - Extension options page simplified to folder path and debug mode only
  - System tray support: Widget runs in background with tray menu
  - Extension ID setup dialog: First-run configuration for native messaging
  - Virtual desktop pinning: Widget pins to all Windows virtual desktops (replaces multi-monitor mirrors)
  - Web viewer integration: Open KB viewer from system tray menu

- **v2.3.0**
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
