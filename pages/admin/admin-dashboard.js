document.addEventListener('DOMContentLoaded', async () => {
    const BASE_URL = window.location.origin;
    console.log('Client - Dashboard script loaded, initializing...');

    // Import permission utilities
    const { hasPermission, getAdminPermissions } = await import('/utils/permissions.js');

    // Permission requirements for each tab and operation
    const TAB_PERMISSIONS = {
        'teachers': 'manage_teachers',
        'votes': 'view_votes',
        'suggestions': 'manage_suggestions',
        'requests': 'manage_requests',
        'proposals': 'manage_proposals',
        'corrections': 'manage_corrections',
        'accounts': 'manage_accounts',
        'settings': 'manage_settings'
    };

    // Check admin status before initializing anything
    async function verifyAdminStatus() {
        try {
            const response = await fetch(`${BASE_URL}/api/admin/verify`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Not authenticated');
            }
            
            const data = await response.json();
            if (!data.loggedIn) {
                throw new Error('Not logged in');
            }
            
            return true;
        } catch (error) {
            console.error('Client - Admin check failed:', error);
            // Clear any stored data
            localStorage.removeItem('adminPermissions');
            state.token = null;
            state.data = {
                teachers: [],
                votes: [],
                suggestions: [],
                requests: [],
                proposals: [],
                corrections: [],
                accounts: { users: [], admins: [], totalUsers: 0, totalAdmins: 0 },
                settings: {},
                spotlight: { teacherId: null, name: '' }
            };
            
            // Redirect to login
            window.location.href = '/pages/admin/login.html';
            return false;
        }
    }

    // Hide all admin content initially
    function hideAdminContent() {
        const adminElements = document.querySelectorAll('.tab-content, .tab-nav, .admin-section');
        adminElements.forEach(el => {
            el.style.display = 'none';
        });
    }

    // Show admin content only after verification and permission check
    function showAdminContent() {
        const adminElements = document.querySelectorAll('.tab-content, .tab-nav, .admin-section');
        adminElements.forEach(el => {
            // Check if element is a tab
            const tabId = el.getAttribute('data-tab');
            if (tabId && TAB_PERMISSIONS[tabId]) {
                // Only show if user has permission
                el.style.display = hasPermission(TAB_PERMISSIONS[tabId]) ? '' : 'none';
            } else {
                el.style.display = '';
            }
        });

        // Hide tab buttons for tabs user doesn't have permission for
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const tabName = btn.getAttribute('data-tab');
            if (tabName && TAB_PERMISSIONS[tabName]) {
                btn.style.display = hasPermission(TAB_PERMISSIONS[tabName]) ? '' : 'none';
            }
        });
    }

    // Hide content initially
    hideAdminContent();

    // Initial admin verification
    const initialAuthCheck = await verifyAdminStatus();
    if (!initialAuthCheck) {
        return; // Stop initialization if not authenticated
    }

    // Show content if authenticated
    showAdminContent();

    // Continue with initialization...
    // Centralized state management
    const state = {
        csrfToken: '',
        token: localStorage.getItem('adminToken') || getCookie('adminToken'),
        data: {
            teachers: [],
            votes: [],
            suggestions: [],
            requests: [],
            proposals: [],
            corrections: [],
            accounts: { users: [], admins: [], totalUsers: 0, totalAdmins: 0 },
            settings: {},
            spotlight: { teacherId: null, name: '' },
        },
        pages: {
            teachers: 1,
            votes: 1,
            suggestions: 1,
            requests: 1,
            accounts: 1,
        },
        activeTab: 'teachers',
    };

    console.log('Client - BASE_URL set to:', BASE_URL);

    // Element references with lazy loading via Proxy
    const elements = new Proxy({}, {
        get: (target, prop) => target[prop] || (target[prop] = document.getElementById(prop)),
    });

    // Utility: Get cookie
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        return parts.length === 2 ? parts.pop().split(';').shift() : null;
    }

    // Validate critical elements
    const requiredIds = [
        'teacher-submit-form', 'teachers-table', 'votes-table', 'proposals-table', 'corrections-table',
        'suggestions-table', 'admin-requests-table', 'teachers-message', 'votes-message',
        'proposal-message', 'corrections-message', 'suggestions-message', 'admin-requests-message',
        'teacher-search', 'teachers-per-page', 'teacher-sort', 'teacher-sort-direction',
        'vote-search', 'votes-per-page', 'vote-sort', 'vote-sort-direction', 'vote-teacher-id-filter',
        'vote-teacher-name-filter', 'vote-comment-filter', 'vote-rating-filter',
        'suggestion-search', 'suggestions-per-page', 'suggestion-sort', 'suggestion-sort-direction',
        'request-search', 'requests-per-page', 'request-sort', 'request-sort-direction',
        'footer-settings-form', 'footer-message-status', 'message-settings-form', 'message-status',
        'stats-timeframe', 'section-settings-container', 'tab-nav', 'add-teacher-message',
        'accounts-table', 'accounts-message', 'accounts-per-page', 'create-account-form', // Added for new tab
    ];
    const missingElements = requiredIds.filter(id => !elements[id]);
    if (missingElements.length > 0) {
        console.warn('Client - Some required elements not found:', missingElements);
        showNotification('Some features may not work due to missing elements.', true);
    }

    // Fetch CSRF token
    try {
        const csrfResponse = await fetch(`${BASE_URL}/api/csrf-token`, { credentials: 'include' });
        if (!csrfResponse.ok) throw new Error(`HTTP ${csrfResponse.status}`);
        state.csrfToken = (await csrfResponse.json()).csrfToken;
        console.log('Client - CSRF token fetched:', state.csrfToken);
        document.querySelector('meta[name="csrf-token"]')?.setAttribute('content', state.csrfToken);
        document.querySelectorAll('input[name="_csrf"]').forEach(input => input.value = state.csrfToken);
    } catch (error) {
        console.error('Client - Failed to fetch CSRF token:', error.message);
        showNotification('Security initialization failed.', true);
        return;
    }

    // Utility: Show notification
    function showNotification(messageText, isError = false) {
        let notification = elements['notification'];
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            document.body.appendChild(notification);
            elements['notification'] = notification;
        }
        notification.className = `notification ${isError ? 'error' : 'success'} active`;
        notification.textContent = messageText;
        notification.style.display = 'block';
        notification.style.opacity = '0';
        requestAnimationFrame(() => notification.style.opacity = '1');
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.addEventListener('transitionend', () => {
                notification.style.display = 'none';
                notification.classList.remove('active');
            }, { once: true });
        }, 3000);
    }

    // Utility: Show modal
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
        const confirmBtn = document.getElementById('confirm-action');
        const cancelBtn = document.getElementById('cancel-action');
        confirmBtn.addEventListener('click', async () => { await onConfirm(); modal.remove(); });
        cancelBtn.addEventListener('click', () => modal.remove());
    }

    // Utility: Sanitize input
    function sanitizeInput(input) {
        return window.DOMPurify ? DOMPurify.sanitize(input || '') : input || '';
    }

    // Utility: Debounce
    function debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    // Logout function
    async function handleLogout() {
        try {
            const response = await fetch('/api/auth/admin/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': state.csrfToken
                },
                credentials: 'include'
            });

            if (response.ok) {
                // Clear all client-side storage
                localStorage.clear(); // Clear all localStorage items
                sessionStorage.clear(); // Clear all sessionStorage items
                
                // Clear state
                state.token = null;
                state.csrfToken = '';
                state.data = {
                    teachers: [],
                    votes: [],
                    suggestions: [],
                    requests: [],
                    proposals: [],
                    corrections: [],
                    accounts: { users: [], admins: [], totalUsers: 0, totalAdmins: 0 },
                    settings: {},
                    spotlight: { teacherId: null, name: '' }
                };

                // Clear cookies by setting expired date
                document.cookie.split(";").forEach(function(c) { 
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                });
                
                // Hide admin content
                document.querySelectorAll('.admin-only').forEach(el => {
                    el.style.display = 'none';
                });

                // Redirect to login page
                window.location.href = '/pages/admin/login.html';
            } else {
                console.error('Logout failed:', response.status);
                showNotification('Logout failed. Please try again.', true);
            }
        } catch (error) {
            console.error('Logout error:', error);
            showNotification('Logout failed. Please try again.', true);
        }
    }

    // Make logout function available globally
    window.handleLogout = handleLogout;

    // Add logout button to UI if not present
    if (!document.getElementById('admin-logout-btn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'admin-logout-btn';
        logoutBtn.textContent = 'Logout';
        logoutBtn.className = 'logout-btn';
        logoutBtn.style.position = 'fixed';
        logoutBtn.style.top = '20px';
        logoutBtn.style.right = '20px';
        logoutBtn.style.zIndex = '10000';
        logoutBtn.onclick = handleLogout;
        document.body.appendChild(logoutBtn);
    }

    // Update dropdown visibility
    function updateDropdownVisibility(activeTab) {
        const dropdowns = [
            'teacher-search', 'teachers-per-page', 'teacher-sort', 'teacher-sort-direction',
            'vote-search', 'votes-per-page', 'vote-sort', 'vote-sort-direction',
            'vote-teacher-id-filter', 'vote-teacher-name-filter', 'vote-comment-filter', 'vote-rating-filter',
            'suggestion-search', 'suggestions-per-page', 'suggestion-sort', 'suggestion-sort-direction',
            'request-search', 'requests-per-page', 'request-sort', 'request-sort-direction',
            'stats-timeframe', 'accounts-per-page'
        ].map(id => elements[id]);
        dropdowns.forEach(el => el?.parentElement && (el.parentElement.style.display = 'none'));
        const showDropdowns = (ids) => ids.forEach(id => elements[id]?.parentElement && (elements[id].parentElement.style.display = 'block'));
        switch (activeTab) {
            case 'teachers':
                showDropdowns(['teacher-search', 'teachers-per-page', 'teacher-sort', 'teacher-sort-direction']);
                break;
            case 'votes':
                showDropdowns([
                    'vote-search', 'votes-per-page', 'vote-sort', 'vote-sort-direction',
                    'vote-teacher-id-filter', 'vote-teacher-name-filter', 'vote-comment-filter', 'vote-rating-filter'
                ]);
                break;
            case 'suggestions':
                showDropdowns(['suggestion-search', 'suggestions-per-page', 'suggestion-sort', 'suggestion-sort-direction']);
                break;
            case 'admin-requests':
                showDropdowns(['request-search', 'requests-per-page', 'request-sort', 'request-sort-direction']);
                break;
            case 'stats':
                elements['stats-timeframe']?.parentElement && (elements['stats-timeframe'].parentElement.style.display = 'block');
                break;
            case 'accounts':
                showDropdowns(['accounts-per-page']);
                break;
            case 'create-account':
                // No dropdowns needed for create-account tab
                break;
        }
    }

async function fetchData(endpoint, params = {}, options = {}, retries = 2) {
    // Ensure endpoint starts with a slash
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let url;
    try {
        url = new URL(normalizedEndpoint, BASE_URL);
    } catch (error) {
        console.error(`Client - Invalid URL construction: BASE_URL=${BASE_URL}, endpoint=${endpoint}`, error);
        throw new Error(`Invalid URL: ${error.message}`);
    }
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    console.log(`Client - Fetching: ${url.toString()}`);
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken, ...options.headers },
                credentials: 'include',
                ...options,
            });
            if (res.status === 401) {
                console.error('Client - Unauthorized, logging out');
                await handleLogout();
                return null;
            }
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorText}`);
            }
            const data = await res.json();
            console.log(`Client - Fetched ${endpoint}:`, data);
            return data;
        } catch (error) {
            console.error(`Client - Fetch attempt ${attempt + 1} failed for ${endpoint}:`, error.message);
            if (attempt === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
}

    // Render table with pagination
    function renderTable(container, data, headers, rowTemplate, page, perPage, total, messageEl, messageText) {
        const start = (page - 1) * perPage;
        const paginated = data.slice(start, start + perPage);
        const totalPages = Math.ceil(total / perPage);
        container.innerHTML = `
            <table class="admin-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>${paginated.map(rowTemplate).join('')}</tbody>
            </table>
            <div class="pagination">
                <button class="pagination-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button>
                <span>Page ${page} of ${totalPages}</span>
                <button class="pagination-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next</button>
            </div>
        `;
        if (messageEl) {
            messageEl.textContent = messageText(paginated.length, total);
            messageEl.className = 'info-message';
        }
    }

async function toggleSpotlight(teacherId, isSpotlight) {
    console.log(`Client - Sending POST to set spotlight: ${teacherId}, ${isSpotlight}`);
    try {
        const response = await fetchData('/api/admin/spotlight', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': state.csrfToken,
                'Authorization': `Bearer ${state.token}`,
                'Cache-Control': 'no-cache, no-store' // Prevent caching
            },
            body: JSON.stringify({ teacherId, isSpotlight })
        });
        console.log(`Client - Spotlight response:`, response);
        if (response && response.success !== false) {
            // Find the teacher name from state
            const teacher = state.data.teachers.find(t => String(t.id) === String(teacherId));
            const name = teacher ? teacher.name : teacherId;
            // Update the current spotlight display
            const spotlightName = document.getElementById('spotlight-name');
            if (spotlightName) {
                spotlightName.textContent = isSpotlight ? name : 'None';
            }
            showNotification(`Spotlight ${isSpotlight ? 'set to' : 'unset for'} ${name}`, false);
        } else {
            showNotification(`Failed to update spotlight.`, true);
        }
        loadTeachers();
    } catch (error) {
        console.error(`Client - Error setting spotlight: ${error.message}`);
        showNotification(`Failed to update spotlight: ${error.message}`, true);
    }
}

// Spotlight tab logic
function populateSpotlightDropdown() {
    const dropdown = document.getElementById('spotlight-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    state.data.teachers.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = t.name;
        dropdown.appendChild(option);
    });
}

async function setSpotlightTeacher() {
    const dropdown = document.getElementById('spotlight-dropdown');
    const message = document.getElementById('spotlight-message');
    const spotlightName = document.getElementById('spotlight-name');
    if (!dropdown) return;
    const teacherId = dropdown.value;
    try {
        const res = await fetch(`/api/admin/spotlight/${teacherId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': state.csrfToken,
                'Authorization': `Bearer ${state.token}`
            }
        });
        const response = await res.json();
        if (res.ok && response && response.success !== false) {
            if (spotlightName) spotlightName.textContent = dropdown.options[dropdown.selectedIndex].text;
            message.textContent = 'Spotlight set successfully!';
            message.className = 'info-message success';
            showNotification('Spotlight set successfully!', false);
        } else {
            message.textContent = 'Failed to set spotlight.';
            message.className = 'info-message error';
            showNotification('Failed to set spotlight.', true);
        }
    } catch (error) {
        message.textContent = 'Failed to set spotlight: ' + error.message;
        message.className = 'info-message error';
        showNotification('Failed to set spotlight: ' + error.message, true);
    }
}

