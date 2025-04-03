document.addEventListener('DOMContentLoaded', () => {
    console.log('Client - Login script loaded, initializing...');

    const API_BASE_URL = window.location.origin;
    const MAX_RETRIES = 3;

    let csrfToken = '';
    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');

    function showMessage(text, type) {
        if (loginMessage) {
            loginMessage.textContent = text;
            loginMessage.classList.remove('info-message', 'error-message');
            loginMessage.classList.add(type === 'success' ? 'info-message' : 'error-message');
            loginMessage.style.opacity = '0';
            requestAnimationFrame(() => {
                loginMessage.style.opacity = '1';
                setTimeout(() => {
                    loginMessage.style.opacity = '0';
                    loginMessage.addEventListener('transitionend', () => loginMessage.textContent = '', { once: true });
                }, 3000);
            });
        } else {
            console.warn('Client - loginMessage element not found');
            alert(`${type.toUpperCase()}: ${text}`);
        }
    }

    async function fetchWithTimeout(url, options = {}, timeout = 5000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    }

    async function fetchCsrfToken(attempt = 1) {
        try {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/csrf-token`, { 
                credentials: 'include' 
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || 'Failed to fetch CSRF token'}`);
            }
            const data = await response.json();
            csrfToken = data.csrfToken;
            console.log('Client - CSRF token fetched:', csrfToken);
            await Promise.all([checkAdminStatus(), loadFooterSettings()]);
        } catch (error) {
            console.error(`Client - CSRF fetch attempt ${attempt} failed:`, error.message);
            if (attempt < MAX_RETRIES) {
                console.log(`Client - Retrying (${attempt + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                return fetchCsrfToken(attempt + 1);
            }
            showMessage(`Security setup failed: ${error.message}. Please refresh.`, 'error');
        }
    }

    fetchCsrfToken();

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username')?.value.trim() || '';
            const password = document.getElementById('password')?.value || '';

            if (!username || !password) {
                showMessage('Username and password are required.', 'error');
                return;
            }

            if (!csrfToken) {
                showMessage('Security token not loaded. Please wait or refresh.', 'error');
                return;
            }

            console.log('Client - Submitting login with:', { username }); // Debug log

            try {
                const response = await fetchWithTimeout(`${API_BASE_URL}/api/users/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken,
                    },
                    body: JSON.stringify({ username, password }),
                    credentials: 'include',
                });

                const data = await response.json();

                if (response.ok) {
                    console.log('Client - Login response:', data);
                    showMessage(data.message || 'Login successful!', 'success');
                    const redirectUrl = data.isAdmin ? '/pages/admin/dashboard.html' : '/pages/user/dashboard.html';
                    console.log('Client - Redirecting to:', redirectUrl);
                    setTimeout(() => window.location.href = redirectUrl, 1000);
                } else {
                    throw new Error(data.error || `HTTP ${response.status}: Login failed`);
                }
            } catch (error) {
                console.error('Client - Login error:', error.message);
                const errorMsg = error.message.includes('401') ? 'Invalid username or password.' : 
                                error.message.includes('403') ? 'Account is locked. Please contact accounts@teachertally.com.' : 
                                `Login failed: ${error.message}`;
                showMessage(errorMsg, 'error');
            }
        });
    } else {
        console.warn('Client - login-form element not found');
        showMessage('Login form not found. Check page structure.', 'error');
    }

    async function checkAdminStatus() {
        if (window.location.pathname.includes('/dashboard.html')) return;

        try {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/admin/verify`, {
                credentials: 'include',
            });

            if (response.ok) {
                console.log('Client - Admin authenticated, redirecting...');
                window.location.href = '/pages/admin/dashboard.html';
            } else {
                console.log('Client - Not an admin or not authenticated');
            }
        } catch (error) {
            console.error('Client - Error verifying admin status:', error.message);
        }
    }

    async function loadFooterSettings() {
        try {
            const response = await fetchWithTimeout(`${API_BASE_URL}/api/footer-settings`, {
                credentials: 'include',
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || 'Failed to fetch footer settings'}`);
            }
            const data = await response.json();
            const footerEmail = document.querySelector('.footer-email');
            const footerMessage = document.querySelector('.footer-message');

            if (footerEmail) {
                footerEmail.innerHTML = data.email ? `Email: <a href="mailto:${sanitizeInput(data.email)}">${sanitizeInput(data.email)}</a>` : '';
            } else {
                console.warn('Client - .footer-email element not found');
            }

            if (footerMessage) {
                footerMessage.textContent = data.showMessage ? sanitizeInput(data.message) : '';
                footerMessage.style.display = data.showMessage ? 'block' : 'none';
            } else {
                console.warn('Client - .footer-message element not found');
            }

            console.log('Client - Footer settings loaded');
        } catch (error) {
            console.error('Client - Error loading footer settings:', error.message);
        }
    }

    function sanitizeInput(input) {
        return input ? String(input).replace(/[&<>"']/g, match => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
        })[match]) : '';
    }
});