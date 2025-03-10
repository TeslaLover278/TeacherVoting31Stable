document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');
    const notification = document.getElementById('notification');

    if (!loginForm || !loginMessage || !notification) {
        console.error('Client - Required elements for login not found');
        return;
    }

    function showNotification(messageText, isError = false) {
        notification.textContent = messageText;
        notification.style.display = 'block';
        notification.style.backgroundColor = isError ? '#FF0000' : '#00B7D1';
        setTimeout(() => notification.style.display = 'none', 3000);
    }

    // Check if already logged in
    const isAdmin = document.cookie.split('; ').find(row => row.startsWith('adminToken='))?.split('=')[1] === 'admin-token';
    if (isAdmin) {
        window.location.href = '/pages/admin/dashboard.html';
        return;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                document.cookie = 'adminToken=admin-token; Path=/; Max-Age=3600'; // 1 hour
                showNotification('Login successful!');
                setTimeout(() => window.location.href = '/pages/admin/dashboard.html', 1000);
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (error) {
            console.error('Client - Error logging in:', error.message);
            loginMessage.textContent = 'Login failed. Please check your credentials.';
            loginMessage.className = 'error-message';
            showNotification('Error logging in.', true);
        }
    });
});