document.getElementById('set-spotlight-btn')?.addEventListener('click', setSpotlightTeacher);

// Tab switching logic for new Spotlight tab
const tabNav = document.getElementById('tab-nav');
if (tabNav) {
    tabNav.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            const tab = e.target.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            document.getElementById(tab)?.classList.add('active');
            if (tab === 'spotlight') {
                populateSpotlightDropdown();
                // Fetch and display current spotlight
                fetchData('/api/spotlight').then(data => {
                    const name = data && data.name ? data.name : 'None';
                    const spotlightName = document.getElementById('spotlight-name');
                    if (spotlightName) spotlightName.textContent = name;
                });
            }
        }
    });
}

// Update listener
document.querySelectorAll('.spotlight-toggle').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
        const teacherId = e.target.dataset.teacherId;
        const isSpotlight = e.target.checked;
        toggleSpotlight(teacherId, isSpotlight);
    });
});

    // Load teachers
async function loadTeachers(page = state.pages.teachers) {
    const table = elements['teachers-table'];
    const message = elements['teachers-message'];
    if (!table || !message) return;
    try {
        if (!state.data.teachers.length) {
            const data = await fetchData('/api/admin/teachers', { perPage: 100 });
            if (!data) return;
            state.data.teachers = Array.isArray(data) ? data : data.teachers || [];
        }
        const searchQuery = elements['teacher-search']?.value.toLowerCase() || '';
        const sortField = elements['teacher-sort']?.value || 'id';
        const sortDirection = elements['teacher-sort-direction']?.value || 'asc';
        const perPage = parseInt(elements['teachers-per-page']?.value) || 10;
        state.pages.teachers = page;

        const teachers = state.data.teachers
            .filter(t => `${t.id} ${t.name}`.toLowerCase().includes(searchQuery))
            .sort((a, b) => {
                const valueA = String(a[sortField] || '').toLowerCase();
                const valueB = String(b[sortField] || '').toLowerCase();
                return sortDirection === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
            });

        renderTable(
            table,
            teachers,
            ['ID', 'Name', 'Description', 'Schedule', 'Tags', 'Actions'],
            t => `
                <tr class="teacher-row" data-id="${t.id}">
                    <td>${sanitizeInput(t.id)}</td>
                    <td>${sanitizeInput(t.name)}</td>
                    <td>${sanitizeInput(t.description)}</td>
                    <td>${sanitizeInput(t.schedule || '')}</td>
                    <td>${sanitizeInput(t.tags || '')}</td>
                    <td>
                        <button class="edit-btn" data-action="edit-teacher" data-id="${t.id}">View</button>
                        <button class="delete-btn" data-action="delete-teacher" data-id="${t.id}" data-name="${sanitizeInput(t.name)}">Delete</button>
                    </td>
                </tr>
                <tr id="teacher-details-${t.id}" class="teacher-details">
                    <td colspan="7">
                        <div class="teacher-details-content">
                            <label>ID: <input type="text" id="edit-id-${t.id}" value="${sanitizeInput(t.id)}" data-original="${sanitizeInput(t.id)}"></label><br>
                            <label>Name: <input type="text" id="edit-name-${t.id}" value="${sanitizeInput(t.name)}" data-original="${sanitizeInput(t.name)}"></label><br>
                            <label>Description: <input type="text" id="edit-desc-${t.id}" value="${sanitizeInput(t.description)}" data-original="${sanitizeInput(t.description)}"></label><br>
                            <label>Schedule: <textarea id="edit-schedule-${t.id}" data-original="${sanitizeInput(t.schedule || '')}">${sanitizeInput(t.schedule || '')}</textarea></label><br>
                            <label>Tags: <input type="text" id="edit-tags-${t.id}" value="${sanitizeInput(t.tags || '')}" data-original="${sanitizeInput(t.tags || '')}"></label><br>
                            <button class="submit-btn" data-action="update-teacher" data-id="${t.id}">Update</button>
                            <span class="edit-status" id="edit-status-${t.id}"></span>
                        </div>
                    </td>
                </tr>
            `,
            page,
            perPage,
            teachers.length,
            message,
            (shown, total) => `Loaded ${shown} of ${total} teachers.`
        );

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const teacherId = btn.dataset.id;
                window.location.href = `/pages/teacher/teacher.html?id=${teacherId}`;
            });
        });

        addButtonListeners();
    } catch (error) {
        console.error('Client - Error loading teachers:', error);
        table.innerHTML = '<p class="error-message">Error loading teachers.</p>';
        message.textContent = `Error: ${error.message}`;
        message.className = 'error-message';
    }
}

