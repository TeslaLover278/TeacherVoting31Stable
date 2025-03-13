document.addEventListener('DOMContentLoaded', async () => {
    let csrfToken = null;
    const submitForm = document.getElementById('teacher-submit-form');
    const submitMessage = document.getElementById('submit-message');
    const notification = document.getElementById('notification');

    if (!submitForm || !submitMessage || !notification) {
        console.error('Client - Required elements for submit teacher page not found');
        return;
    }

    // Fetch CSRF token
    async function fetchCsrfToken() {
        try {
            const response = await fetch('/api/csrf-token', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch CSRF token');
            const data = await response.json();
            csrfToken = data.csrfToken;
            document.querySelector('meta[name="csrf-token"]').content = csrfToken;
            document.getElementById('csrf-token').value = csrfToken;
            console.log('Client - CSRF token fetched:', csrfToken);
        } catch (error) {
            console.error('Client - Error fetching CSRF token:', error.message);
            showNotification('Error initializing security token', true);
        }
    }

    // Show notification
    function showNotification(messageText, isError = false) {
        notification.textContent = messageText;
        notification.style.display = 'block';
        notification.style.backgroundColor = isError ? '#FF0000' : '#00B7D1';
        setTimeout(() => notification.style.display = 'none', 3000);
    }

    // Check admin status
    async function checkAdminStatus() {
        try {
            const response = await fetch('/api/admin/verify', { credentials: 'include' });
            const adminBtn = document.querySelector('.admin-btn');
            const adminStatus = document.getElementById('admin-status');
            if (response.ok) {
                adminBtn.textContent = 'Admin Dashboard';
                adminStatus.style.display = 'none';
            } else {
                adminBtn.textContent = 'Admin Login';
                adminStatus.textContent = 'Not logged in';
                adminStatus.classList.add('error');
                adminStatus.style.display = 'inline';
            }
        } catch (error) {
            console.error('Client - Error verifying admin status:', error.message);
        }
    }

    // Form submission
    submitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(submitForm);
        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = formData.get(`schedule[${i}][subject]`)?.trim();
            const grade = formData.get(`schedule[${i}][grade]`)?.trim();
            if (subject || grade) {
                schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
            }
        }
        formData.set('schedule', JSON.stringify(schedule));
        formData.set('_csrf', csrfToken);

        try {
            const response = await fetch('/api/teacher-proposals', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to submit proposal');

            submitMessage.textContent = 'Teacher proposal submitted successfully! Awaiting admin approval.';
            submitMessage.className = 'info-message';
            showNotification('Proposal submitted!');
            submitForm.reset();
        } catch (error) {
            console.error('Client - Error submitting teacher proposal:', error.message);
            submitMessage.textContent = 'Error submitting proposal: ' + error.message;
            submitMessage.className = 'error-message';
            showNotification('Error submitting proposal.', true);
        }
    });

    // Main message handling (only if elements exist)
    const messageDiv = document.getElementById('main-message');
    if (messageDiv) {
        const messageText = document.getElementById('message-text');
        const closeButton = document.getElementById('close-message');
        if (!messageText || !closeButton) {
            console.error('Main message elements not found in DOM.');
        } else {
            function shouldShowMessage(newMessage) {
                const lastClosed = localStorage.getItem('mainMessageClosedTime');
                const lastMessage = localStorage.getItem('mainMessageContent');
                const now = Date.now();
                const fiveMinutes = 300000;
                return !lastClosed || lastMessage !== newMessage || (now - parseInt(lastClosed) >= fiveMinutes);
            }

            async function loadMainMessage() {
                try {
                    const response = await fetch('/api/message-settings', { credentials: 'include' });
                    if (!response.ok) throw new Error('Failed to fetch message settings');
                    const data = await response.json();
                    messageText.textContent = data.message;
                    if (data.showMessage && shouldShowMessage(data.message)) {
                        messageDiv.classList.add('active');
                        messageDiv.style.display = 'block';
                    } else {
                        messageDiv.classList.remove('active');
                        messageDiv.style.display = 'none';
                    }
                    localStorage.setItem('mainMessageContent', data.message);
                } catch (error) {
                    console.error('Error fetching main message:', error.message);
                    messageDiv.classList.remove('active');
                    messageDiv.style.display = 'none';
                }
            }

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

            loadMainMessage();
        }
    }

    // Initial setup
    await fetchCsrfToken();
    await checkAdminStatus();
});