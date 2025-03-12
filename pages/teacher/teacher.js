let teacherId = new URLSearchParams(window.location.search).get('id');
let teacherData = null;
let isAdmin = false;
let hasVoted = false;
const votedTeachers = document.cookie.split('; ')
    .find(row => row.startsWith('votedTeachers='))
    ?.split('=')[1]?.split(',')
    .filter(Boolean) || [];

document.addEventListener('DOMContentLoaded', () => {
    checkAdminStatus();
    loadTeacherProfile();
    setupEventListeners();
});

/**
 * Check if the user is an admin based on the adminToken cookie.
 */
function checkAdminStatus() {
    const adminToken = document.cookie.split('; ').find(row => row.startsWith('adminToken='));
    isAdmin = !!adminToken && adminToken.split('=')[1] === 'admin-token';
    document.querySelector('.admin-btn').textContent = isAdmin ? 'Admin Dashboard' : 'Admin Login';
}

/**
 * Load the teacher profile data from the server.
 */
async function loadTeacherProfile() {
    if (!teacherId) {
        showNotification('No teacher ID provided.', true);
        setTimeout(() => window.location.href = '/', 2000);
        return;
    }

    try {
        const response = await fetch(`/api/teachers/${teacherId}`, { credentials: 'include' });
        if (!response.ok) {
            if (response.status === 404) {
                showNotification('Teacher not found, redirecting to home...', true);
                setTimeout(() => window.location.href = '/', 2000);
                return;
            }
            throw new Error(`Failed to load teacher: ${response.statusText}`);
        }
        teacherData = await response.json();
        hasVoted = votedTeachers.includes(teacherId);
        document.title = `${teacherData.name} - Teacher Profile`;
        renderTeacherProfile();
    } catch (error) {
        console.error('Client - Error loading teacher:', error.message);
        showNotification('Error loading teacher profile. Please try again later.', true);
    }
}

/**
 * Render the teacher profile UI.
 */
