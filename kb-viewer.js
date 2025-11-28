/**
 * Ultrathink KB Viewer - Client-side JavaScript
 * Handles Tabulator grid initialization and API interactions
 *
 * @fileoverview Main application module for the UltraThink knowledge base viewer.
 * Uses a module pattern to encapsulate state and prevent global namespace pollution.
 */

/**
 * Entity badge color mappings
 * @constant {Object<string, string>}
 */
const ENTITY_COLORS = {
    project: '#d1d5db',       // Light grey
    task: '#d1d5db',          // Light grey
    knowledge: '#d1d5db',     // Light grey
    unclassified: '#d1d5db'   // Light grey
};

/**
 * Category badge color mappings (work/personal)
 * @constant {Object<string, string>}
 */
const CATEGORY_COLORS = {
    work: '#3b82f6',          // Blue
    personal: '#10b981'       // Green
};

/**
 * Type badge color mappings - clean, modern palette
 * @constant {Object<string, string>}
 */
const TYPE_COLORS = {
    // Core types
    link: '#6366f1',           // Indigo
    snippet: '#ec4899',        // Pink
    screenshot: '#8b5cf6',     // Violet

    // Files & Documents
    file: '#3b82f6',           // Bright blue
    pdf: '#ef4444',            // Red
    markdown: '#64748b',       // Slate
    image: '#06b6d4',          // Cyan

    // Microsoft Office
    'ms-word': '#2563eb',      // Blue
    'ms-excel': '#16a34a',     // Green
    'ms-powerpoint': '#ea580c', // Orange
    'ms-onenote': '#7c3aed',   // Purple

    // AI Assistants
    claude: '#f97316',         // Orange
    chatgpt: '#059669',        // Emerald
    perplexity: '#0ea5e9',     // Sky

    // Productivity
    notion: '#374151',         // Gray

    // Media
    video: '#dc2626',          // Red
    audio: '#ec4899',          // Pink

    // Notes
    idea: '#eab308',           // Yellow
    para: '#14b8a6',           // Teal
    'long-note': '#ffb627',    // Orange/Yellow
    note: '#ffb627'            // Orange/Yellow
};

/**
 * Application state container - encapsulates all mutable state
 * @namespace
 */
const AppState = {
    /** @type {Tabulator|null} Current Tabulator instance */
    table: null,
    /** @type {Array<Object>} All entries loaded from API */
    allEntries: [],
    /** @type {Array<string>} All topics loaded from API */
    allTopics: [],
    /** @type {Array<string>} All people/entities loaded from API */
    allPeople: [],
    /** @type {string} Current page/view name */
    currentPage: 'home',
    /** @type {Array<Object>} Kanban board columns */
    kanbanColumns: [],
    /** @type {string} Current task view mode ('list' or 'kanban') */
    currentTaskView: 'list'
};

/**
 * AI polling state container - manages background polling for AI summaries
 * @namespace
 */
const AiPollingState = {
    /** @type {number|null} Interval ID for polling */
    interval: null,
    /** @type {number|null} Timeout ID for max polling duration */
    timeout: null,
    /** @type {string|null} Timestamp of entry being polled */
    timestamp: null
};

/**
 * Visualisation state container - manages vis.js network graph
 * @namespace
 */
const VisState = {
    /** @type {vis.Network|null} Current vis.js network instance */
    network: null,
    /** @type {vis.DataSet|null} Network nodes dataset */
    nodes: null,
    /** @type {vis.DataSet|null} Network edges dataset */
    edges: null
};

/**
 * Logs state container - manages real-time API logs display
 * @namespace
 */
const LogsState = {
    /** @type {Array} Current logs array */
    logs: [],
    /** @type {number|null} Polling interval ID */
    pollInterval: null,
    /** @type {string|null} Timestamp of most recent log for incremental updates */
    lastTimestamp: null,
    /** @type {boolean} Whether auto-refresh is enabled */
    autoRefresh: true,
    /** @type {boolean} Whether logs page has been initialized */
    initialized: false
};

// Legacy variable aliases for backwards compatibility with existing code
// These will be gradually removed as code is refactored
let table = null;
let allEntries = [];
let allTopics = [];
let allPeople = [];
let currentPage = 'home';

// AI polling state (legacy aliases)
let aiPollInterval = null;
let aiPollTimeout = null;
let aiPollTimestamp = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadEntries();
    await loadTopics();
    await loadPeople();
    setupEventListeners();
    setupNavigation();
    setupModal();
    setupManagementPages();
});

/**
 * Fetch entries from API and initialize table
 */
async function loadEntries() {
    try {
        const response = await fetch('/api/entries');
        if (!response.ok) throw new Error('Failed to fetch entries');

        allEntries = await response.json();
        initTable(allEntries);
        populateFilters(allEntries);
        updateEntryCount(allEntries.length);
    } catch (error) {
        console.error('Failed to load entries:', error);
        document.getElementById('entryCount').textContent = 'Error loading entries';
        showStatus('Failed to load entries: ' + error.message, 'error');
    }
}

/**
 * Populate filter dropdowns
 */
function populateFilters(entries) {
    const types = [...new Set(entries.map(e => e.type).filter(Boolean))].sort();
    const sources = [...new Set(entries.map(e => e.source).filter(Boolean))].sort();
    const entities = [...new Set(entries.map(e => e.entity).filter(Boolean))].sort();

    const typeSelect = document.getElementById('filterType');
    types.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        typeSelect.appendChild(opt);
    });

    const sourceSelect = document.getElementById('filterSource');
    sources.forEach(source => {
        const opt = document.createElement('option');
        opt.value = source;
        opt.textContent = source;
        sourceSelect.appendChild(opt);
    });

    const entitySelect = document.getElementById('filterEntity');
    if (entitySelect) {
        entities.forEach(entity => {
            const opt = document.createElement('option');
            opt.value = entity;
            opt.textContent = entity;
            entitySelect.appendChild(opt);
        });
    }
}

/**
 * Initialize Tabulator grid with data
 */
function initTable(entries) {
    if (table) {
        table.destroy();
    }

    table = new Tabulator("#kb-table", {
        data: entries,
        layout: "fitColumns",
        responsiveLayout: "collapse",
        selectable: true,
        placeholder: "No entries found",
        height: "calc(100vh - 180px)",
        columns: [
            {
                formatter: "rowSelection",
                titleFormatter: "rowSelection",
                hozAlign: "center",
                headerSort: false,
                width: 45
            },
            {
                title: "Title",
                field: "title",
                formatter: titleFormatter,
                widthGrow: 1.6
            },
            {
                title: "Type",
                field: "type",
                formatter: typeBadgeFormatter,
                width: 100
            },
            {
                title: "Notes",
                field: "content",
                formatter: contentFormatter,
                widthGrow: 2
            },
            {
                title: "Entity",
                field: "entity",
                formatter: entityBadgeFormatter,
                width: 100
            },
            {
                title: "Category",
                field: "category",
                formatter: categoryBadgeFormatter,
                width: 90
            },
            {
                title: "Topics",
                field: "topics",
                formatter: topicsFormatter,
                widthGrow: 1
            },
            {
                title: "People",
                field: "people",
                formatter: peopleFormatter,
                widthGrow: 1
            },
            {
                title: "Source",
                field: "source",
                formatter: sourceFormatter,
                width: 100
            },
            {
                title: "Date",
                field: "timestamp",
                formatter: dateFormatter,
                sorter: "string",
                width: 150
            },
            {
                title: "",
                formatter: actionsFormatter,
                width: 50,
                headerSort: false,
                hozAlign: "center"
            }
        ],
        initialSort: [{ column: "timestamp", dir: "desc" }]
    });

    // Update delete button state on selection change
    table.on("rowSelectionChanged", function(data, rows) {
        document.getElementById('deleteSelected').disabled = rows.length === 0;
    });

    // Row click opens modal (but not on selection checkbox or delete button)
    table.on("rowClick", function(e, row) {
        const target = e.target;
        if (target.closest('.tabulator-row-handle') ||
            target.closest('.delete-btn') ||
            target.classList.contains('tabulator-row-handle') ||
            target.type === 'checkbox') {
            return;
        }
        openDetailPanel(row.getData());
    });
}

/**
 * Custom formatter for title
 */
function titleFormatter(cell) {
    const data = cell.getRow().getData();
    const title = escapeHtml(data.title) || '(untitled)';

    if (data.url) {
        return `<a href="${escapeHtml(data.url)}" target="_blank" class="title-link" onclick="event.stopPropagation()" title="${escapeHtml(data.url)}">${title}</a>`;
    }

    return title;
}

/**
 * Custom formatter for type badges - click to visualise
 */
function typeBadgeFormatter(cell) {
    const type = cell.getValue();
    if (!type) return '';

    const color = TYPE_COLORS[type] || '#64748b';
    return `<span class="type-badge" style="background:${color};cursor:pointer" onclick="event.stopPropagation(); navigateToVisualise('type', '${escapeHtml(type)}')">${escapeHtml(type)}</span>`;
}

/**
 * Custom formatter for source (plain text)
 */
function sourceFormatter(cell) {
    const source = cell.getValue();
    if (!source) return '';
    return `<span class="source-text">${escapeHtml(source)}</span>`;
}

/**
 * Custom formatter for dates - human readable
 */
function dateFormatter(cell) {
    const timestamp = cell.getValue();
    if (!timestamp) return '';

    try {
        const date = new Date(timestamp.replace(' ', 'T'));
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Format time
        const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        if (diffDays === 0) {
            return `Today, ${timeStr}`;
        } else if (diffDays === 1) {
            return `Yesterday, ${timeStr}`;
        } else if (diffDays < 7) {
            const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
            return `${dayName}, ${timeStr}`;
        } else {
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
        }
    } catch {
        return timestamp;
    }
}

/**
 * Strip markdown syntax for plain text display in grid
 */
