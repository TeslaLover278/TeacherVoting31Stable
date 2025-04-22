document.addEventListener('DOMContentLoaded', () => {
    // Fetch footer settings from the server
    fetch('/api/footer-settings', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to fetch footer settings: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Update email
        const emailElement = document.getElementById('footer-email');
        if (emailElement && data.email) {
            emailElement.innerHTML = `<a href="mailto:${data.email}">${data.email}</a>`;
        } else {
            console.warn('Footer - Email element or data not found');
        }

        // Update message and visibility
        const messageElement = document.getElementById('footer-message');
        if (messageElement && data.message) {
            messageElement.textContent = data.message;
            messageElement.style.display = data.showMessage ? 'block' : 'none';
        } else {
            console.warn('Footer - Message element or data not found');
        }
    })
    .catch(error => {
        console.error('Footer - Error loading footer settings:', error.message);
        // Fallback to default values if desired
        const emailElement = document.getElementById('footer-email');
        if (emailElement) emailElement.innerHTML = '<a href="mailto:support@example.com">support@example.com</a>';
        const messageElement = document.getElementById('footer-message');
        if (messageElement) {
            messageElement.textContent = 'Welcome to Teacher Tally!';
            messageElement.style.display = 'block';
        }
    });
});