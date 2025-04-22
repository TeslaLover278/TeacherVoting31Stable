let teacherId = new URLSearchParams(window.location.search).get('id');
let teacherData = null;
let isAdmin = false;
let isLoggedIn = false;
let hasVoted = false;
let csrfToken = null;
const BASE_URL = window.location.origin;
const votedTeachers = document.cookie.split('; ')
    .find(row => row.startsWith('votedTeachers='))
    ?.split('=')[1]?.split(',')
    .filter(Boolean) || [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Client - Teacher script loaded, initializing...');
    try {
        csrfToken = await fetchCsrfToken();
        if (!csrfToken) throw new Error('CSRF token not fetched');
    } catch (error) {
        console.error('Client - Initialization aborted due to CSRF token failure:', error.message);
        showNotification('Error initializing security token. Please refresh the page.', true);
        return;
    }

    // Explicitly hide modals on page load
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.remove('active');
        modal.style.display = 'none'; // Extra safeguard
        console.log(`Ensured modal ${modal.id} is hidden on load`);
    });

    try {
        await checkAdminStatus();
        await checkUserStatus();
        await loadTeacherProfile();
        setupEventListeners();
        loadMainMessage();
    } catch (error) {
        console.error('Client - Error during initialization:', error.message);
        showNotification('Error initializing page. Please try again.', true);
    }
});

async function fetchCsrfToken() {
    if (csrfToken) {
        console.log('Teacher.js - Using existing CSRF token:', csrfToken);
        return csrfToken;
    }

    try {
        console.log('Teacher.js - Fetching CSRF token from:', `${BASE_URL}/api/csrf-token`);
        const response = await fetch(`${BASE_URL}/api/csrf-token`, { 
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch CSRF token: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        if (!data.csrfToken) throw new Error('CSRF token not found in response');

        csrfToken = data.csrfToken;
        console.log('Teacher.js - CSRF token fetched:', csrfToken);

        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) metaTag.content = csrfToken;
        const suggestionCsrf = document.getElementById('suggestion-csrf-token');
        if (suggestionCsrf) suggestionCsrf.value = csrfToken;
        const adminCsrf = document.getElementById('admin-request-csrf-token');
        if (adminCsrf) adminCsrf.value = csrfToken;

        return csrfToken;
    } catch (error) {
        console.error('Teacher.js - Error fetching CSRF token:', error.message);
        throw error;
    }
}

async function checkAdminStatus() {
    try {
        const response = await fetch('/api/admin/verify', { credentials: 'include' });
        isAdmin = response.ok;
        const adminBtn = document.querySelector('.admin-btn');
        if (adminBtn) adminBtn.textContent = isAdmin ? 'Admin Dashboard' : 'Login';
        console.log(`Client - Admin status: ${isAdmin}`);
    } catch (error) {
        isAdmin = false;
        const adminBtn = document.querySelector('.admin-btn');
        if (adminBtn) adminBtn.textContent = 'Login';
        console.log('Client - Failed to check admin status:', error.message);
    }
}

async function checkUserStatus() {
    try {
        const response = await fetch('/api/user', { credentials: 'include' });
        if (!response.ok) throw new Error('User not logged in');
        const userData = await response.json();
        isLoggedIn = true;
        console.log('Client - User logged in:', userData);
        const loginBtn = document.querySelector('.login-btn');
        if (loginBtn) loginBtn.textContent = 'Dashboard';
    } catch (error) {
        console.log('Client - User not logged in:', error.message);
        isLoggedIn = false;
        const loginBtn = document.querySelector('.login-btn');
        if (loginBtn) loginBtn.textContent = 'Login';
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

        // Check voting status
        hasVoted = false;
        if (isLoggedIn) {
            try {
                const voteCheckResponse = await fetch(`/api/vote/check/${teacherId}`, {
                    credentials: 'include',
                    headers: { 'X-CSRF-Token': csrfToken }
                });
                if (voteCheckResponse.ok) {
                    const voteData = await voteCheckResponse.json();
                    hasVoted = voteData.hasVoted;
                } else {
                    console.log(`Vote check failed with status ${voteCheckResponse.status}, assuming not voted`);
                }
            } catch (error) {
                console.log('Error checking vote status:', error.message);
            }
        } else {
            hasVoted = votedTeachers.includes(teacherId);
        }

        document.title = `${teacherData.name} - Teacher Profile`;
        renderTeacherProfile();

        // Re-ensure modals are hidden after rendering
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.classList.remove('active');
            modal.style.display = 'none';
            console.log(`Ensured modal ${modal.id} is hidden after rendering`);
        });
    } catch (error) {
        console.error('Client - Error loading teacher:', error.message);
        showNotification('Error loading teacher profile. Please try again later.', true);
    }
}

