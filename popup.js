class TelegramPhotoSender {
  constructor() {
    this.fileInput = document.getElementById('fileInput');
    this.fileName = document.getElementById('fileName');
    this.sendButton = document.getElementById('sendButton');
    this.previewContainer = document.getElementById('previewContainer');
    this.imagePreview = document.getElementById('imagePreview');
    this.removeImage = document.getElementById('removeImage');
    this.statusContainer = document.getElementById('statusContainer');
    this.statusMessage = document.getElementById('statusMessage');
    
    this.selectedFile = null;
    
    this.init();
  }

  init() {
    // Event listeners
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.sendButton.addEventListener('click', () => this.handleSend());
    this.removeImage.addEventListener('click', () => this.clearSelection());
    
    console.log('[Popup] Initialized');
  }

  handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.showStatus('Please select a valid image file', 'error');
      return;
    }

    // Validate file size (max 20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      this.showStatus('File size must be less than 20MB', 'error');
      return;
    }

    this.selectedFile = file;
    this.fileName.textContent = file.name;
    
    // Show preview
    this.showPreview(file);
    
    // Enable send button
    this.sendButton.disabled = false;
    
    console.log('[Popup] File selected:', file.name, `(${this.formatFileSize(file.size)})`);
  }

  showPreview(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      this.imagePreview.src = e.target.result;
      this.previewContainer.classList.remove('hidden');
    };
    
    reader.onerror = () => {
      this.showStatus('Failed to load image preview', 'error');
    };
    
    reader.readAsDataURL(file);
  }

  clearSelection() {
    this.selectedFile = null;
    this.fileInput.value = '';
    this.fileName.textContent = 'Choose an image';
    this.imagePreview.src = '';
    this.previewContainer.classList.add('hidden');
    this.sendButton.disabled = true;
    this.hideStatus();
  }

  async handleSend() {
    if (!this.selectedFile) {
      this.showStatus('Please select an image first', 'error');
      return;
    }

    try {
      // Disable button and show loading state
      this.sendButton.disabled = true;
      this.sendButton.classList.add('loading');
      this.showStatus('Preparing to send...', 'info');

      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab) {
        throw new Error('No active tab found');
      }

      // Check if we're on Telegram
      if (!tab.url || !tab.url.includes('web.telegram.org')) {
        throw new Error('Please open Telegram Web (web.telegram.org) first');
      }

      console.log('[Popup] Injecting content script...');

      // Inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content_script.js']
      });

      // Wait a bit for content script to initialize
      await this.sleep(500);

      // Ping content script to verify it's ready
      console.log('[Popup] Pinging content script...');
      const pingResponse = await this.sendMessageToTab(tab.id, { action: 'ping' });

      if (!pingResponse || !pingResponse.success) {
        throw new Error('Content script failed to load');
      }

      console.log('[Popup] Content script ready, converting file...');

      // Convert file to ArrayBuffer
      const arrayBuffer = await this.fileToArrayBuffer(this.selectedFile);
      const uint8Array = new Uint8Array(arrayBuffer);

      console.log('[Popup] Sending photo to content script...');
      this.showStatus('Uploading photo...', 'info');

      // Send photo data to content script
      const response = await this.sendMessageToTab(tab.id, {
        action: 'uploadPhoto',
        data: {
          arrayBuffer: Array.from(uint8Array),
          filename: this.selectedFile.name,
          mimeType: this.selectedFile.type
        }
      });

      if (response && response.success) {
        this.showStatus(`✓ Photo sent successfully! (${response.duration}ms)`, 'success');
        console.log('[Popup] Upload successful:', response);
        
        // Clear selection after successful send
        setTimeout(() => {
          this.clearSelection();
        }, 2000);
      } else {
        throw new Error(response?.error || 'Upload failed with unknown error');
      }

    } catch (error) {
      console.error('[Popup] Error:', error);
      this.showStatus(`✗ Error: ${error.message}`, 'error');
      this.sendButton.disabled = false;
    } finally {
      this.sendButton.classList.remove('loading');
    }
  }

  fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        console.log('[Popup] File read:', reader.result.byteLength, 'bytes'); // Should be much larger!
        resolve(reader.result);
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsArrayBuffer(file); // Make sure this is here!
    });
  }

  sendMessageToTab(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Popup] Message error:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  showStatus(message, type = 'info') {
    this.statusContainer.className = `status-container ${type}`;
    this.statusMessage.textContent = message;
    this.statusContainer.classList.remove('hidden');
  }

  hideStatus() {
    this.statusContainer.classList.add('hidden');
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new TelegramPhotoSender();
  });
} else {
  new TelegramPhotoSender();
}