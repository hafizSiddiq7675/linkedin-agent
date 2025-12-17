let isScraping = false;
const DEFAULT_PROMPT = 'You are a sales assistant. Analyze the following LinkedIn message. If the user is interested, asking for a meeting, or wants more info, reply "YES". If they are not interested, saying no, or it is a generic auto-reply, reply "NO". Reply ONLY with YES or NO.';

// Update scraping status in storage
function updateScrapingState(scraping) {
    isScraping = scraping;
    chrome.storage.local.set({ isCurrentlyScraping: scraping });
}

// ===== HUMAN-LIKE BEHAVIOR HELPERS =====

// Random delay to mimic human behavior (doubled timings: 3-6 seconds default)
async function humanDelay(min = 3000, max = 6000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
}

// Wait for chat to load with verification (increased timeout to 10s)
// Wait for chat to load with verification (increased timeout to 10s)
async function waitForChatToLoad(maxWait = 10000, expectedName = null) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        // Check if messages are present
        const messages = document.querySelectorAll('li article.relative, li.message-item');

        // Check if the correct chat is loaded by verifying the header name
        let nameMatch = true;
        if (expectedName) {
            // Default to false - we MUST find the header to confirm match
            nameMatch = false;

            // Selectors based on user provided HTML
            const headerNameElement = document.querySelector('span[data-anonymize="person"]') ||
                document.querySelector('span[data-anonymize="person-name"]') ||
                document.querySelector('.msg-entity-lockup__entity-title') ||
                document.querySelector('.msg-thread__entity-name');

            if (headerNameElement) {
                const headerName = headerNameElement.innerText.trim();
                // Simple fuzzy match: check if one includes the other
                if (headerName.toLowerCase().includes(expectedName.toLowerCase()) ||
                    expectedName.toLowerCase().includes(headerName.toLowerCase())) {
                    nameMatch = true;
                } else {
                    // console.log(`Name mismatch. Expected: ${expectedName}, Found: ${headerName}`);
                }
            } else {
                // console.log('Header name element not found');
            }
        }

        if (messages.length > 0 && nameMatch) {
            chrome.runtime.sendMessage({
                action: 'LOG',
                message: `✓ Chat loaded for ${expectedName || 'Unknown'} with ${messages.length} messages`
            });
            return true;
        }

        // Wait a bit and check again
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Timeout - chat didn't load
    chrome.runtime.sendMessage({
        action: 'LOG',
        message: '⚠ Warning: Chat failed to load within timeout'
    });
    return false;
}

// Scroll chat view to load all messages (handles lazy loading)
async function scrollChatToLoadAllMessages() {
    // Find the chat message container
    const chatContainer = document.querySelector('.msg-s-message-list-content, .msg-s-message-list__event-list');

    if (!chatContainer) {
        console.log('Chat container not found');
        return;
    }

    chrome.runtime.sendMessage({ action: 'LOG', message: '📜 Scrolling to load all messages...' });

    let previousScrollHeight = 0;
    let currentScrollHeight = chatContainer.scrollHeight;
    let scrollAttempts = 0;
    const maxAttempts = 15;

    // Scroll to top to load older messages (lazy loading)
    while (currentScrollHeight > previousScrollHeight && scrollAttempts < maxAttempts) {
        previousScrollHeight = currentScrollHeight;

        // Scroll to top with smooth behavior (human-like)
        chatContainer.scrollTo({
            top: 0,
            behavior: 'smooth'
        });

        // Random delay to simulate human reading (2-4 seconds - doubled)
        await humanDelay(4000, 6000);

        currentScrollHeight = chatContainer.scrollHeight;
        scrollAttempts++;
    }

    chrome.runtime.sendMessage({ action: 'LOG', message: `📜 Loaded messages (${scrollAttempts} scroll attempts)` });

    // Now scroll down to read through messages (human-like behavior)
    const totalHeight = chatContainer.scrollHeight;
    const viewportHeight = chatContainer.clientHeight;
    let currentPosition = 0;

    while (currentPosition < totalHeight) {
        // Random scroll amount (like a human reading)
        const scrollAmount = Math.floor(Math.random() * 200) + 150;
        currentPosition += scrollAmount;

        chatContainer.scrollTo({
            top: currentPosition,
            behavior: 'smooth'
        });

        // Random delay (doubled) to simulate reading
        await humanDelay(2000, 3000);
    }

    // Final scroll to bottom
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });

    await humanDelay(1500, 2500);
}

