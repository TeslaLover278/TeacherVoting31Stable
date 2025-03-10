document.addEventListener('DOMContentLoaded', () => {
    console.log('Client - Index script loaded, initializing...');

    let teachersData = [];
    let currentPage = 1;

    function showNotification(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    function fetchTeachers(page = 1, search = '', sort = 'default', direction = 'asc', perPage = 8) {
        fetch(`/api/teachers?page=${page}&perPage=${perPage}&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch teachers');
                return response.json();
            })
            .then(data => {
                teachersData = data.teachers;
                renderTeachers();
                updatePagination(data.total);
            })
            .catch(error => {
                console.error('Client - Error fetching teachers:', error.message);
                showNotification('Error loading teachers', true);
            });
    }

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
                <div class="star-rating">${teacher.avg_rating ? '★'.repeat(Math.round(teacher.avg_rating)) + '☆'.repeat(5 - Math.round(teacher.avg_rating)) : 'No ratings'}</div>
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

    function updatePagination(total) {
        const perPage = parseInt(document.getElementById('cards-per-page')?.value) || 8;
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
        if (prevPage) prevPage.addEventListener('click', () => { currentPage--; fetchTeachers(currentPage, document.getElementById('search-bar')?.value || '', document.getElementById('sort-select')?.value || 'default', document.getElementById('sort-direction')?.value || 'asc', perPage); });
        if (nextPage) nextPage.addEventListener('click', () => { currentPage++; fetchTeachers(currentPage, document.getElementById('search-bar')?.value || '', document.getElementById('sort-select')?.value || 'default', document.getElementById('sort-direction')?.value || 'asc', perPage); });
        document.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); fetchTeachers(currentPage, document.getElementById('search-bar')?.value || '', document.getElementById('sort-select')?.value || 'default', document.getElementById('sort-direction')?.value || 'asc', perPage); });
        });
    }

    const searchBar = document.getElementById('search-bar');
    const sortSelect = document.getElementById('sort-select');
    const sortDirection = document.getElementById('sort-direction');
    const cardsPerPage = document.getElementById('cards-per-page');
    const logo = document.querySelector('.logo');
    const adminBtn = document.getElementById('admin-btn');
    const submitTeacherBtn = document.querySelector('.submit-teacher-btn');

    if (searchBar) searchBar.addEventListener('input', (e) => fetchTeachers(1, e.target.value, sortSelect?.value || 'default', sortDirection?.value || 'asc', cardsPerPage?.value || 8));
    else console.warn('Client - Search bar not found');

    if (sortSelect) sortSelect.addEventListener('change', (e) => fetchTeachers(1, searchBar?.value || '', e.target.value, sortDirection?.value || 'asc', cardsPerPage?.value || 8));
    else console.warn('Client - Sort select not found');

    if (sortDirection) sortDirection.addEventListener('change', (e) => fetchTeachers(1, searchBar?.value || '', sortSelect?.value || 'default', e.target.value, cardsPerPage?.value || 8));
    else console.warn('Client - Sort direction not found');

    if (cardsPerPage) cardsPerPage.addEventListener('change', (e) => fetchTeachers(1, searchBar?.value || '', sortSelect?.value || 'default', sortDirection?.value || 'asc', e.target.value));
    else console.warn('Client - Cards per page not found');

    if (logo) logo.addEventListener('click', () => window.location.href = '/');
    else console.warn('Client - Logo not found');

    if (adminBtn) {
        const cookies = document.cookie.split(';').map(cookie => cookie.trim().split('='));
        const adminToken = cookies.find(cookie => cookie[0] === 'adminToken')?.[1];
        adminBtn.textContent = adminToken === 'admin-token' ? 'Admin Dashboard' : 'Admin Login';
        adminBtn.addEventListener('click', () => window.location.href = adminToken === 'admin-token' ? '/pages/admin/dashboard.html' : '/pages/admin/login.html');
    } else console.warn('Client - Admin button not found');

    if (submitTeacherBtn) submitTeacherBtn.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');
    else console.warn('Client - Submit teacher button not found');

    fetch('/api/footer-settings')
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

    fetch('/api/message-settings')
        .then(response => response.json())
        .then(data => {
            const messageDiv = document.getElementById('main-message');
            const messageText = document.getElementById('message-text');
            const closeButton = document.getElementById('close-message');
            if (messageDiv && messageText && data.showMessage) {
                messageText.textContent = data.message;
                messageDiv.style.display = 'block';
                if (closeButton) {
                    closeButton.addEventListener('click', () => messageDiv.style.display = 'none');
                }
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') messageDiv.style.display = 'none';
                });
            }
        })
        .catch(error => console.error('Client - Error fetching message settings:', error.message));

    fetchTeachers(1, '', 'default', 'asc', cardsPerPage?.value || 8);
});