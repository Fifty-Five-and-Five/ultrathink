// Default settings
const DEFAULT_SETTINGS = {
  projectFolder: 'C:\\Users\\ChrisWright\\OneDrive - Fifty Five and Five\\dev\\ultrathink\\',
  openaiKey: ''
};

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  document.getElementById('projectFolder').value = settings.projectFolder;
  document.getElementById('openaiKey').value = settings.openaiKey || '';

  // Setup save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
});

async function saveSettings() {
  const projectFolder = document.getElementById('projectFolder').value.trim();
  const openaiKey = document.getElementById('openaiKey').value.trim();
  const statusEl = document.getElementById('status');

  // Validate
  if (!projectFolder) {
    statusEl.textContent = 'Please enter a project folder path';
    statusEl.className = 'status error';
    statusEl.style.display = 'block';
    return;
  }

  // Ensure it ends with backslash
  let normalizedPath = projectFolder;
  if (!normalizedPath.endsWith('\\')) {
    normalizedPath += '\\';
  }

  // Save to storage
  await chrome.storage.sync.set({
    projectFolder: normalizedPath,
    openaiKey: openaiKey
  });

  // Show success message
  statusEl.textContent = 'Settings saved successfully!';
  statusEl.className = 'status success';

  // Update input with normalized path
  document.getElementById('projectFolder').value = normalizedPath;

  // Hide after 2 seconds
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 2000);
}
