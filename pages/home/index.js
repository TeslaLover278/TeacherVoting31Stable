// /pages/home/index.js
const BASE_URL = window.location.origin;

let csrfToken = '';
let teachersData = [];
let currentPage = 1;

// Expose csrfToken globally to share with other scripts
window.csrfToken = csrfToken;

function showNotification(message, isError = false) {
    const notification = document.getElementById('notification') || document.querySelector('.notification');
    if (!notification) {
        console.error('Index.js - Notification element not found');
        return;
    }
    notification.textContent = message;
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.style.display = 'block';
    notification.style.opacity = '1';
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.addEventListener('transitionend', () => {
            notification.style.display = 'none';
            notification.style.opacity = '1';
        }, { once: true });
    }, 3000);
}

async function fetchCsrfToken() {
    if (window.csrfToken) {
        console.log('Index.js - Using existing CSRF token:', window.csrfToken);
        return window.csrfToken;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/csrf-token`, { 
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) throw new Error(`Failed to fetch CSRF token: ${response.status}`);
        const data = await response.json();
        window.csrfToken = data.csrfToken;
        csrfToken = data.csrfToken;
        document.querySelector('meta[name="csrf-token"]').content = csrfToken;
        const suggestionCsrf = document.getElementById('suggestion-csrf-token');
        const adminCsrf = document.getElementById('admin-request-csrf-token');
        if (suggestionCsrf) suggestionCsrf.value = csrfToken;
        if (adminCsrf) adminCsrf.value = csrfToken;
        console.log('Index.js - CSRF token fetched:');
        return csrfToken;
    } catch (error) {
        console.error('Index.js - Error fetching CSRF token:', error.message);
        showNotification('Error initializing security token', true);
        throw error;
    }
}

function getFetchParams() {
    const searchBar = document.getElementById('search-bar');
    const sortSelect = document.getElementById('sort-select');
    const sortDirection = document.getElementById('sort-direction');
    const cardsPerPage = document.getElementById('cards-per-page');
    return {
        search: searchBar?.value.trim() || '',
        sort: sortSelect?.value || 'default',
        direction: sortDirection?.value || 'asc',
        perPage: parseInt(cardsPerPage?.value) || 8
    };
}

async function fetchTeachers(page = 1) {
    const grid = document.getElementById('teacher-grid');
    const pagination = document.getElementById('pagination');
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
        currentPage = page;
        renderTeachers();
        updatePagination(data.total || 0);
    } catch (error) {
        console.error('Index.js - Error fetching teachers:', error.message);
        showNotification(`Error loading teachers: ${error.message}`, true);
    }
}

function renderTeachers() {
    const grid = document.getElementById('teacher-grid');
    if (!grid) return;
    grid.innerHTML = teachersData.length ? teachersData.map(teacher => `
        <div class="teacher-card" data-id="${teacher.id}" role="button" tabindex="0" aria-label="View profile of ${teacher.name}">
            <img src="${teacher.image_link || '/public/images/default-teacher.jpg'}" 
                 alt="${teacher.name}" 
                 onerror="this.src='/public/images/default-teacher.jpg'">
            <h3>${teacher.name}</h3>
            <p>${teacher.description || 'No description'}</p>
            <div class="star-rating">
                ${teacher.avg_rating ? 
                    '★'.repeat(Math.round(teacher.avg_rating)) + 
                    '☆'.repeat(5 - Math.round(teacher.avg_rating)) + 
                    ` (${teacher.vote_count || 0})` : 
                    'No ratings (0)'}
            </div>
            <a href="/pages/teacher/teacher.html?id=${teacher.id}" class="view-profile">View Profile</a>
        </div>
    `).join('') : '<p>No teachers available.</p>';

    grid.querySelectorAll('.teacher-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('view-profile')) {
                window.location.href = `/pages/teacher/teacher.html?id=${card.dataset.id}`;
            }
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                window.location.href = `/pages/teacher/teacher.html?id=${card.dataset.id}`;
            }
        });
    });
}

function updatePagination(total) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    const { perPage } = getFetchParams();
    const totalPages = Math.ceil(total / perPage) || 1;
    pagination.innerHTML = `
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} id="prev-page" aria-label="Previous page">Previous</button>
        ${Array.from({ length: totalPages }, (_, i) => `
            <button class="pagination-btn ${currentPage === i + 1 ? 'active' : ''}" data-page="${i + 1}" aria-label="Page ${i + 1}">${i + 1}</button>
        `).join('')}
        <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} id="next-page" aria-label="Next page">Next</button>
    `;
    const prevPage = document.getElementById('prev-page');
    const nextPage = document.getElementById('next-page');
    if (prevPage) prevPage.addEventListener('click', () => fetchTeachers(currentPage - 1));
    if (nextPage) nextPage.addEventListener('click', () => fetchTeachers(currentPage + 1));
    pagination.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => fetchTeachers(parseInt(btn.dataset.page)));
    });
}

// Leaderboard Functions
async function fetchLeaderboard() {
    const tableContainer = document.getElementById('leaderboard-table');
    if (!tableContainer) {
        console.error('Index.js - Required leaderboard elements missing');
        showNotification('Leaderboard elements missing. Please refresh.', true);
        return;
    }
    const perPage = parseInt(document.getElementById('leaderboard-per-page')?.value) || 10;
    try {
        const response = await fetch(`${BASE_URL}/api/leaderboard?perPage=${perPage}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch leaderboard: ${response.status}`);
        }
        const data = await response.json();
        renderLeaderboard(data.users);
    } catch (error) {
        console.error('Index.js - Error fetching leaderboard:', error.message);
        showNotification(`Error loading leaderboard: ${error.message}`, true);
        tableContainer.innerHTML = '<p class="error-message">Error loading leaderboard.</p>';
    }
}

function renderLeaderboard(users) {
    const tableContainer = document.getElementById('leaderboard-table');
    if (!tableContainer) return;

    tableContainer.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Username</th>
                    <th>Points</th>
                </tr>
            </thead>
            <tbody>
                ${users.map((user, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${user.username}</td>
                        <td>${user.points}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function setupEventListeners() {
    const filtersBtn = document.getElementById('toggle-filters-btn');
    const searchBar = document.getElementById('search-bar');
    const sortSelect = document.getElementById('sort-select');
    const sortDirection = document.getElementById('sort-direction');
    const cardsPerPage = document.getElementById('cards-per-page');
    const leaderboardPerPage = document.getElementById('leaderboard-per-page');

    if (filtersBtn) {
        filtersBtn.addEventListener('click', () => {
            const sortOptions = document.querySelector('#teachers-tab .sort-options');
            if (sortOptions) {
                const isHidden = sortOptions.classList.contains('hidden');
                sortOptions.classList.toggle('hidden');
                filtersBtn.textContent = isHidden ? 'Hide Filters' : 'Show Filters';
            }
        });
    }
    if (searchBar) searchBar.addEventListener('input', () => fetchTeachers(1));
    if (sortSelect) sortSelect.addEventListener('change', () => fetchTeachers(1));
    if (sortDirection) sortDirection.addEventListener('change', () => fetchTeachers(1));
    if (cardsPerPage) cardsPerPage.addEventListener('change', () => fetchTeachers(1));
    if (leaderboardPerPage) leaderboardPerPage.addEventListener('change', () => fetchLeaderboard());

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).style.display = 'block';
            if (btn.dataset.tab === 'teachers') fetchTeachers(currentPage);
            if (btn.dataset.tab === 'leaderboard') fetchLeaderboard();
        });
    });
}

function initialize() {
    fetchCsrfToken().then(() => {
        fetchTeachers(1);
        setupEventListeners();
    }).catch(error => {
        console.error('Index.js - Initialization failed:', error.message);
    });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initialize();
} else {
    document.addEventListener('DOMContentLoaded', initialize);
}