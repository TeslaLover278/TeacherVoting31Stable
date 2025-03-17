// message.js - Enhanced Message and Notification Manager
(() => {
    'use strict';

    // Configuration
    const CONFIG = {
        NOTIFICATION_POLL_INTERVAL: 15000, // 15 seconds
        FADE_DURATION: 500, // ms
        MESSAGE_TIMEOUT: 10000, // 10 seconds
        BASE_URL: '/api'
    };

    // State management
    const state = {
        csrfToken: null,
        messageQueue: [],
        isProcessing: false
    };

    // Utility functions
    const $ = (selector) => document.querySelector(selector);
    const createElement = (tag, attrs = {}) => {
        const el = document.createElement(tag);
        Object.assign(el, attrs);
        return el;
    };

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', async () => {
        await initCsrfToken();
        setupNotificationContainer();
        setupMessageListeners();
        loadInitialContent();
        startNotificationPolling();
    });

    // Fetch and cache CSRF token
    async function initCsrfToken() {
        try {
            const response = await fetch(`${CONFIG.BASE_URL}/csrf-token`, { credentials: 'include' });
            if (!response.ok) throw new Error('CSRF fetch failed');
            state.csrfToken = (await response.json()).csrfToken;
        } catch (error) {
            console.error('Failed to initialize CSRF token:', error.message);
        }
    }

    // Setup notification container if not present
    function setupNotificationContainer() {
        let container = $('#notification-container');
        if (!container) {
            container = createElement('div', {
                id: 'notification-container',
                style: `
                    position: fixed; top: 15px; right: 15px; z-index: 2000; 
                    width: 320px; font-family: Arial, sans-serif;
                `
            });
            document.body.appendChild(container);
        }
        return container;
    }

    // Setup event listeners for message interactions
    function setupMessageListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') dismissActiveMessage();
        });
    }

    // Load initial main message and queue it
    async function loadInitialContent() {
        try {
            const response = await fetch(`${CONFIG.BASE_URL}/message-settings`, { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch message settings');
            const { message, showMessage } = await response.json();
            if (showMessage) queueMessage({ type: 'main', message, persist: true });
        } catch (error) {
            console.error('Error loading initial message:', error.message);
        }
    }

    // Fetch and queue notifications periodically
    async function fetchNotifications() {
        try {
            const response = await fetch(`${CONFIG.BASE_URL}/notifications`, { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch notifications');
            const notifications = await response.json();
            notifications.forEach(note => queueMessage({
                type: note.type,
                message: note.message,
                id: note.id
            }));
        } catch (error) {
            console.error('Error fetching notifications:', error.message);
        }
    }

    // Start polling for notifications
    function startNotificationPolling() {
        setInterval(fetchNotifications, CONFIG.NOTIFICATION_POLL_INTERVAL);
        fetchNotifications(); // Initial fetch
    }

    // Queue a message for display
    function queueMessage({ type, message, id, persist = false }) {
        state.messageQueue.push({ type, message, id, persist });
        processMessageQueue();
    }

    // Process the message queue with animations
    async function processMessageQueue() {
        if (state.isProcessing || !state.messageQueue.length) return;
        state.isProcessing = true;

        const { type, message, id, persist } = state.messageQueue.shift();
        const container = $('#notification-container');
        const messageEl = createMessageElement(type, message, id);

        // Fade in animation
        messageEl.style.opacity = '0';
        container.appendChild(messageEl);
        requestAnimationFrame(() => {
            messageEl.style.transition = `opacity ${CONFIG.FADE_DURATION}ms ease`;
            messageEl.style.opacity = '1';
        });

        // Auto-dismiss unless persistent
        if (!persist) {
            setTimeout(() => dismissMessage(messageEl, id), CONFIG.MESSAGE_TIMEOUT);
        }

        state.isProcessing = false;
        processMessageQueue(); // Process next message
    }

    // Create a styled message element
    function createMessageElement(type, message, id) {
        const bgColor = {
            main: '#f0f4f8',
            success: '#d4edda',
            error: '#f8d7da',
            info: '#cce5ff'
        }[type] || '#f0f4f8';

        const el = createElement('div', {
            className: `message ${type}`,
            style: `
                background: ${bgColor}; padding: 12px 16px; margin-bottom: 10px; 
                border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
                display: flex; justify-content: space-between; align-items: center;
            `
        });

        el.innerHTML = `
            <span style="flex-grow: 1; color: #333;">${message}</span>
            <button style="background: none; border: none; cursor: pointer; color: #666; font-size: 16px;">×</button>
        `;

        const closeBtn = el.querySelector('button');
        closeBtn.addEventListener('click', () => dismissMessage(el, id));
        return el;
    }

    // Dismiss a message with fade-out animation
    async function dismissMessage(element, id) {
        element.style.transition = `opacity ${CONFIG.FADE_DURATION}ms ease`;
        element.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, CONFIG.FADE_DURATION));

        if (id && state.csrfToken) {
            try {
                await fetch(`${CONFIG.BASE_URL}/notifications/${id}/read`, {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': state.csrfToken },
                    credentials: 'include'
                });
            } catch (error) {
                console.error('Error marking notification as read:', error.message);
            }
        }

        element.remove();
    }

    // Dismiss the topmost persistent message
    function dismissActiveMessage() {
        const active = $('#notification-container .message.main');
        if (active) dismissMessage(active);
    }
})();