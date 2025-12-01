/**
 * @fileoverview UltraThink popup UI controller.
 * Handles the extension popup window that appears when clicking the extension icon.
 * Features include auto-save timer, type detection, screenshot handling, and bulk tab saving.
 * @module popup
 */

// Initialize logger
initLogger();
const pinLog = createLogger('Pin');
const popupLog = createLogger('Popup');

/**
 * Popup state container - encapsulates all mutable state for the popup UI.
 * @namespace PopupState
 */
const PopupState = {
  /** @type {number} Auto-save countdown in seconds */
  countdown: 3,
  /** @type {number|null} Interval ID for the countdown timer */
  timerInterval: null,
  /** @type {chrome.tabs.Tab|null} Currently active tab */
  currentTab: null,
  /** @type {string} Text selected on the page (for snippets) */
  selectedText: '',
  /** @type {boolean} Whether auto-save has already triggered */
  autoSaveTriggered: false,
  /** @type {Object|null} Screenshot data if capturing a screenshot */
  screenshotData: null,
  /** @type {Array<chrome.tabs.Tab>} All tabs in current window (for bulk save) */
  allTabs: []
};

// Legacy variable aliases for backwards compatibility
let countdown = 3;
let timerInterval = null;
let currentTab = null;
let selectedText = '';
let autoSaveTriggered = false;
let screenshotData = null;
let allTabs = [];

// Widget action debouncing
let widgetActionInProgress = false;

/**
 * Detects the content type based on URL patterns.
 * Identifies AI tools (Claude, ChatGPT, Perplexity), documents, and media.
 *
 * @function detectUrlType
 * @param {string} url - The URL to analyse
 * @returns {string} Content type identifier (e.g., 'claude', 'pdf', 'video', 'link')
 * @example
 * detectUrlType('https://claude.ai/chat/123'); // 'claude'
 * detectUrlType('https://example.com/doc.pdf'); // 'pdf'
 */
function detectUrlType(url) {
  if (!url) return 'link';

  const urlLower = url.toLowerCase();

  // AI conversation types
  if (urlLower.includes('claude.ai')) return 'claude';
  if (urlLower.includes('chat.openai.com') || urlLower.includes('chatgpt.com')) return 'chatgpt';
  if (urlLower.includes('perplexity.ai')) return 'perplexity';

  // PDF files
  if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?') || urlLower.includes('/pdf/')) return 'pdf';

  // Markdown files
  if (urlLower.endsWith('.md') || urlLower.includes('.md?')) return 'markdown';

  // Microsoft Office - check for SharePoint and specific file type patterns
  if (urlLower.includes('sharepoint.com') || urlLower.includes('1drv.ms') || urlLower.includes('onedrive.live.com')) {
    // Check for specific Office app patterns in URL
    if (urlLower.includes(':w:') || urlLower.includes('/_layouts/15/doc.aspx')) return 'ms-word';
    if (urlLower.includes(':p:')) return 'ms-powerpoint';
    if (urlLower.includes(':x:')) return 'ms-excel';
    if (urlLower.includes(':b:') || urlLower.includes('onenote.aspx')) return 'ms-onenote';
    // Generic Office file if SharePoint but no specific pattern
    return 'ms-word';  // Default to Word if unclear
  }

  // Notion
  if (urlLower.includes('notion.so') || urlLower.includes('notion.site')) return 'notion';

  // Video
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be') || urlLower.includes('vimeo.com')) return 'video';

  // Default
  return 'link';
}

/**
 * Detects the content type from a filename extension.
 * Used for dropped/uploaded files.
 *
 * @function detectFileType
 * @param {string} filename - The filename to analyse
 * @returns {string} Content type identifier (e.g., 'pdf', 'audio', 'image', 'file')
 * @example
 * detectFileType('document.pdf'); // 'pdf'
 * detectFileType('song.mp3'); // 'audio'
 */
