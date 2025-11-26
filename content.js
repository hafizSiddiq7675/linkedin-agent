let isScraping = false;
const DEFAULT_PROMPT = 'You are a sales assistant. Analyze the following LinkedIn message. If the user is interested, asking for a meeting, or wants more info, reply "YES". If they are not interested, saying no, or it is a generic auto-reply, reply "NO". Reply ONLY with YES or NO.';

// Removed auto-start on page load - user will manually start from popup
console.log('Sales Nav Scraper: Content script loaded and ready.');

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
    // Try multiple selectors for LinkedIn message threads
    const selectors = [
        'li.msg-conversation-listitem',
        'li[class*="msg-conversation"]',
        'div[class*="msg-conversation-card"]',
        'li.conversation-list-item',
        'li[role="listitem"]'
    ];

    let potentialThreads = [];
    for (const selector of selectors) {
        potentialThreads = Array.from(document.querySelectorAll(selector));
        if (potentialThreads.length > 0) {
            console.log(`Found ${potentialThreads.length} threads using selector: ${selector}`);
            chrome.runtime.sendMessage({ action: 'LOG', message: `Scanning ${potentialThreads.length} message threads...` });
            break;
        }
    }

    if (potentialThreads.length === 0) {
        console.warn('No message threads found. Trying generic selector...');
        potentialThreads = Array.from(document.querySelectorAll('li, div[role="listitem"]'));
        console.log(`Found ${potentialThreads.length} elements with generic selector`);
    }

    const leads = [];

    // Get Settings
    const settings = await chrome.storage.sync.get(['aiProvider', 'apiKey', 'ollamaEndpoint', 'ollamaModel', 'customPrompt']);
    const prompt = settings.customPrompt || DEFAULT_PROMPT;

    console.log(`AI Provider: ${settings.aiProvider}`);

    if (!settings.aiProvider) {
        chrome.runtime.sendMessage({ action: 'LOG', message: 'Warning: No AI provider configured. Please configure in Settings.' });
        return leads;
    }

    let threadsAnalyzed = 0;
    let positiveFound = 0;

    for (const thread of potentialThreads) {
        // Get all text content
        const fullText = thread.innerText || '';
        if (!fullText || fullText.trim().length < 5) {
            console.log('Skipping thread: no text content');
            continue;
        }

        console.log('=== Thread HTML Sample ===');
        console.log(thread.outerHTML.substring(0, 300));
        console.log('=== Full Text ===');
        console.log(fullText);

        // Try multiple strategies to extract the message
        let lastMessage = '';
        let name = 'Unknown';

        // Strategy 1: Look for specific message preview elements
        const messagePreview = thread.querySelector('[class*="preview"]') ||
            thread.querySelector('[class*="message-preview"]') ||
            thread.querySelector('.truncate') ||
            thread.querySelector('p');

        if (messagePreview) {
            lastMessage = messagePreview.innerText?.trim() || '';
            console.log(`Strategy 1 (preview element): "${lastMessage}"`);
        }

        // Strategy 2: If no preview found, parse the text content
        if (!lastMessage) {
            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            console.log(`Found ${lines.length} lines in thread`);

            // Remove common UI elements (timestamps, status indicators)
            const cleanedLines = lines.filter(line => {
                // Filter out timestamps like "1h", "2d", etc.
                if (/^\d+[smhd]$/.test(line)) return false;
                // Filter out "You:", "Them:", etc.
                if (/^(You|Them):?$/i.test(line)) return false;
                // Filter out very short lines
                if (line.length < 3) return false;
                return true;
            });

            console.log(`After filtering: ${cleanedLines.length} lines`);
            console.log('Cleaned lines:', cleanedLines);

            // First line is usually the name
            if (cleanedLines.length > 0) {
                name = cleanedLines[0];
            }

            // Last non-empty line is usually the message preview
            if (cleanedLines.length > 1) {
                lastMessage = cleanedLines[cleanedLines.length - 1];
            }

            console.log(`Strategy 2 (text parsing): Name="${name}", Message="${lastMessage}"`);
        }

        // Extract name from link if we couldn't get it
        if (name === 'Unknown') {
            const nameElement = thread.querySelector('a') || thread.querySelector('[class*="name"]');
            if (nameElement) {
                name = nameElement.innerText?.trim() || 'Unknown';
            }
        }

        // Skip if message is too short or looks like UI element
        if (!lastMessage || lastMessage.length < 10) {
            console.log(`Skipping: message too short or empty (length: ${lastMessage.length})`);
            continue;
        }

        threadsAnalyzed++;
        console.log(`\n--- Analyzing thread ${threadsAnalyzed} ---`);
        console.log(`Name: ${name}`);
        console.log(`Message: "${lastMessage.substring(0, 100)}..."`);

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

                if (response && response.error) {
                    console.error('AI Analysis error:', response.error);
                    chrome.runtime.sendMessage({ action: 'LOG', message: `AI Error: ${response.error}` });
                } else if (response && response.isPositive) {
                    isPositive = true;
                }
            }

            console.log(`AI Result: ${isPositive ? 'POSITIVE' : 'NEGATIVE'}`);
        } catch (e) {
            console.error('AI Analysis failed:', e);
            chrome.runtime.sendMessage({ action: 'LOG', message: `Analysis error: ${e.message}` });
        }

        if (isPositive) {
            positiveFound++;
            const anchor = thread.querySelector('a');
            const profileUrl = anchor ? anchor.href : 'N/A';

            console.log(`✓ Positive lead found: ${name}`);
            chrome.runtime.sendMessage({ action: 'LOG', message: `✓ Found interested lead: ${name}` });

            leads.push({ name, profileUrl, lastMessage });
        }
    }

    console.log(`\n=== Scan Complete ===`);
    console.log(`Total threads found: ${potentialThreads.length}`);
    console.log(`Threads analyzed: ${threadsAnalyzed}`);
    console.log(`Positive leads: ${positiveFound}`);
    chrome.runtime.sendMessage({ action: 'LOG', message: `Scanned ${threadsAnalyzed} messages, found ${positiveFound} interested leads` });

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
    if (request.action === 'PING') {
        sendResponse({ status: 'ready' });
    } else if (request.action === 'START_SCRAPING') {
        if (!isScraping) {
            startAutomation();
            chrome.runtime.sendMessage({ action: 'SCRAPING_STARTED' });
            sendResponse({ status: 'started' });
        } else {
            sendResponse({ status: 'already_running' });
        }
    } else if (request.action === 'SCRAPE_CHATS') {
        if (!isScraping) {
            startChatScraping();
            chrome.runtime.sendMessage({ action: 'SCRAPING_STARTED' });
            sendResponse({ status: 'started' });
        } else {
            sendResponse({ status: 'already_running' });
        }
    } else if (request.action === 'STOP_SCRAPING') {
        isScraping = false;
        chrome.runtime.sendMessage({ action: 'SCRAPING_STOPPED' });
        sendResponse({ status: 'stopped' });
    }
    return true; // Keep channel open for async response
});

