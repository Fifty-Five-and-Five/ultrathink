# UltraThink URL Saver

A powerful Microsoft Edge extension that captures URLs, text snippets, screenshots, and files directly to a markdown knowledge base file (`kb.md`). Features AI-powered grammar correction, smart type detection, and a pinned drop target for quick captures.

## Features

### Core Functionality
- **One-click saving**: Click the extension icon or use keyboard shortcuts
- **Auto-save timer**: Automatically saves after 3 seconds (resets on interaction)
- **Smart capture**: Automatically detects and saves selected text as snippets
- **Screenshot capture**: Full page or area selection with Ctrl+Shift+5
- **Bulk tab saving**: Save all tabs in current window at once
- **Tab groups support**: Preserves browser tab group names and colors as metadata

### Intelligent Detection
- **Smart URL type detection**: Automatically detects content type from URL:
  - AI conversations (Claude, ChatGPT, Perplexity)
  - Microsoft Office docs (Word, Excel, PowerPoint, OneNote)
  - Notion pages
  - Videos (YouTube, Vimeo)
  - Generic links, snippets, and ideas

### AI-Powered Enhancement
- **Grammar correction**: Automatic spelling and grammar fixes using OpenAI GPT-5-nano
- **Context-aware AI**: Sends page URL, title, type, and tab group to AI for domain-specific corrections
- **Background processing**: Grammar fixes happen after save, so UI responds instantly
- **Preserves technical terms**: AI prompt instructs to keep jargon and domain-specific language intact

### Pinned Drop Target
- **Floating dialog**: Pin a resizable drop target on any webpage
- **Drag & drop files**: Drop files directly into the dialog to save them
- **Paste support**: Paste files or text with Ctrl+V
- **Auto-save countdown**: 3-second timer for dropped content
- **Draggable & resizable**: Move and resize the dialog to fit your workflow

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
- **chatgpt**, **claude**, **perplexity**: AI conversation threads

### User Experience
- **Keyboard shortcuts**:
  - `Ctrl+Shift+4` (Mac: `Cmd+Shift+4`): Open save popup
  - `Ctrl+Shift+5` (Mac: `Cmd+Shift+5`): Capture screenshot
- **Pin toggle**: Circle icon fills orange when pinned dialog is active
- **Instant close**: Clicking pin icon closes popup immediately (no accidental saves)
- **Metadata tracking**: Each entry includes type, timestamp, source URL, and tab group info
- **Newest first**: New entries appear at the top of the file

## File Structure

```
ultrathink/
├── ultrathink-extension/     # Browser extension
│   ├── manifest.json          # Extension configuration (v1.2.5)
│   ├── popup.html             # Main popup interface
│   ├── popup.js               # Popup logic and pin toggle
│   ├── background.js          # Service worker, native messaging, AI grammar
│   ├── pinned-dialog.js       # Floating drop target content script
│   ├── selection-overlay.js   # Screenshot area selection
│   ├── options.html           # Settings page
│   ├── options.js             # Settings logic
│   └── icons/                 # Extension icons
│       ├── icon16.png
│       ├── icon48.png
│       ├── icon128.png
│       └── generate_icons.py
└── native-host/               # Native messaging host
    ├── host.py                # Python script for file I/O
    ├── host.bat               # Windows launcher
    ├── com.ultrathink.kbsaver.json  # Native host manifest
    ├── install.bat            # Installation script
    └── uninstall.bat          # Uninstallation script
```

## Prerequisites

- Windows 10/11
- Microsoft Edge (Chromium-based)
- Python 3.x installed and in PATH
- OpenAI API key (optional, for grammar correction feature)

## Installation

### Step 1: Generate Icons (Optional)

```bash
cd ultrathink-extension/icons
pip install pillow
python generate_icons.py
```

Or manually create three PNG files: `icon16.png`, `icon48.png`, `icon128.png`

### Step 2: Load Extension in Edge

1. Open Edge and go to `edge://extensions/`
2. Enable **Developer mode** (toggle in bottom-left)
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
2. Navigate to the `native-host` folder:
   ```cmd
   cd "path\to\ultrathink\native-host"
   ```
3. Run the installer:
   ```cmd
   install.bat
   ```
