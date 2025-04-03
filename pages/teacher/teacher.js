let teacherId = new URLSearchParams(window.location.search).get('id');
let teacherData = null;
let isAdmin = false;
let isLoggedIn = false;
let hasVoted = false;
let csrfToken = null;
const votedTeachers = document.cookie.split('; ')
    .find(row => row.startsWith('votedTeachers='))
    ?.split('=')[1]?.split(',')
    .filter(Boolean) || [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Client - Teacher script loaded, initializing...');
    await fetchCsrfToken();
    await checkAdminStatus();
    await checkUserStatus();
    await loadTeacherProfile();
    setupEventListeners();
    loadMainMessage();
});

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

async function checkAdminStatus() {
    try {
        const response = await fetch('/api/admin/verify', { credentials: 'include' });
        isAdmin = response.ok;
        const adminBtn = document.querySelector('.admin-btn');
        if (adminBtn) adminBtn.textContent = isAdmin ? 'Admin Dashboard' : 'Login';
    } catch (error) {
        console.error('Client - Error verifying admin status:', error.message);
        isAdmin = false;
        const adminBtn = document.querySelector('.admin-btn');
        if (adminBtn) adminBtn.textContent = 'Login';
    }
}

async function checkUserStatus() {
    try {
        const response = await fetch('/api/user', { credentials: 'include' });
        if (!response.ok) throw new Error('User not logged in');
        const userData = await response.json();
        isLoggedIn = true;
        console.log('Client - User logged in:', userData);
    } catch (error) {
        console.log('Client - User not logged in:', error.message);
        isLoggedIn = false;
    }
}

async function loadTeacherProfile() {
    if (!teacherId) {
        showNotification('No teacher ID provided.', true);
        setTimeout(() => window.location.href = '/', 2000);
        return;
    }
    try {
        const response = await fetch(`/api/teachers/${teacherId}`, { credentials: 'include' });
        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 404) {
                showNotification('Teacher not found, redirecting to home...', true);
                setTimeout(() => window.location.href = '/', 2000);
                return;
            }
            throw new Error(errorData.error || `Failed to load teacher: ${response.statusText}`);
        }
        teacherData = await response.json();

        // Check if the user has voted
        if (isLoggedIn) {
            const voteCheck = await fetch(`/api/vote/check/${teacherId}`, {
                credentials: 'include',
                headers: { 'X-CSRF-Token': csrfToken }
            });
            hasVoted = voteCheck.ok && (await voteCheck.json()).hasVoted;
        } else {
            hasVoted = votedTeachers.includes(teacherId);
        }

        document.title = `${teacherData.name} - Teacher Profile`;
        renderTeacherProfile();
    } catch (error) {
        console.error('Client - Error loading teacher:', error.message);
        showNotification('Error loading teacher profile. Please try again later.', true);
    }
}

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
                <p class="teacher-bio"><strong>Bio:</strong> ${teacherData.bio}</p>
                <p class="teacher-classes"><strong>Classes:</strong> ${teacherData.classes.join(', ')}</p>
                <p class="teacher-tags"><strong>Tags:</strong> ${teacherData.tags.join(', ')}</p>
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

