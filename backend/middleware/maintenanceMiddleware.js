const { getCachedMaintenanceStatus } = require('../services/systemSettingService');

/**
 * Site Maintenance Protection Middleware
 * Blocks normal student/research API traffic with 503 Service Unavailable when maintenance is ON.
 * Administrator requests and essential auth/health endpoints are strictly exempted.
 */
function checkMaintenance(req, res, next) {
  const status = getCachedMaintenanceStatus();
  if (!status.enabled) {
    return next();
  }

  const p = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path || '';

  // 1. Allow health check and public system status
  if (p === '/api/health' || p === '/api/system/status' || p === '/status') {
    return next();
  }

  // 2. Allow authentication endpoints so administrators can log in
  if (
    p === '/api/auth/google/config' ||
    p === '/api/auth/google' ||
    p === '/api/auth/logout' ||
    p === '/api/auth/me'
  ) {
    return next();
  }

  // 3. Admin Bypass: If user is already identified as Admin, allow unrestricted access
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  // 4. Admin Management Routes: allow request to proceed to admin authorization checks
  if (p.startsWith('/api/admin')) {
    return next();
  }

  // 5. Block all remaining student and research API requests with structured 503
  return res.status(503).json({
    code: 'MAINTENANCE_MODE',
    message:
      status.message ||
      'Sorry, maintenance is currently in progress. Please try again later.',
  });
}

module.exports = { checkMaintenance };
