// Import shared constants and logger
importScripts('shared-constants.js', 'logger.js');

// Initialize logger and create module-specific loggers
initLogger();
const grammarLog = createLogger('Grammar');
const grammarUpdateLog = createLogger('GrammarUpdate');
const screenshotLog = createLogger('Screenshot');
const saveLog = createLogger('Save');
const initLog = createLogger('Init');

// Store screenshot temporarily
let pendingScreenshot = null;

// Fix grammar using OpenAI Responses API
async function fixGrammar(text, context = {}) {
  if (!text || text.trim().length === 0) {
    grammarLog.debug('Skipping empty text');
    return text;
  }

  // Get API key from storage
  const settings = await getSettings();
  const apiKey = settings.openaiKey;

  if (!apiKey) {
    grammarLog.info('No API key configured, skipping');
    return text;
  }

  grammarLog.debug('Starting fix for text:', text.substring(0, 100) + '...');
  grammarLog.debug('Context:', context);

  try {
    // Build context information for better corrections
    let contextInfo = '';
    if (context.url) {
      try {
        const domain = new URL(context.url).hostname;
        contextInfo += `\nContext: From ${domain}`;
      } catch (e) {
        // Invalid URL, skip
      }
    }
    if (context.title) {
      contextInfo += `\nPage: ${context.title.substring(0, 100)}`;
    }
    if (context.type) {
      contextInfo += `\nType: ${context.type}`;
    }
    if (context.tabGroup?.groupName) {
      contextInfo += `\nGroup: ${context.tabGroup.groupName}`;
    }

    const prompt = `Fix spelling and grammar errors in this note and make it more coherent. ${contextInfo ? `${contextInfo}\n` : ''}Preserve technical terms, jargon, and domain-specific language. Return only the corrected text with no explanations, quotes, or additional commentary:\n\n${text}`;

    grammarLog.debug('Calling OpenAI API...');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        input: prompt
      })
    });

    grammarLog.debug('API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      grammarLog.error('API error:', response.status, errorText);
      return text;
    }

    const data = await response.json();
    grammarLog.debug('API response:', data);

    // Extract text from raw API response (not using SDK, so no output_text helper)
    const outputMessage = data.output?.find(item => item.type === 'message');
    const textContent = outputMessage?.content?.find(c => c.type === 'output_text');
    const fixed = textContent?.text?.trim() || text;

    grammarLog.debug('Original:', text);
    grammarLog.debug('Fixed:', fixed);

    return fixed;
  } catch (error) {
    grammarLog.error('Exception:', error);
    return text;
  }
}

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
  }
});

// Get tab group information for a tab
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

// Handle single tab save
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

    // Add screenshot data if present
    if (request.screenshotData && request.type === 'screenshot') {
      data.screenshot = request.screenshotData.dataUrl;
    }

    // Send to native host
    const message = {
      action: 'append',
      projectFolder: projectFolder,
      entry: data
    };

    const response = await sendNativeMessage(message);

    if (response && response.success) {
      // Fix grammar in background (don't await - let it happen async)
      const originalNotes = request.notes || '';
      if (originalNotes && originalNotes.trim().length > 0) {
        fixGrammarAndUpdate(projectFolder, timestamp, originalNotes, {
          url: tab.url,
          title: tab.title,
          type: request.type,
          tabGroup: tabGroup
        });
      }
      return { success: true };
    } else {
      throw new Error(response?.error || 'Native host returned error');
    }
  } catch (error) {
    saveLog.error('Background save error:', error);
    throw error;
  }
}

// Fix grammar and update entry in background
async function fixGrammarAndUpdate(projectFolder, timestamp, originalText, context = {}) {
  try {
    grammarUpdateLog.debug('Starting background fix...');
    grammarUpdateLog.debug('Timestamp:', timestamp);

    const fixedText = await fixGrammar(originalText, context);

    // Only update if text actually changed
    if (fixedText !== originalText) {
      grammarUpdateLog.debug('Text was changed, updating entry...');

      const updateMessage = {
        action: 'update_last_entry',
        projectFolder: projectFolder,
        timestamp: timestamp,
        newContent: fixedText
      };

      grammarUpdateLog.debug('Sending update to host...');
      const response = await sendNativeMessage(updateMessage);

      grammarUpdateLog.debug('Host response:', response);

      if (response && response.success) {
        grammarUpdateLog.info('Entry updated successfully');
      } else {
        grammarUpdateLog.error('Update failed:', response?.error);
      }
    } else {
      grammarUpdateLog.debug('No changes needed');
    }
  } catch (error) {
    grammarUpdateLog.error('Error:', error);
  }
}

// Handle bulk save of all tabs
async function handleSaveAllTabs(request) {
  try {
    const settings = await getSettings();
    const projectFolder = settings.projectFolder || DEFAULT_SETTINGS.projectFolder;

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

      // Send to native host
      const message = {
        action: 'append',
        projectFolder: projectFolder,
        entry: data
      };

      const response = await sendNativeMessage(message);

      if (response && response.success) {
        savedCount++;
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

// Handle file save from pinned dialog
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

    // Send to native host
    const message = {
      action: 'append',
      projectFolder: projectFolder,
      entry: data
    };

    const response = await sendNativeMessage(message);

    if (response && response.success) {
      // Fix grammar in background (don't await - let it happen async)
      if (originalNotes && originalNotes.trim().length > 0) {
        // Build context based on file type
        const context = {
          type: data.type
        };

        if (request.fileType === 'file') {
          context.title = request.fileName;
        } else if (request.fileType === 'text') {
          context.url = tab.url;
          context.title = tab.title;
        }

        fixGrammarAndUpdate(projectFolder, timestamp, originalNotes, context);
      }
      return { success: true };
    } else {
      throw new Error(response?.error || 'Native host returned error');
    }
  } catch (error) {
    saveLog.error('File save error:', error);
    throw error;
  }
}

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

// Start screenshot selection process
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

// Capture full screenshot
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

// Capture screenshot of selected area
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

// Crop image to specified rectangle (service worker compatible)
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
