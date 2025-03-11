document.addEventListener('DOMContentLoaded', async () => {
    console.log('Client - Dashboard script loaded, initializing...');

    // Query all required elements
    const teacherForm = document.getElementById('teacher-form');
    const teachersTable = document.getElementById('teachers-table');
    const votesTable = document.getElementById('votes-table');
    const proposalsTable = document.getElementById('proposals-table');
    const teachersMessage = document.getElementById('teachers-message');
    const votesMessage = document.getElementById('votes-message');
    const proposalMessage = document.getElementById('proposal-message');
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

    // Check for missing elements
    const missingElements = [];
    if (!teacherForm) missingElements.push('teacher-form');
    if (!teachersTable) missingElements.push('teachers-table');
    if (!votesTable) missingElements.push('votes-table');
    if (!proposalsTable) missingElements.push('proposals-table');
    if (!teachersMessage) missingElements.push('teachers-message');
    if (!votesMessage) missingElements.push('votes-message');
    if (!proposalMessage) missingElements.push('proposal-message');
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

    if (missingElements.length > 0) {
        console.error('Client - Required elements for dashboard not found:', missingElements);
        showNotification('Dashboard initialization failed due to missing elements.', true);
        return;
    }
    console.log('Client - All required elements found, proceeding with dashboard setup');

    // Notification function
    function showNotification(messageText, isError = false) {
        const notification = document.createElement('div');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = messageText;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // Reusable modal function
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

    // Check admin authentication
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

    // Load footer settings
    async function loadFooterSettings() {
        try {
            const response = await fetch('/api/footer-settings', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch footer settings');
            const settings = await response.json();
            document.getElementById('footer-email-input').value = settings.email; // Adjusted ID
            document.getElementById('footer-message-input').value = settings.message; // Adjusted ID
            document.getElementById('footer-show-message').checked = settings.showMessage;
            footerMessageStatus.textContent = 'Footer settings loaded.';
            const footerEmail = document.getElementById('footer-email');
            const footerMessageDisplay = document.getElementById('footer-message');
            if (footerEmail) footerEmail.innerHTML = `Email: <a href="mailto:${settings.email}">${settings.email}</a>`;
            if (footerMessageDisplay) {
                footerMessageDisplay.textContent = settings.message;
                footerMessageDisplay.style.display = settings.showMessage ? 'block' : 'none';
            }
        } catch (error) {
            console.error('Client - Error loading footer settings:', error.message);
            footerMessageStatus.textContent = 'Error loading footer settings.';
            footerMessageStatus.className = 'error-message';
            showNotification('Error loading footer settings.', true);
        }
    }

    // Load message settings
    async function loadMessageSettings() {
        try {
            const response = await fetch('/api/message-settings', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch message settings');
            const settings = await response.json();
            document.getElementById('main-message').value = settings.message;
            document.getElementById('show-main-message').checked = settings.showMessage; // Adjusted ID
            messageStatus.textContent = 'Message settings loaded.';
        } catch (error) {
            console.error('Client - Error loading message settings:', error.message);
            messageStatus.textContent = 'Error loading message settings.';
            messageStatus.className = 'error-message';
            showNotification('Error loading message settings.', true);
        }
    }

    // Save message settings
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
                messageStatus.textContent = 'Message settings saved successfully!';
                messageStatus.className = 'info-message';
                showNotification('Message settings saved successfully!');
                loadMessageSettings();
            } else {
                throw new Error(data.error || 'Failed to save message settings');
            }
        } catch (error) {
            console.error('Client - Error saving message settings:', error.message);
            messageStatus.textContent = 'Error saving message settings.';
            messageStatus.className = 'error-message';
            showNotification('Error saving message settings.', true);
        }
    }

    // Save footer settings
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
                footerMessageStatus.textContent = 'Footer settings saved successfully!';
                footerMessageStatus.className = 'info-message';
                showNotification('Footer settings saved successfully!');
                loadFooterSettings();
            } else {
                throw new Error(data.error || 'Failed to save footer settings');
            }
        } catch (error) {
            console.error('Client - Error saving footer settings:', error.message);
            footerMessageStatus.textContent = 'Error saving footer settings.';
            footerMessageStatus.className = 'error-message';
            showNotification('Error saving footer settings.', true);
        }
    }

    // Toggle sections
    document.querySelectorAll('.section-toggle').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
            header.classList.toggle('expanded');
        });
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tabContent = document.getElementById(`${btn.dataset.tab}-tab`);
            tabContent.classList.add('active');
            if (btn.dataset.tab === 'stats') loadStatistics();
        });
    });

    // Handle form submissions and toggle clicks
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

    // Handle teacher form submission
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
        const teacherData = {
            id: formData.get('id').trim(),
            name: formData.get('name').trim(),
            bio: formData.get('bio').trim(),
            description: formData.get('description').trim(),
            classes: formData.get('classes').split(',').map(c => c.trim()).filter(c => c),
            tags: formData.get('tags').split(',').map(t => t.trim()).filter(t => t),
            room_number: formData.get('room_number').trim(),
            schedule,
            image_link: formData.get('image_link')?.trim() || ''
        };
        try {
            const response = await fetch('/api/teachers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teacherData),
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

    // Load teachers
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
                                            <p><strong>Name:</strong> <span contenteditable="true" id="edit-name-${teacher.id}">${teacher.name}</span></p>
                                            <p><strong>Description:</strong> <span contenteditable="true" id="edit-desc-${teacher.id}">${teacher.description}</span></p>
                                            <p><strong>Bio:</strong> <span contenteditable="true" id="edit-bio-${teacher.id}">${teacher.bio || 'N/A'}</span></p>
                                            <p><strong>Classes:</strong> <span contenteditable="true" id="edit-classes-${teacher.id}">${teacher.classes.join(', ')}</span></p>
                                            <p><strong>Tags:</strong> <span contenteditable="true" id="edit-tags-${teacher.id}">${teacher.tags.join(', ')}</span></p>
                                            <p><strong>Room Number:</strong> <span contenteditable="true" id="edit-room-${teacher.id}">${teacher.room_number}</span></p>
                                            <p><strong>Image Link:</strong> <span contenteditable="true" id="edit-image-${teacher.id}">${teacher.image_link || 'N/A'}</span></p>
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

    // Load votes
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
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paginatedVotes.map(vote => `
                            <tr>
                                <td>${vote.teacher_id}</td>
                                <td contenteditable="true" id="edit-rating-${vote.teacher_id}">${vote.rating}</td>
                                <td contenteditable="true" id="edit-comment-${vote.teacher_id}">${vote.comment || ''}</td>
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

    // Load teacher proposals
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

    // Load statistics
    let visitsChart, proposalsChart, topTeachersChart;
    async function loadStatistics() {
        try {
            const timeFrame = statsTimeframe.value;
            const response = await fetch(`/api/admin/stats?timeFrame=${timeFrame}`, { credentials: 'include' });
            const stats = await response.json();
            if (!response.ok) throw new Error(stats.error || 'Failed to load stats');

            const visitsCtx = document.getElementById('visits-chart').getContext('2d');
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

            const proposalsCtx = document.getElementById('proposals-chart').getContext('2d');
            if (proposalsChart) proposalsChart.destroy();
            proposalsChart = new Chart(proposalsCtx, {
                type: 'pie',
                data: {
                    labels: ['Approved', 'Denied', 'Pending'],
                    datasets: [{
                        data: [
                            stats.proposalApprovedPercent,
                            stats.proposalDeniedPercent,
                            (100 - parseFloat(stats.proposalApprovedPercent) - parseFloat(stats.proposalDeniedPercent)).toFixed(2)
                        ],
                        backgroundColor: ['#00B7D1', '#FF0000', '#e0e0e0']
                    }]
                }
            });

            const topTeachersCtx = document.getElementById('top-teachers-chart').getContext('2d');
            if (topTeachersChart) topTeachersChart.destroy();
            topTeachersChart = new Chart(topTeachersCtx, {
                type: 'bar',
                data: {
                    labels: stats.topTeachers.map(t => t.name),
                    datasets: [{
                        label: 'Votes',
                        data: stats.topTeachers.map(t => t.voteCount),
                        backgroundColor: '#00B7D1'
                    }]
                },
                options: { scales: { y: { beginAtZero: true } } }
            });

            document.getElementById('stats-message').textContent = `Stats for ${timeFrame}: Total Teachers: ${stats.totalTeachers}, Votes: ${stats.totalVotes}, Visits: ${stats.totalVisits}, Unique: ${stats.uniqueVisits}, Avg Visits: ${stats.avgVisits}`;
        } catch (error) {
            console.error('Client - Error loading statistics:', error.message);
            document.getElementById('stats-message').textContent = 'Error loading statistics.';
            showNotification('Error loading statistics.', true);
        }
    }

    // Global functions
    window.toggleProposalDetails = (proposalId) => {
        const detailsRow = document.getElementById(`details-${proposalId}`);
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.toggleTeacherDetails = (teacherId) => {
        const detailsRow = document.getElementById(`teacher-details-${teacherId}`);
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.updateTeacher = async (oldId) => {
        let newId = document.getElementById(`edit-id-${oldId}`).textContent.trim();
        const allTeachers = (await (await fetch('/api/teachers?perPage=100', { credentials: 'include' })).json()).teachers;
        if (allTeachers.some(t => t.id === newId && t.id !== oldId)) newId += '1'; // Handle duplicate IDs
        const teacherData = {
            id: newId,
            name: document.getElementById(`edit-name-${oldId}`).textContent.trim(),
            description: document.getElementById(`edit-desc-${oldId}`).textContent.trim(),
            bio: document.getElementById(`edit-bio-${oldId}`).textContent.trim(),
            classes: document.getElementById(`edit-classes-${oldId}`).textContent.split(',').map(c => c.trim()).filter(c => c),
            tags: document.getElementById(`edit-tags-${oldId}`).textContent.split(',').map(t => t.trim()).filter(t => t),
            room_number: document.getElementById(`edit-room-${oldId}`).textContent.trim(),
            schedule: [], // Schedule editing not implemented
            image_link: document.getElementById(`edit-image-${oldId}`).textContent.trim()
        };
        try {
            const response = await fetch(`/api/admin/teachers/${oldId}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teacherData),
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                teachersMessage.textContent = data.message;
                showNotification(data.message);
                loadTeachers();
                loadVotes(); // Reflect ID change in votes
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
            votesMessage.textContent = 'Error updating vote.';
            votesMessage.className = 'error-message';
            showNotification('Error updating vote.', true);
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

    window.logout = () => {
        document.cookie = 'adminToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.location.href = '/pages/admin/login.html';
    };

    // Event listeners for filtering, sorting, and navigation
    teacherSearch.addEventListener('input', loadTeachers);
    teachersPerPageSelect.addEventListener('change', loadTeachers);
    teacherSort.addEventListener('change', loadTeachers);
    teacherSortDirection.addEventListener('change', loadTeachers);
    voteSearch.addEventListener('input', loadVotes);
    votesPerPageSelect.addEventListener('change', loadVotes);
    voteSort.addEventListener('change', loadVotes);
    voteSortDirection.addEventListener('change', loadVotes);
    statsTimeframe.addEventListener('change', loadStatistics);
    document.querySelector('.logo').addEventListener('click', () => window.location.href = '/');
    document.querySelector('.submit-teacher-btn').addEventListener('click', () => window.location.href = '/pages/submit-teacher.html');

    // Initialize dashboard if authenticated
    const isAuthenticated = await checkAdminStatus();
    if (isAuthenticated) {
        loadTeachers();
        loadVotes();
        loadTeacherProposals();
        loadFooterSettings();
        loadMessageSettings();
        // Statistics loaded on tab click
    }
});