const express = require('express');
const router = express.Router();
const { getInstitutionResearchLandscape } = require('../services/institutionAnalyticsService');
const { analyticsLimiter } = require('../middleware/rateLimit');

router.get('/institutions/:id', analyticsLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { fromYear, toYear, forceRefresh } = req.query;

    const result = await getInstitutionResearchLandscape({
      institutionId: id,
      fromYear,
      toYear,
      forceRefresh: forceRefresh === 'true',
    });

    if (result.error) {
      return res.status(result.statusCode || 500).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('Analytics route error:', err);
    return res.status(500).json({
      message: 'Failed to retrieve institution research landscape analytics.',
      code: 'ANALYTICS_ERROR',
    });
  }
});

module.exports = router;
