/**
 * Telegram Web Photo Uploader
 * Uses reliable DOM observation instead of arbitrary timeouts
 */

const TelegramUploader = {
  // Configuration
  config: {
    selectors: {
      dropTarget: '.DropTarget',
      composerWrapper: '.composer-wrapper',
      messageContainer: '.input-message-container',
      middleColumn: '.middle-column',
      messageInput: '.input-message-input',
      chatContent: '.chat-content, .messages-container',
      
      // Preview modal selectors
      previewModal: '.modal, [role="dialog"]',
      sendButton: 'button',
    },
    
    // Timeouts (safety nets only - not for waiting)
    maxWaitTime: {
      dropTarget: 3000,
      preview: 5000,
      sendButton: 5000,
      clickResponse: 2000
    }
  },

  /**
   * UTILITY: Waits for a condition to become true
   * This replaces blind setTimeout() calls
   * @param {Function} condition - Function that returns true when ready
   * @param {number} timeout - Max time to wait (safety net)
   * @param {number} checkInterval - How often to check (ms)
   * @returns {Promise<void>}
   */
  async waitUntil(condition, timeout = 5000, checkInterval = 100) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const check = () => {
        // Check if condition is met
        if (condition()) {
          resolve();
          return;
        }
        
        // Check if timeout exceeded
        if (Date.now() - startTime >= timeout) {
          reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
          return;
        }
        
        // Check again after interval
        setTimeout(check, checkInterval);
      };
      
      check();
    });
  },

  /**
   * UTILITY: Waits for an element to appear in the DOM
   * Uses MutationObserver for efficiency
   * @param {string} selector - CSS selector
   * @param {number} timeout - Max wait time (safety net)
   * @returns {Promise<Element>}
   */
  async waitForElement(selector, timeout = 5000) {
    // Check if element already exists
    const existingElement = document.querySelector(selector);
    if (existingElement) {
      return existingElement;
    }

    return new Promise((resolve, reject) => {
      // Set up MutationObserver to watch for new elements
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });

      // Safety timeout
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element not found: ${selector} (timeout after ${timeout}ms)`));
      }, timeout);
    });
  },

  /**
   * UTILITY: Waits for an element to have a specific class
   * @param {Element} element - The element to watch
   * @param {string} className - Class name to wait for
   * @param {number} timeout - Max wait time
   * @returns {Promise<void>}
   */
  async waitForClass(element, className, timeout = 3000) {
    if (element.classList.contains(className)) {
      return;
    }

    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (element.classList.contains(className)) {
          observer.disconnect();
          resolve();
        }
      });

      observer.observe(element, {
        attributes: true,
        attributeFilter: ['class']
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Class "${className}" did not appear within ${timeout}ms`));
      }, timeout);
    });
  },

  /**
   * UTILITY: Waits for preview modal to appear
   * @returns {Promise<Element>}
   */
  async waitForPreviewModal() {
    console.log('[Telegram Uploader] Waiting for preview modal...');
    
    // Wait for modal to appear
    const modal = await this.waitForElement(
      this.config.selectors.previewModal, 
      this.config.maxWaitTime.preview
    );
    
    console.log('[Telegram Uploader] ✓ Preview modal appeared');
    return modal;
  },

  /**
   * Converts ArrayBuffer to File object
   */
  arrayBufferToFile(arrayBuffer, filename = 'image.png', mimeType = 'image/png') {
    try {
      const uint8Array = new Uint8Array(arrayBuffer);
      const blob = new Blob([uint8Array], { type: mimeType });
      return new File([blob], filename, { type: mimeType, lastModified: Date.now() });
    } catch (error) {
      throw new Error(`Failed to convert ArrayBuffer to File: ${error.message}`);
    }
  },

  /**
   * Finds the best drop zone element
   */
  findDropZone() {
    const selectors = [
      this.config.selectors.composerWrapper,
      this.config.selectors.messageContainer,
      this.config.selectors.middleColumn,
      this.config.selectors.messageInput
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`[Telegram Uploader] ✓ Found drop zone: ${selector}`);
        return element;
      }
    }

    throw new Error('No drop zone found. Make sure you have a chat open.');
  },

  /**
   * Creates a DataTransfer object with proper file data
   */
  createDataTransfer(file) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    dataTransfer.effectAllowed = 'all';
    dataTransfer.dropEffect = 'copy';
    return dataTransfer;
  },

  /**
   * Simulates the complete drag and drop sequence
   * Now with proper waiting instead of blind timeouts
   */
  async uploadViaDragAndDrop(file) {
    try {
      console.log('[Telegram Uploader] ========================================');
      console.log('[Telegram Uploader] Starting drag & drop simulation...');
      
      // Find initial drop zone
      let dropZone = this.findDropZone();
      
      // Create DataTransfer with our file
      const dataTransfer = this.createDataTransfer(file);
      
      console.log('[Telegram Uploader] File in DataTransfer:', {
        files: dataTransfer.files.length,
        types: dataTransfer.types,
        fileName: dataTransfer.files[0]?.name
      });

      // STEP 1: Dispatch dragenter
      console.log('[Telegram Uploader] Step 1: Dispatching dragenter...');
      const dragEnterEvent = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        view: window
      });
      dropZone.dispatchEvent(dragEnterEvent);

      // STEP 2: Wait for DropTarget to appear (instead of blind timeout)
      console.log('[Telegram Uploader] Step 2: Waiting for DropTarget to appear...');
      try {
        const dropTarget = await this.waitForElement(
          this.config.selectors.dropTarget, 
          this.config.maxWaitTime.dropTarget
        );
        console.log('[Telegram Uploader] ✓ DropTarget appeared!');
        dropZone = dropTarget; // Switch to DropTarget
      } catch (error) {
        console.log('[Telegram Uploader] ⚠️ DropTarget not found, continuing with current zone...');
      }

      // STEP 3: Dispatch dragover events
      console.log('[Telegram Uploader] Step 3: Dispatching dragover events...');
      
      // Dispatch 3 dragover events with small delays between them
      for (let i = 0; i < 3; i++) {
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
          view: window
        });
        
        // Prevent default on dragover (required for drop to work)
        dropZone.addEventListener('dragover', (e) => e.preventDefault(), { once: true });
        dropZone.dispatchEvent(dragOverEvent);
        
        // Small delay between dragover events (mimics real dragging)
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // STEP 4: Dispatch drop
      console.log('[Telegram Uploader] Step 4: Dispatching drop event...');
      
      // Prevent default on drop
      dropZone.addEventListener('drop', (e) => e.preventDefault(), { once: true });
      
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        view: window
      });
      
      dropZone.dispatchEvent(dropEvent);
      console.log('[Telegram Uploader] ✓ Drop event dispatched on:', dropZone.className);

      // STEP 5: Dispatch dragleave (cleanup)
      const dragLeaveEvent = new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer,
        view: window
      });
      dropZone.dispatchEvent(dragLeaveEvent);
      
      // STEP 6: Wait for preview modal to appear (replaces blind timeout)
      await this.waitForPreviewModal();
      
      return true;
      
    } catch (error) {
      console.error('[Telegram Uploader] ✗ Drag & drop failed:', error.message);
      throw error;
    }
  },

  /**
   * Performs multiple click methods on an element
   */
  performClick(element) {
    console.log('[Telegram Uploader] Attempting click with multiple methods...');
    
    // Method: Keyboard Enter
    try {
      element.focus();
      
      element.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
        keyCode: 13
      }));
      
      element.dispatchEvent(new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
        keyCode: 13
      }));
      
      console.log('[Telegram Uploader] ✓ Method 4: Keyboard Enter executed');
    } catch (error) {
      console.log('[Telegram Uploader] ✗ Method 4 failed:', error.message);
    }
  },

  /**
   * Finds and clicks the send button
   * Now uses smart waiting instead of blind timeouts
   */
  async clickSendButton() {
    try {
      console.log('[Telegram Uploader] Looking for send button...');
      
      // IMPROVED: Wait until send button actually exists and is visible
      // Instead of: await new Promise(resolve => setTimeout(resolve, 2000));
      await this.waitUntil(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const visibleButtons = buttons.filter(btn => btn.offsetParent !== null);
        const sendButton = visibleButtons.find(btn => {
          const text = btn.textContent.trim().toLowerCase();
          const isPrimary = btn.className.includes('primary');
          return text === 'send' && isPrimary;
        });
        return sendButton !== undefined;
      }, this.config.maxWaitTime.sendButton);
      
      console.log('[Telegram Uploader] ✓ Send button is now available');
      
      // Get all buttons
      const allButtons = Array.from(document.querySelectorAll('button'));
      const visibleButtons = allButtons.filter(btn => btn.offsetParent !== null);
      
      console.log(`[Telegram Uploader] Found ${visibleButtons.length} visible buttons`);
      
      // Find send button (we know it exists now because waitUntil succeeded)
      let sendButton = visibleButtons.find(btn => {
        const text = btn.textContent.trim().toLowerCase();
        const isPrimary = btn.className.includes('primary');
        return text === 'send' && isPrimary;
      });
      
      // Fallback strategies
      if (!sendButton) {
        sendButton = visibleButtons.find(btn => 
          btn.textContent.trim().toLowerCase() === 'send'
        );
      }
      
      if (!sendButton) {
        sendButton = visibleButtons.find(btn => {
          const text = btn.textContent.trim().toLowerCase();
          const hasButtonClass = btn.className.includes('Button');
          return text === 'send' && hasButtonClass;
        });
      }

      if (!sendButton) {
        console.log('[Telegram Uploader] ⚠️ Visible buttons:');
        visibleButtons.forEach((btn, idx) => {
          console.log(`  ${idx}: "${btn.textContent.trim()}" - ${btn.className}`);
        });
        throw new Error('Send button not found despite passing waitUntil check');
      }

      console.log('[Telegram Uploader] Send button details:', {
        text: sendButton.textContent.trim(),
        className: sendButton.className,
        disabled: sendButton.disabled
      });
      
      console.log('[Telegram Uploader] Clicking send button...');
      this.performClick(sendButton);
      
      // IMPROVED: Wait for modal to close (indicates success)
      // Instead of: await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('[Telegram Uploader] Waiting for preview to close...');
      try {
        await this.waitUntil(() => {
          const modal = document.querySelector(this.config.selectors.previewModal);
          return modal === null || modal.style.display === 'none';
        }, this.config.maxWaitTime.clickResponse);
        console.log('[Telegram Uploader] ✓ Preview closed - photo sent successfully!');
      } catch (error) {
        console.log('[Telegram Uploader] ⚠️ Could not confirm modal closed, but click was executed');
      }
      
    } catch (error) {
      throw new Error(`Failed to click send: ${error.message}`);
    }
  },

  /**
   * Main upload function
   */
  async uploadPhoto(data) {
    const startTime = Date.now();
    
    try {
      console.log('[Telegram Uploader] ========================================');
      console.log('[Telegram Uploader] UPLOAD STARTED');
      console.log('[Telegram Uploader] ========================================');

      // Validate input
      if (!data || !data.arrayBuffer) {
        throw new Error('Invalid data: arrayBuffer is required');
      }

      // Convert to File
      const file = this.arrayBufferToFile(
        data.arrayBuffer,
        data.filename || 'image.png',
        data.mimeType || 'image/png'
      );

      console.log(`[Telegram Uploader] File created:`, {
        name: file.name,
        size: file.size,
        type: file.type
      });

      // Upload via drag and drop (with smart waiting)
      await this.uploadViaDragAndDrop(file);

      // Click send button (with smart waiting)
      await this.clickSendButton();

      const duration = Date.now() - startTime;
      console.log('[Telegram Uploader] ========================================');
      console.log(`[Telegram Uploader] ✓ SUCCESS (${duration}ms)`);
      console.log('[Telegram Uploader] ========================================');

      return {
        success: true,
        message: 'Photo uploaded successfully',
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Telegram Uploader] ========================================');
      console.error('[Telegram Uploader] ✗ FAILED:', error.message);
      console.error('[Telegram Uploader] ========================================');

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  },

  /**
   * Validates we're on Telegram chat page
   */
  isValidTelegramPage() {
    const url = window.location.href;
    const isWebTelegram = url.includes('web.telegram.org');
    const hasChatContent = document.querySelector(this.config.selectors.chatContent) !== null;
    
    return isWebTelegram && hasChatContent;
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Telegram Uploader] Message received:', request.action);

  if (request.action === 'uploadPhoto') {
    if (!TelegramUploader.isValidTelegramPage()) {
      sendResponse({
        success: false,
        error: 'Not on a valid Telegram chat page. Please open a chat first.'
      });
      return true;
    }

    TelegramUploader.uploadPhoto(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: `Unexpected error: ${error.message}`
      }));

    return true; // Async response
  }

  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'Content script is ready' });
    return true;
  }

  sendResponse({
    success: false,
    error: `Unknown action: ${request.action}`
  });
  return true;
});

console.log('[Telegram Uploader] Content script loaded and ready');