window.toggleSpotlight = async (teacherId, setSpotlight) => {
    try {
        const response = await fetch(`${BASE_URL}/api/admin/spotlight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
                'X-CSRF-Token': state.csrfToken,
            },
            credentials: 'include',
            body: JSON.stringify({ teacherId, isSpotlight: setSpotlight }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const data = await response.json();
        showNotification(data.message);
        state.data.teachers = state.data.teachers.map(t => ({
            ...t,
            is_spotlight: t.id === teacherId ? setSpotlight : false,
        }));
        await loadTeachers();
        await loadSpotlight();
    } catch (error) {
        console.error('Client - Error toggling spotlight:', error);
        showNotification(`Error toggling spotlight: ${error.message}`, true);
    }
};

    // Load votes
    async function loadVotes(page = state.pages.votes) {
        const table = elements['votes-table'];
        const message = elements['votes-message'];
        if (!table || !message) return;
        try {
            if (!state.data.teachers.length) {
                const teacherData = await fetchData('/api/admin/teachers', { perPage: 100 });
                if (!teacherData) return;
                state.data.teachers = Array.isArray(teacherData) ? teacherData : teacherData.teachers || [];
            }

            const params = {
                page,
                perPage: parseInt(elements['votes-per-page']?.value) || 10,
                search: encodeURIComponent(elements['vote-search']?.value.toLowerCase() || ''),
                sort: elements['vote-sort']?.value || 'id',
                direction: elements['vote-sort-direction']?.value || 'asc',
                teacherId: encodeURIComponent(elements['vote-teacher-id-filter']?.value.toLowerCase() || ''),
                teacherName: encodeURIComponent(elements['vote-teacher-name-filter']?.value.toLowerCase() || ''),
                comment: encodeURIComponent(elements['vote-comment-filter']?.value.toLowerCase() || ''),
                rating: elements['vote-rating-filter']?.value || ''
            };
            const data = await fetchData('/api/admin/votes', params);
            if (!data) return;
            const { votes, total } = data;
            state.pages.votes = page;

            const votesWithNames = votes.map(v => {
                const teacher = state.data.teachers.find(t => t.id === v.teacher_id);
                return { ...v, teacher_name: teacher ? teacher.name : v.teacher_id };
            });

            const filteredVotes = votesWithNames.filter(v => {
                const matchesTeacherId = !params.teacherId || v.teacher_id.toLowerCase().includes(params.teacherId);
                const matchesTeacherName = !params.teacherName || v.teacher_name.toLowerCase().includes(params.teacherName);
                const matchesComment = !params.comment || (v.comment || '').toLowerCase().includes(params.comment);
                const matchesRating = !params.rating || v.rating.toString() === params.rating;
                return matchesTeacherId && matchesTeacherName && matchesComment && matchesRating;
            });

            renderTable(
                table,
                filteredVotes,
                ['Vote ID', 'Teacher ID', 'Teacher Name', 'Rating', 'Comment', 'Explicit', 'Actions'],
                v => `
                    <tr>
                        <td>${sanitizeInput(v.id)}</td>
                        <td>${sanitizeInput(v.teacher_id)}</td>
                        <td>${sanitizeInput(v.teacher_name)}</td>
                        <td contenteditable="true" id="edit-rating-${v.id}">${sanitizeInput(v.rating)}</td>
                        <td contenteditable="true" id="edit-comment-${v.id}">${sanitizeInput(v.comment || '')}</td>
                        <td>${v.is_explicit ? 'Yes' : 'No'}</td>
                        <td>
                            <button class="submit-btn" data-action="update-vote" data-id="${v.id}">Update</button>
                            <button class="delete-btn" data-action="delete-vote" data-id="${v.id}">Delete</button>
                        </td>
                    </tr>
                `,
                page,
                params.perPage,
                filteredVotes.length,
                message,
                (shown, total) => `Loaded ${shown} of ${total} filtered votes (out of ${votes.length} total).`
            );
            addButtonListeners();
        } catch (error) {
            console.error('Client - Error loading votes:', error);
            table.innerHTML = '<p class="error-message">Error loading votes.</p>';
            message.textContent = `Error: ${error.message}`;
            message.className = 'error-message';
        }
    }

    // Load suggestions
    async function loadSuggestions(page = state.pages.suggestions) {
        const table = elements['suggestions-table'];
        const message = elements['suggestions-message'];
        if (!table || !message) return;
        try {
            const params = {
                page,
                perPage: parseInt(elements['suggestions-per-page']?.value) || 10,
                search: encodeURIComponent(elements['suggestion-search']?.value.toLowerCase() || ''),
                sort: elements['suggestion-sort']?.value || 'id',
                direction: elements['suggestion-sort-direction']?.value || 'desc',
            };
            const data = await fetchData('/api/suggestions', params);
            if (!data) return;
            state.data.suggestions = (data.suggestions || []).filter(s => !state.data.suggestions.some(existing => existing.id === s.id));
            state.pages.suggestions = page;

            renderTable(
                table,
                state.data.suggestions,
                ['Email', 'Suggestion', 'Timestamp', 'Actions'],
                s => `
                    <tr>
                        <td>${sanitizeInput(s.email)}</td>
                        <td>${sanitizeInput(s.suggestion)}</td>
                        <td>${new Date(s.timestamp).toLocaleString()}</td>
                        <td>
                            <button class="delete-btn" data-action="delete-suggestion" data-id="${s.id}" data-email="${sanitizeInput(s.email)}">Delete</button>
                        </td>
                    </tr>
                `,
                page,
                params.perPage,
                data.total,
                message,
                (shown, total) => `Loaded ${shown} of ${total} suggestions.`
            );
            addButtonListeners();
        } catch (error) {
            console.error('Client - Error loading suggestions:', error);
            table.innerHTML = '<p class="error-message">Error loading suggestions.</p>';
            message.textContent = `Error: ${error.message}`;
            message.className = 'error-message';
        }
    }

    // Load admin requests
    async function loadAdminRequests(page = state.pages.requests) {
        const table = elements['admin-requests-table'];
        const message = elements['admin-requests-message'];
        if (!table || !message) return;
        try {
            const params = {
                page,
                perPage: parseInt(elements['requests-per-page']?.value) || 10,
                search: encodeURIComponent(elements['request-search']?.value.toLowerCase() || ''),
                sort: elements['request-sort']?.value || 'id',
                direction: elements['request-sort-direction']?.value || 'desc',
            };
            const data = await fetchData('/api/admin-request', params);
            if (!data) return;
            state.data.requests = (data.requests || []).filter(r => !state.data.requests.some(existing => existing.id === r.id));
            state.pages.requests = page;

            renderTable(
                table,
                state.data.requests,
                ['Name', 'Email', 'Reason', 'Timestamp', 'Actions'],
                r => `
                    <tr>
                        <td>${sanitizeInput(r.name)}</td>
                        <td>${sanitizeInput(r.email)}</td>
                        <td>${sanitizeInput(r.reason)}</td>
                        <td>${new Date(r.timestamp).toLocaleString()}</td>
                        <td>
                            <button class="approve-btn" data-action="approve-admin-request" data-id="${r.id}">Approve</button>
                            <button class="delete-btn" data-action="delete-admin-request" data-id="${r.id}" data-name="${sanitizeInput(r.name)}">Delete</button>
                            <button class="delete-btn" data-action="deny-admin-request" data-id="${r.id}" data-name="${sanitizeInput(r.name)}">Deny</button>
                        </td>
                    </tr>
                `,
                page,
                params.perPage,
                data.total,
                message,
                (shown, total) => `Loaded ${shown} of ${total} requests.`
            );
            addButtonListeners();
        } catch (error) {
            console.error('Client - Error loading admin requests:', error);
            table.innerHTML = '<p class="error-message">Error loading admin requests.</p>';
            message.textContent = `Error: ${error.message}`;
            message.className = 'error-message';
        }
    }

    // Load teacher proposals
    async function loadTeacherProposals() {
        const table = elements['proposals-table'];
        const message = elements['proposal-message'];
        if (!table || !message) return;
        try {
            const proposals = await fetchData('/api/admin/teacher-proposals');
            if (!proposals) return;
            state.data.proposals = proposals;

            table.innerHTML = `
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Description</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${proposals.map(p => `
                            <tr>
                                <td>${sanitizeInput(p.id)}</td>
                                <td>${sanitizeInput(p.name)}</td>
                                <td>${sanitizeInput(p.email)}</td>
                                <td>${sanitizeInput(p.description)}</td>
                                <td>
                                    <button class="approve-btn" data-action="approve-proposal" data-id="${p.id}">Approve</button>
                                    <button class="delete-btn" data-action="delete-proposal" data-id="${p.id}" data-name="${sanitizeInput(p.name)}">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            message.textContent = `Loaded ${proposals.length} proposals.`;
            message.className = 'info-message';
            addButtonListeners();
        } catch (error) {
            console.error('Client - Error loading proposals:', error);
            table.innerHTML = '<p class="error-message">Error loading proposals.</p>';
            message.textContent = `Error: ${error.message}`;
            message.className = 'error-message';
        }
    }

    // Load corrections
    async function loadCorrections() {
        const table = elements['corrections-table'];
        const message = elements['corrections-message'];
        if (!table || !message) return;
        try {
            const corrections = await fetchData('/api/admin/corrections');
            if (!corrections) return;
            state.data.corrections = corrections;

            table.innerHTML = `
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Teacher</th><th>Suggestion</th><th>File</th><th>Submitted</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${corrections.map(c => `
                            <tr>
                                <td>${sanitizeInput(c.id)}</td>
                                <td>${sanitizeInput(c.teacher_name)}</td>
                                <td>${sanitizeInput(c.suggestion)}</td>
                                <td>${c.file_path ? `<a href="${sanitizeInput(c.file_path)}" target="_blank">View</a>` : 'None'}</td>
                                <td>${new Date(c.submitted_at).toLocaleString()}</td>
                                <td>
                                    <button class="approve-btn" data-action="implement-correction" data-id="${c.id}">Implement</button>
                                    <button class="delete-btn" data-action="delete-correction" data-id="${c.id}">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            message.textContent = `Loaded ${corrections.length} corrections.`;
            message.className = 'info-message';
            addButtonListeners();
        } catch (error) {
            console.error('Client - Error loading corrections:', error);
            table.innerHTML = '<p class="error-message">Error loading corrections.</p>';
            message.textContent = `Error: ${error.message}`;
            message.className = 'error-message';
        }
    }

async function loadSpotlight() {
    try {
        const data = await fetchData('/api/admin/spotlight');
        if (!data) {
            console.warn('Client - No spotlight data returned');
            return;
        }
        state.data.spotlight = { teacherId: data.teacherId, name: data.name };
        const spotlightNameEl = elements['spotlight-name'];
        if (spotlightNameEl) {
            spotlightNameEl.textContent = data.name || 'None';
        }
        console.log('Client - Spotlight loaded:', state.data.spotlight);
    } catch (error) {
        console.error('Client - Error loading spotlight:', error);
        const spotlightNameEl = elements['spotlight-name'];
        if (spotlightNameEl) {
            spotlightNameEl.textContent = 'Error loading';
        }
        showNotification('Error loading spotlight teacher.', true);
    }
}

    // Load accounts with pagination
async function loadAccounts(page = state.pages.accounts) {
    const table = elements['accounts-table'];
    const message = elements['accounts-message'];
    if (!table || !message) return;

    try {
        const perPage = parseInt(elements['accounts-per-page']?.value) || 10;
        state.pages.accounts = page;

        const accountData = await fetchData('/api/admin/accounts', { page, perPage });
        if (!accountData || !accountData.accounts) {
            throw new Error('No account data received');
        }

        state.data.accounts.accounts = accountData.accounts || [];
        state.data.accounts.total = accountData.total || 0;

        const combinedAccounts = state.data.accounts.accounts.map(account => ({
            ...account,
            points: account.points !== undefined ? account.points : 0,
            email: account.email || 'N/A',
            role: account.role || 'user' // Adjust if you add role to the database
        }));

        renderTable(
            table,
            combinedAccounts,
            ['ID', 'Username', 'Email', 'Role', 'Points', 'Status', 'Actions'],
            account => {
                const isLocked = account.is_locked;
                const lockedUntil = account.locked_until ? new Date(account.locked_until) : null;
                let lockStatus = isLocked ? 'Locked' : 'Active';
                if (isLocked && lockedUntil) {
                    const now = new Date();
                    const timeLeft = Math.max(0, Math.floor((lockedUntil - now) / 1000 / 60));
                    lockStatus += timeLeft > 0 ? ` (${timeLeft} min left)` : ' (Expired)';
                }

                return `
                    <tr>
                        <td>${sanitizeInput(account.id)}</td>
                        <td>${sanitizeInput(account.username)}</td>
                        <td>${sanitizeInput(account.email)}</td>
                        <td>${sanitizeInput(account.role)}</td>
                        <td>
                            <input type="number" id="edit-points-${account.id}" value="${sanitizeInput(account.points)}" min="0" style="width: 60px;">
                        </td>
                        <td>${lockStatus}</td>
                        <td>
                            <button class="action-btn toggle-btn ${isLocked ? 'unlock' : 'lock'}" 
                                    data-action="toggle-account-lock" data-id="${account.id}" data-role="${account.role}" 
                                    data-lock="${!isLocked}">
                                ${isLocked ? 'Unlock' : 'Lock'}
                            </button>
                            <button class="action-btn update-btn" 
                                    data-action="update-points" data-id="${account.id}" data-role="${account.role}">
                                Update Points
                            </button>
                            <button class="action-btn history-btn" 
                                    data-action="view-points-history" data-id="${account.id}">
                                View History
                            </button>
                            <button class="action-btn delete-btn" 
                                    data-action="delete-account" data-id="${account.id}" data-role="${account.role}">
                                Delete
                            </button>
                        </td>
                    </tr>
                `;
            },
            page,
            perPage,
            state.data.accounts.total,
            message,
            (shown, total) => `Loaded ${shown} of ${total} accounts.`
        );

        addButtonListeners();
    } catch (error) {
        console.error('Client - Error loading accounts:', error);
        table.innerHTML = '<p class="error-message">Error loading accounts.</p>';
        message.textContent = `Error: ${error.message}`;
        message.className = 'error-message';
    }
}

async function fetchCsrfToken() {
    try {
        const response = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch CSRF token');
        const data = await response.json();
        csrfToken = data.csrfToken;
        console.log('Client - CSRF token fetched:');
    } catch (error) {
        console.error('Client - Error fetching CSRF token:', error.message);
        showNotification('Error initializing security token', true);
    }
}

    // Initialize Create Account Form
async function initializeCreateAccountForm() {
    const form = document.getElementById('create-account-form');
    if (!form) {
        console.warn('Client - Create Account form not found');
        return;
    }

    const message = document.getElementById('create-account-message') || document.createElement('p');
    message.id = 'create-account-message';
    form.parentElement.appendChild(message);

    form.removeEventListener('submit', handleCreateAccountForm);
    form.addEventListener('submit', handleCreateAccountForm);

    // Initialize permissions section
    togglePermissionsSection();

    console.log('Client - Create Account form initialized');
}

async function handleCreateAccountForm(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const messageDiv = document.getElementById('create-account-message');

    const role = formData.get('role') || 'user';
    const username = sanitizeInput(formData.get('username'));
    const email = sanitizeInput(formData.get('email'));
    const password = sanitizeInput(formData.get('password'));
    const confirmPassword = sanitizeInput(formData.get('confirmPassword'));

    // Reset feedback messages
    document.getElementById('username-feedback').textContent = '';
    document.getElementById('email-feedback').textContent = '';
    document.getElementById('password-feedback').textContent = '';
    messageDiv.textContent = '';

    // Validate all fields
    if (!username || !password || !email || !confirmPassword) {
        messageDiv.textContent = 'All fields are required.';
        messageDiv.style.color = 'red';
        showNotification('All fields are required.', true);
        return;
    }

    // Validate username length
    if (username.length < 8 || username.length > 16) {
        document.getElementById('username-feedback').textContent = 'Username must be between 8 and 16 characters';
        document.getElementById('username-feedback').style.color = 'red';
        return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        document.getElementById('email-feedback').textContent = 'Please enter a valid email';
        document.getElementById('email-feedback').style.color = 'red';
        return;
    }

    // Validate password match
    if (password !== confirmPassword) {
        document.getElementById('password-feedback').textContent = 'Passwords do not match';
        document.getElementById('password-feedback').style.color = 'red';
        return;
    }

    // Get selected permissions for admin accounts
    const permissions = {};
    if (role === 'admin') {
        document.querySelectorAll('#permissions-list input[type="checkbox"]').forEach(checkbox => {
            permissions[checkbox.value] = checkbox.checked;
        });
    }

    const data = {
        username,
        email,
        password,
        confirmPassword,
        permissions: role === 'admin' ? permissions : undefined
    };

    const endpoint = role === 'user' ? '/api/users/create' : '/api/admins/create';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': state.csrfToken
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to create account');
        }

        messageDiv.textContent = `${role === 'user' ? 'User' : 'Admin'} account created successfully!`;
        messageDiv.style.color = 'green';
        form.reset();
        showNotification(`${role === 'user' ? 'User' : 'Admin'} account created successfully!`);

        // Reset permissions if it was an admin account
        if (role === 'admin') {
            deselectAllPermissions();
        }

        // Refresh the accounts list if we're creating an admin
        if (role === 'admin') {
            loadAccounts();
        }
    } catch (error) {
        console.error('Client - Error creating account:', error.message);
        messageDiv.textContent = error.message || 'Failed to create account.';
        messageDiv.style.color = 'red';
        showNotification('Error creating account.', true);
    }
}

    // Load and apply section settings
    async function loadSectionSettings() {
        const container = elements['section-settings-container'];
        if (!container) return;
        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'teachers';
        const sectionMap = {
            'teachers': ['Add New Teacher', 'Manage Teachers'],
            'votes': ['Manage Votes'],
            'proposals': ['Teacher Proposals'],
            'corrections': ['Corrections'],
            'suggestions': ['Suggestions'],
            'admin-requests': ['Admin Access Requests'],
            'settings': ['Main Message Settings', 'Footer Settings', 'Section Expansion Settings'],
            'stats': ['Statistics'],
            'add-teacher': ['Add New Teacher'],
            'accounts': ['Manage Accounts'],
            'create-account': ['Create Account'] // Added new tab
        };
        const allSections = Object.values(sectionMap).flat();

        try {
            state.data.settings = await fetchData('/api/admin/section-settings') || {
                "Add New Teacher": false, "Manage Teachers": true, "Manage Votes": true,
                "Teacher Proposals": true, "Corrections": true, "Suggestions": true,
                "Admin Access Requests": true, "Main Message Settings": true,
                "Footer Settings": true, "Section Expansion Settings": true, "Statistics": true,
                "Manage Accounts": true, "Create Account": true
            };
            if (!state.data.settings) return;
            console.log('Client - Section settings loaded:', state.data.settings);
            applySectionSettings(state.data.settings);

            const sectionsToShow = activeTab === 'settings' && sectionMap[activeTab].includes('Section Expansion Settings') ? allSections : sectionMap[activeTab] || [];
            const filteredSettings = Object.fromEntries(Object.entries(state.data.settings).filter(([section]) => sectionsToShow.includes(section)));

            container.innerHTML = `
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
            `;

            document.querySelectorAll('.toggle-group input[type="checkbox"]').forEach(toggle => {
                toggle.addEventListener('change', (e) => {
                    const sectionName = e.target.dataset.section;
                    state.data.settings[sectionName] = e.target.checked;
                    const status = e.target.nextElementSibling.nextElementSibling;
                    if (status) status.textContent = e.target.checked ? 'Expanded' : 'Collapsed';
                    applySectionSettings(state.data.settings);
                    saveSectionSettings();
                });
            });
        } catch (error) {
            console.error('Client - Error loading section settings:', error);
            state.data.settings = {
                "Add New Teacher": false, "Manage Teachers": true, "Manage Votes": true,
                "Teacher Proposals": true, "Corrections": true, "Suggestions": true,
                "Admin Access Requests": true, "Main Message Settings": true,
                "Footer Settings": true, "Section Expansion Settings": true, "Statistics": true,
                "Manage Accounts": true, "Create Account": true
            };
            applySectionSettings(state.data.settings);
            container.innerHTML = '<p class="info-message">Using default settings due to load failure.</p>';
        }
    }

    // Save section settings
    async function saveSectionSettings() {
        try {
            const response = await fetch(`${BASE_URL}/api/admin/section-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                body: JSON.stringify(state.data.settings),
                credentials: 'include',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            console.log('Client - Section settings saved');
        } catch (error) {
            console.error('Client - Error saving section settings:', error);
            showNotification('Failed to save section settings.', true);
        }
    }

    // Apply section settings
    function applySectionSettings(settings) {
        document.querySelectorAll('.section-toggle').forEach(header => {
            const sectionName = header.textContent.trim();
            if (settings[sectionName] !== undefined) {
                const isExpanded = settings[sectionName];
                const content = header.nextElementSibling;
                if (content) {
                    content.style.display = isExpanded ? 'block' : 'none';
                    header.classList.toggle('expanded', isExpanded);
                }
            }
        });
    }

    // Load statistics
    async function loadStatistics() {
        const chartsContainer = elements['stats-charts'];
        const message = elements['stats-message'];
        if (!chartsContainer || !message) return;
        try {
            const timeFrame = elements['stats-timeframe'].value;
            const stats = await fetchData('/api/admin/stats', { timeFrame });
            if (!stats) return;
            chartsContainer.innerHTML = `
                <canvas id="statsChart" width="300" height="200"></canvas>
            `;
            const ctx = document.getElementById('statsChart').getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Teachers', 'Votes', 'Visits'],
                    datasets: [{
                        label: `Stats (${timeFrame})`,
                        data: [stats.totalTeachers, stats.totalVotes, stats.totalVisits],
                        backgroundColor: ['#007bff', '#28a745', '#ffc107'],
                    }]
                },
                options: { scales: { y: { beginAtZero: true } } }
            });
            message.textContent = `Stats for ${timeFrame} loaded.`;
            message.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading statistics:', error);
            chartsContainer.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
            message.textContent = `Error: ${error.message}`;
            message.className = 'error-message';
        }
    }

    // Load footer settings
    async function loadFooterSettings() {
        const form = elements['footer-settings-form'];
        const status = elements['footer-message-status'];
        if (!form || !status) return;
        try {
            const settings = await fetchData('/api/footer-settings');
            if (!settings) return;
            document.getElementById('footer-email-input').value = settings.email || '';
            document.getElementById('footer-message-input').value = settings.message || '';
            document.getElementById('footer-show-message').checked = settings.showMessage ?? false;
            document.getElementById('footer-email').innerHTML = `Email: <a href="mailto:${settings.email || 'admin@example.com'}">${settings.email || 'admin@example.com'}</a>`;
            document.getElementById('footer-message').textContent = settings.showMessage ? (settings.message || 'Welcome to Teacher Tally!') : '';
            status.textContent = 'Footer settings loaded.';
            status.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading footer settings:', error);
            status.textContent = `Error: ${error.message}`;
            status.className = 'error-message';
        }
    }

    // Load message settings
    async function loadMessageSettings() {
        const form = elements['message-settings-form'];
        const status = elements['message-status'];
        if (!form || !status) return;
        try {
            const settings = await fetchData('/api/message-settings');
            if (!settings) return;
            document.getElementById('main-message').value = settings.message || '';
            document.getElementById('show-main-message').checked = settings.showMessage ?? false;
            status.textContent = settings.showMessage && settings.message ? settings.message : 'Message settings loaded.';
            status.className = 'info-message';
        } catch (error) {
            console.error('Client - Error loading message settings:', error);
            status.textContent = `Error: ${error.message}`;
            status.className = 'error-message';
        }
    }

    // Save message settings
    async function saveMessageSettings() {
        const form = elements['message-settings-form'];
        if (!form) return;
        const message = sanitizeInput(document.getElementById('main-message')?.value || '');
        const showMessage = document.getElementById('show-main-message')?.checked ?? false;
        try {
            const response = await fetch(`${BASE_URL}/api/admin/message-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                body: JSON.stringify({ message, showMessage }),
                credentials: 'include',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Message settings saved!');
            await loadMessageSettings();
        } catch (error) {
            console.error('Client - Error saving message settings:', error);
            showNotification('Error saving message settings.', true);
        }
    }

    // Save footer settings
    async function saveFooterSettings() {
        const form = elements['footer-settings-form'];
        if (!form) return;
        const email = sanitizeInput(document.getElementById('footer-email-input')?.value || '');
        const message = sanitizeInput(document.getElementById('footer-message-input')?.value || '');
        const showMessage = document.getElementById('footer-show-message')?.checked ?? false;
        try {
            const response = await fetch(`${BASE_URL}/api/admin/footer-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                body: JSON.stringify({ email, message, showMessage }),
                credentials: 'include',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showNotification('Footer settings saved!');
            await loadFooterSettings();
        } catch (error) {
            console.error('Client - Error saving footer settings:', error);
            showNotification('Error saving footer settings.', true);
        }
    }

    // Add New Teacher Form Submission
    async function handleAddTeacherForm(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const messageDiv = elements['add-teacher-message'];

        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = formData.get(`schedule[${i}][subject]`)?.trim();
            const grade = formData.get(`schedule[${i}][grade]`)?.trim();
            if (subject && grade) {
                schedule.push({ subject, grade });
            }
        }
        for (let i = 0; i < 4; i++) {
            formData.delete(`schedule[${i}][subject]`);
            formData.delete(`schedule[${i}][grade]`);
        }
        formData.set('schedule', JSON.stringify(schedule));

        const imageFile = formData.get('image');
        if (imageFile && imageFile.size > 0) {
            const maxSize = 5 * 1024 * 1024;
            if (imageFile.size > maxSize) {
                messageDiv.textContent = 'Image file size exceeds 5MB limit.';
                messageDiv.style.color = 'red';
                showNotification('Image too large. Maximum size is 5MB.', true);
                return;
            }
            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(imageFile.type)) {
                messageDiv.textContent = 'Invalid image type. Use JPG, PNG, or GIF.';
                messageDiv.style.color = 'red';
                showNotification('Please upload a valid image (JPG, PNG, GIF).', true);
                return;
            }
        }

        try {
            const response = await fetchData('/api/teachers', {}, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${state.token}`,
                    'X-CSRF-Token': state.csrfToken
                }
            });
            if (!response) return;
            messageDiv.textContent = response.message || 'Teacher added successfully!';
            messageDiv.style.color = 'green';
            form.reset();
            state.data.teachers = [];
            await loadTeachers();
            showNotification('Teacher added successfully!');
        } catch (error) {
            console.error('Client - Error adding teacher:', error.message);
            messageDiv.textContent = error.message || 'Failed to add teacher.';
            messageDiv.style.color = 'red';
            showNotification('Error adding teacher.', true);
        }
    }

    // Initialize Add Teacher Form
    function initializeAddTeacherForm() {
        const form = elements['teacher-submit-form'];
        if (form) {
            form.removeEventListener('submit', handleAddTeacherForm);
            form.addEventListener('submit', handleAddTeacherForm);
            console.log('Client - Add New Teacher form initialized');
        } else {
            console.warn('Client - Add New Teacher form not found');
        }
    }

    // Add event listeners for buttons
function addButtonListeners() {
    console.log('Client - Adding button listeners');
    const buttons = document.querySelectorAll('.submit-btn, .delete-btn, .approve-btn, .edit-btn, .pagination-btn, .update-btn, .toggle-btn, .history-btn');
    console.log(`Client - Found ${buttons.length} buttons to attach listeners`);
    buttons.forEach(btn => {
        btn.removeEventListener('click', handleButtonAction);
        btn.addEventListener('click', handleButtonAction);
        console.log(`Client - Listener added to button: ${btn.dataset.action || btn.id}`);
    });
}

    // Unified button action handler
function handleButtonAction(e) {
    const action = this.dataset.action;
    const id = this.dataset.id;
    const name = this.dataset.name;
    const email = this.dataset.email;
    const page = parseInt(this.dataset.page);
    const lock = this.dataset.lock === 'true';
    const role = this.dataset.role;
    const spotlight = this.dataset.spotlight === 'true';

    switch (action) {
        case 'edit-teacher': window.toggleTeacherDetails(id); break;
        case 'update-vote': window.updateVote(id); break;
        case 'delete-vote': window.showDeleteVoteModal(id); break;
        case 'update-teacher': window.updateTeacher(id); break;
        case 'delete-teacher': window.showDeleteTeacherModal(id, name); break;
        case 'approve-proposal': window.approveProposal(id); break;
        case 'delete-proposal': window.showDeleteProposalModal(id, name); break;
        case 'implement-correction': window.implementCorrection(id); break;
        case 'delete-correction': window.showDeleteCorrectionModal(id); break;
        case 'approve-admin-request': window.approveAdminRequest(id); break;
        case 'delete-admin-request': window.showDeleteAdminRequestModal(id, name); break;
        case 'deny-admin-request': window.showDenyAdminRequestModal(id, name); break;
        case 'delete-suggestion': window.showDeleteSuggestionModal(id, email); break;
        case 'toggle-account-lock': window.toggleAccountLock(id, lock, role); break;
        case 'update-points': window.updatePoints(id, role); break;
        case 'view-points-history': window.viewPointsHistory(id); break;
        case 'delete-account': window.showDeleteAccountModal(id, role); break;
        case 'toggle-spotlight': window.toggleSpotlight(id, spotlight); break; // Added
    }

    if (!isNaN(page)) {
        const parentId = this.closest('.pagination')?.parentElement.id;
        if (parentId === 'teachers-table') loadTeachers(page);
        else if (parentId === 'votes-table') loadVotes(page);
        else if (parentId === 'suggestions-table') loadSuggestions(page);
        else if (parentId === 'admin-requests-table') loadAdminRequests(page);
        else if (parentId === 'accounts-table') loadAccounts(page);
    }
}

    // Tab switching
    function switchTab(tabName) {
        // Check if user has permission for this tab
        if (TAB_PERMISSIONS[tabName] && !hasPermission(TAB_PERMISSIONS[tabName])) {
            showNotification('You do not have permission to access this section.', true);
            return;
        }

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const tabContent = elements[tabName];
        if (tabBtn && tabContent) {
            tabBtn.classList.add('active');
            tabContent.classList.add('active');
            state.activeTab = tabName;
            updateDropdownVisibility(tabName);
            switch (tabName) {
                case 'teachers': loadTeachers(); loadSpotlight();
    break;
                case 'votes': loadVotes(); break;
                case 'proposals': loadTeacherProposals(); break;
                case 'corrections': loadCorrections(); break;
                case 'suggestions': loadSuggestions(); break;
                case 'admin-requests': loadAdminRequests(); break;
                case 'settings': loadMessageSettings(); loadFooterSettings(); loadSectionSettings(); break;
                case 'stats': loadStatistics(); break;
                case 'add-teacher': initializeAddTeacherForm(); break;
                case 'accounts': loadAccounts(); break;
                case 'create-account': initializeCreateAccountForm(); break;
                default: console.log(`Client - Unknown tab: ${tabName}`);
            }
            if (window.innerWidth <= 768) elements['tab-nav'].classList.remove('active');
        } else {
            showNotification(`Tab "${tabName}" not found.`, true);
            console.error(`Client - Tab "${tabName}" not found`);
        }
    }

    // Event Listeners
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    document.querySelectorAll('.section-toggle').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isExpanded = content.style.display === 'none' || content.style.display === '';
            content.style.display = isExpanded ? 'block' : 'none';
            header.classList.toggle('expanded', isExpanded);
            const sectionName = header.textContent.trim();
            state.data.settings[sectionName] = isExpanded;
            saveSectionSettings();
        });
    });

    elements['teacher-form']?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(elements['teacher-form']);
        try {
            const response = await fetch(`${BASE_URL}/api/admin/teachers`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                body: formData,
                credentials: 'include',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            showNotification('Teacher added successfully!');
            elements['teacher-form'].reset();
            state.data.teachers = [];
            loadTeachers();
        } catch (error) {
            console.error('Client - Error adding teacher:', error);
            showNotification(`Error adding teacher: ${error.message}`, true);
        }
    });

    elements['footer-settings-form']?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveFooterSettings();
    });

    elements['message-settings-form']?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveMessageSettings();
    });

    const debouncedLoadTeachers = debounce(() => loadTeachers(1), 300);
    const debouncedLoadVotes = debounce(() => loadVotes(1), 300);
    const debouncedLoadSuggestions = debounce(() => loadSuggestions(1), 300);
    const debouncedLoadAdminRequests = debounce(() => loadAdminRequests(1), 300);
    const debouncedLoadAccounts = debounce(() => loadAccounts(1), 300);

    elements['teacher-search']?.addEventListener('input', debouncedLoadTeachers);
    elements['teachers-per-page']?.addEventListener('change', () => loadTeachers(1));
    elements['teacher-sort']?.addEventListener('change', () => loadTeachers(1));
    elements['teacher-sort-direction']?.addEventListener('change', () => loadTeachers(1));
    elements['vote-search']?.addEventListener('input', debouncedLoadVotes);
    elements['votes-per-page']?.addEventListener('change', () => loadVotes(1));
    elements['vote-sort']?.addEventListener('change', () => loadVotes(1));
    elements['vote-sort-direction']?.addEventListener('change', () => loadVotes(1));
    elements['vote-teacher-id-filter']?.addEventListener('input', debouncedLoadVotes);
    elements['vote-teacher-name-filter']?.addEventListener('input', debouncedLoadVotes);
    elements['vote-comment-filter']?.addEventListener('input', debouncedLoadVotes);
    elements['vote-rating-filter']?.addEventListener('change', () => loadVotes(1));
    elements['suggestion-search']?.addEventListener('input', debouncedLoadSuggestions);
    elements['suggestions-per-page']?.addEventListener('change', () => loadSuggestions(1));
    elements['suggestion-sort']?.addEventListener('change', () => loadSuggestions(1));
    elements['suggestion-sort-direction']?.addEventListener('change', () => loadSuggestions(1));
    elements['request-search']?.addEventListener('input', debouncedLoadAdminRequests);
    elements['requests-per-page']?.addEventListener('change', () => loadAdminRequests(1));
    elements['request-sort']?.addEventListener('change', () => loadAdminRequests(1));
    elements['request-sort-direction']?.addEventListener('change', () => loadAdminRequests(1));
    elements['stats-timeframe']?.addEventListener('change', loadStatistics);
    elements['accounts-per-page']?.addEventListener('change', () => loadAccounts(1));

    // Global functions
    window.toggleTeacherDetails = (teacherId) => {
        const detailsRow = document.getElementById(`teacher-details-${teacherId}`);
        if (detailsRow) detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    };

    window.updateTeacher = async (id) => {
        const statusElement = document.getElementById(`edit-status-${id}`);
        const formData = new FormData();
        ['id', 'name', 'desc', 'schedule', 'bio', 'tags', 'email', 'phone'].forEach(field => {
            const input = document.getElementById(`edit-${field}-${id}`);
            formData.append(field === 'desc' ? 'description' : field, sanitizeInput(input?.value.trim() || ''));
            input.dataset.original = input.value.trim();
        });
        const newId = formData.get('id');
        const originalId = document.getElementById(`edit-id-${id}`).dataset.original;

        try {
            statusElement.textContent = 'Updating...';
            statusElement.className = 'info-message';
            const response = await fetch(`${BASE_URL}/api/admin/teachers/${originalId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                body: formData,
                credentials: 'include',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            state.data.teachers = state.data.teachers.map(t => t.id === originalId ? { ...t, ...Object.fromEntries(formData) } : t);
            statusElement.textContent = 'Updated successfully!';
            statusElement.className = 'success-message';
            showNotification('Teacher updated successfully!');
            loadTeachers();
        } catch (error) {
            console.error('Client - Error updating teacher:', error);
            statusElement.textContent = `Error: ${error.message}`;
            statusElement.className = 'error-message';
            showNotification('Error updating teacher.', true);
        }
    };

    window.showDeleteTeacherModal = (id, name) => {
        showModal('Confirm Deletion', `Are you sure you want to delete ${name}?`, 'Delete', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/admin/teachers/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Teacher deleted successfully!');
                state.data.teachers = state.data.teachers.filter(t => t.id !== id);
                loadTeachers();
            } catch (error) {
                console.error('Client - Error deleting teacher:', error);
                showNotification('Error deleting teacher.', true);
            }
        });
    };

    window.updateVote = async (voteId) => {
        const voteData = {
            rating: parseInt(document.getElementById(`edit-rating-${voteId}`)?.textContent || 0),
            comment: sanitizeInput(document.getElementById(`edit-comment-${voteId}`)?.textContent || ''),
        };
        if (isNaN(voteData.rating) || voteData.rating < 1 || voteData.rating > 5) {
            showNotification('Rating must be between 1 and 5.', true);
            return;
        }
        try {
            const response = await fetch(`${BASE_URL}/api/admin/votes/${voteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                body: JSON.stringify(voteData),
                credentials: 'include',
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
                const response = await fetch(`${BASE_URL}/api/admin/votes/${voteId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
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

    window.approveProposal = async (proposalId) => {
        showModal('Approve Proposal', `Assign a Teacher ID for proposal ${proposalId}:`, 'Approve', async () => {
            const teacherIdInput = document.getElementById('teacher-id');
            const teacherId = teacherIdInput?.value.trim();
            if (!teacherId) {
                showNotification('Teacher ID is required.', true);
                return;
            }
            try {
                const response = await fetch(`${BASE_URL}/api/admin/teacher-proposals/${proposalId}/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    body: JSON.stringify({ teacherId }),
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                showNotification('Proposal approved successfully!');
                loadTeacherProposals();
                state.data.teachers = [];
                loadTeachers();
            } catch (error) {
                console.error('Client - Error approving proposal:', error);
                showNotification(`Error approving proposal: ${error.message}`, true);
            }
        }, '<input type="text" id="teacher-id" placeholder="e.g., T123">');
    };

    window.showDeleteProposalModal = (proposalId, name) => {
        showModal('Confirm Deletion', `Are you sure you want to delete the proposal for ${name}?`, 'Delete', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/admin/teacher-proposals/${proposalId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
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

    window.implementCorrection = async (correctionId) => {
        showModal('Implement Correction', `Are you sure you want to implement correction ID ${correctionId}?`, 'Implement', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/admin/corrections/${correctionId}/implement`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Correction implemented successfully!');
                loadCorrections();
                state.data.teachers = [];
                loadTeachers();
            } catch (error) {
                console.error('Client - Error implementing correction:', error);
                showNotification('Error implementing correction.', true);
            }
        });
    };

    window.showDeleteCorrectionModal = (correctionId) => {
        showModal('Confirm Deletion', `Are you sure you want to delete correction ID ${correctionId}?`, 'Delete', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/admin/corrections/${correctionId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
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

    window.approveAdminRequest = (requestId) => {
        showModal('Approve Admin Request', `You will need to create account manually. Adding streamlining soon... ${requestId}?`, 'Approve', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/admin-request/approve/${requestId}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Admin request approved successfully!');
                loadAdminRequests();
                loadAccounts();
            } catch (error) {
                console.error('Client - Error approving admin request:', error);
                showNotification('Error approving admin request.', true);
            }
        });
    };

    window.showDeleteAdminRequestModal = (requestId, name) => {
        showModal('Confirm Deletion', `Are you sure you want to delete the admin request for ${name}?`, 'Delete', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/admin-request/${requestId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Admin request deleted successfully!');
                loadAdminRequests();
            } catch (error) {
                console.error('Client - Error deleting admin request:', error);
                showNotification('Error deleting admin request.', true);
            }
        });
    };

    window.showDenyAdminRequestModal = (requestId, name) => {
        showModal('Deny Admin Request', `Are you sure you want to deny the admin request for ${name}?`, 'Deny', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/admin-request/deny/${requestId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Admin request denied successfully!');
                loadAdminRequests();
            } catch (error) {
                console.error('Client - Error denying admin request:', error);
                showNotification('Error denying admin request.', true);
            }
        });
    };

    window.showDeleteSuggestionModal = (suggestionId, email) => {
        showModal('Confirm Deletion', `Are you sure you want to delete the suggestion from ${email}?`, 'Delete', async () => {
            try {
                const response = await fetch(`${BASE_URL}/api/suggestions/${suggestionId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                showNotification('Suggestion deleted successfully!');
                loadSuggestions();
            } catch (error) {
                console.error('Client - Error deleting suggestion:', error);
                showNotification('Error deleting suggestion.', true);
            }
        });
    };

    // Toggle account lock status with duration
    window.toggleAccountLock = async (id, lock, role) => {
        if (!lock) {
            // Unlock immediately
            const endpoint = role === 'admin' ? `/api/admins/${id}/lock` : `/api/users/${id}/lock`;
            try {
                const response = await fetch(`${BASE_URL}${endpoint}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    body: JSON.stringify({ lock: false }),
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                showNotification('Account unlocked successfully!');
                loadAccounts();
            } catch (error) {
                console.error('Client - Error unlocking account:', error);
                showNotification('Error unlocking account.', true);
            }
        } else {
            // Lock with duration
            showModal(
                'Lock Account',
                `Enter the number of hours to lock account ${id}:`,
                'Lock',
                async () => {
                    const hoursInput = document.getElementById('lock-hours');
                    const hours = parseInt(hoursInput?.value);
                    if (isNaN(hours) || hours <= 0) {
                        showNotification('Please enter a valid number of hours.', true);
                        return;
                    }
                    const endpoint = role === 'admin' ? `/api/admins/${id}/lock` : `/api/users/${id}/lock`;
                    try {
                        const response = await fetch(`${BASE_URL}${endpoint}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                            body: JSON.stringify({ lock: true, duration: hours * 60 }), // Convert hours to minutes
                            credentials: 'include',
                        });
                        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                        showNotification(`Account locked for ${hours} hour(s) successfully!`);
                        loadAccounts();
                    } catch (error) {
                        console.error('Client - Error locking account:', error);
                        showNotification('Error locking account.', true);
                    }
                },
                '<input type="number" id="lock-hours" min="1" placeholder="Hours (e.g., 24)">'
            );
        }
    };

    // Update points balance
window.updatePoints = async (id, role) => {
    const pointsElement = document.getElementById(`edit-points-${id}`);
    const points = parseInt(pointsElement.value);
    if (isNaN(points) || points < 0) {
        showNotification('Points must be a non-negative number.', true);
        pointsElement.value = pointsElement.defaultValue;
        return;
    }

    try {
        // Ensure the latest CSRF token is used
        const csrfResponse = await fetch(`${BASE_URL}/api/csrf-token`, { credentials: 'include' });
        if (!csrfResponse.ok) throw new Error(`Failed to refresh CSRF token: ${csrfResponse.status}`);
        const { csrfToken } = await csrfResponse.json();
        state.csrfToken = csrfToken; // Update state with fresh token
        console.log('Client - Refreshed CSRF token for updatePoints:', csrfToken);

        const response = await fetchData(`/api/admin/accounts/${id}/points`, {}, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken },
            body: JSON.stringify({ points })
        });
        if (!response) return;
        showNotification(response.message || 'Points updated successfully!');
        pointsElement.defaultValue = points;
        loadAccounts();
    } catch (error) {
        console.error('Client - Error updating points:', error);
        pointsElement.value = pointsElement.defaultValue;
        showNotification(`Error updating points: ${error.message}`, true);
    }
};
    // Delete account
    window.showDeleteAccountModal = (id, role) => {
        showModal('Confirm Deletion', `Are you sure you want to delete ${role} ID ${id}?`, 'Delete', async () => {
            const endpoint = role === 'admin' ? `/api/admins/${id}` : `/api/users/${id}`;
            try {
                const response = await fetch(`${BASE_URL}${endpoint}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${state.token}`, 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include',
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                showNotification(`${role} deleted successfully!`);
                loadAccounts();
            } catch (error) {
                console.error(`Client - Error deleting ${role.toLowerCase()}:`, error);
                showNotification(`Error deleting ${role.toLowerCase()}.`, true);
            }
        });
    };

window.viewPointsHistory = async (id) => {
    console.log(`Client - Starting viewPointsHistory for user ID ${id}`);
    try {
        const historyData = await fetchData(`/api/admin/accounts/${id}/points`);
        console.log(`Client - Received history data for ID ${id}:`, historyData);
        if (!historyData) {
            console.warn(`Client - No history data returned for ID ${id}`);
            showNotification('No points history data received.', true);
            return;
        }

        const { user, transactions } = historyData;
        if (!user || !user.username) {
            console.warn(`Client - Invalid user data for ID ${id}:`, user);
            showNotification('User not found or invalid data.', true);
            return;
        }

        const totalPoints = user.totalPoints !== undefined ? user.totalPoints : 0;
        const transactionRows = transactions && transactions.length > 0
            ? transactions.map(t => {
                console.log(`Client - Transaction for ID ${id}:`, t);
                return `
                    <tr>
                        <td>${new Date(t.timestamp).toLocaleString()}</td>
                        <td>${sanitizeInput(t.reason)}</td>
                        <td>${t.points > 0 ? '+' : ''}${t.points}</td>
                    </tr>
                `;
              }).join('')
            : '<tr><td colspan="3">No transactions found.</td></tr>';

        console.log(`Client - Rendering modal for ID ${id} with ${transactions?.length || 0} transactions`);
        const modalHtml = `
            <div class="modal active">
                <div class="modal-content">
                    <h2>Points History for ${sanitizeInput(user.username)}</h2>
                    <p>Total Points: ${totalPoints}</p>
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Reason</th>
                                <th>Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${transactionRows}
                        </tbody>
                    </table>
                    <button id="close-points-history" class="modal-btn">Close</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.querySelector('.modal.active');
        document.getElementById('close-points-history').addEventListener('click', () => {
            console.log(`Client - Closing points history modal for ID ${id}`);
            modal.remove();
        });
    } catch (error) {
        console.error(`Client - Error in viewPointsHistory for ID ${id}:`, error.message);
        showNotification(`Error loading points history: ${error.message}`, true);
    }
};

    // Initial load with permission check
    if (await verifyAdminStatus()) {
        // Load section settings if user has permission
        if (hasPermission('manage_settings')) {
            await loadSectionSettings();
        }

        // Find first accessible tab
        const accessibleTab = Array.from(document.querySelectorAll('.tab-btn'))
            .find(btn => {
                const tabName = btn.dataset.tab;
                return !TAB_PERMISSIONS[tabName] || hasPermission(TAB_PERMISSIONS[tabName]);
            });

        if (accessibleTab) {
            switchTab(accessibleTab.dataset.tab);
        } else {
            showNotification('You do not have permission to access any sections.', true);
        }

        if (hasPermission('manage_teachers')) {
            initializeAddTeacherForm();
        }
        addButtonListeners();
    }

    // Load available permissions
    async function loadAvailablePermissions() {
        try {
            const response = await fetch('/api/admin/permissions', {
                headers: {
                    'Authorization': `Bearer ${state.token}`,
                    'X-CSRF-Token': state.csrfToken
                },
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const permissions = await response.json();
            
            const permissionsList = document.getElementById('permissions-list');
            if (permissionsList) {
                permissionsList.innerHTML = Object.entries(permissions)
                    .map(([key, label]) => `
                        <div class="permission-item">
                            <input type="checkbox" id="perm-${key}" name="permissions" value="${key}">
                            <label for="perm-${key}">${label}</label>
                        </div>
                    `).join('');
            }
        } catch (error) {
            console.error('Client - Error loading permissions:', error);
            showNotification('Error loading permissions.', true);
        }
    }

    // Toggle permissions section visibility
    function togglePermissionsSection() {
        const role = document.getElementById('create-role').value;
        const permissionsSection = document.getElementById('permissions-section');
        if (permissionsSection) {
            permissionsSection.style.display = role === 'admin' ? 'block' : 'none';
            if (role === 'admin' && !permissionsSection.hasAttribute('data-loaded')) {
                loadAvailablePermissions();
                permissionsSection.setAttribute('data-loaded', 'true');
            }
        }
    }

    // Select all permissions
    function selectAllPermissions() {
        document.querySelectorAll('#permissions-list input[type="checkbox"]')
            .forEach(checkbox => checkbox.checked = true);
    }

    // Deselect all permissions
    function deselectAllPermissions() {
        document.querySelectorAll('#permissions-list input[type="checkbox"]')
            .forEach(checkbox => checkbox.checked = false);
    }

    // Add to window object for HTML onclick access
    window.togglePermissionsSection = togglePermissionsSection;
    window.selectAllPermissions = selectAllPermissions;
    window.deselectAllPermissions = deselectAllPermissions;

    async function makeAuthenticatedRequest(url, options = {}) {
        try {
            const csrfToken = await getCsrfToken();
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include'
            });

            const data = await response.json();
            
            if (response.status === 403) {
                // Use our permission system's error message
                showNotification(`Access denied: Insufficient permissions`, true);
                return null;
            }
            
            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid - clear permissions and redirect
                    localStorage.removeItem('adminPermissions');
                    window.location.href = '/pages/admin/login.html';
                    return null;
                }
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('Request failed:', error);
            showNotification(error.message, true);
            return null;
        }
    }
});