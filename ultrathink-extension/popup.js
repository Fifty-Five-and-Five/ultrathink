// Global state
let countdown = 3;
let timerInterval = null;
let currentTab = null;
let selectedText = '';
let autoSaveTriggered = false;
let screenshotData = null;
let allTabs = [];

// Detect type from URL
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

// Detect type from filename (for dropped files)
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
          // Show selected text as preview, but keep notes empty for user commentary
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
      console.error('Error getting selected text:', error);
      // Fall back to URL detection
      const detectedType = detectUrlType(tab.url);
      document.getElementById('type').value = detectedType;
    }
  }

  // Check if pinned dialog already exists on page
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => !!document.getElementById('ultrathink-pinned-dialog')
    });

    if (result?.result) {
      console.log('[Pin] Dialog already exists, marking button as pinned');
      document.getElementById('pinBtn').classList.add('pinned');
    }
  } catch (error) {
    console.log('[Pin] Could not check dialog state:', error.message);
  }

  // Setup checkbox handler
  document.getElementById('allTabsCheckbox').addEventListener('change', handleAllTabsToggle);

  // Setup pin button handler (toggle desktop widget)
  document.getElementById('pinBtn').addEventListener('click', async () => {
    // Stop auto-save timer immediately
    clearInterval(timerInterval);

    const pinBtn = document.getElementById('pinBtn');
    const isPinned = pinBtn.classList.contains('pinned');

    console.log('[Pin] Button clicked, currently pinned:', isPinned);

    try {
      if (isPinned) {
        // Close widget via native messaging
        const response = await chrome.runtime.sendMessage({ action: 'closeWidget' });
        if (response && response.success) {
          pinBtn.classList.remove('pinned');
        }
      } else {
        // Launch widget via native messaging
        const response = await chrome.runtime.sendMessage({ action: 'launchWidget' });
        if (response && response.success) {
          pinBtn.classList.add('pinned');
        } else {
          console.error('[Pin] Launch failed:', response?.error);
        }
      }

      window.close();
    } catch (error) {
      console.error('[Pin] Error:', error);
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
});

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

function resetTimer() {
  if (!autoSaveTriggered) {
    clearInterval(timerInterval);
    countdown = 3;
    startTimer();
  }
}

async function saveEntry() {
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
      if (checkbox.checked) {
        statusEl.textContent = `Saved ${response.count || allTabs.length} tabs successfully!`;
      } else {
        statusEl.textContent = 'Saved successfully!';
      }
      statusEl.className = 'status success';

      // Close popup after 1 second
      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      throw new Error(response?.error || 'Failed to save');
    }
  } catch (error) {
    console.error('Save error:', error);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status error';

    // Clear timer on error
    clearInterval(timerInterval);
    document.getElementById('timer').textContent = '';
  }
}
