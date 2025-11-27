/**
 * @fileoverview UltraThink service worker (background script).
 * Handles native messaging, screenshot capture, and coordinates saving entries.
 * All AI processing (grammar, classification, summaries) is delegated to Python host.py.
 * @module background
 */

// Import shared constants and logger
importScripts('shared-constants.js', 'logger.js');

// Initialize logger and create module-specific loggers
initLogger();
const screenshotLog = createLogger('Screenshot');
const saveLog = createLogger('Save');
const initLog = createLogger('Init');
const metadataLog = createLogger('Metadata');

/**
 * Temporary storage for screenshot data between capture and popup.
 * Set when screenshot is taken, cleared when popup retrieves it.
 * @type {Object|null}
 */
let pendingScreenshot = null;

// NOTE: Grammar fix and classification now happen in Python background thread (host.py)
// The JS background processing functions have been removed as they're no longer needed

// Handle keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-screenshot') {
    startScreenshotSelection();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'save') {
    handleSaveSingle(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  } else if (request.action === 'saveAllTabs') {
    handleSaveAllTabs(request)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getScreenshot') {
    sendResponse({ screenshot: pendingScreenshot });
    pendingScreenshot = null; // Clear after retrieval
    return true;
  } else if (request.action === 'areaSelected') {
    screenshotLog.debug('Area selected:', request.rect);
    captureAreaScreenshot(request.rect, sender.tab)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'captureFullScreen') {
    screenshotLog.info('Capture full screen triggered');
    captureScreenshot(sender.tab)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'saveFile') {
    handleFileSave(request, sender.tab)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'launchWidget') {
    // Launch the desktop widget via native messaging
    sendNativeMessage({ action: 'launch_widget' })
      .then(result => {
        // Track widget state in storage
        chrome.storage.local.set({ widgetOpen: true });
        sendResponse(result);
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'closeWidget') {
    // Close the desktop widget via native messaging
    sendNativeMessage({ action: 'close_widget' })
      .then(result => {
        // Track widget state in storage
        chrome.storage.local.set({ widgetOpen: false });
        sendResponse(result);
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getWidgetState') {
    // Return current widget state
    chrome.storage.local.get(['widgetOpen'], (result) => {
      sendResponse({ widgetOpen: result.widgetOpen || false });
    });
    return true;
  } else if (request.action === 'browseFolder') {
    // Open folder picker dialog via native host
    sendNativeMessage({ action: 'browse_folder' })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'searchGitHub') {
    // Search GitHub for related issues/commits
    handleGitHubSearch(request.query, request.maxResults)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Searches GitHub for issues and commits related to a query.
 * Uses settings for GitHub token and repos configuration.
 *
 * @async
 * @function handleGitHubSearch
 * @param {string} query - Search query string
 * @param {number} [maxResults=10] - Maximum results per search type
 * @returns {Promise<Object>} Search results with issues and commits
 */
async function handleGitHubSearch(query, maxResults = 10) {
  const settings = await getSettings();

  if (!settings.githubToken) {
    return { success: false, error: 'GitHub token not configured. Add it in extension settings.' };
  }

  const message = {
    action: 'search_github',
    query: query,
    githubToken: settings.githubToken,
    githubRepos: settings.githubRepos || '',
    maxResults: maxResults
  };

  return sendNativeMessage(message);
}

/**
 * Retrieves tab group information for a given tab.
 * Returns group name and colour if the tab belongs to a group.
 *
 * @async
 * @function getTabGroupInfo
 * @param {chrome.tabs.Tab} tab - The tab to get group info for
 * @returns {Promise<Object|null>} Object with groupName and groupColor, or null
 */
async function getTabGroupInfo(tab) {
  if (tab.groupId && tab.groupId !== -1) {
    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      return {
        groupName: group.title || '',
        groupColor: group.color
      };
    } catch (error) {
      saveLog.error('Error getting tab group:', error);
      return null;
    }
  }
  return null;
}

/**
 * Extracts page metadata by injecting page-metadata.js into the tab.
 * Retrieves description, og:image, author, published date, and reading time.
 *
 * @async
 * @function getPageMetadata
 * @param {number} tabId - The ID of the tab to extract metadata from
 * @returns {Promise<Object|null>} Metadata object or null on failure
 */
async function getPageMetadata(tabId) {
  try {
    metadataLog.debug('Extracting metadata for tab:', tabId);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['page-metadata.js']
    });

    if (results && results[0] && results[0].result) {
      metadataLog.debug('Metadata extracted:', results[0].result);
      return results[0].result;
    }

    return null;
  } catch (error) {
    metadataLog.error('Error extracting metadata:', error);
    return null;
  }
}

/**
 * Handles saving a single tab entry to the knowledge base.
 * Extracts metadata, builds entry object, and sends to native host.
 *
 * @async
 * @function handleSaveSingle
 * @param {Object} request - Save request with tab, type, notes, selectedText
 * @returns {Promise<Object>} Result object with success status
 */
async function handleSaveSingle(request) {
  try {
    const settings = await getSettings();
    const projectFolder = settings.projectFolder || DEFAULT_SETTINGS.projectFolder;

    const timestamp = formatTimestamp();
    const tab = request.tab;
    const tabGroup = await getTabGroupInfo(tab);

    // Build entry with new consistent format
    const data = {
      type: request.type,
      source: 'browser',           // New: 'browser' or 'widget'
      captured: timestamp,
      title: tab.title,
      url: tab.url,                // New: URL is now separate field
      tabGroup: tabGroup,
      selectedText: request.selectedText || '',  // New: separate from notes
      notes: request.notes || ''                 // New: user commentary
    };

    // Extract page metadata for link-type entries (not screenshots, not special pages)
    const linkTypes = ['link', 'claude', 'chatgpt', 'perplexity', 'pdf', 'markdown', 'notion', 'video', 'ms-word', 'ms-excel', 'ms-powerpoint', 'ms-onenote'];
    if (linkTypes.includes(request.type) && tab.url && tab.url.startsWith('http')) {
      try {
        const metadata = await getPageMetadata(tab.id);
        if (metadata) {
          data.pageMetadata = metadata;
        }
      } catch (e) {
        metadataLog.debug('Could not extract metadata:', e.message);
      }
    }

    // Add screenshot data if present
    if (request.screenshotData && request.type === 'screenshot') {
      data.screenshot = request.screenshotData.dataUrl;
    }

    // Send to native host with API key for background processing (grammar + classification)
    // Python host spawns a thread to handle this, so response returns immediately
    const message = {
      action: 'append',
      projectFolder: projectFolder,
      entry: data,
      apiKey: settings.openaiKey || '',
      classificationPrompt: settings.classificationPrompt || '',
      grammarPrompt: settings.grammarPrompt || ''
    };

    const response = await sendNativeMessage(message);

    if (response && response.success) {
      // Background processing (grammar + classification) happens in Python thread
      // No JS background work needed - UI can return immediately
      return { success: true };
    } else {
      throw new Error(response?.error || 'Native host returned error');
    }
  } catch (error) {
    saveLog.error('Background save error:', error);
    throw error;
  }
}

/**
 * Handles bulk saving of all tabs in the current window.
 * Processes each tab and sends to native host for saving.
 *
 * @async
 * @function handleSaveAllTabs
 * @param {Object} request - Request with tabs array, type, and notes
 * @returns {Promise<Object>} Result object with success status and count
 */
async function handleSaveAllTabs(request) {
  try {
    const settings = await getSettings();
    const projectFolder = settings.projectFolder || DEFAULT_SETTINGS.projectFolder;
    const apiKey = settings.openaiKey || '';

    const timestamp = formatTimestamp();
    let savedCount = 0;

    // Process each tab
    for (const tab of request.tabs) {
      const tabGroup = await getTabGroupInfo(tab);

      // Build entry with new consistent format
      const data = {
        type: request.type,
        source: 'browser',           // New: 'browser' or 'widget'
        captured: timestamp,
        title: tab.title,
        url: tab.url,                // New: URL is now separate field
        tabGroup: tabGroup,
        selectedText: '',            // Bulk save doesn't capture selected text
        notes: request.notes || ''   // New: user commentary
      };

      // Send to native host with API key for background processing
      const message = {
        action: 'append',
        projectFolder: projectFolder,
        entry: data,
        apiKey: apiKey,
        classificationPrompt: settings.classificationPrompt || '',
        grammarPrompt: settings.grammarPrompt || ''
      };

      const response = await sendNativeMessage(message);

      if (response && response.success) {
        savedCount++;
        // Background processing happens in Python thread
      } else {
        saveLog.error('Failed to save tab:', tab.title);
      }
    }

    return { success: true, count: savedCount };
  } catch (error) {
    saveLog.error('Background bulk save error:', error);
    throw error;
  }
}

/**
 * Handles saving a dropped/uploaded file to the knowledge base.
 * Supports files and pasted text from the pinned dialog.
 *
 * @async
 * @function handleFileSave
 * @param {Object} request - Request with file data, type, and metadata
 * @param {chrome.tabs.Tab} tab - The current tab for context
 * @returns {Promise<Object>} Result object with success status
 */
async function handleFileSave(request, tab) {
  try {
    const settings = await getSettings();
    const projectFolder = settings.projectFolder || DEFAULT_SETTINGS.projectFolder;

    const timestamp = formatTimestamp();
    const originalNotes = request.notes || '';

    // Build entry with new consistent format
    let data = {
      type: request.detectedType || 'file',  // Use detected type (pdf, image, audio, etc.)
      source: 'browser',                      // Pinned dialog is in browser context
      captured: timestamp,
      title: request.fileName,
      url: '',                                // No URL for dropped files
      tabGroup: null,                         // No tab group for dropped files
      selectedText: '',
      notes: originalNotes
    };

    // Add file data if it's a file (not text)
    if (request.fileType === 'file') {
      data.fileData = request.fileData;
      data.mimeType = request.mimeType;
    } else if (request.fileType === 'text') {
      // For pasted text, save as snippet with page context
      data.type = 'snippet';
      data.url = tab.url;              // Use current page URL for text
      data.title = tab.title;
      data.selectedText = request.content;  // Pasted text goes to selectedText
    }

    // Send to native host with API key for background processing
    const message = {
      action: 'append',
      projectFolder: projectFolder,
      entry: data,
      apiKey: settings.openaiKey || ''
    };

    const response = await sendNativeMessage(message);

    if (response && response.success) {
      // Background processing happens in Python thread
      return { success: true };
    } else {
      throw new Error(response?.error || 'Native host returned error');
    }
  } catch (error) {
    saveLog.error('File save error:', error);
    throw error;
  }
}

/**
 * Sends a message to the native messaging host (Python).
 * Wraps Chrome's native messaging API in a Promise.
 *
 * @function sendNativeMessage
 * @param {Object} message - Message object to send to native host
 * @returns {Promise<Object>} Response from native host
 */
function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Initiates the screenshot selection process.
 * Injects the selection overlay script into the active tab.
 *
 * @async
 * @function startScreenshotSelection
 */
async function startScreenshotSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject selection overlay
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['selection-overlay.js']
    });
  } catch (error) {
    screenshotLog.error('Selection overlay injection error:', error);
  }
}