function setupEventListeners() {
    document.querySelector('.logo')?.addEventListener('click', () => window.location.href = '/');
    document.querySelector('.admin-btn')?.addEventListener('click', () => {
        window.location.href = isAdmin ? '/pages/admin/dashboard.html' : '/pages/auth/login.html';
    });
    document.querySelector('.submit-teacher-btn')?.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');
}

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

    submitBtn.addEventListener('click', async () => {
        if (hasVoted) {
            showNotification('You have already rated this teacher.', true);
            return;
        }

        const rating = parseInt(submitBtn.dataset.rating);
        const comment = document.getElementById('rating-comment')?.value.trim() || '';

        if (!rating || rating < 1 || rating > 5) {
            showNotification('Please select a rating between 1 and 5.', true);
            return;
        }

        // Explicit content filter
        const explicitWords = [
            'fuck', 'shit', 'ass', 'bitch', 'damn', 'cock', 'cunt', 'pussy',
            'bastard', 'whore', 'slut', 'dick', 'prick', 'fag', 'nigger'
        ];
        const lowerComment = comment.toLowerCase();
        const isExplicit = explicitWords.some(word => lowerComment.includes(word));

        if (isExplicit) {
            showNotification('Your comment contains inappropriate language. Please revise.', true);
            return;
        }

        const endpoint = isLoggedIn ? '/api/vote' : '/api/ratings';
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({ teacher_id: teacherId, rating, comment })
            });
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 && isLoggedIn) {
                    showNotification('Session expired. Please log in again.', true);
                    setTimeout(() => window.location.href = '/login.html', 2000);
                    return;
                }
                if (response.status === 403 && data.error === 'Already voted') {
                    showNotification('You have already rated this teacher.', true);
                    hasVoted = true;
                    renderTeacherProfile();
                    return;
                }
                throw new Error(data.error || 'Failed to submit rating');
            }

            showNotification('Rating submitted successfully!');
            hasVoted = true;
            if (!isLoggedIn) {
                votedTeachers.push(teacherId);
                document.cookie = `votedTeachers=${votedTeachers.join(',')}; Path=/; Max-Age=31536000; SameSite=Strict`;
            }
            teacherData.avg_rating = data.avg_rating;
            teacherData.rating_count = data.rating_count;
            teacherData.ratings.push({ rating, comment, is_explicit: data.is_explicit });
            renderTeacherProfile();
        } catch (error) {
            console.error('Client - Error submitting rating:', error.message);
            showNotification(`Error submitting rating: ${error.message}`, true);
        }
    });
}

function highlightStars(rating) {
    const stars = document.querySelectorAll('#star-rating .star');
    stars.forEach(star => star.classList.toggle('selected', star.dataset.rating <= rating));
}

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

function setupAdminActions() {
    document.getElementById('edit-teacher-btn')?.addEventListener('click', showEditForm);
    document.getElementById('delete-teacher-btn')?.addEventListener('click', showDeleteModal);
}

