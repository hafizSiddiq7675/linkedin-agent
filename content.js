let isScraping = false;
const DEFAULT_PROMPT = 'You are a sales assistant. Analyze the following LinkedIn message. If the user is interested, asking for a meeting, or wants more info, reply "YES". If they are not interested, saying no, or it is a generic auto-reply, reply "NO". Reply ONLY with YES or NO.';

window.addEventListener('load', () => {
    console.log('Sales Nav Scraper: Page loaded. Starting automation...');
    setTimeout(() => {
        startAutomation();
    }, 3000);
});

function startAutomation() {
    if (isScraping) return;
    isScraping = true;
    chrome.runtime.sendMessage({ action: 'LOG', message: 'Auto-started scraping...' });
    scrapeLoop();
}

async function scrapeLoop() {
    if (!isScraping) return;

    const newLeads = await scanVisibleThreads();

    if (newLeads.length > 0) {
        chrome.storage.local.get(['leads'], (result) => {
            const existing = result.leads || [];
            const uniqueNew = newLeads.filter(n => !existing.some(e => e.name === n.name && e.lastMessage === n.lastMessage));

            if (uniqueNew.length > 0) {
                const updated = [...existing, ...uniqueNew];
                chrome.storage.local.set({ leads: updated }, () => {
                    chrome.runtime.sendMessage({ action: 'LEADS_UPDATED', count: updated.length });
                });
            }
        });
    }

    const scrolled = await scrollDown();
    const delay = Math.floor(Math.random() * 3000) + 2000;
    await new Promise(r => setTimeout(r, delay));

    if (scrolled) {
        requestAnimationFrame(scrapeLoop);
    } else {
        console.log('Sales Nav Scraper: End of list.');
        chrome.runtime.sendMessage({ action: 'LOG', message: 'End of list reached.' });
        isScraping = false;
    }
}

async function scanVisibleThreads() {
    const potentialThreads = Array.from(document.querySelectorAll('li, div[role="listitem"]'));
    const leads = [];

    // Get Settings
    const settings = await chrome.storage.sync.get(['aiProvider', 'apiKey', 'ollamaEndpoint', 'ollamaModel', 'customPrompt']);
    const prompt = settings.customPrompt || DEFAULT_PROMPT;

    for (const thread of potentialThreads) {
        const text = thread.innerText;
        if (!text) continue;

        const lines = text.split('\n').filter(l => l.trim().length > 0);
        const lastMessage = lines.length > 1 ? lines[lines.length - 1] : '';

        if (!lastMessage) continue;

        // AI Analysis
        let isPositive = false;
        try {
            if (settings.aiProvider === 'chrome') {
                // Use local window.ai
                isPositive = await analyzeWithChromeAI(lastMessage, prompt);
            } else {
                // Use Background Script for others
                const response = await chrome.runtime.sendMessage({
                    action: 'ANALYZE_TEXT',
                    text: lastMessage,
                    provider: settings.aiProvider,
                    apiKey: settings.apiKey,
                    ollamaEndpoint: settings.ollamaEndpoint,
                    ollamaModel: settings.ollamaModel,
                    prompt: prompt
                });
                if (response && response.isPositive) {
                    isPositive = true;
                }
            }
        } catch (e) {
            console.error('AI Analysis failed:', e);
        }

        if (isPositive) {
            const name = lines[0] || 'Unknown';
            const anchor = thread.querySelector('a');
            const profileUrl = anchor ? anchor.href : 'N/A';

            leads.push({ name, profileUrl, lastMessage });
        }
    }
    return leads;
}

async function analyzeWithChromeAI(text, systemPrompt) {
    const fullPrompt = `${systemPrompt}\n\nMessage: "${text}"\n\nAnswer:`;
    if (!window.ai || !window.ai.languageModel) {
        console.warn('Chrome AI not available.');
        return false;
    }
    try {
        const session = await window.ai.languageModel.create();
        const result = await session.prompt(fullPrompt);
        return result.trim().toUpperCase().includes('YES');
    } catch (e) {
        console.error('Chrome AI Error:', e);
        return false;
    }
}

async function scrollDown() {
    const listItems = document.querySelectorAll('li, div[role="listitem"]');
    if (listItems.length === 0) return false;
    const container = listItems[0].parentElement;
    if (container) {
        const previousScrollTop = container.scrollTop;
        container.scrollTop += 500;
        await new Promise(r => setTimeout(r, 500));
        return container.scrollTop > previousScrollTop;
    }
    window.scrollBy(0, 500);
    return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'STOP_SCRAPING') {
        isScraping = false;
        sendResponse({ status: 'stopped' });
    }
});