/**
 * Captures a full-page screenshot of the visible tab.
 * Stores result in pendingScreenshot and opens the popup.
 *
 * @async
 * @function captureScreenshot
 * @param {chrome.tabs.Tab} [tab] - Tab to capture, defaults to active tab
 */
async function captureScreenshot(tab) {
  try {
    screenshotLog.debug('captureScreenshot called', tab);
    if (!tab) {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }

    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    screenshotLog.debug('Screenshot captured, dataUrl length:', dataUrl.length);

    // Store screenshot data
    pendingScreenshot = {
      dataUrl: dataUrl,
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    };
    screenshotLog.debug('Stored pendingScreenshot');

    // Open popup
    const result = await chrome.action.openPopup();
    screenshotLog.debug('Popup opened:', result);
  } catch (error) {
    screenshotLog.error('Screenshot capture error:', error);
  }
}

/**
 * Captures a screenshot of a user-selected area.
 * Takes full screenshot then crops to the specified rectangle.
 *
 * @async
 * @function captureAreaScreenshot
 * @param {Object} rect - Selection rectangle {x, y, width, height}
 * @param {chrome.tabs.Tab} tab - Tab where selection was made
 */
async function captureAreaScreenshot(rect, tab) {
  try {
    screenshotLog.debug('captureAreaScreenshot called', rect, tab);

    // Capture full visible tab first
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    screenshotLog.debug('Full screenshot captured, dataUrl length:', dataUrl.length);

    // Crop to selected area using canvas
    const croppedDataUrl = await cropImage(dataUrl, rect);
    screenshotLog.debug('Cropped screenshot, dataUrl length:', croppedDataUrl.length);

    // Store screenshot data
    pendingScreenshot = {
      dataUrl: croppedDataUrl,
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    };
    screenshotLog.debug('Stored pendingScreenshot');

    // Open popup
    const result = await chrome.action.openPopup();
    screenshotLog.debug('Popup opened:', result);
  } catch (error) {
    screenshotLog.error('Area screenshot capture error:', error);
  }
}

