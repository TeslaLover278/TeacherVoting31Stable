document.addEventListener('DOMContentLoaded', async () => {
    // Global logout for users
    window.logout = async () => {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!response.ok) throw new Error(`Logout failed: ${response.status}`);
            console.log('Client - User logout successful');
        } catch (error) {
            console.error('Client - User logout failed, proceeding with client-side cleanup:', error);
        } finally {
            localStorage.removeItem('userToken');
            document.cookie = 'userToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;';
            document.cookie = 'connect.sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;';
            showNotification('Logged out successfully!');
            setTimeout(() => window.location.href = '/pages/login.html', 1000);
        }
    };

    // Redirect if not logged in as user
    function showRedirectMessage(msg) {
        let div = document.createElement('div');
        div.textContent = msg;
        div.style.position = 'fixed';
        div.style.top = '20px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.background = '#ffc107';
        div.style.color = '#222';
        div.style.padding = '12px 24px';
        div.style.borderRadius = '8px';
        div.style.fontWeight = 'bold';
        div.style.zIndex = '9999';
        document.body.appendChild(div);
    }

    console.log('Client - User dashboard script loaded, initializing...');

    const welcomeMessages = [
        'Venture into the shadows to shape their legacy...', 
        'Dare to wield your truth in secret...', 
        'Cast your silent verdict to echo through time...', 
        'Your hidden voice holds unshakable power...', 
        'Enter a veiled sanctuary for your judgment...', 
        'Together, we redefine wisdoms unseen path...', 
        'Every secret vote alters their destined course...', 
        'Sculpt the art of teaching with your silent will...', 
        'Your shadowed insights forge tomorrows mentors...', 
        'Empower the future from the cloak of anonymity...'
    ];

    function getRandomWelcomeMessage() {
        const randomIndex = Math.floor(Math.random() * welcomeMessages.length);
        return welcomeMessages[randomIndex];
    }

    const state = {
        csrfToken: null,
        userVotes: [],
        username: '',
        streak: 0,
        pointsHistory: [],
        userBadges: [],
        isDarkMode: getCookie('theme') === 'dark'
    };

    // Event Handlers
    const setupVoteListeners = {
        setupVoteCards() {
            document.querySelectorAll('.vote-card').forEach(card => {
                const voteId = card.dataset.voteId;
                if (!voteId) return;

                card.querySelector('.edit-toggle-btn')?.addEventListener('click', () => {
                    const vote = state.userVotes.find(v => String(v.id) === String(voteId));
                    if (!vote) {
                        showNotification('Vote not found', 'error');
                        return;
                    }

                    const modal = document.getElementById('vote-edit-modal');
                    const overlay = document.getElementById('modal-overlay');
                    if (!modal || !overlay) return;

                    const content = document.getElementById('vote-edit-content');
                    if (!content) return;

                    content.innerHTML = `
                        <h2>Edit Vote for ${sanitizeInput(vote.teacher_name)}</h2>
                        <div class="form-group">
                            <label for="edit-rating">Rating:</label>
                            <select id="edit-rating" required>
                                ${[1, 2, 3, 4, 5].map(num =>
                                    `<option value="${num}" ${vote.rating === num ? 'selected' : ''}>${num}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="edit-comment">Comment:</label>
                            <textarea id="edit-comment" required>${vote.comment || ''}</textarea>
                        </div>
                        <div class="modal-actions">
                            <button class="save-vote-btn" style="background: var(--button-bg); color: #fff; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; margin-right: 1rem;">Save</button>
                            <button class="cancel-vote-btn" style="background: var(--button-disabled); color: #fff; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        </div>
                    `;
                    modal.classList.add('active');
                    overlay.classList.add('active');

                    content.querySelector('.cancel-vote-btn').onclick = () => setupVoteListeners.closeModals();

                    const explicitWords = [
                        'fuck', 'shit', 'ass', 'bitch', 'damn', 'cunt', 'piss',
                        'cock', 'dick', 'bastard', 'whore', 'slut', 'fag', 'nigger'
                    ];

                    // Save button click handler
                    const saveButton = content.querySelector('.save-vote-btn');
                    if (saveButton) {
                        saveButton.addEventListener('click', async () => {
                            console.log('Save button clicked');
                            const rating = parseInt(content.querySelector('#edit-rating').value, 10);
                            const comment = content.querySelector('#edit-comment').value.trim();
                            console.log('Rating:', rating, 'Comment:', comment);

                            if (explicitWords.some(word => comment.toLowerCase().includes(word))) {
                                showNotification('Cannot update vote: Comment contains inappropriate language.', 'error');
                                return;
                            }

                            try {
                                // Close modal first
                                const voteModal = document.getElementById('vote-edit-modal');
                                const modalOverlay = document.getElementById('modal-overlay');
                                console.log('Modal elements:', voteModal, modalOverlay);
                                
                                // Force display none
                                if (voteModal) {
                                    voteModal.classList.remove('active');
                                    voteModal.style.display = 'none';
                                }
                                if (modalOverlay) {
                                    modalOverlay.classList.remove('active');
                                    modalOverlay.style.display = 'none';
                                }
                                console.log('Modal closed');

                                // Then send API request
                                console.log('Sending API request...');
                                await fetchData(`/api/vote/${voteId}`, {
                                    method: 'PUT',
                                    headers: { 
                                        'Content-Type': 'application/json',
                                        'X-CSRF-Token': state.csrfToken
                                    },
                                    body: JSON.stringify({ rating, comment })
                                });
                                console.log('API request successful');
                                
                                // Update local state
                                const voteIndex = state.userVotes.findIndex(v => String(v.id) === String(voteId));
                                if (voteIndex !== -1) {
                                    state.userVotes[voteIndex] = { 
                                        ...state.userVotes[voteIndex],
                                        rating,
                                        comment
                                    };
                                    console.log('Local state updated');
                                }

                                // Re-render votes and show success
                                renderVotes();
                                showNotification('Vote updated successfully!', 'success');
                            } catch (error) {
                                console.error('Client - Error updating vote:', error.message);
                                showNotification(`Error updating vote: ${error.message}`, 'error');
                            }
                        });
                    }

                    // Cancel button click handler
                    const cancelButton = content.querySelector('.cancel-vote-btn');
                    if (cancelButton) {
                        cancelButton.addEventListener('click', () => {
                            const modal = document.getElementById('vote-edit-modal');
                            const overlay = document.getElementById('modal-overlay');
                            if (modal) {
                                modal.classList.remove('active');
                                modal.style.display = 'none';
                            }
                            if (overlay) {
                                overlay.classList.remove('active');
                                overlay.style.display = 'none';
                            }
                        });
                    }
                });
            });
        },

        initializeEventListeners() {
            document.getElementById('dark-mode-toggle')?.addEventListener('change', (e) => {
                const isDark = e.target.checked;
                applyTheme(isDark);
                document.querySelector('.toggle-status').textContent = isDark ? 'Dark' : 'Light';
                setCookie('theme', isDark ? 'dark' : 'light', 365);
            });

            document.querySelectorAll('.close-modal').forEach(btn => {
                btn.addEventListener('click', closeModals);
            });

            document.getElementById('modal-overlay')?.addEventListener('click', closeModals);
        },

        closeModals() {
            const overlay = document.getElementById('modal-overlay');
            const voteModal = document.getElementById('vote-edit-modal');
            const historyModal = document.getElementById('history-modal');

            overlay?.classList.remove('active');
            voteModal?.classList.remove('active');
            historyModal?.classList.remove('active');
        },

        initialize() {
            this.setupVoteCards();
            this.initializeEventListeners();
        }
    };

    // Utility Functions
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        return parts.length === 2 ? parts.pop().split(';').shift() : null;
    }

    function setCookie(name, value, days) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Strict`;
    }

    function sanitizeInput(input) {
        const div = document.createElement('div');
        div.textContent = input || '';
        return div.innerHTML;
    }

    function showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('active');
        setTimeout(() => notification.classList.remove('active'), 3000);
    }

    // Theme Management
    function applyTheme(isDark) {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        const toggle = document.getElementById('dark-mode-toggle');
        const status = document.querySelector('.toggle-status');
        if (toggle) toggle.checked = isDark;
        if (status) status.textContent = isDark ? 'Dark' : 'Light';
    }

    // Function to display badges
    async function displayBadges() {
        console.log('Client - Starting badge display process');
        const badgesContainer = document.getElementById('badges-container');
        if (!badgesContainer) {
            console.error('Client - Badges container not found in DOM');
            return;
        }

        console.log('Client - Clearing existing badges');
        badgesContainer.innerHTML = '<p class="loading">Loading badges...</p>';

        try {
            console.log('Client - Fetching badges from API');
            const response = await fetch('/api/user/badges', {
                credentials: 'include',
                headers: { 'X-CSRF-Token': state.csrfToken }
            });
            console.log('Client - API response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Client - API error:', errorData);
                badgesContainer.innerHTML = '<p class="error">Error loading badges: ' + (errorData.error || 'Unknown error') + '</p>';
                return;
            }

            const badges = await response.json();
            console.log('Client - Received badges:', badges);

            if (!Array.isArray(badges)) {
                console.error('Client - Badges response is not an array:', badges);
                badgesContainer.innerHTML = '<p class="error">Error: Badges response is invalid</p>';
                return;
            }

            if (badges.length > 0) {
                console.log('Client - Processing', badges.length, 'badges');
                badgesContainer.innerHTML = '';
                badges.forEach(badge => {
                    console.log('Client - Processing badge:', badge);
                    
                    // Determine badge color based on level
                    const badgeColors = {
                        1: 'var(--badge-bronze)',
                        2: 'var(--badge-silver)',
                        3: 'var(--badge-gold)',
                        4: 'var(--badge-platinum)',
                        5: 'var(--badge-diamond)'
                    };
                    const badgeColor = badgeColors[badge.level] || 'var(--badge-default)';
                    
                    // Get emoji based on badge type
                    const badgeEmojis = {
                        'voting': '⭐',
                        'teacher': '🎓',
                        'streak': '📅',
                        'engagement': '💬',
                        'community': '🛡️',
                        'spotlight': '✨'
                    };
                    const badgeEmoji = badgeEmojis[badge.type] || '🏆';
                    
                    const badgeElement = document.createElement('div');
                    badgeElement.className = 'badge';
                    badgeElement.style.color = badgeColor;
                    badgeElement.innerHTML = `
                        <div class="badge-icon">${badgeEmoji}</div>
                        <div class="badge-name">${sanitizeInput(badge.badge_name)}</div>
                        <div class="badge-description">${sanitizeInput(badge.description)}</div>
                        <div class="badge-date">Awarded: ${new Date(badge.created_at).toLocaleDateString()}</div>
                    `;
                    badgesContainer.appendChild(badgeElement);
                });
            } else {
                console.log('Client - No badges found');
                badgesContainer.innerHTML = '<p class="no-badges">No badges earned yet. Keep voting and contributing to earn badges!</p>';
            }
        } catch (error) {
            console.error('Client - Error fetching badges:', error);
            badgesContainer.innerHTML = '<p class="error">Error loading badges. Please try again.</p>';
        }
    }

    // API Fetch Helper
    async function fetchData(url, options = {}) {
        const defaultOptions = {
            credentials: 'include',
            headers: { 'X-CSRF-Token': state.csrfToken },
            cache: 'no-store'
        };
        const response = await fetch(url, { ...defaultOptions, ...options });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Request failed: ${response.status}`);
        }
        return response.json();
    }

    // Data Loading Functions
    async function fetchCsrfToken() {
        if (state.csrfToken) return state.csrfToken;
        const data = await fetchData('/api/csrf-token');
        state.csrfToken = data.csrfToken;
        console.log('Client - CSRF token fetched:', state.csrfToken);
        document.querySelector('meta[name="csrf-token"]').setAttribute('content', state.csrfToken);
        return state.csrfToken;
    }

    async function loadUserData() {
        console.log('Client - Attempting to load user data...');
        try {
            const data = await fetchData('/api/user');
            console.log('Client - User data received:', data);
            state.username = data.username || 'User';
            state.streak = data.streak || 0;
            const usernameEl = document.getElementById('username');
            const pointsEl = document.getElementById('points-value');
            if (!usernameEl || !pointsEl) {
                throw new Error('Required DOM elements (username or points-value) not found');
            }
            usernameEl.textContent = state.username;
            pointsEl.textContent = data.points || 0;

            // Display badges
            await displayBadges();

            return true;
        } catch (error) {
            console.error('Client - Error loading user data:', error.message);
            showNotification('Error loading user data. Please try again.', 'error');
            return false;
        }
    }

    async function loadSpotlight() {
        const widget = document.getElementById('spotlight-content');
        if (!widget) return;
        try {
            const data = await fetchData('/api/spotlight');
            console.log('Client - Spotlight data:', data);
            if (data.show && data.teacherId) {
                widget.innerHTML = `
                    <a href="/pages/teacher/teacher.html?id=${data.teacherId}" class="spotlight-link">
                        <img src="${sanitizeInput(data.image || '/public/images/spotlight-placeholder.jpg')}" alt="${sanitizeInput(data.name)}">
                        <p class="teacher-name">${sanitizeInput(data.name)}</p>
                        <p class="view-profile">Click to view profile</p>
                    </a>
                `;
                // Add event listener for the spotlight link
                const spotlightLink = widget.querySelector('.spotlight-link');
                if (spotlightLink) {
                    spotlightLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        window.location.href = `/pages/teacher/teacher.html?id=${data.teacherId}`;
                    });
                }
            } else {
                widget.innerHTML = '<p>Feature coming in later update!</p>';
            }
        } catch (error) {
            console.error('Client - Error loading spotlight:', error.message);
            widget.innerHTML = '<p>Error loading spotlight.</p>';
        }
    }

    async function loadUserVotes() {
        state.userVotes = await fetchData('/api/user/votes');
        renderVotes();
    }

    async function loadPointsHistory() {
        const data = await fetchData('/api/user/points/history');
        state.pointsHistory = data.transactions || [];
        renderPointsHistoryPreview();
    }

    // Rendering Functions
    function renderVotes() {
        const votesList = document.getElementById('votes-list');
        const votesCard = document.querySelector('.votes-card');
        if (!votesList || !votesCard) return;
        
        // Add hint text to the votes card if it doesn't exist
        let hintElement = votesCard.querySelector('.votes-hint');
        if (!hintElement) {
            hintElement = document.createElement('div');
            hintElement.className = 'votes-hint';
            votesCard.appendChild(hintElement);
        }
        
        if (!state.userVotes.length) {
            votesList.innerHTML = '<p>You haven’t cast any votes yet.</p>';
            hintElement.innerHTML = '';
            return;
        }
        
        // Sort votes by most recent first (assuming votes have a timestamp)
        const sortedVotes = [...state.userVotes].sort((a, b) => {
            // If there's no timestamp, keep original order
            if (!a.timestamp || !b.timestamp) return 0;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Update hint text based on number of votes
        if (sortedVotes.length > 2) {
            hintElement.innerHTML = `Scroll to see ${sortedVotes.length - 2} more vote${sortedVotes.length - 2 > 1 ? 's' : ''}`;
        } else {
            hintElement.innerHTML = 'Click to view and edit your votes';
        }
        
        votesList.innerHTML = sortedVotes.map(vote => {
            // Truncate comment if it's too long
            const commentText = vote.comment || 'No comment';
            const truncatedComment = commentText.length > 100 
                ? commentText.substring(0, 97) + '...' 
                : commentText;
            
            // Format the date if available
            const voteDate = vote.timestamp 
                ? new Date(vote.timestamp).toLocaleDateString() 
                : '';
            
            return `
                <div class="vote-card" data-vote-id="${vote.id}">
                    <h4>
                        <span class="teacher-name">${sanitizeInput(vote.teacher_name)}</span>
                        <span class="rating-badge">${vote.rating}★</span>
                    </h4>
                    <div class="vote-display">
                        ${commentText !== 'No comment' ? `<div class="vote-comment">${sanitizeInput(truncatedComment)}</div>` : ''}
                        ${voteDate ? `<small style="color: var(--text-secondary); align-self: flex-end;">Voted on ${voteDate}</small>` : ''}
                        <button class="edit-toggle-btn">✏️ Edit</button>
                    </div>
                </div>
            `;
        }).join('');
        
        setupVoteListeners.setupVoteCards();
    }

    function renderPointsHistoryPreview() {
        const previewList = document.getElementById('history-preview');
        const historyCard = document.querySelector('.history-card');
        if (!previewList || !historyCard) return;
        
        // Clear the preview list first
        previewList.innerHTML = '';
        
        // Add hint text to the history card if it doesn't exist
        let hintElement = historyCard.querySelector('.history-hint');
        if (!hintElement) {
            hintElement = document.createElement('div');
            hintElement.className = 'history-hint';
            hintElement.innerHTML = 'Click to view all';
            historyCard.appendChild(hintElement);
        }
        
        if (!state.pointsHistory.length) {
            previewList.innerHTML = '<p>No points history yet.</p>';
            return;
        }
        
        // Calculate how many items we can fit based on card height
        // First, render a sample item to measure its height
        if (state.pointsHistory.length > 0) {
            const sampleItem = document.createElement('div');
            sampleItem.className = 'history-item';
            sampleItem.innerHTML = `
                <span>${sanitizeInput(state.pointsHistory[0].reason)}</span>
                <span class="${state.pointsHistory[0].points >= 0 ? 'points-gain' : 'points-loss'}">${state.pointsHistory[0].points >= 0 ? '+' : ''}${state.pointsHistory[0].points}</span>
            `;
            previewList.appendChild(sampleItem);
            
            // Measure the height of a single item
            const itemHeight = sampleItem.offsetHeight;
            previewList.innerHTML = ''; // Clear again
            
            // Calculate available height and how many items can fit
            const availableHeight = previewList.clientHeight;
            const itemsToShow = Math.max(1, Math.floor(availableHeight / itemHeight));
            
            console.log('Points history preview: showing', itemsToShow, 'items out of', state.pointsHistory.length);
            
            // Render the appropriate number of items
            const limitedHistory = state.pointsHistory.slice(0, itemsToShow);
            previewList.innerHTML = limitedHistory.map(item => `
                <div class="history-item">
                    <span>${sanitizeInput(item.reason)}</span>
                    <span class="${item.points >= 0 ? 'points-gain' : 'points-loss'}">${item.points >= 0 ? '+' : ''}${item.points}</span>
                </div>
            `).join('');
        }
        
        // Add click handler to show full history modal
        previewList.onclick = showPointsHistoryModal;
    }

    function showPointsHistoryModal() {
        const modal = document.getElementById('history-modal');
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('history-modal-content');
        if (!modal || !overlay || !content) return;
        content.innerHTML = state.pointsHistory.length
            ? state.pointsHistory.map(item => `
                <div class="history-item">
                    <span>${sanitizeInput(item.reason)}</span>
                    <span class="${item.points >= 0 ? 'points-gain' : 'points-loss'}">${item.points >= 0 ? '+' : ''}${item.points}</span>
                </div>
            `).join('')
            : '<p>No points history yet.</p>';
        modal.classList.add('active');
        overlay.classList.add('active');
    }


    // Initialization
    async function initialize() {
        // --- Points Card Click Handler ---
        const pointsCard = document.getElementById('points-card');
        const pointsInfoModal = document.getElementById('points-info-modal');
        const pointsInfoContent = document.getElementById('points-info-content');
        const overlay = document.getElementById('modal-overlay');
        if (pointsCard && pointsInfoModal && pointsInfoContent && overlay) {
            pointsCard.addEventListener('click', async () => {
                const currentPoints = document.getElementById('points-value')?.textContent || '0';
                // Fetch spotlight teacher for vote link
                let spotlightUrl = '/';
                try {
                    const data = await fetchData('/api/spotlight');
                    if (data && data.teacherId) {
                        spotlightUrl = `/pages/teacher/teacher.html?id=${data.teacherId}`;
                    }
                } catch (e) { /* fallback to home */ }
                pointsInfoContent.innerHTML = `
                    <div class="points-balance">${currentPoints}</div>
                    <div class="points-balance-label">Current Points</div>
                    <div style="margin: 1.2rem 0 1rem 0; text-align: center;">
                        <strong>How to Earn Points:</strong><br>
                        <span style="display:block;margin:0.7rem 0;">
                            See all teachers: <a href="/" id="points-link-teachers">Teachers</a>
                        </span>
                        <span style="display:block;margin:0.7rem 0;">
                            Vote on the spotlight teacher: <a href="${spotlightUrl}" id="points-link-vote">Vote Now</a>
                        </span>
                        <span style="display:block;margin:0.7rem 0;">
                            Maintain a voting streak: <a href="#" id="points-link-history">See History</a>
                        </span>
                        <span style="display:block;margin:0.7rem 0;">
                            Earn badges for participation: <a href="#" id="points-link-badges">View Badges</a>
                        </span>
                    </div>
                    <div class="points-modal-note">Check the Points History for a detailed breakdown.</div>
                `;
                pointsInfoModal.classList.add('active');
                overlay.classList.add('active');
                pointsInfoModal.style.display = 'block';
                overlay.style.display = 'block';

                // Teachers link: home
                const teachersLink = document.getElementById('points-link-teachers');
                if (teachersLink) {
                    teachersLink.onclick = (e) => {
                        e.preventDefault();
                        window.location.href = '/';
                    };
                }
                // Vote link: spotlight
                const voteLink = document.getElementById('points-link-vote');
                if (voteLink) {
                    voteLink.onclick = (e) => {
                        e.preventDefault();
                        window.location.href = spotlightUrl;
                    };
                }
                // Badges link: close modal, highlight
                const badgesLink = document.getElementById('points-link-badges');
                if (badgesLink) {
                    badgesLink.onclick = (e) => {
                        e.preventDefault();
                        pointsInfoModal.classList.remove('active');
                        overlay.classList.remove('active');
                        pointsInfoModal.style.display = 'none';
                        overlay.style.display = 'none';
                        const badgesCard = document.getElementById('badges-card');
                        if (badgesCard) {
                            badgesCard.classList.add('highlight-animate');
                            setTimeout(() => badgesCard.classList.remove('highlight-animate'), 1000);
                        }
                    };
                }
                // History link: close modal, highlight
                const historyLink = document.getElementById('points-link-history');
                if (historyLink) {
                    historyLink.onclick = (e) => {
                        e.preventDefault();
                        pointsInfoModal.classList.remove('active');
                        overlay.classList.remove('active');
                        pointsInfoModal.style.display = 'none';
                        overlay.style.display = 'none';
                        const historyCard = document.getElementById('history-card');
                        if (historyCard) {
                            historyCard.classList.add('highlight-animate');
                            setTimeout(() => historyCard.classList.remove('highlight-animate'), 1000);
                        }
                    };
                }
            });
            // Close modal on close button or overlay
            pointsInfoModal.querySelector('.close-modal').onclick = () => {
                pointsInfoModal.classList.remove('active');
                overlay.classList.remove('active');
                pointsInfoModal.style.display = 'none';
                overlay.style.display = 'none';
            };
            overlay.addEventListener('click', () => {
                if (pointsInfoModal.classList.contains('active')) {
                    pointsInfoModal.classList.remove('active');
                    pointsInfoModal.style.display = 'none';
                    overlay.classList.remove('active');
                    overlay.style.display = 'none';
                }
            });
        }

        try {
            // Initialize modals
            const modals = document.querySelectorAll('.modal');
            const overlay = document.getElementById('modal-overlay');
            modals.forEach(modal => {
                modal.style.display = 'none';
                if (modal.querySelector('.close-modal')) {
                    modal.querySelector('.close-modal').addEventListener('click', () => {
                        modal.style.display = 'none';
                        modal.classList.remove('active');
                        if (overlay) {
                            overlay.style.display = 'none';
                            overlay.classList.remove('active');
                        }
                    });
                }
            });
            if (overlay) overlay.style.display = 'none';

            // Initialize theme toggle
            const darkModeToggle = document.getElementById('dark-mode-toggle');
            if (darkModeToggle) {
                darkModeToggle.addEventListener('change', (e) => {
                    const isDark = e.target.checked;
                    applyTheme(isDark);
                    document.querySelector('.toggle-status').textContent = isDark ? 'Dark' : 'Light';
                    setCookie('theme', isDark ? 'dark' : 'light', 365);
                });
            }

            applyTheme(state.isDarkMode);
            await fetchCsrfToken();
            const userDataLoaded = await loadUserData();
            if (!userDataLoaded) return;

            // Set random welcome message
            const welcomeMessageElement = document.querySelector('.welcome-card p');
            if (welcomeMessageElement) {
                welcomeMessageElement.textContent = getRandomWelcomeMessage();
            }

            if (localStorage.getItem('dashboardNeedsRefresh') === 'true') {
                console.log('Client - Refreshing dashboard due to recent vote...');
                await loadUserVotes();
                await loadPointsHistory();
                localStorage.removeItem('dashboardNeedsRefresh');
            } else {
                // Load votes and points history
                await Promise.all([
                    loadUserVotes(),
                    loadPointsHistory(),
                    loadSpotlight()
                ]);
            }

            // Initialize badges
            await displayBadges();
        } catch (error) {
            console.error('Client - Initialization error:', error.message);
            showNotification('Error initializing dashboard. Please refresh.', 'error');
        }
    }

    initialize();
});