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
        openModal(row.getData());
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
    const searchValue = document.getElementById('search').value.toLowerCase();

    table.setFilter(function(data) {
        // Type filter
        if (typeFilter && data.type !== typeFilter) return false;

        // Source filter
        if (sourceFilter && data.source !== sourceFilter) return false;

        // Entity filter
        if (entityFilter && data.entity !== entityFilter) return false;

        // Search filter
        if (searchValue) {
            // Check basic fields
            const matchesBasic = (
                (data.title && data.title.toLowerCase().includes(searchValue)) ||
                (data.content && data.content.toLowerCase().includes(searchValue)) ||
                (data.type && data.type.toLowerCase().includes(searchValue)) ||
                (data.source && data.source.toLowerCase().includes(searchValue)) ||
                (data.url && data.url.toLowerCase().includes(searchValue)) ||
                (data.entity && data.entity.toLowerCase().includes(searchValue))
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
    document.getElementById('topicsPage').classList.remove('active');
    document.getElementById('peoplePage').classList.remove('active');
    document.getElementById('visualisePage').classList.remove('active');
    document.getElementById('searchPage').classList.remove('active');

    // Hide view toggle by default
    document.getElementById('viewToggle').style.display = 'none';

    // Show appropriate content
    if (page === 'topics') {
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
    } else {
        // Show toolbar for home, project, task, knowledge
        document.querySelector('.toolbar').style.display = 'flex';

        // Apply entity filter based on page
        if (page === 'home') {
            document.getElementById('filterEntity').value = '';
        } else if (page === 'project') {
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
                openModal(node.entryData);
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
        <div class="kanban-card" draggable="true" data-timestamp="${escapeHtml(task.timestamp)}" onclick="openModal(allEntries.find(e => e.timestamp === '${escapeHtml(task.timestamp)}'))">
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
    const searchGithub = document.getElementById('searchGithub').checked;

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
        }
        // Future: Add Notion, Fastmail, etc.
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

    const issues = data.issues || [];
    const commits = data.commits || [];

    if (issues.length === 0 && commits.length === 0) {
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