/**
 * Crops an image data URL to a specified rectangle.
 * Uses OffscreenCanvas for service worker compatibility.
 *
 * @async
 * @function cropImage
 * @param {string} dataUrl - Base64 data URL of the full screenshot
 * @param {Object} rect - Crop rectangle {x, y, width, height}
 * @returns {Promise<string>} Cropped image as data URL
 */
async function cropImage(dataUrl, rect) {
  try {
    screenshotLog.debug('cropImage called with rect:', rect);

    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Decode image using createImageBitmap (service worker API)
    const imageBitmap = await createImageBitmap(blob);
    screenshotLog.debug('Image loaded, dimensions:', imageBitmap.width, 'x', imageBitmap.height);

    // Create OffscreenCanvas (available in service workers)
    const canvas = new OffscreenCanvas(rect.width, rect.height);
    const ctx = canvas.getContext('2d');

    screenshotLog.debug('Canvas created:', canvas.width, 'x', canvas.height);

    // Draw cropped portion
    // sx, sy = source x, y (where to start cropping from)
    // sWidth, sHeight = source width/height (how much to crop)
    // dx, dy = destination x, y (where to draw on canvas - always 0, 0)
    // dWidth, dHeight = destination width/height (canvas size)
    ctx.drawImage(
      imageBitmap,
      rect.x, rect.y, rect.width, rect.height,  // source rectangle
      0, 0, rect.width, rect.height              // destination rectangle
    );

    screenshotLog.debug('Image drawn to canvas');

    // Convert canvas to blob
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

    // Convert blob to data URL
    const reader = new FileReader();
    const croppedDataUrl = await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(croppedBlob);
    });

    screenshotLog.debug('Cropped image dataUrl length:', croppedDataUrl.length);
    return croppedDataUrl;

  } catch (error) {
    screenshotLog.error('Image crop error:', error);
    throw error;
  }
}

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set(DEFAULT_SETTINGS);
  initLog.info('UltraThink extension installed');
});
