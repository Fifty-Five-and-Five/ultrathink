// DEFAULT_SETTINGS imported from shared-constants.js

// Input validation functions
function validateProjectFolder(path) {
  if (!path) {
    return { valid: false, error: 'Please enter a project folder path' };
  }

  // Must be absolute path (Windows drive letter, UNC path, or Unix root)
  const isAbsolute = /^([A-Za-z]:\\|\\\\|\/)/.test(path);
  if (!isAbsolute) {
    return { valid: false, error: 'Path must be absolute (e.g., C:\\Users\\...)' };
  }

  // Block path traversal
  if (path.includes('..')) {
    return { valid: false, error: 'Path cannot contain ".."' };
  }

  // Block dangerous system directories
  const blockedPatterns = [
    /^[A-Za-z]:\\Windows/i,
    /^[A-Za-z]:\\Program Files/i,
    /^[A-Za-z]:\\ProgramData/i,
    /^\/etc\//,
    /^\/usr\//,
    /^\/bin\//,
    /^\/var\//
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(path)) {
      return { valid: false, error: 'Cannot use system directories' };
    }
  }

  return { valid: true };
}

// Load saved settings (settings.json via native host is source of truth)
document.addEventListener('DOMContentLoaded', async () => {
  // Load project folder from native host (settings.json is only source)
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response?.success) {
      document.getElementById('projectFolder').value = response.project_folder || '';
    } else {
      // Show error if native host unavailable
      const statusEl = document.getElementById('status');
      statusEl.textContent = 'Native host unavailable. Please ensure UltraThink widget is installed.';
      statusEl.className = 'status error';
      statusEl.style.display = 'block';
    }
  } catch (error) {
    console.error('Failed to load settings from native host:', error);
    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Failed to connect to native host.';
    statusEl.className = 'status error';
    statusEl.style.display = 'block';
  }

  // Load debugMode from chrome.storage (extension-specific setting only)
  const localSettings = await chrome.storage.sync.get({ debugMode: false });
  document.getElementById('debugMode').checked = localSettings.debugMode || false;

  // Setup save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  // Setup browse button
  document.getElementById('browseBtn').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'browseFolder' });
      if (response?.success && response?.path) {
        document.getElementById('projectFolder').value = response.path;
      } else if (response?.error) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = response.error;
        statusEl.className = 'status error';
        statusEl.style.display = 'block';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    } catch (error) {
      console.error('Browse error:', error);
    }
  });

  // Setup shortcuts button - opens Chrome's extension shortcuts page
  document.getElementById('shortcutsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});

async function saveSettings() {
  const projectFolder = document.getElementById('projectFolder').value.trim();
  const debugMode = document.getElementById('debugMode').checked;
  const statusEl = document.getElementById('status');

  // Validate project folder
  const folderValidation = validateProjectFolder(projectFolder);
  if (!folderValidation.valid) {
    statusEl.textContent = folderValidation.error;
    statusEl.className = 'status error';
    statusEl.style.display = 'block';
    return;
  }

  // Ensure path ends with backslash (Windows) or slash (Unix)
  let normalizedPath = projectFolder;
  if (!normalizedPath.endsWith('\\') && !normalizedPath.endsWith('/')) {
    // Use backslash for Windows paths, slash for Unix
    normalizedPath += normalizedPath.includes('\\') ? '\\' : '/';
  }

  // Save project folder to native host (settings.json is only source)
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: { project_folder: normalizedPath }
    });
    if (!response?.success) {
      statusEl.textContent = response?.error || 'Failed to save settings';
      statusEl.className = 'status error';
      statusEl.style.display = 'block';
      return;
    }
  } catch (error) {
    statusEl.textContent = 'Failed to connect to native host';
    statusEl.className = 'status error';
    statusEl.style.display = 'block';
    return;
  }

  // Save debugMode to chrome.storage (extension-specific setting only)
  await chrome.storage.sync.set({ debugMode: debugMode });

  // Show success message
  statusEl.textContent = 'Settings saved successfully!';
  statusEl.className = 'status success';
  statusEl.style.display = 'block';

  // Update input with normalized path
  document.getElementById('projectFolder').value = normalizedPath;

  // Hide after 2 seconds
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 2000);
}
