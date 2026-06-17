(function () {
    /* global LLMConfig, LinkedInDomKit */

    console.log('LinkedIn Job Assistant: Starting');
    LinkedInDomKit.init({ extId: 'lja' }).catch((err) => console.error('LJA dom kit init:', err));

let OPENAI_API_KEY = null;
let currentProfile = null;
let jobDescription = null;
let messageType = null;

async function getLlmSettings() {
    const result = await chrome.storage.sync.get([
        'llm_provider',
        'llm_api_key',
        'llm_model_id',
        'openai_api_key'
    ]);
    const provider = LLMConfig.normalizeProvider(result.llm_provider || 'openai');
    let apiKey = (result.llm_api_key || '').trim() || (result.openai_api_key || '').trim();
    let modelId = (result.llm_model_id || '').trim();
    if (!LLMConfig.isAllowedModel(provider, modelId)) {
        modelId = LLMConfig.defaultModel(provider);
    }
    return { apiKey, provider, modelId };
}

async function completeOpenAIJob(apiKey, model, prompt, maxTokens) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: maxTokens
        })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
        console.error('OpenAI API error:', data.error || data);
        return null;
    }
    const text = data.choices?.[0]?.message?.content;
    return text ? text.trim() : null;
}

async function completeGeminiJob(apiKey, model, prompt, maxTokens) {
    const url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(apiKey);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens }
        })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
        console.error('Gemini API error:', data.error || data);
        return null;
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
}

async function completeAnthropicJob(apiKey, model, prompt, maxTokens) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: Math.min(Math.max(maxTokens, 256), 2048),
            messages: [{ role: 'user', content: prompt }]
        })
    });
    const data = await response.json();
    if (!response.ok) {
        console.error('Anthropic API error:', data);
        return null;
    }
    const block = data.content?.find((b) => b.type === 'text');
    const text = block?.text;
    return text ? text.trim() : null;
}

if (!window.__ljaChromeListenerBound) {
    window.__ljaChromeListenerBound = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received in content script:', message);
    if (message.action === "toggleSidebar") {
        console.log('Toggle sidebar action received');
        const sidebar = document.getElementById('linkedin-assistant-sidebar');
        if (sidebar) {
            console.log('Toggling existing sidebar');
            sidebar.classList.toggle('hidden');
        } else {
            console.log('Creating new sidebar');
            createUI();
            checkAndInitialize(true);
        }
        sendResponse({ status: 'ok' });
        return true;
    }
    });
}

async function checkAndInitialize(showSidebar = true) {
    const sidebar = document.getElementById('linkedin-assistant-sidebar');
    if (!sidebar) return;
    if (showSidebar) sidebar.classList.remove('hidden');

    try {
        const settings = await getLlmSettings();
        OPENAI_API_KEY = settings.apiKey;

        if (!OPENAI_API_KEY) {
            OPENAI_API_KEY = await getApiKey();
        }
        attachEventListeners();
    } catch (error) {
        console.error('API key setup failed:', error);
    }
}

async function getApiKey() {
    try {
        const { apiKey } = await getLlmSettings();
        if (apiKey) {
            return apiKey;
        }

        chrome.runtime.sendMessage({ action: "openOptionsPage" });
        return null;
    } catch (error) {
        console.error('Error accessing storage:', error);
        return null;
    }
}

function showSidebarContent() {
    const sidebar = document.getElementById('linkedin-assistant-sidebar');
    if (sidebar) {
        sidebar.classList.remove('hidden');
        attachEventListeners();
    }
}