function stripMarkdown(text) {
    if (!text) return '';

    // Remove bold: **text** or __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');

    // Remove italic: *text* or _text_
    text = text.replace(/(?<![\\*_])\*([^*]+)\*(?![*])/g, '$1');
    text = text.replace(/(?<![\\*_])_([^_]+)_(?![_])/g, '$1');

    // Remove inline code: `code`
    text = text.replace(/`([^`]+)`/g, '$1');

    // Remove links: [text](url) -> text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove headers: ## Header -> Header
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Remove blockquotes: > text -> text
    text = text.replace(/^>\s+/gm, '');

    // Remove bullet points: - item -> item
    text = text.replace(/^-\s+/gm, '');

    return text;
}

/**
 * Custom formatter for content/notes - strips markdown for grid display
 */
function contentFormatter(cell) {
    const content = cell.getValue();
    if (!content) return '';

    // Strip markdown for grid display
    const plain = stripMarkdown(content);
    const truncated = plain.length > 80 ? plain.substring(0, 80) + '...' : plain;
    return `<span class="content-cell" title="${escapeHtml(plain)}">${escapeHtml(truncated)}</span>`;
}

/**
 * Custom formatter for entity badges
 */
function entityBadgeFormatter(cell) {
    const entity = cell.getValue();
    if (!entity) return '';

    const color = ENTITY_COLORS[entity] || ENTITY_COLORS.unclassified;
    return `<span class="entity-badge" style="background:${color}">${escapeHtml(entity)}</span>`;
}

/**
 * Custom formatter for category (work/personal)
 */
function categoryBadgeFormatter(cell) {
    const category = cell.getValue();
    if (!category) return '';

    const color = CATEGORY_COLORS[category] || '#6b7280';
    return `<span class="type-badge" style="background-color:${color}">${escapeHtml(category)}</span>`;
}

/**
 * Custom formatter for topics (tags) - click to visualise
 */
function topicsFormatter(cell) {
    const topics = cell.getValue();
    if (!topics || !Array.isArray(topics) || topics.length === 0) return '';

    return topics.map(topic =>
        `<span class="topic-tag" onclick="event.stopPropagation(); navigateToVisualise('topic', '${escapeHtml(topic)}')">${escapeHtml(topic)}</span>`
    ).join('');
}

/**
 * Custom formatter for people (tags) - click to visualise
 */
function peopleFormatter(cell) {
    const people = cell.getValue();
    if (!people || !Array.isArray(people) || people.length === 0) return '';

    return people.map(person =>
        `<span class="person-tag" onclick="event.stopPropagation(); navigateToVisualise('person', '${escapeHtml(person)}')">${escapeHtml(person)}</span>`
    ).join('');
}

/**
 * Filter by topic when clicking a topic tag
 */
function filterByTopic(topic) {
    const searchInput = document.getElementById('search');
    searchInput.value = topic;
    applyFilters();
}

/**
 * Filter by person when clicking a person tag
 */
function filterByPerson(person) {
    const searchInput = document.getElementById('search');
    searchInput.value = person;
    applyFilters();
}

/**
 * Navigate to visualisation page with a filter context
 * @param {string} filterType - 'type', 'topic', or 'person'
 * @param {string} filterValue - The value to filter by
 */
function navigateToVisualise(filterType, filterValue) {
    navigateToPage('visualise', { type: filterType, value: filterValue });
}

/**
 * Custom formatter for delete button
 */
function actionsFormatter(cell) {
    const timestamp = cell.getRow().getData().timestamp;
    return `<button class="delete-btn" onclick="event.stopPropagation(); deleteEntry('${escapeHtml(timestamp)}')" title="Delete entry">&times;</button>`;
}

/**
 * Open modal with entry details
 * Order: My Notes -> Content (file/video/image/etc) -> AI Summary -> Status bar
 */
function openModal(entry) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');

    // Set title
    if (entry.url) {
        titleEl.innerHTML = `<a href="${escapeHtml(entry.url)}" target="_blank">${escapeHtml(entry.title) || '(untitled)'}</a>`;
    } else {
        titleEl.textContent = entry.title || '(untitled)';
    }

    let bodyHtml = '';

    // 0. SNIPPET (selected text from page) - first if present
    if (entry.selectedText) {
        bodyHtml += `
            <div class="modal-section modal-snippet-section">
                <button class="modal-copy-btn" onclick="copyToClipboard(this, 'snippet')" title="Copy to clipboard">
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/>
                    </svg>
                </button>
                <h4>SNIPPET</h4>
                <div class="modal-snippet-text">${escapeHtml(entry.selectedText)}</div>
            </div>
        `;
    }

    // 1. MY NOTES (user's notes)
    if (entry.content) {
        bodyHtml += `
            <div class="modal-section modal-notes-section">
                <button class="modal-copy-btn" onclick="copyToClipboard(this, 'notes')" title="Copy to clipboard">
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/>
                    </svg>
                </button>
                <h4>MY NOTES</h4>
                <div class="modal-notes-text">${renderMarkdown(entry.content)}</div>
            </div>
        `;
    }

    // 2. AI SUMMARY - aiSummary field (light yellow panel, directly after MY NOTES)
    // Show spinner if no AI Summary yet (AI processing in progress)
    const NO_SUMMARY_TYPES = ['video'];  // Types that don't get AI summaries
    const shouldHaveAiSummary = !NO_SUMMARY_TYPES.includes(entry.type);

    if (entry.aiSummary) {
        bodyHtml += `
            <div class="modal-section modal-ai-section">
                <button class="modal-copy-btn" onclick="copyToClipboard(this, 'ai')" title="Copy to clipboard">
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                        <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/>
                    </svg>
                </button>
                <h4>AI SUMMARY</h4>
                <div class="modal-ai-text">${escapeHtml(entry.aiSummary)}</div>
            </div>
        `;
    } else if (shouldHaveAiSummary) {
        // Show spinner for entries that should have AI summary but don't yet
        bodyHtml += `
            <div class="modal-section modal-ai-section">
                <h4>AI SUMMARY <span class="ai-processing-spinner" title="AI processing in progress..."></span></h4>
                <div class="modal-ai-text"></div>
            </div>
        `;
    }

    // 3. CONTENT - file/screenshot/video/audio/text preview (after AI summary)
    if (entry.screenshot) {
        bodyHtml += `
            <div class="modal-section modal-file-section">
                <img src="/${escapeHtml(entry.screenshot)}" class="modal-screenshot"
                     onclick="window.open('/${escapeHtml(entry.screenshot)}', '_blank')"
                     title="Click to view full size">
            </div>
        `;
    }

    if (entry.file) {
        const fileName = entry.file.split('/').pop();
        const ext = fileName.split('.').pop().toLowerCase();
        const filePath = `/${escapeHtml(entry.file)}`;

        // Audio files
        const audioExts = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a'];
        // Video files
        const videoExts = ['mp4', 'webm', 'ogv', 'mov', 'avi'];
        // Image files
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
        // Text/code files for inline preview
        const textExts = ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'sql', 'csv', 'log', 'ini', 'cfg', 'conf', 'env', 'gitignore', 'dockerfile'];
        // PDF
        const isPdf = ext === 'pdf';

        if (audioExts.includes(ext)) {
            bodyHtml += `
                <div class="modal-section modal-file-section">
                    <audio controls class="modal-audio">
                        <source src="${filePath}" type="audio/${ext === 'mp3' ? 'mpeg' : ext}">
                        Your browser does not support audio playback.
                    </audio>
                </div>
            `;
        } else if (videoExts.includes(ext)) {
            bodyHtml += `
                <div class="modal-section modal-file-section">
                    <video controls class="modal-video">
                        <source src="${filePath}" type="video/${ext === 'mov' ? 'quicktime' : ext}">
                        Your browser does not support video playback.
                    </video>
                </div>
            `;
        } else if (imageExts.includes(ext)) {
            bodyHtml += `
                <div class="modal-section modal-file-section">
                    <img src="${filePath}" class="modal-screenshot"
                         onclick="window.open('${filePath}', '_blank')"
                         title="Click to view full size">
                </div>
            `;
        } else if (isPdf) {
            bodyHtml += `
                <div class="modal-section modal-file-section">
                    <iframe src="${filePath}" class="modal-pdf-viewer"></iframe>
                </div>
            `;
        } else if (textExts.includes(ext)) {
            // Text/code file - load inline
            bodyHtml += `
                <div class="modal-section modal-file-section">
                    <pre class="modal-code-preview" data-file="${filePath}">Loading...</pre>
                </div>
            `;
        }
        // For other file types, title is already a link - no extra section needed
    }

    // 4. PAGE INFO - description and page metadata (always show if present)
    const hasPageInfo = entry.description || entry.ogImage || entry.author || entry.publishedDate || entry.readingTime;
    if (hasPageInfo) {
        bodyHtml += `<div class="modal-section modal-page-info">`;
        bodyHtml += `<h4>PAGE INFO</h4>`;

        if (entry.ogImage) {
            bodyHtml += `
                <div class="modal-og-image">
                    <img src="${escapeHtml(entry.ogImage)}" alt="Preview"
                         onerror="this.parentElement.style.display='none'"
                         onclick="window.open('${escapeHtml(entry.ogImage)}', '_blank')">
                </div>
            `;
        }

        if (entry.description) {
            bodyHtml += `<div class="modal-page-desc">${escapeHtml(entry.description)}</div>`;
        }

        // Small metadata row
        const metaParts = [];
        if (entry.author) metaParts.push(`Author: ${escapeHtml(entry.author)}`);
        if (entry.publishedDate) metaParts.push(`Published: ${escapeHtml(entry.publishedDate)}`);
        if (entry.readingTime && entry.readingTime > 0) metaParts.push(`~${entry.readingTime} min read`);
        if (metaParts.length > 0) {
            bodyHtml += `<div class="modal-page-meta">${metaParts.join(' • ')}</div>`;
        }

        bodyHtml += `</div>`;
    }

    // 4. STATUS BAR - tags row + meta row
    const hasTags = (entry.topics && entry.topics.length > 0) || (entry.people && entry.people.length > 0);

    bodyHtml += `<div class="modal-status-bar">`;

    // Tags row (topics + people)
    if (hasTags) {
        bodyHtml += `<div class="modal-status-tags">`;
        if (entry.topics && Array.isArray(entry.topics)) {
            bodyHtml += entry.topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('');
        }
        if (entry.people && Array.isArray(entry.people)) {
            bodyHtml += entry.people.map(p => `<span class="person-tag">${escapeHtml(p)}</span>`).join('');
        }
        bodyHtml += `</div>`;
    }

    // Meta row (entity, type, source, date)
    bodyHtml += `
        <div class="modal-status-meta">
            ${entry.entity ? `<span class="entity-badge" style="background:${ENTITY_COLORS[entry.entity] || ENTITY_COLORS.unclassified}">${escapeHtml(entry.entity)}</span>` : ''}
            <span class="type-badge" style="background:${TYPE_COLORS[entry.type] || '#64748b'}">${escapeHtml(entry.type)}</span>
            <span class="modal-status-item">captured from ${escapeHtml(entry.source)} at ${escapeHtml(entry.timestamp)}</span>
        </div>
    </div>
    `;

    bodyEl.innerHTML = bodyHtml;
    overlay.classList.add('active');

    // Load text file content if needed
    const codePreview = bodyEl.querySelector('.modal-code-preview');
    if (codePreview) {
        const filePath = codePreview.dataset.file;
        fetch(filePath)
            .then(r => r.text())
            .then(text => {
                // Limit to first 200 lines
                const lines = text.split('\n');
                const preview = lines.slice(0, 200).join('\n');
                codePreview.textContent = preview + (lines.length > 200 ? '\n\n... (' + (lines.length - 200) + ' more lines)' : '');
            })
            .catch(() => {
                codePreview.textContent = 'Failed to load file';
            });
    }

    // Start polling for AI summary if entry doesn't have one yet
    if (!entry.aiSummary && shouldHaveAiSummary) {
        startAiPolling(entry.timestamp);
    }
}

/**
 * Close modal
 */
function closeModal() {
    stopAiPolling();
    document.getElementById('modalOverlay').classList.remove('active');
}

/**
 * Start polling for AI processing updates
 * @param {string} timestamp - The entry timestamp to poll for
 */
function startAiPolling(timestamp) {
    aiPollTimestamp = timestamp;

    // Poll every 5 seconds
    aiPollInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/entries/${encodeURIComponent(timestamp)}`);
            if (!response.ok) return;

            const entry = await response.json();
            if (entry && entry.aiSummary) {
                stopAiPolling();
                updateModalAiSummary(entry.aiSummary);
                // Update local entry data
                const localEntry = allEntries.find(e => e.timestamp === timestamp);
                if (localEntry) {
                    localEntry.aiSummary = entry.aiSummary;
                    // Also update entity, topics, people if they changed
                    if (entry.entity) localEntry.entity = entry.entity;
                    if (entry.topics) localEntry.topics = entry.topics;
                    if (entry.people) localEntry.people = entry.people;
                }
            }
        } catch (error) {
            console.error('AI polling error:', error);
        }
    }, 5000);

    // Stop after 2 minutes
    aiPollTimeout = setTimeout(() => {
        stopAiPolling();
        removeAiSpinner();
    }, 120000);
}

/**
 * Stop AI polling
 */
function stopAiPolling() {
    if (aiPollInterval) {
        clearInterval(aiPollInterval);
        aiPollInterval = null;
    }
    if (aiPollTimeout) {
        clearTimeout(aiPollTimeout);
        aiPollTimeout = null;
    }
    aiPollTimestamp = null;
}

/**
 * Update modal AI summary section with new content
 * @param {string} summary - The AI summary text
 */
function updateModalAiSummary(summary) {
    const modalBody = document.getElementById('modalBody');
    const existingSection = modalBody.querySelector('.modal-ai-section');

    if (existingSection) {
        // Update existing section - remove spinner and update text
        const spinner = existingSection.querySelector('.ai-processing-spinner');
        if (spinner) spinner.remove();
        const textEl = existingSection.querySelector('.modal-ai-text');
        if (textEl) {
            textEl.textContent = summary;
        }
    } else {
        // Create new AI section - insert after MY NOTES or SNIPPET
        const notesSection = modalBody.querySelector('.modal-notes-section');
        const snippetSection = modalBody.querySelector('.modal-snippet-section');
        const insertAfter = notesSection || snippetSection;

        const aiSection = document.createElement('div');
        aiSection.className = 'modal-section modal-ai-section';
        aiSection.innerHTML = `
            <button class="modal-copy-btn" onclick="copyToClipboard(this, 'ai')" title="Copy to clipboard">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/>
                </svg>
            </button>
            <h4>AI SUMMARY</h4>
            <div class="modal-ai-text">${escapeHtml(summary)}</div>
        `;

        if (insertAfter) {
            insertAfter.insertAdjacentElement('afterend', aiSection);
        } else {
            // Insert at beginning of modal body
            modalBody.insertBefore(aiSection, modalBody.firstChild);
        }
    }
}

/**
 * Remove spinner without adding content (on timeout)
 */
function removeAiSpinner() {
    const modalBody = document.getElementById('modalBody');
    const aiSection = modalBody.querySelector('.modal-ai-section');
    if (aiSection) {
        const spinner = aiSection.querySelector('.ai-processing-spinner');
        if (spinner) {
            spinner.remove();
        }
        // If no text in AI section, update with placeholder
        const textEl = aiSection.querySelector('.modal-ai-text');
        if (textEl && !textEl.textContent.trim()) {
            textEl.textContent = '(Processing timed out)';
        }
    }
}

/**
 * Setup modal event listeners
 */
function setupModal() {
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalOverlay') {
            closeModal();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

}

/**
 * Delete a single entry by timestamp
 */
async function deleteEntry(timestamp) {
    if (!confirm('Delete this entry? This will also delete any associated files.')) {
        return;
    }

    try {
        const response = await fetch('/api/entries', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp })
        });

        const result = await response.json();

        if (result.success) {
            const rows = table.getRows();
            for (const row of rows) {
                if (row.getData().timestamp === timestamp) {
                    row.delete();
                    break;
                }
            }
            updateEntryCount(table.getDataCount());
            showStatus('Entry deleted', 'success');
            closeModal();
        } else {
            showStatus('Failed to delete: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showStatus('Failed to delete entry', 'error');
    }
}

/**
 * Delete all selected entries
 */
async function deleteSelected() {
    const selected = table.getSelectedData();
    if (selected.length === 0) return;

    if (!confirm(`Delete ${selected.length} selected entries?`)) {
        return;
    }

    let deleted = 0;
    let errors = 0;

    for (const entry of selected) {
        try {
            const response = await fetch('/api/entries', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamp: entry.timestamp })
            });

            const result = await response.json();
            if (result.success) {
                deleted++;
            } else {
                errors++;
            }
        } catch (error) {
            console.error('Delete error:', error);
            errors++;
        }
    }

    await loadEntries();

    if (errors > 0) {
        showStatus(`Deleted ${deleted}, ${errors} failed`, 'error');
    } else {
        showStatus(`Deleted ${deleted} entries`, 'success');
    }
}

/**
 * Apply filters
 */
function applyFilters() {
    const typeFilter = document.getElementById('filterType').value;
    const sourceFilter = document.getElementById('filterSource').value;
    const entityFilter = document.getElementById('filterEntity')?.value || '';
    const categoryFilter = document.getElementById('filterCategory')?.value || '';
    const searchValue = document.getElementById('search').value.toLowerCase();

    table.setFilter(function(data) {
        // Type filter
        if (typeFilter && data.type !== typeFilter) return false;

        // Source filter
        if (sourceFilter && data.source !== sourceFilter) return false;

        // Entity filter
        if (entityFilter && data.entity !== entityFilter) return false;

        // Category filter
        if (categoryFilter && data.category !== categoryFilter) return false;

        // Search filter
        if (searchValue) {
            // Check basic fields
            const matchesBasic = (
                (data.title && data.title.toLowerCase().includes(searchValue)) ||
                (data.content && data.content.toLowerCase().includes(searchValue)) ||
                (data.type && data.type.toLowerCase().includes(searchValue)) ||
                (data.source && data.source.toLowerCase().includes(searchValue)) ||
                (data.url && data.url.toLowerCase().includes(searchValue)) ||
                (data.entity && data.entity.toLowerCase().includes(searchValue)) ||
                (data.category && data.category.toLowerCase().includes(searchValue))
            );

            // Check topics array
            const matchesTopics = data.topics && Array.isArray(data.topics) &&
                data.topics.some(t => t.toLowerCase().includes(searchValue));

            // Check people array
            const matchesPeople = data.people && Array.isArray(data.people) &&
                data.people.some(p => p.toLowerCase().includes(searchValue));

            return matchesBasic || matchesTopics || matchesPeople;
        }

        return true;
    });

    updateEntryCount(table.getDataCount("active"));
}

/**
 * Set up event listeners for toolbar controls
 */
function setupEventListeners() {
    // Global search filter
    document.getElementById('search').addEventListener('input', debounce(applyFilters, 300));

    // Type filter
    document.getElementById('filterType').addEventListener('change', applyFilters);

    // Source filter
    document.getElementById('filterSource').addEventListener('change', applyFilters);

    // Entity filter
    const entityFilter = document.getElementById('filterEntity');
    if (entityFilter) {
        entityFilter.addEventListener('change', applyFilters);
    }

    // Category filter
    const categoryFilter = document.getElementById('filterCategory');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', applyFilters);
    }

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        document.getElementById('entryCount').textContent = 'Loading...';
        await loadEntries();
        showStatus('Refreshed', 'success');
    });

    // Delete selected button
    document.getElementById('deleteSelected').addEventListener('click', deleteSelected);
}

