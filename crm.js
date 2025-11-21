document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#leadsTable tbody');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');

    let allLeads = [];

    // Load leads
    function loadLeads() {
        chrome.storage.local.get(['leads'], (result) => {
            allLeads = result.leads || [];
            renderTable(allLeads);
        });
    }

    function renderTable(leads) {
        tableBody.innerHTML = '';

        if (leads.length === 0) {
            emptyState.style.display = 'block';
            return;
        } else {
            emptyState.style.display = 'none';
        }

        leads.forEach((lead, index) => {
            const row = document.createElement('tr');

            // Name
            const nameCell = document.createElement('td');
            nameCell.textContent = lead.name;
            row.appendChild(nameCell);

            // Profile
            const profileCell = document.createElement('td');
            const link = document.createElement('a');
            link.href = lead.profileUrl;
            link.textContent = 'View Profile';
            link.target = '_blank';
            profileCell.appendChild(link);
            row.appendChild(profileCell);

            // Message
            const msgCell = document.createElement('td');
            msgCell.className = 'message-cell';
            msgCell.textContent = lead.lastMessage;
            msgCell.title = lead.lastMessage; // Tooltip
            row.appendChild(msgCell);

            // Actions
            const actionCell = document.createElement('td');
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete';
            delBtn.onclick = () => deleteLead(index);
            actionCell.appendChild(delBtn);
            row.appendChild(actionCell);

            tableBody.appendChild(row);
        });
    }

    function deleteLead(index) {
        if (confirm('Are you sure you want to delete this lead?')) {
            allLeads.splice(index, 1);
            saveAndRender();
        }
    }

    function saveAndRender() {
        chrome.storage.local.set({ leads: allLeads }, () => {
            renderTable(allLeads);
        });
    }

    // Search
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allLeads.filter(lead =>
            lead.name.toLowerCase().includes(term) ||
            lead.lastMessage.toLowerCase().includes(term)
        );
        renderTable(filtered);
    });

    // Export
    exportBtn.addEventListener('click', () => {
        if (allLeads.length === 0) return;

        const csvContent = "data:text/csv;charset=utf-8,"
            + "Name,Profile URL,Last Message\n"
            + allLeads.map(e => `"${e.name}","${e.profileUrl}","${e.lastMessage.replace(/"/g, '""')}"`).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "crm_leads.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Clear All
    clearBtn.addEventListener('click', () => {
        if (confirm('Delete ALL leads? This cannot be undone.')) {
            allLeads = [];
            saveAndRender();
        }
    });

    loadLeads();
});
