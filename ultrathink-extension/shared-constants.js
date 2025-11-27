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
  githubRepos: '',  // Comma-separated list of repos to search (e.g., "owner/repo1, owner/repo2")
  // AI prompts (customisable)
  classificationPrompt: '',  // Empty means use default
  grammarPrompt: ''  // Empty means use default
};

/**
 * Default AI prompt for entry classification.
 * Used when classificationPrompt setting is empty.
 * Placeholders: {title}, {url}, {content}, {existing_topics}, {existing_people}
 */
const DEFAULT_CLASSIFICATION_PROMPT = `Analyze this knowledge base entry and classify it as "project", "task", or "knowledge".

Title: {title}
URL: {url}
Content: {content}

ENTITY CLASSIFICATION (in priority order):
- "project" = References a bigger initiative, project idea, feature request, or something to build. If you see the word "project" it is a project. A video or image on its own is rarely going to be a project unless associated text indicates.
- "task" = Action item, reminder, todo, something that needs to be done. If you see the word "task" it is a task. Unless you already decided it's a project.
- "knowledge" = Fact, reference, documentation, information to remember. Unless already decided it's a project or task.
- "unclassified" = Cannot determine from the content.

TOPIC EXTRACTION:
Extract 1-5 topic tags. STRONGLY prefer existing topics: {existing_topics}
- If a topic is similar to an existing one (e.g. "React" vs "ReactJS", "ML" vs "Machine Learning"), use the EXISTING one
- Only create a new topic if nothing similar exists

PEOPLE EXTRACTION:
Extract any people names mentioned.
STRONGLY prefer existing people: {existing_people}
- If a name matches an existing person's first name, use the FULL existing name (e.g. "Kevin" -> "Kevin Smith")
- If a name has a typo but is similar to existing (e.g. "Jon" vs "John"), use the EXISTING correct spelling
- Only add new people if no similar match exists

Return JSON only:
{
  "entity": "project|task|knowledge|unclassified",
  "topics": ["topic1", "topic2"],
  "people": ["Kevin Smith", "Jane Doe"]
}`;

/**
 * Default AI prompt for grammar correction.
 * Used when grammarPrompt setting is empty.
 * Placeholders: {text}, {domain}, {title}, {type}
 */
const DEFAULT_GRAMMAR_PROMPT = `Fix spelling and grammar errors in this note. Use UK spelling and sentence case. Never use em dash. If you can improve wording and flow without losing meaning do that. If you cannot work out meaning then don't make major changes.
Context: From {domain}
Page: {title}
Type: {type}
Preserve technical terms, jargon, domain-specific language, brands, names of things, people etc. and capitalise them correctly.

Original text: "{text}"

Return JSON only:
{"corrected": "the corrected text here"}`;

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