function renderTeacherProfile() {
    const profileContainer = document.querySelector('.teacher-profile');
    if (!profileContainer) return;

    profileContainer.innerHTML = `
        <div class="teacher-header">
            <img src="${teacherData.image_link || '/public/images/default-teacher.jpg'}" alt="${teacherData.name}" class="teacher-image">
            <h1 class="teacher-name">${teacherData.name}</h1>
            <p class="teacher-room">Room: ${teacherData.room_number}</p>
        </div>
        <div class="teacher-content">
            <div class="teacher-left">
                <p class="teacher-description">${teacherData.description}</p>
                <p class="teacher-bio"><strong>Bio:</strong> ${teacherData.bio}</p>
                <p class="teacher-classes"><strong>Classes:</strong> ${teacherData.classes.join(', ')}</p>
                <div class="schedule-section">
                    <h3 class="schedule-heading">Schedule</h3>
                    <table class="schedule-table">
                        <thead><tr><th>Block</th><th>Subject</th><th>Grade</th></tr></thead>
                        <tbody>${teacherData.schedule.map(s => `
                            <tr><td>${s.block}</td><td>${s.subject}</td><td>${s.grade}</td></tr>
                        `).join('')}</tbody>
                    </table>
                </div>
                <button id="corrections-btn" class="submit-btn">Submit Correction</button>
            </div>
            <div class="teacher-right">
                <div class="average-rating">
                    Average Rating: <span class="avg-rating">${teacherData.avg_rating ? teacherData.avg_rating.toFixed(1) : 'N/A'}</span>
                    <span class="vote-count">(${teacherData.rating_count} votes)</span>
                </div>
                <div class="ratings-chart">
                    <h3 class="rating-heading">Rating Distribution</h3>
                    ${[5, 4, 3, 2, 1].map(star => {
                        const count = teacherData.ratings.filter(r => r.rating === star).length;
                        const percentage = teacherData.rating_count ? (count / teacherData.rating_count * 100).toFixed(1) : 0;
                        return `
                            <div class="chart-row">
                                <span class="chart-label">${star}★</span>
                                <div class="chart-bar-container">
                                    <div class="chart-bar" style="width: ${percentage}%"></div>
                                </div>
                                <span class="chart-count">${count}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="rating-section">
                    ${hasVoted ? '<p>You have already rated this teacher.</p>' : `
                        <h3 class="rating-heading">Rate This Teacher</h3>
                        <div class="star-rating" id="star-rating">
                            ${[1, 2, 3, 4, 5].map(i => `<span class="star" data-rating="${i}">★</span>`).join('')}
                        </div>
                        <textarea id="rating-comment" placeholder="Add a comment (optional)" rows="3"></textarea>
                        <button id="submit-rating" class="submit-btn" disabled>Submit Rating</button>
                    `}
                </div>
                <div class="reviews">
                    <h3 class="rating-heading">Reviews <button class="toggle-btn">${teacherData.ratings.length > 3 ? 'Show All' : 'Hide'}</button></h3>
                    <div class="reviews-list">
                        ${teacherData.ratings.slice(0, 3).map(r => `
                            <div class="review-item"><strong>${r.rating}★</strong> ${r.comment || 'No comment'}</div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
        ${isAdmin ? `
            <div class="admin-actions">
                <button id="edit-teacher-btn" class="submit-btn">Edit Teacher</button>
                <button id="delete-teacher-btn" class="cancel-btn">Delete Teacher</button>
            </div>
        ` : ''}
    `;

    if (!hasVoted) setupRatingStars();
    if (isAdmin) setupAdminActions();
    setupReviewToggle();
    setupCorrectionsButton();
}

/**
 * Set up event listeners for navigation buttons.
 */
function setupEventListeners() {
    document.querySelector('.logo')?.addEventListener('click', () => window.location.href = '/');
    document.querySelector('.admin-btn')?.addEventListener('click', () => {
        window.location.href = isAdmin ? '/pages/admin/dashboard.html' : '/pages/admin/login.html';
    });
    document.querySelector('.submit-teacher-btn')?.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');
}

/**
 * Set up interactive star rating system.
 */
function setupRatingStars() {
    const stars = document.querySelectorAll('#star-rating .star');
    const submitBtn = document.getElementById('submit-rating');
    let selectedRating = 0;

    stars.forEach(star => {
        star.addEventListener('mouseover', () => highlightStars(star.dataset.rating));
        star.addEventListener('mouseout', () => highlightStars(selectedRating));
        star.addEventListener('click', () => {
            selectedRating = star.dataset.rating;
            submitBtn.dataset.rating = selectedRating;
            submitBtn.disabled = false;
            highlightStars(selectedRating);
        });
    });

    submitBtn.addEventListener('click', submitRating);
}

/**
 * Highlight stars up to the selected rating.
 * @param {string|number} rating - The rating to highlight up to.
 */
function highlightStars(rating) {
    const stars = document.querySelectorAll('#star-rating .star');
    stars.forEach(star => star.classList.toggle('selected', star.dataset.rating <= rating));
}

/**
 * Submit a rating to the server and update the UI.
 */
async function submitRating() {
    const submitBtn = document.getElementById('submit-rating');
    const rating = parseInt(submitBtn.dataset.rating);
    const comment = document.getElementById('rating-comment')?.value.trim() || '';

    if (!rating || rating < 1 || rating > 5) {
        showNotification('Please select a rating between 1 and 5.', true);
        return;
    }

    try {
        const response = await fetch('/api/ratings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ teacher_id: teacherId, rating, comment })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit rating');
        }

        showNotification('Rating submitted successfully!');
        hasVoted = true;
        votedTeachers.push(teacherId);
        document.cookie = `votedTeachers=${votedTeachers.join(',')}; Path=/; Max-Age=31536000`;

        teacherData.avg_rating = data.avg_rating;
        teacherData.rating_count = data.rating_count;
        teacherData.ratings.push({ rating, comment });
        renderTeacherProfile();
    } catch (error) {
        console.error('Client - Error submitting rating:', error.message);
        showNotification(`Error submitting rating: ${error.message}`, true);
    }
}

/**
 * Set up toggle for showing all reviews.
 */
function setupReviewToggle() {
    const toggleBtn = document.querySelector('.toggle-btn');
    const reviewsList = document.querySelector('.reviews-list');
    if (!toggleBtn || !reviewsList || teacherData.ratings.length <= 3) return;

    toggleBtn.addEventListener('click', () => {
        if (toggleBtn.textContent === 'Show All') {
            reviewsList.innerHTML = teacherData.ratings.map(r => `
                <div class="review-item"><strong>${r.rating}★</strong> ${r.comment || 'No comment'}</div>
            `).join('');
            toggleBtn.textContent = 'Hide';
        } else {
            reviewsList.innerHTML = teacherData.ratings.slice(0, 3).map(r => `
                <div class="review-item"><strong>${r.rating}★</strong> ${r.comment || 'No comment'}</div>
            `).join('');
            toggleBtn.textContent = 'Show All';
        }
    });
}

/**
 * Set up admin action buttons (edit/delete).
 */
function setupAdminActions() {
    document.getElementById('edit-teacher-btn')?.addEventListener('click', showEditForm);
    document.getElementById('delete-teacher-btn')?.addEventListener('click', showDeleteModal);
}

/**
 * Set up the corrections button and modal.
 */
function setupCorrectionsButton() {
    const correctionsBtn = document.getElementById('corrections-btn');
    const modal = document.getElementById('corrections-modal');
    const cancelBtn = document.getElementById('cancel-correction');
    const form = document.getElementById('corrections-form');

    if (!correctionsBtn || !modal || !cancelBtn || !form) {
        console.error('Client - Correction elements not found');
        return;
    }

    correctionsBtn.addEventListener('click', () => {
        modal.classList.add('active');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        form.reset();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const suggestion = document.getElementById('correction-suggestion').value.trim();
        const file = document.getElementById('correction-file').files[0];

        if (!suggestion) {
            showNotification('Please provide a suggestion.', true);
            return;
        }

        const formData = new FormData();
        formData.append('suggestion', suggestion);
        if (file) formData.append('file', file);

        try {
            const response = await fetch(`/api/corrections/${teacherId}`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to submit correction');

            showNotification('Correction submitted successfully!');
            modal.classList.remove('active');
            form.reset();
        } catch (error) {
            console.error('Client - Error submitting correction:', error.message);
            showNotification(`Error submitting correction: ${error.message}`, true);
        }
    });
}

/**
 * Display the edit form for the teacher.
 */
function showEditForm() {
    const profileContainer = document.querySelector('.teacher-profile');
    profileContainer.innerHTML = `
        <form class="edit-form">
            <div class="form-group">
                <label for="edit-name">Name:</label>
                <input type="text" id="edit-name" value="${teacherData.name}" required>
            </div>
            <div class="form-group">
                <label for="edit-room">Room Number:</label>
                <input type="text" id="edit-room" value="${teacherData.room_number}" required>
            </div>
            <div class="form-group">
                <label for="edit-description">Description:</label>
                <input type="text" id="edit-description" value="${teacherData.description}" required>
            </div>
            <div class="form-group">
                <label for="edit-bio">Bio:</label>
                <textarea id="edit-bio" required>${teacherData.bio}</textarea>
            </div>
            <div class="form-group">
                <label for="edit-classes">Classes (comma-separated):</label>
                <input type="text" id="edit-classes" value="${teacherData.classes.join(', ')}" required>
            </div>
            <div class="form-group">
                <label for="edit-tags">Tags (comma-separated):</label>
                <input type="text" id="edit-tags" value="${teacherData.tags.join(', ')}" required>
            </div>
            <div class="form-group">
                <label for="edit-image">Image URL (optional):</label>
                <input type="url" id="edit-image" value="${teacherData.image_link || ''}">
            </div>
            <div class="schedule-edit">
                <h3>Schedule</h3>
                ${teacherData.schedule.map((s, i) => `
                    <div class="schedule-block" data-index="${i}">
                        <label>Block ${i + 1}:</label>
                        <input type="text" class="block" value="${s.block}" required>
                        <input type="text" class="subject" value="${s.subject}" required>
                        <input type="text" class="grade" value="${s.grade}" required>
                    </div>
                `).join('')}
            </div>
            <div class="admin-actions">
                <button type="submit" class="submit-btn">Save Changes</button>
                <button type="button" class="cancel-btn" onclick="loadTeacherProfile()">Cancel</button>
            </div>
        </form>
    `;

    document.querySelector('.edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const updatedData = {
            name: document.getElementById('edit-name').value.trim(),
            room_number: document.getElementById('edit-room').value.trim(),
            description: document.getElementById('edit-description').value.trim(),
            bio: document.getElementById('edit-bio').value.trim(),
            classes: document.getElementById('edit-classes').value.split(',').map(c => c.trim()).filter(c => c),
            tags: document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(t => t),
            image_link: document.getElementById('edit-image').value.trim() || '',
            schedule: Array.from(document.querySelectorAll('.schedule-block')).map(block => ({
                block: block.querySelector('.block').value.trim(),
                subject: block.querySelector('.subject').value.trim(),
                grade: block.querySelector('.grade').value.trim()
            }))
        };

        if (!updatedData.classes.length || !updatedData.tags.length || updatedData.schedule.some(s => !s.block || !s.subject || !s.grade)) {
            showNotification('All required fields must be filled correctly.', true);
            return;
        }

        try {
            const response = await fetch(`/api/admin/teachers/${teacherId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Cookie': document.cookie },
                body: JSON.stringify(updatedData)
            });
            const data = await response.json();
            if (response.ok) {
                showNotification('Teacher updated successfully!');
                teacherData = { ...teacherData, ...updatedData, ratings: teacherData.ratings, avg_rating: teacherData.avg_rating, rating_count: teacherData.rating_count };
                loadTeacherProfile();
            } else {
                throw new Error(data.error || 'Failed to update teacher');
            }
        } catch (error) {
            console.error('Client - Error updating teacher:', error.message);
            showNotification(`Error updating teacher: ${error.message}`, true);
        }
    });
}

/**
 * Display a confirmation modal for deleting the teacher.
 */
function showDeleteModal() {
    const modal = document.getElementById('modal');
    modal.classList.add('active');

    document.getElementById('confirm-delete').addEventListener('click', async () => {
        try {
            const response = await fetch(`/api/admin/teachers/${teacherId}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Cookie': document.cookie }
            });
            const data = await response.json();
            if (response.ok) {
                showNotification('Teacher deleted successfully!');
                setTimeout(() => window.location.href = '/', 1500);
            } else {
                throw new Error(data.error || 'Failed to delete teacher');
            }
        } catch (error) {
            console.error('Client - Error deleting teacher:', error.message);
            showNotification(`Error deleting teacher: ${error.message}`, true);
        } finally {
            modal.classList.remove('active');
        }
    });

    document.getElementById('cancel-delete').addEventListener('click', () => modal.classList.remove('active'));
}

