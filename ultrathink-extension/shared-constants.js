// Shared constants for UltraThink extension
// Used by: background.js (service worker), options.js

// Native messaging host name
const HOST_NAME = 'com.ultrathink.kbsaver';

// Default settings - single source of truth
const DEFAULT_SETTINGS = {
  projectFolder: 'C:\\Users\\ChrisWright\\OneDrive - Fifty Five and Five\\dev\\ultrathink\\',
  openaiKey: '',
  debugMode: false
};

// Content type constants
const CONTENT_TYPES = {
  // AI conversation types
  CLAUDE: 'claude',
  CHATGPT: 'chatgpt',
  PERPLEXITY: 'perplexity',

  // Document types
  PDF: 'pdf',
  MARKDOWN: 'markdown',
  MS_WORD: 'ms-word',
  MS_EXCEL: 'ms-excel',
  MS_POWERPOINT: 'ms-powerpoint',
  MS_ONENOTE: 'ms-onenote',
  NOTION: 'notion',

  // Media types
  IMAGE: 'image',
  SCREENSHOT: 'screenshot',
  VIDEO: 'video',
  AUDIO: 'audio',

  // Text types
  SNIPPET: 'snippet',
  PARA: 'para',
  IDEA: 'idea',

  // Other
  LINK: 'link',
  FILE: 'file'
};

// File extension mappings
const FILE_EXTENSION_MAP = {
  // Markdown
  'md': CONTENT_TYPES.MARKDOWN,

  // PDF
  'pdf': CONTENT_TYPES.PDF,

  // MS Office
  'doc': CONTENT_TYPES.MS_WORD,
  'docx': CONTENT_TYPES.MS_WORD,
  'rtf': CONTENT_TYPES.MS_WORD,
  'ppt': CONTENT_TYPES.MS_POWERPOINT,
  'pptx': CONTENT_TYPES.MS_POWERPOINT,
  'xls': CONTENT_TYPES.MS_EXCEL,
  'xlsx': CONTENT_TYPES.MS_EXCEL,
  'csv': CONTENT_TYPES.MS_EXCEL,
  'one': CONTENT_TYPES.MS_ONENOTE,
  'onetoc2': CONTENT_TYPES.MS_ONENOTE,

  // Audio
  'mp3': CONTENT_TYPES.AUDIO,
  'wav': CONTENT_TYPES.AUDIO,
  'ogg': CONTENT_TYPES.AUDIO,
  'flac': CONTENT_TYPES.AUDIO,
  'aac': CONTENT_TYPES.AUDIO,
  'm4a': CONTENT_TYPES.AUDIO,
  'wma': CONTENT_TYPES.AUDIO,
  'aiff': CONTENT_TYPES.AUDIO,

  // Video
  'mp4': CONTENT_TYPES.VIDEO,
  'mkv': CONTENT_TYPES.VIDEO,
  'avi': CONTENT_TYPES.VIDEO,
  'mov': CONTENT_TYPES.VIDEO,
  'wmv': CONTENT_TYPES.VIDEO,
  'flv': CONTENT_TYPES.VIDEO,
  'webm': CONTENT_TYPES.VIDEO,

  // Image
  'jpg': CONTENT_TYPES.IMAGE,
  'jpeg': CONTENT_TYPES.IMAGE,
  'png': CONTENT_TYPES.IMAGE,
  'gif': CONTENT_TYPES.IMAGE,
  'bmp': CONTENT_TYPES.IMAGE,
  'svg': CONTENT_TYPES.IMAGE,
  'webp': CONTENT_TYPES.IMAGE
};

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Get settings from Chrome storage with defaults
 * @returns {Promise<Object>} Settings object
 */
async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

/**
 * Format current date as timestamp string
 * Format: YYYY-MM-DD HH:MM:SS
 * @param {Date} [date] - Optional date, defaults to now
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(date = new Date()) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Detect content type from filename extension
 * @param {string} filename - Filename to analyze
 * @returns {string} Content type constant
 */
function detectFileTypeFromName(filename) {
  if (!filename) return CONTENT_TYPES.FILE;

  const ext = filename.toLowerCase().split('.').pop();
  return FILE_EXTENSION_MAP[ext] || CONTENT_TYPES.FILE;
}
