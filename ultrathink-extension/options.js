// DEFAULT_SETTINGS, DEFAULT_CLASSIFICATION_PROMPT, DEFAULT_GRAMMAR_PROMPT imported from shared-constants.js

// Toggle collapsible sections
function toggleCollapsible(id) {
  const content = document.getElementById(id + 'Content');
  const arrow = document.getElementById(id + 'Arrow');

  if (content.classList.contains('open')) {
    content.classList.remove('open');
    arrow.textContent = '▶';
  } else {
    content.classList.add('open');
    arrow.textContent = '▼';
  }
}

// Make toggleCollapsible globally accessible for onclick handlers
window.toggleCollapsible = toggleCollapsible;

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

function validateApiKey(key) {
  if (!key) {
    return { valid: true }; // Optional field
  }

  // OpenAI keys typically start with sk-
  if (!key.startsWith('sk-')) {
    return { valid: false, error: 'API key should start with "sk-"' };
  }

  if (key.length < 20) {
    return { valid: false, error: 'API key appears too short' };
  }

  return { valid: true };
}

// Validation for GitHub token
function validateGithubToken(token) {
  if (!token) {
    return { valid: true }; // Optional field
  }

  // GitHub tokens: ghp_ (classic), github_pat_ (fine-grained), or gho_ (OAuth)
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_') && !token.startsWith('gho_')) {
    return { valid: false, error: 'GitHub token should start with "ghp_", "github_pat_", or "gho_"' };
  }

  if (token.length < 20) {
    return { valid: false, error: 'GitHub token appears too short' };
  }

  return { valid: true };
}

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  document.getElementById('projectFolder').value = settings.projectFolder;
  document.getElementById('openaiKey').value = settings.openaiKey || '';
  document.getElementById('debugMode').checked = settings.debugMode || false;
  document.getElementById('githubToken').value = settings.githubToken || '';
  document.getElementById('githubRepos').value = settings.githubRepos || '';

  // Load AI prompts (use saved value or default)
  document.getElementById('classificationPrompt').value =
    settings.classificationPrompt || DEFAULT_CLASSIFICATION_PROMPT;
  document.getElementById('grammarPrompt').value =
    settings.grammarPrompt || DEFAULT_GRAMMAR_PROMPT;

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

  // Setup reset prompt buttons
  document.getElementById('resetClassificationPrompt').addEventListener('click', () => {
    document.getElementById('classificationPrompt').value = DEFAULT_CLASSIFICATION_PROMPT;
  });

  document.getElementById('resetGrammarPrompt').addEventListener('click', () => {
    document.getElementById('grammarPrompt').value = DEFAULT_GRAMMAR_PROMPT;
  });
});

async function saveSettings() {
  const projectFolder = document.getElementById('projectFolder').value.trim();
  const openaiKey = document.getElementById('openaiKey').value.trim();
  const debugMode = document.getElementById('debugMode').checked;
  const githubToken = document.getElementById('githubToken').value.trim();
  const githubRepos = document.getElementById('githubRepos').value.trim();
  const classificationPrompt = document.getElementById('classificationPrompt').value.trim();
  const grammarPrompt = document.getElementById('grammarPrompt').value.trim();
  const statusEl = document.getElementById('status');

  // Validate project folder
  const folderValidation = validateProjectFolder(projectFolder);
  if (!folderValidation.valid) {
    statusEl.textContent = folderValidation.error;
    statusEl.className = 'status error';
    statusEl.style.display = 'block';
    return;
  }

  // Validate API key (optional but must be valid if provided)
  const keyValidation = validateApiKey(openaiKey);
  if (!keyValidation.valid) {
    statusEl.textContent = keyValidation.error;
    statusEl.className = 'status error';
    statusEl.style.display = 'block';
    return;
  }

  // Validate GitHub token (optional but must be valid if provided)
  const githubValidation = validateGithubToken(githubToken);
  if (!githubValidation.valid) {
    statusEl.textContent = githubValidation.error;
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

  // Save to storage
  // For prompts: save empty string if user hasn't modified from default (saves storage)
  const saveClassificationPrompt = (classificationPrompt === DEFAULT_CLASSIFICATION_PROMPT) ? '' : classificationPrompt;
  const saveGrammarPrompt = (grammarPrompt === DEFAULT_GRAMMAR_PROMPT) ? '' : grammarPrompt;

  await chrome.storage.sync.set({
    projectFolder: normalizedPath,
    openaiKey: openaiKey,
    debugMode: debugMode,
    githubToken: githubToken,
    githubRepos: githubRepos,
    classificationPrompt: saveClassificationPrompt,
    grammarPrompt: saveGrammarPrompt
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
