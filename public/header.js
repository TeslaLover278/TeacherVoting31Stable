let headerInitialized = false;
let cachedCsrfToken = null;

function initializeHeader() {
    if (headerInitialized) {
        console.log('Header - Already initialized, skipping');
        return;
    }
    headerInitialized = true;
    console.log('Header - Initializing');

    // Cookie handling functions
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // Theme application
    function applyTheme(isDark) {
        document.body.dataset.theme = isDark ? 'dark' : 'light';
        // Assuming styles.css now handles both themes with [data-theme="dark"]
        // If using separate styles-dark.css, uncomment and adjust:
        // document.getElementById('theme-stylesheet').href = isDark ? '/public/styles-dark.css' : '/public/styles.css';
        const toggle = document.getElementById('dark-mode-toggle');
        const status = toggle?.nextElementSibling.nextElementSibling;
        if (toggle) toggle.checked = isDark;
        if (status) status.textContent = isDark ? 'Dark' : 'Light';
    }

    // Apply theme on load
    const themeCookie = getCookie('theme');
    applyTheme(themeCookie === 'dark');

    fetchCsrfToken().then(token => {
        cachedCsrfToken = token;
        console.log('Header - CSRF token received, proceeding with setup');
        updateAuthButtons();
        setupMobileMenu();
        setupLogoClick();
    }).catch(() => {
        console.warn('Header - Initial CSRF token fetch failed, proceeding without token');
        updateAuthButtons();
        setupMobileMenu();
        setupLogoClick();
    });
}

async function fetchCsrfToken() {
    try {
        const response = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!response.ok) throw new Error(`Failed to fetch CSRF token: ${response.status}`);
        const data = await response.json();
        console.log('Header - CSRF token fetched:', data.csrfToken);
        return data.csrfToken;
    } catch (error) {
        console.error('Header - Error fetching CSRF token:', error.message);
        return null;
    }
}

async function updateAuthButtons() {
    const desktopAuthBtn = document.getElementById('desktop-auth-btn');
    const mobileAuthBtn = document.getElementById('mobile-auth-btn');

    if (!desktopAuthBtn || !mobileAuthBtn) {
        console.warn('Header - One or more auth buttons not found');
        return;
    }

    const cleanupButtons = (parent, id) => {
        const existing = document.getElementById(id);
        if (existing) existing.remove();
    };
    cleanupButtons(desktopAuthBtn.parentElement, 'desktop-submit-teacher-btn');
    cleanupButtons(desktopAuthBtn.parentElement, 'desktop-admin-btn');
    cleanupButtons(desktopAuthBtn.parentElement, 'desktop-logout-btn');
    cleanupButtons(mobileAuthBtn.parentElement, 'mobile-submit-teacher-btn');
    cleanupButtons(mobileAuthBtn.parentElement, 'mobile-admin-btn');
    cleanupButtons(mobileAuthBtn.parentElement, 'mobile-logout-btn');

    const adminResponse = await fetch('/api/admin/verify', { 
        credentials: 'include',
        cache: 'no-store',
    });
    if (adminResponse.ok) {
        console.log('Header - Admin authenticated');
        desktopAuthBtn.textContent = 'Admin Dashboard';
        desktopAuthBtn.href = '/pages/admin/admin-dashboard.html';
        desktopAuthBtn.addEventListener('click', () => window.location.href = '/pages/admin/admin-dashboard.html');
        mobileAuthBtn.textContent = 'Admin Dashboard';
        mobileAuthBtn.href = '/pages/admin/admin-dashboard.html';
        mobileAuthBtn.addEventListener('click', () => window.location.href = '/pages/admin/admin-dashboard.html');

        addSubmitTeacherButtons(desktopAuthBtn, mobileAuthBtn);
        addLogoutButtons(desktopAuthBtn, mobileAuthBtn);
        return;
    }

    const userResponse = await fetch('/api/user', { 
        credentials: 'include',
        cache: 'no-store',
    });
    if (userResponse.ok) {
        const data = await userResponse.json();
        console.log('Header - User authenticated:', data.username);
        desktopAuthBtn.textContent = 'Dashboard';
        desktopAuthBtn.href = '/pages/user/user-dashboard.html';
        desktopAuthBtn.addEventListener('click', () => window.location.href = '/pages/user/user-dashboard.html');
        mobileAuthBtn.textContent = 'Dashboard';
        mobileAuthBtn.href = '/pages/user/user-dashboard.html';
        mobileAuthBtn.addEventListener('click', () => window.location.href = '/pages/user/user-dashboard.html');

        addSubmitTeacherButtons(desktopAuthBtn, mobileAuthBtn);
        addLogoutButtons(desktopAuthBtn, mobileAuthBtn);
    } else {
        console.log('Header - No user logged in');
        desktopAuthBtn.textContent = 'Login';
        desktopAuthBtn.href = '/pages/auth/login.html';
        desktopAuthBtn.addEventListener('click', () => window.location.href = '/pages/auth/login.html');
        mobileAuthBtn.textContent = 'Login';
        mobileAuthBtn.href = '/pages/auth/login.html';
        mobileAuthBtn.addEventListener('click', () => window.location.href = '/pages/auth/login.html');

        const desktopSignupBtn = document.createElement('button');
        desktopSignupBtn.id = 'desktop-signup-btn';
        desktopSignupBtn.className = 'signup-btn';
        desktopSignupBtn.textContent = 'Sign Up';
        desktopSignupBtn.addEventListener('click', () => window.location.href = '/pages/auth/signup.html');

        const mobileSignupBtn = document.createElement('button');
        mobileSignupBtn.id = 'mobile-signup-btn';
        mobileSignupBtn.className = 'signup-btn';
        mobileSignupBtn.textContent = 'Sign Up';
        mobileSignupBtn.addEventListener('click', () => window.location.href = '/pages/auth/signup.html');

        desktopAuthBtn.insertAdjacentElement('afterend', desktopSignupBtn);
        mobileAuthBtn.insertAdjacentElement('afterend', mobileSignupBtn);
    }
}

