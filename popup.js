document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const apiKeyInput = document.getElementById('apiKey');
    const fullScreenshotBtn = document.getElementById('fullScreenshot');
    const regionScreenshotBtn = document.getElementById('regionScreenshot');
    const elementScreenshotBtn = document.getElementById('elementScreenshot');
    const scrollScreenshotBtn = document.getElementById('scrollScreenshot');
    const historyBtn = document.getElementById('historyBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const themeToggle = document.getElementById('themeToggle');
    const status = document.getElementById('status');
    const providerBtns = document.querySelectorAll('.provider-btn');

    // State
    let currentProvider = 'openai';
    let currentTheme = 'light';

    // Initialize
    init();

    async function init() {
        await loadSettings();
        setupEventListeners();
        updateUI();
    }

    async function loadSettings() {
        const result = await chrome.storage.sync.get([
            'defaultProvider', 'openaiKey', 'anthropicKey', 'googleKey',
            'theme', 'animations', 'autoAnalyze'
        ]);

        // Load provider settings
        if (result.defaultProvider) {
            currentProvider = result.defaultProvider;
            updateProviderSelection();
            updatePlaceholder();
        }

        // Load API key for current provider
        const apiKey = result[currentProvider + 'Key'];
        if (apiKey) {
            apiKeyInput.value = apiKey;
        }

        // Load theme settings
        if (result.theme) {
            if (result.theme === 'auto') {
                currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            } else {
                currentTheme = result.theme;
            }
            applyTheme();
        }

        // Apply animations setting
        if (result.animations === false) {
            document.body.style.setProperty('--animation-duration', '0s');
        }
    }

    function setupEventListeners() {
        // API Key input
        apiKeyInput.addEventListener('input', debounce(saveApiKey, 500));

        // Provider selection
        providerBtns.forEach(btn => {
            btn.addEventListener('click', () => selectProvider(btn.dataset.provider));
        });

        // Theme toggle
        themeToggle.addEventListener('click', toggleTheme);

        // Screenshot buttons
        fullScreenshotBtn.addEventListener('click', () => takeScreenshot('full'));
        regionScreenshotBtn.addEventListener('click', () => takeScreenshot('region'));
        elementScreenshotBtn.addEventListener('click', () => takeScreenshot('element'));
        scrollScreenshotBtn.addEventListener('click', () => takeScreenshot('scroll'));

        // Quick actions
        historyBtn.addEventListener('click', showHistory);
        document.getElementById('helpBtn').addEventListener('click', showHelp);

        // Tab navigation
        setupTabNavigation();

        // Chat functionality
        setupChatInterface();

        // Settings functionality
        setupSettingsInterface();

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async function saveApiKey() {
        const settings = {};
        settings[currentProvider + 'Key'] = apiKeyInput.value;
        settings.defaultProvider = currentProvider;

        await chrome.storage.sync.set(settings);
        updateUI();
    }

    function selectProvider(provider) {
        currentProvider = provider;
        updateProviderSelection();
        saveApiKey();
        updatePlaceholder();
    }

    function updateProviderSelection() {
        providerBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.provider === currentProvider);
        });
    }

    function updatePlaceholder() {
        const placeholders = {
            openai: 'Enter OpenAI API key (sk-...)',
            anthropic: 'Enter Anthropic API key (sk-ant-...)',
            google: 'Enter Google AI API key'
        };
        apiKeyInput.placeholder = placeholders[currentProvider];
    }

    function toggleTheme() {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme();
        chrome.storage.sync.set({ theme: currentTheme });
    }

    function applyTheme() {
        document.body.setAttribute('data-theme', currentTheme);
        const icon = themeToggle.querySelector('svg');

        if (currentTheme === 'dark') {
            icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
        } else {
            icon.innerHTML = `<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>`;
        }
    }

    function updateUI() {
        const hasApiKey = apiKeyInput.value.trim().length > 0;
        const buttons = [fullScreenshotBtn, regionScreenshotBtn, elementScreenshotBtn, scrollScreenshotBtn];

        buttons.forEach(btn => {
            btn.disabled = !hasApiKey;
        });

        if (!hasApiKey) {
            setStatus('Enter your API key to start capturing screenshots', 'warning');
        } else {
            setStatus('Ready to capture and analyze screenshots', 'success');
        }
    }

    const setStatus = (message, type = 'info') => {
        status.textContent = message;
        status.className = `status ${type}`;
    };

    function checkApiKey() {
        if (!apiKeyInput.value.trim()) {
            setStatus(`Please enter your ${getProviderName()} API key first`, 'error');
            return false;
        }
        return true;
    }

    function getProviderName() {
        const names = {
            openai: 'OpenAI',
            anthropic: 'Anthropic',
            google: 'Google AI'
        };
        return names[currentProvider];
    }

    async function takeScreenshot(type) {
        if (!checkApiKey()) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Check if we can access the tab
            if (!tab || !tab.id) {
                throw new Error('Cannot access the current tab. Please refresh the page and try again.');
            }

            // Check if the tab URL is accessible
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
                throw new Error('Cannot capture screenshots on browser internal pages. Please navigate to a regular webpage.');
            }

            // Ensure we have activeTab permission for this tab
            try {
                await chrome.tabs.get(tab.id);
            } catch (permissionError) {
                throw new Error('Permission denied. Please refresh the page and try again.');
            }

            const actionMap = {
                full: 'takeFullScreenshot',
                region: 'startRegionSelect',
                element: 'startElementSelect',
                scroll: 'takeScrollScreenshot'
            };

            // Try to inject content script if it's not already there
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });

                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['content.css']
                });
            } catch (injectionError) {
                // Content script might already be injected, continue
                console.log('Content script injection:', injectionError.message);
            }

            // Wait a bit for content script to initialize
            await new Promise(resolve => setTimeout(resolve, 200));

            // Test if content script is ready
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            } catch (pingError) {
                throw new Error('Content script not ready. Please refresh the page and try again.');
            }

            await chrome.tabs.sendMessage(tab.id, {
                action: actionMap[type],
                provider: currentProvider
            });

            const messages = {
                full: 'Taking full page screenshot...',
                region: 'Select region on the page...',
                element: 'Click on element to capture...',
                scroll: 'Taking scrolling screenshot...'
            };

            setStatus(messages[type], 'success');

            // Close popup after a short delay for better UX
            setTimeout(() => window.close(), 500);

        } catch (error) {
            if (error.message.includes('Could not establish connection')) {
                setStatus('Please refresh the page and try again', 'error');
            } else {
                setStatus(`Error: ${error.message}`, 'error');
            }
            console.error('Screenshot error:', error);
        }
    }

    function handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'f':
                case 'F':
                    if (e.shiftKey) {
                        e.preventDefault();
                        takeScreenshot('full');
                    }
                    break;
                case 'r':
                case 'R':
                    if (e.shiftKey) {
                        e.preventDefault();
                        takeScreenshot('region');
                    }
                    break;
                case 'e':
                case 'E':
                    if (e.shiftKey) {
                        e.preventDefault();
                        takeScreenshot('element');
                    }
                    break;
            }
        }

        if (e.key === 'Escape') {
            window.close();
        }
    }

    function showHistory() {
        // TODO: Implement history view
        setStatus('History feature coming soon!', 'warning');
    }

    function showHelp() {
        chrome.tabs.create({ url: chrome.runtime.getURL('test.html') });
    }

    // Tab Navigation System
    function setupTabNavigation() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;

                // Update active tab button
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update active tab content
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === targetTab + '-tab') {
                        content.classList.add('active');
                    }
                });

                // Update status message
                if (targetTab === 'screenshot') {
                    setStatus('Ready to capture and analyze screenshots', 'success');
                } else if (targetTab === 'chat') {
                    setStatus('AI Chat ready - Ask me anything!', 'success');
                } else if (targetTab === 'settings') {
                    setStatus('Configure your preferences', 'success');
                    loadSettingsToPanel();
                }
            });
        });
    }

    // Chat Interface System
    function setupChatInterface() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendChatBtn');
        const chatMessages = document.getElementById('chatMessages');
        const chatPresets = document.querySelectorAll('.chat-preset');

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';

            // Enable/disable send button
            sendBtn.disabled = !chatInput.value.trim();
        });

        // Send message on Enter (Ctrl+Enter for new line)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.value.trim()) {
                    sendChatMessage();
                }
            }
        });

        // Send button click
        sendBtn.addEventListener('click', sendChatMessage);

        // Preset buttons
        chatPresets.forEach(preset => {
            preset.addEventListener('click', () => {
                chatInput.value = preset.dataset.prompt;
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
                sendBtn.disabled = false;
                chatInput.focus();
            });
        });

        async function sendChatMessage() {
            const message = chatInput.value.trim();
            if (!message) return;

            // Add user message to chat
            addChatMessage(message, 'user');

            // Clear input
            chatInput.value = '';
            chatInput.style.height = 'auto';
            sendBtn.disabled = true;

            // Show typing indicator
            const typingId = addTypingIndicator();

            try {
                // Check if API key exists for current provider
                if (!apiKeyInput.value.trim()) {
                    removeTypingIndicator(typingId);
                    addChatMessage(`Please enter your ${getProviderName()} API key first.`, 'ai');
                    return;
                }

                // Send to background script for AI processing
                const response = await chrome.runtime.sendMessage({
                    action: 'chatWithAI',
                    message: message,
                    provider: currentProvider
                });

                removeTypingIndicator(typingId);

                if (response.success) {
                    addChatMessage(response.response, 'ai');
                } else {
                    addChatMessage(`Error: ${response.error}`, 'ai', true);
                }

            } catch (error) {
                removeTypingIndicator(typingId);
                addChatMessage(`Error: ${error.message}`, 'ai', true);
            }
        }

        function addChatMessage(text, sender, isError = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${sender}-message`;

            const avatar = document.createElement('div');
            avatar.className = `${sender}-avatar`;
            avatar.textContent = sender === 'user' ? '👤' : '🤖';

            const content = document.createElement('div');
            content.className = 'message-content';

            const messageText = document.createElement('div');
            messageText.className = 'message-text';

            if (isError) {
                messageText.style.background = 'rgba(239, 68, 68, 0.1)';
                messageText.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                messageText.style.color = 'var(--error)';
            }

            // Convert markdown to HTML for AI responses
            if (sender === 'ai' && !isError) {
                messageText.innerHTML = markdownToHtml(text);
            } else {
                messageText.textContent = text;
            }

            const time = document.createElement('div');
            time.className = 'message-time';
            time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            content.appendChild(messageText);
            content.appendChild(time);
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(content);

            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function addTypingIndicator() {
            const typingDiv = document.createElement('div');
            const typingId = 'typing-' + Date.now();
            typingDiv.id = typingId;
            typingDiv.className = 'chat-message ai-message typing-indicator';

            typingDiv.innerHTML = `
                <div class="ai-avatar">🤖</div>
                <div class="message-content">
                    <div class="message-text">
                        <span>AI is thinking</span>
                        <div class="typing-dots">
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                            <div class="typing-dot"></div>
                        </div>
                    </div>
                </div>
            `;

            chatMessages.appendChild(typingDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return typingId;
        }

        function removeTypingIndicator(typingId) {
            const typingDiv = document.getElementById(typingId);
            if (typingDiv) {
                typingDiv.remove();
            }
        }

        // Simple markdown to HTML converter for chat
        function markdownToHtml(markdown) {
            return markdown
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code style="background: rgba(99, 102, 241, 0.1); padding: 2px 4px; border-radius: 3px;">$1</code>')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/^(?!<p)/, '<p>')
                .replace(/(?!<\/p>)$/, '</p>')
                .replace(/<p><\/p>/g, '');
        }
    }

    // Settings Interface System
    function setupSettingsInterface() {
        // Load settings when settings tab is opened
        loadSettingsToPanel();

        // Provider selection
        document.getElementById('settingsDefaultProvider').addEventListener('change', async (e) => {
            const newProvider = e.target.value;
            currentProvider = newProvider;
            updateProviderSelection();
            updatePlaceholder();

            // Load API key for new provider
            const settings = await chrome.storage.sync.get([newProvider + 'Key']);
            const apiKey = settings[newProvider + 'Key'] || '';
            apiKeyInput.value = apiKey;

            // Save provider preference
            await chrome.storage.sync.set({ defaultProvider: newProvider });
            setStatus(`Switched to ${getProviderName()}`, 'success');
        });

        // Theme selection
        document.getElementById('settingsTheme').addEventListener('change', async (e) => {
            const theme = e.target.value;
            await chrome.storage.sync.set({ theme: theme });

            if (theme === 'auto') {
                currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            } else {
                currentTheme = theme;
            }
            applyTheme();
            setStatus('Theme updated', 'success');
        });

        // Toggle switches
        setupToggleSwitch('settingsAnimations', 'animations', true);
        setupToggleSwitch('settingsSounds', 'soundEffects', false);
        setupToggleSwitch('settingsAutoAnalyze', 'autoAnalyze', false);
        setupToggleSwitch('settingsHighDPI', 'highDPI', true);
        setupToggleSwitch('settingsSaveLocal', 'saveLocally', false);

        // Test API key
        document.getElementById('testApiKeyBtn').addEventListener('click', async () => {
            const btn = document.getElementById('testApiKeyBtn');
            const originalText = btn.innerHTML;

            if (!apiKeyInput.value.trim()) {
                setStatus('Please enter an API key first', 'error');
                return;
            }

            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px;"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>Testing...';
            btn.disabled = true;

            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'testApiKey',
                    provider: currentProvider,
                    key: apiKeyInput.value.trim()
                });

                if (response.success) {
                    setStatus('✅ API key is valid!', 'success');
                } else {
                    setStatus('❌ API key test failed', 'error');
                }
            } catch (error) {
                setStatus('❌ Error testing API key', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });

        // Export settings
        document.getElementById('exportSettingsBtn').addEventListener('click', async () => {
            try {
                const settings = await chrome.storage.sync.get();
                const exportData = {
                    version: '2.0',
                    timestamp: new Date().toISOString(),
                    settings: settings
                };

                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vision-ai-pro-settings-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);

                setStatus('Settings exported successfully!', 'success');
            } catch (error) {
                setStatus('Error exporting settings', 'error');
            }
        });

        // Reset settings
        document.getElementById('resetSettingsBtn').addEventListener('click', async () => {
            if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                try {
                    await chrome.storage.sync.clear();

                    // Reset to defaults
                    currentProvider = 'openai';
                    currentTheme = 'auto';
                    apiKeyInput.value = '';

                    // Reload settings panel
                    loadSettingsToPanel();
                    updateProviderSelection();
                    updatePlaceholder();
                    applyTheme();

                    setStatus('Settings reset to defaults', 'success');
                } catch (error) {
                    setStatus('Error resetting settings', 'error');
                }
            }
        });
    }

    function setupToggleSwitch(elementId, settingKey, defaultValue) {
        const toggle = document.getElementById(elementId);

        toggle.addEventListener('click', async () => {
            toggle.classList.toggle('active');
            const isActive = toggle.classList.contains('active');

            const settings = {};
            settings[settingKey] = isActive;
            await chrome.storage.sync.set(settings);

            // Apply setting immediately
            if (settingKey === 'animations' && !isActive) {
                document.body.style.setProperty('--animation-duration', '0s');
            } else if (settingKey === 'animations' && isActive) {
                document.body.style.removeProperty('--animation-duration');
            }

            setStatus(`${settingKey} ${isActive ? 'enabled' : 'disabled'}`, 'success');
        });
    }

    async function loadSettingsToPanel() {
        try {
            const settings = await chrome.storage.sync.get([
                'defaultProvider', 'theme', 'animations', 'soundEffects',
                'autoAnalyze', 'highDPI', 'saveLocally'
            ]);

            // Set provider
            const providerSelect = document.getElementById('settingsDefaultProvider');
            if (providerSelect) {
                providerSelect.value = settings.defaultProvider || 'openai';
            }

            // Set theme
            const themeSelect = document.getElementById('settingsTheme');
            if (themeSelect) {
                themeSelect.value = settings.theme || 'auto';
            }

            // Set toggles
            setToggleState('settingsAnimations', settings.animations !== false);
            setToggleState('settingsSounds', settings.soundEffects === true);
            setToggleState('settingsAutoAnalyze', settings.autoAnalyze === true);
            setToggleState('settingsHighDPI', settings.highDPI !== false);
            setToggleState('settingsSaveLocal', settings.saveLocally === true);

        } catch (error) {
            console.error('Error loading settings to panel:', error);
        }
    }

    function setToggleState(elementId, isActive) {
        const toggle = document.getElementById(elementId);
        if (toggle) {
            if (isActive) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
        }
    }
});