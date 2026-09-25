const express = require('express');
const router = express.Router();
const { suggestInstitutions } = require('../services/institutionService');

// GET /api/institutions/suggest
// Free discovery autocomplete; never bills search credits
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

module.exports = router;
