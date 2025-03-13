document.addEventListener('DOMContentLoaded', () => {
    console.log('Client - Index script loaded, initializing...');

    let teachersData = [];
    let currentPage = 1;
    let csrfToken = null;

    // Helper to show notifications
    function showNotification(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // Fetch CSRF token
    async function fetchCsrfToken() {
        try {
            const response = await fetch('/api/csrf-token', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch CSRF token');
            const data = await response.json();
            csrfToken = data.csrfToken;
            console.log('Client - CSRF token fetched:', csrfToken);
        } catch (error) {
            console.error('Client - Error fetching CSRF token:', error.message);
            showNotification('Error initializing security token', true);
        }
    }

    // Helper to get fetch parameters
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

    // Fetch teachers with pagination, search, and sorting
    async function fetchTeachers(page = 1) {
        const { search, sort, direction, perPage } = getFetchParams();
        try {
            const response = await fetch(`/api/teachers?page=${page}&perPage=${perPage}&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`, {
                credentials: 'include' // Include cookies
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to fetch teachers: ${response.statusText}`);
            }
            const data = await response.json();
            teachersData = data.teachers;
            renderTeachers();
            updatePagination(data.total);
        } catch (error) {
            console.error('Client - Error fetching teachers:', error.message);
            showNotification(`Error loading teachers: ${error.message}`, true);
        }
    }

    // Render teacher cards
    function renderTeachers() {
        const grid = document.getElementById('teacher-grid');
        if (!grid) {
            console.error('Client - Teacher grid element not found');
            showNotification('Teacher grid not found', true);
            return;
        }
        grid.innerHTML = teachersData.map(teacher => `
            <div class="teacher-card" data-id="${teacher.id}">
                <img src="${teacher.image_link || '/public/images/default-teacher.jpg'}" alt="${teacher.name}">
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
        `).join('');
        document.querySelectorAll('.teacher-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('view-profile')) {
                    window.location.href = `/pages/teacher/teacher.html?id=${card.dataset.id}`;
                }
            });
        });
    }

    // Update pagination controls
    function updatePagination(total) {
        const { perPage } = getFetchParams();
        const pagination = document.getElementById('pagination');
        if (!pagination) {
            console.error('Client - Pagination element not found');
            showNotification('Pagination not found', true);
            return;
        }
        const totalPages = Math.ceil(total / perPage);
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
            btn.addEventListener('click', () => { 
                currentPage = parseInt(btn.dataset.page); 
                fetchTeachers(currentPage); 
            });
        });
    }

    // Verify admin status with JWT
    async function checkAdminStatus() {
        try {
            const response = await fetch('/api/admin/verify', { credentials: 'include' });
            if (response.ok) {
                adminBtn.textContent = 'Admin Dashboard';
                adminBtn.onclick = () => window.location.href = '/pages/admin/dashboard.html';
            } else {
                adminBtn.textContent = 'Admin Login';
                adminBtn.onclick = () => window.location.href = '/pages/admin/login.html';
            }
        } catch (error) {
            console.error('Client - Error verifying admin status:', error.message);
            adminBtn.textContent = 'Admin Login';
            adminBtn.onclick = () => window.location.href = '/pages/admin/login.html';
        }
    }

    // DOM elements
    const searchBar = document.getElementById('search-bar');
    const sortSelect = document.getElementById('sort-select');
    const sortDirection = document.getElementById('sort-direction');
    const cardsPerPage = document.getElementById('cards-per-page');
    const logo = document.querySelector('.logo');
    const adminBtn = document.getElementById('admin-btn');
    const submitTeacherBtn = document.querySelector('.submit-teacher-btn');

    // Event listeners
    if (searchBar) searchBar.addEventListener('input', () => fetchTeachers(1));
    else console.warn('Client - Search bar not found');

    if (sortSelect) sortSelect.addEventListener('change', () => fetchTeachers(1));
    else console.warn('Client - Sort select not found');

    if (sortDirection) sortDirection.addEventListener('change', () => fetchTeachers(1));
    else console.warn('Client - Sort direction not found');

    if (cardsPerPage) cardsPerPage.addEventListener('change', () => fetchTeachers(1));
    else console.warn('Client - Cards per page not found');

    if (logo) logo.addEventListener('click', () => window.location.href = '/');
    else console.warn('Client - Logo not found');

    if (adminBtn) checkAdminStatus();
    else console.warn('Client - Admin button not found');

    if (submitTeacherBtn) submitTeacherBtn.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');
    else console.warn('Client - Submit teacher button not found');

    // Fetch footer settings
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
        .catch(error => console.error('Client - Error fetching footer settings:', error.message));

    // Fetch message settings
    fetch('/api/message-settings', { credentials: 'include' })
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch message settings');
            return response.json();
        })
        .then(data => {
            const messageDiv = document.getElementById('main-message');
            const messageText = document.getElementById('message-text');
            const closeButton = document.getElementById('close-message');
            if (messageDiv && messageText) {
                messageText.textContent = data.message;
                if (data.showMessage) {
                    messageDiv.style.display = 'block';
                    messageDiv.classList.add('active');
                } else {
                    messageDiv.style.display = 'none';
                    messageDiv.classList.remove('active');
                }
                if (closeButton) {
                    closeButton.addEventListener('click', () => {
                        messageDiv.style.display = 'none';
                        messageDiv.classList.remove('active');
                    });
                }
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && messageDiv.style.display === 'block') {
                        messageDiv.style.display = 'none';
                        messageDiv.classList.remove('active');
                    }
                }, { once: true });
            }
        })
        .catch(error => console.error('Client - Error fetching message settings:', error.message));

    // Initial fetch
    fetchCsrfToken().then(() => fetchTeachers(1));
});