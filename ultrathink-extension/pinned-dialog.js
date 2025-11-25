// Pinned drop target dialog
(function() {
  console.log('Pinned dialog loaded');

  // Check if dialog already exists
  if (document.getElementById('ultrathink-pinned-dialog')) {
    console.log('Pinned dialog already exists');
    return;
  }

  // Detect type from filename (for dropped files)
  function detectFileType(filename) {
    if (!filename) return 'file';
    const ext = filename.toLowerCase().split('.').pop();

    if (ext === 'md') return 'markdown';
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx', 'rtf'].includes(ext)) return 'ms-word';
    if (['ppt', 'pptx'].includes(ext)) return 'ms-powerpoint';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'ms-excel';
    if (['one', 'onetoc2'].includes(ext)) return 'ms-onenote';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'aiff'].includes(ext)) return 'audio';
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return 'video';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return 'image';

    return 'file';
  }

  let countdown = 3;
  let timerInterval = null;
  let autoSaveTriggered = false;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let pendingFiles = [];

  // Create dialog container
  const dialog = document.createElement('div');
  dialog.id = 'ultrathink-pinned-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    width: 300px;
    min-height: 200px;
    background: white;
    border: 2px solid #ff5200;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 2147483647;
    padding: 16px 16px 8px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    cursor: move;
  `;

  // Create dialog HTML
  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; cursor: move; flex-shrink: 0;" id="ultrathink-dialog-header">
      <h3 style="margin: 0; font-size: 14px; color: #333;">Ultrathink</h3>
      <button id="ultrathink-close-btn" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666; cursor: pointer;">×</button>
    </div>

    <div id="ultrathink-drop-zone" style="
      border: 2px dashed #ccc;
      border-radius: 4px;
      padding: 32px;
      text-align: center;
      color: #666;
      font-size: 13px;
      margin-bottom: 12px;
      transition: all 0.2s;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80px;
      cursor: default;
    ">
      <div>
        <div style="font-weight: 500;">Drop files here or paste (Ctrl+V)</div>
      </div>
    </div>

    <div id="ultrathink-file-list" style="margin-bottom: 12px; font-size: 12px; color: #666; flex-shrink: 0;"></div>

    <div id="ultrathink-timer" style="font-size: 12px; color: #666; text-align: left; margin-bottom: 8px; flex-shrink: 0;"></div>

    <textarea id="ultrathink-notes" placeholder="Add notes..." style="
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
      box-sizing: border-box;
      font-family: inherit;
      resize: none;
      flex: 1;
      min-height: 60px;
      outline-color: #999;
      cursor: text;
      display: none;
    "></textarea>

  `;

  document.body.appendChild(dialog);

  // Create resize handles for all edges and corners
  // Using larger grab zones (12px for edges, 16px for corners) for easier grabbing
  const resizeDirections = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const handleStyles = {
    n:  { top: '-6px', left: '16px', right: '16px', height: '12px', cursor: 'ns-resize' },
    s:  { bottom: '-6px', left: '16px', right: '16px', height: '12px', cursor: 'ns-resize' },
    e:  { right: '-6px', top: '16px', bottom: '16px', width: '12px', cursor: 'ew-resize' },
    w:  { left: '-6px', top: '16px', bottom: '16px', width: '12px', cursor: 'ew-resize' },
    ne: { top: '-6px', right: '-6px', width: '16px', height: '16px', cursor: 'nesw-resize' },
    nw: { top: '-6px', left: '-6px', width: '16px', height: '16px', cursor: 'nwse-resize' },
    se: { bottom: '-6px', right: '-6px', width: '16px', height: '16px', cursor: 'nwse-resize' },
    sw: { bottom: '-6px', left: '-6px', width: '16px', height: '16px', cursor: 'nesw-resize' }
  };

  resizeDirections.forEach(dir => {
    const handle = document.createElement('div');
    handle.className = 'ultrathink-resize-handle';
    handle.dataset.direction = dir;
    handle.style.cssText = 'position: absolute; background: transparent;';
    Object.entries(handleStyles[dir]).forEach(([prop, val]) => {
      handle.style[prop] = val;
    });
    dialog.appendChild(handle);
  });

  // Resize functionality
  let isResizing = false;
  let resizeDirection = '';
  let startX, startY, startWidth, startHeight, startLeft, startTop;

  dialog.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('ultrathink-resize-handle')) {
      isResizing = true;
      resizeDirection = e.target.dataset.direction;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = dialog.offsetWidth;
      startHeight = dialog.offsetHeight;
      startLeft = dialog.offsetLeft;
      startTop = dialog.offsetTop;
      // Clear right positioning when resizing
      dialog.style.right = 'auto';
      dialog.style.left = startLeft + 'px';
      e.preventDefault();
      e.stopPropagation();
    }
  });


  // Get elements
  const header = document.getElementById('ultrathink-dialog-header');
  const closeBtn = document.getElementById('ultrathink-close-btn');
  const dropZone = document.getElementById('ultrathink-drop-zone');
  const fileList = document.getElementById('ultrathink-file-list');
  const timerEl = document.getElementById('ultrathink-timer');
  const notesEl = document.getElementById('ultrathink-notes');

  // Close button handler
  closeBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    dialog.remove();
  });

  // Make dialog draggable by any non-interactive area
  dialog.addEventListener('mousedown', (e) => {
    // Don't drag if clicking on interactive elements or resize handles
    const tag = e.target.tagName.toLowerCase();
    const isInteractive = ['textarea', 'input', 'button', 'select'].includes(tag);
    const isResizeHandle = e.target.classList.contains('ultrathink-resize-handle');
    const isDropZone = e.target.id === 'ultrathink-drop-zone' || e.target.closest('#ultrathink-drop-zone');

    if (isInteractive || isResizeHandle || isDropZone) return;

    isDragging = true;
    dragOffsetX = e.clientX - dialog.offsetLeft;
    dragOffsetY = e.clientY - dialog.offsetTop;
    dialog.style.right = 'auto';
    dialog.style.left = dialog.offsetLeft + 'px';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    // Handle dragging
    if (isDragging) {
      dialog.style.left = (e.clientX - dragOffsetX) + 'px';
      dialog.style.top = (e.clientY - dragOffsetY) + 'px';
      dialog.style.right = 'auto';
      return;
    }

    // Handle resizing
    if (isResizing) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const minWidth = 200;
      const minHeight = 150;

      if (resizeDirection.includes('e')) {
        dialog.style.width = Math.max(minWidth, startWidth + dx) + 'px';
      }
      if (resizeDirection.includes('w')) {
        const newWidth = Math.max(minWidth, startWidth - dx);
        if (newWidth > minWidth) {
          dialog.style.width = newWidth + 'px';
          dialog.style.left = (startLeft + dx) + 'px';
        }
      }
      if (resizeDirection.includes('s')) {
        dialog.style.height = Math.max(minHeight, startHeight + dy) + 'px';
      }
      if (resizeDirection.includes('n')) {
        const newHeight = Math.max(minHeight, startHeight - dy);
        if (newHeight > minHeight) {
          dialog.style.height = newHeight + 'px';
          dialog.style.top = (startTop + dy) + 'px';
        }
      }
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    resizeDirection = '';
  });

  // File drop handlers - use dialog level to catch all drops
  dialog.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZone.style.display !== 'none') {
      dropZone.style.borderColor = '#ff5200';
      dropZone.style.backgroundColor = '#fff5f0';
    }
  });

  dialog.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZone.style.display !== 'none') {
      dropZone.style.borderColor = '#ccc';
      dropZone.style.backgroundColor = 'transparent';
    }
  });

  dialog.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#ccc';
    dropZone.style.backgroundColor = 'transparent';

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  });

  // Paste handler (must focus on dialog first)
  dialog.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files = [];
    const textItems = [];

    for (let item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      } else if (item.kind === 'string' && item.type === 'text/plain') {
        item.getAsString((text) => {
          if (text && !files.length) {
            // Only use text if no files were pasted
            notesEl.value = text;
            pendingFiles = [{ type: 'text', name: 'Pasted text', content: text }];
            updateFileList();
            startTimer();
          }
        });
      }
    }

    if (files.length > 0) {
      handleFiles(files);
    }
  });

  // Handle files
  function handleFiles(files) {
    pendingFiles = files.map(f => ({ type: 'file', name: f.name, file: f }));
    updateFileList();
    startTimer();
  }

  // Update file list display
  function updateFileList() {
    if (pendingFiles.length === 0) {
      fileList.innerHTML = '';
      dropZone.style.display = 'flex';
      notesEl.style.display = 'none';
      return;
    }

    const fileNames = pendingFiles.map(f => `📄 ${f.name}`).join('<br>');
    fileList.innerHTML = `<strong>Ready to save:</strong><br>${fileNames}`;
    dropZone.style.display = 'none';
    notesEl.style.display = 'block';
    notesEl.focus();
  }

  // Timer functions
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    countdown = 3;
    autoSaveTriggered = false;
    timerEl.textContent = `Auto-saving in ${countdown} seconds...`;

    timerInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        timerEl.textContent = `Auto-saving in ${countdown} seconds...`;
      } else {
        clearInterval(timerInterval);
        timerEl.textContent = '';
        autoSaveTriggered = true;
        saveFiles();
      }
    }, 1000);
  }

  function resetTimer() {
    if (!autoSaveTriggered && pendingFiles.length > 0) {
      startTimer();
    }
  }

  // Notes interaction resets timer
  notesEl.addEventListener('input', resetTimer);
  notesEl.addEventListener('focus', resetTimer);

  // Save files
  async function saveFiles() {
    if (pendingFiles.length === 0) return;

    try {
      timerEl.textContent = 'Saving...';

      const notes = notesEl.value;

      // Process each file
      for (const item of pendingFiles) {
        if (item.type === 'text') {
          // Save pasted text as snippet
          const response = await chrome.runtime.sendMessage({
            action: 'saveFile',
            fileType: 'text',
            fileName: 'pasted-text',
            content: item.content,
            notes: notes
          });

          if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to save text');
          }
        } else {
          // Read file and send to background with detected type
          const fileData = await readFileAsDataURL(item.file);
          const detectedType = detectFileType(item.name);

          const response = await chrome.runtime.sendMessage({
            action: 'saveFile',
            fileType: 'file',
            fileName: item.name,
            fileData: fileData,
            mimeType: item.file.type,
            detectedType: detectedType,  // Pass detected type to background
            notes: notes
          });

          if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to save file');
          }
        }
      }

      // Success - clear everything
      pendingFiles = [];
      notesEl.value = '';
      updateFileList();
      timerEl.textContent = '';

    } catch (error) {
      console.error('Save error:', error);
      timerEl.textContent = `Error: ${error.message}`;
      clearInterval(timerInterval);
    }
  }

  // Read file as data URL
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Make dialog focusable for paste events
  dialog.setAttribute('tabindex', '0');
  dialog.focus();

  console.log('Pinned dialog ready');
})();
