/**
 * UltraThink Logger - Centralized logging utility
 *
 * Usage:
 *   const log = createLogger('Grammar');
 *   log.debug('API response:', data);
 *   log.info('Grammar fix completed');
 *   log.warn('No API key configured');
 *   log.error('API call failed:', error);
 *
 * Filter in DevTools Console:
 *   - "UltraThink" - all extension logs
 *   - "UltraThink:Grammar" - grammar module only
 *   - "DEBUG" or "ERROR" - by level
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Cache for debug setting to avoid async calls on every log
let _debugEnabled = false;
let _settingsLoaded = false;

/**
 * Initialize logger by loading settings.
 * Call this once at startup in service worker or extension pages.
 */
async function initLogger() {
  try {
    const settings = await chrome.storage.sync.get({ debugMode: false });
    _debugEnabled = settings.debugMode;
    _settingsLoaded = true;
  } catch (e) {
    // Content scripts may not have chrome.storage access
    _debugEnabled = false;
    _settingsLoaded = true;
  }
}

/**
 * Listen for settings changes to update debug flag in real-time.
 */
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.debugMode) {
      _debugEnabled = changes.debugMode.newValue;
    }
  });
}

/**
 * Format timestamp for log output (HH:MM:SS).
 */
function formatLogTimestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Create a logger instance for a specific module.
 * @param {string} moduleName - The module/component name (e.g., 'Grammar', 'Screenshot')
 * @returns {object} Logger object with debug, info, warn, error methods
 */
function createLogger(moduleName) {
  const prefix = `[UltraThink:${moduleName}]`;

  function log(level, levelName, consoleFn, ...args) {
    // Always show errors; other levels require debug mode
    if (level < LOG_LEVELS.ERROR && !_debugEnabled) {
      return;
    }

    const timestamp = formatLogTimestamp();
    const formattedPrefix = `${prefix} ${levelName} | ${timestamp} |`;

    consoleFn(formattedPrefix, ...args);
  }

  return {
    debug: (...args) => log(LOG_LEVELS.DEBUG, 'DEBUG', console.log, ...args),
    info: (...args) => log(LOG_LEVELS.INFO, 'INFO', console.log, ...args),
    warn: (...args) => log(LOG_LEVELS.WARN, 'WARN', console.warn, ...args),
    error: (...args) => log(LOG_LEVELS.ERROR, 'ERROR', console.error, ...args)
  };
}

/**
 * Create a self-contained logger for content scripts.
 * Content scripts are injected and can't import external files,
 * so this version includes everything inline.
 *
 * @param {string} moduleName - Module name for prefix
 * @param {boolean} debugEnabled - Whether debug logging is enabled
 */
function createContentLogger(moduleName, debugEnabled = false) {
  const prefix = `[UltraThink:${moduleName}]`;

  function ts() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function log(level, levelName, consoleFn, ...args) {
    // Always show errors (level 3); others require debug mode
    if (level < 3 && !debugEnabled) {
      return;
    }
    consoleFn(`${prefix} ${levelName} | ${ts()} |`, ...args);
  }

  return {
    debug: (...args) => log(0, 'DEBUG', console.log, ...args),
    info: (...args) => log(1, 'INFO', console.log, ...args),
    warn: (...args) => log(2, 'WARN', console.warn, ...args),
    error: (...args) => log(3, 'ERROR', console.error, ...args)
  };
}

/**
 * Check if debug mode is currently enabled.
 * Useful for conditional expensive operations.
 */
function isDebugEnabled() {
  return _debugEnabled;
}