4. The script will register the native host in Windows Registry

### Step 5: Configure OpenAI API Key (Optional)

If you want grammar correction:

1. Open `ultrathink-extension/background.js`
2. Update line 13 with your OpenAI API key:
   ```javascript
   const OPENAI_API_KEY = 'sk-proj-YOUR_API_KEY_HERE';
   ```
3. Reload the extension in Edge

### Step 6: Configure Settings (Optional)

1. Right-click the extension icon in Edge → **Options**
2. Set your project folder path (default: `C:\Users\ChrisWright\OneDrive - Fifty Five and Five\dev\ultrathink\`)
3. Click **Save Settings**

## Usage

### Quick Save

1. Navigate to any webpage
2. Press `Ctrl+Shift+4` or click the extension icon
3. Wait 3 seconds for auto-save, or edit and wait

### Capturing Text Snippets

1. Select text on any webpage
2. Press `Ctrl+Shift+4`
3. The selected text is automatically captured as type "snippet"
4. Add notes if needed
5. Auto-saves in 3 seconds

### Screenshot Capture

**Full page:**
1. Press `Ctrl+Shift+5`
2. Screenshot saves automatically

**Area selection:**
1. Press `Ctrl+Shift+5`
2. Click and drag to select area
3. Press `Enter` or double-click to capture
4. Press `Esc` to cancel

### Save All Tabs

1. Open the extension popup
2. Check "All tabs (X)" checkbox
3. All tabs in current window will be saved with the same type and notes
4. Tab group information is preserved for each tab

### Pinned Drop Target

1. Click the extension icon to open popup
2. Click the **circle icon** (left of version number)
3. A floating dialog appears on the page
4. **Drag files** onto the drop zone, or
5. Click the dialog and press **Ctrl+V** to paste
6. Auto-saves after 3 seconds
7. Click the pin icon again to remove the dialog

**Features:**
- Drag the header to move the dialog
- Resize by dragging the bottom-right corner
- Drop zone and notes resize with the dialog
- Close with X button or by toggling pin icon

### Entry Format

Each entry in `kb.md` looks like this:

```markdown
- **link** `2025-11-24 14:32:15` [Article Title](https://example.com/article) 🔵 Research
  - This is my note about the article

- **screenshot** `2025-11-24 14:35:22` [Screenshot from Example.com](https://example.com)
  - ![Screenshot](screenshots/screenshot_20251124_143522.png)
  - Notes about what I captured

- **snippet** `2025-11-24 14:40:10` [Article Title](https://example.com/article) 🟢 Development
  - Selected text from the page appears here
  - Grammar is automatically corrected in background

- **chatgpt** `2025-11-24 14:45:33` [Conversation Title](https://chatgpt.com/c/abc123) 🔴 AI Research
  - Discussion about machine learning topics
```

**Entry components:**
- Type (link, snippet, screenshot, etc.)
- ISO timestamp
- Clickable title with URL
- Tab group indicator (emoji + name) if tab was in a group
- Content/notes (indented with `  - `)
- Screenshots are saved to `screenshots/` folder and embedded

## Grammar Correction

The extension automatically fixes spelling and grammar errors in your notes using OpenAI's API.

**How it works:**
1. You save an entry with notes
2. Dialog closes immediately
3. In background, notes are sent to OpenAI GPT-5-nano
4. Context is included (page URL, title, type, tab group)
5. AI corrects errors while preserving technical terms
6. Entry in `kb.md` is silently updated
7. Check `host.log` for grammar fix activity

**Context sent to AI:**
- Page URL (domain) - helps AI understand technical context
- Page title - provides topic context
- Entry type - helps AI adjust tone
- Tab group name - provides project/category context

**Example:**
```
Original: "this artical discuses ai modles and ther aplications"
Fixed: "This article discusses AI models and their applications"
```

**To disable:** Remove or comment out the `fixGrammarAndUpdate()` calls in `background.js` lines 181-186 and 320-335.

## Smart URL Detection

The extension automatically detects content type from URLs:

| URL Pattern | Detected Type |
|------------|---------------|
| `claude.ai` | claude |
| `chat.openai.com`, `chatgpt.com` | chatgpt |
| `perplexity.ai` | perplexity |
| `sharepoint.com:w:`, `doc.aspx` | ms-word |
| `sharepoint.com:x:` | ms-excel |
| `sharepoint.com:p:` | ms-powerpoint |
| `sharepoint.com:b:`, `onenote.aspx` | ms-onenote |
| `notion.so`, `notion.site` | notion |
| `youtube.com`, `youtu.be`, `vimeo.com` | video |
| Selected text present | snippet |
| Default | link |

Override by manually selecting type in dropdown.

## Troubleshooting

### Extension can't connect to native host

**Error:** "Specified native messaging host not found"

1. Check extension ID matches in `com.ultrathink.kbsaver.json`:
   - Go to `edge://extensions/`
   - Copy your extension ID
   - Update line 7 in `com.ultrathink.kbsaver.json`

2. Verify Python is installed:
   ```cmd
   python --version
   ```

3. Check registry entry:
   - Open Registry Editor (`regedit`)
   - Navigate to: `HKEY_CURRENT_USER\Software\Microsoft\Edge\NativeMessagingHosts\com.ultrathink.kbsaver`
   - Verify the path points to your `com.ultrathink.kbsaver.json` file

4. Check logs: `native-host/host.log`

5. Reinstall native host:
   ```cmd
   cd native-host
   uninstall.bat
   install.bat
   ```

### Grammar correction not working

1. Check API key in `background.js` line 13
2. Check browser console (F12) for `[Grammar]` logs
3. Check `host.log` for update attempts
4. Verify OpenAI API key has credits/is valid
5. Test API directly:
   ```bash
   curl https://api.openai.com/v1/responses \
     -H "Authorization: Bearer YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-5-nano","input":"test"}'
   ```

### Screenshot shows full tab instead of selection

1. Check device pixel ratio scaling in `selection-overlay.js`
2. Verify `captureAreaScreenshot()` is called (check console logs)
3. Try full page capture (Shift+Click in selection overlay)

### Pinned dialog not appearing

1. Check console for `[Pin]` logs
2. Verify `pinned-dialog.js` is in extension folder
3. Try on a different website (some sites block content scripts)
4. Check permissions in `manifest.json` include `"scripting"`

### Files not saving from pinned dialog

1. Check console for errors in pinned dialog
2. Verify native host is working (test with regular popup save)
3. Check file size (very large files may timeout)
4. Check `host.log` for file processing errors

### Auto-save not working

- Auto-save resets every time you interact with the form
- Any typing, clicking, or focus resets the 3-second timer
- This is intentional to give you time to edit

### File not being created

1. Verify the project folder path exists in Options
2. Check you have write permissions to that folder
3. OneDrive folders may have sync delays
4. Check `host.log` for write errors

### Pin icon doesn't toggle

1. Reload extension in `edge://extensions/`
2. Check console logs with `[Pin]` prefix
3. Verify button has click handler in `popup.js` line 114
4. Orange circle = dialog is active, click to remove
5. Grey circle = dialog not active, click to show

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+4` (Mac: `Cmd+Shift+4`) | Open save popup |
| `Ctrl+Shift+5` (Mac: `Cmd+Shift+5`) | Capture screenshot |
| `Enter` (in screenshot overlay) | Confirm selection |
| `Esc` (in screenshot overlay) | Cancel capture |
| `Ctrl+V` (in pinned dialog) | Paste files/text |

## API Reference

### Native Messaging Protocol

The extension communicates with the Python host via native messaging.

**Save entry:**
```json
{
  "action": "append",
  "projectFolder": "C:\\path\\to\\project\\",
  "entry": {
    "type": "link",
    "captured": "2025-11-24 14:32:15",
    "source": "https://example.com",
    "title": "Page Title",
    "content": "User notes",
    "tabGroup": {
      "groupName": "Research",
      "groupColor": "blue"
    },
    "screenshot": "data:image/png;base64,...",  // Optional
    "fileData": "data:image/png;base64,...",     // Optional
    "mimeType": "image/png"                       // Optional
  }
}
```

**Update entry (grammar fix):**
```json
{
  "action": "update_last_entry",
  "projectFolder": "C:\\path\\to\\project\\",
  "timestamp": "2025-11-24 14:32:15",
  "newContent": "Corrected grammar text"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Entry appended successfully"
}
```

Or error:
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Development

### Project Structure

**Extension (Manifest V3):**
- `popup.html/js` - Main UI and interaction logic
- `background.js` - Service worker handling native messaging, screenshots, AI
- `pinned-dialog.js` - Content script for floating drop target
- `selection-overlay.js` - Content script for screenshot area selection
- `options.html/js` - Settings page

**Native Host:**
- `host.py` - Python script with stdio communication
- `host.bat` - Windows launcher (hides console window)

### Testing the Native Host Independently

```cmd
cd native-host
echo {"action":"append","projectFolder":"C:\\test\\","entry":{"type":"link","captured":"2025-11-24 12:00:00","source":"https://test.com","title":"Test","content":"Test note"}} | python host.py
```

### Debugging

**Extension popup console:**
- Right-click popup → Inspect

**Background service worker:**
- Go to `edge://extensions/`
- Find extension → "Inspect views: service worker"

**Content scripts (pinned dialog, screenshot overlay):**
- Open page where script is injected
- Press F12 → Console
- Look for `[Pin]` or `[Screenshot]` prefixed logs

**Native host:**
- Check `native-host/host.log`
- Logs include timestamps, actions, and errors

**Grammar correction:**
- Check background service worker console
- Look for `[Grammar]` and `[Grammar Update]` logs
- Sample output:
  ```
  [Grammar] Starting fix for text: this is a test...
  [Grammar] Context: {url: "https://example.com", title: "Example", type: "link"}
  [Grammar] Calling OpenAI API...
  [Grammar] API response status: 200
  [Grammar] Original: this is a test
  [Grammar] Fixed: This is a test
  [Grammar Update] Starting background fix...
  [Grammar Update] Text was changed, updating entry...
  [Grammar Update] ✓ Entry updated successfully
  ```

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  popup.js   │  │ pinned-      │  │  selection-      │  │
│  │             │  │ dialog.js    │  │  overlay.js      │  │
│  │ - UI logic  │  │              │  │                  │  │
│  │ - Pin       │  │ - Drop zone  │  │ - Area select   │  │
│  │   toggle    │  │ - File drop  │  │ - Screenshot    │  │
│  │ - Auto-save │  │ - Paste      │  │   capture       │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                │                    │            │
│         └────────────────┴────────────────────┘            │
│                          │                                 │
│                          ▼                                 │
│              ┌───────────────────────┐                     │
│              │   background.js       │                     │
│              │  (Service Worker)     │                     │
│              │                       │                     │
│              │ - Native messaging    │                     │
│              │ - Screenshot capture  │                     │
│              │ - OpenAI grammar fix  │                     │
│              │ - Context enhancement │                     │
│              │ - Tab groups API      │                     │
│              └───────────┬───────────┘                     │
└──────────────────────────┼─────────────────────────────────┘
                           │
                           │ Chrome Native Messaging API
                           │
                           ▼
          ┌────────────────────────────────┐
          │     Native Messaging Host      │
          │                                │
          │  host.bat → python host.py     │
          │                                │
          │  - Receive JSON via stdin      │
          │  - Read/write kb.md            │
          │  - Save screenshots to disk    │
          │  - Update entries (grammar)    │
          │  - Return JSON via stdout      │
          └────────────┬───────────────────┘
                       │
                       ▼
          ┌────────────────────────────────┐
          │        File System             │
          │                                │
          │  - kb.md (knowledge base)      │
          │  - screenshots/*.png           │
          │  - host.log (debug log)        │
          └────────────────────────────────┘

          ┌────────────────────────────────┐
          │      OpenAI API                │
          │                                │
          │  - GPT-5-nano model            │
          │  - /v1/responses endpoint      │
          │  - Grammar correction          │
          │  - Context-aware fixes         │
          └────────────────────────────────┘
```

### Version History

- **v1.2.5** (Current)
  - Pin button toggles on/off with state persistence
  - Popup closes immediately when pin clicked
  - No accidental saves when toggling pin
  - Pinned dialog UI improvements (title, flexbox layout)

- **v1.2.4**
  - Circle outline pin icon
  - Orange fill when active (#ff5200)
  - Removed down arrow on file hover

- **v1.2.3**
  - Modern flat pin icon design

- **v1.2.2**
  - Context-enhanced grammar correction
  - Sends URL, title, type, tab group to AI
  - Preserves technical terms and jargon

- **v1.2.1**
  - Background grammar fixing with OpenAI
  - Immediate UI response, async corrections
  - Update last entry action added to host.py

- **v1.2.0**
  - Pinned drop target dialog
  - File drag & drop support
  - Paste support (Ctrl+V)
  - Draggable and resizable dialog

- **v1.1.3**
  - Service worker compatible screenshot cropping
  - OffscreenCanvas for image processing

- **v1.1.2**
  - Fixed device pixel ratio for area screenshots

- **v1.1.1**
  - Screenshot capture (full and area)
  - Tab groups metadata support

- **v1.1.0**
  - Bulk "all tabs" save feature
  - Smart URL type detection

- **v1.0.0**
  - Initial release
  - Basic save functionality
  - Auto-save timer
  - Text snippet capture

## Contributing

This is a personal project for internal use at Fifty-Five-and-Five. For questions or suggestions, contact the development team.

## License

Proprietary - Fifty-Five-and-Five organization.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console and service worker logs
3. Check `native-host/host.log` for native host errors
4. Review code comments in source files

## Future Ideas

- [ ] Firefox support (requires WebExtensions API adaptation)
- [ ] Cloud sync option (sync kb.md across devices)
- [ ] Search within kb.md from extension
- [ ] Tags and categories
- [ ] Export to other formats (HTML, PDF)
- [ ] Browser history integration
- [ ] OCR for screenshot text extraction
- [ ] Voice note support
- [ ] Mobile companion app

## Code Review

*Review Date: 2025-11-24*

### Summary

| Metric | Value |
|--------|-------|
| Total Lines of Code | ~1,624 |
| Test Coverage | 0% |
| Issues Found | 20 |
| Critical Issues | 2 |
| High Priority | 6 |
| Medium Priority | 8 |
| Low Priority | 4 |

**Files with Most Issues:** `background.js`, `pinned-dialog.js`, `popup.js`, `host.py`

---

### Critical Issues

#### 1. Exposed API Key
- **File:** `background.js:13`
- **Issue:** OpenAI API key is hardcoded in plaintext in source code
- **Impact:** Key is exposed to anyone with access to the code; could incur unauthorized charges
- **Recommendation:** Rotate key immediately, move to secure storage (extension options or environment variable)

#### 2. Dead/Broken Grammar Feature
- **File:** `background.js:50-60`
- **Issue:** Grammar correction uses non-existent OpenAI API endpoint (`/v1/responses`) and model (`gpt-5-nano`)
- **Impact:** Feature is completely non-functional
- **Recommendation:** Either implement correct OpenAI Chat Completions API or remove feature entirely

---

### High Priority Issues

#### 3. Path Traversal Vulnerability
- **File:** `host.py:187-189, 158-163`
- **Issue:** No validation on `project_folder` or filenames before file operations
- **Impact:** Malicious input could write files outside intended directory (e.g., `../../../etc/passwd`)
- **Recommendation:** Sanitize paths, validate against allowed directory, reject special characters

#### 4. XSS Vulnerability
- **File:** `pinned-dialog.js:208`
- **Issue:** Using `innerHTML` with unsanitized filename data
- **Impact:** Malicious filenames containing script tags could execute arbitrary JavaScript
- **Recommendation:** Use `textContent` instead of `innerHTML`, or sanitize input

#### 5. Missing Null/Key Checks
- **File:** `host.py:48-50`
- **Issue:** Direct dictionary key access without validation (`entry['source']`, `entry['type']`, etc.)
- **Impact:** KeyError crash on malformed input
- **Recommendation:** Use `.get()` with defaults or validate required keys before access

#### 6. Race Condition in File Update
- **File:** `host.py:256-277`
- **Issue:** Modifying list while iterating with `pop()` in `update_last_entry()`
- **Impact:** Could cause infinite loops, skipped lines, or data corruption
- **Recommendation:** Build new list instead of modifying in place, or use proper index management

#### 7. Missing Response Validation
- **File:** `popup.js:252-268`
- **Issue:** `response` from `chrome.runtime.sendMessage` could be undefined if port closes
- **Impact:** Unclear error messages, potential undefined access
- **Recommendation:** Add explicit null/undefined check before accessing response properties

#### 8. Fire-and-Forget Async Operations
- **File:** `background.js:179-186`
- **Issue:** Grammar fixing runs without `await` and errors are only logged to console
- **Impact:** Silent failures, user unaware when grammar fix fails
- **Recommendation:** Implement proper error tracking or user notification

---

### Medium Priority Issues

#### 9. Hardcoded Windows Paths
- **Files:** `background.js:6`, `options.js:3`
- **Issue:** Default project path hardcoded to specific Windows user directory
- **Impact:** Extension not portable across machines/users/platforms
- **Recommendation:** Remove hardcoded default, require user configuration on first use

#### 10. Code Duplication
- **Files:** `popup.js`, `pinned-dialog.js`
- **Issue:** Timer/countdown logic duplicated across both files (~50 lines)
- **Impact:** Bug fixes must be applied in multiple places, maintenance burden
- **Recommendation:** Extract to shared utility module

#### 11. No Test Suite
- **Issue:** Zero test files found in codebase
- **Impact:** No automated verification of functionality, regression risk on changes
- **Recommendation:** Add Jest test suite for JavaScript, pytest for Python host

#### 12. Excessive Console Logging
- **File:** `background.js` (50+ log statements)
- **Issue:** Heavy debug logging left in production code
- **Impact:** Console clutter, potential performance impact, exposes internal state
- **Recommendation:** Use structured logging with levels, disable debug in production

#### 13. Global State Management
- **Files:** All JavaScript files
- **Issue:** Multiple mutable global variables (`countdown`, `timerInterval`, `currentTab`, etc.)
- **Impact:** Difficult to debug, test, and reason about; race conditions possible
- **Recommendation:** Encapsulate in classes or use module pattern with controlled access

#### 14. Magic Numbers
- **Files:** `popup.js:222`, `selection-overlay.js:43`, `pinned-dialog.js:24-32`
- **Issue:** Hardcoded values (3-second timer, z-index 2147483647, pixel positions)
- **Impact:** Difficult to understand and maintain
- **Recommendation:** Extract to named configuration constants

#### 15. Incomplete Input Validation
- **File:** `options.js`
- **Issue:** Only checks for empty path, no validation of path existence, permissions, or format
- **Impact:** Silent failures when invalid path configured
- **Recommendation:** Add comprehensive validation with user feedback

#### 16. Complex/Long Functions
- **Files:** `background.js` (`handleSaveSingle` ~50 lines), `host.py` (`update_last_entry` ~70 lines)
- **Issue:** Functions do multiple things, hard to test and maintain
- **Impact:** Difficult to understand, modify, and debug
- **Recommendation:** Refactor to single-responsibility principle, extract helper functions

---

### Low Priority Issues

#### 17. Missing Documentation
- **Issue:** No JSDoc comments on JavaScript functions, no docstrings on Python functions
- **Impact:** Harder for new developers to understand code
- **Recommendation:** Add documentation for public APIs and complex logic

#### 18. Inefficient DOM Queries
- **File:** `popup.js`
- **Issue:** Repeated `document.getElementById()` calls for same elements
- **Impact:** Minor performance overhead
- **Recommendation:** Cache DOM references at initialization

#### 19. Inline CSS Duplication
- **Files:** `pinned-dialog.js`, `selection-overlay.js`
- **Issue:** CSS styles defined as inline strings instead of external stylesheet
- **Impact:** Duplicated styles, harder to maintain
- **Recommendation:** Extract to external CSS file injected with content script

#### 20. Accessibility Issues
- **Files:** `pinned-dialog.js`, `selection-overlay.js`
- **Issue:** No ARIA labels, focus management, or keyboard navigation
- **Impact:** Poor experience for users with assistive technologies
- **Recommendation:** Add ARIA attributes and keyboard support
