document.addEventListener('DOMContentLoaded', () => {
    function showNotification(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    fetch('/api/admin/votes', { credentials: 'include' })
        .then(response => {
            if (response.ok) window.location.href = '/pages/admin/dashboard.html';
        });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const credentials = {
            username: formData.get('username'),
            password: formData.get('password')
        };
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                showNotification('Login successful!');
                setTimeout(() => window.location.href = '/pages/admin/dashboard.html', 1000);
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (error) {
            showNotification(error.message, true);
        }
    });

    document.querySelector('.logo').addEventListener('click', () => window.location.href = '/');
    document.querySelector('.submit-teacher-btn').addEventListener('click', () => window.location.href = '/pages/submit-teacher.html');

    fetch('/api/footer-settings')
        .then(response => response.json())
        .then(data => {
            document.getElementById('footer-email').innerHTML = `Email: <a href="mailto:${data.email}">${data.email}</a>`;
            const footerMessage = document.getElementById('footer-message');
            footerMessage.textContent = data.message;
            if (data.showMessage) footerMessage.style.display = 'block';
        });
});