/**
 * Update entry count display
 */
function updateEntryCount(count) {
    document.getElementById('entryCount').textContent = `${count} entries`;
}

/**
 * Show status message
 */
function showStatus(message, type) {
    const el = document.getElementById('statusMessage');
    el.textContent = message;
    el.className = 'status-message ' + type;

    setTimeout(() => {
        el.className = 'status-message';
    }, 3000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Simple markdown to HTML renderer for notes display
 */
function renderMarkdown(text) {
    if (!text) return '';

    // First escape HTML to prevent XSS
    let html = escapeHtml(text);

    // Bold: **text** or __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_ (but not inside words)
    html = html.replace(/(?<![\\*_])\*([^*]+)\*(?![*])/g, '<em>$1</em>');
    html = html.replace(/(?<![\\*_])_([^_]+)_(?![_])/g, '<em>$1</em>');

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Headers: ## Header (at start of line)
    html = html.replace(/^### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');

    // Blockquotes: > text
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Bullet lists: - item
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Line breaks (preserve single newlines as <br>)
    html = html.replace(/\n/g, '<br>');

    // Clean up: remove <br> after block elements
    html = html.replace(/<\/(h[345]|blockquote|ul|li)><br>/g, '</$1>');
    html = html.replace(/<br><(h[345]|blockquote|ul)/g, '<$1');

    return html;
}

/**
 * Debounce function for search input
 */
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Load topics from API
 */
async function loadTopics() {
    try {
        const response = await fetch('/api/topics');
        if (response.ok) {
            allTopics = await response.json();
        }
    } catch (error) {
        console.error('Failed to load topics:', error);
    }
}

/**
 * Load people from API
 */
async function loadPeople() {
    try {
        const response = await fetch('/api/entities');
        if (response.ok) {
            allPeople = await response.json();
        }
    } catch (error) {
        console.error('Failed to load people:', error);
    }
}

/**
 * Setup navigation between pages
 */
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });
}

/**
 * Navigate to a specific page
 * @param {string} page - The page to navigate to
 * @param {Object} filterContext - Optional filter context {type, value} for visualisation
 */
function navigateToPage(page, filterContext = null) {
    currentPage = page;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Hide all content areas
    document.getElementById('gridContainer').style.display = 'none';
    document.getElementById('kanbanContainer').classList.remove('active');
    document.querySelector('.toolbar').style.display = 'none';
    document.getElementById('dashboardPage').classList.remove('active');
    document.getElementById('topicsPage').classList.remove('active');
    document.getElementById('peoplePage').classList.remove('active');
    document.getElementById('visualisePage').classList.remove('active');
    document.getElementById('searchPage').classList.remove('active');
    document.getElementById('logsPage').classList.remove('active');

    // Stop logs polling when navigating away
    stopLogsPolling();

    // Hide view toggle by default
    document.getElementById('viewToggle').style.display = 'none';

    // Show appropriate content
    if (page === 'home') {
        document.getElementById('dashboardPage').classList.add('active');
        updateDashboard();
    } else if (page === 'topics') {
        document.getElementById('topicsPage').classList.add('active');
        renderTopicsList();
    } else if (page === 'people') {
        document.getElementById('peoplePage').classList.add('active');
        renderPeopleList();
    } else if (page === 'visualise') {
        document.getElementById('visualisePage').classList.add('active');
        initVisualisation(filterContext);
    } else if (page === 'search') {
        document.getElementById('searchPage').classList.add('active');
        setupExternalSearch();
    } else if (page === 'settings') {
        document.getElementById('settingsPage').classList.add('active');
        initSettingsPage();
    } else if (page === 'logs') {
        document.getElementById('logsPage').classList.add('active');
        initLogsPage();
    } else {
        // Show toolbar for project, task, knowledge
        document.querySelector('.toolbar').style.display = 'flex';

        // Apply entity filter based on page
        if (page === 'project') {
            document.getElementById('filterEntity').value = 'project';
        } else if (page === 'task') {
            document.getElementById('filterEntity').value = 'task';
            // Show view toggle for tasks page
            document.getElementById('viewToggle').style.display = 'flex';
            // Initialize kanban if needed
            if (kanbanColumns.length === 0) {
                initKanban();
            }
        } else if (page === 'knowledge') {
            document.getElementById('filterEntity').value = 'knowledge';
        }

        // Show appropriate view based on current task view setting
        if (page === 'task' && currentTaskView === 'kanban') {
            document.getElementById('kanbanContainer').classList.add('active');
            renderKanbanBoard();
        } else {
            document.getElementById('gridContainer').style.display = 'block';
        }

        applyFilters();
    }
}

/**
 * Setup management pages (topics/people)
 */
function setupManagementPages() {
    // Topics
    document.getElementById('addTopicBtn').addEventListener('click', addTopic);
    document.getElementById('newTopicInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTopic();
    });

    // People
    document.getElementById('addPersonBtn').addEventListener('click', addPerson);
    document.getElementById('newPersonInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addPerson();
    });
}

/**
 * Render topics list
 */
function renderTopicsList() {
    const container = document.getElementById('topicsList');

    if (allTopics.length === 0) {
        container.innerHTML = '<div class="empty-state">No topics yet</div>';
        return;
    }

    // Count entries per topic
    const topicCounts = {};
    allTopics.forEach(t => topicCounts[t] = 0);
    allEntries.forEach(entry => {
        if (entry.topics && Array.isArray(entry.topics)) {
            entry.topics.forEach(t => {
                if (topicCounts[t] !== undefined) topicCounts[t]++;
            });
        }
    });

    container.innerHTML = allTopics.map(topic => `
        <div class="management-item" data-name="${escapeHtml(topic)}">
            <span class="management-item-name">${escapeHtml(topic)}</span>
            <span class="management-item-count">${topicCounts[topic] || 0}</span>
            <button class="btn-icon edit" onclick="editTopic('${escapeHtml(topic)}')" title="Edit">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>
                </svg>
            </button>
            <button class="btn-icon delete" onclick="deleteTopic('${escapeHtml(topic)}')" title="Delete">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
                </svg>
            </button>
        </div>
    `).join('');
}

/**
 * Render people list
 */
function renderPeopleList() {
    const container = document.getElementById('peopleList');

    if (allPeople.length === 0) {
        container.innerHTML = '<div class="empty-state">No people or roles yet</div>';
        return;
    }

    // Count entries per person
    const peopleCounts = {};
    allPeople.forEach(p => peopleCounts[p] = 0);
    allEntries.forEach(entry => {
        if (entry.people && Array.isArray(entry.people)) {
            entry.people.forEach(p => {
                if (peopleCounts[p] !== undefined) peopleCounts[p]++;
            });
        }
    });

    container.innerHTML = allPeople.map(person => `
        <div class="management-item" data-name="${escapeHtml(person)}">
            <span class="management-item-name">${escapeHtml(person)}</span>
            <span class="management-item-count">${peopleCounts[person] || 0}</span>
            <button class="btn-icon edit" onclick="editPerson('${escapeHtml(person)}')" title="Edit">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>
                </svg>
            </button>
            <button class="btn-icon delete" onclick="deletePerson('${escapeHtml(person)}')" title="Delete">
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>
                </svg>
            </button>
        </div>
    `).join('');
}

/**
 * Add a new topic
 */
async function addTopic() {
    const input = document.getElementById('newTopicInput');
    const name = input.value.trim();
    if (!name) return;

    try {
        const response = await fetch('/api/topics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            input.value = '';
            await loadTopics();
            renderTopicsList();
            showStatus('Topic added', 'success');
        } else {
            const result = await response.json();
            showStatus(result.error || 'Failed to add topic', 'error');
        }
    } catch (error) {
        showStatus('Failed to add topic', 'error');
    }
}

/**
 * Edit a topic (inline)
 */
function editTopic(oldName) {
    const item = document.querySelector(`.management-item[data-name="${oldName}"]`);
    const nameSpan = item.querySelector('.management-item-name');
    const currentName = nameSpan.textContent;

    nameSpan.innerHTML = `<input type="text" value="${escapeHtml(currentName)}" class="edit-input">`;
    const input = nameSpan.querySelector('input');
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            try {
                const response = await fetch('/api/topics', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldName, newName })
                });

                if (response.ok) {
                    await loadTopics();
                    renderTopicsList();
                    showStatus('Topic renamed', 'success');
                } else {
                    renderTopicsList();
                    showStatus('Failed to rename topic', 'error');
                }
            } catch (error) {
                renderTopicsList();
                showStatus('Failed to rename topic', 'error');
            }
        } else {
            renderTopicsList();
        }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            renderTopicsList();
        }
    });
}

/**
 * Delete a topic
 */
async function deleteTopic(name) {
    if (!confirm(`Delete topic "${name}"? This won't delete entries, just the topic from the list.`)) return;

    try {
        const response = await fetch('/api/topics', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            await loadTopics();
            renderTopicsList();
            showStatus('Topic deleted', 'success');
        } else {
            showStatus('Failed to delete topic', 'error');
        }
    } catch (error) {
        showStatus('Failed to delete topic', 'error');
    }
}

/**
 * Add a new person
 */
async function addPerson() {
    const input = document.getElementById('newPersonInput');
    const name = input.value.trim();
    if (!name) return;

    try {
        const response = await fetch('/api/entities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            input.value = '';
            await loadPeople();
            renderPeopleList();
            showStatus('Person/role added', 'success');
        } else {
            const result = await response.json();
            showStatus(result.error || 'Failed to add', 'error');
        }
    } catch (error) {
        showStatus('Failed to add', 'error');
    }
}

/**
 * Edit a person (inline)
 */
function editPerson(oldName) {
    const item = document.querySelector(`.management-item[data-name="${oldName}"]`);
    const nameSpan = item.querySelector('.management-item-name');
    const currentName = nameSpan.textContent;

    nameSpan.innerHTML = `<input type="text" value="${escapeHtml(currentName)}" class="edit-input">`;
    const input = nameSpan.querySelector('input');
    input.focus();
    input.select();

    const saveEdit = async () => {
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            try {
                const response = await fetch('/api/entities', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldName, newName })
                });

                if (response.ok) {
                    await loadPeople();
                    renderPeopleList();
                    showStatus('Renamed', 'success');
                } else {
                    renderPeopleList();
                    showStatus('Failed to rename', 'error');
                }
            } catch (error) {
                renderPeopleList();
                showStatus('Failed to rename', 'error');
            }
        } else {
            renderPeopleList();
        }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            renderPeopleList();
        }
    });
}

/**
 * Delete a person
 */
async function deletePerson(name) {
    if (!confirm(`Delete "${name}"? This won't delete entries, just removes it from the list.`)) return;

    try {
        const response = await fetch('/api/entities', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            await loadPeople();
            renderPeopleList();
            showStatus('Deleted', 'success');
        } else {
            showStatus('Failed to delete', 'error');
        }
    } catch (error) {
        showStatus('Failed to delete', 'error');
    }
}

/**
 * Copy text content to clipboard
 */
function copyToClipboard(btn, type) {
    const section = btn.closest('.modal-section');
    const selectors = {
        'snippet': '.modal-snippet-text',
        'notes': '.modal-notes-text',
        'ai': '.modal-ai-text'
    };
    const textEl = section.querySelector(selectors[type]);

    if (textEl) {
        navigator.clipboard.writeText(textEl.textContent).then(() => {
            // Show copied feedback
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1500);
        }).catch(err => {
            console.error('Failed to copy:', err);
            showStatus('Failed to copy to clipboard', 'error');
        });
    }
}

// ============================================
// VISUALISATION MODULE
// ============================================

// Legacy aliases - use VisState.network, VisState.nodes, VisState.edges instead
let visNetwork = null;
let visNodes = null;
let visEdges = null;

/**
 * Initialize the visualisation network
 * @param {Object} filterContext - Optional filter context {type, value}
 */
function initVisualisation(filterContext = null) {
    populateVisFilters();

    // Apply initial filter context if provided
    if (filterContext) {
        applyVisFilterContext(filterContext);
    }

    buildNetwork();
    setupVisEventListeners();
}

/**
 * Populate visualisation filter dropdowns
 */
function populateVisFilters() {
    // Entity filter
    const entitySelect = document.getElementById('visFilterEntity');
    entitySelect.innerHTML = '<option value="">All entities</option>';
    const entities = [...new Set(allEntries.map(e => e.entity).filter(Boolean))].sort();
    entities.forEach(entity => {
        const opt = document.createElement('option');
        opt.value = entity;
        opt.textContent = entity;
        entitySelect.appendChild(opt);
    });

    // Type filter
    const typeSelect = document.getElementById('visFilterType');
    typeSelect.innerHTML = '<option value="">All types</option>';
    const types = [...new Set(allEntries.map(e => e.type).filter(Boolean))].sort();
    types.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        typeSelect.appendChild(opt);
    });

    // Topic filter
    const topicSelect = document.getElementById('visFilterTopic');
    topicSelect.innerHTML = '<option value="">All topics</option>';
    allTopics.forEach(topic => {
        const opt = document.createElement('option');
        opt.value = topic;
        opt.textContent = topic;
        topicSelect.appendChild(opt);
    });

    // Person filter
    const personSelect = document.getElementById('visFilterPerson');
    personSelect.innerHTML = '<option value="">All people</option>';
    allPeople.forEach(person => {
        const opt = document.createElement('option');
        opt.value = person;
        opt.textContent = person;
        personSelect.appendChild(opt);
    });

    // Set date defaults (all time - empty)
    const today = new Date();
    document.getElementById('visDateTo').value = today.toISOString().split('T')[0];
    document.getElementById('visDateFrom').value = '';
}

/**
 * Apply filter context from tag click
 */
function applyVisFilterContext(context) {
    // Reset all filters first
    document.getElementById('visFilterEntity').value = '';
    document.getElementById('visFilterType').value = '';
    document.getElementById('visFilterTopic').value = '';
    document.getElementById('visFilterPerson').value = '';
    document.getElementById('visSearch').value = '';

    if (context.type === 'entity') {
        document.getElementById('visFilterEntity').value = context.value;
    } else if (context.type === 'type') {
        document.getElementById('visFilterType').value = context.value;
    } else if (context.type === 'topic') {
        document.getElementById('visFilterTopic').value = context.value;
    } else if (context.type === 'person') {
        document.getElementById('visFilterPerson').value = context.value;
    }
}

/**
 * Build the network graph from filtered entries
 */