function detectFileType(filename) {
  if (!filename) return 'file';

  const ext = filename.toLowerCase().split('.').pop();

  // Markdown
  if (ext === 'md') return 'markdown';

  // PDF
  if (ext === 'pdf') return 'pdf';

  // MS Office
  if (['doc', 'docx', 'rtf'].includes(ext)) return 'ms-word';
  if (['ppt', 'pptx'].includes(ext)) return 'ms-powerpoint';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'ms-excel';
  if (['one', 'onetoc2'].includes(ext)) return 'ms-onenote';

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'aiff'].includes(ext)) return 'audio';

  // Video
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return 'video';

  // Image (dragged files = image, not screenshot)
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return 'image';

  return 'file';
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Get all tabs in current window
  allTabs = await chrome.tabs.query({ currentWindow: true });

  // Update checkbox label with count
  document.getElementById('allTabsLabel').textContent = `All tabs (${allTabs.length})`;

  // Display URL preview
  document.getElementById('urlPreview').textContent = `${tab.title}\n${tab.url}`;

  // Check if this was triggered by screenshot capture
  const screenshotResponse = await chrome.runtime.sendMessage({ action: 'getScreenshot' });
  if (screenshotResponse && screenshotResponse.screenshot) {
    screenshotData = screenshotResponse.screenshot;
    document.getElementById('type').value = 'screenshot';
    document.getElementById('notes').placeholder = 'Add notes about this screenshot...';
  } else {
    // Try to get selected text from the page first
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });

      if (results && results[0] && results[0].result) {
        selectedText = results[0].result.trim();
        if (selectedText) {
          // If text is selected, use snippet type
          document.getElementById('type').value = 'snippet';
          // Show selected text in preview area
          document.getElementById('selectionPreview').textContent = selectedText;
          document.getElementById('selectionPreview').style.display = 'block';
          document.getElementById('notes').placeholder = 'Add notes about this selection...';
        } else {
          // Otherwise, auto-detect type from URL
          const detectedType = detectUrlType(tab.url);
          document.getElementById('type').value = detectedType;
        }
      } else {
        // No selected text, auto-detect from URL
        const detectedType = detectUrlType(tab.url);
        document.getElementById('type').value = detectedType;
      }
    } catch (error) {
      popupLog.error('Error getting selected text:', error);
      // Fall back to URL detection
      const detectedType = detectUrlType(tab.url);
      document.getElementById('type').value = detectedType;
    }
  }

  // Check if widget is currently open
  try {
    const widgetState = await chrome.runtime.sendMessage({ action: 'getWidgetState' });
    if (widgetState?.widgetOpen) {
      pinLog.debug('Widget is open, marking button as pinned');
      document.getElementById('pinBtn').classList.add('pinned');
    }
  } catch (error) {
    pinLog.debug('Could not check widget state:', error.message);
  }

  // Setup checkbox handler
  document.getElementById('allTabsCheckbox').addEventListener('change', handleAllTabsToggle);

  // Setup pin button handler (toggle pinned dialog on page)
  document.getElementById('pinBtn').addEventListener('click', async () => {
    // Debounce protection - prevent rapid clicks
    if (widgetActionInProgress) {
      pinLog.debug('Widget action in progress, ignoring click');
      return;
    }
    widgetActionInProgress = true;

    // Safety timeout - reset flag after 5 seconds if operation hangs
    const debounceTimeout = setTimeout(() => {
      pinLog.debug('Widget action timed out, resetting flag');
      widgetActionInProgress = false;
      const btn = document.getElementById('pinBtn');
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }, 5000);

    // Stop auto-save timer immediately
    clearInterval(timerInterval);

    const pinBtn = document.getElementById('pinBtn');
    pinBtn.disabled = true;
    pinBtn.style.opacity = '0.5';

    const isPinned = pinBtn.classList.contains('pinned');
    pinLog.debug('Button clicked, currently pinned:', isPinned);

    try {
      if (isPinned) {
        // Close desktop widget
        await chrome.runtime.sendMessage({ action: 'closeWidget' });
        pinBtn.classList.remove('pinned');
      } else {
        // Launch desktop widget
        await chrome.runtime.sendMessage({ action: 'launchWidget' });
        pinBtn.classList.add('pinned');
      }

      clearTimeout(debounceTimeout);
      setTimeout(() => window.close(), 100);
    } catch (error) {
      clearTimeout(debounceTimeout);
      pinLog.error('Error toggling widget:', error);
      pinBtn.disabled = false;
      pinBtn.style.opacity = '1';
      widgetActionInProgress = false;
    }
  });

  // Start countdown timer
  startTimer();

  // Focus the notes field
  document.getElementById('notes').focus();

  // User interaction stops auto-save
  const interactionElements = ['type', 'notes', 'allTabsCheckbox'];
  interactionElements.forEach(id => {
    const el = document.getElementById(id);
    if (el.type === 'checkbox') {
      el.addEventListener('change', resetTimer);
    } else {
      el.addEventListener('input', resetTimer);
      el.addEventListener('focus', resetTimer);
    }
  });

  // Save immediately when popup loses focus (user clicks away)
  window.addEventListener('blur', () => {
    if (!autoSaveTriggered) {
      autoSaveTriggered = true;
      clearInterval(timerInterval);
      const timerEl = document.getElementById('timer');
      timerEl.textContent = 'Saving...';
      saveEntry();
    }
  });
});

