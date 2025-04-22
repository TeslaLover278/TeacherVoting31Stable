// CSRF token for form submissions
let csrfToken = null;

/**
 * Show a notification message to the user
 * @param {string} messageText - The message to display
 * @param {boolean} isError - Whether this is an error message
 */
function showNotification(messageText, isError = false) {
    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.textContent = messageText;
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

/**
 * Validate the room number input
 * @param {string} roomNumber - The room number to validate
 * @param {string} tags - Optional tags for validation
 * @returns {Object} Validation result with valid and message properties
 */
function validateRoomNumber(roomNumber, tags = '') {
    if (!roomNumber) {
        return { valid: false, message: 'Room number is required' };
    }

    const trimmedRoomNumber = roomNumber.trim();
    
    if (!/^[A-Za-z0-9\s-]+$/.test(trimmedRoomNumber)) {
        return { valid: false, message: 'Room number can only contain letters, numbers, spaces, and hyphens' };
    }

    if (trimmedRoomNumber.startsWith('[') || trimmedRoomNumber.includes(',')) {
        return { valid: false, message: 'Room number must be a single value (e.g., Room 101), not a list' };
    }

    return { valid: true };
}

/**
 * Fetch CSRF token from the server
 */
async function fetchCsrfToken() {
    try {
        const response = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch CSRF token');
        const data = await response.json();
        csrfToken = data.csrfToken;

        const metaToken = document.querySelector('meta[name="csrf-token"]');
        const inputToken = document.getElementById('csrf-token');
        
        if (metaToken) metaToken.content = csrfToken;
        if (inputToken) inputToken.value = csrfToken;

        console.log('Client - CSRF token fetched successfully');
    } catch (error) {
        console.error('Client - Error fetching CSRF token:', error.message);
        showNotification('Error initializing security token', true);
    }
}

/**
 * Initialize mobile menu functionality
 */
function initializeMobileMenu() {
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');

    if (mobileMenuToggle && dropdownMenu) {
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('active');
            dropdownMenu.style.display = dropdownMenu.classList.contains('active') ? 'block' : 'none';
        });
    } else {
        console.error('Mobile menu elements not found');
    }
}

/**
 * Initialize form submission handling
 */
function initializeFormSubmission() {
    const form = document.getElementById('submit-teacher-form');
    const message = document.getElementById('submit-message');

    if (!form || !message) {
        console.error('Required form elements not found');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);

        // Extract room_number and tags for validation
        const roomNumber = formData.get('room_number')?.trim();
        const tags = formData.get('tags')?.trim();

        // Validate room_number
        const roomValidation = validateRoomNumber(roomNumber, tags);
        if (!roomValidation.valid) {
            message.textContent = `Error: ${roomValidation.message}`;
            message.className = 'error-message';
            showNotification(roomValidation.message, true);
            return;
        }

        // Build schedule array
        const schedule = [];
        for (let i = 0; i < 4; i++) {
            const subject = formData.get(`schedule[${i}][subject]`)?.trim();
            const grade = formData.get(`schedule[${i}][grade]`)?.trim();
            if (subject || grade) {
                schedule.push({ block: `Block ${i + 1}`, subject: subject || '', grade: grade || 'N/A' });
            }
        }
        formData.set('schedule', JSON.stringify(schedule));
        formData.set('_csrf', csrfToken);

        try {
            const response = await fetch('/api/teacher-proposals', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                message.textContent = 'Teacher proposal submitted successfully!';
                message.className = 'info-message';
                showNotification('Teacher proposal submitted successfully!');
                form.reset();
            } else {
                throw new Error(data.error || 'Failed to submit proposal');
            }
        } catch (error) {
            console.error('Client - Error submitting teacher proposal:', error.message);
            message.textContent = 'Error submitting proposal: ' + error.message;
            message.className = 'error-message';
            showNotification('Error submitting proposal: ' + error.message, true);
        }
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    await fetchCsrfToken();
    initializeMobileMenu();
    initializeFormSubmission();
});