function renderTeacherProfile() {
    const profileContainer = document.querySelector('.teacher-profile');
    if (!profileContainer) {
        console.error('Client - Teacher profile container not found');
        return;
    }

    try {
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
                        ${hasVoted 
                            ? '<p class="voted-message">You have already rated this teacher. Go to your <a href="/pages/user/user-dashboard.html">dashboard</a> to edit your vote.</p>' 
                            : `
                                <h3 class="rating-heading">Rate This Teacher</h3>
                                <div class="star-rating" id="star-rating">
                                    ${[1, 2, 3, 4, 5].map(i => `<span class="star" data-rating="${i}">★</span>`).join('')}
                                </div>
                                <textarea id="rating-comment" placeholder="Add a comment (optional)" rows="3"></textarea>
                                <button id="submit-rating" class="submit-btn" disabled>Submit Rating</button>
                            `
                        }
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
    } catch (error) {
        console.error('Client - Error rendering teacher profile:', error.message);
        showNotification('Error rendering profile. Please refresh the page.', true);
    }
}

function setupEventListeners() {
    try {
        document.querySelector('.logo')?.addEventListener('click', () => window.location.href = '/');
        document.querySelector('.admin-btn')?.addEventListener('click', () => {
            window.location.href = isAdmin ? '/pages/admin/admin-dashboard.html' : '/pages/user/user-dashboard.html';
        });
        const loginBtn = document.querySelector('.login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                window.location.href = isLoggedIn ? '/pages/user/user-dashboard.html' : '/login.html';
            });
        }
        document.querySelector('.submit-teacher-btn')?.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');
        console.log('Client - Event listeners set up');
    } catch (error) {
        console.error('Client - Error setting up event listeners:', error.message);
    }
}

