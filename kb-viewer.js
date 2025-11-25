/**
 * Ultrathink KB Viewer - Client-side JavaScript
 * Handles Tabulator grid initialization and API interactions
 */

// Type badge colors matching Ultrathink brand
// All types from popup.html: audio, chatgpt, claude, file, idea, image, link,
// markdown, ms-excel, ms-onenote, ms-powerpoint, ms-word, notion, para, pdf,
// perplexity, screenshot, snippet, video
const TYPE_COLORS = {
    // Links & Web
    link: '#ff5200',           // Ultrathink orange (primary)
    snippet: '#28a745',        // Green
    screenshot: '#6f42c1',     // Purple

    // Files & Documents
    file: '#fd7e14',           // Orange
    pdf: '#dc3545',            // Red
    markdown: '#6c757d',       // Gray
    image: '#17a2b8',          // Teal

    // Microsoft Office (using brand-adjacent colors, no blue)
    'ms-word': '#ff5200',      // Ultrathink orange
    'ms-excel': '#217346',     // Excel green
    'ms-powerpoint': '#d24726', // PowerPoint orange
    'ms-onenote': '#7719aa',   // OneNote purple

    // AI Assistants
    claude: '#d97706',         // Claude amber/orange
    chatgpt: '#10a37f',        // ChatGPT green
    perplexity: '#ff5200',     // Ultrathink orange (was blue)

    // Productivity Apps
    notion: '#000000',         // Notion black

    // Media
    video: '#dc3545',          // Red
    audio: '#e83e8c',          // Pink

    // Notes & Ideas
    idea: '#ffc107',           // Yellow/gold
    para: '#20c997'            // Teal/cyan
};

let table = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadEntries();
    setupEventListeners();
});

/**
 * Fetch entries from API and initialize table
 */
async function loadEntries() {
    try {
        const response = await fetch('/api/entries');
        if (!response.ok) throw new Error('Failed to fetch entries');

        const entries = await response.json();
        initTable(entries);
        updateEntryCount(entries.length);
    } catch (error) {
        console.error('Failed to load entries:', error);
        document.getElementById('entryCount').textContent = 'Error loading entries';
        showStatus('Failed to load entries: ' + error.message, 'error');
    }
}

/**
 * Initialize Tabulator grid with data
 */
function initTable(entries) {
    // Destroy existing table if present
    if (table) {
        table.destroy();
    }

    table = new Tabulator("#kb-table", {
        data: entries,
        layout: "fitColumns",
        responsiveLayout: "collapse",
        selectable: true,
        placeholder: "No entries found",
        height: "calc(100vh - 140px)",
        columns: [
            {
                formatter: "rowSelection",
                titleFormatter: "rowSelection",
                hozAlign: "center",
                headerSort: false,
                width: 40
            },
            {
                title: "Title",
                field: "title",
                formatter: titleFormatter,
                widthGrow: 3,
                headerFilter: "input",
                headerFilterPlaceholder: "Filter title..."
            },
            {
                title: "Type",
                field: "type",
                formatter: typeBadgeFormatter,
                width: 120,
                headerFilter: "list",
                headerFilterParams: { valuesLookup: true, clearable: true },
                headerFilterPlaceholder: "All types"
            },
            {
                title: "Date",
                field: "timestamp",
                sorter: "string",
                width: 170
            },
            {
                title: "Notes",
                field: "content",
                formatter: contentFormatter,
                widthGrow: 2,
                headerFilter: "input",
                headerFilterPlaceholder: "Filter notes..."
            },
            {
                title: "Group",
                field: "group",
                formatter: groupFormatter,
                width: 100,
                headerFilter: "list",
                headerFilterParams: { valuesLookup: true, clearable: true },
                headerFilterPlaceholder: "All"
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
}

/**
 * Custom formatter for title with clickable link
 */
function titleFormatter(cell) {
    const data = cell.getRow().getData();
    const title = escapeHtml(data.title);

    // If there's a screenshot, show a small preview
    let preview = '';
    if (data.screenshot) {
        preview = `<img src="/${escapeHtml(data.screenshot)}" class="screenshot-preview"
                        onclick="window.open('/${escapeHtml(data.screenshot)}', '_blank')"
                        title="Click to view full size"
                        onerror="this.style.display='none'">&nbsp;`;
    }

    if (data.url && data.url !== data.title) {
        return `${preview}<a href="${escapeHtml(data.url)}" target="_blank" class="title-link" title="${escapeHtml(data.url)}">${title}</a>`;
    }

    return `${preview}${title}`;
}

/**
 * Custom formatter for type badges with colors
 */
function typeBadgeFormatter(cell) {
    const type = cell.getValue();
    if (!type) return '';

    const color = TYPE_COLORS[type] || '#6c757d';
    return `<span class="type-badge" style="background:${color}">${escapeHtml(type)}</span>`;
}

/**
 * Custom formatter for content/notes
 */
function contentFormatter(cell) {
    const content = cell.getValue();
    if (!content) return '';

    // Truncate long content
    const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;
    return `<span class="content-cell" title="${escapeHtml(content)}">${escapeHtml(truncated)}</span>`;
}

/**
 * Custom formatter for tab group
 */
function groupFormatter(cell) {
    const group = cell.getValue();
    if (!group) return '';

    return `<span class="group-badge">${escapeHtml(group)}</span>`;
}

/**
 * Custom formatter for delete button
 */
function actionsFormatter(cell) {
    const timestamp = cell.getRow().getData().timestamp;
    return `<button class="delete-btn" onclick="deleteEntry('${escapeHtml(timestamp)}')" title="Delete entry">&times;</button>`;
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
            // Find and remove row by timestamp
            const rows = table.getRows();
            for (const row of rows) {
                if (row.getData().timestamp === timestamp) {
                    row.delete();
                    break;
                }
            }
            updateEntryCount(table.getDataCount());
            showStatus('Entry deleted successfully', 'success');
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

    if (!confirm(`Delete ${selected.length} selected entries? This will also delete any associated files.`)) {
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

    // Reload to sync state
    await loadEntries();

    if (errors > 0) {
        showStatus(`Deleted ${deleted} entries, ${errors} failed`, 'error');
    } else {
        showStatus(`Deleted ${deleted} entries`, 'success');
    }
}

/**
 * Set up event listeners for toolbar controls
 */
function setupEventListeners() {
    // Global search filter
    document.getElementById('search').addEventListener('input', debounce((e) => {
        const value = e.target.value.toLowerCase();

        if (!value) {
            table.clearFilter();
            return;
        }

        // Filter across multiple fields
        table.setFilter(function(data) {
            return (
                (data.title && data.title.toLowerCase().includes(value)) ||
                (data.content && data.content.toLowerCase().includes(value)) ||
                (data.type && data.type.toLowerCase().includes(value)) ||
                (data.url && data.url.toLowerCase().includes(value)) ||
                (data.group && data.group.toLowerCase().includes(value))
            );
        });
    }, 300));

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        document.getElementById('entryCount').textContent = 'Loading...';
        await loadEntries();
        showStatus('Entries refreshed', 'success');
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

    // Auto-hide after 3 seconds
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
 * Debounce function for search input
 */
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}
