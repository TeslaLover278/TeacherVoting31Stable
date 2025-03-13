document.addEventListener('DOMContentLoaded', () => {
    // Skip on admin pages
    const currentPath = window.location.pathname;
    const isAdminPage = currentPath.includes('/pages/admin/');
    if (isAdminPage) {
        console.log('Main message skipped on admin page.');
        return;
    }

    const messageDiv = document.getElementById('main-message');
    const messageText = document.getElementById('message-text');
    const closeButton = document.getElementById('close-message');

    if (!messageDiv || !messageText || !closeButton) {
        console.log('Main message elements not found in DOM; skipping message handling.');
        return;
    }

    // Check if message should be shown
    function shouldShowMessage(newMessage) {
        const lastClosed = localStorage.getItem('mainMessageClosedTime');
        const lastMessage = localStorage.getItem('mainMessageContent');
        const now = Date.now();
        const fiveMinutes = 300000; // 5 minutes in milliseconds
        return !lastClosed || lastMessage !== newMessage || (now - parseInt(lastClosed) >= fiveMinutes);
    }

    // Fetch and display message
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