async function startChatScraping() {
    if (isScraping) return;
    isScraping = true;
    chrome.runtime.sendMessage({ action: 'LOG', message: 'Started scraping chats...' });

    let allChats = [];
    // Select the conversation list container for scrolling
    const listContainer = document.querySelector('.overflow-y-auto.overflow-hidden.flex-grow-1 ul.list-style-none')?.parentElement;

    // Use a Set to track processed conversations to handle infinite scroll
    const processedNames = new Set();
    let noNewItemsCount = 0;

    while (isScraping) {
        // Get all visible conversation items
        let conversationItems = Array.from(document.querySelectorAll('li.conversation-list-item'));

        if (conversationItems.length === 0) {
            conversationItems = Array.from(document.querySelectorAll('li[data-x-conversation-list-item]'));
        }

        if (conversationItems.length === 0) {
            chrome.runtime.sendMessage({ action: 'LOG', message: 'Error: No conversations found.' });
            break;
        }

        let newItemsFound = false;

        for (let i = 0; i < conversationItems.length; i++) {
            if (!isScraping) break;

            const item = conversationItems[i];

            // Updated Name Selector based on user feedback
            const nameElement = item.querySelector('.artdeco-entity-lockup__title') ||
                item.querySelector('[data-anonymize="person-name"]') ||
                item.querySelector('.conversation-list-item__title');

            let name = nameElement ? nameElement.innerText.trim() : 'Unknown';

            // Clean up name if it has extra whitespace or newlines
            name = name.replace(/\s+/g, ' ');

            if (processedNames.has(name)) {
                continue;
            }

            newItemsFound = true;
            processedNames.add(name);

            chrome.runtime.sendMessage({ action: 'LOG', message: `Scraping chat with: ${name}` });

            // Scroll the item into view to mimic human behavior
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 1000)); // Wait for scroll

            // Click the conversation to load messages
            const link = item.querySelector('a.conversation-list-item__link');
            if (link) {
                link.click();
                // Wait for messages to load
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000)); // Random delay 3-5s

                const chatData = await extractChatData(name);
                allChats.push(...chatData);

                // Save incrementally to storage
                await new Promise(resolve => {
                    chrome.storage.local.get(['scrapedChats', 'positiveLeads'], (result) => {
                        const current = result.scrapedChats || [];
                        const updated = [...current, ...chatData];

                        // Extract positive intent leads from this conversation
                        const positiveMessages = chatData.filter(msg =>
                            msg.intent === 'positive' && msg.sender !== 'You'
                        );

                        // Update positive leads storage
                        const currentPositiveLeads = result.positiveLeads || [];

                        if (positiveMessages.length > 0) {
                            // Get the most recent positive message for this contact
                            const latestPositive = positiveMessages[positiveMessages.length - 1];

                            // Check if this contact already exists in positive leads
                            const existingIndex = currentPositiveLeads.findIndex(
                                lead => lead.name === latestPositive.conversationWith
                            );

                            const newLead = {
                                name: latestPositive.conversationWith,
                                profileUrl: `https://www.linkedin.com/sales/people/${latestPositive.conversationWith}`, // Placeholder
                                lastMessage: latestPositive.message,
                                time: latestPositive.time,
                                intent: 'positive',
                                messageCount: positiveMessages.length
                            };

                            if (existingIndex >= 0) {
                                // Update existing lead
                                currentPositiveLeads[existingIndex] = newLead;
                            } else {
                                // Add new positive lead
                                currentPositiveLeads.push(newLead);
                            }
                        }

                        chrome.storage.local.set({
                            scrapedChats: updated,
                            positiveLeads: currentPositiveLeads
                        }, () => {
                            chrome.runtime.sendMessage({ action: 'CHATS_UPDATED', count: updated.length });
                            chrome.runtime.sendMessage({ action: 'POSITIVE_LEADS_UPDATED', count: currentPositiveLeads.length });
                            resolve();
                        });
                    });
                });
            }
        }

        if (!newItemsFound) {
            noNewItemsCount++;
            if (noNewItemsCount > 2) {
                chrome.runtime.sendMessage({ action: 'LOG', message: 'No new conversations found after scrolling.' });
                break; // Stop if we haven't found new items in a while
            }
        } else {
            noNewItemsCount = 0;
        }

        // Scroll down to load more
        if (listContainer) {
            chrome.runtime.sendMessage({ action: 'LOG', message: 'Scrolling down...' });
            listContainer.scrollBy({ top: 500, behavior: 'smooth' });
            await new Promise(r => setTimeout(r, 2000)); // Wait for scroll and load
        } else {
            break; // Can't scroll
        }
    }

    if (allChats.length > 0) {
        chrome.runtime.sendMessage({ action: 'LOG', message: `Scraping complete. ${allChats.length} messages extracted.` });
        chrome.runtime.sendMessage({ action: 'LOG', message: 'Click "Download" buttons in popup to export CSV.' });
    } else {
        chrome.runtime.sendMessage({ action: 'LOG', message: 'No messages found.' });
    }

    isScraping = false;
    chrome.runtime.sendMessage({ action: 'SCRAPING_STOPPED' });
}

