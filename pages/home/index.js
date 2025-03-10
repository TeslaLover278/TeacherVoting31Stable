const teacherGrid = document.getElementById('teacher-grid');
const searchBar = document.getElementById('search-bar');
const sortSelect = document.getElementById('sort-select');
const sortDirection = document.getElementById('sort-direction');
const cardsPerPageSelect = document.getElementById('cards-per-page');
const pagination = document.getElementById('pagination');

let currentPage = 1;

async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            return await response.json();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        }
    }
}

async function fetchTeachers() {
    const search = searchBar.value;
    const sort = sortSelect.value;
    const direction = sortDirection.value;
    const perPage = parseInt(cardsPerPageSelect.value);

    try {
        const data = await fetchWithRetry(`/api/teachers?page=${currentPage}&perPage=${perPage}&sort=${sort}&direction=${direction}&search=${encodeURIComponent(search)}`);
        teacherGrid.innerHTML = data.teachers.map(teacher => `
            <div class="teacher-card" onclick="window.location.href='/pages/teacher/teacher.html?id=${teacher.id}'" style="cursor: pointer;">
                <img src="/public/images/${teacher.id}.jpg" alt="${teacher.name}" onerror="this.src='/public/images/default-teacher.jpg';">
                <h3>${teacher.name}</h3>
                <p>${teacher.description}</p>
                <p>Room: ${teacher.room_number}</p>
                <p>Rating: ${teacher.avg_rating ? teacher.avg_rating.toFixed(1) : 'Not rated'}</p>
                <a href="/pages/teacher/teacher.html?id=${teacher.id}" onclick="event.stopPropagation();">View Profile</a>
            </div>
        `).join('');

        const totalPages = Math.ceil(data.total / perPage);
        pagination.innerHTML = `
            <button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
            <span>Page ${currentPage} of ${totalPages}</span>
            <button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
        `;
    } catch (error) {
        teacherGrid.innerHTML = '<p>Failed to load teachers.</p>';
        console.error('Client - Error loading teachers:', error);
    }
}

const throttle = (func, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = setTimeout(() => (inThrottle = false), limit);
        }
    };
};

function changePage(newPage) {
    currentPage = newPage;
    fetchTeachers();
}

// Event listeners
searchBar.addEventListener('input', throttle(() => {
    currentPage = 1;
    fetchTeachers();
}, 500));
sortSelect.addEventListener('change', () => {
    currentPage = 1;
    fetchTeachers();
});
sortDirection.addEventListener('change', () => {
    currentPage = 1;
    fetchTeachers();
});
cardsPerPageSelect.addEventListener('change', () => {
    currentPage = 1;
    fetchTeachers();
});

// Initial load
fetchTeachers();