function addSubmitTeacherButtons(desktopAuthBtn, mobileAuthBtn) {
    const desktopSubmitTeacherBtn = document.createElement('button');
    desktopSubmitTeacherBtn.id = 'desktop-submit-teacher-btn';
    desktopSubmitTeacherBtn.className = 'submit-teacher-btn';
    desktopSubmitTeacherBtn.textContent = 'Submit Teacher';
    desktopSubmitTeacherBtn.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');

    const mobileSubmitTeacherBtn = document.createElement('button');
    mobileSubmitTeacherBtn.id = 'mobile-submit-teacher-btn';
    mobileSubmitTeacherBtn.className = 'submit-teacher-btn';
    mobileSubmitTeacherBtn.textContent = 'Submit Teacher';
    mobileSubmitTeacherBtn.addEventListener('click', () => window.location.href = '/pages/teacher/submit-teacher.html');

    desktopAuthBtn.insertAdjacentElement('afterend', desktopSubmitTeacherBtn);
    mobileAuthBtn.insertAdjacentElement('afterend', mobileSubmitTeacherBtn);
}

function addLogoutButtons(desktopAuthBtn, mobileAuthBtn) {
    const desktopLogoutBtn = document.createElement('button');
    desktopLogoutBtn.id = 'desktop-logout-btn';
    desktopLogoutBtn.className = 'logout-btn';
    desktopLogoutBtn.textContent = 'Logout';

    const mobileLogoutBtn = document.createElement('button');
    mobileLogoutBtn.id = 'mobile-logout-btn';
    mobileLogoutBtn.className = 'logout-btn';
    mobileLogoutBtn.textContent = 'Logout';

    desktopAuthBtn.insertAdjacentElement('afterend', desktopLogoutBtn);
    mobileAuthBtn.insertAdjacentElement('afterend', mobileLogoutBtn);

    const logoutHandler = async (event) => {
        event.preventDefault();
        console.log('Header - Logging out...');

        let csrfToken = cachedCsrfToken;
        if (!csrfToken) {
            console.warn('Header - No cached CSRF token, attempting to fetch');
            csrfToken = await fetchCsrfToken();
        }

        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken || '',
                },
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error(`Logout failed: ${response.status}`);
            }

            console.log('Header - Logout successful');
            updateAuthButtons();
            window.location.href = '/';
        } catch (err) {
            console.error('Header - Logout error:', err.message);
            showNotification('Logout error, redirecting anyway', 'error');
            updateAuthButtons();
            window.location.href = '/';
        }
    };

    desktopLogoutBtn.addEventListener('click', logoutHandler);
    mobileLogoutBtn.addEventListener('click', logoutHandler);
}

function setupMobileMenu() {
    console.log('Header - Setting up mobile menu');
    const toggle = document.getElementById('mobile-menu-toggle');
    const menu = document.getElementById('dropdown-menu');

    if (!toggle) {
        console.error('Header - Mobile menu toggle not found (#mobile-menu-toggle)');
        return;
    } else {
        console.log('Header - Mobile menu toggle found:', toggle);
    }
    if (!menu) {
        console.error('Header - Dropdown menu not found (#dropdown-menu)');
        return;
    } else {
        console.log('Header - Dropdown menu found:', menu);
    }

    if (!menu.style.display) {
        menu.style.display = 'none';
        console.log('Header - Set initial menu display to "none"');
    }

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Header - Toggle clicked, current menu display:', menu.style.display);
        const newDisplay = menu.style.display === 'block' ? 'none' : 'block';
        menu.style.display = newDisplay;
        console.log('Header - Menu display toggled to:', newDisplay);
    });

    menu.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) {
            console.log('Header - Menu button clicked:', btn.textContent);
            btn.dispatchEvent(new Event('click'));
            menu.style.display = 'none';
            console.log('Header - Menu closed after button click');
        } else {
            console.log('Header - Click inside menu, but not on a button');
        }
    });

    document.addEventListener('click', (e) => {
        const isOutside = !menu.contains(e.target) && !toggle.contains(e.target);
        console.log('Header - Document click detected, is outside menu/toggle:', isOutside, 'Menu display:', menu.style.display);
        if (isOutside && menu.style.display === 'block') {
            menu.style.display = 'none';
            console.log('Header - Menu closed (clicked outside)');
        }
    });
}

function setupLogoClick() {
    const logo = document.getElementById('header-logo');
    if (logo) {
        logo.addEventListener('click', () => {
            window.location.href = '/';
        });
    } else {
        console.warn('Header - Logo element not found');
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        padding: 12px 24px; border-radius: 8px; color: var(--button-text); opacity: 1;
        transition: opacity 0.3s ease-in-out; z-index: 2000; max-width: 600px;
    `;
    notification.style.background = type === 'error' ? '#ef4444' : '#10b981';
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('Header - DOM already loaded, initializing immediately');
    initializeHeader();
} else {
    console.log('Header - Waiting for DOM to load');
    window.addEventListener('load', () => {
        console.log('Header - DOM loaded, initializing');
        initializeHeader();
    });
}