/**
 * Show a notification message to the user.
 * @param {string} message - The message to display.
 * @param {boolean} isError - Whether the notification is an error.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Check if on admin pages
    const currentPath = window.location.pathname;
    const isAdminPage = currentPath.includes('/pages/admin/login.html') || currentPath.includes('/pages/admin/dashboard.html');
    if (isAdminPage) {
        console.log('Main message skipped on admin page.');
        return;
    }

    const messageDiv = document.getElementById('main-message');
    const messageText = document.getElementById('message-text');
    const closeButton = document.getElementById('close-message');

    if (!messageDiv || !messageText || !closeButton) {
        console.error('Main message elements not found in DOM.');
        return;
    }

    // Function to check if message should be shown
    function shouldShowMessage(newMessage) {
        const lastClosed = localStorage.getItem('mainMessageClosedTime');
        const lastMessage = localStorage.getItem('mainMessageContent');
        const now = Date.now();
        const fiveMinutes = 300000; // 5 minutes in milliseconds

        // Show if: no last closed time, message updated, or 5 minutes have passed
        return !lastClosed || lastMessage !== newMessage || (now - parseInt(lastClosed) >= fiveMinutes);
    }

    // Fetch and display message
    async function loadMainMessage() {
        try {
            const response = await fetch('/api/message-settings');
            if (!response.ok) throw new Error('Failed to fetch message settings');
            const data = await response.json();

            const { message, showMessage } = data;
            messageText.textContent = message;

            if (showMessage && shouldShowMessage(message)) {
                messageDiv.classList.add('active');
                messageDiv.style.display = 'block'; // Ensure visibility
            } else {
                messageDiv.classList.remove('active');
                messageDiv.style.display = 'none';
            }

            // Store current message content
            localStorage.setItem('mainMessageContent', message);
        } catch (error) {
            console.error('Error fetching main message:', error.message);
            messageDiv.classList.remove('active');
            messageDiv.style.display = 'none';
        }
    }

    // Close button handler
    closeButton.addEventListener('click', () => {
        messageDiv.classList.remove('active');
        messageDiv.style.display = 'none';
        localStorage.setItem('mainMessageClosedTime', Date.now().toString());
    });

    // ESC key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && messageDiv.classList.contains('active')) {
            messageDiv.classList.remove('active');
            messageDiv.style.display = 'none';
            localStorage.setItem('mainMessageClosedTime', Date.now().toString());
        }
    }, { once: true });

    // Load message on page load
    loadMainMessage();
});
function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => notification.style.display = 'none', 3000);
}