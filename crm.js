document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#leadsTable tbody');
    const positiveTableBody = document.querySelector('#positiveLeadsTable tbody');
    const emptyState = document.getElementById('emptyState');
    const emptyStatePositive = document.getElementById('emptyStatePositive');
    const searchInput = document.getElementById('searchInput');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');

    const allLeadsCountSpan = document.getElementById('allLeadsCount');
    const positiveLeadsCountSpan = document.getElementById('positiveLeadsCount');

    let allChats = [];
    let positiveLeads = [];
    let currentTab = 'all-leads';

    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    function switchTab(tabId) {
        currentTab = tabId;

        // Update active tab button
        tabBtns.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update active tab content
        tabContents.forEach(content => {
            if (content.id === `${tabId}-content`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // Clear search when switching tabs
        searchInput.value = '';

        // Render appropriate table
        if (tabId === 'all-leads') {
            renderAllChatsTable(allChats);
        } else {
            renderPositiveTable(positiveLeads);
        }
    }

    // Load leads
    function loadLeads() {
        chrome.storage.local.get(['scrapedChats', 'positiveLeads'], (result) => {
            allChats = result.scrapedChats || [];
            positiveLeads = result.positiveLeads || [];

            // Update counts
            if (allLeadsCountSpan) allLeadsCountSpan.textContent = allChats.length;
            if (positiveLeadsCountSpan) positiveLeadsCountSpan.textContent = positiveLeads.length;

            // Render current tab
            if (currentTab === 'all-leads') {
                renderAllChatsTable(allChats);
            } else {
                renderPositiveTable(positiveLeads);
            }
        });
    }

    function renderAllChatsTable(chats) {
        tableBody.innerHTML = '';

        if (chats.length === 0) {
            emptyState.style.display = 'flex';
            return;
        } else {
            emptyState.style.display = 'none';
        }

        chats.forEach((chat, index) => {
            const row = document.createElement('tr');

            // Add intent-based styling
            if (chat.intent === 'positive') {
                row.style.backgroundColor = '#f0fdf4';
            } else if (chat.intent === 'negative') {
                row.style.backgroundColor = '#fef2f2';
            }

            // Conversation With
            const nameCell = document.createElement('td');
            nameCell.textContent = chat.conversationWith || 'Unknown';
            row.appendChild(nameCell);

            // Sender
            const senderCell = document.createElement('td');
            senderCell.innerHTML = chat.sender === 'You'
                ? '<strong style="color: #0a66c2;">You</strong>'
                : chat.sender;
            row.appendChild(senderCell);

            // Message
            const msgCell = document.createElement('td');
            msgCell.className = 'message-cell';
            msgCell.textContent = chat.message || '';
            msgCell.title = chat.message; // Tooltip
            row.appendChild(msgCell);

            // Time
            const timeCell = document.createElement('td');
            const timeFormatted = chat.time ? new Date(chat.time).toLocaleDateString() : 'N/A';
            timeCell.textContent = timeFormatted;
            timeCell.style.whiteSpace = 'nowrap';
            row.appendChild(timeCell);

            // Intent
            const intentCell = document.createElement('td');
            const intentBadge = document.createElement('span');
            intentBadge.textContent = chat.intent || 'neutral';
            intentBadge.style.padding = '4px 8px';
            intentBadge.style.borderRadius = '12px';
            intentBadge.style.fontSize = '12px';
            intentBadge.style.fontWeight = '600';

            if (chat.intent === 'positive') {
                intentBadge.style.backgroundColor = '#dcfce7';
                intentBadge.style.color = '#166534';
            } else if (chat.intent === 'negative') {
                intentBadge.style.backgroundColor = '#fee2e2';
                intentBadge.style.color = '#991b1b';
            } else {
                intentBadge.style.backgroundColor = '#f3f4f6';
                intentBadge.style.color = '#6b7280';
            }

            intentCell.appendChild(intentBadge);
            intentCell.style.textAlign = 'center';
            row.appendChild(intentCell);

            // Actions
            const actionCell = document.createElement('td');
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            delBtn.title = 'Delete';
            delBtn.onclick = () => deleteChat(index);
            actionCell.appendChild(delBtn);
            row.appendChild(actionCell);

            tableBody.appendChild(row);
        });
    }

    function renderPositiveTable(leads) {
        positiveTableBody.innerHTML = '';

        if (leads.length === 0) {
            emptyStatePositive.style.display = 'flex';
            return;
        } else {
            emptyStatePositive.style.display = 'none';
        }

        leads.forEach((lead, index) => {
            const row = document.createElement('tr');
            row.className = 'positive-row';

            // Name
            const nameCell = document.createElement('td');
            nameCell.innerHTML = `<strong>${lead.name}</strong>`;
            row.appendChild(nameCell);

            // Profile
            const profileCell = document.createElement('td');
            const link = document.createElement('a');
            link.href = lead.profileUrl;
            link.innerHTML = '<i class="fas fa-external-link-alt"></i> View';
            link.target = '_blank';
            profileCell.appendChild(link);
            row.appendChild(profileCell);

            // Last Positive Message
            const msgCell = document.createElement('td');
            msgCell.className = 'message-cell';
            msgCell.textContent = lead.lastMessage;
            msgCell.title = lead.lastMessage; // Tooltip
            row.appendChild(msgCell);

            // Time
            const timeCell = document.createElement('td');
            const timeFormatted = lead.time ? new Date(lead.time).toLocaleDateString() : 'N/A';
            timeCell.textContent = timeFormatted;
            row.appendChild(timeCell);

            // Positive Message Count
            const countCell = document.createElement('td');
            countCell.innerHTML = `<span class="badge">${lead.messageCount || 1}</span>`;
            countCell.style.textAlign = 'center';
            row.appendChild(countCell);

            // Actions
            const actionCell = document.createElement('td');
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            delBtn.title = 'Delete';
            delBtn.onclick = () => deletePositiveLead(index);
            actionCell.appendChild(delBtn);
            row.appendChild(actionCell);

            positiveTableBody.appendChild(row);
        });
    }

    function deleteChat(index) {
        if (confirm('Are you sure you want to delete this chat message?')) {
            allChats.splice(index, 1);
            saveChatsAndRender();
        }
    }

    function deletePositiveLead(index) {
        if (confirm('Are you sure you want to delete this positive lead?')) {
            positiveLeads.splice(index, 1);
            savePositiveAndRender();
        }
    }

    function saveChatsAndRender() {
        chrome.storage.local.set({ scrapedChats: allChats }, () => {
            if (allLeadsCountSpan) allLeadsCountSpan.textContent = allChats.length;
            renderAllChatsTable(allChats);
        });
    }

    function savePositiveAndRender() {
        chrome.storage.local.set({ positiveLeads: positiveLeads }, () => {
            if (positiveLeadsCountSpan) positiveLeadsCountSpan.textContent = positiveLeads.length;
            renderPositiveTable(positiveLeads);
        });
    }

    // Search
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();

        if (currentTab === 'all-leads') {
            const filtered = allChats.filter(chat =>
                (chat.conversationWith && chat.conversationWith.toLowerCase().includes(term)) ||
                (chat.sender && chat.sender.toLowerCase().includes(term)) ||
                (chat.message && chat.message.toLowerCase().includes(term)) ||
                (chat.intent && chat.intent.toLowerCase().includes(term))
            );
            renderAllChatsTable(filtered);
        } else {
            const filtered = positiveLeads.filter(lead =>
                lead.name.toLowerCase().includes(term) ||
                lead.lastMessage.toLowerCase().includes(term)
            );
            renderPositiveTable(filtered);
        }
    });

    // Export
    exportBtn.addEventListener('click', () => {
        if (currentTab === 'all-leads') {
            if (allChats.length === 0) return;

            const csvContent = "data:text/csv;charset=utf-8,"
                + "Conversation With,Sender,Message,Time,Intent\n"
                + allChats.map(e => `"${e.conversationWith}","${e.sender}","${e.message.replace(/"/g, '""')}","${e.time}","${e.intent || 'neutral'}"`).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "crm_all_chats.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            if (positiveLeads.length === 0) return;

            const csvContent = "data:text/csv;charset=utf-8,"
                + "Name,Profile URL,Last Positive Message,Time,Positive Messages Count\n"
                + positiveLeads.map(e => `"${e.name}","${e.profileUrl}","${e.lastMessage.replace(/"/g, '""')}","${e.time}","${e.messageCount || 1}"`).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "crm_positive_intent_leads.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    });

    // Clear All
    clearBtn.addEventListener('click', () => {
        if (currentTab === 'all-leads') {
            if (confirm('⚠️ Delete ALL chat messages? This cannot be undone.\n\nThis will clear all scraped conversations and messages.')) {
                allChats = [];
                saveChatsAndRender();
            }
        } else {
            if (confirm('⚠️ Delete ALL positive intent leads? This cannot be undone.')) {
                positiveLeads = [];
                savePositiveAndRender();
            }
        }
    });

    loadLeads();
});
