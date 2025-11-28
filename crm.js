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

    function renderAllChatsTable(conversations) {
        tableBody.innerHTML = '';

        if (conversations.length === 0) {
            emptyState.style.display = 'flex';
            return;
        } else {
            emptyState.style.display = 'none';
        }

        conversations.forEach((conversation, index) => {
            // Skip conversations without messages array (data migration safety)
            if (!conversation.messages || !Array.isArray(conversation.messages)) {
                return;
            }

            const row = document.createElement('tr');
            row.className = 'conversation-row';
            row.style.cursor = 'pointer';

            // Add styling based on positive intent
            if (conversation.hasPositiveIntent) {
                row.style.backgroundColor = '#f0fdf4';
            }

            // Expand/Collapse Icon
            const expandCell = document.createElement('td');
            expandCell.innerHTML = '<i class="fas fa-chevron-right expand-icon"></i>';
            expandCell.style.textAlign = 'center';
            row.appendChild(expandCell);

            // Conversation With
            const nameCell = document.createElement('td');
            nameCell.innerHTML = `<strong>${conversation.conversationWith || 'Unknown'}</strong>`;
            row.appendChild(nameCell);

            // Profile URL
            const profileCell = document.createElement('td');
            const profileLink = document.createElement('a');
            profileLink.href = conversation.profileUrl || '#';
            profileLink.innerHTML = '<i class="fas fa-external-link-alt"></i> View';
            profileLink.target = '_blank';
            profileLink.onclick = (e) => e.stopPropagation(); // Prevent row expansion
            profileCell.appendChild(profileLink);
            row.appendChild(profileCell);

            // Message Count
            const countCell = document.createElement('td');
            countCell.textContent = conversation.messageCount || 0;
            countCell.style.textAlign = 'center';
            row.appendChild(countCell);

            // Latest Message
            const latestMsg = conversation.messages.length > 0 ? conversation.messages[conversation.messages.length - 1] : null;
            const latestCell = document.createElement('td');
            latestCell.className = 'message-cell';
            latestCell.textContent = latestMsg ? latestMsg.message : 'N/A';
            latestCell.title = latestMsg ? latestMsg.message : '';
            row.appendChild(latestCell);

            // Has Positive Intent
            const positiveCell = document.createElement('td');
            positiveCell.style.textAlign = 'center';
            if (conversation.hasPositiveIntent) {
                positiveCell.innerHTML = '<i class="fas fa-star" style="color: #f59e0b;"></i>';
            } else {
                positiveCell.textContent = '-';
            }
            row.appendChild(positiveCell);

            // Actions
            const actionCell = document.createElement('td');
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            delBtn.title = 'Delete Conversation';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteChat(index);
            };
            actionCell.appendChild(delBtn);
            row.appendChild(actionCell);

            // Click to expand/collapse messages
            row.onclick = () => toggleMessages(row, conversation);

            tableBody.appendChild(row);
        });
    }

    function toggleMessages(row, conversation) {
        const expandIcon = row.querySelector('.expand-icon');
        const existingDetail = row.nextElementSibling;

        // Check if details row already exists
        if (existingDetail && existingDetail.classList.contains('detail-row')) {
            // Collapse
            existingDetail.remove();
            expandIcon.className = 'fas fa-chevron-right expand-icon';
        } else {
            // Expand
            expandIcon.className = 'fas fa-chevron-down expand-icon';

            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';

            const detailCell = document.createElement('td');
            detailCell.colSpan = 7;
            detailCell.style.padding = '0';
            detailCell.style.backgroundColor = '#f9fafb';

            const messagesContainer = document.createElement('div');
            messagesContainer.style.padding = '16px';
            messagesContainer.style.maxHeight = '400px';
            messagesContainer.style.overflowY = 'auto';

            const messagesTitle = document.createElement('h4');
            messagesTitle.textContent = 'All Messages in Conversation:';
            messagesTitle.style.marginBottom = '12px';
            messagesTitle.style.fontSize = '14px';
            messagesTitle.style.fontWeight = '600';
            messagesContainer.appendChild(messagesTitle);

            // Create message table
            const msgTable = document.createElement('table');
            msgTable.style.width = '100%';
            msgTable.style.fontSize = '13px';

            const msgHead = document.createElement('thead');
            msgHead.innerHTML = '<tr><th>Sender</th><th>Message</th><th>Time</th><th>Intent</th></tr>';
            msgTable.appendChild(msgHead);

            const msgBody = document.createElement('tbody');

            conversation.messages.forEach(msg => {
                const msgRow = document.createElement('tr');

                // Add intent-based styling
                if (msg.intent === 'positive') {
                    msgRow.style.backgroundColor = '#dcfce7';
                } else if (msg.intent === 'negative') {
                    msgRow.style.backgroundColor = '#fee2e2';
                }

                // Sender
                const senderCell = document.createElement('td');
                senderCell.style.fontWeight = msg.sender === 'You' ? '600' : 'normal';
                senderCell.style.color = msg.sender === 'You' ? '#0a66c2' : 'inherit';
                senderCell.textContent = msg.sender;
                msgRow.appendChild(senderCell);

                // Message
                const messageCell = document.createElement('td');
                messageCell.textContent = msg.message;
                msgRow.appendChild(messageCell);

                // Time
                const timeCell = document.createElement('td');
                timeCell.textContent = msg.time ? new Date(msg.time).toLocaleString() : 'N/A';
                timeCell.style.whiteSpace = 'nowrap';
                timeCell.style.fontSize = '12px';
                msgRow.appendChild(timeCell);

                // Intent
                const intentCell = document.createElement('td');
                const intentBadge = document.createElement('span');
                intentBadge.textContent = msg.intent || 'neutral';
                intentBadge.style.padding = '2px 6px';
                intentBadge.style.borderRadius = '8px';
                intentBadge.style.fontSize = '11px';
                intentBadge.style.fontWeight = '600';

                if (msg.intent === 'positive') {
                    intentBadge.style.backgroundColor = '#dcfce7';
                    intentBadge.style.color = '#166534';
                } else if (msg.intent === 'negative') {
                    intentBadge.style.backgroundColor = '#fee2e2';
                    intentBadge.style.color = '#991b1b';
                } else {
                    intentBadge.style.backgroundColor = '#f3f4f6';
                    intentBadge.style.color = '#6b7280';
                }

                intentCell.appendChild(intentBadge);
                intentCell.style.textAlign = 'center';
                msgRow.appendChild(intentCell);

                msgBody.appendChild(msgRow);
            });

            msgTable.appendChild(msgBody);
            messagesContainer.appendChild(msgTable);
            detailCell.appendChild(messagesContainer);
            detailRow.appendChild(detailCell);

            row.after(detailRow);
        }
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
            row.style.cursor = 'pointer';
            row.style.backgroundColor = '#f0fdf4';

            // Expand/Collapse Icon
            const expandCell = document.createElement('td');
            expandCell.innerHTML = '<i class="fas fa-chevron-right expand-icon"></i>';
            expandCell.style.textAlign = 'center';
            row.appendChild(expandCell);

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
            link.onclick = (e) => e.stopPropagation(); // Prevent row expansion
            profileCell.appendChild(link);
            row.appendChild(profileCell);

            // Last Positive Message (truncated)
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
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deletePositiveLead(index);
            };
            actionCell.appendChild(delBtn);
            row.appendChild(actionCell);

            // Click to expand/collapse all positive messages
            row.onclick = () => togglePositiveMessages(row, lead);

            positiveTableBody.appendChild(row);
        });
    }

    function togglePositiveMessages(row, lead) {
        const expandIcon = row.querySelector('.expand-icon');
        const existingDetail = row.nextElementSibling;

        // Check if details row already exists
        if (existingDetail && existingDetail.classList.contains('detail-row')) {
            // Collapse
            existingDetail.remove();
            expandIcon.className = 'fas fa-chevron-right expand-icon';
        } else {
            // Expand - need to get all positive messages from this conversation
            expandIcon.className = 'fas fa-chevron-down expand-icon';

            const detailRow = document.createElement('tr');
            detailRow.className = 'detail-row';

            const detailCell = document.createElement('td');
            detailCell.colSpan = 7;
            detailCell.style.padding = '0';
            detailCell.style.backgroundColor = '#f9fafb';

            const messagesContainer = document.createElement('div');
            messagesContainer.style.padding = '16px';
            messagesContainer.style.maxHeight = '400px';
            messagesContainer.style.overflowY = 'auto';

            const messagesTitle = document.createElement('h4');
            messagesTitle.textContent = 'All Positive Intent Messages:';
            messagesTitle.style.marginBottom = '12px';
            messagesTitle.style.fontSize = '14px';
            messagesTitle.style.fontWeight = '600';
            messagesContainer.appendChild(messagesTitle);

            // Get all positive messages from scrapedChats for this person
            chrome.storage.local.get(['scrapedChats'], (result) => {
                const conversations = result.scrapedChats || [];
                const conversation = conversations.find(conv => conv.conversationWith === lead.name);

                if (conversation && conversation.messages) {
                    // Filter only positive intent messages from other users
                    const positiveMessages = conversation.messages.filter(msg =>
                        msg.intent === 'positive' && msg.sender !== 'You'
                    );

                    // Create message table
                    const msgTable = document.createElement('table');
                    msgTable.style.width = '100%';
                    msgTable.style.fontSize = '13px';

                    const msgHead = document.createElement('thead');
                    msgHead.innerHTML = '<tr><th>Sender</th><th>Full Message</th><th>Time</th></tr>';
                    msgTable.appendChild(msgHead);

                    const msgBody = document.createElement('tbody');

                    positiveMessages.forEach(msg => {
                        const msgRow = document.createElement('tr');
                        msgRow.style.backgroundColor = '#dcfce7';

                        // Sender
                        const senderCell = document.createElement('td');
                        senderCell.style.fontWeight = '600';
                        senderCell.textContent = msg.sender;
                        msgRow.appendChild(senderCell);

                        // Full Message (not truncated)
                        const messageCell = document.createElement('td');
                        messageCell.textContent = msg.message;
                        messageCell.style.whiteSpace = 'pre-wrap';
                        messageCell.style.wordBreak = 'break-word';
                        msgRow.appendChild(messageCell);

                        // Time
                        const timeCell = document.createElement('td');
                        timeCell.textContent = msg.time ? new Date(msg.time).toLocaleString() : 'N/A';
                        timeCell.style.whiteSpace = 'nowrap';
                        timeCell.style.fontSize = '12px';
                        msgRow.appendChild(timeCell);

                        msgBody.appendChild(msgRow);
                    });

                    msgTable.appendChild(msgBody);
                    messagesContainer.appendChild(msgTable);
                } else {
                    messagesContainer.innerHTML += '<p style="color: #666;">No messages found.</p>';
                }

                detailCell.appendChild(messagesContainer);
                detailRow.appendChild(detailCell);
                row.after(detailRow);
            });
        }
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
            const filtered = allChats.filter(conversation =>
                (conversation.conversationWith && conversation.conversationWith.toLowerCase().includes(term)) ||
                (conversation.profileUrl && conversation.profileUrl.toLowerCase().includes(term)) ||
                conversation.messages.some(msg =>
                    (msg.sender && msg.sender.toLowerCase().includes(term)) ||
                    (msg.message && msg.message.toLowerCase().includes(term)) ||
                    (msg.intent && msg.intent.toLowerCase().includes(term))
                )
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

            // Build CSV with conversations grouped together
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Conversation With,Profile URL,Sender,Message,Time,Intent\n";

            allChats.forEach(conversation => {
                if (conversation.messages && Array.isArray(conversation.messages)) {
                    conversation.messages.forEach(msg => {
                        csvContent += `"${conversation.conversationWith}","${conversation.profileUrl}","${msg.sender}","${msg.message.replace(/"/g, '""')}","${msg.time}","${msg.intent || 'neutral'}"\n`;
                    });
                }
            });

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
