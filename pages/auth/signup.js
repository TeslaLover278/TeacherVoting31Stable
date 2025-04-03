console.log('Client - Signup script loaded');

// Store CSRF token globally
let csrfToken = '';

// Fetch CSRF token once on page load
async function fetchCsrfToken() {
    try {
        const response = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch CSRF token');
        const { csrfToken: token } = await response.json();
        console.log('Client - CSRF token fetched:', token);
        return token;
    } catch (error) {
        console.error('Client - Error fetching CSRF token:', error);
        notify('Error: Could not load security token', true);
        return null;
    }
}

// Fetch with timeout utility
async function fetchWithTimeout(url, options, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
}

// Check username availability with CSRF token
async function checkUsernameAvailability(username) {
    if (!csrfToken) {
        console.error('Client - CSRF token not available yet');
        notify('Please wait, loading security token...', true);
        return false;
    }
    try {
        const response = await fetchWithTimeout('/api/check-username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken // Include CSRF token here
            },
            body: JSON.stringify({ username }),
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();
        return result.available;
    } catch (error) {
        console.error('Client - Error checking username:', error);
        return false;
    }
}

// Notification function
function notify(message, isError) {
    console.log('Client - Notification:', message, 'isError:', isError);
    alert(message); // Replace with a custom notification UI if desired
}

// Handle signup form submission
async function signup(event) {
    event.preventDefault();
    console.log('Client - Signup form submitted');
    const form = event.target;
    const formData = new FormData(form);
    if (!csrfToken) {
        notify('Error: Security token not loaded', true);
        return;
    }
    console.log('Client - Sending signup request');
    try {
        const response = await fetchWithTimeout('/api/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(Object.fromEntries(formData)),
            credentials: 'include'
        });
        const result = await response.json();
        console.log('Client - Signup response:', result);
        if (response.ok) {
            window.location.href = '/pages/auth/login.html';
        } else {
            console.log('Client - Signup error:', result.error);
            notify('Error: ' + result.error, true);
        }
    } catch (error) {
        console.error('Client - Signup fetch error:', error);
        notify('Error: Network issue during signup', true);
    }
}

// Update signup button state
function updateSignupButton() {
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const signupButton = document.getElementById('signupButton');
    const usernameFeedback = document.getElementById('usernameFeedback').textContent;
    const passwordFeedback = document.getElementById('passwordFeedback').textContent;
    signupButton.disabled = !username || !email || !password || !confirmPassword || 
                           usernameFeedback !== 'Username available' || 
                           passwordFeedback !== 'Passwords match';
}

// Debounce function to limit rapid requests
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch CSRF token on page load
    csrfToken = await fetchCsrfToken();

    const usernameInput = document.getElementById('username');
    const debouncedCheckUsername = debounce(async (username) => {
        const feedback = document.getElementById('usernameFeedback');
        if (username.length < 3) {
            feedback.textContent = 'Username must be at least 3 characters';
            feedback.className = 'feedback taken';
        } else {
            const available = await checkUsernameAvailability(username);
            feedback.textContent = available ? 'Username available' : 'Username taken';
            feedback.className = 'feedback ' + (available ? 'available' : 'taken');
        }
        updateSignupButton();
    }, 500);

    usernameInput.addEventListener('input', (e) => {
        const username = e.target.value.trim();
        if (username.length > 0) {
            debouncedCheckUsername(username);
        } else {
            document.getElementById('usernameFeedback').textContent = '';
            updateSignupButton();
        }
    });

    document.getElementById('email').addEventListener('input', (e) => {
        const email = e.target.value.trim();
        const feedback = document.getElementById('emailFeedback');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email && !emailRegex.test(email)) {
            feedback.textContent = 'Please enter a valid email';
            feedback.className = 'feedback taken';
        } else {
            feedback.textContent = '';
            feedback.className = 'feedback';
        }
        updateSignupButton();
    });

    document.getElementById('password').addEventListener('input', () => {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const feedback = document.getElementById('passwordFeedback');
        if (password && confirmPassword) {
            feedback.textContent = password === confirmPassword ? 'Passwords match' : 'Passwords do not match';
            feedback.className = 'feedback ' + (password === confirmPassword ? 'match' : 'mismatch');
        } else {
            feedback.textContent = '';
        }
        updateSignupButton();
    });

    document.getElementById('confirmPassword').addEventListener('input', () => {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const feedback = document.getElementById('passwordFeedback');
        if (password && confirmPassword) {
            feedback.textContent = password === confirmPassword ? 'Passwords match' : 'Passwords do not match';
            feedback.className = 'feedback ' + (password === confirmPassword ? 'match' : 'mismatch');
        } else {
            feedback.textContent = '';
        }
        updateSignupButton();
    });

    document.getElementById('signupForm').addEventListener('submit', signup);
});