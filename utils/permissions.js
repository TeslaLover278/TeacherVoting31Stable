/**
 * Check if the current admin user has the required permission
 * @param {string} requiredPermission - The permission to check for
 * @returns {boolean} - Whether the admin has the permission
 */
export function hasPermission(requiredPermission) {
    try {
        const permissionsStr = localStorage.getItem('adminPermissions');
        if (!permissionsStr) return false;

        const permissions = JSON.parse(permissionsStr);
        return permissions.includes(requiredPermission);
    } catch (error) {
        console.error('Error checking permissions:', error);
        return false;
    }
}

/**
 * Conditionally render content based on permissions
 * @param {string} requiredPermission - The permission required to view the content
 * @param {React.ReactNode} children - The content to render if permitted
 * @returns {React.ReactNode|null} - The content or null
 */
export function PermissionGate({ requiredPermission, children }) {
    return hasPermission(requiredPermission) ? children : null;
}

/**
 * Get all permissions for the current admin user
 * @returns {string[]} - Array of permission strings
 */
export function getAdminPermissions() {
    try {
        const permissionsStr = localStorage.getItem('adminPermissions');
        return permissionsStr ? JSON.parse(permissionsStr) : [];
    } catch (error) {
        console.error('Error getting permissions:', error);
        return [];
    }
}

/**
 * Clear stored permissions (useful for logout)
 */
export function clearPermissions() {
    localStorage.removeItem('adminPermissions');
} 