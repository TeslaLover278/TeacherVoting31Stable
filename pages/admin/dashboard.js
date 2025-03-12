document.addEventListener('DOMContentLoaded', async () => {
    console.log('Client - Dashboard script loaded, initializing...');

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

    const missingElements = [];
    if (!teacherForm) missingElements.push('teacher-form');
    if (!teachersTable) missingElements.push('teachers-table');
    if (!votesTable) missingElements.push('votes-table');
    if (!proposalsTable) missingElements.push('proposals-table');
    if (!correctionsTable) missingElements.push('corrections-table');
    if (!teachersMessage) missingElements.push('teachers-message');
    if (!votesMessage) missingElements.push('votes-message');
    if (!proposalMessage) missingElements.push('proposal-message');
    if (!correctionsMessage) missingElements.push('corrections-message');
    if (!voteSearch) missingElements.push('vote-search');
    if (!votesPerPageSelect) missingElements.push('votes-per-page');
    if (!voteSort) missingElements.push('vote-sort');
    if (!voteSortDirection) missingElements.push('vote-sort-direction');
    if (!teacherSearch) missingElements.push('teacher-search');
    if (!teachersPerPageSelect) missingElements.push('teachers-per-page');
    if (!teacherSort) missingElements.push('teacher-sort');
    if (!teacherSortDirection) missingElements.push('teacher-sort-direction');
    if (!footerSettingsForm) missingElements.push('footer-settings-form');
    if (!footerMessageStatus) missingElements.push('footer-message-status');
    if (!messageSettingsForm) missingElements.push('message-settings-form');
    if (!messageStatus) missingElements.push('message-status');
    if (!statsTimeframe) missingElements.push('stats-timeframe');
    if (!sectionSettingsContainer) missingElements.push('section-settings-container');

    if (missingElements.length > 0) {
        console.error('Client - Required elements for dashboard not found:', missingElements);
        showNotification('Dashboard initialization failed due to missing elements.', true);
        return;
    }
    console.log('Client - All required elements found, proceeding with dashboard setup');

    function showNotification(messageText, isError = false) {
        const notification = document.getElementById('notification');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = messageText;
        notification.style.display = 'block';
        setTimeout(() => notification.style.display = 'none', 3000);
    }

    function showModal(title, message, confirmText, onConfirm, extraContent = '') {
        const modalHtml = `
            <div class="modal active">
                <div class="modal-content" role="dialog" aria-labelledby="modal-title" aria-modal="true">
                    <h2 id="modal-title">${title}</h2>
                    <p>${message}</p>
                    ${extraContent}
                    <button id="confirm-action" class="modal-btn">${confirmText}</button>
                    <button id="cancel-action" class="modal-btn">Cancel</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.querySelector('.modal');
        document.getElementById('confirm-action').addEventListener('click', async () => {
            await onConfirm();
            modal.remove();
        });
        document.getElementById('cancel-action').addEventListener('click', () => modal.remove());
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.remove(); }, { once: true });
    }

    async function checkAdminStatus() {
        try {
            const response = await fetch('/api/admin/votes', { credentials: 'include' });
            if (!response.ok) throw new Error('Not authenticated');
            return true;
        } catch (error) {
            console.error('Client - Admin check failed:', error.message);
            window.location.href = '/pages/admin/login.html';
            return false;
        }
    }
	
    async function loadFooterSettings() {
        try {
            const response = await fetch('/api/footer-settings', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch footer settings');
            const settings = await response.json();
            document.getElementById('footer-email-input').value = settings.email;
            document.getElementById('footer-message-input').value = settings.message;
            document.getElementById('footer-show-message').checked = settings.showMessage;
            if (footerMessageStatus) {
                footerMessageStatus.textContent = 'Footer settings loaded.';
            }
            const footerEmail = document.getElementById('footer-email');
            const footerMessageDisplay = document.getElementById('footer-message');
            if (footerEmail) footerEmail.innerHTML = `Email: <a href="mailto:${settings.email}">${settings.email}</a>`;
            if (footerMessageDisplay) {
                footerMessageDisplay.textContent = settings.message;
                footerMessageDisplay.style.display = settings.showMessage ? 'block' : 'none';
            }
        } catch (error) {
            console.error('Client - Error loading footer settings:', error.message);
            if (footerMessageStatus) {
                footerMessageStatus.textContent = 'Error loading footer settings.';
                footerMessageStatus.className = 'error-message';
            }
            showNotification('Error loading footer settings.', true);
        }
    }

    async function loadMessageSettings() {
        try {
            const response = await fetch('/api/message-settings', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch message settings');
            const settings = await response.json();
            document.getElementById('main-message').value = settings.message;
            document.getElementById('show-main-message').checked = settings.showMessage;
            if (messageStatus) {
                messageStatus.textContent = 'Message settings loaded.';
            }
            updateMainMessagePreview(settings);
        } catch (error) {
            console.error('Client - Error loading message settings:', error.message);
            if (messageStatus) {
                messageStatus.textContent = 'Error loading message settings.';
                messageStatus.className = 'error-message';
            }
            showNotification('Error loading message settings.', true);
        }
    }

    function updateMainMessagePreview(settings) {
        let mainMessagePopup = document.querySelector('.main-message-preview');
        if (!mainMessagePopup) {
            document.body.insertAdjacentHTML('beforeend', `
                <div class="main-message-preview" style="display: none; position: fixed; top: 10%; left: 50%; transform: translateX(-50%); z-index: 1000;">
                    <p id="main-message-preview-text"></p>
                    <button class="close-btn">×</button>
                </div>
            `);
            mainMessagePopup = document.querySelector('.main-message-preview');
            mainMessagePopup.querySelector('.close-btn').addEventListener('click', () => {
                mainMessagePopup.style.display = 'none';
            });
        }
        const messageText = mainMessagePopup.querySelector('#main-message-preview-text');
        messageText.textContent = settings.message;
        mainMessagePopup.style.display = settings.showMessage ? 'block' : 'none';
        const mainMessageDiv = document.getElementById('main-message');
        if (mainMessageDiv) mainMessageDiv.style.display = 'none';
    }

    async function saveMessageSettings() {
        const message = document.getElementById('main-message').value;
        const showMessage = document.getElementById('show-main-message').checked;
        const settingsData = { message, showMessage };
        console.log('Client - Saving message settings:', settingsData);
        try {
            const response = await fetch('/api/admin/message-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsData),
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                if (messageStatus) {
                    messageStatus.textContent = 'Message settings saved successfully!';
                    messageStatus.className = 'info-message';
                }
                showNotification('Message settings saved successfully!');
                loadMessageSettings();
            } else {
                throw new Error(data.error || 'Failed to save message settings');
            }
        } catch (error) {
            console.error('Client - Error saving message settings:', error.message);
            if (messageStatus) {
                messageStatus.textContent = 'Error saving message settings.';
                messageStatus.className = 'error-message';
            }
            showNotification('Error saving message settings.', true);
        }
    }

    async function saveFooterSettings() {
        const email = document.getElementById('footer-email-input').value;
        const message = document.getElementById('footer-message-input').value;
        const showMessage = document.getElementById('footer-show-message').checked;
        const settingsData = { email, message, showMessage };
        console.log('Client - Saving footer settings:', settingsData);
        try {
            const response = await fetch('/api/admin/footer-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsData),
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                if (footerMessageStatus) {
                    footerMessageStatus.textContent = 'Footer settings saved successfully!';
                    footerMessageStatus.className = 'info-message';
                }
                showNotification('Footer settings saved successfully!');
                loadFooterSettings();
            } else {
                throw new Error(data.error || 'Failed to save footer settings');
            }
        } catch (error) {
            console.error('Client - Error saving footer settings:', error.message);
            if (footerMessageStatus) {
                footerMessageStatus.textContent = 'Error saving footer settings.';
                footerMessageStatus.className = 'error-message';
            }
            showNotification('Error saving footer settings.', true);
        }
    }

    async function loadSectionSettings() {
        try {
            const response = await fetch('/api/admin/section-settings', { credentials: 'include' });
            let settings;
            if (!response.ok) {
                settings = {
                    "Add New Teacher": false,
                    "Manage Teachers": false,
                    "Manage Votes": false,
                    "Teacher Proposals": false,
                    "Corrections": true,
                    "Main Message Settings": true,
                    "Footer Settings": true,
                    "Statistics": false
                };
            } else {
                settings = await response.json();
                settings["Main Message Settings"] = settings["Main Message Settings"] ?? true;
                settings["Footer Settings"] = settings["Footer Settings"] ?? true;
                settings["Corrections"] = settings["Corrections"] ?? true;
            }

            sectionSettingsContainer.innerHTML = `
                ${Object.entries(settings).map(([section, isExpanded]) => `
                    <div class="form-group toggle-group">
                        <label>${section}:</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggle-${section.replace(/\s+/g, '-')}" data-section="${section}" ${isExpanded ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <span class="toggle-status">${isExpanded ? 'Expanded' : 'Collapsed'}</span>
                    </div>
                `).join('')}
            `;

            document.querySelectorAll('.toggle-group input[type="checkbox"]').forEach(toggle => {
                toggle.addEventListener('change', (e) => {
                    const sectionName = e.target.dataset.section;
                    const isExpanded = e.target.checked;
                    e.target.nextElementSibling.nextElementSibling.textContent = isExpanded ? 'Expanded' : 'Collapsed';
                    const header = Array.from(document.querySelectorAll('.section-toggle')).find(h => h.textContent.trim() === sectionName);
                    const content = header?.nextElementSibling;
                    if (header && content) {
                        content.style.display = isExpanded ? 'block' : 'none';
                        header.classList.toggle('expanded', isExpanded);
                    }
                });
            });

            document.getElementById('save-section-settings').addEventListener('click', saveSectionSettings);
            applySectionSettings(settings);
        } catch (error) {
            console.error('Client - Error loading section settings:', error.message);
            sectionSettingsContainer.innerHTML = '<p class="error-message">Error loading section settings.</p>';
            showNotification('Error loading section settings.', true);
        }
    }

    async function saveSectionSettings() {
        const settings = {};
        document.querySelectorAll('.toggle-group input[type="checkbox"]').forEach(toggle => {
            const sectionName = toggle.dataset.section;
            settings[sectionName] = toggle.checked;
        });
        console.log('Client - Saving section settings:', settings);
        try {
            const response = await fetch('/api/admin/section-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                showNotification('Section settings saved successfully!');
                applySectionSettings(settings);
            } else {
                throw new Error(data.error || 'Failed to save section settings');
            }
        } catch (error) {
            console.error('Client - Error saving section settings:', error.message);
            showNotification('Error saving section settings.', true);
        }
    }

    function applySectionSettings(settings) {
        document.querySelectorAll('.section-toggle').forEach(header => {
            const sectionName = header.textContent.trim();
            const content = header.nextElementSibling;
            if (settings[sectionName] !== undefined) {
                content.style.display = settings[sectionName] ? 'block' : 'none';
                header.classList.toggle('expanded', settings[sectionName]);
            }
        });
    }

    document.querySelectorAll('.section-toggle').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isExpanded = content.style.display === 'none';
            content.style.display = isExpanded ? 'block' : 'none';
            header.classList.toggle('expanded');
            const toggle = document.querySelector(`#toggle-${header.textContent.trim().replace(/\s+/g, '-')}`);
            if (toggle) {
                toggle.checked = isExpanded;
                toggle.nextElementSibling.nextElementSibling.textContent = isExpanded ? 'Expanded' : 'Collapsed';
            } else {
                console.warn(`Toggle element not found for section: ${header.textContent.trim()}`);
            }
        });
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tabContent = document.getElementById(`${btn.dataset.tab}-tab`);
            tabContent.classList.add('active');
            if (btn.dataset.tab === 'stats') loadStatistics();
            if (btn.dataset.tab === 'settings') {
                loadSectionSettings();
                loadMessageSettings();
                loadFooterSettings();
            }
            if (btn.dataset.tab === 'corrections') loadCorrections();
        });
    });

    footerSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveFooterSettings();
    });

    messageSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveMessageSettings();
    });

    const mainShowMessage = document.getElementById('show-main-message');
    const footerShowMessage = document.getElementById('footer-show-message');
    const mainToggleSwitch = messageSettingsForm.querySelector('.toggle-switch');
    const footerToggleSwitch = footerSettingsForm.querySelector('.toggle-switch');

    if (mainShowMessage) {
        mainShowMessage.addEventListener('change', saveMessageSettings);
        mainToggleSwitch.addEventListener('click', (e) => {
            if (e.target !== mainShowMessage) {
                mainShowMessage.checked = !mainShowMessage.checked;
                saveMessageSettings();
            }
        });
    } else {
        console.warn('Client - show-main-message element not found');
    }

    if (footerShowMessage) {
        footerShowMessage.addEventListener('change', saveFooterSettings);
        footerToggleSwitch.addEventListener('click', (e) => {
            if (e.target !== footerShowMessage) {
                footerShowMessage.checked = !footerShowMessage.checked;
                saveFooterSettings();
            }
        });
    } else {
        console.warn('Client - footer-show-message element not found');
    }

    teacherForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(teacherForm);
        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = formData.get(`schedule[${i}][subject]`)?.trim();
            const grade = formData.get(`schedule[${i}][grade]`)?.trim();
            if (subject || grade) {
                schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
            }
        }
        formData.set('schedule', JSON.stringify(schedule));

        try {
            const response = await fetch('/api/teachers', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                teachersMessage.textContent = 'Teacher added successfully!';
                teachersMessage.className = 'info-message';
                showNotification('Teacher added successfully!');
                teacherForm.reset();
                loadTeachers();
            } else {
                throw new Error(data.error || 'Failed to add teacher');
            }
        } catch (error) {
            console.error('Client - Error adding teacher:', error.message);
            teachersMessage.textContent = 'Error adding teacher: ' + error.message;
            teachersMessage.className = 'error-message';
            showNotification('Error adding teacher.', true);
        }
    });

    async function loadTeachers() {
        try {
            const response = await fetch('/api/teachers?perPage=100', { credentials: 'include' });
            const data = await response.json();
            if (response.ok) {
                let teachers = data.teachers;
                const searchQuery = teacherSearch.value.toLowerCase();
                const sortField = teacherSort.value;
                const sortDirection = teacherSortDirection.value;
                const perPage = parseInt(teachersPerPageSelect.value) || 10;

                if (searchQuery) {
                    teachers = teachers.filter(teacher =>
                        teacher.id.toLowerCase().includes(searchQuery) ||
                        teacher.name.toLowerCase().includes(searchQuery)
                    );
                }

                teachers.sort((a, b) => {
                    const valueA = a[sortField].toString().toLowerCase();
                    const valueB = b[sortField].toString().toLowerCase();
                    return sortDirection === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
                });

                const paginatedTeachers = teachers.slice(0, perPage);

                teachersTable.innerHTML = `
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${paginatedTeachers.map(teacher => `
                                <tr onclick="toggleTeacherDetails('${teacher.id}')" style="cursor: pointer;">
                                    <td contenteditable="true" id="edit-id-${teacher.id}">${teacher.id}</td>
                                    <td>${teacher.name}</td>
                                    <td>${teacher.description}</td>
                                    <td>
                                        <button class="delete-btn" onclick="event.stopPropagation(); showDeleteTeacherModal('${teacher.id}', '${teacher.name}')">Delete</button>
                                    </td>
                                </tr>
                                <tr id="teacher-details-${teacher.id}" class="teacher-details" style="display: none;">
                                    <td colspan="4">
                                        <div class="teacher-details-content">
                                            <p><strong>ID:</strong> <span contenteditable="true" id="edit-id-detail-${teacher.id}">${teacher.id}</span></p>
                                            <p><strong>Name:</strong> <span contenteditable="true" id="edit-name-${teacher.id}">${teacher.name}</span></p>
                                            <p><strong>Description:</strong> <span contenteditable="true" id="edit-desc-${teacher.id}">${teacher.description}</span></p>
                                            <p><strong>Bio:</strong> <span contenteditable="true" id="edit-bio-${teacher.id}">${teacher.bio || 'N/A'}</span></p>
                                            <p><strong>Classes:</strong> <span contenteditable="true" id="edit-classes-${teacher.id}">${teacher.classes.join(', ')}</span></p>
                                            <p><strong>Tags:</strong> <span contenteditable="true" id="edit-tags-${teacher.id}">${teacher.tags.join(', ')}</span></p>
                                            <p><strong>Room Number:</strong> <span contenteditable="true" id="edit-room-${teacher.id}">${teacher.room_number}</span></p>
                                            <p><strong>Current Image:</strong> ${teacher.image_link ? `<img src="${teacher.image_link}" alt="${teacher.name}" style="max-width: 100px;">` : 'N/A'}</p>
                                            <p><strong>Update Image:</strong> <input type="file" id="edit-image-${teacher.id}" name="image" accept="image/jpeg, image/png"></p>
                                            <p><strong>Schedule:</strong></p>
                                            <div class="schedule-edit">
                                                ${[0, 1, 2, 3].map(i => `
                                                    <div class="schedule-block">
                                                        <label>Block ${i + 1}:</label>
                                                        <input type="text" id="edit-schedule-${teacher.id}-${i}-subject" value="${teacher.schedule[i]?.subject || ''}" placeholder="Subject">
                                                        <input type="text" id="edit-schedule-${teacher.id}-${i}-grade" value="${teacher.schedule[i]?.grade || ''}" placeholder="Grade">
                                                    </div>
                                                `).join('')}
                                            </div>
                                            <button class="submit-btn" onclick="updateTeacher('${teacher.id}')">Update</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>`;
                teachersMessage.textContent = `Loaded ${paginatedTeachers.length} of ${teachers.length} teachers (total: ${data.teachers.length}).`;
                teachersMessage.className = 'info-message';
            } else {
                throw new Error(data.error || 'Failed to load teachers');
            }
        } catch (error) {
            console.error('Client - Error loading teachers:', error.message);
            teachersMessage.textContent = 'Error loading teachers.';
            teachersMessage.className = 'error-message';
            showNotification('Error loading teachers.', true);
        }
    }

async function loadVotes() {
    try {
        const response = await fetch('/api/admin/votes', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch votes');
        let allVotes = await response.json();
        const searchQuery = voteSearch.value.toLowerCase();
        const sortField = voteSort.value;
        const sortDirection = voteSortDirection.value;
        const perPage = parseInt(votesPerPageSelect.value) || 10;

        if (searchQuery) {
            allVotes = allVotes.filter(vote => vote.teacher_id.toLowerCase().includes(searchQuery));
        }

        allVotes.sort((a, b) => {
            const valueA = sortField === 'rating' ? a[sortField] : a[sortField].toString().toLowerCase();
            const valueB = sortField === 'rating' ? b[sortField] : b[sortField].toString().toLowerCase();
            return sortDirection === 'asc' ? (valueA > valueB ? 1 : -1) : (valueB > valueA ? 1 : -1);
        });

        const paginatedVotes = allVotes.slice(0, perPage);

        votesTable.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Teacher ID</th>
                        <th>Rating</th>
                        <th>Comment</th>
                        <th>Explicit</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${paginatedVotes.map(vote => `
                        <tr>
                            <td>${vote.teacher_id}</td>
                            <td contenteditable="true" id="edit-rating-${vote.teacher_id}">${vote.rating}</td>
                            <td contenteditable="true" id="edit-comment-${vote.teacher_id}">${vote.comment || ''}</td>
                            <td>${vote.is_explicit ? 'Yes' : 'No'}</td>
                            <td>
                                <button class="submit-btn" onclick="updateVote('${vote.teacher_id}')">Update</button>
                                <button class="delete-btn" onclick="showDeleteVoteModal('${vote.teacher_id}')">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        votesMessage.textContent = `Loaded ${paginatedVotes.length} of ${allVotes.length} votes (total: ${allVotes.length}).`;
        votesMessage.className = 'info-message';
    } catch (error) {
        console.error('Client - Error loading votes:', error.message);
        votesMessage.textContent = 'Error loading votes.';
        votesMessage.className = 'error-message';
        showNotification('Error loading votes.', true);
    }
}
    async function loadTeacherProposals() {
        try {
            const response = await fetch('/api/admin/teacher-proposals', { credentials: 'include' });
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            const proposals = await response.json();
            proposalsTable.innerHTML = `
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Description</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${proposals.map(proposal => `
                            <tr>
                                <td>${proposal.id}</td>
                                <td>${proposal.name}</td>
                                <td>${proposal.email}</td>
                                <td>${proposal.description}</td>
                                <td>
                                    <button class="toggle-btn" onclick="toggleProposalDetails('${proposal.id}')">Expand</button>
                                    <button class="approve-btn" onclick="approveProposal('${proposal.id}')">Approve</button>
                                    <button class="delete-btn" onclick="showDeleteProposalModal('${proposal.id}', '${proposal.name}')">Delete</button>
                                </td>
                            </tr>
                            <tr id="details-${proposal.id}" class="proposal-details" style="display: none;">
                                <td colspan="5">
                                    <div class="proposal-details-content">
                                        <p><strong>Bio:</strong> ${proposal.bio}</p>
                                        <p><strong>Classes:</strong> ${proposal.classes.join(', ')}</p>
                                        <p><strong>Tags:</strong> ${proposal.tags.join(', ')}</p>
                                        <p><strong>Room Number:</strong> ${proposal.room_number}</p>
                                        <p><strong>Image Link:</strong> ${proposal.image_link || 'N/A'}</p>
                                        <p><strong>Schedule:</strong></p>
                                        <ul>
                                            ${proposal.schedule.map(block => `
                                                <li>${block.block}: ${block.subject} (Grade: ${block.grade})</li>
                                            `).join('')}
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            proposalMessage.textContent = `Loaded ${proposals.length} teacher proposals.`;
            proposalMessage.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading teacher proposals:', error.message);
            proposalMessage.textContent = 'Error loading proposals.';
            proposalMessage.className = 'error-message';
            showNotification('Error loading proposals.', true);
        }
    }

    async function loadCorrections() {
        try {
            const response = await fetch('/api/admin/corrections', { credentials: 'include' });
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            const corrections = await response.json();
            correctionsTable.innerHTML = `
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Teacher</th>
                            <th>Suggestion</th>
                            <th>File</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${corrections.map(c => `
                            <tr>
                                <td>${c.id}</td>
                                <td>${c.teacher_name || c.teacher_id}</td>
                                <td>${c.suggestion}</td>
                                <td>${c.file_path ? `<a href="${c.file_path}" target="_blank">View</a>` : 'N/A'}</td>
                                <td>${new Date(c.submitted_at).toLocaleString()}</td>
                                <td>
                                    <button class="submit-btn" onclick="implementCorrection(${c.id})">Implement</button>
                                    <button class="delete-btn" onclick="showDeleteCorrectionModal(${c.id})">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            correctionsMessage.textContent = `Loaded ${corrections.length} corrections.`;
            correctionsMessage.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading corrections:', error.message);
            correctionsMessage.textContent = 'Error loading corrections.';
            correctionsMessage.className = 'error-message';
            showNotification('Error loading corrections.', true);
        }
    }

    let visitsChart, proposalsChart, topTeachersChart;
    async function loadStatistics() {
        try {
            const timeFrame = statsTimeframe.value;
            const response = await fetch(`/api/admin/stats?timeFrame=${timeFrame}`, { credentials: 'include' });
            const stats = await response.json();
            if (!response.ok) throw new Error(stats.error || 'Failed to load stats');

            const visitsCtx = document.getElementById('visits-chart')?.getContext('2d');
            if (visitsCtx) {
                if (visitsChart) visitsChart.destroy();
                visitsChart = new Chart(visitsCtx, {
                    type: 'bar',
                    data: {
                        labels: stats.visitsOverTime.map(v => v.time),
                        datasets: [{
                            label: 'Visits',
                            data: stats.visitsOverTime.map(v => v.count),
                            backgroundColor: '#00B7D1'
                        }]
                    },
                    options: { scales: { y: { beginAtZero: true } } }
                });
            }

            const proposalsCtx = document.getElementById('proposals-chart')?.getContext('2d');
            if (proposalsCtx) {
                if (proposalsChart) proposalsChart.destroy();
                proposalsChart = new Chart(proposalsCtx, {
                    type: 'pie',
                    data: {
                        labels: ['Approved', 'Denied', 'Pending'],
                        datasets: [{
                            data: [
                                parseFloat(stats.proposalApprovedPercent) || 0,
                                parseFloat(stats.proposalDeniedPercent) || 0,
                                (100 - (parseFloat(stats.proposalApprovedPercent) || 0) - (parseFloat(stats.proposalDeniedPercent) || 0)).toFixed(2)
                            ],
                            backgroundColor: ['#00B7D1', '#FF0000', '#e0e0e0']
                        }]
                    }
                });
            }

            const topTeachersCtx = document.getElementById('top-teachers-chart')?.getContext('2d');
            if (topTeachersCtx) {
                if (topTeachersChart) topTeachersChart.destroy();
                topTeachersChart = new Chart(topTeachersCtx, {
                    type: 'bar',
                    data: {
                        labels: stats.topTeachers?.map(t => t.name) || [],
                        datasets: [{
                            label: 'Votes',
                            data: stats.topTeachers?.map(t => t.voteCount) || [],
                            backgroundColor: '#00B7D1'
                        }]
                    },
                    options: { scales: { y: { beginAtZero: true } } }
                });
            }

            document.getElementById('stats-message').textContent = `Stats for ${timeFrame}: Total Teachers: ${stats.totalTeachers}, Votes: ${stats.totalVotes}, Visits: ${stats.totalVisits}, Unique: ${stats.uniqueVisits}, Avg Visits: ${stats.avgVisits}`;
        } catch (error) {
            console.error('Client - Error loading statistics:', error.message);
            document.getElementById('stats-message').textContent = 'Error loading statistics.';
            showNotification('Error loading statistics.', true);
        }
    }

    window.toggleProposalDetails = (proposalId) => {
        const detailsRow = document.getElementById(`details-${proposalId}`);
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.toggleTeacherDetails = (teacherId) => {
        const detailsRow = document.getElementById(`teacher-details-${teacherId}`);
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.updateTeacher = async (oldId) => {
        const formData = new FormData();
        let newId = document.getElementById(`edit-id-detail-${oldId}`).textContent.trim();
        const allTeachers = (await (await fetch('/api/teachers?perPage=100', { credentials: 'include' })).json()).teachers;
        if (allTeachers.some(t => t.id === newId && t.id !== oldId)) newId += '1';
        formData.append('id', newId);
        formData.append('name', document.getElementById(`edit-name-${oldId}`).textContent.trim());
        formData.append('description', document.getElementById(`edit-desc-${oldId}`).textContent.trim());
        formData.append('bio', document.getElementById(`edit-bio-${oldId}`).textContent.trim());
        formData.append('classes', document.getElementById(`edit-classes-${oldId}`).textContent.trim());
        formData.append('tags', document.getElementById(`edit-tags-${oldId}`).textContent.trim());
        formData.append('room_number', document.getElementById(`edit-room-${oldId}`).textContent.trim());

        // Collect updated schedule
        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = document.getElementById(`edit-schedule-${oldId}-${i}-subject`).value.trim();
            const grade = document.getElementById(`edit-schedule-${oldId}-${i}-grade`).value.trim();
            if (subject || grade) {
                schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
            }
        }
        formData.append('schedule', JSON.stringify(schedule));

        const imageInput = document.getElementById(`edit-image-${oldId}`);
        if (imageInput.files.length > 0) {
            formData.append('image', imageInput.files[0]);
        }

        try {
            const response = await fetch(`/api/admin/teachers/${oldId}/rename`, {
                method: 'PUT',
                body: formData,
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                teachersMessage.textContent = data.message;
                showNotification(data.message);
                loadTeachers();
                loadVotes();
            } else {
                throw new Error(data.error || 'Failed to update teacher');
            }
        } catch (error) {
            console.error('Client - Error updating teacher:', error.message);
            teachersMessage.textContent = 'Error updating teacher.';
            teachersMessage.className = 'error-message';
            showNotification('Error updating teacher.', true);
        }
    };

    window.showDeleteTeacherModal = (id, name) => {
        showModal('Confirm Deletion', `Are you sure you want to delete ${name}?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/teachers/${id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    teachersMessage.textContent = data.message;
                    showNotification(data.message);
                    loadTeachers();
                } else {
                    throw new Error(data.error || 'Failed to delete teacher');
                }
            } catch (error) {
                console.error('Client - Error deleting teacher:', error.message);
                teachersMessage.textContent = 'Error deleting teacher.';
                teachersMessage.className = 'error-message';
                showNotification('Error deleting teacher.', true);
            }
        });
    };

    window.updateVote = async (teacherId) => {
        const voteData = {
            rating: parseInt(document.getElementById(`edit-rating-${teacherId}`).textContent),
            comment: document.getElementById(`edit-comment-${teacherId}`).textContent.trim()
        };
        if (isNaN(voteData.rating) || voteData.rating < 1 || voteData.rating > 5) {
            showNotification('Rating must be between 1 and 5.', true);
            return;
        }
        try {
            const response = await fetch(`/api/admin/votes/${teacherId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(voteData),
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                votesMessage.textContent = data.message;
                showNotification(data.message);
                loadVotes();
            } else {
                throw new Error(data.error || 'Failed to update vote');
            }
        } catch (error) {
            console.error('Client - Error updating vote:', error.message);
            votesMessage.textContent = `Error updating vote for teacher ${teacherId}: ${error.message}`;
            votesMessage.className = 'error-message';
            if (error.message === 'Vote not found') {
                showNotification(`No vote found for teacher ${teacherId}. Please ensure a vote exists before updating.`, true);
            } else {
                showNotification(`Failed to update vote for teacher ${teacherId}. Check server logs for details.`, true);
            }
        }
    };

    window.showDeleteVoteModal = (teacherId) => {
        showModal('Confirm Deletion', `Are you sure you want to delete the vote for teacher ID ${teacherId}?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/votes/${teacherId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    votesMessage.textContent = data.message;
                    showNotification(data.message);
                    loadVotes();
                } else {
                    throw new Error(data.error || 'Failed to delete vote');
                }
            } catch (error) {
                console.error('Client - Error deleting vote:', error.message);
                votesMessage.textContent = 'Error deleting vote.';
                votesMessage.className = 'error-message';
                showNotification('Error deleting vote.', true);
            }
        });
    };

    window.approveProposal = (proposalId) => {
        showModal('Approve Teacher Proposal', `Assign a unique Teacher ID for this proposal (Temp ID: ${proposalId}):`, 'Approve', async () => {
            const teacherId = document.getElementById('teacher-id').value.trim();
            if (!teacherId) {
                showNotification('Teacher ID is required.', true);
                return;
            }
            try {
                const response = await fetch(`/api/admin/teacher-proposals/approve/${proposalId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: teacherId }),
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    proposalMessage.textContent = data.message;
                    proposalMessage.className = 'info-message';
                    showNotification(data.message);
                    loadTeacherProposals();
                    loadTeachers();
                } else {
                    throw new Error(data.error || 'Failed to approve proposal');
                }
            } catch (error) {
                console.error('Client - Error approving proposal:', error.message);
                proposalMessage.textContent = 'Error approving proposal.';
                proposalMessage.className = 'error-message';
                showNotification('Error approving proposal.', true);
            }
        }, `<div class="form-group"><label for="teacher-id">Teacher ID:</label><input type="text" id="teacher-id" name="id" required placeholder="e.g., T123"></div>`);
    };

    window.showDeleteProposalModal = (proposalId, name) => {
        showModal('Confirm Deletion', `Are you sure you want to delete the proposal for ${name} (ID: ${proposalId})?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/teacher-proposals/${proposalId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    proposalMessage.textContent = data.message;
                    proposalMessage.className = 'info-message';
                    showNotification(data.message);
                    loadTeacherProposals();
                } else {
                    throw new Error(data.error || 'Failed to delete proposal');
                }
            } catch (error) {
                console.error('Client - Error deleting proposal:', error.message);
                proposalMessage.textContent = 'Error deleting proposal.';
                proposalMessage.className = 'error-message';
                showNotification('Error deleting proposal.', true);
            }
        });
    };

    window.implementCorrection = (correctionId) => {
        showModal('Implement Correction', `Are you sure you want to implement correction ID ${correctionId}? This will update the teacher record.`, 'Implement', async () => {
            try {
                const response = await fetch(`/api/admin/corrections/${correctionId}/implement`, {
                    method: 'POST',
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    correctionsMessage.textContent = data.message;
                    correctionsMessage.className = 'info-message';
                    showNotification(data.message);
                    loadCorrections();
                    loadTeachers();
                } else {
                    throw new Error(data.error || 'Failed to implement correction');
                }
            } catch (error) {
                console.error('Client - Error implementing correction:', error.message);
                correctionsMessage.textContent = 'Error implementing correction.';
                correctionsMessage.className = 'error-message';
                showNotification('Error implementing correction.', true);
            }
        });
    };

    window.showDeleteCorrectionModal = (correctionId) => {
        showModal('Confirm Deletion', `Are you sure you want to delete correction ID ${correctionId}?`, 'Delete', async () => {
            try {
                const response = await fetch(`/api/admin/corrections/${correctionId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    correctionsMessage.textContent = data.message;
                    correctionsMessage.className = 'info-message';
                    showNotification(data.message);
                    loadCorrections();
                } else {
                    throw new Error(data.error || 'Failed to delete correction');
                }
            } catch (error) {
                console.error('Client - Error deleting correction:', error.message);
                correctionsMessage.textContent = 'Error deleting correction.';
                correctionsMessage.className = 'error-message';
                showNotification('Error deleting correction.', true);
            }
        });
    };

    window.logout = async () => {
        try {
            document.cookie = 'adminToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            window.location.href = '/pages/admin/login.html';
        } catch (error) {
            console.error('Logout failed:', error);
            showNotification('Logout failed. Please try again.', true);
        }
    };

    teacherSearch.addEventListener('input', loadTeachers);
    teachersPerPageSelect.addEventListener('change', loadTeachers);
    teacherSort.addEventListener('change', loadTeachers);
    teacherSortDirection.addEventListener('change', loadTeachers);
    voteSearch.addEventListener('input', loadVotes);
    votesPerPageSelect.addEventListener('change', loadVotes);
    voteSort.addEventListener('change', loadVotes);
    voteSortDirection.addEventListener('change', loadVotes);
    statsTimeframe.addEventListener('change', loadStatistics);
    document.querySelector('.logo')?.addEventListener('click', () => window.location.href = '/');
    document.querySelector('.submit-teacher-btn')?.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');

    const isAuthenticated = await checkAdminStatus();
    if (isAuthenticated) {
        loadTeachers();
        loadVotes();
        loadTeacherProposals();
        loadCorrections();
        loadSectionSettings();
    }
});