// Removed auto-start on page load - user will manually start from popup
console.log('Sales Nav Scraper: Content script loaded and ready.');

function startAutomation() {
    if (isScraping) return;
    updateScrapingState(true);
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
        chrome.runtime.sendMessage({ action: 'LOG', message: 'End of list reached. Scraping completed.' });
        chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETED' });
        updateScrapingState(false);
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
    const settings = await chrome.storage.sync.get(['aiProvider', 'apiKey', 'groqApiKey', 'groqModel', 'ollamaEndpoint', 'ollamaModel', 'customPrompt']);
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
                    apiKey: settings.aiProvider === 'groq' ? settings.groqApiKey : settings.apiKey,
                    groqModel: settings.groqModel,
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
        sendResponse({ status: 'ready', isScraping: isScraping });
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
            const updateAll = request.updateAll || false;
            startChatScraping(updateAll);
            chrome.runtime.sendMessage({ action: 'SCRAPING_STARTED' });
            sendResponse({ status: 'started' });
        } else {
            sendResponse({ status: 'already_running' });
        }
    } else if (request.action === 'STOP_SCRAPING') {
        updateScrapingState(false);
        chrome.runtime.sendMessage({ action: 'SCRAPING_STOPPED' });
        sendResponse({ status: 'stopped' });
    } else if (request.action === 'GET_STATUS') {
        sendResponse({ isScraping: isScraping });
    }
    return true; // Keep channel open for async response
});

// Handle "Load More" button in conversation list
async function handleLoadMoreButton() {
    try {
        // LinkedIn's actual "Load More" button selectors based on real HTML structure
        const loadMoreSelectors = [
            // Exact match for LinkedIn Sales Navigator
            'button[aria-label="Load older conversations"]',
            'button[aria-label*="Load older" i]',
            'button[aria-label*="load more" i]',
            'button[aria-label*="show more" i]',
            // Generic class-based selectors
            'button._button_ps32ck._secondary_ps32ck',
            'button._secondary_ps32ck',
            'button[class*="_secondary_"]',
            '.scaffold-finite-scroll__load-button',
            'button.scaffold-finite-scroll__load-button'
        ];

        let loadMoreButton = null;

        // Try each selector
        for (const selector of loadMoreSelectors) {
            try {
                loadMoreButton = document.querySelector(selector);

                if (loadMoreButton && loadMoreButton.offsetParent !== null) {
                    // Button found and visible - verify it contains "load more" text
                    const buttonText = loadMoreButton.textContent.toLowerCase();
                    if (buttonText.includes('load') && buttonText.includes('more')) {
                        break;
                    } else if (buttonText.includes('load') && buttonText.includes('older')) {
                        break;
                    }
                    // If text doesn't match, keep searching
                    loadMoreButton = null;
                }
            } catch (e) {
                // Selector might not be supported, continue
                continue;
            }
        }

        // Fallback: search all buttons for "Load more" or "Load older" text
        if (!loadMoreButton) {
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                const text = btn.textContent.toLowerCase().trim();
                if ((text.includes('load') && (text.includes('more') || text.includes('older'))) ||
                    (text === 'load more' || text === 'load older conversations')) {
                    if (btn.offsetParent !== null) { // Check visibility
                        loadMoreButton = btn;
                        break;
                    }
                }
            }
        }

        if (!loadMoreButton) {
            return false; // No Load More button found
        }

        chrome.runtime.sendMessage({ action: 'LOG', message: '🔍 Found "Load More" button, clicking...' });

        // Scroll button into view
        loadMoreButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await humanDelay(1500, 2500); // Wait for scroll

        // Click the button
        loadMoreButton.click();

        chrome.runtime.sendMessage({ action: 'LOG', message: '✓ Load More button clicked, waiting for conversations to load...' });

        // Wait longer for new conversations to load (LinkedIn can be slow)
        await humanDelay(4000, 6000);

        return true; // Successfully handled
    } catch (error) {
        console.error('Error handling Load More button:', error);
        return false;
    }
}

