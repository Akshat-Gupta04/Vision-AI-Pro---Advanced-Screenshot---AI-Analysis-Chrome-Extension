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
            'apiKey', 'provider', 'theme', 'settings'
        ]);

        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }

        if (result.provider) {
            currentProvider = result.provider;
            updateProviderSelection();
        }

        if (result.theme) {
            currentTheme = result.theme;
            applyTheme();
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
        document.getElementById('settingsBtn').addEventListener('click', showSettings);
        document.getElementById('helpBtn').addEventListener('click', showHelp);

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
        await chrome.storage.sync.set({
            apiKey: apiKeyInput.value,
            provider: currentProvider
        });
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

    function showSettings() {
        chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    }

    function showHelp() {
        chrome.tabs.create({ url: chrome.runtime.getURL('test.html') });
    }
});