/**
 * Handles toggling the "save all tabs" checkbox.
 * Disables type/notes fields and updates preview when bulk saving.
 *
 * @function handleAllTabsToggle
 */
function handleAllTabsToggle() {
  const checkbox = document.getElementById('allTabsCheckbox');
  const typeSelect = document.getElementById('type');
  const notesTextarea = document.getElementById('notes');
  const urlPreview = document.getElementById('urlPreview');

  if (checkbox.checked) {
    // Disable fields
    typeSelect.disabled = true;
    notesTextarea.disabled = true;

    // Update URL preview
    urlPreview.textContent = `${allTabs.length} tabs in current window`;
  } else {
    // Enable fields
    typeSelect.disabled = false;
    notesTextarea.disabled = false;

    // Restore URL preview
    urlPreview.textContent = `${currentTab.title}\n${currentTab.url}`;
  }
}

/**
 * Starts the auto-save countdown timer.
 * Displays countdown in UI and triggers save when it reaches 0.
 *
 * @function startTimer
 */
function startTimer() {
  const timerEl = document.getElementById('timer');
  timerEl.textContent = `Auto-saving in ${countdown} seconds...`;

  timerInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      timerEl.textContent = `Auto-saving in ${countdown} seconds...`;
    } else {
      clearInterval(timerInterval);
      timerEl.textContent = 'Saving...';
      autoSaveTriggered = true;
      saveEntry();
    }
  }, 1000);
}

/**
 * Resets the auto-save timer back to initial countdown.
 * Called when user interacts with form fields.
 *
 * @function resetTimer
 */
function resetTimer() {
  if (!autoSaveTriggered) {
    clearInterval(timerInterval);
    countdown = 3;
    startTimer();
  }
}

/**
 * Saves the current entry to the knowledge base via the native host.
 * Handles both single tab and bulk (all tabs) saving.
 *
 * @async
 * @function saveEntry
 * @returns {Promise<void>}
 */
async function saveEntry() {
  const timerEl = document.getElementById('timer');
  const statusEl = document.getElementById('status');
  const checkbox = document.getElementById('allTabsCheckbox');

  // Gather common data
  const type = document.getElementById('type').value;
  const userNotes = document.getElementById('notes').value;

  // Send to background script to handle saving (with or without bulk)
  try {
    const saveRequest = {
      action: checkbox.checked ? 'saveAllTabs' : 'save',
      type: type,
      selectedText: selectedText || '',  // Separate: text selected from page
      notes: userNotes || '',            // Separate: user-added commentary
      screenshotData: screenshotData
    };

    if (!checkbox.checked) {
      // Single tab save - add current tab info
      saveRequest.tab = currentTab;
    } else {
      // All tabs save - add all tabs
      saveRequest.tabs = allTabs;
    }

    const response = await chrome.runtime.sendMessage(saveRequest);

    if (response && response.success) {
      // Show subtle "Saved!" in timer area, then close quickly
      timerEl.textContent = 'Saved!';
      setTimeout(() => {
        window.close();
      }, 400);
    } else {
      throw new Error(response?.error || 'Failed to save');
    }
  } catch (error) {
    popupLog.error('Save error:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status error';

    // Clear timer on error
    clearInterval(timerInterval);
    timerEl.textContent = '';
  }
}