async function startChatScraping(updateAll = false) {
    if (isScraping) return;
    updateScrapingState(true);

    if (updateAll) {
        chrome.runtime.sendMessage({ action: 'LOG', message: '🔄 Updating all conversations with latest messages...' });
    } else {
        chrome.runtime.sendMessage({ action: 'LOG', message: 'Started scraping chats...' });
    }

    let allChats = [];
    // Select the conversation list container for scrolling
    const listContainer = document.querySelector('.overflow-y-auto.overflow-hidden.flex-grow-1 ul.list-style-none')?.parentElement;

    // Load already processed conversations from storage
    const processedNames = new Set();
    const storageData = await new Promise(resolve => {
        chrome.storage.local.get(['scrapedChats', 'processedConversations'], resolve);
    });

    // If NOT in updateAll mode, skip already-processed conversations (resume behavior)
    // If IN updateAll mode, re-scrape everything to catch new messages
    if (!updateAll && storageData.scrapedChats && storageData.scrapedChats.length > 0) {
        const existingConversations = [...new Set(storageData.scrapedChats.map(chat => chat.conversationWith))];
        existingConversations.forEach(name => processedNames.add(name));
        chrome.runtime.sendMessage({ action: 'LOG', message: `Resuming: ${processedNames.size} conversations already processed.` });
    } else if (updateAll && storageData.scrapedChats && storageData.scrapedChats.length > 0) {
        chrome.runtime.sendMessage({ action: 'LOG', message: `Re-scanning ${storageData.scrapedChats.length} existing conversations...` });
    }

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

            // Get profile URL
            const profileLink = item.querySelector('a[href*="/sales/people/"]');
            const profileUrl = profileLink ? profileLink.href : `https://www.linkedin.com/sales/people/${name}`;

            chrome.runtime.sendMessage({ action: 'LOG', message: `💬 Opening chat with: ${name}` });

            // Try scraping with retry logic (max 2 attempts)
            const conversationData = await scrapeConversationWithRetry(item, name, profileUrl, 2);

            if (!conversationData || conversationData.messages.length === 0) {
                chrome.runtime.sendMessage({ action: 'LOG', message: `⚠ Skipped ${name} (no messages found)` });
                continue;
            }

            // Add to allChats array for tracking
            allChats.push(conversationData);

            // Save incrementally to storage
            await new Promise(resolve => {
                chrome.storage.local.get(['scrapedChats', 'positiveLeads'], (result) => {
                    const current = result.scrapedChats || [];

                    // Check if this conversation already exists
                    const existingIndex = current.findIndex(
                        conv => conv.conversationWith === conversationData.conversationWith
                    );

                    if (existingIndex >= 0) {
                        // Conversation exists - Smart merge to avoid duplicates
                        const existingConversation = current[existingIndex];
                        const existingMessages = existingConversation.messages || [];
                        const newMessages = conversationData.messages || [];

                        // Create a Set of existing message signatures (sender|message|time)
                        const existingSignatures = new Set(
                            existingMessages.map(msg => `${msg.sender}|${msg.message}|${msg.time}`)
                        );

                        // Filter out duplicate messages from new data
                        const uniqueNewMessages = newMessages.filter(msg =>
                            !existingSignatures.has(`${msg.sender}|${msg.message}|${msg.time}`)
                        );

                        // Merge: keep existing + add only new unique messages
                        const mergedMessages = [...existingMessages, ...uniqueNewMessages];

                        // Sort by timestamp to maintain chronological order
                        mergedMessages.sort((a, b) => {
                            if (!a.time || !b.time) return 0;
                            return new Date(a.time) - new Date(b.time);
                        });

                        // Check if any message has positive intent
                        const hasPositiveIntent = mergedMessages.some(m =>
                            m.intent === 'positive' && m.sender !== 'You'
                        );

                        // Update conversation with merged messages
                        current[existingIndex] = {
                            ...conversationData,
                            messages: mergedMessages,
                            messageCount: mergedMessages.length,
                            hasPositiveIntent: hasPositiveIntent
                        };

                        if (uniqueNewMessages.length > 0) {
                            chrome.runtime.sendMessage({
                                action: 'LOG',
                                message: `📝 Updated ${conversationData.conversationWith}: +${uniqueNewMessages.length} new messages`
                            });
                        }
                    } else {
                        // New conversation - add it
                        current.push(conversationData);
                    }

                    // Update positive leads storage
                    const currentPositiveLeads = result.positiveLeads || [];

                    // Get the actual stored conversation (which has merged messages)
                    const storedConversation = current[existingIndex >= 0 ? existingIndex : current.length - 1];

                    if (storedConversation.hasPositiveIntent) {
                        // Get the most recent positive message from the merged conversation
                        const positiveMessages = storedConversation.messages.filter(msg =>
                            msg.intent === 'positive' && msg.sender !== 'You'
                        );

                        if (positiveMessages.length > 0) {
                            const latestPositive = positiveMessages[positiveMessages.length - 1];

                            // Check if this contact already exists in positive leads
                            const existingLeadIndex = currentPositiveLeads.findIndex(
                                lead => lead.name === storedConversation.conversationWith
                            );

                            const newLead = {
                                name: storedConversation.conversationWith,
                                profileUrl: storedConversation.profileUrl,
                                lastMessage: latestPositive.message,
                                time: latestPositive.time,
                                intent: 'positive',
                                messageCount: positiveMessages.length
                            };

                            if (existingLeadIndex >= 0) {
                                // Update existing lead
                                currentPositiveLeads[existingLeadIndex] = newLead;
                            } else {
                                // Add new positive lead
                                currentPositiveLeads.push(newLead);
                            }
                        }
                    }

                    chrome.storage.local.set({
                        scrapedChats: current,
                        positiveLeads: currentPositiveLeads
                    }, () => {
                        // Send conversation count (not total messages)
                        chrome.runtime.sendMessage({ action: 'CHATS_UPDATED', count: current.length });
                        chrome.runtime.sendMessage({ action: 'POSITIVE_LEADS_UPDATED', count: currentPositiveLeads.length });
                        resolve();
                    });
                });
            });
        }

        if (!newItemsFound) {
            noNewItemsCount++;
            if (noNewItemsCount > 2) {
                // Before stopping, check if there's a "Load More" button
                const loadMoreHandled = await handleLoadMoreButton();
                if (loadMoreHandled) {
                    // Reset counter if we successfully clicked Load More
                    noNewItemsCount = 0;
                    chrome.runtime.sendMessage({ action: 'LOG', message: '✓ Clicked Load More button, continuing scraping...' });
                    // Note: handleLoadMoreButton already waits, no need for extra delay
                    continue;
                } else {
                    chrome.runtime.sendMessage({ action: 'LOG', message: 'No new conversations found after scrolling.' });
                    break; // Stop if we haven't found new items in a while
                }
            }
        } else {
            noNewItemsCount = 0;
        }

        // Check for Load More button before scrolling
        const loadMoreFound = await handleLoadMoreButton();

        // Only scroll if we didn't just click Load More (to avoid redundant actions)
        if (!loadMoreFound) {
            // Scroll down to load more
            if (listContainer) {
                chrome.runtime.sendMessage({ action: 'LOG', message: 'Scrolling down...' });
                listContainer.scrollBy({ top: 500, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 2000)); // Wait for scroll and load
            } else {
                break; // Can't scroll
            }
        }
    }

    // Check if scraping was stopped manually or completed naturally
    if (!isScraping) {
        // User stopped manually - don't send SCRAPING_COMPLETED
        chrome.runtime.sendMessage({ action: 'LOG', message: `Scraping stopped. ${allChats.length} conversations scraped.` });
    } else {
        // Completed naturally
        if (allChats.length > 0) {
            const totalMessages = allChats.reduce((sum, conv) => sum + conv.messageCount, 0);
            chrome.runtime.sendMessage({ action: 'LOG', message: `Scraping complete. ${allChats.length} conversations (${totalMessages} total messages) extracted.` });
            chrome.runtime.sendMessage({ action: 'LOG', message: 'Click "Download" buttons in popup to export CSV.' });
        } else {
            chrome.runtime.sendMessage({ action: 'LOG', message: 'No messages found.' });
        }

        updateScrapingState(false);
        chrome.runtime.sendMessage({ action: 'SCRAPING_COMPLETED' });
    }
}