function setupRatingStars() {
    try {
        const stars = document.querySelectorAll('#star-rating .star');
        const submitBtn = document.getElementById('submit-rating');
        if (!stars.length || !submitBtn) {
            console.error('Client - Star rating elements missing');
            return;
        }

        let selectedRating = 0;
        let isSubmitting = false;

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
            if (isSubmitting) return;
            isSubmitting = true;
            submitBtn.disabled = true;

            const rating = parseInt(submitBtn.dataset.rating);
            const comment = document.getElementById('rating-comment')?.value.trim() || '';

            if (!rating || rating < 1 || rating > 5) {
                showNotification('Please select a rating between 1 and 5.', true);
                isSubmitting = false;
                submitBtn.disabled = false;
                return;
            }

            const explicitWords = [
                'fuck', 'shit', 'ass', 'bitch', 'damn', 'cock', 'cunt', 'pussy',
                'bastard', 'whore', 'slut', 'dick', 'prick', 'fag', 'nigger'
            ];
            const lowerComment = comment.toLowerCase();
            const isExplicit = explicitWords.some(word => lowerComment.includes(word));

            if (isExplicit) {
                showNotification('Your comment contains inappropriate language. Please revise.', true);
                isSubmitting = false;
                submitBtn.disabled = false;
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
                    if (response.status === 403 && data.error === 'Already voted') {
                        showNotification('You have already rated this teacher. Please go to dashboard to edit your vote.', true);
                        hasVoted = true;
                        renderTeacherProfile();
                    } else if (response.status === 401 && isLoggedIn) {
                        showNotification('Session expired. Please log in again.', true);
                        setTimeout(() => window.location.href = '/login.html', 2000);
                    } else {
                        throw new Error(data.error || `Server error: ${response.status}`);
                    }
                    isSubmitting = false;
                    submitBtn.disabled = false;
                    return;
                }

                showNotification('Rating submitted successfully!', false);
                hasVoted = true;
                if (!isLoggedIn) {
                    votedTeachers.push(teacherId);
                    document.cookie = `votedTeachers=${votedTeachers.join(',')}; Path=/; Max-Age=31536000; SameSite=Strict`;
                }
                teacherData.avg_rating = data.avg_rating;
                teacherData.rating_count = data.rating_count;
                // Smooth fade-out, show spinner, reload, fade-in
                const profileContainer = document.querySelector('.teacher-profile');
                if (profileContainer) {
                    profileContainer.style.transition = 'opacity 0.4s';
                    profileContainer.style.opacity = '0';
                    // Show spinner overlay
                    let spinner = document.createElement('div');
                    spinner.id = 'profile-spinner';
                    spinner.style.position = 'absolute';
                    spinner.style.top = '50%';
                    spinner.style.left = '50%';
                    spinner.style.transform = 'translate(-50%, -50%)';
                    spinner.style.zIndex = '1000';
                    spinner.innerHTML = '<div style="border: 6px solid #eee; border-top: 6px solid #00B7D1; border-radius: 50%; width: 48px; height: 48px; animation: spin 1s linear infinite;"></div>';
                    profileContainer.parentElement.appendChild(spinner);
                }
                setTimeout(async () => {
                    await loadTeacherProfile();
                    if (profileContainer) {
                        profileContainer.style.opacity = '1';
                        const spinner = document.getElementById('profile-spinner');
                        if (spinner) spinner.remove();
                    }
                }, 400);

            } catch (error) {
                console.error('Client - Error submitting rating:', error.message);
                showNotification(`Error submitting rating: ${error.message}`, true);
                isSubmitting = false;
                submitBtn.disabled = false;
            }
        });
    } catch (error) {
        console.error('Client - Error setting up rating stars:', error.message);
    }
}

function highlightStars(rating) {
    try {
        const stars = document.querySelectorAll('#star-rating .star');
        stars.forEach(star => star.classList.toggle('selected', star.dataset.rating <= rating));
    } catch (error) {
        console.error('Client - Error highlighting stars:', error.message);
    }
}

function setupReviewToggle() {
    try {
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
    } catch (error) {
        console.error('Client - Error setting up review toggle:', error.message);
    }
}

function setupAdminActions() {
    try {
        const editBtn = document.getElementById('edit-teacher-btn');
        const deleteBtn = document.getElementById('delete-teacher-btn');
        if (editBtn) editBtn.addEventListener('click', showEditForm);
        if (deleteBtn) deleteBtn.addEventListener('click', showDeleteModal);
        console.log('Client - Admin actions set up');
    } catch (error) {
        console.error('Client - Error setting up admin actions:', error.message);
    }
}

function setupModalCloseOnOutsideClick(modal) {
    try {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                console.log(`Closing modal ${modal.id} via outside click`);
                modal.classList.remove('active');
                modal.style.display = 'none';
            }
        }, { once: true });
    } catch (error) {
        console.error('Client - Error setting up outside click handler:', error.message);
    }
}

