const { PERMISSIONS, ALL_PERMISSIONS } = require('../constants/permissions');

/**
 * Returns computed capabilities and permissions for a user object.
 */
function getCapabilities(user) {
  if (!user) {
    return {
      role: 'guest',
      isStaff: false,
      permissions: [],
      canManageEditors: false,
      canGrantMembership: false,
      canDeleteUsers: false,
      canDeleteTheses: false,
    };
  }

  if (user.role === 'admin') {
    return {
      role: 'admin',
      isStaff: true,
      permissions: [...ALL_PERMISSIONS],
      canManageEditors: true,
      canGrantMembership: true,
      canDeleteUsers: true,
      canDeleteTheses: true,
    };
  }

  if (user.role === 'editor') {
    const editorPerms = Array.isArray(user.permissions)
      ? user.permissions.filter((p) => ALL_PERMISSIONS.includes(p))
      : [];
    return {
      role: 'editor',
      isStaff: true,
      permissions: editorPerms,
      canManageEditors: false,
      canGrantMembership: false,
      canDeleteUsers: false,
      canDeleteTheses: false,
    };
  }

  return {
    role: 'student',
    isStaff: false,
    permissions: [],
    canManageEditors: false,
    canGrantMembership: false,
    canDeleteUsers: false,
    canDeleteTheses: false,
  };
}

/**
 * Middleware: Requires a specific granular capability.
 * - Admin implicitly has every permission.
 * - Editors must possess the exact permission string in user.permissions.
 * - Students have none.
 * - Banned users are denied immediately.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (req.user.status === 'banned') {
      return res.status(403).json({
        message: 'Account Suspended: Your access has been revoked by administration.',
        status: 'banned',
        banReason: req.user.banReason || 'Administrative suspension',
      });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    if (req.user.role === 'editor') {
      const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      if (perms.includes(permission)) {
        return next();
      }
      return res.status(403).json({
        message: `Access denied: Missing required permission '${permission}'.`,
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredPermission: permission,
      });
    }

    return res.status(403).json({
      message: 'Access denied: Staff privileges required.',
      code: 'FORBIDDEN_ROLE',
    });
  };
}

/**
 * Middleware: Strictly requires Admin role (Owner-only operations).
 * Editors receive 403.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (req.user.status === 'banned') {
    return res.status(403).json({
      message: 'Account Suspended: Your access has been revoked by administration.',
      status: 'banned',
    });
  }

  if (req.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({
    message: 'Access denied: Administrator privileges required.',
    code: 'ADMIN_REQUIRED',
  });
}

/**
 * Middleware: Requires staff status (admin or editor).
 * Students receive 403.
 */
function requireStaff(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (req.user.status === 'banned') {
    return res.status(403).json({
      message: 'Account Suspended: Your access has been revoked by administration.',
      status: 'banned',
    });
  }

  if (req.user.role === 'admin' || req.user.role === 'editor') {
    return next();
  }

  return res.status(403).json({
    message: 'Access denied: Staff privileges required.',
    code: 'FORBIDDEN_ROLE',
  });
}

module.exports = {
  requirePermission,
  requireAdmin,
  requireStaff,
  getCapabilities,
  PERMISSIONS,
  ALL_PERMISSIONS,
};
