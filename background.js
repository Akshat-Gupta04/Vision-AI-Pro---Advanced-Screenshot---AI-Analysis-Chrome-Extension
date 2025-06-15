// Vision AI Pro - Enhanced Background Service Worker
// Supports multiple AI providers and advanced features

class VisionAIBackground {
  constructor() {
    this.setupMessageListener();
    this.setupContextMenus();
    this.setupKeyboardShortcuts();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'captureTab':
          this.captureTab(sendResponse);
          return true;
        case 'analyzeImage':
          this.analyzeImage(request, sendResponse);
          return true;
        default:
          return false;
      }
    });
  }

  setupContextMenus() {
    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'visionai-capture-full',
        title: 'Capture Full Page with AI',
        contexts: ['page']
      });

      chrome.contextMenus.create({
        id: 'visionai-capture-region',
        title: 'Capture Region with AI',
        contexts: ['page']
      });

      chrome.contextMenus.create({
        id: 'visionai-capture-element',
        title: 'Capture Element with AI',
        contexts: ['page']
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      const actionMap = {
        'visionai-capture-full': 'takeFullScreenshot',
        'visionai-capture-region': 'startRegionSelect',
        'visionai-capture-element': 'startElementSelect'
      };

      if (actionMap[info.menuItemId]) {
        chrome.tabs.sendMessage(tab.id, {
          action: actionMap[info.menuItemId]
        }).catch(error => {
          console.log('Context menu message error:', error);
        });
      }
    });
  }

  setupKeyboardShortcuts() {
    chrome.commands.onCommand.addListener((command) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const actionMap = {
            'capture-full': 'takeFullScreenshot',
            'capture-region': 'startRegionSelect',
            'capture-element': 'startElementSelect'
          };

          if (actionMap[command]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: actionMap[command]
            }).catch(error => {
              console.log('Keyboard shortcut message error:', error);
            });
          }
        }
      });
    });
  }

  captureTab(sendResponse) {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Capture error:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
  }

  async analyzeImage(request, sendResponse) {
    try {
      const { imageData, question, apiKey, provider = 'openai' } = request;

      if (!apiKey) {
        throw new Error('API key is required');
      }

      let response;
      switch (provider) {
        case 'openai':
          response = await this.analyzeWithOpenAI(imageData, question, apiKey);
          break;
        case 'anthropic':
          response = await this.analyzeWithAnthropic(imageData, question, apiKey);
          break;
        case 'google':
          response = await this.analyzeWithGoogle(imageData, question, apiKey);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${provider}`);
      }

      sendResponse({ success: true, response });
    } catch (error) {
      console.error('AI Analysis error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async analyzeWithOpenAI(imageData, question, apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: question || 'Analyze this image comprehensively. Describe what you see including: visual elements, text content, data/charts/graphs, UI components, objects, people, colors, layout, design patterns, and overall purpose or context. Provide detailed insights about any data, trends, or key information presented.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async analyzeWithAnthropic(imageData, question, apiKey) {
    // Convert data URL to base64
    const base64Data = imageData.split(',')[1];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: question || 'Analyze this image comprehensively. Describe what you see including: visual elements, text content, data/charts/graphs, UI components, objects, people, colors, layout, design patterns, and overall purpose or context. Provide detailed insights about any data, trends, or key information presented.'
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: base64Data
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async analyzeWithGoogle(imageData, question, apiKey) {
    // Convert data URL to base64
    const base64Data = imageData.split(',')[1];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: question || 'Analyze this image comprehensively. Describe what you see including: visual elements, text content, data/charts/graphs, UI components, objects, people, colors, layout, design patterns, and overall purpose or context. Provide detailed insights about any data, trends, or key information presented.'
              },
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1500
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Google AI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }
}

// Initialize the background service
new VisionAIBackground();