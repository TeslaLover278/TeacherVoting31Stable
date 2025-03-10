let teacherId = new URLSearchParams(window.location.search).get('id');
let teacherData = null;
let isAdmin = false;
let hasVoted = false;
const votedTeachers = document.cookie.split('; ')
    .find(row => row.startsWith('votedTeachers='))
    ?.split('=')[1]?.split(',') || [];

document.addEventListener('DOMContentLoaded', () => {
    checkAdminStatus();
    loadTeacherProfile();
    setupEventListeners();
});

function checkAdminStatus() {
    const adminToken = document.cookie.split('; ').find(row => row.startsWith('adminToken='));
    isAdmin = !!adminToken && adminToken.split('=')[1] === 'admin-token';
}

async function loadTeacherProfile() {
    if (!teacherId) {
        showNotification('No teacher ID provided.', true);
        setTimeout(() => window.location.href = '/', 2000);
        return;
    }

    try {
        const response = await fetch(`/api/teachers/${teacherId}`);
        if (!response.ok) {
            if (response.status === 404) {
                showNotification('Teacher not found, redirecting to home...', true);
                setTimeout(() => window.location.href = '/', 2000);
                return;
            }
            throw new Error('Failed to load teacher');
        }
        teacherData = await response.json();
        hasVoted = votedTeachers.includes(teacherId);
        renderTeacherProfile();
    } catch (error) {
        console.error('Client - Error loading teacher:', error.message);
        showNotification('Error loading teacher profile.', true);
    }
}

function renderTeacherProfile() {
    const profileContainer = document.querySelector('.teacher-profile');
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
                        <tr><th>Block</th><th>Subject</th><th>Grade</th></tr>
                        ${teacherData.schedule.map(s => `
                            <tr><td>${s.block}</td><td>${s.subject}</td><td>${s.grade}</td></tr>
                        `).join('')}
                    </table>
                </div>
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
                        const percentage = teacherData.rating_count ? (count / teacherData.rating_count * 100) : 0;
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
                        <div class="star-rating">
                            ${[1, 2, 3, 4, 5].map(i => `<span class="star" data-rating="${i}">★</span>`).join('')}
                        </div>
                        <textarea id="rating-comment" placeholder="Add a comment (optional)"></textarea>
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

    const toggleBtn = document.querySelector('.toggle-btn');
    const reviewsList = document.querySelector('.reviews-list');
    if (toggleBtn && reviewsList) {
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
}

function setupEventListeners() {
    document.querySelector('.logo')?.addEventListener('click', () => window.location.href = '/');
    document.querySelector('.admin-btn')?.addEventListener('click', () => window.location.href = '/pages/admin/login.html');
    document.querySelector('.submit-teacher-btn')?.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');
}

function setupRatingStars() {
    const stars = document.querySelectorAll('.star');
    const submitBtn = document.getElementById('submit-rating');
    stars.forEach(star => {
        star.addEventListener('mouseover', () => highlightStars(star.dataset.rating));
        star.addEventListener('mouseout', () => highlightStars(submitBtn.dataset.rating || 0));
        star.addEventListener('click', () => {
            submitBtn.dataset.rating = star.dataset.rating;
            submitBtn.disabled = false;
            highlightStars(star.dataset.rating);
        });
    });
    submitBtn?.addEventListener('click', submitRating);
}

function highlightStars(rating) {
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => star.classList.toggle('selected', star.dataset.rating <= rating));
}

async function submitRating() {
    const submitBtn = document.getElementById('submit-rating');
    const rating = parseInt(submitBtn?.dataset.rating);
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
        if (response.ok) {
            showNotification('Rating submitted successfully!');
            hasVoted = true;
            document.cookie = `votedTeachers=${votedTeachers.concat(teacherId).join(',')}; Path=/; Max-Age=31536000`;
            loadTeacherProfile();
        } else {
            throw new Error(data.error || 'Failed to submit rating');
        }
    } catch (error) {
        console.error('Client - Error submitting rating:', error.message);
        showNotification('Error submitting rating: ' + error.message, true);
    }
}

function setupAdminActions() {
    document.getElementById('edit-teacher-btn')?.addEventListener('click', showEditForm);
    document.getElementById('delete-teacher-btn')?.addEventListener('click', showDeleteModal);
}

function showEditForm() {
    const profileContainer = document.querySelector('.teacher-profile');
    profileContainer.innerHTML += `
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
            <div class="schedule-edit">
                <h3>Schedule</h3>
                ${teacherData.schedule.map((s, i) => `
                    <div class="schedule-block">
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
            schedule: Array.from(document.querySelectorAll('.schedule-block')).map(block => ({
                block: block.querySelector('.block').value.trim(),
                subject: block.querySelector('.subject').value.trim(),
                grade: block.querySelector('.grade').value.trim()
            }))
        };

        try {
            const response = await fetch(`/api/admin/teachers/${teacherId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(updatedData)
            });
            const data = await response.json();
            if (response.ok) {
                showNotification('Teacher updated successfully!');
                teacherData = { ...teacherData, ...updatedData };
                loadTeacherProfile();
            } else {
                throw new Error(data.error || 'Failed to update teacher');
            }
        } catch (error) {
            console.error('Client - Error updating teacher:', error.message);
            showNotification('Error updating teacher.', true);
        }
    });
}

function showDeleteModal() {
    document.body.innerHTML += `
        <div class="modal" style="display: flex;">
            <div class="modal-content">
                <h2>Confirm Deletion</h2>
                <p>Are you sure you want to delete ${teacherData.name}?</p>
                <button id="confirm-delete" class="modal-btn">Delete</button>
                <button id="cancel-delete" class="modal-btn">Cancel</button>
            </div>
        </div>
    `;

    document.getElementById('confirm-delete').addEventListener('click', async () => {
        try {
            const response = await fetch(`/api/admin/teachers/${teacherId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                showNotification('Teacher deleted successfully!');
                window.location.href = '/';
            } else {
                throw new Error(data.error || 'Failed to delete teacher');
            }
        } catch (error) {
            console.error('Client - Error deleting teacher:', error.message);
            showNotification('Error deleting teacher.', true);
        }
    });

    document.getElementById('cancel-delete').addEventListener('click', () => {
        document.querySelector('.modal').remove();
    });
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.backgroundColor = isError ? '#FF0000' : '#00B7D1';
    notification.style.display = 'block';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}