const express = require('express');
const router = express.Router();
const { suggestInstitutions } = require('../services/institutionService');
const { getInstitutionResearchLandscape } = require('../services/institutionAnalyticsService');
const { analyticsLimiter } = require('../middleware/rateLimit');

router.get('/suggest', async (req, res) => {
  try {
    const { q, query, academic_only, limit } = req.query;
    const searchTerm = (q || query || '').trim();
    const isAcademicOnly = academic_only === undefined || academic_only === 'true' || academic_only === true;
    const limitNum = Math.min(25, Math.max(1, parseInt(limit) || 10));

    const results = await suggestInstitutions({
      query: searchTerm,
      academicOnly: isAcademicOnly,
      limit: limitNum,
    });

    return res.json(results);
  } catch (err) {
    console.error('Institution suggest route error:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve institution suggestions' });
  }
});

router.get('/:id/analytics', analyticsLimiter, async (req, res) => {
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
    console.error('Institution analytics route error:', err);
    return res.status(500).json({
      message: 'Failed to retrieve institution research landscape analytics.',
      code: 'ANALYTICS_ERROR',
    });
  }
});

module.exports = router;
