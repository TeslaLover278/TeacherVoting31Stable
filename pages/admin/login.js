document.addEventListener('DOMContentLoaded', () => {
    checkAdminStatus();
    loadFooterSettings();

    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');

    if (loginForm) {
        fetchCsrfToken();

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const csrfToken = document.getElementById('csrf-token').value;

            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ username, password }),
                    credentials: 'include'
                });

                const data = await response.json();
                if (response.ok) {
                    loginMessage.textContent = data.message;
                    loginMessage.classList.remove('error-message');
                    loginMessage.classList.add('info-message');
                    setTimeout(() => window.location.href = '/pages/admin/dashboard.html', 1000);
                } else {
                    loginMessage.textContent = data.error || 'Login failed.';
                    loginMessage.classList.remove('info-message');
                    loginMessage.classList.add('error-message');
                }
            } catch (error) {
                console.error('Client - Login error:', error.message);
                loginMessage.textContent = 'An error occurred. Please try again.';
                loginMessage.classList.add('error-message');
            }
        });
    }
});

async function fetchCsrfToken() {
    try {
        const response = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch CSRF token');
        const data = await response.json();
        document.querySelector('meta[name="csrf-token"]').setAttribute('content', data.csrfToken);
        document.getElementById('csrf-token').value = data.csrfToken;
    } catch (error) {
        console.error('Client - Error fetching CSRF token:', error.message);
    }
}

async function checkAdminStatus() {
    if (window.location.pathname.includes('/dashboard.html')) return;
    try {
        const response = await fetch('/api/admin/verify', { credentials: 'include' });
        if (response.ok) {
            window.location.href = '/pages/admin/dashboard.html';
        } else {
            document.getElementById('admin-status').textContent = 'Not logged in';
            document.getElementById('admin-status').classList.add('error-message');
            document.getElementById('admin-status').style.display = 'inline';
        }
    } catch (error) {
        console.error('Client - Error verifying admin status:', error.message);
    }
}

async function loadFooterSettings() {
    try {
        const response = await fetch('/api/footer-settings', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch footer settings');
        const data = await response.json();
        const footerEmail = document.querySelector('.footer-email');
        const footerMessage = document.querySelector('.footer-message');
        if (footerEmail) {
            footerEmail.innerHTML = `Email: <a href="mailto:${data.email}">${data.email}</a>`;
        }
        if (footerMessage) {
            footerMessage.textContent = data.showMessage ? data.message : '';
            footerMessage.style.display = data.showMessage ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Client - Error loading footer settings:', error.message);
    }
}