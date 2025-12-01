// Selection overlay for screenshot area capture
(function() {
  // Inline logger for content script
  const DEBUG_ENABLED = false; // Set to true for debugging
  const log = {
    debug: (...args) => DEBUG_ENABLED && console.log('[UltraThink:Overlay] DEBUG |', ...args),
    info: (...args) => DEBUG_ENABLED && console.log('[UltraThink:Overlay] INFO |', ...args),
    warn: (...args) => console.warn('[UltraThink:Overlay] WARN |', ...args),
    error: (...args) => console.error('[UltraThink:Overlay] ERROR |', ...args)
  };

  log.info('Selection overlay loaded');
  let startX, startY, endX, endY;
  let isSelecting = false;
  let overlay, selectionBox;
  let selectionComplete = false;

  function createOverlay() {
    log.debug('Creating overlay');
    // Create semi-transparent overlay
    overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      cursor: crosshair;
    `;

    // Create selection box
    selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
      position: fixed;
      border: 2px solid #4266cc;
      background: rgba(66, 102, 204, 0.1);
      display: none;
      z-index: 2147483647;
      pointer-events: none;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(selectionBox);

    // Add event listeners
    overlay.addEventListener('mousedown', handleMouseDown);
    overlay.addEventListener('mousemove', handleMouseMove);
    overlay.addEventListener('mouseup', handleMouseUp);

    // Add ESC key support to cancel
    document.addEventListener('keydown', handleKeyDown);

  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      log.debug('ESC pressed, canceling selection');
      selectionComplete = true;
      cleanup();
    }
  }

  function handleMouseDown(e) {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.display = 'block';
  }

  function handleMouseMove(e) {
    if (!isSelecting) return;

    endX = e.clientX;
    endY = e.clientY;

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  }

  function handleMouseUp(e) {
    if (!isSelecting) return;

    isSelecting = false;
    selectionComplete = true;

    endX = e.clientX;
    endY = e.clientY;

    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    // Single click (no meaningful drag) → full screen capture
    if (width < 5 && height < 5) {
      captureFullScreen();
      return;
    }

    // Region selected → crop capture
    const dpr = window.devicePixelRatio || 1;

    const rect = {
      x: Math.min(startX, endX) * dpr,
      y: Math.min(startY, endY) * dpr,
      width: width * dpr,
      height: height * dpr
    };

    cleanup();

    // Wait for DOM to update before capturing
    setTimeout(() => {
      log.debug('Sending areaSelected message', rect);
      chrome.runtime.sendMessage({
        action: 'areaSelected',
        rect: rect
      }, (response) => {
        log.debug('areaSelected response:', response);
      });
    }, 100);
  }

  function captureFullScreen() {
    log.debug('captureFullScreen called');
    selectionComplete = true;
    cleanup();

    // Wait for overlay to be removed before capturing
    setTimeout(() => {
      log.debug('Sending captureFullScreen message');
      chrome.runtime.sendMessage({
        action: 'captureFullScreen'
      }, (response) => {
        log.debug('captureFullScreen response:', response);
      });
    }, 100);
  }

  function cleanup() {
    // Remove keydown listener
    document.removeEventListener('keydown', handleKeyDown);
    // Remove overlay elements
    if (overlay) overlay.remove();
    if (selectionBox) selectionBox.remove();
    log.debug('Overlay cleaned up');
  }

  // Start the overlay
  createOverlay();
})();
