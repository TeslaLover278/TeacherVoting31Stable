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
document.addEventListener('DOMContentLoaded', () => {
    const submitForm = document.getElementById('teacher-submit-form');
    const submitMessage = document.getElementById('submit-message');
    const notification = document.getElementById('notification');

    if (!submitForm || !submitMessage || !notification) {
        console.error('Client - Required elements for submit teacher page not found');
        return;
    }

    function showNotification(messageText, isError = false) {
        notification.textContent = messageText;
        notification.style.display = 'block';
        notification.style.backgroundColor = isError ? '#FF0000' : '#00B7D1';
        setTimeout(() => notification.style.display = 'none', 3000);
    }

    submitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(submitForm);
        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = formData.get(`schedule[${i}][subject]`);
            const grade = formData.get(`schedule[${i}][grade]`);
            if (subject || grade) {
                schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
            }
        }
        const teacherData = {
            name: formData.get('name'),
            bio: formData.get('bio'),
            description: formData.get('description'),
            classes: formData.get('classes').split(',').map(c => c.trim()),
            tags: formData.get('tags').split(',').map(t => t.trim()),
            room_number: formData.get('room_number'),
            email: formData.get('email'),
            schedule: schedule,
            image_link: formData.get('image_link') || ''
        };

        try {
            const response = await fetch('/api/teacher-proposals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teacherData)
            });
            const data = await response.json();
            if (response.ok) {
                submitMessage.textContent = 'Teacher proposal submitted successfully! Awaiting admin approval.';
                submitMessage.className = 'info-message';
                showNotification('Proposal submitted!');
                submitForm.reset();
            } else {
                throw new Error(data.error || 'Failed to submit proposal');
            }
        } catch (error) {
            console.error('Client - Error submitting teacher proposal:', error.message);
            submitMessage.textContent = 'Error submitting proposal.';
            submitMessage.className = 'error-message';
            showNotification('Error submitting proposal.', true);
        }
    });
});