async function extractChatData(conversationName) {
    const messages = [];
    // Select the message container
    const messageContainer = document.querySelector('.message-container-align');
    if (!messageContainer) return messages;

    // Select all message articles
    const articles = messageContainer.querySelectorAll('article');

    // Get AI settings
    const settings = await chrome.storage.sync.get(['aiProvider', 'apiKey', 'ollamaEndpoint', 'ollamaModel']);

    for (const article of articles) {
        const senderElement = article.querySelector('address');
        const sender = senderElement ? senderElement.innerText.trim() : conversationName;

        // Check if it's "You"
        const isYou = sender === 'You';
        const actualSender = isYou ? 'You' : conversationName;

        const contentElement = article.querySelector('.message-content');
        const content = contentElement ? contentElement.innerText.trim() : '';

        const timeElement = article.querySelector('time');
        const time = timeElement ? timeElement.getAttribute('datetime') : '';

        if (content) {
            let intent = 'neutral';

            // Only analyze messages from the other person (not your own messages)
            if (!isYou && settings.aiProvider) {
                try {
                    // Analyze intent using AI
                    const response = await chrome.runtime.sendMessage({
                        action: 'ANALYZE_TEXT',
                        text: content,
                        provider: settings.aiProvider,
                        apiKey: settings.apiKey,
                        ollamaEndpoint: settings.ollamaEndpoint,
                        ollamaModel: settings.ollamaModel,
                        prompt: 'Analyze this message sentiment'
                    });

                    if (response && !response.error) {
                        // Map AI response to intent
                        if (response.isPositive) {
                            intent = 'positive';
                        } else if (response.sentiment) {
                            intent = response.sentiment.toLowerCase();
                        } else {
                            intent = 'negative';
                        }
                    }
                } catch (e) {
                    console.error('Intent analysis failed:', e);
                    // Keep default 'neutral' on error
                }
            }

            messages.push({
                conversationWith: conversationName,
                sender: actualSender,
                message: content,
                time: time,
                intent: intent
            });
        }
    }

    return messages;
}

function downloadChatCSV(data) {
    const csvContent = "data:text/csv;charset=utf-8,"
        + "Conversation With,Sender,Message,Time\n"
        + data.map(e => `"${e.conversationWith}","${e.sender}","${e.message.replace(/"/g, '""')}","${e.time}"`).join("\n");

    const encodedUri = encodeURI(csvContent);

    // Send message to background script to handle download
    chrome.runtime.sendMessage({
        action: 'DOWNLOAD',
        url: encodedUri,
        filename: 'linkedin_chats.csv'
    }, (response) => {
        if (response && response.status === 'failed') {
            console.error('Download failed:', response.error);
        }
    });
}
