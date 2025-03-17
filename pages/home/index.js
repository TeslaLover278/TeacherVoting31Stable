// /pages/home/index.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('Index.js - DOMContentLoaded fired');

    let teachersData = [];
    let currentPage = 1;
    let csrfToken = null;

    function showNotification(message, isError = false) {
        const notification = document.getElementById('notification-container');
        if (notification) {
            const note = document.createElement('div');
            note.textContent = message;
            note.className = `notification ${isError ? 'error' : 'success'}`;
            note.style.opacity = '0';
            notification.appendChild(note);
            requestAnimationFrame(() => {
                note.style.opacity = '1';
                setTimeout(() => {
                    note.style.opacity = '0';
                    note.addEventListener('transitionend', () => note.remove(), { once: true });
                }, 3000);
            });
        } else {
            console.warn('Index.js - Notification container not found, falling back to alert');
            alert(message);
        }
    }

    async function fetchCsrfToken() {
        try {
            const response = await fetch('/api/csrf-token', { credentials: 'include' });
            if (!response.ok) throw new Error(`Failed to fetch CSRF token: ${response.status}`);
            const data = await response.json();
            csrfToken = data.csrfToken;
            const suggestionCsrf = document.getElementById('suggestion-csrf-token');
            const adminCsrf = document.getElementById('admin-request-csrf-token');
            if (suggestionCsrf) suggestionCsrf.value = csrfToken;
            if (adminCsrf) adminCsrf.value = csrfToken;
            console.log('Index.js - CSRF token fetched:', csrfToken);
        } catch (error) {
            console.error('Index.js - Error fetching CSRF token:', error.message);
            showNotification('Error initializing security token.', true);
        }
    }

    function getFetchParams() {
        const searchBar = document.getElementById('search-bar');
        const sortSelect = document.getElementById('sort-select');
        const sortDirection = document.getElementById('sort-direction');
        const cardsPerPage = document.getElementById('cards-per-page');
        return {
            search: searchBar?.value || '',
            sort: sortSelect?.value || 'default',
            direction: sortDirection?.value || 'asc',
            perPage: parseInt(cardsPerPage?.value) || 8
        };
    }

    async function fetchTeachers(page = 1) {
        const grid = document.getElementById('teacher-grid');
        const pagination = document.getElementById('pagination');
        console.log('Index.js - fetchTeachers - Grid exists:', !!grid, 'Pagination exists:', !!pagination);
        if (!grid || !pagination) {
            console.error('Index.js - Required elements (teacher-grid or pagination) missing');
            showNotification('Page elements missing. Please refresh.', true);
            return;
        }
        const { search, sort, direction, perPage } = getFetchParams();
        try {
            const response = await fetch(`/api/teachers?page=${page}&perPage=${perPage}&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`, {
                credentials: 'include'
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to fetch teachers: ${response.status}`);
            }
            const data = await response.json();
            teachersData = data.teachers || [];
            renderTeachers();
            updatePagination(data.total || 0);
        } catch (error) {
            console.error('Index.js - Error fetching teachers:', error.message);
            showNotification(`Error loading teachers: ${error.message}`, true);
        }
    }

    function renderTeachers() {
        const grid = document.getElementById('teacher-grid');
        if (!grid) {
            console.error('Index.js - Teacher grid element not found');
            return;
        }
        grid.innerHTML = teachersData.length ? teachersData.map(teacher => `
            <div class="teacher-card" data-id="${teacher.id}">
                <img src="${teacher.image_link || '/public/images/default-teacher.jpg'}" 
                     alt="${teacher.name}" 
                     onerror="this.src='/public/images/default-teacher.jpg'">
                <h3>${teacher.name}</h3>
                <p>${teacher.description}</p>
                <div class="star-rating">
                    ${teacher.avg_rating ? 
                        '★'.repeat(Math.round(teacher.avg_rating)) + 
                        '☆'.repeat(5 - Math.round(teacher.avg_rating)) + 
                        ` (${teacher.vote_count})` : 
                        'No ratings (0)'}
                </div>
                <a href="/pages/teacher/teacher.html?id=${teacher.id}" class="view-profile">View Profile</a>
            </div>
        `).join('') : '<p>No teachers available.</p>';

        document.querySelectorAll('.teacher-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('view-profile')) {
                    console.log('Index.js - Teacher card clicked:', card.dataset.id);
                    window.location.href = `/pages/teacher/teacher.html?id=${card.dataset.id}`;
                }
            });
        });
    }

    function updatePagination(total) {
        const { perPage } = getFetchParams();
        const pagination = document.getElementById('pagination');
        if (!pagination) {
            console.error('Index.js - Pagination element not found');
            return;
        }
        const totalPages = Math.ceil(total / perPage) || 1;
        pagination.innerHTML = `
            <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} id="prev-page">Previous</button>
            ${Array.from({ length: totalPages }, (_, i) => `
                <button class="pagination-btn ${currentPage === i + 1 ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>
            `).join('')}
            <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} id="next-page">Next</button>
        `;
        const prevPage = document.getElementById('prev-page');
        const nextPage = document.getElementById('next-page');
        if (prevPage) prevPage.addEventListener('click', () => { currentPage--; fetchTeachers(currentPage); });
        if (nextPage) nextPage.addEventListener('click', () => { currentPage++; fetchTeachers(currentPage); });
        document.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); fetchTeachers(currentPage); });
        });
    }

    async function checkAdminStatus() {
        const adminBtn = document.getElementById('admin-btn');
        if (!adminBtn) return;
        try {
            const response = await fetch('/api/admin/verify', { credentials: 'include' });
            if (response.ok) {
                adminBtn.textContent = 'Admin Dashboard';
                adminBtn.onclick = () => window.location.href = '/pages/admin/dashboard.html';
            }
        } catch (error) {
            console.error('Index.js - Error verifying admin status:', error.message);
        }
    }

    function setupSuggestionForm() {
        const suggestionForm = document.getElementById('suggestion-form');
        const suggestionMessage = document.getElementById('suggestion-message');
        if (!suggestionForm || !suggestionMessage) return;
        suggestionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Index.js - Suggestion form submitted');
            const email = document.getElementById('suggestion-email')?.value.trim();
            const suggestion = document.getElementById('suggestion-text')?.value.trim();
            if (!email || !suggestion || !csrfToken) {
                suggestionMessage.textContent = !csrfToken ? 'Security token missing.' : 'Please fill out all fields.';
                suggestionMessage.classList.add('error-message');
                return;
            }
            try {
                const response = await fetch('/api/suggestions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify({ email, suggestion }),
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    suggestionMessage.textContent = 'Suggestion submitted successfully!';
                    suggestionMessage.classList.remove('error-message');
                    suggestionMessage.classList.add('info-message');
                    suggestionForm.reset();
                } else {
                    suggestionMessage.textContent = data.error || 'Failed to submit suggestion.';
                    suggestionMessage.classList.add('error-message');
                }
            } catch (error) {
                console.error('Index.js - Error submitting suggestion:', error.message);
                suggestionMessage.textContent = 'An error occurred.';
                suggestionMessage.classList.add('error-message');
            }
        });
    }

    function setupAdminRequestForm() {
        const adminRequestForm = document.getElementById('admin-request-form');
        const adminRequestMessage = document.getElementById('admin-request-message');
        if (!adminRequestForm || !adminRequestMessage) return;
        adminRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Index.js - Admin request form submitted');
            const name = document.getElementById('request-name')?.value.trim();
            const email = document.getElementById('request-email')?.value.trim();
            const reason = document.getElementById('request-reason')?.value.trim();
            if (!name || !email || !reason || !csrfToken) {
                adminRequestMessage.textContent = !csrfToken ? 'Security token missing.' : 'Please fill out all fields.';
                adminRequestMessage.classList.add('error-message');
                return;
            }
            try {
                const response = await fetch('/api/admin-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    body: JSON.stringify({ name, email, reason }),
                    credentials: 'include'
                });
                const data = await response.json();
                if (response.ok) {
                    adminRequestMessage.textContent = 'Admin access request submitted!';
                    adminRequestMessage.classList.remove('error-message');
                    adminRequestMessage.classList.add('info-message');
                    adminRequestForm.reset();
                } else {
                    adminRequestMessage.textContent = data.error || 'Failed to submit request.';
                    adminRequestMessage.classList.add('error-message');
                }
            } catch (error) {
                console.error('Index.js - Error submitting admin request:', error.message);
                adminRequestMessage.textContent = 'An error occurred.';
                adminRequestMessage.classList.add('error-message');
            }
        });
    }

    function setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn, .mobile-tab-btn');
        console.log('Index.js - Found', tabButtons.length, 'tab buttons (desktop + mobile)');
        tabButtons.forEach((btn, index) => {
            console.log(`Index.js - Setting up tab ${index + 1}: ${btn.dataset.tab || 'no-tab'}`);
            btn.addEventListener('click', () => {
                console.log('Index.js - Tab clicked:', btn.dataset.tab);
                if (btn.dataset.tab) {
                    document.querySelectorAll('.tab-btn, .mobile-tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
                    btn.classList.add('active');
                    const tabContent = document.getElementById(`${btn.dataset.tab}-tab`);
                    if (tabContent) {
                        tabContent.style.display = 'block';
                        document.querySelectorAll(`[data-tab="${btn.dataset.tab}"]`).forEach(b => b.classList.add('active'));
                    }
                }
            });
        });
    }

    function setupEventListeners() {
        console.log('Index.js - Setting up delegated event listeners');
        document.addEventListener('click', (e) => {
            console.log('Index.js - Click event detected on:', e.target.tagName, 'with class:', e.target.className);
            if (e.target.matches('.mobile-menu-toggle')) {
                e.preventDefault();
                console.log('Index.js - Mobile menu toggle clicked');
                const dropdownMenu = document.getElementById('dropdown-menu');
                if (dropdownMenu) {
                    dropdownMenu.classList.toggle('active');
                } else {
                    console.error('Index.js - Dropdown menu not found');
                }
            } else if (e.target.matches('.toggle-filters-btn')) {
                e.preventDefault();
                console.log('Index.js - Filters toggle clicked');
                const sortOptions = document.querySelector('#teachers-tab .sort-options');
                if (sortOptions) {
                    const isHidden = sortOptions.style.display === 'none';
                    sortOptions.style.display = isHidden ? 'block' : 'none';
                    e.target.textContent = isHidden ? 'Hide Filters' : 'Show Filters';
                } else {
                    console.error('Index.js - Sort options not found');
                }
            } else if (e.target.matches('.logo')) {
                e.preventDefault();
                console.log('Index.js - Logo clicked');
                window.location.href = '/';
            } else if (e.target.matches('.submit-teacher-btn')) {
                e.preventDefault();
                console.log('Index.js - Submit teacher button clicked');
                window.location.href = '/pages/teacher/submit-teacher.html';
            } else if (e.target.matches('#admin-btn')) {
                e.preventDefault();
                console.log('Index.js - Admin button clicked');
                checkAdminStatus();
            } else if (!e.target.closest('.mobile-menu-toggle') && !e.target.closest('#dropdown-menu')) {
                const dropdownMenu = document.getElementById('dropdown-menu');
                if (dropdownMenu?.classList.contains('active')) {
                    dropdownMenu.classList.remove('active');
                    console.log('Index.js - Mobile menu closed (outside click)');
                }
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.matches('#sort-select')) {
                e.preventDefault();
                console.log('Index.js - Sort select changed to:', e.target.value);
                fetchTeachers(1);
            } else if (e.target.matches('#sort-direction')) {
                e.preventDefault();
                console.log('Index.js - Sort direction changed to:', e.target.value);
                fetchTeachers(1);
            } else if (e.target.matches('#cards-per-page')) {
                e.preventDefault();
                console.log('Index.js - Cards per page changed to:', e.target.value);
                fetchTeachers(1);
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target.matches('#search-bar')) {
                console.log('Index.js - Search bar input triggered');
                fetchTeachers(1);
            }
        });
    }

    function fetchSettings() {
        fetch('/api/footer-settings', { credentials: 'include' })
            .then(response => response.json())
            .then(data => {
                const footerEmail = document.getElementById('footer-email');
                const footerMessage = document.getElementById('footer-message');
                if (footerEmail) footerEmail.innerHTML = `Email: <a href="mailto:${data.email}">${data.email}</a>`;
                if (footerMessage) {
                    footerMessage.textContent = data.message;
                    footerMessage.style.display = data.showMessage ? 'block' : 'none';
                }
            })
            .catch(error => console.error('Index.js - Error fetching footer settings:', error.message));

        fetch('/api/message-settings', { credentials: 'include' })
            .then(response => response.json())
            .then(data => {
                const messageDiv = document.getElementById('main-message');
                const messageText = document.getElementById('message-text');
                const closeButton = document.getElementById('close-message');
                if (messageDiv && messageText) {
                    messageText.textContent = data.message;
                    const isVisible = data.showMessage;
                    messageDiv.style.display = isVisible ? 'block' : 'none';
                    console.log('Index.js - Main message visibility set to:', isVisible ? 'visible' : 'hidden');
                    if (closeButton) {
                        closeButton.addEventListener('click', () => {
                            messageDiv.style.display = 'none';
                            console.log('Index.js - Main message closed');
                        });
                    }
                }
            })
            .catch(error => console.error('Index.js - Error fetching message settings:', error.message));
    }

    function initialize() {
        console.log('Index.js - Starting initialization');
        console.log('Index.js - DOM state - #teachers-tab:', !!document.getElementById('teachers-tab'), 
                    '#teacher-grid:', !!document.getElementById('teacher-grid'), 
                    '#pagination:', !!document.getElementById('pagination'));
        setupTabs();
        setupEventListeners();
        fetchSettings();
        fetchCsrfToken().then(() => {
            console.log('Index.js - CSRF fetched, proceeding with teachers and forms');
            fetchTeachers(1);
            setupSuggestionForm();
            setupAdminRequestForm();
            checkAdminStatus();
        });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }
});