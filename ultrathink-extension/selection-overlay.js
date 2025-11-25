// Selection overlay for screenshot area capture
(function() {
  console.log('Selection overlay loaded');
  let startX, startY, endX, endY;
  let isSelecting = false;
  let overlay, selectionBox;
  let selectionComplete = false;

  function createOverlay() {
    console.log('Creating overlay');
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
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(selectionBox);

    // Add event listeners
    overlay.addEventListener('mousedown', handleMouseDown);
    overlay.addEventListener('mousemove', handleMouseMove);
    overlay.addEventListener('mouseup', handleMouseUp);

    // Auto-capture after 2 seconds if no interaction
    setTimeout(() => {
      if (!selectionComplete) {
        captureFullScreen();
      }
    }, 2000);
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

    // Get device pixel ratio to convert CSS pixels to physical pixels
    const dpr = window.devicePixelRatio || 1;

    const rect = {
      x: Math.min(startX, endX) * dpr,
      y: Math.min(startY, endY) * dpr,
      width: Math.abs(endX - startX) * dpr,
      height: Math.abs(endY - startY) * dpr
    };

    cleanup();

    // Wait for DOM to update before capturing
    setTimeout(() => {
      console.log('Sending areaSelected message', rect);
      chrome.runtime.sendMessage({
        action: 'areaSelected',
        rect: rect
      }, (response) => {
        console.log('areaSelected response:', response);
      });
    }, 100);
  }

  function captureFullScreen() {
    console.log('captureFullScreen called');
    selectionComplete = true;
    cleanup();

    // Wait for overlay to be removed before capturing
    setTimeout(() => {
      console.log('Sending captureFullScreen message');
      chrome.runtime.sendMessage({
        action: 'captureFullScreen'
      }, (response) => {
        console.log('captureFullScreen response:', response);
      });
    }, 100);
  }

  function cleanup() {
    if (overlay) overlay.remove();
    if (selectionBox) selectionBox.remove();
  }

  // Start the overlay
  createOverlay();
})();
