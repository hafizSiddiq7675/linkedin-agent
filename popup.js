document.addEventListener('DOMContentLoaded', () => {
  const openCrmBtn = document.getElementById('openCrmBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusSpan = document.getElementById('status');
  const countSpan = document.getElementById('count');
  const logDiv = document.getElementById('log');

  function log(msg) {
    const p = document.createElement('p');
    p.textContent = `> ${msg}`;
    p.style.margin = '2px 0';
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function updateUI() {
    chrome.storage.local.get(['leads'], (result) => {
      const leads = result.leads || [];
      countSpan.textContent = leads.length;
      downloadBtn.disabled = leads.length === 0;
    });
  }

  // Initial Load
  updateUI();
  statusSpan.textContent = 'Auto-Running...';

  // Listen for updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'LOG') {
      log(request.message);
    } else if (request.action === 'LEADS_UPDATED') {
      countSpan.textContent = request.count;
      downloadBtn.disabled = request.count === 0;
      log(`Total leads: ${request.count}`);
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
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "linkedin_leads.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });

  clearBtn.addEventListener('click', () => {
    chrome.storage.local.set({ leads: [] }, () => {
      updateUI();
      log('Data cleared.');
    });
  });

  openCrmBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'crm.html' });
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
