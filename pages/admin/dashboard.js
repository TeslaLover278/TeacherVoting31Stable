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
    const notification = document.getElementById('notification');
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

    // Check for missing elements
    const missingElements = [];
    if (!teacherForm) missingElements.push('teacher-form');
    if (!teachersTable) missingElements.push('teachers-table');
    if (!votesTable) missingElements.push('votes-table');
    if (!proposalsTable) missingElements.push('proposals-table');
    if (!teachersMessage) missingElements.push('teachers-message');
    if (!votesMessage) missingElements.push('votes-message');
    if (!proposalMessage) missingElements.push('proposal-message');
    if (!notification) missingElements.push('notification');
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

    if (missingElements.length > 0) {
        console.error('Client - Required elements for dashboard not found:', missingElements);
        return;
    }
    console.log('Client - All required elements found, proceeding with dashboard setup');

    // Notification function
    function showNotification(messageText, isError = false) {
        notification.textContent = messageText;
        notification.style.display = 'block';
        notification.style.backgroundColor = isError ? '#FF0000' : '#00B7D1';
        setTimeout(() => notification.style.display = 'none', 3000);
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
            document.getElementById('footer-email').value = settings.email;
            document.getElementById('footer-message').value = settings.message;
            document.getElementById('footer-show-message').checked = settings.showMessage;
            footerMessageStatus.textContent = 'Footer settings loaded.';
            footerMessageStatus.className = 'info-message';
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
            document.getElementById('main-show-message').checked = settings.showMessage;
            messageStatus.textContent = 'Message settings loaded.';
            messageStatus.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading message settings:', error.message);
            messageStatus.textContent = 'Error loading message settings.';
            messageStatus.className = 'error-message';
            showNotification('Error loading message settings.', true);
        }
    }

    // Handle footer settings form submission
    footerSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(footerSettingsForm);
        const settingsData = {
            email: formData.get('email'),
            message: formData.get('message'),
            showMessage: formData.get('showMessage') === 'on'
        };
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
            } else {
                throw new Error(data.error || 'Failed to save footer settings');
            }
        } catch (error) {
            console.error('Client - Error saving footer settings:', error.message);
            footerMessageStatus.textContent = 'Error saving footer settings.';
            footerMessageStatus.className = 'error-message';
            showNotification('Error saving footer settings.', true);
        }
    });

    // Handle message settings form submission
    messageSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(messageSettingsForm);
        const settingsData = {
            message: formData.get('message'),
            showMessage: formData.get('showMessage') === 'on'
        };
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
            } else {
                throw new Error(data.error || 'Failed to save message settings');
            }
        } catch (error) {
            console.error('Client - Error saving message settings:', error.message);
            messageStatus.textContent = 'Error saving message settings.';
            messageStatus.className = 'error-message';
            showNotification('Error saving message settings.', true);
        }
    });

    // Handle teacher form submission
    teacherForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(teacherForm);
        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = formData.get(`schedule[${i}][subject]`);
            const grade = formData.get(`schedule[${i}][grade]`);
            if (subject || grade) {
                schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
            }
        }
        const teacherData = {
            id: formData.get('id'),
            name: formData.get('name'),
            bio: formData.get('bio'),
            description: formData.get('description'),
            classes: formData.get('classes').split(',').map(c => c.trim()),
            tags: formData.get('tags').split(',').map(t => t.trim()),
            room_number: formData.get('room_number'),
            schedule: schedule,
            image_link: formData.get('image_link') || ''
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
            teachersMessage.textContent = 'Error adding teacher.';
            teachersMessage.className = 'error-message';
            showNotification('Error adding teacher.', true);
        }
    });

    // Load teachers with sorting, searching, and pagination
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
                                    <td>${teacher.id}</td>
                                    <td>${teacher.name}</td>
                                    <td>${teacher.description}</td>
                                    <td>
                                        <button class="delete-btn" onclick="event.stopPropagation(); deleteTeacher('${teacher.id}')">Delete</button>
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
                                            <button class="update-btn" onclick="updateTeacher('${teacher.id}')">Update</button>
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

    // Load votes with sorting, searching, and pagination
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
                return sortDirection === 'asc' ? valueA > valueB ? 1 : -1 : valueB > valueA ? 1 : -1;
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
                                    <button class="update-btn" onclick="updateVote('${vote.teacher_id}')">Update</button>
                                    <button class="delete-btn" onclick="deleteVote('${vote.teacher_id}')">Delete</button>
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
                                    <button class="expand-btn" onclick="toggleProposalDetails('${proposal.id}')">Expand</button>
                                    <button class="approve-btn" onclick="approveProposal('${proposal.id}')">Approve</button>
                                    <button class="delete-btn" onclick="deleteProposal('${proposal.id}')">Delete</button>
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
            showNotification('Error loading proposals. Redirecting to login...', true);
            setTimeout(() => window.location.href = '/pages/admin/login.html', 2000);
        }
    }

    // Global functions for table interactions
    window.toggleProposalDetails = (proposalId) => {
        const detailsRow = document.getElementById(`details-${proposalId}`);
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.toggleTeacherDetails = (teacherId) => {
        const detailsRow = document.getElementById(`teacher-details-${teacherId}`);
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.updateTeacher = async (id) => {
        const teacherData = {
            id,
            name: document.getElementById(`edit-name-${id}`).textContent,
            description: document.getElementById(`edit-desc-${id}`).textContent,
            bio: document.getElementById(`edit-bio-${id}`).textContent,
            classes: document.getElementById(`edit-classes-${id}`).textContent.split(',').map(c => c.trim()),
            tags: document.getElementById(`edit-tags-${id}`).textContent.split(',').map(t => t.trim()),
            room_number: document.getElementById(`edit-room-${id}`).textContent,
            image_link: document.getElementById(`edit-image-${id}`).textContent,
            schedule: [] // Note: Editable schedule not implemented here; could be added
        };
        try {
            const response = await fetch(`/api/admin/teachers/${id}`, {
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

    window.deleteTeacher = async (id) => {
        if (confirm('Are you sure you want to delete this teacher?')) {
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
        }
    };

    window.updateVote = async (teacherId) => {
        const voteData = {
            rating: parseInt(document.getElementById(`edit-rating-${teacherId}`).textContent),
            comment: document.getElementById(`edit-comment-${teacherId}`).textContent
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

    window.deleteVote = async (teacherId) => {
        if (confirm('Are you sure you want to delete this vote?')) {
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
        }
    };

    window.approveProposal = async (proposalId) => {
        if (confirm('Are you sure you want to approve this teacher proposal?')) {
            try {
                const response = await fetch(`/api/admin/teacher-proposals/approve/${proposalId}`, {
                    method: 'POST',
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
        }
    };

    window.deleteProposal = async (proposalId) => {
        if (confirm('Are you sure you want to delete this teacher proposal?')) {
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
        }
    };

    window.logout = () => {
        document.cookie = 'adminToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.location.href = '/pages/admin/login.html';
    };

    // Event listeners for filtering and sorting
    teacherSearch.addEventListener('input', loadTeachers);
    teachersPerPageSelect.addEventListener('change', loadTeachers);
    teacherSort.addEventListener('change', loadTeachers);
    teacherSortDirection.addEventListener('change', loadTeachers);
    voteSearch.addEventListener('input', loadVotes);
    votesPerPageSelect.addEventListener('change', loadVotes);
    voteSort.addEventListener('change', loadVotes);
    voteSortDirection.addEventListener('change', loadVotes);

    // Initialize dashboard if authenticated
    const isAuthenticated = await checkAdminStatus();
    if (isAuthenticated) {
        loadTeachers();
        loadVotes();
        loadTeacherProposals();
        loadFooterSettings();
        loadMessageSettings();
    }
});