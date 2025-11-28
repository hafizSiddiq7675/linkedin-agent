document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const scrapeChatsBtn = document.getElementById('scrapeChatsBtn');
  const openCrmBtn = document.getElementById('openCrmBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadChatsBtn = document.getElementById('downloadChatsBtn');
  const downloadPositiveBtn = document.getElementById('downloadPositiveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusSpan = document.getElementById('status');
  const countSpan = document.getElementById('count');
  const chatCountSpan = document.getElementById('chatCount');
  const positiveCountSpan = document.getElementById('positiveCount');
  const logDiv = document.getElementById('log');

  let isRunning = false;
  let isPaused = false;
  let lastScrapingType = null; // Track what type of scraping was running

  function log(msg) {
    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    p.style.margin = '2px 0';
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function updateUI() {
    chrome.storage.local.get(['leads', 'scrapedChats', 'positiveLeads'], (result) => {
      const conversations = result.scrapedChats || [];
      // Show number of conversations (not total messages)
      if (chatCountSpan) chatCountSpan.textContent = conversations.length;
      if (downloadChatsBtn) downloadChatsBtn.disabled = conversations.length === 0;

      // Get positive leads count from storage and show in "Leads" field
      const positiveLeads = result.positiveLeads || [];
      countSpan.textContent = positiveLeads.length;
      downloadBtn.disabled = positiveLeads.length === 0;

      if (positiveCountSpan) positiveCountSpan.textContent = positiveLeads.length;

      // Count positive intent messages from other users for download button
      let positiveMessageCount = 0;
      conversations.forEach(conv => {
        if (conv.messages && Array.isArray(conv.messages)) {
          positiveMessageCount += conv.messages.filter(msg => msg.intent === 'positive' && msg.sender !== 'You').length;
        }
      });
      if (downloadPositiveBtn) downloadPositiveBtn.disabled = positiveMessageCount === 0;
    });
  }

  function updateScrapingStatus(running, status = 'idle') {
    // status can be: 'idle', 'scraping', 'stopped', 'completed'
    isRunning = running;

    // Save status to storage for persistence
    chrome.storage.local.set({ scrapingStatus: status });

    startBtn.disabled = running || (status !== 'idle' && status !== 'completed');
    stopBtn.disabled = !running;

    if (scrapeChatsBtn) {
      scrapeChatsBtn.disabled = running || (status !== 'idle' && status !== 'completed');
    }

    // Show/hide resume button - ONLY for stopped status
    if (status === 'stopped') {
      resumeBtn.style.display = 'inline-block';
      resumeBtn.disabled = false;
      statusSpan.textContent = 'Stopped';
    } else {
      resumeBtn.style.display = 'none';
      resumeBtn.disabled = true;

      if (status === 'completed') {
        statusSpan.textContent = 'Completed';
      } else {
        statusSpan.textContent = running ? 'Scraping...' : 'Idle';
      }
    }
  }

  // Initial Load - Restore state from storage and check actual scraping status
  updateUI();

  // First, get the saved status
  chrome.storage.local.get(['scrapingStatus', 'lastScrapingType', 'isCurrentlyScraping'], async (result) => {
    lastScrapingType = result.lastScrapingType || null;
    const savedStatus = result.scrapingStatus || 'idle';
    const isCurrentlyScraping = result.isCurrentlyScraping || false;

    // Check if we're on LinkedIn Sales Navigator page
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('linkedin.com/sales')) {
      // Try to ping content script to get actual scraping state
      chrome.tabs.sendMessage(tabs[0].id, { action: 'PING' }, (response) => {
        if (response && response.isScraping) {
          // Content script is actively scraping
          updateScrapingStatus(true, 'scraping');
        } else if (isCurrentlyScraping && savedStatus === 'scraping') {
          // Was scraping but now stopped (user might have stopped it)
          updateScrapingStatus(false, 'stopped');
        } else {
          // Use saved status
          updateScrapingStatus(false, savedStatus);
        }
      });
    } else {
      // Not on LinkedIn page, use saved status
      if (savedStatus === 'scraping') {
        updateScrapingStatus(false, 'stopped');
      } else {
        updateScrapingStatus(false, savedStatus);
      }
    }
  });

  // Start Scraping Button
  startBtn.addEventListener('click', async () => {
    handleScrapingAction('START_SCRAPING');
  });

  // Scrape Chats Button
  if (scrapeChatsBtn) {
    scrapeChatsBtn.addEventListener('click', async () => {
      log('Button clicked. Initializing...');

      // Check current status to determine if we should update all conversations
      chrome.storage.local.get(['scrapingStatus'], (result) => {
        const currentStatus = result.scrapingStatus || 'idle';
        const updateAll = (currentStatus === 'completed');

        if (updateAll) {
          log('Status is completed. Re-scanning all conversations for updates...');
        }

        handleScrapingAction('SCRAPE_CHATS', false, updateAll);
      });
    });
  }

  async function handleScrapingAction(actionType, isResume = false, updateAll = false) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      log('Error: No active tab found');
      return;
    }

    const tab = tabs[0];
    const url = tab.url || '';

    // Check if we're on LinkedIn Sales Navigator
    if (!url.includes('linkedin.com/sales')) {
      log('Error: Please navigate to LinkedIn Sales Navigator messages page');
      log(`Current URL: ${url}`);
      return;
    }

    // Store the scraping type for resume functionality
    lastScrapingType = actionType;
    chrome.storage.local.set({ lastScrapingType: actionType });

    // Show immediate UI feedback
    updateScrapingStatus(true, 'scraping');
    if (isResume) {
      log(actionType === 'SCRAPE_CHATS' ? 'Resuming chat scraping...' : 'Resuming lead scraping...');
    } else if (updateAll) {
      log('🔄 Updating all conversations with latest messages...');
    } else {
      log(actionType === 'SCRAPE_CHATS' ? 'Starting chat scraping...' : 'Starting lead scraping...');
    }

    // First try to ping the content script to see if it's already there
    chrome.tabs.sendMessage(tab.id, { action: 'PING' }, async (pingResponse) => {
      const needsInjection = !pingResponse || chrome.runtime.lastError;

      if (needsInjection) {
        // Content script not loaded, try to inject it
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          log('Content script loaded');
          // Reduced wait time from 500ms to 100ms
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          log('Error injecting script: ' + e.message);
          console.error(e);
          updateScrapingStatus(false, 'idle');
          return;
        }
      }

      // Now send the start message with updateAll flag
      chrome.tabs.sendMessage(tab.id, { action: actionType, updateAll: updateAll }, (response) => {
        if (chrome.runtime.lastError) {
          log('Error: Could not connect to content script');
          log('Try refreshing the page and clicking Start again');
          console.error(chrome.runtime.lastError);
          updateScrapingStatus(false, 'idle');
        } else if (response && response.status === 'started') {
          log(actionType === 'SCRAPE_CHATS' ? 'Scraping chats...' : 'Scraping leads...');
        } else if (response && response.status === 'already_running') {
          log('Scraping is already running');
        }
      });
    });
  }

  // Stop Scraping Button
  stopBtn.addEventListener('click', () => {
    // Show immediate UI feedback - set to stopped state
    updateScrapingStatus(false, 'stopped');
    log('Stopping scraping...');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_SCRAPING' }, (response) => {
          if (response && response.status === 'stopped') {
            log('Scraping stopped. Click Resume to continue.');
          }
        });
      }
    });
  });

  // Resume Scraping Button
  resumeBtn.addEventListener('click', () => {
    if (lastScrapingType) {
      log('Resuming from where you left off...');
      handleScrapingAction(lastScrapingType, true);
    } else {
      log('Error: No previous scraping session found');
      updateScrapingStatus(false, 'idle');
    }
  });

  // Listen for updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'LOG') {
      log(request.message);
    } else if (request.action === 'LEADS_UPDATED') {
      countSpan.textContent = request.count;
      downloadBtn.disabled = request.count === 0;
      log(`Total leads: ${request.count}`);
    } else if (request.action === 'CHATS_UPDATED') {
      if (chatCountSpan) chatCountSpan.textContent = request.count;
      if (downloadChatsBtn) downloadChatsBtn.disabled = request.count === 0;
      log(`Total chats messages: ${request.count}`);
      updateUI(); // Refresh to update positive leads count
    } else if (request.action === 'POSITIVE_LEADS_UPDATED') {
      log(`Positive intent leads: ${request.count}`);
      updateUI(); // Refresh UI to update download button status
    } else if (request.action === 'SCRAPING_STARTED') {
      updateScrapingStatus(true, 'scraping');
    } else if (request.action === 'SCRAPING_STOPPED') {
      // When user manually stops, show stopped status with resume button
      updateScrapingStatus(false, 'stopped');
      log('Scraping stopped. Click Resume to continue from where you stopped.');
    } else if (request.action === 'SCRAPING_COMPLETED') {
      // When scraping completes naturally (end of list), show completed status
      updateScrapingStatus(false, 'completed');
      log('Scraping completed! You can start a new scraping session.');
    }
  });

  downloadBtn.addEventListener('click', () => {
    chrome.storage.local.get(['leads'], (result) => {
      const leads = result.leads || [];
      if (leads.length === 0) return;

      const csvContent = "data:text/csv;charset=utf-8,"
        + "Name,Profile URL,Last Message\n"
        + leads.map(e => `"${e.name}","${e.profileUrl}","${e.lastMessage.replace(/"/g, '""')}"`).join("\n");

      const encodedUri = encodeURI(csvContent);

      chrome.downloads.download({
        url: encodedUri,
        filename: 'linkedin_leads.csv',
        saveAs: false
      });
    });
  });

  if (downloadChatsBtn) {
    downloadChatsBtn.addEventListener('click', () => {
      chrome.storage.local.get(['scrapedChats'], (result) => {
        const conversations = result.scrapedChats || [];
        if (conversations.length === 0) return;

        // Build CSV with conversations grouped together
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Conversation With,Profile URL,Sender,Message,Time,Intent\n";

        conversations.forEach(conversation => {
          if (conversation.messages && Array.isArray(conversation.messages)) {
            conversation.messages.forEach(msg => {
              csvContent += `"${conversation.conversationWith}","${conversation.profileUrl}","${msg.sender}","${msg.message.replace(/"/g, '""')}","${msg.time}","${msg.intent || 'neutral'}"\n`;
            });
          }
        });

        const encodedUri = encodeURI(csvContent);

        chrome.downloads.download({
          url: encodedUri,
          filename: 'linkedin_chats_export.csv',
          saveAs: false
        });
      });
    });
  }

  // Download Positive Intent Messages Only
  if (downloadPositiveBtn) {
    downloadPositiveBtn.addEventListener('click', () => {
      chrome.storage.local.get(['scrapedChats'], (result) => {
        const conversations = result.scrapedChats || [];
        if (conversations.length === 0) return;

        // Build CSV with only positive intent messages from other users
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Conversation With,Profile URL,Sender,Message,Time,Intent\n";

        let positiveCount = 0;

        conversations.forEach(conversation => {
          if (conversation.messages && Array.isArray(conversation.messages)) {
            // Filter only positive intent messages from other users (not "You")
            const positiveMessages = conversation.messages.filter(msg =>
              msg.intent === 'positive' && msg.sender !== 'You'
            );

            positiveMessages.forEach(msg => {
              csvContent += `"${conversation.conversationWith}","${conversation.profileUrl}","${msg.sender}","${msg.message.replace(/"/g, '""')}","${msg.time}","${msg.intent}"\n`;
              positiveCount++;
            });
          }
        });

        if (positiveCount === 0) {
          log('No positive intent messages found.');
          return;
        }

        const encodedUri = encodeURI(csvContent);

        chrome.downloads.download({
          url: encodedUri,
          filename: 'linkedin_positive_intent_messages.csv',
          saveAs: false
        });

        log(`Downloaded ${positiveCount} positive intent messages.`);
      });
    });
  }

  clearBtn.addEventListener('click', () => {
    if (confirm('⚠️ Are you sure you want to clear ALL data?\n\nThis will delete:\n• All leads\n• All chat messages\n• All positive intent leads\n• Resume state\n\nThis action cannot be undone!')) {
      chrome.storage.local.set({
        leads: [],
        scrapedChats: [],
        positiveLeads: [],
        scrapingStatus: 'idle',
        lastScrapingType: null
      }, () => {
        // Reset to idle state when clearing data
        lastScrapingType = null;
        updateScrapingStatus(false, 'idle');
        updateUI();
        log('All data cleared. Status reset to Idle.');
      });
    } else {
      log('Clear data cancelled.');
    }
  });

  openCrmBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'crm.html' });
  });



  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
