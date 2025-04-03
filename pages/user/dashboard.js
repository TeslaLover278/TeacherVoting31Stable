// /pages/user/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('Client - User dashboard script loaded, initializing...');

    const API_BASE_URL = window.location.origin;
    let csrfToken = null;
    let userVotes = [];
    let username = '';

    async function fetchCsrfToken() {
        if (csrfToken) return csrfToken;
        try {
            const response = await fetch(`${API_BASE_URL}/api/csrf-token`, { credentials: 'include' });
            if (!response.ok) throw new Error(`Failed to fetch CSRF token: ${response.status}`);
            const data = await response.json();
            csrfToken = data.csrfToken;
            console.log('Client - CSRF token fetched:', csrfToken);
            document.querySelector('meta[name="csrf-token"]').content = csrfToken;
        } catch (error) {
            console.error('Client - Error fetching CSRF token:', error.message);
            showNotification('Error initializing security token', true);
        }
        return csrfToken;
    }

    async function loadUserData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user`, { credentials: 'include' });
            if (!response.ok) throw new Error(`Failed to load user data: ${response.status}`);
            const data = await response.json();
            username = data.username;
            document.getElementById('username').textContent = username;
        } catch (error) {
            console.error('Client - Error loading user data:', error.message);
            showNotification('Error loading user data. Please try again.', true);
        }
    }

    async function loadUserVotes() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user/votes`, { credentials: 'include' });
            if (!response.ok) throw new Error(`Failed to load votes: ${response.status}`);
            userVotes = await response.json();
            renderVotes();
        } catch (error) {
            console.error('Client - Error loading user votes:', error.message);
            showNotification('Error loading your votes. Please try again.', true);
        }
    }

    function renderVotes() {
        const votesList = document.getElementById('votes-list');
        if (!votesList) return;

        votesList.innerHTML = userVotes.length ? userVotes.map(vote => `
            <div class="vote-card" data-vote-id="${vote.id}">
                <h4>${vote.teacher_name}</h4>
                <div class="vote-display">
                    <p>Rating: <span class="rating">${vote.rating}★</span></p>
                    <p>Comment: <span class="comment">${vote.comment || 'No comment'}</span></p>
                    <button class="edit-toggle-btn">Edit</button>
                </div>
                <div class="vote-edit" style="display: none;">
                    <select class="edit-rating" aria-label="Edit rating">
                        ${[1, 2, 3, 4, 5].map(i => `<option value="${i}" ${vote.rating === i ? 'selected' : ''}>${i}★</option>`).join('')}
                    </select>
                    <textarea class="edit-comment" rows="2" aria-label="Edit comment">${vote.comment || ''}</textarea>
                    <div class="edit-actions">
                        <button class="submit-btn save-vote-btn">Save</button>
                        <button class="cancel-btn cancel-vote-btn">Cancel</button>
                    </div>
                </div>
            </div>
        `).join('') : '<p>You haven’t cast any votes yet.</p>';

        setupVoteListeners();
    }

    function setupVoteListeners() {
        document.querySelectorAll('.vote-card').forEach(card => {
            const voteId = card.dataset.voteId;
            const display = card.querySelector('.vote-display');
            const edit = card.querySelector('.vote-edit');
            const editBtn = card.querySelector('.edit-toggle-btn');
            const saveBtn = card.querySelector('.save-vote-btn');
            const cancelBtn = card.querySelector('.cancel-vote-btn');

            editBtn.addEventListener('click', () => {
                display.style.display = 'none';
                edit.style.display = 'block';
            });

            cancelBtn.addEventListener('click', () => {
                edit.style.display = 'none';
                display.style.display = 'block';
            });

           saveBtn.addEventListener('click', async () => {
    const rating = parseInt(card.querySelector('.edit-rating').value);
    const comment = card.querySelector('.edit-comment').value.trim();
    const token = await fetchCsrfToken();

    try {
        const response = await fetch(`${API_BASE_URL}/api/vote/${voteId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': token,
            },
            credentials: 'include',
            body: JSON.stringify({ rating, comment }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update vote: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }
        const data = await response.json();
        const vote = userVotes.find(v => v.id === voteId);
        vote.rating = rating;
        vote.comment = comment;
        card.querySelector('.rating').textContent = `${rating}★`;
        card.querySelector('.comment').textContent = comment || 'No comment';
        edit.style.display = 'none';
        display.style.display = 'block';
        showNotification('Vote updated successfully!');
    } catch (error) {
        console.error('Client - Error updating vote:', error.message);
        showNotification(`Error updating vote: ${error.message}`, true);
    }
});
        });
    }

    function showNotification(message, isError = false) {
        const notification = document.querySelector('.notification');
        if (!notification) return;
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = message;
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

    fetchCsrfToken().then(() => Promise.all([loadUserData(), loadUserVotes()]));
});