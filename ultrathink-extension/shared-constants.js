/**
 * @fileoverview Shared constants and utilities for the UltraThink Chrome extension.
 * Used by: background.js (service worker), options.js, popup.js
 * @module shared-constants
 */

/**
 * Native messaging host identifier for Chrome extension communication.
 * Must match the name in native-host/com.ultrathink.kbsaver.json
 * @constant {string}
 */
const HOST_NAME = 'com.ultrathink.kbsaver';

/**
 * Default extension settings - single source of truth.
 * These values are used when settings haven't been configured yet.
 * @constant {Object}
 * @property {string} projectFolder - Default folder path for storing kb.md and files
 * @property {string} openaiKey - OpenAI API key (empty by default, user must configure)
 * @property {boolean} debugMode - Whether to enable verbose console logging
 */
const DEFAULT_SETTINGS = {
  projectFolder: 'C:\\Users\\ChrisWright\\OneDrive - Fifty Five and Five\\dev\\ultrathink\\',
  openaiKey: '',
  debugMode: false,
  // External service integrations
  githubToken: '',
  githubRepos: ''  // Comma-separated list of repos to search (e.g., "owner/repo1, owner/repo2")
};

/**
 * Content type constants for categorising captured content.
 * Used throughout the extension to determine how content should be processed and displayed.
 * @constant {Object<string, string>}
 */
const CONTENT_TYPES = {
  // AI conversation types
  /** @type {string} Claude.ai conversation */
  CLAUDE: 'claude',
  /** @type {string} ChatGPT conversation */
  CHATGPT: 'chatgpt',
  /** @type {string} Perplexity.ai conversation */
  PERPLEXITY: 'perplexity',

  // Document types
  /** @type {string} PDF document */
  PDF: 'pdf',
  /** @type {string} Markdown file */
  MARKDOWN: 'markdown',
  /** @type {string} Microsoft Word document */
  MS_WORD: 'ms-word',
  /** @type {string} Microsoft Excel spreadsheet */
  MS_EXCEL: 'ms-excel',
  /** @type {string} Microsoft PowerPoint presentation */
  MS_POWERPOINT: 'ms-powerpoint',
  /** @type {string} Microsoft OneNote page */
  MS_ONENOTE: 'ms-onenote',
  /** @type {string} Notion page */
  NOTION: 'notion',

  // Media types
  /** @type {string} Image file (uploaded/dropped) */
  IMAGE: 'image',
  /** @type {string} Screenshot capture */
  SCREENSHOT: 'screenshot',
  /** @type {string} Video file */
  VIDEO: 'video',
  /** @type {string} Audio file */
  AUDIO: 'audio',

  // Text types
  /** @type {string} Text snippet selected from page */
  SNIPPET: 'snippet',
  /** @type {string} Paragraph of text */
  PARA: 'para',
  /** @type {string} Quick idea or thought */
  IDEA: 'idea',

  // Other
  /** @type {string} Generic web link */
  LINK: 'link',
  /** @type {string} Generic file */
  FILE: 'file'
};

/**
 * Maps file extensions to content types for automatic type detection.
 * Used when files are dropped onto the extension or uploaded.
 * @constant {Object<string, string>}
 */
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
 * Retrieves extension settings from Chrome sync storage.
 * Falls back to DEFAULT_SETTINGS for any missing values.
 *
 * @async
 * @function getSettings
 * @returns {Promise<Object>} Settings object with projectFolder, openaiKey, and debugMode
 * @example
 * const settings = await getSettings();
 * console.log(settings.projectFolder); // "C:\Users\..."
 */
async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

/**
 * Formats a Date object as a timestamp string for use in kb.md entries.
 * Uses ISO format but with space separator instead of 'T'.
 *
 * @function formatTimestamp
 * @param {Date} [date=new Date()] - Date to format, defaults to current time
 * @returns {string} Formatted timestamp in "YYYY-MM-DD HH:MM:SS" format
 * @example
 * formatTimestamp(); // "2025-11-27 10:30:45"
 * formatTimestamp(new Date('2024-01-01')); // "2024-01-01 00:00:00"
 */
function formatTimestamp(date = new Date()) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Detects the content type from a filename's extension.
 * Uses FILE_EXTENSION_MAP for lookups, defaults to FILE type.
 *
 * @function detectFileTypeFromName
 * @param {string} filename - Filename to analyse (e.g., "document.pdf")
 * @returns {string} Content type constant from CONTENT_TYPES
 * @example
 * detectFileTypeFromName("report.pdf"); // "pdf"
 * detectFileTypeFromName("image.png"); // "image"
 * detectFileTypeFromName("unknown.xyz"); // "file"
 */
function detectFileTypeFromName(filename) {
  if (!filename) return CONTENT_TYPES.FILE;

  const ext = filename.toLowerCase().split('.').pop();
  return FILE_EXTENSION_MAP[ext] || CONTENT_TYPES.FILE;
}
