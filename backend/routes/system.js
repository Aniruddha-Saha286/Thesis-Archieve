const express = require('express');
const router = express.Router();
const { getMaintenanceStatus } = require('../services/systemSettingService');

/**
 * Public System Status Endpoint
 * GET /api/system/status
 * Lightweight, non-sensitive public check for application availability.
 */
router.get('/status', async (req, res) => {
  const status = await getMaintenanceStatus();
  return res.json({
    maintenance: Boolean(status.enabled),
    enabled: Boolean(status.enabled),
    message: status.enabled ? status.message : null,
  });
});

module.exports = router;
