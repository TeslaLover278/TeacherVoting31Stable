document.addEventListener('DOMContentLoaded', () => {
    // Fetch footer settings from the server
    fetch('/api/footer-settings', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch footer settings');
        }
        return response.json();
    })
    .then(data => {
        // Update email
        const emailElement = document.getElementById('footer-email');
        if (emailElement && data.email) {
            emailElement.innerHTML = `<a href="mailto:${data.email}">${data.email}</a>`;
        }

        // Update message and visibility
        const messageElement = document.getElementById('footer-message');
        if (messageElement && data.message) {
            messageElement.textContent = data.message;
            messageElement.style.display = data.showMessage ? 'block' : 'none';
        }
    })
    .catch(error => {
        console.error('Error loading footer settings:', error);
        // Optionally keep default values or show an error message
    });
});