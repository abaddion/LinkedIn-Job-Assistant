console.log('Background script loaded');

chrome.action.onClicked.addListener(async (tab) => {
    console.log('Icon clicked', tab.url);
    if (tab.url.includes('linkedin.com')) {
        console.log('Sending toggleSidebar message');
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: "toggleSidebar"
            });
            console.log('Message sent successfully');
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('LinkedIn Job Assistant installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openOptionsPage") {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    }
});

// Re-inject content script on LinkedIn SPA navigation (client-side routing).
// Content scripts only run on full page loads; LinkedIn navigates without reloads.
chrome.webNavigation.onHistoryStateUpdated.addListener(
    (details) => {
        if (details.tabId && details.url && details.url.includes('linkedin.com')) {
            chrome.scripting.executeScript({
                target: { tabId: details.tabId },
                files: ['linkedin-dom-kit.js', 'llm-config.js', 'content.js']
            }).catch(() => {});
            chrome.scripting.insertCSS({
                target: { tabId: details.tabId },
                files: ['content.css']
            }).catch(() => {});
        }
    },
    { url: [{ urlMatches: 'https://.*\\.linkedin\\.com/.*' }] }
);