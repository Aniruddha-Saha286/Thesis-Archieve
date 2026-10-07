const { getCachedMaintenanceStatus } = require('../services/systemSettingService');

function checkMaintenance(req, res, next) {
  const status = getCachedMaintenanceStatus();
  if (!status.enabled) {
    return next();
  }

  const p = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path || '';

  if (p === '/api/health' || p === '/api/system/status' || p === '/status') {
    return next();
  }

  if (
    p === '/api/auth/google/config' ||
    p === '/api/auth/google' ||
    p === '/api/auth/logout' ||
    p === '/api/auth/me'
  ) {
    return next();
  }

  if (req.user && req.user.role === 'admin') {
    return next();
  }

  if (p.startsWith('/api/admin')) {
    return next();
  }

  return res.status(503).json({
    code: 'MAINTENANCE_MODE',
    message:
      status.message ||
      'Sorry, maintenance is currently in progress. Please try again later.',
  });
}

module.exports = { checkMaintenance };