function createUI() {
    // Check for existing elements
    const existingSidebar = document.getElementById('linkedin-assistant-sidebar');
    const existingToggle = document.getElementById('assistant-toggle');
    
    if (existingSidebar || existingToggle) {
        console.log('UI elements already exist, removing old elements');
        existingSidebar?.remove();
        existingToggle?.remove();
    }

    // Create sidebar
    const sidebar = document.createElement('div');
    sidebar.id = 'linkedin-assistant-sidebar';
    sidebar.classList.add('hidden');

    // Create toggle container
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'toggle-container';
    toggleContainer.id = 'assistant-toggle';
    
    // Create toggle icon
    const toggleIcon = document.createElement('img');
    toggleIcon.className = 'toggle-icon';
    toggleIcon.src = chrome.runtime.getURL('images/icon-side-48.png');
    toggleContainer.appendChild(toggleIcon);

    // Set sidebar HTML content (Static skeleton, no variables)
    sidebar.innerHTML = `
    <div class="sidebar-header">
        <div class="header-content">
            <!-- Asset paths are resolved before DOM placement dynamically -->
            <img src="" alt="Icon" class="header-icon-img">
            <span>Job Assistant</span>
        </div>
    </div>
    <div class="sidebar-content">
        <div class="profile-section">
            <h3 class="section-title">Target Profile</h3>
            <div id="profile-info">Select a profile to analyze</div>
        </div>
        <div class="job-section">
            <h3 class="section-title">Job Description</h3>
            <textarea id="job-description" placeholder="Paste job description or URL here..."></textarea>
        </div>
        <div class="message-type-section">
            <h3 class="section-title">Message Type</h3>
            <select id="message-type" disabled>
                <option value="">Select message type...</option>
                <optgroup label="Responses">
                    <option value="refuse">Decline Opportunity</option>
                    <option value="more-info">Request More Information</option>
                    <option value="custom-response">Custom Response</option>
                </optgroup>
                <optgroup label="Connection Requests">
                    <option value="network">Extend Network</option>
                    <option value="job-interest">Job Interest</option>
                    <option value="info-request">Information Request</option>
                </optgroup>
                <optgroup label="InMail">
                    <option value="inmail-job">Job Application InMail</option>
                    <option value="inmail-info">Information Request InMail</option>
                </optgroup>
            </select>
        </div>
        <div id="context-section" class="context-section" style="display: none;">
            <h3 class="section-title">Additional Context</h3>
            <div class="context-description" id="context-description">
                Select a message type to provide additional context...
            </div>
            <textarea id="context-input" 
                class="context-textarea"
                placeholder="Add more context to help generate a better message..."></textarea>
        </div>
        <div id="message-section" class="message-section">
            <h3 class="section-title">Generated Message</h3>
            <textarea id="message-text" placeholder="Your message will appear here..."></textarea>
            <div class="button-group">
                <button id="regenerate-btn">Regenerate</button>
                <button id="copy-btn">Copy</button>
                <button id="send-btn">Send</button>
            </div>
        </div>
    </div>
`;

    // Add click handler to the header for closing
    const headerContent = sidebar.querySelector('.sidebar-header');
    headerContent.style.cursor = 'pointer';
    headerContent.addEventListener('click', () => {
        sidebar.classList.add('hidden');
        chrome.storage.sync.set({ 'sidebarHidden': true });
    });

    // Add toggle functionality for the icon
    toggleContainer.addEventListener('click', () => {
        sidebar.classList.remove('hidden');
        chrome.storage.sync.set({ 'sidebarHidden': false });
    });

    // Set actual static assets safely via src attribute
    const headerIconImg = sidebar.querySelector('.header-icon-img');
    if (headerIconImg) {
        headerIconImg.src = chrome.runtime.getURL('images/icon-48.png');
    }

    // Insert warning banner that will show up conditionally if API key is missing
    const warningBanner = document.createElement('div');
    warningBanner.id = 'api-warning';
    warningBanner.style.backgroundColor = '#FEF2F2';
    warningBanner.style.color = '#EF4444';
    warningBanner.style.padding = '10px';
    warningBanner.style.marginBottom = '10px';
    warningBanner.style.borderRadius = '4px';
    warningBanner.style.border = '1px solid #FCA5A5';
    warningBanner.style.textAlign = 'center';
    warningBanner.style.display = 'none'; // Hidden initially
    
    warningBanner.innerHTML = `
        <strong>API key missing</strong><br>
        <span style="font-size: 12px;">Open settings and add your OpenAI, Gemini, or Anthropic key.</span><br>
        <a href="#" id="open-settings-link" style="color: #DC2626; text-decoration: underline; font-weight: bold; margin-top: 5px; display: inline-block;">Open settings</a>
    `;
    sidebar.querySelector('.sidebar-content').prepend(warningBanner);

    // Add settings link handler
    warningBanner.querySelector('#open-settings-link').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ action: "openOptionsPage" });
    });

    // Append elements to body
    document.body.appendChild(sidebar);
    document.body.appendChild(toggleContainer);
    
    // Auto-check for API key warning once UI is placed
    setTimeout(showApiWarningIfMissing, 500);
}

async function showApiWarningIfMissing() {
    const { apiKey } = await getLlmSettings();
    const warningBanner = document.getElementById('api-warning');
    if (warningBanner) {
        if (!apiKey) {
            warningBanner.style.display = 'block';
        } else {
            warningBanner.style.display = 'none';
        }
    }
}

