const { PERMISSIONS, ALL_PERMISSIONS } = require('../constants/permissions');

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
