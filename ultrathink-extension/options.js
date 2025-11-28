// DEFAULT_SETTINGS imported from shared-constants.js

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  // Load debugMode from chrome.storage (extension-specific setting only)
  const localSettings = await chrome.storage.sync.get({ debugMode: false });
  document.getElementById('debugMode').checked = localSettings.debugMode || false;

  // Setup save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);

  // Setup shortcuts button - opens Chrome's extension shortcuts page
  document.getElementById('shortcutsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});

async function saveSettings() {
  const debugMode = document.getElementById('debugMode').checked;
  const statusEl = document.getElementById('status');

  // Save debugMode to chrome.storage (extension-specific setting only)
  await chrome.storage.sync.set({ debugMode: debugMode });

  // Show success message
  statusEl.textContent = 'Settings saved successfully!';
  statusEl.className = 'status success';
  statusEl.style.display = 'block';

  // Hide after 2 seconds
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 2000);
}