function attachEventListeners() {
    if (window.__recberryLJAListenersAttached) return;
    window.__recberryLJAListenersAttached = true;

    checkCurrentPage();
    setupUrlObserver();

    document.addEventListener('click', async (e) => {
        if (e.target.closest('#linkedin-assistant-sidebar, #assistant-toggle')) return;

        const profileSection = e.target.closest(
            '.entity-result__item, .reusable-search__result-container, .pv-top-card, [data-view-name="search-entity-result-universal-template"]'
        );
        if (profileSection) {
            const fromSearch =
                profileSection.matches('.entity-result__item, .reusable-search__result-container, [data-view-name="search-entity-result-universal-template"]');
            currentProfile = fromSearch
                ? extractProfileFromSearch(profileSection)
                : extractProfileFromPage(profileSection);
            updateProfileInfo();
            enableMessageGeneration();
        }
    });

    document.getElementById('job-description')?.addEventListener('input', (e) => {
        jobDescription = e.target.value;
        console.log('Job description updated:', jobDescription);
        enableMessageGeneration();
    });
    

        // Message type selection
        document.getElementById('message-type')?.addEventListener('change', async (e) => {
            console.log('Message type changed:', e.target.value); // Add this log
            messageType = e.target.value;
            
            const contextSection = document.getElementById('context-section');
            const contextInput = document.getElementById('context-input');
            const contextDescription = document.getElementById('context-description');
            const messageText = document.getElementById('message-text'); // Add this line
            
            const showContext = ['custom-response', 'inmail-job', 'inmail-info'].includes(e.target.value);
            contextSection.style.display = showContext ? 'block' : 'none';
            
            // Update context description and placeholder based on type
            if (e.target.value === 'custom-response') {
                contextDescription.textContent = "Write your message below and we'll enhance it while keeping your intent.";
                contextInput.placeholder = "Write your raw message here...";
            } else if (e.target.value === 'inmail-job') {
                contextDescription.textContent = "Help us personalize your message by explaining why you are a great fit.";
                contextInput.placeholder = "Describe your relevant experience and why you are excited about this role...";
            } else if (e.target.value === 'inmail-info') {
                contextDescription.textContent = "What specific information would you like to know about?";
                contextInput.placeholder = "List specific questions or areas you would like more information about...";
            }
    
            // Generate message if type is selected
            if (messageType) {
                if (showContext && !contextInput.value) {
                    // Wait for user to add context before generating for context-required types
                    messageText.value = "Add context above to generate your message...";
                } else {
                    await generateMessage();
                }
            }
            
            console.log('Message type selected:', messageType);
        });

        // Button handlers
        document.getElementById('regenerate-btn').addEventListener('click', async () => {
            const button = document.getElementById('regenerate-btn');
            button.disabled = true;
            button.textContent = 'Generating...';
            await generateMessage();
            button.disabled = false;
            button.textContent = 'Regenerate';
        });

        document.getElementById('copy-btn').addEventListener('click', () => copyMessageToClipboard());
        document.getElementById('send-btn').addEventListener('click', () => sendMessage());
    }

    function setupUrlObserver() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log('URL changed, checking page type...');
                checkCurrentPage();
            }
        }).observe(document, { subtree: true, childList: true });
    }

    async function checkCurrentPage() {
        if (location.href.includes('/in/')) {
            await waitForElement('.pv-top-card, main section.artdeco-card');
            await extractProfileData();
        }
    }

    function waitForElement(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    async function extractProfileData() {
        try {
            const selectors = {
                name: [
                    '.text-heading-xlarge',
                    'h1.inline.t-24',
                    '.inline-show-more-text strong',
                    '[data-field="name"]'
                ],
                title: [
                    '.text-body-medium',
                    '.ph5 .text-body-small',
                    '[data-field="headline"]',
                    '.top-card-layout__headline'
                ],
                company: [
                    '.pv-text-details__right-panel .inline-show-more-text',
                    '.experience-section .pv-entity__company-summary-info h3',
                    '[data-field="experience"]',
                    '.text-body-small.inline'
                ],
                about: ['.pv-about-section .inline-show-more-text', '#about', '[data-section="summary"]']
            };

            const profile = {};
            
            for (const [field, selectorList] of Object.entries(selectors)) {
                for (const selector of selectorList) {
                    const element = document.querySelector(selector);
                    if (element) {
                        profile[field] = element.textContent.trim();
                        break;
                    }
                }
            }

            if (profile.name) {
                console.log('Profile data found:', profile);
                currentProfile = profile;
                updateProfileInfo();
                enableMessageGeneration();
            }
        } catch (error) {
            console.error('Error extracting profile data:', error);
        }
    }

    function extractProfileFromSearch(profileSection) {
        const nameEl = LinkedInDomKit.findInContainer(profileSection, 'jobSearchName');
        const titleEl = LinkedInDomKit.findInContainer(profileSection, 'jobSearchSubtitle');
        const companyEl = LinkedInDomKit.findInContainer(profileSection, 'jobSearchCompany');
        return {
            name: nameEl?.textContent.trim(),
            title: titleEl?.textContent.trim(),
            company: companyEl?.textContent.trim()
        };
    }

    function extractProfileFromPage(profileSection) {
        const nameEl = LinkedInDomKit.findInContainer(profileSection, 'jobProfileName');
        const titleEl = LinkedInDomKit.findInContainer(profileSection, 'profileTitle');
        return {
            name: nameEl?.textContent.trim(),
            title:
                titleEl?.textContent.trim() ||
                profileSection.querySelector('.text-body-medium')?.textContent.trim() ||
                profileSection.querySelector('.top-card-layout__headline')?.textContent.trim(),
            company:
                profileSection.querySelector('.pv-text-details__left-panel ~ * .inline-show-more-text')
                    ?.textContent.trim() ||
                profileSection.querySelector('.inline-show-more-text')?.textContent.trim()
        };
    }

    function updateProfileInfo() {
        const profileInfo = document.getElementById('profile-info');
        if (profileInfo && currentProfile) {
            profileInfo.innerHTML = ''; // Safely clear out node structure
            
            const createInfoItem = (labelStr, valueStr) => {
                const containerDiv = document.createElement('div');
                containerDiv.className = 'profile-info-item';
                
                const labelStrong = document.createElement('strong');
                labelStrong.textContent = labelStr + ': ';
                containerDiv.appendChild(labelStrong);
                
                const valueText = document.createTextNode(valueStr);
                containerDiv.appendChild(valueText);
                
                return containerDiv;
            };

            profileInfo.appendChild(createInfoItem('Name', currentProfile.name || 'Not available'));

            if (currentProfile.title) {
                profileInfo.appendChild(createInfoItem('Title', currentProfile.title));
            }

            if (currentProfile.company) {
                profileInfo.appendChild(createInfoItem('Company', currentProfile.company));
            }
        }
    }

    function enableMessageGeneration() {
        const messageType = document.getElementById('message-type');
        const hasRequiredInfo = Boolean(
            (currentProfile && currentProfile.name) || 
            jobDescription
        );
        
        console.log('Enabling message generation:', {
            hasProfile: Boolean(currentProfile?.name),
            hasJobDescription: Boolean(jobDescription),
            currentJobDescription: jobDescription,
            enabled: hasRequiredInfo
        });

        messageType.disabled = !hasRequiredInfo;
        messageType.classList.toggle('disabled', !hasRequiredInfo);
    }

    async function generateMessage() {
        if (!messageType) return;
    
        const messageText = document.getElementById('message-text');
        messageText.value = 'Generating message...';
    
        try {
            if (!OPENAI_API_KEY) {
                OPENAI_API_KEY = await getApiKey();
                if (!OPENAI_API_KEY) {
                    messageText.value = 'Please set up your API key in extension settings.';
                    return;
                }
            }
    
            const prompt = createPrompt();
            const response = await callChatGPT(prompt);
            messageText.value = response || 'Failed to generate message. Please try again.';
        } catch (error) {
            console.error('Message generation failed:', error);
            messageText.value = 'Error generating message. Please try again.';
        }
    }

    function createPrompt() {
        const context = document.getElementById('context-input')?.value || '';
        const receivedMessage = jobDescription; 
        
        const basePrompts = {
            'refuse': `You are responding to this LinkedIn message: "${receivedMessage}"
                      Write a polite response to ${currentProfile?.name || 'the recruiter'} declining the job opportunity.
                      Keep it professional, courteous, and briefly explain why you're declining.
                      Consider potential future opportunities in your response.`,
            
            'more-info': `Regarding this message from ${currentProfile?.name || 'the recruiter'}: "${receivedMessage}"
                         Write a professional response requesting more specific details about the job opportunity.
                         Focus on key aspects that weren't covered in the original message.`,
            
            'custom-response': `Enhance this message while maintaining its core intent: "${context}"
                               Make it more professional and impactful while keeping the same meaning.
                               The message is for ${currentProfile?.name || 'the recruiter'} regarding: "${jobDescription}"`,
            
            'network': `I'd like to connect with ${currentProfile?.name || 'the professional'} who is ${currentProfile?.title || 'a professional'}.
                       Their profile includes these notable achievements and details: "${currentProfile?.about || ''}"
                       Write a personalized connection request (max 300 characters) that references something specific from their profile.
                       Make it genuine and professional.`,
            
            'job-interest': `Write a connection request (max 300 characters) to ${currentProfile?.name || 'the recruiter'}
                            regarding this job: "${jobDescription}"
                            Make it stand out by being specific about the role while remaining concise and professional.
                            Include a brief mention of relevant expertise or genuine interest.`,
            
            'info-request': `Write a connection request (max 300 characters) to ${currentProfile?.name || 'the professional'}
                            regarding: "${jobDescription}"
                            The message should specifically request more information about the role while being professional and concise.`,
            
            'inmail-job': `Write a detailed LinkedIn InMail to ${currentProfile?.name || 'the recruiter'} regarding this job: "${jobDescription}"
                          Include this personal context about why I'm a great fit: "${context}"
                          Make it compelling and specific to the role while highlighting relevant experience and genuine enthusiasm.`,
            
            'inmail-info': `Write a detailed LinkedIn InMail to ${currentProfile?.name || 'the professional'}
                           regarding this job: "${jobDescription}"
                           I'm specifically interested in knowing about: "${context}"
                           Make the request professional and specific while showing genuine interest in the role.`
        };

        return basePrompts[messageType];
    }

    async function callChatGPT(prompt) {
        const maxTokens = messageType?.includes('inmail') ? 400 : 150;
        try {
            const { apiKey, provider, modelId } = await getLlmSettings();
            if (!apiKey) return null;
            OPENAI_API_KEY = apiKey;

            if (provider === 'openai') {
                return completeOpenAIJob(apiKey, modelId, prompt, maxTokens);
            }
            if (provider === 'google') {
                return completeGeminiJob(apiKey, modelId, prompt, maxTokens);
            }
            if (provider === 'anthropic') {
                return completeAnthropicJob(apiKey, modelId, prompt, maxTokens);
            }
            return null;
        } catch (error) {
            console.error('LLM API call failed:', error);
            return null;
        }
    }

    function copyMessageToClipboard() {
        const messageText = document.getElementById('message-text');
        messageText.select();
        document.execCommand('copy');
        
        const copyBtn = document.getElementById('copy-btn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    }

    async function sendMessage() {
        const messageText = document.getElementById('message-text').value;
        if (!messageText) return;

        try {
            const messageInput = LinkedInDomKit.getComposer();
            if (!messageInput) throw new Error('Message input not found');

            messageInput.textContent = messageText;
            messageInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: messageText }));
            messageInput.dispatchEvent(new Event('input', { bubbles: true }));

            let sendButton = LinkedInDomKit.getSendButton();
            if (!sendButton || sendButton.disabled) {
                await new Promise((r) => setTimeout(r, 200));
                sendButton = LinkedInDomKit.getSendButton();
            }
            if (!sendButton) throw new Error('Send button not found');

            sendButton.click();
            
            // Reset UI after successful send
            document.getElementById('message-text').value = '';
            document.getElementById('message-type').value = '';
            document.getElementById('message-type').disabled = true;
            
            // Show success feedback
            const messageSection = document.getElementById('message-section');
            const successMessage = document.createElement('div');
            successMessage.className = 'success-message';
            successMessage.textContent = 'Message sent successfully!';
            messageSection.appendChild(successMessage);
            
            setTimeout(() => {
                successMessage.remove();
            }, 3000);
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please copy and paste manually.');
        }
    }


// Handle extension errors globally
window.addEventListener('error', (event) => {
    console.error('LinkedIn Job Assistant Error:', event.error);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('LinkedIn Job Assistant Unhandled Promise Rejection:', event.reason);
});

// Auto-initialize on load and when re-injected (LinkedIn SPA navigation)
(async function init() {
    if (!document.body) return;
    if (document.getElementById('linkedin-assistant-sidebar')) {
        return;
    }
    window.__recberryLJAListenersAttached = false;

    createUI();
    chrome.storage.sync.get(['sidebarHidden'], (result) => {
        const showSidebar = !result.sidebarHidden;
        checkAndInitialize(showSidebar);
    });
})();
})();
