// Vision AI Pro - Advanced Content Script
// Enhanced screenshot capture with AI analysis

class VisionAIPro {
  constructor() {
    this.isSelecting = false;
    this.isElementMode = false;
    this.startX = null;
    this.startY = null;
    this.endX = null;
    this.endY = null;
    this.overlay = null;
    this.selectionBox = null;
    this.instruction = null;
    this.currentProvider = 'openai';
    this.highlightedElement = null;

    this.init();
  }

  init() {
    this.setupMessageListener();
    this.setupKeyboardShortcuts();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'ping':
          sendResponse({ status: 'ready' });
          return true;
        case 'takeFullScreenshot':
          this.takeFullScreenshot(request.provider);
          break;
        case 'startRegionSelect':
          this.startRegionSelection(request.provider);
          break;
        case 'startElementSelect':
          this.startElementSelection(request.provider);
          break;
        case 'takeScrollScreenshot':
          this.takeScrollScreenshot(request.provider);
          break;
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Global shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'f':
            e.preventDefault();
            this.takeFullScreenshot();
            break;
          case 'r':
            e.preventDefault();
            this.startRegionSelection();
            break;
          case 'e':
            e.preventDefault();
            this.startElementSelection();
            break;
        }
      }
    });
  }

  async takeFullScreenshot(provider = 'openai') {
    this.currentProvider = provider;

    try {
      const response = await this.captureTab();
      if (response.error) {
        this.showError('Screenshot capture failed: ' + response.error);
        return;
      }
      this.showAIDialog(response.dataUrl);
    } catch (error) {
      this.showError('Failed to capture screenshot: ' + error.message);
    }
  }

  startRegionSelection(provider = 'openai') {
    if (this.isSelecting) return;

    this.currentProvider = provider;
    this.isSelecting = true;
    this.isElementMode = false;
    this.createOverlay('region');
    this.setupRegionEvents();
  }

  startElementSelection(provider = 'openai') {
    if (this.isSelecting) return;

    this.currentProvider = provider;
    this.isSelecting = true;
    this.isElementMode = true;
    this.createOverlay('element');
    this.setupElementEvents();
  }

  async takeScrollScreenshot(provider = 'openai') {
    this.currentProvider = provider;

    try {
      this.showInstruction('Capturing scrolling screenshot...', 2000);

      // Get page dimensions
      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );

      const viewportHeight = window.innerHeight;
      const scrollSteps = Math.ceil(totalHeight / viewportHeight);

      // Capture multiple screenshots while scrolling
      const screenshots = [];
      const originalScrollY = window.scrollY;

      for (let i = 0; i < scrollSteps; i++) {
        window.scrollTo(0, i * viewportHeight);
        await this.sleep(200); // Wait for scroll to complete

        const response = await this.captureTab();
        if (response.dataUrl) {
          screenshots.push(response.dataUrl);
        }
      }

      // Restore original scroll position
      window.scrollTo(0, originalScrollY);

      if (screenshots.length > 0) {
        // For now, just use the first screenshot
        // TODO: Implement image stitching
        this.showAIDialog(screenshots[0]);
      } else {
        this.showError('Failed to capture scrolling screenshot');
      }

    } catch (error) {
      this.showError('Scrolling screenshot failed: ' + error.message);
    }
  }

  createOverlay(mode = 'region') {
    this.overlay = document.createElement('div');
    this.overlay.className = 'vai-screenshot-overlay';

    if (mode === 'region') {
      this.selectionBox = document.createElement('div');
      this.selectionBox.className = 'vai-screenshot-selection';
      this.selectionBox.style.display = 'none';
      this.overlay.appendChild(this.selectionBox);
    }

    document.body.appendChild(this.overlay);

    // Show instruction
    const instructions = {
      region: 'Click and drag to select region • Press <kbd>ESC</kbd> to cancel',
      element: 'Click on any element to capture • Press <kbd>ESC</kbd> to cancel'
    };

    this.showInstruction(instructions[mode], 4000);
  }

  setupRegionEvents() {
    this.overlay.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  setupElementEvents() {
    document.addEventListener('mouseover', this.handleElementHover.bind(this));
    document.addEventListener('click', this.handleElementClick.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleMouseDown(e) {
    if (!this.isSelecting || this.isElementMode) return;

    this.startX = e.clientX;
    this.startY = e.clientY;
    this.selectionBox.style.display = 'block';
    this.selectionBox.style.left = this.startX + 'px';
    this.selectionBox.style.top = this.startY + 'px';
    this.selectionBox.style.width = '0px';
    this.selectionBox.style.height = '0px';
  }

  handleMouseMove(e) {
    if (!this.isSelecting || !this.startX || this.isElementMode) return;

    this.endX = e.clientX;
    this.endY = e.clientY;

    const left = Math.min(this.startX, this.endX);
    const top = Math.min(this.startY, this.endY);
    const width = Math.abs(this.endX - this.startX);
    const height = Math.abs(this.endY - this.startY);

    this.selectionBox.style.left = left + 'px';
    this.selectionBox.style.top = top + 'px';
    this.selectionBox.style.width = width + 'px';
    this.selectionBox.style.height = height + 'px';
  }

  handleMouseUp(e) {
    if (!this.isSelecting || this.isElementMode) return;

    this.endX = e.clientX;
    this.endY = e.clientY;

    const width = Math.abs(this.endX - this.startX);
    const height = Math.abs(this.endY - this.startY);

    if (width > 10 && height > 10) {
      this.captureRegion();
    } else {
      this.cancelSelection();
    }
  }

  handleElementHover(e) {
    if (!this.isSelecting || !this.isElementMode) return;

    e.preventDefault();
    e.stopPropagation();

    // Remove previous highlight
    if (this.highlightedElement) {
      this.highlightedElement.remove();
    }

    // Create new highlight
    const rect = e.target.getBoundingClientRect();
    this.highlightedElement = document.createElement('div');
    this.highlightedElement.className = 'vai-element-highlight';
    this.highlightedElement.style.left = (rect.left + window.scrollX) + 'px';
    this.highlightedElement.style.top = (rect.top + window.scrollY) + 'px';
    this.highlightedElement.style.width = rect.width + 'px';
    this.highlightedElement.style.height = rect.height + 'px';

    document.body.appendChild(this.highlightedElement);
  }

  handleElementClick(e) {
    if (!this.isSelecting || !this.isElementMode) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = e.target.getBoundingClientRect();
    this.startX = rect.left;
    this.startY = rect.top;
    this.endX = rect.right;
    this.endY = rect.bottom;

    this.captureRegion();
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.cancelSelection();
    }
  }

  async captureRegion() {
    const left = Math.min(this.startX, this.endX);
    const top = Math.min(this.startY, this.endY);
    const width = Math.abs(this.endX - this.startX);
    const height = Math.abs(this.endY - this.startY);

    // Remove overlay before capturing
    this.removeOverlay();

    // Wait a bit for overlay to be removed, then capture
    await this.sleep(100);

    try {
      const response = await this.captureTab();
      if (response.error) {
        this.showError('Screenshot capture failed: ' + response.error);
        return;
      }

      // Crop the image to the selected region
      const croppedDataUrl = await this.cropImage(response.dataUrl, left, top, width, height);
      this.showAIDialog(croppedDataUrl);
    } catch (error) {
      this.showError('Failed to capture region: ' + error.message);
    }
  }

  async cropImage(dataUrl, left, top, width, height) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate device pixel ratio for high DPI displays
        const dpr = window.devicePixelRatio || 1;
        const scaledLeft = left * dpr;
        const scaledTop = top * dpr;
        const scaledWidth = width * dpr;
        const scaledHeight = height * dpr;

        canvas.width = scaledWidth;
        canvas.height = scaledHeight;

        ctx.drawImage(
          img,
          scaledLeft, scaledTop, scaledWidth, scaledHeight,
          0, 0, scaledWidth, scaledHeight
        );

        resolve(canvas.toDataURL('image/png'));
      };

      img.src = dataUrl;
    });
  }

  cancelSelection() {
    this.removeOverlay();
  }

  removeOverlay() {
    this.isSelecting = false;
    this.isElementMode = false;
    this.startX = this.startY = this.endX = this.endY = null;

    // Remove event listeners
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('mouseover', this.handleElementHover);
    document.removeEventListener('click', this.handleElementClick);
    document.removeEventListener('keydown', this.handleKeyDown);

    // Remove DOM elements
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    if (this.highlightedElement && this.highlightedElement.parentNode) {
      this.highlightedElement.parentNode.removeChild(this.highlightedElement);
    }
    if (this.instruction && this.instruction.parentNode) {
      this.instruction.parentNode.removeChild(this.instruction);
    }

    this.overlay = null;
    this.selectionBox = null;
    this.highlightedElement = null;
    this.instruction = null;
  }

  showInstruction(text, duration = 3000) {
    // Remove existing instruction
    if (this.instruction && this.instruction.parentNode) {
      this.instruction.parentNode.removeChild(this.instruction);
    }

    this.instruction = document.createElement('div');
    this.instruction.className = 'vai-instruction';
    this.instruction.innerHTML = text;
    document.body.appendChild(this.instruction);

    if (duration > 0) {
      setTimeout(() => {
        if (this.instruction && this.instruction.parentNode) {
          this.instruction.parentNode.removeChild(this.instruction);
          this.instruction = null;
        }
      }, duration);
    }
  }

  showError(message) {
    this.showInstruction(`❌ ${message}`, 5000);
    console.error('VisionAI Error:', message);
  }

  async captureTab() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'captureTab' }, resolve);
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProviderName(provider) {
    const names = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google AI'
    };
    return names[provider] || provider;
  }

  showAIDialog(imageData) {
    const dialog = document.createElement('div');
    dialog.className = 'vai-ai-dialog';

    // Preset prompts for comprehensive image analysis
    const presets = [
      'Describe this image in detail',
      'Extract and read all text (OCR)',
      'Analyze data/charts/graphs',
      'Explain the UI/interface elements',
      'Identify objects and people',
      'Analyze colors and design',
      'Find issues or problems',
      'Compare elements or sections',
      'Explain the workflow/process',
      'Summarize key insights'
    ];

    dialog.innerHTML = `
      <div class="vai-dialog-header">
        <h3 class="vai-dialog-title">AI Image Analysis</h3>
        <img src="${imageData}" class="vai-screenshot-preview" alt="Screenshot">
      </div>
      <div class="vai-dialog-content">
        <div class="vai-input-group">
          <label class="vai-input-label">Quick Prompts</label>
          <div class="vai-presets">
            ${presets.map(preset => `<button class="vai-preset" data-prompt="${preset}">${preset}</button>`).join('')}
          </div>
        </div>

        <div class="vai-input-group">
          <label class="vai-input-label" for="questionInput">Custom Question (optional)</label>
          <textarea id="questionInput" class="vai-textarea"
                    placeholder="Ask anything about this image: analyze graphs, read text, identify objects, explain UI elements, compare sections, find patterns, etc..."></textarea>
        </div>

        <div class="vai-button-group">
          <button id="analyzeBtn" class="vai-button vai-button-primary">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            Analyze with AI
          </button>
          <button id="cancelBtn" class="vai-button vai-button-secondary">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            Cancel
          </button>
        </div>

        <div id="loading" class="vai-loading" style="display: none;">
          <div class="vai-spinner"></div>
          <div>Analyzing image with AI...</div>
        </div>

        <div id="result" class="vai-result" style="display: none;"></div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Ensure dialog fits within viewport after it's added to DOM
    setTimeout(() => {
      this.adjustDialogSize(dialog);
    }, 50);

    // Get elements
    const textarea = dialog.querySelector('#questionInput');
    const analyzeBtn = dialog.querySelector('#analyzeBtn');
    const cancelBtn = dialog.querySelector('#cancelBtn');
    const result = dialog.querySelector('#result');
    const loading = dialog.querySelector('#loading');
    const presetBtns = dialog.querySelectorAll('.vai-preset');

    // Focus on textarea
    textarea.focus();

    // Handle preset buttons
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        textarea.value = btn.dataset.prompt;
        textarea.focus();
      });
    });

    // Handle keyboard shortcuts
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        analyzeBtn.click();
      }
    });

    // Handle analyze button
    analyzeBtn.addEventListener('click', async () => {
      const question = textarea.value.trim();

      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = `
        <div class="vai-spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
        Analyzing...
      `;
      loading.style.display = 'flex';
      result.style.display = 'none';

      try {
        // Get settings from new storage structure
        const storageData = await chrome.storage.sync.get([
          'defaultProvider', 'openaiKey', 'anthropicKey', 'googleKey'
        ]);

        const provider = storageData.defaultProvider || this.currentProvider || 'openai';
        const apiKey = storageData[provider + 'Key'];

        if (!apiKey) {
          throw new Error(`${this.getProviderName(provider)} API key not found. Please set it in the extension popup.`);
        }

        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'analyzeImage',
            imageData: imageData,
            question: question || 'Analyze this image comprehensively. Describe what you see including: visual elements, text content, data/charts/graphs, UI components, objects, people, colors, layout, design patterns, and overall purpose or context. Provide detailed insights about any data, trends, or key information presented.',
            apiKey: apiKey,
            provider: provider
          }, resolve);
        });

        // Hide loading with animation
        loading.style.animation = 'vai-fade-out 0.3s ease forwards';
        setTimeout(() => {
          loading.style.display = 'none';
          loading.style.animation = '';
        }, 300);

        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Analyze with AI
        `;

        if (response.success) {
          // Convert markdown to HTML for better display
          result.innerHTML = this.markdownToHtml(response.response);
          result.className = 'vai-result';

          // Add continue/again button after successful analysis
          this.addContinueButton(dialog);

          // Scroll to show continue buttons
          setTimeout(() => {
            const dialogContent = dialog.querySelector('.vai-dialog-content');
            if (dialogContent) {
              dialogContent.scrollTop = dialogContent.scrollHeight;
            }
          }, 300);
        } else {
          result.innerHTML = `<div class="vai-error-message">❌ ${response.error}</div>`;
          result.className = 'vai-result vai-error';
        }
        result.style.display = 'block';

      } catch (error) {
        // Hide loading with animation
        loading.style.animation = 'vai-fade-out 0.3s ease forwards';
        setTimeout(() => {
          loading.style.display = 'none';
          loading.style.animation = '';
        }, 300);

        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Analyze with AI
        `;
        result.innerHTML = `<div class="vai-error-message">❌ ${error.message}</div>`;
        result.className = 'vai-result vai-error';
        result.style.display = 'block';
      }
    });

    // Handle cancel button
    cancelBtn.addEventListener('click', () => {
      this.closeDialog(dialog);
    });

    // Handle escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeDialog(dialog);
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  closeDialog(dialog) {
    if (dialog && dialog.parentNode) {
      dialog.style.animation = 'vai-scale-out 0.3s ease forwards';
      setTimeout(() => {
        if (dialog.parentNode) {
          dialog.parentNode.removeChild(dialog);
        }
      }, 300);
    }
  }

  // Convert markdown to HTML for better display
  markdownToHtml(markdown) {
    return markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="vai-h3">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="vai-h2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="vai-h1">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong class="vai-bold">$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em class="vai-italic">$1</em>')
      // Code blocks
      .replace(/```([\s\S]*?)```/g, '<pre class="vai-code-block"><code>$1</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="vai-inline-code">$1</code>')
      // Lists
      .replace(/^\* (.*$)/gim, '<li class="vai-list-item">$1</li>')
      .replace(/^- (.*$)/gim, '<li class="vai-list-item">$1</li>')
      // Line breaks
      .replace(/\n\n/g, '</p><p class="vai-paragraph">')
      .replace(/\n/g, '<br>')
      // Wrap in paragraph if not already wrapped
      .replace(/^(?!<[h|l|p|d])/, '<p class="vai-paragraph">')
      .replace(/(?!<\/[h|l|p|d])$/, '</p>')
      // Clean up empty paragraphs
      .replace(/<p class="vai-paragraph"><\/p>/g, '');
  }

  // Add continue/again button after successful analysis
  addContinueButton(dialog) {
    const existingButton = dialog.querySelector('.vai-continue-section');
    if (existingButton) return; // Don't add multiple buttons

    const continueSection = document.createElement('div');
    continueSection.className = 'vai-continue-section';
    continueSection.innerHTML = `
      <div class="vai-continue-divider"></div>
      <div class="vai-continue-buttons">
        <button class="vai-button vai-button-primary vai-continue-btn" data-action="again">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
          </svg>
          Take Another Screenshot
        </button>
        <button class="vai-button vai-button-secondary vai-continue-btn" data-action="new-question">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Ask Different Question
        </button>
      </div>
    `;

    const dialogContent = dialog.querySelector('.vai-dialog-content');
    dialogContent.appendChild(continueSection);

    // Ensure dialog still fits after adding continue buttons
    this.adjustDialogSize(dialog);

    // Add event listeners for continue buttons
    const continueButtons = continueSection.querySelectorAll('.vai-continue-btn');
    continueButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'again') {
          this.closeDialog(dialog);
          // Trigger screenshot selection again
          setTimeout(() => {
            this.startRegionSelection();
          }, 400);
        } else if (action === 'new-question') {
          // Reset the dialog for a new question
          const result = dialog.querySelector('#result');
          const textarea = dialog.querySelector('#questionInput');
          const loading = dialog.querySelector('#loading');

          result.style.display = 'none';
          loading.style.display = 'none';
          continueSection.remove();
          textarea.focus();
          textarea.select();

          // Readjust dialog size after removing continue section
          this.adjustDialogSize(dialog);
        }
      });
    });
  }

  // Adjust dialog size to ensure it fits within viewport and buttons are visible
  adjustDialogSize(dialog) {
    // Wait for next frame to ensure DOM is updated
    requestAnimationFrame(() => {
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Reset any previous adjustments
      dialog.style.maxHeight = '';
      dialog.style.top = '';
      dialog.style.transform = '';

      const dialogRect = dialog.getBoundingClientRect();

      // Adjust width for smaller screens
      if (viewportWidth < 700) {
        dialog.style.width = '95vw';
        dialog.style.maxWidth = '95vw';
      }

      // If dialog is taller than 85% of viewport, adjust
      if (dialogRect.height > viewportHeight * 0.85) {
        const maxHeight = Math.floor(viewportHeight * 0.85);
        dialog.style.maxHeight = `${maxHeight}px`;

        // Ensure the dialog content can scroll properly
        const dialogContent = dialog.querySelector('.vai-dialog-content');
        if (dialogContent) {
          const header = dialog.querySelector('.vai-dialog-header');
          const headerHeight = header ? header.offsetHeight : 0;
          const contentMaxHeight = maxHeight - headerHeight - 60; // 60px for padding and margins
          dialogContent.style.maxHeight = `${contentMaxHeight}px`;
          dialogContent.style.overflowY = 'auto';

          // Add scroll indicator if content overflows
          setTimeout(() => {
            if (dialogContent.scrollHeight > dialogContent.clientHeight) {
              dialogContent.classList.add('has-scroll');
            } else {
              dialogContent.classList.remove('has-scroll');
            }
          }, 100);
        }
      }

      // Ensure dialog is centered and visible
      const updatedRect = dialog.getBoundingClientRect();
      if (updatedRect.bottom > viewportHeight - 20) {
        const newTop = Math.max(20, (viewportHeight - updatedRect.height) / 2);
        dialog.style.top = `${newTop}px`;
        dialog.style.left = '50%';
        dialog.style.transform = 'translateX(-50%)';
      } else {
        // Center the dialog
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
      }
    });
  }
}

// Initialize the Vision AI Pro system
let visionAI = null;

// Ensure we don't initialize multiple times
if (!window.visionAIInitialized) {
  window.visionAIInitialized = true;
  visionAI = new VisionAIPro();

  // Let the popup know we're ready
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'ping') {
        sendResponse({ status: 'ready' });
        return true;
      }
    });
  }
}

// This line is now handled above with proper initialization check