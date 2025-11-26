document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
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

  function log(msg) {
    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    p.style.margin = '2px 0';
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function updateUI() {
    chrome.storage.local.get(['leads', 'scrapedChats', 'positiveLeads'], (result) => {
      const leads = result.leads || [];
      countSpan.textContent = leads.length;
      downloadBtn.disabled = leads.length === 0;

      const chats = result.scrapedChats || [];
      if (chatCountSpan) chatCountSpan.textContent = chats.length;
      if (downloadChatsBtn) downloadChatsBtn.disabled = chats.length === 0;

      // Get positive leads count from storage
      const positiveLeads = result.positiveLeads || [];
      if (positiveCountSpan) positiveCountSpan.textContent = positiveLeads.length;

      // Count positive intent messages from other users for download button
      const positiveChats = chats.filter(e => e.intent === 'positive' && e.sender !== 'You');
      if (downloadPositiveBtn) downloadPositiveBtn.disabled = positiveChats.length === 0;
    });
  }

  function updateScrapingStatus(running) {
    isRunning = running;
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    statusSpan.textContent = running ? 'Scraping...' : 'Idle';
  }

  // Initial Load
  updateUI();
  updateScrapingStatus(false);

  // Start Scraping Button
  startBtn.addEventListener('click', async () => {
    handleScrapingAction('START_SCRAPING');
  });

  // Scrape Chats Button
  const scrapeChatsBtn = document.getElementById('scrapeChatsBtn');
  if (scrapeChatsBtn) {
    scrapeChatsBtn.addEventListener('click', async () => {
      log('Button clicked. Initializing...');
      handleScrapingAction('SCRAPE_CHATS');
    });
  }

  async function handleScrapingAction(actionType) {
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
          log('Content script injected successfully');
          // Wait a moment for script to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          log('Error injecting script: ' + e.message);
          console.error(e);
          return;
        }
      }

      // Now send the start message
      chrome.tabs.sendMessage(tab.id, { action: actionType }, (response) => {
        if (chrome.runtime.lastError) {
          log('Error: Could not connect to content script');
          log('Try refreshing the page and clicking Start again');
          console.error(chrome.runtime.lastError);
        } else if (response && response.status === 'started') {
          updateScrapingStatus(true);
          log(actionType === 'SCRAPE_CHATS' ? 'Started scraping chats...' : 'Started scraping leads...');
        } else if (response && response.status === 'already_running') {
          log('Scraping is already running');
          updateScrapingStatus(true);
        }
      });
    });
  }

  // Stop Scraping Button
  stopBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_SCRAPING' }, (response) => {
          if (response && response.status === 'stopped') {
            updateScrapingStatus(false);
            log('Stopped scraping.');
          }
        });
      }
    });
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
      updateScrapingStatus(true);
    } else if (request.action === 'SCRAPING_STOPPED') {
      updateScrapingStatus(false);
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
        const chats = result.scrapedChats || [];
        if (chats.length === 0) return;

        const csvContent = "data:text/csv;charset=utf-8,"
          + "Conversation With,Sender,Message,Time,Intent\n"
          + chats.map(e => `"${e.conversationWith}","${e.sender}","${e.message.replace(/"/g, '""')}","${e.time}","${e.intent || 'neutral'}"`).join("\n");

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
        const chats = result.scrapedChats || [];
        if (chats.length === 0) return;

        // Filter only positive intent messages from other users (not "You")
        const positiveChats = chats.filter(e =>
          e.intent === 'positive' && e.sender !== 'You'
        );

        if (positiveChats.length === 0) {
          log('No positive intent messages found.');
          return;
        }

        const csvContent = "data:text/csv;charset=utf-8,"
          + "Conversation With,Sender,Message,Time,Intent\n"
          + positiveChats.map(e => `"${e.conversationWith}","${e.sender}","${e.message.replace(/"/g, '""')}","${e.time}","${e.intent}"`).join("\n");

        const encodedUri = encodeURI(csvContent);

        chrome.downloads.download({
          url: encodedUri,
          filename: 'linkedin_positive_intent_messages.csv',
          saveAs: false
        });

        log(`Downloaded ${positiveChats.length} positive intent messages.`);
      });
    });
  }

  clearBtn.addEventListener('click', () => {
    if (confirm('⚠️ Are you sure you want to clear ALL data?\n\nThis will delete:\n• All leads\n• All chat messages\n• All positive intent leads\n\nThis action cannot be undone!')) {
      chrome.storage.local.set({ leads: [], scrapedChats: [], positiveLeads: [] }, () => {
        updateUI();
        log('All data cleared successfully.');
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