function buildNetwork() {
    const filteredEntries = getVisFilteredEntries();
    const { nodes, edges } = buildGraphData(filteredEntries);

    visNodes = new vis.DataSet(nodes);
    visEdges = new vis.DataSet(edges);

    const container = document.getElementById('visNetwork');
    const data = { nodes: visNodes, edges: visEdges };

    const options = {
        nodes: {
            shape: 'dot',
            size: 25,
            font: { size: 14, color: '#333' },
            borderWidth: 2,
            shadow: true
        },
        edges: {
            width: 2,
            color: { color: '#ccc', highlight: '#ff5200', hover: '#ff5200' },
            smooth: { type: 'continuous' }
        },
        physics: {
            stabilization: { iterations: 150 },
            barnesHut: {
                gravitationalConstant: -3000,
                springLength: 200,
                springConstant: 0.04
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            zoomView: true,
            dragView: true,
            zoomSpeed: 0.5
        },
        groups: {
            entry: {
                color: { background: '#6366f1', border: '#4f46e5' },
                shape: 'dot',
                size: 25
            },
            topic: {
                color: { background: '#0ea5e9', border: '#0284c7' },
                shape: 'diamond',
                size: 30
            },
            person: {
                color: { background: '#f59e0b', border: '#d97706' },
                shape: 'triangle',
                size: 30
            }
        }
    };

    if (visNetwork) {
        visNetwork.destroy();
    }

    visNetwork = new vis.Network(container, data, options);

    // Click handler for nodes
    visNetwork.on('click', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const node = visNodes.get(nodeId);
            if (node && node.entryData) {
                openDetailPanel(node.entryData);
            }
        }
    });

    // Double-click to focus
    visNetwork.on('doubleClick', function(params) {
        if (params.nodes.length > 0) {
            visNetwork.focus(params.nodes[0], {
                scale: 1.5,
                animation: { duration: 500, easingFunction: 'easeInOutQuad' }
            });
        }
    });

    // Adjust node sizes based on zoom to prevent them getting too big
    const baseEntrySize = 25;
    const baseClusterSize = 30;
    const maxScale = 1.5; // Cap visual size at this zoom level

    visNetwork.on('zoom', function(params) {
        const scale = params.scale;
        if (scale > maxScale) {
            // Shrink nodes proportionally when zoomed in past threshold
            const factor = maxScale / scale;
            const newEntrySize = baseEntrySize * factor;
            const newClusterSize = baseClusterSize * factor;

            visNodes.forEach(function(node) {
                if (node.group === 'entry') {
                    visNodes.update({ id: node.id, size: newEntrySize });
                } else {
                    visNodes.update({ id: node.id, size: newClusterSize });
                }
            });
        } else {
            // Restore normal sizes when zoomed out
            visNodes.forEach(function(node) {
                if (node.group === 'entry') {
                    visNodes.update({ id: node.id, size: baseEntrySize });
                } else {
                    visNodes.update({ id: node.id, size: baseClusterSize });
                }
            });
        }
    });

    renderVisLegend();

    // Calculate and show stats
    const entryCount = filteredEntries.length;
    const nodeCount = nodes.length;
    const edgeCount = edges.length;
    const topicCount = nodes.filter(n => n.group === 'topic').length;
    const personCount = nodes.filter(n => n.group === 'person').length;

    renderVisStats(entryCount, nodeCount, edgeCount, topicCount, personCount);
    console.log('Visualisation: ' + entryCount + ' entries, ' + nodeCount + ' nodes, ' + edgeCount + ' edges');
}

/**
 * Get filtered entries based on vis filters
 */
function getVisFilteredEntries() {
    const entityFilter = document.getElementById('visFilterEntity').value;
    const typeFilter = document.getElementById('visFilterType').value;
    const topicFilter = document.getElementById('visFilterTopic').value;
    const personFilter = document.getElementById('visFilterPerson').value;
    const searchValue = document.getElementById('visSearch').value.toLowerCase();
    const dateFrom = document.getElementById('visDateFrom').value;
    const dateTo = document.getElementById('visDateTo').value;

    return allEntries.filter(entry => {
        // Entity filter
        if (entityFilter && entry.entity !== entityFilter) return false;

        // Type filter
        if (typeFilter && entry.type !== typeFilter) return false;

        // Topic filter
        if (topicFilter && (!entry.topics || !entry.topics.includes(topicFilter))) return false;

        // Person filter
        if (personFilter && (!entry.people || !entry.people.includes(personFilter))) return false;

        // Date filter
        if (dateFrom || dateTo) {
            const entryDate = new Date(entry.timestamp.replace(' ', 'T'));
            if (dateFrom && entryDate < new Date(dateFrom)) return false;
            if (dateTo && entryDate > new Date(dateTo + 'T23:59:59')) return false;
        }

        // Search filter
        if (searchValue) {
            const matchesBasic = (
                (entry.title && entry.title.toLowerCase().includes(searchValue)) ||
                (entry.content && entry.content.toLowerCase().includes(searchValue)) ||
                (entry.type && entry.type.toLowerCase().includes(searchValue))
            );
            const matchesTopics = entry.topics && entry.topics.some(t => t.toLowerCase().includes(searchValue));
            const matchesPeople = entry.people && entry.people.some(p => p.toLowerCase().includes(searchValue));
            if (!matchesBasic && !matchesTopics && !matchesPeople) return false;
        }

        return true;
    });
}

/**
 * Build graph nodes and edges from entries
 */
function buildGraphData(entries) {
    const nodes = [];
    const edges = [];
    const topicNodes = new Map();
    const personNodes = new Map();
    let nodeId = 1;

    // Create entry nodes
    entries.forEach(entry => {
        const entryNodeId = 'entry_' + nodeId++;
        const color = TYPE_COLORS[entry.type] || '#64748b';

        nodes.push({
            id: entryNodeId,
            label: truncateLabel(entry.title || '(untitled)', 25),
            title: (entry.title || '(untitled)') + '\n' + entry.type + ' - ' + entry.timestamp,
            group: 'entry',
            color: { background: color, border: darkenColor(color) },
            entryData: entry
        });

        // Create topic nodes and edges
        if (entry.topics && Array.isArray(entry.topics)) {
            entry.topics.forEach(topic => {
                if (!topicNodes.has(topic)) {
                    const topicNodeId = 'topic_' + topic.replace(/[^a-zA-Z0-9]/g, '_');
                    topicNodes.set(topic, topicNodeId);
                    nodes.push({
                        id: topicNodeId,
                        label: '#' + topic,
                        group: 'topic',
                        title: 'Topic: ' + topic
                    });
                }
                edges.push({
                    from: entryNodeId,
                    to: topicNodes.get(topic),
                    dashes: true,
                    color: { color: '#0ea5e9', opacity: 0.5 }
                });
            });
        }

        // Create person nodes and edges
        if (entry.people && Array.isArray(entry.people)) {
            entry.people.forEach(person => {
                if (!personNodes.has(person)) {
                    const personNodeId = 'person_' + person.replace(/[^a-zA-Z0-9]/g, '_');
                    personNodes.set(person, personNodeId);
                    nodes.push({
                        id: personNodeId,
                        label: '@' + person,
                        group: 'person',
                        title: 'Person: ' + person
                    });
                }
                edges.push({
                    from: entryNodeId,
                    to: personNodes.get(person),
                    color: { color: '#f59e0b', opacity: 0.5 }
                });
            });
        }
    });

    return { nodes, edges };
}

/**
 * Truncate label for display
 */
function truncateLabel(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

/**
 * Darken a hex color
 */
function darkenColor(hex) {
    if (!hex || hex[0] !== '#') return '#333333';
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - 30);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - 30);
    const b = Math.max(0, (num & 0x0000FF) - 30);
    return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

/**
 * Render the legend
 */
function renderVisLegend() {
    const legend = document.getElementById('visLegend');
    legend.innerHTML =
        '<div class="vis-legend-title">Legend</div>' +
        '<div class="vis-legend-item"><span class="vis-legend-dot" style="background:#6366f1"></span><span>Entries (●)</span></div>' +
        '<div class="vis-legend-item"><span class="vis-legend-dot" style="background:#0ea5e9;transform:rotate(45deg);border-radius:2px"></span><span>Topics (◆)</span></div>' +
        '<div class="vis-legend-item"><span class="vis-legend-dot" style="background:#f59e0b;clip-path:polygon(50% 0%, 0% 100%, 100% 100%)"></span><span>People (▲)</span></div>';
}

/**
 * Render stats panel
 */
function renderVisStats(entryCount, nodeCount, edgeCount, topicCount, personCount) {
    const stats = document.getElementById('visStats');
    stats.innerHTML =
        '<div class="vis-stats-row"><span class="vis-stats-label">Entries</span><span class="vis-stats-value">' + entryCount + '</span></div>' +
        '<div class="vis-stats-row"><span class="vis-stats-label">Total Nodes</span><span class="vis-stats-value">' + nodeCount + '</span></div>' +
        '<div class="vis-stats-row"><span class="vis-stats-label">Connections</span><span class="vis-stats-value">' + edgeCount + '</span></div>' +
        '<div class="vis-stats-row"><span class="vis-stats-label">Topics</span><span class="vis-stats-value">' + topicCount + '</span></div>' +
        '<div class="vis-stats-row"><span class="vis-stats-label">People</span><span class="vis-stats-value">' + personCount + '</span></div>';
}

/**
 * Setup visualisation event listeners
 */
function setupVisEventListeners() {
    // Only setup once
    const searchEl = document.getElementById('visSearch');
    if (searchEl.dataset.listenerAdded) return;

    searchEl.addEventListener('input', debounce(buildNetwork, 300));
    document.getElementById('visFilterEntity').addEventListener('change', buildNetwork);
    document.getElementById('visFilterType').addEventListener('change', buildNetwork);
    document.getElementById('visFilterTopic').addEventListener('change', buildNetwork);
    document.getElementById('visFilterPerson').addEventListener('change', buildNetwork);
    document.getElementById('visDateFrom').addEventListener('change', buildNetwork);
    document.getElementById('visDateTo').addEventListener('change', buildNetwork);

    document.getElementById('visResetBtn').addEventListener('click', function() {
        document.getElementById('visSearch').value = '';
        document.getElementById('visFilterEntity').value = '';
        document.getElementById('visFilterType').value = '';
        document.getElementById('visFilterTopic').value = '';
        document.getElementById('visFilterPerson').value = '';
        document.getElementById('visDateFrom').value = '';
        document.getElementById('visDateTo').value = new Date().toISOString().split('T')[0];
        buildNetwork();
    });

    document.getElementById('visFitBtn').addEventListener('click', function() {
        if (visNetwork) {
            visNetwork.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
        }
    });

    searchEl.dataset.listenerAdded = 'true';
}

// ============================================
// KANBAN BOARD MODULE
// ============================================

// Legacy aliases - use AppState.kanbanColumns and AppState.currentTaskView instead
let kanbanColumns = [];
let currentTaskView = 'list'; // 'list' or 'kanban'

/**
 * Load kanban columns from API
 */
async function loadKanbanColumns() {
    try {
        const response = await fetch('/api/kanban-columns');
        if (response.ok) {
            kanbanColumns = await response.json();
        }
    } catch (error) {
        console.error('Failed to load kanban columns:', error);
        // Use defaults
        kanbanColumns = [
            { id: 'not-started', name: 'Not started', color: '#6b7280' },
            { id: 'in-progress', name: 'In progress', color: '#3b82f6' },
            { id: 'done', name: 'Done', color: '#22c55e' }
        ];
    }
}

/**
 * Initialize kanban board when on tasks page
 */
async function initKanban() {
    await loadKanbanColumns();
    renderKanbanBoard();
    setupKanbanEventListeners();
}

/**
 * Render the kanban board with columns and cards
 */
function renderKanbanBoard() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    // Get task entries only
    const taskEntries = allEntries.filter(e => e.entity === 'task');
    const defaultColumnIds = ['not-started', 'in-progress', 'done'];

    // Build columns HTML
    let html = '';

    kanbanColumns.forEach(column => {
        // Get tasks for this column
        const columnTasks = taskEntries.filter(task => {
            const status = task.taskStatus || 'not-started';
            return status === column.id;
        });

        const isDefault = defaultColumnIds.includes(column.id);
        const canDelete = !isDefault && columnTasks.length === 0;

        html += `
            <div class="kanban-column" data-column-id="${escapeHtml(column.id)}">
                <div class="kanban-column-header" style="border-color: ${column.color}; background: ${column.color}20;">
                    <div class="kanban-color-bar" data-column-id="${escapeHtml(column.id)}" style="background: ${column.color};" title="Double-click to change color"></div>
                    <div class="kanban-header-content">
                        <span class="kanban-column-name" data-column-id="${escapeHtml(column.id)}" contenteditable="false" title="Click to rename">${escapeHtml(column.name)}</span>
                        <div class="kanban-header-actions">
                            <span class="kanban-column-count">${columnTasks.length}</span>
                            ${!isDefault ? `<button class="kanban-delete-btn" data-column-id="${escapeHtml(column.id)}" ${!canDelete ? 'disabled title="Remove tasks first"' : 'title="Delete column"'}>
                                <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg>
                            </button>` : ''}
                        </div>
                    </div>
                </div>
                <div class="kanban-column-cards" data-column-id="${escapeHtml(column.id)}">
                    ${columnTasks.length === 0 ? '<div class="kanban-empty">No tasks</div>' : ''}
                    ${columnTasks.map(task => renderKanbanCard(task)).join('')}
                </div>
            </div>
        `;
    });

    board.innerHTML = html;

    // Setup drag and drop
    setupDragAndDrop();

    // Setup column interactions
    setupColumnInteractions();
}

/**
 * Setup click-to-rename, delete, and color picker for columns
 */
function setupColumnInteractions() {
    // Click to rename
    document.querySelectorAll('.kanban-column-name').forEach(nameEl => {
        nameEl.addEventListener('click', (e) => {
            e.stopPropagation();
            nameEl.contentEditable = 'true';
            nameEl.focus();
            // Select all text
            const range = document.createRange();
            range.selectNodeContents(nameEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        nameEl.addEventListener('blur', async () => {
            nameEl.contentEditable = 'false';
            const columnId = nameEl.dataset.columnId;
            const newName = nameEl.textContent.trim();

            if (!newName) {
                // Restore original name
                const column = kanbanColumns.find(c => c.id === columnId);
                nameEl.textContent = column ? column.name : columnId;
                return;
            }

            // Update column name
            await updateColumnName(columnId, newName);
        });

        nameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameEl.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                const column = kanbanColumns.find(c => c.id === nameEl.dataset.columnId);
                nameEl.textContent = column ? column.name : nameEl.dataset.columnId;
                nameEl.blur();
            }
        });
    });

    // Delete column
    document.querySelectorAll('.kanban-delete-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const columnId = btn.dataset.columnId;
            if (confirm('Delete this column?')) {
                await deleteColumn(columnId);
            }
        });
    });

    // Double-click color bar for color picker
    document.querySelectorAll('.kanban-color-bar').forEach(bar => {
        bar.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const columnId = bar.dataset.columnId;
            showColorPicker(columnId, bar);
        });
    });
}

