document.addEventListener('DOMContentLoaded', async () => {
    console.log('Client - Dashboard script loaded, initializing...');

    // Element references
    const teacherForm = document.getElementById('teacher-form');
    const teachersTable = document.getElementById('teachers-table');
    const votesTable = document.getElementById('votes-table');
    const proposalsTable = document.getElementById('proposals-table');
    const correctionsTable = document.getElementById('corrections-table');
    const teachersMessage = document.getElementById('teachers-message');
    const votesMessage = document.getElementById('votes-message');
    const proposalMessage = document.getElementById('proposal-message');
    const correctionsMessage = document.getElementById('corrections-message');
    const voteSearch = document.getElementById('vote-search');
    const votesPerPageSelect = document.getElementById('votes-per-page');
    const voteSort = document.getElementById('vote-sort');
    const voteSortDirection = document.getElementById('vote-sort-direction');
    const teacherSearch = document.getElementById('teacher-search');
    const teachersPerPageSelect = document.getElementById('teachers-per-page');
    const teacherSort = document.getElementById('teacher-sort');
    const teacherSortDirection = document.getElementById('teacher-sort-direction');
    const footerSettingsForm = document.getElementById('footer-settings-form');
    const footerMessageStatus = document.getElementById('footer-message-status');
    const messageSettingsForm = document.getElementById('message-settings-form');
    const messageStatus = document.getElementById('message-status');
    const statsTimeframe = document.getElementById('stats-timeframe');
    const sectionSettingsContainer = document.getElementById('section-settings-container');

    // Check for missing elements
    const requiredElements = [
        { el: teacherForm, id: 'teacher-form' },
        { el: teachersTable, id: 'teachers-table' },
        { el: votesTable, id: 'votes-table' },
        { el: proposalsTable, id: 'proposals-table' },
        { el: correctionsTable, id: 'corrections-table' },
        { el: teachersMessage, id: 'teachers-message' },
        { el: votesMessage, id: 'votes-message' },
        { el: proposalMessage, id: 'proposal-message' },
        { el: correctionsMessage, id: 'corrections-message' },
        { el: voteSearch, id: 'vote-search' },
        { el: votesPerPageSelect, id: 'votes-per-page' },
        { el: voteSort, id: 'vote-sort' },
        { el: voteSortDirection, id: 'vote-sort-direction' },
        { el: teacherSearch, id: 'teacher-search' },
        { el: teachersPerPageSelect, id: 'teachers-per-page' },
        { el: teacherSort, id: 'teacher-sort' },
        { el: teacherSortDirection, id: 'teacher-sort-direction' },
        { el: footerSettingsForm, id: 'footer-settings-form' },
        { el: footerMessageStatus, id: 'footer-message-status' },
        { el: messageSettingsForm, id: 'message-settings-form' },
        { el: messageStatus, id: 'message-status' },
        { el: statsTimeframe, id: 'stats-timeframe' },
        { el: sectionSettingsContainer, id: 'section-settings-container' }
    ];

    const missingElements = requiredElements.filter(item => !item.el).map(item => item.id);
    if (missingElements.length > 0) {
        console.error('Client - Required elements not found:', missingElements);
        showNotification('Dashboard initialization failed due to missing elements.', true);
        return;
    }
    console.log('Client - All required elements found');

    let csrfToken = '';
    let allTeachers = [];
    let currentTeacherPage = 1;
    let currentVotePage = 1;
    let allSettings = {};

    // Fetch CSRF token
    try {
        const csrfResponse = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!csrfResponse.ok) throw new Error(`HTTP ${csrfResponse.status}`);
        csrfToken = (await csrfResponse.json()).csrfToken;
    } catch (error) {
        console.error('Client - Failed to fetch CSRF token:', error.message);
        showNotification('Security initialization failed.', true);
        return;
    }

    function showNotification(messageText, isError = false) {
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            document.body.appendChild(notification);
        }
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = messageText;
        notification.style.display = 'block';
        setTimeout(() => notification.style.display = 'none', 3000);
    }

    function showModal(title, message, confirmText, onConfirm, extraContent = '') {
        const modalHtml = `
            <div class="modal active">
                <div class="modal-content">
                    <h2>${title}</h2>
                    <p>${message}</p>
                    ${extraContent}
                    <button id="confirm-action" class="modal-btn">${confirmText}</button>
                    <button id="cancel-action" class="modal-btn">Cancel</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.querySelector('.modal');
        if (!modal) return;
        document.getElementById('confirm-action').addEventListener('click', async () => {
            await onConfirm();
            modal.remove();
        });
        document.getElementById('cancel-action').addEventListener('click', () => modal.remove());
    }

function sanitizeInput(input) {
    if (!input) return '';
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML.replace(/[<>&"']/g, match => ({ 
        '<': '&lt;', 
        '>': '&gt;', 
        '&': '&amp;', 
        '"': '&quot;', 
        "'": '&#39;' // Fixed the single quote encoding
    })[match]);
}


    async function checkAdminStatus() {
        try {
            const response = await fetch('/api/admin/votes', { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
            if (!response.ok) throw new Error(`Not authenticated: ${response.status}`);
            return true;
        } catch (error) {
            console.error('Client - Admin check failed:', error);
            window.location.href = '/pages/admin/login.html';
            return false;
        }
    }

    function updateDropdownVisibility(activeTab) {
        // Hide all dropdowns by default
        [voteSearch, votesPerPageSelect, voteSort, voteSortDirection, 
         teacherSearch, teachersPerPageSelect, teacherSort, teacherSortDirection, 
         statsTimeframe].forEach(el => el.parentElement.style.display = 'none');

        // Show relevant dropdowns based on active tab
        switch (activeTab) {
            case 'teachers':
                teacherSearch.parentElement.style.display = 'block';
                teachersPerPageSelect.parentElement.style.display = 'block';
                teacherSort.parentElement.style.display = 'block';
                teacherSortDirection.parentElement.style.display = 'block';
                break;
            case 'votes':
                voteSearch.parentElement.style.display = 'block';
                votesPerPageSelect.parentElement.style.display = 'block';
                voteSort.parentElement.style.display = 'block';
                voteSortDirection.parentElement.style.display = 'block';
                break;
            case 'stats':
                statsTimeframe.parentElement.style.display = 'block';
                break;
        }
    }

    async function loadVotes(page = currentVotePage) {
        // Unchanged from previous version
        try {
            const searchQuery = voteSearch.value.toLowerCase();
            const sortField = voteSort.value;
            const sortDirection = voteSortDirection.value;
            const perPage = parseInt(votesPerPageSelect.value) || 10;
            currentVotePage = page;

            const response = await fetch(`/api/admin/votes?page=${page}&perPage=${perPage}&search=${encodeURIComponent(searchQuery)}&sort=${sortField}&direction=${sortDirection}`, {
                credentials: 'include',
                headers: { 'X-CSRF-Token': csrfToken }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const { votes, total } = await response.json();
            const totalPages = Math.ceil(total / perPage);

            votesTable.innerHTML = `
                <table class="admin-table">
                    <thead><tr><th>Vote ID</th><th>Teacher ID</th><th>Rating</th><th>Comment</th><th>Explicit</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${votes.map(vote => `
                            <tr>
                                <td>${vote.id}</td>
                                <td>${vote.teacher_id}</td>
                                <td contenteditable="true" id="edit-rating-${vote.id}">${vote.rating}</td>
                                <td contenteditable="true" id="edit-comment-${vote.id}">${sanitizeInput(vote.comment || '')}</td>
                                <td>${vote.is_explicit ? 'Yes' : 'No'}</td>
                                <td>
                                    <button class="submit-btn" onclick="updateVote('${vote.id}')">Update</button>
                                    <button class="delete-btn" onclick="showDeleteVoteModal('${vote.id}')">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="pagination">
                    <button onclick="loadVotes(${page - 1})" ${page === 1 ? 'disabled' : ''}>Previous</button>
                    <span>Page ${page} of ${totalPages}</span>
                    <button onclick="loadVotes(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next</button>
                </div>
            `;
            votesMessage.textContent = `Loaded ${votes.length} of ${total} votes.`;
            votesMessage.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading votes:', error);
            votesTable.innerHTML = '<p class="error-message">Error loading votes.</p>';
            votesMessage.textContent = `Error: ${error.message}`;
            votesMessage.className = 'error-message';
        }
    }

    async function loadTeachers(page = currentTeacherPage) {
        // Unchanged from previous version
        try {
            if (!allTeachers.length) {
                const response = await fetch('/api/teachers?perPage=100', { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
                if (!response.ok) throw new Error('Failed to load teachers');
                allTeachers = (await response.json()).teachers || [];
            }
            const searchQuery = teacherSearch.value.toLowerCase();
            const sortField = teacherSort.value;
            const sortDirection = teacherSortDirection.value;
            const perPage = parseInt(teachersPerPageSelect.value) || 10;
            currentTeacherPage = page;

            let teachers = allTeachers.filter(t => 
                (t.id || '').toLowerCase().includes(searchQuery) || 
                (t.name || '').toLowerCase().includes(searchQuery)
            );
            teachers.sort((a, b) => {
                const valueA = (a[sortField] || '').toString().toLowerCase();
                const valueB = (b[sortField] || '').toString().toLowerCase();
                return sortDirection === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
            });

            const totalPages = Math.ceil(teachers.length / perPage);
            const start = (page - 1) * perPage;
            const paginatedTeachers = teachers.slice(start, start + perPage);

            teachersTable.innerHTML = `
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${paginatedTeachers.map(teacher => `
                            <tr onclick="toggleTeacherDetails('${teacher.id}')" style="cursor: pointer;">
                                <td contenteditable="true" id="edit-id-${teacher.id}">${sanitizeInput(teacher.id)}</td>
                                <td>${sanitizeInput(teacher.name)}</td>
                                <td>${sanitizeInput(teacher.description)}</td>
                                <td>
                                    <button class="delete-btn" onclick="event.stopPropagation(); showDeleteTeacherModal('${teacher.id}', '${sanitizeInput(teacher.name)}')">Delete</button>
                                </td>
                            </tr>
                            <tr id="teacher-details-${teacher.id}" class="teacher-details" style="display: none;">
                                <td colspan="4">
                                    <div class="teacher-details-content">
                                        <p><strong>ID:</strong> <span contenteditable="true" id="edit-id-detail-${teacher.id}">${sanitizeInput(teacher.id)}</span></p>
                                        <p><strong>Name:</strong> <span contenteditable="true" id="edit-name-${teacher.id}">${sanitizeInput(teacher.name)}</span></p>
                                        <p><strong>Description:</strong> <span contenteditable="true" id="edit-desc-${teacher.id}">${sanitizeInput(teacher.description)}</span></p>
                                        <button class="submit-btn" onclick="updateTeacher('${teacher.id}')">Update</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="pagination">
                    <button onclick="loadTeachers(${page - 1})" ${page === 1 ? 'disabled' : ''}>Previous</button>
                    <span>Page ${page} of ${totalPages}</span>
                    <button onclick="loadTeachers(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next</button>
                </div>
            `;
            teachersMessage.textContent = `Loaded ${paginatedTeachers.length} of ${teachers.length} teachers.`;
            teachersMessage.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading teachers:', error);
            teachersTable.innerHTML = '<p class="error-message">Error loading teachers.</p>';
            teachersMessage.textContent = `Error: ${error.message}`;
            teachersMessage.className = 'error-message';
        }
    }

    async function loadTeacherProposals() {
        // Unchanged from previous version
        try {
            const response = await fetch('/api/admin/teacher-proposals', { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const proposals = await response.json();
            proposalsTable.innerHTML = `
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Description</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${proposals.map(proposal => `
                            <tr>
                                <td>${proposal.id}</td>
                                <td>${sanitizeInput(proposal.name)}</td>
                                <td>${sanitizeInput(proposal.email)}</td>
                                <td>${sanitizeInput(proposal.description)}</td>
                                <td>
                                    <button class="approve-btn" onclick="approveProposal('${proposal.id}')">Approve</button>
                                    <button class="delete-btn" onclick="showDeleteProposalModal('${proposal.id}', '${sanitizeInput(proposal.name)}')">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            proposalMessage.textContent = `Loaded ${proposals.length} proposals.`;
            proposalMessage.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading proposals:', error);
            proposalsTable.innerHTML = '<p class="error-message">Error loading proposals.</p>';
            proposalMessage.textContent = `Error: ${error.message}`;
            proposalMessage.className = 'error-message';
        }
    }

    async function loadCorrections() {
        // Unchanged from previous version
        try {
            const response = await fetch('/api/admin/corrections', { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const corrections = await response.json();
            correctionsTable.innerHTML = `
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Teacher</th><th>Suggestion</th><th>Submitted</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${corrections.map(c => `
                            <tr>
                                <td>${c.id}</td>
                                <td>${sanitizeInput(c.teacher_name || c.teacher_id)}</td>
                                <td>${sanitizeInput(c.suggestion)}</td>
                                <td>${new Date(c.submitted_at).toLocaleString()}</td>
                                <td>
                                    <button class="submit-btn" onclick="implementCorrection(${c.id})">Implement</button>
                                    <button class="delete-btn" onclick="showDeleteCorrectionModal(${c.id})">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            correctionsMessage.textContent = `Loaded ${corrections.length} corrections.`;
            correctionsMessage.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading corrections:', error);
            correctionsTable.innerHTML = '<p class="error-message">Error loading corrections.</p>';
            correctionsMessage.textContent = `Error: ${error.message}`;
            correctionsMessage.className = 'error-message';
        }
    }

    async function loadSectionSettings() {
        if (!sectionSettingsContainer) {
            console.error('Client - Section settings container not found');
            showNotification('Section settings container missing.', true);
            return;
        }

        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'teachers';
        const sectionMap = {
            'teachers': ['Add New Teacher', 'Manage Teachers'],
            'votes': ['Manage Votes'],
            'proposals': ['Proposals Review'],
            'corrections': ['Corrections'],
            'settings': ['Main Message Settings', 'Footer Settings', 'Section Expansion Settings'],
            'stats': ['Statistics']
        };

        // All possible sections for the Section Expansion Settings
        const allSections = [
            'Add New Teacher', 'Manage Teachers', 'Manage Votes', 'Proposals Review',
            'Corrections', 'Main Message Settings', 'Footer Settings', 'Statistics'
        ];

        try {
            const response = await fetch('/api/admin/section-settings', { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
            allSettings = response.ok ? await response.json() : {
                "Add New Teacher": false, "Manage Teachers": false, "Manage Votes": false,
                "Proposals Review": false, "Corrections": true, "Main Message Settings": true,
                "Footer Settings": true, "Statistics": false
            };

            // Determine which sections to show
            let sectionsToShow = sectionMap[activeTab] || [];
            if (activeTab === 'settings' && sectionsToShow.includes('Section Expansion Settings')) {
                sectionsToShow = allSections; // Show all sections under Section Expansion Settings
            }

            const filteredSettings = Object.fromEntries(
                Object.entries(allSettings).filter(([section]) => sectionsToShow.includes(section))
            );

            sectionSettingsContainer.innerHTML = `
                <h3>Section Settings for ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                ${Object.entries(filteredSettings).length > 0 ? Object.entries(filteredSettings).map(([section, isExpanded]) => `
                    <div class="form-group toggle-group">
                        <label>${section}</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggle-${section.replace(/\s+/g, '-')}" data-section="${section}" ${isExpanded ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <span class="toggle-status">${isExpanded ? 'Expanded' : 'Collapsed'}</span>
                    </div>
                `).join('') : '<p>No settings available for this tab.</p>'}
                <button id="save-section-settings" class="submit-btn">Save Settings</button>
            `;

            document.querySelectorAll('.toggle-group input[type="checkbox"]').forEach(toggle => {
                toggle.addEventListener('change', (e) => {
                    const sectionName = e.target.dataset.section;
                    allSettings[sectionName] = e.target.checked;
                    const status = e.target.nextElementSibling.nextElementSibling;
                    if (status) status.textContent = e.target.checked ? 'Expanded' : 'Collapsed';
                    applySectionSettings(allSettings);
                });
            });

            document.getElementById('save-section-settings')?.addEventListener('click', saveSectionSettings);
            applySectionSettings(allSettings);
        } catch (error) {
            console.error('Client - Error loading section settings:', error);
            sectionSettingsContainer.innerHTML = '<p class="error-message">Error loading settings.</p>';
            showNotification('Failed to load section settings.', true);
        }
    }

    async function saveSectionSettings() {
        try {
            const response = await fetch('/api/admin/section-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(allSettings),
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Section settings saved successfully!');
            await loadSectionSettings();
        } catch (error) {
            console.error('Client - Error saving section settings:', error);
            showNotification('Failed to save section settings.', true);
        }
    }

    function applySectionSettings(settings) {
        document.querySelectorAll('.section-toggle').forEach(header => {
            const sectionName = header.textContent.trim();
            if (settings[sectionName] !== undefined) {
                const isExpanded = settings[sectionName];
                header.nextElementSibling.style.display = isExpanded ? 'block' : 'none';
                header.classList.toggle('expanded', isExpanded);
            }
        });
    }

    async function loadStatistics() {
        // Unchanged from previous version
        const statsTab = document.getElementById('stats-tab');
        if (!statsTab) return;
        try {
            const timeFrame = statsTimeframe.value;
            const response = await fetch(`/api/admin/stats?timeFrame=${timeFrame}`, { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const stats = await response.json();
            statsTab.innerHTML = `
                <div class="chart-container"><h3>Visits Over Time</h3><canvas id="visits-chart"></canvas></div>
                <p>Stats for ${timeFrame}: Teachers: ${stats.totalTeachers}, Votes: ${stats.totalVotes}, Visits: ${stats.totalVisits}</p>
            `;
            // Chart initialization would go here if Chart.js is included
        } catch (error) {
            console.error('Client - Error loading statistics:', error);
            statsTab.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
        }
    }

    async function loadFooterSettings() {
        // Unchanged from previous version
        try {
            const response = await fetch('/api/footer-settings', { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const settings = await response.json();
            document.getElementById('footer-email-input').value = settings.email || '';
            document.getElementById('footer-message-input').value = settings.message || '';
            document.getElementById('footer-show-message').checked = settings.showMessage ?? false;
            footerMessageStatus.textContent = 'Footer settings loaded.';
        } catch (error) {
            console.error('Client - Error loading footer settings:', error);
            footerMessageStatus.textContent = `Error: ${error.message}`;
            footerMessageStatus.className = 'error-message';
        }
    }

    async function loadMessageSettings() {
        // Unchanged from previous version
        try {
            const response = await fetch('/api/message-settings', { credentials: 'include', headers: { 'X-CSRF-Token': csrfToken } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const settings = await response.json();
            document.getElementById('main-message').value = settings.message || '';
            document.getElementById('show-main-message').checked = settings.showMessage ?? false;
            messageStatus.textContent = 'Message settings loaded.';
        } catch (error) {
            console.error('Client - Error loading message settings:', error);
            messageStatus.textContent = `Error: ${error.message}`;
            messageStatus.className = 'error-message';
        }
    }

    async function saveMessageSettings() {
        // Unchanged from previous version
        const message = sanitizeInput(document.getElementById('main-message').value);
        const showMessage = document.getElementById('show-main-message').checked;
        try {
            const response = await fetch('/api/admin/message-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ message, showMessage }),
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Message settings saved!');
            await loadMessageSettings();
        } catch (error) {
            console.error('Client - Error saving message settings:', error);
            showNotification('Error saving message settings.', true);
        }
    }

    async function saveFooterSettings() {
        // Unchanged from previous version
        const email = sanitizeInput(document.getElementById('footer-email-input').value);
        const message = sanitizeInput(document.getElementById('footer-message-input').value);
        const showMessage = document.getElementById('footer-show-message').checked;
        try {
            const response = await fetch('/api/admin/footer-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ email, message, showMessage }),
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Footer settings saved!');
            await loadFooterSettings();
        } catch (error) {
            console.error('Client - Error saving footer settings:', error);
            showNotification('Error saving footer settings.', true);
        }
    }

    // Event Listeners
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tabContent = document.getElementById(`${btn.dataset.tab}-tab`);
            if (tabContent) tabContent.classList.add('active');

            updateDropdownVisibility(btn.dataset.tab);
            switch (btn.dataset.tab) {
                case 'teachers': loadTeachers(); break;
                case 'votes': loadVotes(); break;
                case 'proposals': loadTeacherProposals(); break;
                case 'corrections': loadCorrections(); break;
                case 'settings':
                    loadMessageSettings();
                    loadFooterSettings();
                    break;
                case 'stats': loadStatistics(); break;
            }
            loadSectionSettings();
        });
    });

    document.querySelectorAll('.section-toggle').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isExpanded = content.style.display === 'none' || content.style.display === '';
            content.style.display = isExpanded ? 'block' : 'none';
            header.classList.toggle('expanded', isExpanded);
            const sectionName = header.textContent.trim();
            allSettings[sectionName] = isExpanded;
            const toggle = document.querySelector(`#toggle-${sectionName.replace(/\s+/g, '-')}`);
            if (toggle) toggle.checked = isExpanded;
        });
    });

    teacherForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(teacherForm);
        try {
            const response = await fetch('/api/teachers', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrfToken },
                body: formData,
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Teacher added successfully!');
            teacherForm.reset();
            loadTeachers();
        } catch (error) {
            console.error('Client - Error adding teacher:', error);
            showNotification('Error adding teacher.', true);
        }
    });

    footerSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveFooterSettings();
    });

    messageSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveMessageSettings();
    });

    teacherSearch.addEventListener('input', () => loadTeachers(1));
    teachersPerPageSelect.addEventListener('change', () => loadTeachers(1));
    teacherSort.addEventListener('change', () => loadTeachers(1));
    teacherSortDirection.addEventListener('change', () => loadTeachers(1));
    voteSearch.addEventListener('input', () => loadVotes(1));
    votesPerPageSelect.addEventListener('change', () => loadVotes(1));
    voteSort.addEventListener('change', () => loadVotes(1));
    voteSortDirection.addEventListener('change', () => loadVotes(1));
    statsTimeframe.addEventListener('change', loadStatistics);

    window.toggleTeacherDetails = (teacherId) => {
        const detailsRow = document.getElementById(`teacher-details-${teacherId}`);
        if (detailsRow) detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.updateTeacher = async (id) => {
        const formData = new FormData();
        formData.append('id', sanitizeInput(document.getElementById(`edit-id-detail-${id}`).textContent));
        formData.append('name', sanitizeInput(document.getElementById(`edit-name-${id}`).textContent));
        formData.append('description', sanitizeInput(document.getElementById(`edit-desc-${id}`).textContent));
        try {
            const response = await fetch(`/api/admin/teachers/${id}`, {
                method: 'PUT',
                headers: { 'X-CSRF-Token': csrfToken },
                body: formData,
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Teacher updated successfully!');
            allTeachers = [];
            loadTeachers();
        } catch (error) {
            console.error('Client - Error updating teacher:', error);
            showNotification('Error updating teacher.', true);
        }
    };

    window.showDeleteTeacherModal = (id, name) => {
        showModal('Confirm Deletion', `Are you sure you want to delete ${name}?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/teachers/${id}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-Token': csrfToken },
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Teacher deleted successfully!');
                allTeachers = [];
                loadTeachers();
            } catch (error) {
                console.error('Client - Error deleting teacher:', error);
                showNotification('Error deleting teacher.', true);
            }
        });
    };

    window.updateVote = async (voteId) => {
        const voteData = {
            rating: parseInt(document.getElementById(`edit-rating-${voteId}`).textContent),
            comment: sanitizeInput(document.getElementById(`edit-comment-${voteId}`).textContent)
        };
        if (isNaN(voteData.rating) || voteData.rating < 1 || voteData.rating > 5) {
            showNotification('Rating must be between 1 and 5.', true);
            return;
        }
        try {
            const response = await fetch(`/api/admin/votes/${voteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(voteData),
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Vote updated successfully!');
            loadVotes();
        } catch (error) {
            console.error('Client - Error updating vote:', error);
            showNotification('Error updating vote.', true);
        }
    };

    window.showDeleteVoteModal = (voteId) => {
        showModal('Confirm Deletion', `Are you sure you want to delete vote ID ${voteId}?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/votes/${voteId}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-Token': csrfToken },
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Vote deleted successfully!');
                loadVotes();
            } catch (error) {
                console.error('Client - Error deleting vote:', error);
                showNotification('Error deleting vote.', true);
            }
        });
    };

    window.approveProposal = (proposalId) => {
        showModal('Approve Proposal', `Assign a Teacher ID for proposal ${proposalId}:`, 'Approve', async () => {
            const teacherId = document.getElementById('teacher-id')?.value.trim();
            if (!teacherId) {
                showNotification('Teacher ID is required.', true);
                return;
            }
            try {
                const response = await fetch(`/api/admin/teacher-proposals/approve/${proposalId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify({ id: teacherId }),
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Proposal approved successfully!');
                loadTeacherProposals();
                allTeachers = [];
                loadTeachers();
            } catch (error) {
                console.error('Client - Error approving proposal:', error);
                showNotification('Error approving proposal.', true);
            }
        }, '<input type="text" id="teacher-id" placeholder="e.g., T123">');
    };

    window.showDeleteProposalModal = (proposalId, name) => {
        showModal('Confirm Deletion', `Are you sure you want to delete proposal for ${name}?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/teacher-proposals/${proposalId}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-Token': csrfToken },
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Proposal deleted successfully!');
                loadTeacherProposals();
            } catch (error) {
                console.error('Client - Error deleting proposal:', error);
                showNotification('Error deleting proposal.', true);
            }
        });
    };

    window.implementCorrection = (correctionId) => {
        showModal('Implement Correction', `Implement correction ID ${correctionId}?`, 'Implement', async () => {
            try {
                const response = await fetch(`/api/admin/corrections/${correctionId}/implement`, {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': csrfToken },
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Correction implemented successfully!');
                loadCorrections();
                allTeachers = [];
                loadTeachers();
            } catch (error) {
                console.error('Client - Error implementing correction:', error);
                showNotification('Error implementing correction.', true);
            }
        });
    };

    window.showDeleteCorrectionModal = (correctionId) => {
        showModal('Confirm Deletion', `Delete correction ID ${correctionId}?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/corrections/${correctionId}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-Token': csrfToken },
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Correction deleted successfully!');
                loadCorrections();
            } catch (error) {
                console.error('Client - Error deleting correction:', error);
                showNotification('Error deleting correction.', true);
            }
        });
    };

    window.logout = async () => {
        document.cookie = 'adminToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;';
        showNotification('Logged out successfully!');
        setTimeout(() => window.location.href = '/pages/admin/login.html', 1000);
    };

    // Initial load
    const isAuthenticated = await checkAdminStatus();
    if (isAuthenticated) {
        loadTeachers();
        loadVotes();
        loadTeacherProposals();
        loadCorrections();
        await loadSectionSettings();
        loadMessageSettings();
        loadFooterSettings();
        loadStatistics();
        const defaultTabBtn = document.querySelector('.tab-btn[data-tab="teachers"]');
        if (defaultTabBtn) defaultTabBtn.click();
    }
});