// Extract conversation name from chat window header (not list preview)
function extractConversationNameFromChatHeader() {
    try {
        // Multiple selectors for LinkedIn Sales Navigator chat header
        const headerSelectors = [
            // Main thread header selectors
            '.msg-thread__title-text',
            '.msg-overlay-conversation-bubble__title',
            '.msg-overlay-bubble-header__title',
            '.thread-subject-bar__title',
            '.msg-s-message-list-container__title',
            '[data-control-name="view_profile"] h2',
            '.msg-thread-title',
            // Fallback: artdeco entity in header
            '.msg-thread header .artdeco-entity-lockup__title',
            '.msg-overlay-bubble-header .artdeco-entity-lockup__title',
            // Generic header patterns
            'header h2.text-heading-large',
            'header h2.text-heading-medium',
            'header .msg-entity-lockup__entity-title'
        ];

        for (const selector of headerSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
                const name = element.textContent.trim();
                // Verify it's not empty and not a generic placeholder
                if (name && name.length > 0 && name !== 'Unknown' && !name.includes('Select a conversation')) {
                    console.log(`[Name Extraction] Found name from chat header: "${name}" using selector: ${selector}`);
                    return name;
                }
            }
        }

        // Fallback: Try to find any header with artdeco-entity-lockup__title
        const allTitles = document.querySelectorAll('.artdeco-entity-lockup__title');
        for (const title of allTitles) {
            // Check if this title is in a visible header area (not in the list)
            const parent = title.closest('.msg-overlay-bubble-header, .msg-thread header, header');
            if (parent) {
                const name = title.textContent.trim();
                if (name && name.length > 0 && name !== 'Unknown') {
                    console.log(`[Name Extraction] Found name from fallback header search: "${name}"`);
                    return name;
                }
            }
        }

        console.log('[Name Extraction] Could not find conversation name in chat header, will use list name as fallback');
        return null; // Return null to trigger fallback to list name
    } catch (error) {
        console.error('[Name Extraction] Error extracting name from chat header:', error);
        return null; // Return null to trigger fallback
    }
}