/**
 * Show color picker popup near the color bar
 */
function showColorPicker(columnId, anchorEl) {
    // Remove existing picker if any
    const existingPicker = document.querySelector('.kanban-color-picker');
    if (existingPicker) existingPicker.remove();

    const colors = [
        '#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e',
        '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
    ];

    const picker = document.createElement('div');
    picker.className = 'kanban-color-picker';
    picker.innerHTML = colors.map(color =>
        `<div class="kanban-color-option" data-color="${color}" style="background:${color}"></div>`
    ).join('');

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.bottom + 4}px`;
    picker.style.zIndex = '1000';

    document.body.appendChild(picker);

    // Handle color selection
    picker.addEventListener('click', async (e) => {
        const option = e.target.closest('.kanban-color-option');
        if (option) {
            const newColor = option.dataset.color;
            await updateColumnColor(columnId, newColor);
            picker.remove();
        }
    });

    // Close on click outside
    const closeHandler = (e) => {
        if (!picker.contains(e.target) && e.target !== anchorEl) {
            picker.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

/**
 * Update column name via API
 */
async function updateColumnName(columnId, newName) {
    try {
        // Update local data first
        const column = kanbanColumns.find(c => c.id === columnId);
        if (column) {
            column.name = newName;
        }

        // Save all columns
        await saveKanbanColumns();
        showStatus('Column renamed', 'success');
    } catch (error) {
        console.error('Failed to rename column:', error);
        showStatus('Failed to rename column', 'error');
        renderKanbanBoard();
    }
}

/**
 * Update column color via API
 */
async function updateColumnColor(columnId, newColor) {
    try {
        const column = kanbanColumns.find(c => c.id === columnId);
        if (column) {
            column.color = newColor;
        }

        await saveKanbanColumns();
        renderKanbanBoard();
        showStatus('Color updated', 'success');
    } catch (error) {
        console.error('Failed to update color:', error);
        showStatus('Failed to update color', 'error');
    }
}

/**
 * Delete a column via API
 */
async function deleteColumn(columnId) {
    try {
        const response = await fetch('/api/kanban-columns', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: columnId })
        });

        const result = await response.json();
        if (result.success) {
            kanbanColumns = kanbanColumns.filter(c => c.id !== columnId);
            renderKanbanBoard();
            showStatus('Column deleted', 'success');
        } else {
            showStatus(result.error || 'Failed to delete', 'error');
        }
    } catch (error) {
        console.error('Failed to delete column:', error);
        showStatus('Failed to delete column', 'error');
    }
}

/**
 * Save all kanban columns (for rename/recolor)
 */
async function saveKanbanColumns() {
    try {
        const response = await fetch('/api/kanban-columns', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columns: kanbanColumns })
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to save columns');
        }
    } catch (error) {
        console.error('Failed to save columns:', error);
        throw error;
    }
}

/**
 * Render a single kanban card
 */
function renderKanbanCard(task) {
    const title = task.title || '(untitled)';
    const titleHtml = task.url
        ? `<a href="${escapeHtml(task.url)}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(title)}</a>`
        : escapeHtml(title);

    const typeColor = TYPE_COLORS[task.type] || '#64748b';
    const notes = task.content ? stripMarkdown(task.content) : '';
    const notesPreview = notes.length > 80 ? notes.substring(0, 80) + '...' : notes;

    // Format date
    let dateStr = '';
    if (task.timestamp) {
        try {
            const date = new Date(task.timestamp.replace(' ', 'T'));
            const now = new Date();
            const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) dateStr = 'Today';
            else if (diffDays === 1) dateStr = 'Yesterday';
            else if (diffDays < 7) dateStr = date.toLocaleDateString('en-GB', { weekday: 'short' });
            else dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        } catch (e) {
            dateStr = task.timestamp;
        }
    }

    return `
        <div class="kanban-card" draggable="true" data-timestamp="${escapeHtml(task.timestamp)}" onclick="openDetailPanel(allEntries.find(e => e.timestamp === '${escapeHtml(task.timestamp)}'))">
            <div class="kanban-card-title">${titleHtml}</div>
            <div class="kanban-card-meta">
                <span class="type-badge" style="background:${typeColor};font-size:10px;padding:2px 6px">${escapeHtml(task.type)}</span>
                ${task.topics && task.topics.length > 0 ? task.topics.slice(0, 2).map(t => `<span class="topic-tag" style="font-size:10px;padding:1px 6px">${escapeHtml(t)}</span>`).join('') : ''}
            </div>
            ${notesPreview ? `<div class="kanban-card-notes">${escapeHtml(notesPreview)}</div>` : ''}
            ${dateStr ? `<div class="kanban-card-date">${dateStr}</div>` : ''}
        </div>
    `;
}

/**
 * Setup drag and drop for kanban cards
 */
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.kanban-card');
    const columns = document.querySelectorAll('.kanban-column-cards');

    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });

    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('dragenter', handleDragEnter);
        column.addEventListener('dragleave', handleDragLeave);
        column.addEventListener('drop', handleDrop);
    });
}

let draggedCard = null;

function handleDragStart(e) {
    draggedCard = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.timestamp);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.kanban-column-cards').forEach(col => {
        col.classList.remove('drag-over');
    });
    draggedCard = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    // Only remove if we're actually leaving this element
    if (!this.contains(e.relatedTarget)) {
        this.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    const timestamp = e.dataTransfer.getData('text/plain');
    const newStatus = this.dataset.columnId;

    if (!timestamp || !newStatus) return;

    // Update status via API
    try {
        const response = await fetch('/api/entries', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp, taskStatus: newStatus })
        });

        const result = await response.json();
        if (result.success) {
            // Update local data
            const entry = allEntries.find(e => e.timestamp === timestamp);
            if (entry) {
                entry.taskStatus = newStatus;
            }
            // Re-render board
            renderKanbanBoard();
            showStatus('Task moved', 'success');
        } else {
            showStatus('Failed to update task: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to update task status:', error);
        showStatus('Failed to update task', 'error');
    }
}

/**
 * Setup kanban event listeners
 */
function setupKanbanEventListeners() {
    // View toggle buttons
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchTaskView(view);
        });
    });

    // Add column button
    const addColBtn = document.getElementById('addColumnBtn');
    if (addColBtn) {
        addColBtn.addEventListener('click', showAddColumnDialog);
    }

    // Add column area click
    document.getElementById('kanbanBoard')?.addEventListener('click', (e) => {
        if (e.target.closest('#kanbanAddColumnArea')) {
            showAddColumnDialog();
        }
    });
}

/**
 * Switch between list and kanban views
 */
function switchTaskView(view) {
    currentTaskView = view;

    // Update toggle buttons
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide views
    const gridContainer = document.getElementById('gridContainer');
    const kanbanContainer = document.getElementById('kanbanContainer');

    if (view === 'kanban') {
        gridContainer.style.display = 'none';
        kanbanContainer.classList.add('active');
        renderKanbanBoard();
    } else {
        gridContainer.style.display = 'block';
        kanbanContainer.classList.remove('active');
    }
}

/**
 * Show add column dialog
 */
function showAddColumnDialog() {
    const name = prompt('Enter column name:');
    if (!name || !name.trim()) return;

    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

    addKanbanColumn(id, name.trim(), color);
}

/**
 * Add a new kanban column
 */
async function addKanbanColumn(id, name, color) {
    try {
        const response = await fetch('/api/kanban-columns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, color })
        });

        const result = await response.json();
        if (result.success) {
            await loadKanbanColumns();
            renderKanbanBoard();
            showStatus('Column added', 'success');
        } else {
            showStatus('Failed to add column: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Failed to add column:', error);
        showStatus('Failed to add column', 'error');
    }
}


// ============================================
// EXTERNAL SEARCH MODULE
// ============================================

/**
 * Setup external search page event listeners
 */
function setupExternalSearch() {
    const searchBtn = document.getElementById('externalSearchBtn');
    const searchInput = document.getElementById('externalSearchInput');

    if (!searchBtn || !searchInput) return;

    // Prevent duplicate listeners
    if (searchBtn.dataset.listenerAdded) return;

    searchBtn.addEventListener('click', performExternalSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performExternalSearch();
    });

    searchBtn.dataset.listenerAdded = 'true';
}

/**
 * Perform search across selected external services
 */
async function performExternalSearch() {
    const query = document.getElementById('externalSearchInput').value.trim();
    const resultsContainer = document.getElementById('searchResultsContainer');
    const searchGithub = document.getElementById('searchGithub')?.checked;
    const searchNotion = document.getElementById('searchNotion')?.checked;
    const searchFastmail = document.getElementById('searchFastmail')?.checked;
    const searchCapsule = document.getElementById('searchCapsule')?.checked;

    if (!query) {
        showStatus('Please enter a search query', 'error');
        return;
    }

    // Show loading state
    resultsContainer.innerHTML = `
        <div class="search-loading">
            <div class="spinner"></div>
            <span>Searching...</span>
        </div>
    `;

    let allResults = [];

    // Search GitHub if enabled
    if (searchGithub) {
        try {
            const response = await fetch('/api/search/github', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, maxResults: 10 })
            });

            const result = await response.json();
            if (result.success) {
                allResults.push({ service: 'github', data: result });
            } else {
                allResults.push({ service: 'github', error: result.error });
            }
        } catch (error) {
            allResults.push({ service: 'github', error: error.message });
        }
    }

    // Search Notion if enabled
    if (searchNotion) {
        try {
            const response = await fetch('/api/search/notion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, maxResults: 10 })
            });

            const result = await response.json();
            if (result.success) {
                allResults.push({ service: 'notion', data: result });
            } else {
                allResults.push({ service: 'notion', error: result.error });
            }
        } catch (error) {
            allResults.push({ service: 'notion', error: error.message });
        }
    }

    // Search Fastmail if enabled
    if (searchFastmail) {
        try {
            const response = await fetch('/api/search/fastmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, maxResults: 10 })
            });

            const result = await response.json();
            if (result.success) {
                allResults.push({ service: 'fastmail', data: result });
            } else {
                allResults.push({ service: 'fastmail', error: result.error });
            }
        } catch (error) {
            allResults.push({ service: 'fastmail', error: error.message });
        }
    }

    // Search Capsule CRM if enabled
    if (searchCapsule) {
        try {
            const response = await fetch('/api/search/capsule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, maxResults: 10 })
            });

            const result = await response.json();
            if (result.success) {
                allResults.push({ service: 'capsule', data: result });
            } else {
                allResults.push({ service: 'capsule', error: result.error });
            }
        } catch (error) {
            allResults.push({ service: 'capsule', error: error.message });
        }
    }

    // Render results
    renderSearchResults(allResults, query);
}

/**
 * Render search results from all services
 */
function renderSearchResults(results, query) {
    const container = document.getElementById('searchResultsContainer');

    if (results.length === 0) {
        container.innerHTML = `
            <div class="search-no-results">
                <p>No services selected. Please select at least one service to search.</p>
            </div>
        `;
        return;
    }

    let html = '';

    results.forEach(result => {
        if (result.service === 'github') {
            html += renderGitHubResults(result.data, result.error);
        } else if (result.service === 'notion') {
            html += renderNotionResults(result.data, result.error);
        } else if (result.service === 'fastmail') {
            html += renderFastmailResults(result.data, result.error);
        } else if (result.service === 'capsule') {
            html += renderCapsuleResults(result.data, result.error);
        }
    });

    container.innerHTML = html || `
        <div class="search-no-results">
            <p>No results found for "${escapeHtml(query)}"</p>
        </div>
    `;
}

/**
 * Render GitHub search results
 */