function setupCorrectionsButton() {
    const correctionsBtn = document.getElementById('corrections-btn');
    const modal = document.getElementById('corrections-modal');
    const cancelBtn = document.getElementById('cancel-correction');
    const form = document.getElementById('corrections-form');

    if (!correctionsBtn || !modal || !cancelBtn || !form) return;

    correctionsBtn.addEventListener('click', () => modal.classList.add('active'));
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
                headers: { 'X-CSRF-Token': csrfToken },
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

function showEditForm() {
    const profileContainer = document.querySelector('.teacher-profile');
    profileContainer.innerHTML = `
        <form id="edit-teacher-form" class="edit-form" enctype="multipart/form-data">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <div class="form-group">
                <label for="edit-name">Name:</label>
                <input type="text" id="edit-name" name="name" value="${teacherData.name}">
            </div>
            <div class="form-group">
                <label for="edit-room">Room Number:</label>
                <input type="text" id="edit-room" name="room_number" value="${teacherData.room_number}">
            </div>
            <div class="form-group">
                <label for="edit-bio">Bio:</label>
                <textarea id="edit-bio" name="bio">${teacherData.bio}</textarea>
            </div>
            <div class="form-group">
                <label for="edit-classes">Classes (comma-separated):</label>
                <input type="text" id="edit-classes" name="classes" value="${teacherData.classes.join(', ')}">
            </div>
            <div class="form-group">
                <label for="edit-tags">Tags (comma-separated):</label>
                <input type="text" id="edit-tags" name="tags" value="${teacherData.tags.join(', ')}">
            </div>
            <div class="form-group">
                <label for="edit-image">Upload New Image (optional):</label>
                <input type="file" id="edit-image" name="image" accept="image/*">
                <p>Current Image: <img src="${teacherData.image_link || '/public/images/default-teacher.jpg'}" alt="Current Image" style="max-width: 100px;"></p>
            </div>
            <div class="schedule-edit">
                <h3>Schedule</h3>
                ${teacherData.schedule.map((s, i) => `
                    <div class="schedule-block" data-index="${i}">
                        <label>Block ${i + 1}:</label>
                        <input type="text" class="block" name="schedule[${i}][block]" value="${s.block}">
                        <input type="text" class="subject" name="schedule[${i}][subject]" value="${s.subject}">
                        <input type="text" class="grade" name="schedule[${i}][grade]" value="${s.grade}">
                    </div>
                `).join('')}
            </div>
            <div class="admin-actions">
                <button type="submit" class="submit-btn">Save Changes</button>
                <button type="button" class="cancel-btn" id="cancel-edit">Cancel</button>
            </div>
        </form>
    `;

    document.getElementById('edit-teacher-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);

        const schedule = [];
        teacherData.schedule.forEach((_, i) => {
            const block = formData.get(`schedule[${i}][block]`)?.trim() || '';
            const subject = formData.get(`schedule[${i}][subject]`)?.trim() || '';
            const grade = formData.get(`schedule[${i}][grade]`)?.trim() || '';
            schedule.push({ block, subject, grade });
        });
        teacherData.schedule.forEach((_, i) => {
            formData.delete(`schedule[${i}][block]`);
            formData.delete(`schedule[${i}][subject]`);
            formData.delete(`schedule[${i}][grade]`);
        });
        formData.set('schedule', JSON.stringify(schedule));

        const imageFile = formData.get('image');
        if (imageFile && imageFile.size > 0) {
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (imageFile.size > maxSize) {
                showNotification('Image file size exceeds 5MB limit.', true);
                return;
            }
            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(imageFile.type)) {
                showNotification('Invalid image type. Use JPG, PNG, or GIF.', true);
                return;
            }
        }

        try {
            const response = await fetch(`/api/admin/teachers/${teacherId}`, {
                method: 'PUT',
                headers: { 'X-CSRF-Token': csrfToken },
                credentials: 'include',
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update teacher');

            showNotification('Teacher updated successfully!');
            teacherData = { ...teacherData, ...data, ratings: teacherData.ratings, avg_rating: teacherData.avg_rating, rating_count: teacherData.rating_count };
            await loadTeacherProfile();
        } catch (error) {
            console.error('Client - Error updating teacher:', error.message);
            showNotification(`Error updating teacher: ${error.message}`, true);
        }
    });

    document.getElementById('cancel-edit').addEventListener('click', () => loadTeacherProfile());
}

function showDeleteModal() {
    const modal = document.getElementById('modal');
    modal.classList.add('active');

    document.getElementById('confirm-delete').addEventListener('click', async () => {
        try {
            const response = await fetch(`/api/admin/teachers/${teacherId}`, {
                method: 'DELETE',
                headers: { 'X-CSRF-Token': csrfToken },
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete teacher');

            showNotification('Teacher deleted successfully!');
            setTimeout(() => window.location.href = '/', 1500);
        } catch (error) {
            console.error('Client - Error deleting teacher:', error.message);
            showNotification(`Error deleting teacher: ${error.message}`, true);
        } finally {
            modal.classList.remove('active');
        }
    });

    document.getElementById('cancel-delete').addEventListener('click', () => modal.classList.remove('active'));
}

function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    if (!notification) return;
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.textContent = message;
    notification.style.opacity = '0';
    notification.style.display = 'block';
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.addEventListener('transitionend', () => {
                notification.style.display = 'none';
            }, { once: true });
        }, 3000);
    });
}

function loadMainMessage() {
    const currentPath = window.location.pathname;
    if (currentPath.includes('/pages/admin/')) return;

    const messageDiv = document.getElementById('main-message');
    const messageText = document.getElementById('message-text');
    const closeButton = document.getElementById('close-message');
    if (!messageDiv || !messageText || !closeButton) return;

    function shouldShowMessage(newMessage) {
        const lastClosed = localStorage.getItem('mainMessageClosedTime');
        const lastMessage = localStorage.getItem('mainMessageContent');
        const now = Date.now();
        const fiveMinutes = 300000;
        return !lastClosed || lastMessage !== newMessage || (now - parseInt(lastClosed) >= fiveMinutes);
    }

    fetch('/api/message-settings', { credentials: 'include' })
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch message settings');
            return response.json();
        })
        .then(data => {
            messageText.textContent = data.message;
            if (data.showMessage && shouldShowMessage(data.message)) {
                messageDiv.classList.add('active');
                messageDiv.style.display = 'block';
            } else {
                messageDiv.classList.remove('active');
                messageDiv.style.display = 'none';
            }
            localStorage.setItem('mainMessageContent', data.message);
        })
        .catch(error => console.error('Client - Error fetching message settings:', error.message));

    closeButton.addEventListener('click', () => {
        messageDiv.classList.remove('active');
        messageDiv.style.display = 'none';
        localStorage.setItem('mainMessageClosedTime', Date.now().toString());
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && messageDiv.classList.contains('active')) {
            messageDiv.classList.remove('active');
            messageDiv.style.display = 'none';
            localStorage.setItem('mainMessageClosedTime', Date.now().toString());
        }
    }, { once: true });
}