// Retry logic for scraping conversations
async function scrapeConversationWithRetry(conversationElement, name, profileUrl, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Scroll the item into view to mimic human behavior
            conversationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await humanDelay(3000, 5000); // Wait for scroll (doubled: was 800-1500ms)

            // Click the conversation to load messages
            const link = conversationElement.querySelector('a.conversation-list-item__link, a[href*="conversations"]');
            if (link) {
                link.click();
                chrome.runtime.sendMessage({ action: 'LOG', message: `🔄 Loading chat (attempt ${attempt}/${maxRetries})...` });

                // Wait for chat to load with verification (increased to 12s)
                const loaded = await waitForChatToLoad(12000, name);

                if (!loaded && attempt < maxRetries) {
                    chrome.runtime.sendMessage({ action: 'LOG', message: `⚠ Chat failed to load, retrying...` });
                    await humanDelay(2000, 4000); // Retry delay (doubled: was 1000-2000ms)
                    continue;
                }

                if (!loaded) {
                    chrome.runtime.sendMessage({ action: 'LOG', message: `❌ Chat failed to load after ${maxRetries} attempts` });
                    return null;
                }

                // Scroll chat view to load all messages (handles lazy loading)
                await scrollChatToLoadAllMessages();

                // Extract the actual conversation name from the chat window header
                const actualConversationName = extractConversationNameFromChatHeader();
                const finalName = actualConversationName || name; // Fallback to list name if header not found

                // Log name extraction result for debugging
                if (actualConversationName && actualConversationName !== name) {
                    chrome.runtime.sendMessage({
                        action: 'LOG',
                        message: `📝 Using chat header name: "${actualConversationName}" (list showed: "${name}")`
                    });
                } else if (!actualConversationName) {
                    chrome.runtime.sendMessage({
                        action: 'LOG',
                        message: `📝 Using list name: "${name}" (header not found)`
                    });
                }

                // Extract messages with the actual conversation name
                const conversationData = await extractChatData(finalName, profileUrl);

                if (conversationData && conversationData.messages.length > 0) {
                    chrome.runtime.sendMessage({ action: 'LOG', message: `✅ Extracted ${conversationData.messages.length} messages from ${finalName}` });

                    // Random delay before next conversation (4-8 seconds - doubled)
                    await humanDelay(4000, 8000);

                    return conversationData;
                }

                if (attempt < maxRetries) {
                    chrome.runtime.sendMessage({ action: 'LOG', message: `⚠ No messages found, retrying...` });
                    await humanDelay(3000, 5000); // No messages retry (doubled: was 1500-2500ms)
                }
            }
        } catch (error) {
            chrome.runtime.sendMessage({ action: 'LOG', message: `❌ Error: ${error.message}` });
            if (attempt < maxRetries) {
                await humanDelay(4000, 6000); // Error retry (doubled: was 2000-3000ms)
            }
        }
    }

    chrome.runtime.sendMessage({ action: 'LOG', message: `⚠ Skipping ${name} after ${maxRetries} failed attempts` });
    return null;
}