function setupCorrectionsButton() {
    try {
        const correctionsBtn = document.getElementById('corrections-btn');
        const modal = document.getElementById('corrections-modal');
        const cancelBtn = document.getElementById('cancel-correction');
        const form = document.getElementById('corrections-form');

        if (!correctionsBtn || !modal || !cancelBtn || !form) {
            console.error('Corrections modal elements missing:', { correctionsBtn, modal, cancelBtn, form });
            return;
        }

        correctionsBtn.addEventListener('click', () => {
            console.log('Opening corrections modal');
            modal.classList.add('active');
            modal.style.display = 'flex';
            setupModalCloseOnOutsideClick(modal);
        });

        cancelBtn.addEventListener('click', () => {
            console.log('Cancel corrections modal');
            modal.classList.remove('active');
            modal.style.display = 'none';
            form.reset();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const suggestion = document.getElementById('correction-suggestion')?.value.trim();
            const file = document.getElementById('correction-file')?.files[0];

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

                showNotification('Correction submitted successfully!', false);
                console.log('Closing corrections modal after submission');
                modal.classList.remove('active');
                modal.style.display = 'none';
                form.reset();
            } catch (error) {
                console.error('Client - Error submitting correction:', error.message);
                showNotification(`Error submitting correction: ${error.message}`, true);
            }
        });
    } catch (error) {
        console.error('Client - Error setting up corrections button:', error.message);
    }
}

function showEditForm() {
    try {
        const profileContainer = document.querySelector('.teacher-profile');
        if (!profileContainer) {
            console.error('Client - Teacher profile container not found');
            return;
        }

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
                const maxSize = 5 * 1024 * 1024;
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

                showNotification('Teacher updated successfully!', false);
                teacherData = { ...teacherData, ...data, ratings: teacherData.ratings, avg_rating: teacherData.avg_rating, rating_count: teacherData.rating_count };
                await loadTeacherProfile();
            } catch (error) {
                console.error('Client - Error updating teacher:', error.message);
                showNotification(`Error updating teacher: ${error.message}`, true);
            }
        });

        document.getElementById('cancel-edit').addEventListener('click', () => loadTeacherProfile());
    } catch (error) {
        console.error('Client - Error showing edit form:', error.message);
        showNotification('Error loading edit form. Please try again.', true);
    }
}

function showDeleteModal() {
    try {
        const modal = document.getElementById('modal');
        if (!modal) {
            console.error('Client - Delete modal not found');
            return;
        }

        console.log('Opening delete modal');
        modal.classList.add('active');
        modal.style.display = 'flex';
        setupModalCloseOnOutsideClick(modal);

        const confirmBtn = document.getElementById('confirm-delete');
        const cancelBtn = document.getElementById('cancel-delete');
        if (!confirmBtn || !cancelBtn) {
            console.error('Client - Delete modal buttons missing:', { confirmBtn, cancelBtn });
            return;
        }

        const confirmHandler = async () => {
            try {
                const response = await fetch(`/api/admin/teachers/${teacherId}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRF-Token': csrfToken },
                    credentials: 'include'
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to delete teacher');

                showNotification('Teacher deleted successfully!', false);
                setTimeout(() => window.location.href = '/', 1500);
            } catch (error) {
                console.error('Client - Error deleting teacher:', error.message);
                showNotification(`Error deleting teacher: ${error.message}`, true);
            } finally {
                console.log('Closing delete modal');
                modal.classList.remove('active');
                modal.style.display = 'none';
            }
        };

        const cancelHandler = () => {
            console.log('Cancel delete modal');
            modal.classList.remove('active');
            modal.style.display = 'none';
        };

        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);

        confirmBtn.addEventListener('click', confirmHandler, { once: true });
        cancelBtn.addEventListener('click', cancelHandler, { once: true });
    } catch (error) {
        console.error('Client - Error showing delete modal:', error.message);
        showNotification('Error opening delete confirmation. Please try again.', true);
    }
}

function showNotification(message, isError = false) {
    try {
        const notification = document.getElementById('notification');
        if (!notification) {
            console.error('Client - Notification element not found');
            return;
        }
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
    } catch (error) {
        console.error('Client - Error showing notification:', error.message);
    }
}

function loadMainMessage() {
    try {
        const currentPath = window.location.pathname;
        if (currentPath.includes('/pages/admin/')) return;

        const messageDiv = document.getElementById('main-message');
        const messageText = document.getElementById('message-text');
        const closeButton = document.getElementById('close-message');
        if (!messageDiv || !messageText || !closeButton) {
            console.log('Client - Main message elements not found');
            return;
        }

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
    } catch (error) {
        console.error('Client - Error loading main message:', error.message);
    }
}