function renderGitHubResults(data, error) {
    if (error) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub
                </h3>
                <div class="search-error">
                    <div class="search-error-icon">⚠️</div>
                    <p>${escapeHtml(error)}</p>
                </div>
            </div>
        `;
    }

    if (!data) return '';

    const repositories = data.repositories || [];
    const code = data.code || [];
    const issues = data.issues || [];
    const commits = data.commits || [];

    const totalResults = repositories.length + code.length + issues.length + commits.length;

    if (totalResults === 0) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub <span class="search-result-count">(no results)</span>
                </h3>
            </div>
        `;
    }

    let html = '';

    // Repositories section
    if (repositories.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub Repositories <span class="search-result-count">(${repositories.length})</span>
                </h3>
        `;

        repositories.forEach(repo => {
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(repo.url)}" target="_blank">${escapeHtml(repo.full_name)}</a>
                    </div>
                    <div class="search-result-meta">
                        ${repo.language ? `<span class="search-result-lang">${escapeHtml(repo.language)}</span>` : ''}
                        <span>⭐ ${repo.stars}</span>
                        <span>${formatDate(repo.updated_at)}</span>
                    </div>
                    ${repo.description ? `<div class="search-result-preview">${escapeHtml(repo.description)}</div>` : ''}
                </div>
            `;
        });

        html += '</div>';
    }

    // Code section
    if (code.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="16 18 22 12 16 6"></polyline>
                        <polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                    GitHub Code <span class="search-result-count">(${code.length})</span>
                </h3>
        `;

        code.forEach(file => {
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(file.url)}" target="_blank">${escapeHtml(file.name)}</a>
                    </div>
                    <div class="search-result-meta">
                        <span>${escapeHtml(file.repo)}</span>
                        <span class="search-result-path">${escapeHtml(file.path)}</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    }

    // Issues section
    if (issues.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub Issues <span class="search-result-count">(${issues.length})</span>
                </h3>
        `;

        issues.forEach(issue => {
            const stateClass = issue.state === 'open' ? 'open' : 'closed';
            const labels = issue.labels.map(l => `<span class="search-result-label">${escapeHtml(l)}</span>`).join('');

            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(issue.url)}" target="_blank">#${issue.number}: ${escapeHtml(issue.title)}</a>
                    </div>
                    <div class="search-result-meta">
                        <span class="search-result-state ${stateClass}">${issue.state}</span>
                        <span>${escapeHtml(issue.repo)}</span>
                        <span>${formatDate(issue.updated_at)}</span>
                    </div>
                    ${issue.body_preview ? `<div class="search-result-preview">${escapeHtml(issue.body_preview)}...</div>` : ''}
                    ${labels ? `<div class="search-result-labels">${labels}</div>` : ''}
                </div>
            `;
        });

        html += '</div>';
    }

    // Commits section
    if (commits.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="4"/>
                        <line x1="1.05" y1="12" x2="7" y2="12"/>
                        <line x1="17" y1="12" x2="22.95" y2="12"/>
                    </svg>
                    GitHub Commits <span class="search-result-count">(${commits.length})</span>
                </h3>
        `;

        commits.forEach(commit => {
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(commit.url)}" target="_blank">${escapeHtml(commit.sha)}: ${escapeHtml(commit.message)}</a>
                    </div>
                    <div class="search-result-meta">
                        <span>${escapeHtml(commit.repo)}</span>
                        <span>${escapeHtml(commit.author)}</span>
                        <span>${formatDate(commit.date)}</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    }

    return html;
}

/**
 * Render Notion search results
 */
function renderNotionResults(data, error) {
    if (error) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M4 4.5h16a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 18V6A1.5 1.5 0 014 4.5zM4 6v12h16V6H4zm2 2h12v2H6V8zm0 4h8v2H6v-2z"/>
                    </svg>
                    Notion
                </h3>
                <div class="search-error">
                    <div class="search-error-icon">⚠️</div>
                    <p>${escapeHtml(error)}</p>
                </div>
            </div>
        `;
    }

    if (!data) return '';

    const pages = data.pages || [];
    const databases = data.databases || [];

    const totalResults = pages.length + databases.length;

    if (totalResults === 0) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M4 4.5h16a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 18V6A1.5 1.5 0 014 4.5zM4 6v12h16V6H4zm2 2h12v2H6V8zm0 4h8v2H6v-2z"/>
                    </svg>
                    Notion <span class="search-result-count">(no results)</span>
                </h3>
            </div>
        `;
    }

    let html = '';

    // Pages section
    if (pages.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M4 4.5h16a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 18V6A1.5 1.5 0 014 4.5zM4 6v12h16V6H4zm2 2h12v2H6V8zm0 4h8v2H6v-2z"/>
                    </svg>
                    Notion Pages <span class="search-result-count">(${pages.length})</span>
                </h3>
        `;

        pages.forEach(page => {
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        ${page.icon ? `<span class="search-result-icon">${page.icon}</span>` : ''}
                        <a href="${escapeHtml(page.url)}" target="_blank">${escapeHtml(page.title)}</a>
                    </div>
                    <div class="search-result-meta">
                        <span>Last edited: ${formatDate(page.last_edited)}</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    }

    // Databases section
    if (databases.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3"/>
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                    </svg>
                    Notion Databases <span class="search-result-count">(${databases.length})</span>
                </h3>
        `;

        databases.forEach(db => {
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        ${db.icon ? `<span class="search-result-icon">${db.icon}</span>` : ''}
                        <a href="${escapeHtml(db.url)}" target="_blank">${escapeHtml(db.title)}</a>
                    </div>
                    <div class="search-result-meta">
                        <span>Last edited: ${formatDate(db.last_edited)}</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    }

    return html;
}

/**
 * Render Fastmail email search results
 */
function renderFastmailResults(data, error) {
    if (error) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                    Fastmail
                </h3>
                <div class="search-error">
                    <div class="search-error-icon">⚠️</div>
                    <p>${escapeHtml(error)}</p>
                </div>
            </div>
        `;
    }

    if (!data) return '';

    const emails = data.emails || [];

    if (emails.length === 0) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                    Fastmail <span class="search-result-count">(no results)</span>
                </h3>
            </div>
        `;
    }

    let html = `
        <div class="search-results-section">
            <h3>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                Fastmail Emails <span class="search-result-count">(${emails.length})</span>
            </h3>
    `;

    emails.forEach(email => {
        const fromName = email.from?.[0]?.name || email.from?.[0]?.email || 'Unknown';
        const toList = (email.to || []).map(t => t.name || t.email).join(', ');
        const ccList = (email.cc || []).map(c => c.name || c.email).join(', ');
        const attachmentBadge = email.hasAttachment ? '<span class="email-attachment-badge">📎</span>' : '';

        html += `
            <div class="search-result-item email-result">
                <div class="search-result-title">
                    ${attachmentBadge}
                    <span class="email-subject">${escapeHtml(email.subject)}</span>
                </div>
                <div class="search-result-meta email-meta">
                    <span class="email-from"><strong>From:</strong> ${escapeHtml(fromName)}</span>
                    <span class="email-to"><strong>To:</strong> ${escapeHtml(toList)}</span>
                    ${ccList ? `<span class="email-cc"><strong>Cc:</strong> ${escapeHtml(ccList)}</span>` : ''}
                    <span class="email-date">${formatDate(email.date)}</span>
                    ${email.attachments > 0 ? `<span class="email-attachments">${email.attachments} attachment${email.attachments > 1 ? 's' : ''}</span>` : ''}
                </div>
                <div class="email-preview">${escapeHtml(email.preview)}</div>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

/**
 * Render Capsule CRM search results
 */
function renderCapsuleResults(data, error) {
    if (error) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    Capsule CRM
                </h3>
                <div class="search-error">
                    <div class="search-error-icon">&#9888;&#65039;</div>
                    <p>${escapeHtml(error)}</p>
                </div>
            </div>
        `;
    }

    if (!data) return '';

    const parties = data.parties || [];
    const opportunities = data.opportunities || [];
    const tasks = data.tasks || [];
    const projects = data.projects || [];

    const totalResults = parties.length + opportunities.length + tasks.length + projects.length;

    if (totalResults === 0) {
        return `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    Capsule CRM <span class="search-result-count">(no results)</span>
                </h3>
            </div>
        `;
    }

    let html = '';

    // Parties (Contacts/Organisations) section
    if (parties.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    Capsule Contacts <span class="search-result-count">(${parties.length})</span>
                </h3>
        `;

        parties.forEach(party => {
            const typeLabel = party.type === 'organisation' ? 'Org' : 'Person';
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(party.url)}" target="_blank">${escapeHtml(party.name)}</a>
                    </div>
                    <div class="search-result-meta">
                        <span class="search-result-label">${typeLabel}</span>
                        ${party.email ? `<span>${escapeHtml(party.email)}</span>` : ''}
                        ${party.phone ? `<span>${escapeHtml(party.phone)}</span>` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
    }

    // Opportunities section
    if (opportunities.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    Capsule Opportunities <span class="search-result-count">(${opportunities.length})</span>
                </h3>
        `;

        opportunities.forEach(opp => {
            const valueStr = opp.value ? `${opp.currency || ''} ${opp.value.toLocaleString()}`.trim() : '';
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(opp.url)}" target="_blank">${escapeHtml(opp.name)}</a>
                    </div>
                    <div class="search-result-meta">
                        ${opp.milestone ? `<span class="search-result-label">${escapeHtml(opp.milestone)}</span>` : ''}
                        ${valueStr ? `<span><strong>${valueStr}</strong></span>` : ''}
                        ${opp.party_name ? `<span>${escapeHtml(opp.party_name)}</span>` : ''}
                        ${opp.expected_close ? `<span>Close: ${formatDate(opp.expected_close)}</span>` : ''}
                    </div>
                    ${opp.description ? `<div class="search-result-preview">${escapeHtml(opp.description)}</div>` : ''}
                </div>
            `;
        });

        html += '</div>';
    }

    // Tasks section
    if (tasks.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 11l3 3L22 4"/>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    Capsule Tasks <span class="search-result-count">(${tasks.length})</span>
                </h3>
        `;

        tasks.forEach(task => {
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(task.url)}" target="_blank">${escapeHtml(task.description)}</a>
                    </div>
                    <div class="search-result-meta">
                        ${task.category ? `<span class="search-result-label">${escapeHtml(task.category)}</span>` : ''}
                        ${task.party_name ? `<span>${escapeHtml(task.party_name)}</span>` : ''}
                        ${task.due_on ? `<span>Due: ${formatDate(task.due_on)}</span>` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
    }

    // Projects (Cases) section
    if (projects.length > 0) {
        html += `
            <div class="search-results-section">
                <h3>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Capsule Projects <span class="search-result-count">(${projects.length})</span>
                </h3>
        `;

        projects.forEach(proj => {
            html += `
                <div class="search-result-item">
                    <div class="search-result-title">
                        <a href="${escapeHtml(proj.url)}" target="_blank">${escapeHtml(proj.name)}</a>
                    </div>
                    <div class="search-result-meta">
                        ${proj.status ? `<span class="search-result-label">${escapeHtml(proj.status)}</span>` : ''}
                        ${proj.party_name ? `<span>${escapeHtml(proj.party_name)}</span>` : ''}
                    </div>
                    ${proj.description ? `<div class="search-result-preview">${escapeHtml(proj.description)}</div>` : ''}
                </div>
            `;
        });

        html += '</div>';
    }

    return html;
}

/**
 * Format ISO date string to readable format
 */
function formatDate(isoDate) {
    if (!isoDate) return '';
    try {
        const date = new Date(isoDate);
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return isoDate;
    }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Settings Page Functions
// ============================================

let settingsInitialized = false;

// Default prompts (same as in host.py)
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

const DEFAULT_GRAMMAR_PROMPT = `Fix spelling and grammar errors in this note. Use UK spelling and sentence case. Never use em dash. If you can improve wording and flow without losing meaning do that. If you cannot work out meaning then don't make major changes.
Context: From {domain}
Page: {title}
Type: {type}
Preserve technical terms, jargon, domain-specific language, brands, names of things, people etc. and capitalise them correctly.

Original text: "{text}"

Return JSON only:
{"corrected": "the corrected text here"}`;

const DEFAULT_IMAGE_PROMPT = `Describe what is shown in this image in 2-3 sentences. Focus on the key elements and purpose.`;

const DEFAULT_AUDIO_PROMPT = `Analyze this audio transcript and provide:

1. **Summary**: A 2-3 sentence description of what is discussed/happening in this audio.

2. **Speakers**: Based on the content, speaking styles, and any context provided, attempt to identify who is speaking. List speakers as "Speaker 1", "Speaker 2" etc, and if you can infer names or roles from context, include them (e.g., "Speaker 1 (likely John, the manager)").

3. **Transcript**: Include the full transcript below.
{notes}

TRANSCRIPT:
{transcript}`;

const DEFAULT_DOCUMENT_PROMPT = `Summarise this document in 2-3 sentences. What is the main topic and key points?

{content}`;

const DEFAULT_LINK_PROMPT = `Browse this URL and provide a comprehensive summary of the page content.

URL: {url}
Page title: {title}
User notes: {notes}

Search the web for useful links, evidence, extra context or additional information related to this page. Cite all sources in your response.

Provide:
1. A 2-3 sentence summary of what the page is about
2. Key information, facts, or takeaways from the content
3. Any relevant context, related links, or supporting evidence you found
4. List all sources at the end`;

const DEFAULT_TEXT_PROMPT = `Summarise this text in 1-2 sentences:

{text}

Return just the summary.`;

const DEFAULT_RESEARCH_PROMPT = `Do background research on this topic and provide a 2-3 paragraph summary:

{notes}`;

/**
 * Initialize the settings page
 */
function initSettingsPage() {
    if (!settingsInitialized) {
        // Set up save buttons
        document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
        document.getElementById('savePromptsBtn').addEventListener('click', savePrompts);

        // Set up reset buttons
        document.getElementById('resetClassificationPrompt').addEventListener('click', () => {
            document.getElementById('settingClassificationPrompt').value = DEFAULT_CLASSIFICATION_PROMPT;
        });
        document.getElementById('resetGrammarPrompt').addEventListener('click', () => {
            document.getElementById('settingGrammarPrompt').value = DEFAULT_GRAMMAR_PROMPT;
        });
        document.getElementById('resetImagePrompt').addEventListener('click', () => {
            document.getElementById('settingImagePrompt').value = DEFAULT_IMAGE_PROMPT;
        });
        document.getElementById('resetAudioPrompt').addEventListener('click', () => {
            document.getElementById('settingAudioPrompt').value = DEFAULT_AUDIO_PROMPT;
        });
        document.getElementById('resetDocumentPrompt').addEventListener('click', () => {
            document.getElementById('settingDocumentPrompt').value = DEFAULT_DOCUMENT_PROMPT;
        });
        document.getElementById('resetLinkPrompt').addEventListener('click', () => {
            document.getElementById('settingLinkPrompt').value = DEFAULT_LINK_PROMPT;
        });
        document.getElementById('resetTextPrompt').addEventListener('click', () => {
            document.getElementById('settingTextPrompt').value = DEFAULT_TEXT_PROMPT;
        });
        document.getElementById('resetResearchPrompt').addEventListener('click', () => {
            document.getElementById('settingResearchPrompt').value = DEFAULT_RESEARCH_PROMPT;
        });

        settingsInitialized = true;
    }
    // Load current settings
    loadSettings();
}

/**
 * Load settings from server and populate form
 */
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Populate integration fields
        document.getElementById('settingGithubToken').value = settings.github_token || '';
        document.getElementById('settingGithubOrg').value = settings.github_org || '';
        document.getElementById('settingGithubRepos').value = settings.github_repos || '';
        document.getElementById('settingNotionToken').value = settings.notion_token || '';
        document.getElementById('settingFastmailToken').value = settings.fastmail_token || '';
        document.getElementById('settingCapsuleToken').value = settings.capsule_token || '';
        document.getElementById('settingOpenaiKey').value = settings.openai_api_key || '';

        // Populate prompt fields (use saved value or default)
        document.getElementById('settingClassificationPrompt').value =
            settings.classification_prompt || DEFAULT_CLASSIFICATION_PROMPT;
        document.getElementById('settingGrammarPrompt').value =
            settings.grammar_prompt || DEFAULT_GRAMMAR_PROMPT;
        document.getElementById('settingImagePrompt').value =
            settings.image_prompt || DEFAULT_IMAGE_PROMPT;
        document.getElementById('settingAudioPrompt').value =
            settings.audio_prompt || DEFAULT_AUDIO_PROMPT;
        document.getElementById('settingDocumentPrompt').value =
            settings.document_prompt || DEFAULT_DOCUMENT_PROMPT;
        document.getElementById('settingLinkPrompt').value =
            settings.link_prompt || DEFAULT_LINK_PROMPT;
        document.getElementById('settingTextPrompt').value =
            settings.text_prompt || DEFAULT_TEXT_PROMPT;
        document.getElementById('settingResearchPrompt').value =
            settings.research_prompt || DEFAULT_RESEARCH_PROMPT;
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

/**
 * Save settings to server
 */
async function saveSettings() {
    const statusEl = document.getElementById('settingsStatus');
    statusEl.textContent = 'Saving...';
    statusEl.className = 'settings-status';

    const settings = {
        github_token: document.getElementById('settingGithubToken').value,
        github_org: document.getElementById('settingGithubOrg').value,
        github_repos: document.getElementById('settingGithubRepos').value,
        notion_token: document.getElementById('settingNotionToken').value,
        fastmail_token: document.getElementById('settingFastmailToken').value,
        capsule_token: document.getElementById('settingCapsuleToken').value,
        openai_api_key: document.getElementById('settingOpenaiKey').value
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const result = await response.json();
        if (result.success) {
            statusEl.textContent = 'Saved!';
            statusEl.className = 'settings-status';
            // Reload to show masked values
            setTimeout(() => {
                loadSettings();
                statusEl.textContent = '';
            }, 1500);
        } else {
            statusEl.textContent = result.error || 'Failed to save';
            statusEl.className = 'settings-status error';
        }
    } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.className = 'settings-status error';
    }
}

/**
 * Save AI prompts to server
 */
async function savePrompts() {
    const statusEl = document.getElementById('promptsStatus');
    statusEl.textContent = 'Saving...';
    statusEl.className = 'settings-status';

    const classificationPrompt = document.getElementById('settingClassificationPrompt').value.trim();
    const grammarPrompt = document.getElementById('settingGrammarPrompt').value.trim();
    const imagePrompt = document.getElementById('settingImagePrompt').value.trim();
    const audioPrompt = document.getElementById('settingAudioPrompt').value.trim();
    const documentPrompt = document.getElementById('settingDocumentPrompt').value.trim();
    const linkPrompt = document.getElementById('settingLinkPrompt').value.trim();
    const textPrompt = document.getElementById('settingTextPrompt').value.trim();
    const researchPrompt = document.getElementById('settingResearchPrompt').value.trim();

    // Save empty string if user hasn't modified from default (saves storage)
    const settings = {
        classification_prompt: (classificationPrompt === DEFAULT_CLASSIFICATION_PROMPT) ? '' : classificationPrompt,
        grammar_prompt: (grammarPrompt === DEFAULT_GRAMMAR_PROMPT) ? '' : grammarPrompt,
        image_prompt: (imagePrompt === DEFAULT_IMAGE_PROMPT) ? '' : imagePrompt,
        audio_prompt: (audioPrompt === DEFAULT_AUDIO_PROMPT) ? '' : audioPrompt,
        document_prompt: (documentPrompt === DEFAULT_DOCUMENT_PROMPT) ? '' : documentPrompt,
        link_prompt: (linkPrompt === DEFAULT_LINK_PROMPT) ? '' : linkPrompt,
        text_prompt: (textPrompt === DEFAULT_TEXT_PROMPT) ? '' : textPrompt,
        research_prompt: (researchPrompt === DEFAULT_RESEARCH_PROMPT) ? '' : researchPrompt
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const result = await response.json();
        if (result.success) {
            statusEl.textContent = 'Saved!';
            statusEl.className = 'settings-status';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 1500);
        } else {
            statusEl.textContent = result.error || 'Failed to save';
            statusEl.className = 'settings-status error';
        }
    } catch (error) {
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.className = 'settings-status error';
    }
}

// ============================================
// Logs Page Functions
// ============================================

/**
 * Initialize the logs page - set up event listeners and load initial data
 */
function initLogsPage() {
    if (!LogsState.initialized) {
        // Set up event listeners only once
        document.getElementById('logsAutoRefresh').addEventListener('change', (e) => {
            LogsState.autoRefresh = e.target.checked;
            if (LogsState.autoRefresh) {
                startLogsPolling();
            } else {
                stopLogsPolling();
            }
        });

        document.getElementById('logsClear').addEventListener('click', async () => {
            await fetch('/api/logs', { method: 'DELETE' });
            LogsState.logs = [];
            LogsState.lastTimestamp = null;
            renderLogs();
        });

        LogsState.initialized = true;
    }

    // Load logs and start polling
    loadLogs();
    if (LogsState.autoRefresh) {
        startLogsPolling();
    }
}

/**
 * Load all logs from the API
 */
async function loadLogs() {
    try {
        const response = await fetch('/api/logs');
        LogsState.logs = await response.json();
        if (LogsState.logs.length > 0) {
            LogsState.lastTimestamp = LogsState.logs[0].timestamp;
        }
        renderLogs();
    } catch (error) {
        console.error('Failed to load logs:', error);
    }
}

/**
 * Start polling for new logs every 2.5 seconds
 */
function startLogsPolling() {
    stopLogsPolling();
    LogsState.pollInterval = setInterval(async () => {
        try {
            const url = LogsState.lastTimestamp
                ? `/api/logs?since=${encodeURIComponent(LogsState.lastTimestamp)}`
                : '/api/logs';
            const response = await fetch(url);
            const newLogs = await response.json();
            if (newLogs.length > 0) {
                LogsState.logs = [...newLogs, ...LogsState.logs].slice(0, 500);
                LogsState.lastTimestamp = newLogs[0].timestamp;
                renderLogs();
            }
        } catch (error) {
            console.error('Logs polling error:', error);
        }
    }, 2500);
}

/**
 * Stop polling for logs
 */
function stopLogsPolling() {
    if (LogsState.pollInterval) {
        clearInterval(LogsState.pollInterval);
        LogsState.pollInterval = null;
    }
}

/**
 * Render the logs to the container
 */
function renderLogs() {
    const container = document.getElementById('logsContainer');
    if (!container) return;

    if (LogsState.logs.length === 0) {
        container.innerHTML = '<div class="logs-empty">No logs yet. Make an API call to see logs here.</div>';
        return;
    }

    container.innerHTML = LogsState.logs.map(log => `
        <div class="log-entry ${log.status}">
            <span class="log-timestamp">${formatLogTime(log.timestamp)}</span>
            <span class="log-service ${log.service}">${log.service}</span>
            <span class="log-status ${log.status}">${log.status}${log.duration_ms ? ` (${log.duration_ms}ms)` : ''}</span>
            <div class="log-details-wrapper">
                <div class="log-message">${escapeHtml(log.details || log.action)}</div>
                ${(log.request || log.response) ? `
                    <div class="log-details">${log.request ? `Request: ${JSON.stringify(log.request, null, 2)}\n` : ''}${log.response ? `Response: ${JSON.stringify(log.response, null, 2)}` : ''}</div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

/**
 * Format ISO timestamp to readable time with milliseconds
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted time string
 */
function formatLogTime(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' +
               d.getMilliseconds().toString().padStart(3, '0');
    } catch {
        return isoString;
    }
}

// =========================================
// SLIDE-OUT DETAIL PANEL
// =========================================

/** Currently displayed entry in detail panel */
let currentDetailEntry = null;

/**
 * Get icon SVG for entry type
 * @param {string} type - Entry type
 * @returns {string} SVG markup
 */
function getTypeIcon(type) {
    const icons = {
        link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
        idea: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        task: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
        file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
        image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
        video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
        audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        screenshot: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
        pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
    };
    return icons[type] || icons.link;
}

/**
 * Open slide-out detail panel with entry details
 * @param {Object} entry - The KB entry to display
 */
function openDetailPanel(entry) {
    currentDetailEntry = entry;
    const panel = document.getElementById('detailPanel');
    const bodyEl = document.getElementById('detailBody');
    const typeText = document.getElementById('detailTypeText');
    const typeBadge = document.getElementById('detailTypeBadge');

    // Update type badge
    typeText.textContent = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
    typeBadge.querySelector('svg').innerHTML = getTypeIcon(entry.type);

    // Build body content
    let bodyHtml = '';

    // Title section
    bodyHtml += `
        <div class="detail-title">
            ${entry.url
                ? `<a href="${escapeHtml(entry.url)}" target="_blank">${escapeHtml(entry.title) || '(untitled)'}</a>`
                : escapeHtml(entry.title) || '(untitled)'}
        </div>
    `;

    // Meta info
    const metaParts = [];
    if (entry.source) metaParts.push(entry.source);
    if (entry.timestamp) {
        const date = new Date(entry.timestamp.replace(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/, '$1T$2:$3:$4'));
        metaParts.push(date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
    }
    if (metaParts.length > 0) {
        bodyHtml += `<div class="detail-meta">${metaParts.join(' • ')}</div>`;
    }

    // Entity and type badges
    bodyHtml += `<div class="detail-badges">`;
    if (entry.entity) {
        bodyHtml += `<span class="entity-badge" style="background:${ENTITY_COLORS[entry.entity] || ENTITY_COLORS.unclassified}">${escapeHtml(entry.entity)}</span>`;
    }
    bodyHtml += `<span class="type-badge" style="background:${TYPE_COLORS[entry.type] || '#64748b'}">${escapeHtml(entry.type)}</span>`;
    bodyHtml += `</div>`;

    // Tags (topics + people)
    const hasTags = (entry.topics && entry.topics.length > 0) || (entry.people && entry.people.length > 0);
    if (hasTags) {
        bodyHtml += `<div class="detail-tags">`;
        if (entry.topics && Array.isArray(entry.topics)) {
            bodyHtml += entry.topics.map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('');
        }
        if (entry.people && Array.isArray(entry.people)) {
            bodyHtml += entry.people.map(p => `<span class="person-tag">${escapeHtml(p)}</span>`).join('');
        }
        bodyHtml += `</div>`;
    }

    // Snippet (selected text)
    if (entry.selectedText) {
        bodyHtml += `
            <div class="detail-section detail-snippet-section">
                <div class="detail-section-header">
                    <h4>Snippet</h4>
                    <button class="detail-copy-btn" onclick="copyDetailContent('snippet')" title="Copy">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>
                <div class="detail-snippet-text">${escapeHtml(entry.selectedText)}</div>
            </div>
        `;
    }

    // Notes section
    if (entry.content) {
        bodyHtml += `
            <div class="detail-section detail-notes-section">
                <div class="detail-section-header">
                    <h4>My Notes</h4>
                    <button class="detail-copy-btn" onclick="copyDetailContent('notes')" title="Copy">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>
                <div class="detail-notes-text">${renderMarkdown(entry.content)}</div>
            </div>
        `;
    }

    // AI Summary
    const NO_SUMMARY_TYPES = ['video'];
    const shouldHaveAiSummary = !NO_SUMMARY_TYPES.includes(entry.type);

    if (entry.aiSummary) {
        bodyHtml += `
            <div class="detail-section detail-ai-section">
                <div class="detail-section-header">
                    <h4>AI Summary</h4>
                    <button class="detail-copy-btn" onclick="copyDetailContent('ai')" title="Copy">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>
                <div class="detail-ai-text">${escapeHtml(entry.aiSummary)}</div>
            </div>
        `;
    } else if (shouldHaveAiSummary) {
        bodyHtml += `
            <div class="detail-section detail-ai-section">
                <div class="detail-section-header">
                    <h4>AI Summary <span class="ai-processing-spinner" title="Processing..."></span></h4>
                </div>
                <div class="detail-ai-text"></div>
            </div>
        `;
    }

    // Media content (screenshot, file preview)
    if (entry.screenshot) {
        bodyHtml += `
            <div class="detail-section detail-media-section">
                <img src="/${escapeHtml(entry.screenshot)}" class="detail-screenshot"
                     onclick="window.open('/${escapeHtml(entry.screenshot)}', '_blank')"
                     title="Click to view full size">
            </div>
        `;
    }

    if (entry.file) {
        const fileName = entry.file.split('/').pop();
        const ext = fileName.split('.').pop().toLowerCase();
        const filePath = `/${escapeHtml(entry.file)}`;

        const audioExts = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a'];
        const videoExts = ['mp4', 'webm', 'ogv', 'mov', 'avi'];
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
        const textExts = ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'sql', 'csv', 'log'];
        const isPdf = ext === 'pdf';

        if (audioExts.includes(ext)) {
            bodyHtml += `
                <div class="detail-section detail-media-section">
                    <audio controls class="detail-audio">
                        <source src="${filePath}" type="audio/${ext === 'mp3' ? 'mpeg' : ext}">
                    </audio>
                </div>
            `;
        } else if (videoExts.includes(ext)) {
            bodyHtml += `
                <div class="detail-section detail-media-section">
                    <video controls class="detail-video">
                        <source src="${filePath}" type="video/${ext === 'mov' ? 'quicktime' : ext}">
                    </video>
                </div>
            `;
        } else if (imageExts.includes(ext)) {
            bodyHtml += `
                <div class="detail-section detail-media-section">
                    <img src="${filePath}" class="detail-screenshot"
                         onclick="window.open('${filePath}', '_blank')"
                         title="Click to view full size">
                </div>
            `;
        } else if (isPdf) {
            bodyHtml += `
                <div class="detail-section detail-media-section">
                    <iframe src="${filePath}" class="detail-pdf-viewer"></iframe>
                </div>
            `;
        } else if (textExts.includes(ext)) {
            bodyHtml += `
                <div class="detail-section detail-media-section">
                    <pre class="detail-code-preview" data-file="${filePath}">Loading...</pre>
                </div>
            `;
        }
    }

    // Page info (OG image, description)
    const hasPageInfo = entry.description || entry.ogImage || entry.author || entry.publishedDate || entry.readingTime;
    if (hasPageInfo) {
        bodyHtml += `<div class="detail-section detail-page-info">`;
        bodyHtml += `<h4>Page Info</h4>`;

        if (entry.ogImage) {
            bodyHtml += `
                <div class="detail-og-image">
                    <img src="${escapeHtml(entry.ogImage)}" alt="Preview"
                         onerror="this.parentElement.style.display='none'"
                         onclick="window.open('${escapeHtml(entry.ogImage)}', '_blank')">
                </div>
            `;
        }

        if (entry.description) {
            bodyHtml += `<div class="detail-page-desc">${escapeHtml(entry.description)}</div>`;
        }

        const pageMetaParts = [];
        if (entry.author) pageMetaParts.push(`Author: ${escapeHtml(entry.author)}`);
        if (entry.publishedDate) pageMetaParts.push(`Published: ${escapeHtml(entry.publishedDate)}`);
        if (entry.readingTime && entry.readingTime > 0) pageMetaParts.push(`~${entry.readingTime} min read`);
        if (pageMetaParts.length > 0) {
            bodyHtml += `<div class="detail-page-meta">${pageMetaParts.join(' • ')}</div>`;
        }

        bodyHtml += `</div>`;
    }

    bodyEl.innerHTML = bodyHtml;

    // Open panel
    panel.setAttribute('data-open', 'true');
    document.body.style.overflow = 'hidden';

    // Set up action buttons
    const openUrlBtn = document.getElementById('detailOpenUrl');
    const copyUrlBtn = document.getElementById('detailCopyUrl');
    const deleteBtn = document.getElementById('detailDelete');

    if (entry.url) {
        openUrlBtn.style.display = '';
        openUrlBtn.onclick = () => window.open(entry.url, '_blank');
        copyUrlBtn.style.display = '';
        copyUrlBtn.onclick = () => {
            navigator.clipboard.writeText(entry.url);
            showToast('URL copied to clipboard');
        };
    } else {
        openUrlBtn.style.display = 'none';
        copyUrlBtn.style.display = 'none';
    }

    deleteBtn.onclick = () => {
        if (confirm('Delete this entry?')) {
            deleteEntry(entry.timestamp);
            closeDetailPanel();
        }
    };

    // Load text file content if needed
    const codePreview = bodyEl.querySelector('.detail-code-preview');
    if (codePreview) {
        const filePath = codePreview.dataset.file;
        fetch(filePath)
            .then(r => r.text())
            .then(text => {
                const lines = text.split('\n');
                const preview = lines.slice(0, 200).join('\n');
                codePreview.textContent = preview + (lines.length > 200 ? '\n\n... (' + (lines.length - 200) + ' more lines)' : '');
            })
            .catch(() => {
                codePreview.textContent = 'Failed to load file';
            });
    }

    // Start AI polling if needed
    if (!entry.aiSummary && shouldHaveAiSummary) {
        startAiPolling(entry.timestamp);
    }

    // Handle escape key
    document.addEventListener('keydown', handleDetailPanelEscape);
}

/**
 * Close slide-out detail panel
 */
function closeDetailPanel() {
    const panel = document.getElementById('detailPanel');
    panel.setAttribute('data-open', 'false');
    document.body.style.overflow = '';
    currentDetailEntry = null;
    stopAiPolling();
    document.removeEventListener('keydown', handleDetailPanelEscape);
}

/**
 * Handle escape key for detail panel
 * @param {KeyboardEvent} e
 */
function handleDetailPanelEscape(e) {
    if (e.key === 'Escape') {
        closeDetailPanel();
    }
}

/**
 * Copy content from detail panel section
 * @param {string} type - 'snippet', 'notes', or 'ai'
 */
function copyDetailContent(type) {
    if (!currentDetailEntry) return;

    let text = '';
    if (type === 'snippet') {
        text = currentDetailEntry.selectedText || '';
    } else if (type === 'notes') {
        text = currentDetailEntry.content || '';
    } else if (type === 'ai') {
        text = currentDetailEntry.aiSummary || '';
    }

    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard');
    });
}

// =========================================
// DASHBOARD HOME PAGE
// =========================================

/**
 * Simple navigation helper
 * @param {string} page - Page name to navigate to
 */
function navigateTo(page) {
    navigateToPage(page);
}

/**
 * Update dashboard with current data
 */
function updateDashboard() {
    // Update greeting based on time of day
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';
    document.getElementById('dashboardGreeting').textContent = greeting;

    // Update stats
    const stats = getDashboardStats();
    document.getElementById('statTotalEntries').textContent = stats.total;
    document.getElementById('statTasks').textContent = stats.tasks;
    document.getElementById('statLinks').textContent = stats.links;
    document.getElementById('statIdeas').textContent = stats.ideas;

    // Update recent items
    renderRecentItems();

    // Update type breakdown
    renderTypeBreakdown();
}

/**
 * Get dashboard statistics
 * @returns {Object} Stats object with counts
 */
function getDashboardStats() {
    const tasks = allEntries.filter(e => e.entity === 'task' && e.kanbanStatus !== 'done');
    const links = allEntries.filter(e => e.type === 'link');
    const ideas = allEntries.filter(e => e.type === 'idea');

    return {
        total: allEntries.length,
        tasks: tasks.length,
        links: links.length,
        ideas: ideas.length
    };
}

/**
 * Render recent items list
 */
function renderRecentItems() {
    const container = document.getElementById('recentItems');
    const recentEntries = [...allEntries]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 5);

    if (recentEntries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No entries yet. Start saving links, ideas, and files!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = recentEntries.map(entry => {
        const typeColor = TYPE_COLORS[entry.type] || '#64748b';
        const icon = getTypeIcon(entry.type);
        const title = entry.title || '(untitled)';
        const source = entry.source || '';
        const timestamp = formatRelativeTime(entry.timestamp);

        return `
            <div class="recent-item" onclick="openDetailPanel(allEntries.find(e => e.timestamp === '${escapeHtml(entry.timestamp)}'))">
                <div class="recent-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
                </div>
                <div class="recent-item-content">
                    <div class="recent-item-title">${escapeHtml(title)}</div>
                    <div class="recent-item-meta">${escapeHtml(source)} • ${timestamp}</div>
                </div>
                <div class="recent-item-badge">
                    <span class="type-badge" style="background:${typeColor};font-size:10px;padding:2px 6px">${escapeHtml(entry.type)}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 * @param {string} timestamp - Timestamp string
 * @returns {string} Relative time string
 */
function formatRelativeTime(timestamp) {
    try {
        // Parse UltraThink timestamp format: YYYY-MM-DD_HH-MM-SS
        const match = timestamp.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
        if (!match) return timestamp;

        const date = new Date(match[1], match[2] - 1, match[3], match[4], match[5], match[6]);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
        return timestamp;
    }
}

/**
 * Render type breakdown cards
 */
function renderTypeBreakdown() {
    const container = document.getElementById('typeBreakdown');

    // Count entries by type
    const typeCounts = {};
    allEntries.forEach(entry => {
        const type = entry.type || 'other';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Sort by count descending
    const sortedTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); // Show top 8 types

    if (sortedTypes.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = sortedTypes.map(([type, count]) => {
        const color = TYPE_COLORS[type] || '#64748b';
        return `
            <div class="type-card" onclick="filterByType('${escapeHtml(type)}')" style="border-left: 3px solid ${color}">
                <div class="type-card-count">${count}</div>
                <div class="type-card-label">${escapeHtml(type)}</div>
            </div>
        `;
    }).join('');
}

/**
 * Filter entries by type and navigate to knowledge page
 * @param {string} type - The type to filter by
 */
function filterByType(type) {
    navigateToPage('knowledge');
    document.getElementById('filterType').value = type;
    applyFilters();
}

// =========================================
// COMMAND PALETTE (Cmd+K)
// =========================================

/** Current selected result index */
let commandSelectedIndex = 0;
/** Current command results */
let commandResults = [];

/**
 * Command palette commands
 */
const PALETTE_COMMANDS = [
    { id: 'home', label: 'Go to Home', subtitle: 'Dashboard', icon: 'home', action: () => navigateTo('home'), shortcut: ['G', 'H'] },
    { id: 'knowledge', label: 'Go to Knowledge', subtitle: 'All entries', icon: 'book', action: () => navigateTo('knowledge'), shortcut: ['G', 'K'] },
    { id: 'tasks', label: 'Go to Tasks', subtitle: 'Task board', icon: 'check', action: () => navigateTo('task'), shortcut: ['G', 'T'] },
    { id: 'projects', label: 'Go to Projects', subtitle: 'Project list', icon: 'folder', action: () => navigateTo('project'), shortcut: ['G', 'P'] },
    { id: 'visualise', label: 'Go to Visualise', subtitle: 'Knowledge graph', icon: 'graph', action: () => navigateTo('visualise'), shortcut: ['G', 'V'] },
    { id: 'search', label: 'Go to Search', subtitle: 'External search', icon: 'search', action: () => navigateTo('search'), shortcut: ['G', 'S'] },
    { id: 'topics', label: 'Manage Topics', subtitle: 'Add or edit topics', icon: 'tag', action: () => navigateTo('topics') },
    { id: 'people', label: 'Manage People', subtitle: 'Add or edit people', icon: 'users', action: () => navigateTo('people') },
    { id: 'settings', label: 'Settings', subtitle: 'App settings', icon: 'settings', action: () => navigateTo('settings') },
    { id: 'theme', label: 'Toggle Theme', subtitle: 'Switch dark/light mode', icon: 'moon', action: () => { toggleTheme(); closeCommandPalette(); } },
    { id: 'refresh', label: 'Refresh Data', subtitle: 'Reload all entries', icon: 'refresh', action: () => { loadEntries(); closeCommandPalette(); } },
];

/**
 * Get command icon SVG
 * @param {string} icon - Icon name
 * @returns {string} SVG markup
 */
function getCommandIcon(icon) {
    const icons = {
        home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
        folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
        graph: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
        search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
        refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
        file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
    };
    return icons[icon] || icons.file;
}

/**
 * Open command palette
 */
function openCommandPalette() {
    const palette = document.getElementById('commandPalette');
    const input = document.getElementById('commandInput');

    palette.setAttribute('data-open', 'true');
    input.value = '';
    input.focus();
    commandSelectedIndex = 0;
    updateCommandResults('');
}

/**
 * Close command palette
 */
function closeCommandPalette() {
    const palette = document.getElementById('commandPalette');
    palette.setAttribute('data-open', 'false');
}

/**
 * Toggle command palette
 */
function toggleCommandPalette() {
    const palette = document.getElementById('commandPalette');
    if (palette.getAttribute('data-open') === 'true') {
        closeCommandPalette();
    } else {
        openCommandPalette();
    }
}

/**
 * Update command results based on query
 * @param {string} query - Search query
 */
function updateCommandResults(query) {
    const container = document.getElementById('commandResults');
    const normalizedQuery = query.toLowerCase().trim();

    commandResults = [];

    // If no query, show commands
    if (!normalizedQuery) {
        const commandsHtml = PALETTE_COMMANDS.map((cmd, index) => {
            commandResults.push({ type: 'command', data: cmd });
            return renderCommandResult(cmd, index, 'command');
        }).join('');

        container.innerHTML = `
            <div class="command-result-group">
                <div class="command-result-group-label">Commands</div>
                ${commandsHtml}
            </div>
        `;
        updateSelectedResult();
        return;
    }

    // Search entries
    const matchingEntries = allEntries
        .filter(entry => {
            const title = (entry.title || '').toLowerCase();
            const content = (entry.content || '').toLowerCase();
            return title.includes(normalizedQuery) || content.includes(normalizedQuery);
        })
        .slice(0, 8);

    // Search commands
    const matchingCommands = PALETTE_COMMANDS.filter(cmd =>
        cmd.label.toLowerCase().includes(normalizedQuery) ||
        cmd.subtitle.toLowerCase().includes(normalizedQuery)
    );

    let html = '';

    if (matchingEntries.length > 0) {
        const entriesHtml = matchingEntries.map((entry, index) => {
            commandResults.push({ type: 'entry', data: entry });
            return renderEntryResult(entry, index, normalizedQuery);
        }).join('');

        html += `
            <div class="command-result-group">
                <div class="command-result-group-label">Entries</div>
                ${entriesHtml}
            </div>
        `;
    }

    if (matchingCommands.length > 0) {
        const commandsHtml = matchingCommands.map((cmd, index) => {
            const resultIndex = commandResults.length;
            commandResults.push({ type: 'command', data: cmd });
            return renderCommandResult(cmd, resultIndex, 'command');
        }).join('');

        html += `
            <div class="command-result-group">
                <div class="command-result-group-label">Commands</div>
                ${commandsHtml}
            </div>
        `;
    }

    if (commandResults.length === 0) {
        html = `
            <div class="command-palette-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p>No results found for "${escapeHtml(query)}"</p>
            </div>
        `;
    }

    container.innerHTML = html;
    commandSelectedIndex = 0;
    updateSelectedResult();
}

/**
 * Render a command result item
 * @param {Object} cmd - Command object
 * @param {number} index - Result index
 * @returns {string} HTML string
 */
function renderCommandResult(cmd, index) {
    const icon = getCommandIcon(cmd.icon);
    const shortcutHtml = cmd.shortcut
        ? `<div class="command-result-shortcut">${cmd.shortcut.map(k => `<kbd>${k}</kbd>`).join('')}</div>`
        : '';

    return `
        <div class="command-result" data-index="${index}" onclick="executeCommandResult(${index})">
            <div class="command-result-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
            </div>
            <div class="command-result-content">
                <div class="command-result-title">${escapeHtml(cmd.label)}</div>
                <div class="command-result-subtitle">${escapeHtml(cmd.subtitle)}</div>
            </div>
            ${shortcutHtml}
        </div>
    `;
}

/**
 * Render an entry result item
 * @param {Object} entry - Entry object
 * @param {number} index - Result index
 * @param {string} query - Search query for highlighting
 * @returns {string} HTML string
 */
function renderEntryResult(entry, index, query) {
    const icon = getTypeIcon(entry.type);
    const title = entry.title || '(untitled)';
    const highlightedTitle = highlightMatch(title, query);
    const typeColor = TYPE_COLORS[entry.type] || '#64748b';

    return `
        <div class="command-result" data-index="${index}" onclick="executeCommandResult(${index})">
            <div class="command-result-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
            </div>
            <div class="command-result-content">
                <div class="command-result-title">${highlightedTitle}</div>
                <div class="command-result-subtitle">${escapeHtml(entry.source || '')} • ${escapeHtml(entry.type)}</div>
            </div>
            <span class="type-badge" style="background:${typeColor};font-size:10px;padding:2px 6px">${escapeHtml(entry.type)}</span>
        </div>
    `;
}

/**
 * Highlight matching text
 * @param {string} text - Text to highlight
 * @param {string} query - Query to match
 * @returns {string} HTML with highlights
 */
function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

/**
 * Update selected result styling
 */
function updateSelectedResult() {
    const results = document.querySelectorAll('.command-result');
    results.forEach((el, index) => {
        el.classList.toggle('selected', index === commandSelectedIndex);
    });

    // Scroll into view if needed
    const selected = results[commandSelectedIndex];
    if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
    }
}

/**
 * Execute the selected command result
 * @param {number} index - Result index
 */
function executeCommandResult(index) {
    const result = commandResults[index];
    if (!result) return;

    closeCommandPalette();

    if (result.type === 'command') {
        result.data.action();
    } else if (result.type === 'entry') {
        openDetailPanel(result.data);
    }
}

/**
 * Handle keyboard navigation in command palette
 * @param {KeyboardEvent} e
 */
function handleCommandPaletteKeydown(e) {
    const palette = document.getElementById('commandPalette');
    if (palette.getAttribute('data-open') !== 'true') return;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            commandSelectedIndex = Math.min(commandSelectedIndex + 1, commandResults.length - 1);
            updateSelectedResult();
            break;
        case 'ArrowUp':
            e.preventDefault();
            commandSelectedIndex = Math.max(commandSelectedIndex - 1, 0);
            updateSelectedResult();
            break;
        case 'Enter':
            e.preventDefault();
            executeCommandResult(commandSelectedIndex);
            break;
        case 'Escape':
            e.preventDefault();
            closeCommandPalette();
            break;
    }
}

// Initialize command palette event listeners
document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('commandInput');
    if (input) {
        input.addEventListener('input', (e) => updateCommandResults(e.target.value));
        input.addEventListener('keydown', handleCommandPaletteKeydown);
    }
});

// Global keyboard shortcut for command palette (Cmd+K or Ctrl+K)
document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
    }
});
