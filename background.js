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