async function extractChatData(conversationName, profileUrl) {
    const messages = [];

    // Find the VISIBLE message container
    let messageContainer = null;
    const potentialContainers = document.querySelectorAll('.message-container-align, ul.list-style-none');

    for (const container of potentialContainers) {
        // Check if it has message articles and is visible
        if (container.querySelector('article') && container.offsetParent !== null) {
            messageContainer = container;
            break;
        }
    }

    if (!messageContainer) {
        console.log('No visible message container found');
        // Return an object consistent with the original function's return type
        return { conversationWith: conversationName, profileUrl: profileUrl, messages: [], hasPositiveIntent: false, messageCount: 0 };
    }

    // Select all message articles
    const articles = messageContainer.querySelectorAll('article');

    // Get AI settings
    const settings = await chrome.storage.sync.get(['aiProvider', 'apiKey', 'groqApiKey', 'groqModel', 'ollamaEndpoint', 'ollamaModel']);

    let hasPositiveIntent = false;

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
                        apiKey: settings.aiProvider === 'groq' ? settings.groqApiKey : settings.apiKey,
                        groqModel: settings.groqModel,
                        ollamaEndpoint: settings.ollamaEndpoint,
                        ollamaModel: settings.ollamaModel,
                        prompt: 'Analyze this message sentiment'
                    });

                    if (response && !response.error) {
                        // Map AI response to intent
                        if (response.isPositive) {
                            intent = 'positive';
                            hasPositiveIntent = true;
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
                sender: actualSender,
                message: content,
                time: time,
                intent: intent
            });
        }
    }

    return {
        conversationWith: conversationName,
        profileUrl: profileUrl,
        messages: messages,
        hasPositiveIntent: hasPositiveIntent,
        messageCount: messages.length
    };
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
