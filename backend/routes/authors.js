const express = require('express');
const router = express.Router();
const { searchAuthors, getAuthorProfile, getAuthorWorks } = require('../services/authorService');

// GET /api/authors/search
// Free author search candidate lookup; never bills search credits
router.get('/search', async (req, res) => {
  try {
    const { q, query, limit } = req.query;
    const searchTerm = (q || query || '').trim();
    const limitNum = Math.min(25, Math.max(1, parseInt(limit) || 10));

    const results = await searchAuthors({
      query: searchTerm,
      limit: limitNum,
    });

    return res.json(results);
  } catch (err) {
    console.error('Author search route error:', err.message);
    return res.status(500).json({ message: 'Failed to search authors' });
  }
});

// GET /api/authors/:id
// Author profile with bibliometric metrics and publications preview; never bills search credits
router.get('/:id', async (req, res) => {
  try {
    const authorId = req.params.id;
    if (!authorId) {
      return res.status(400).json({ message: 'Author ID is required' });
    }

    const profile = await getAuthorProfile(authorId);
    if (!profile) {
      return res.status(404).json({ message: 'Author not found' });
    }

    return res.json(profile);
  } catch (err) {
    console.error('Author profile route error:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve author profile' });
  }
});

// GET /api/authors/:id/works
// Continuation of all indexed author publications; never bills search credits
router.get('/:id/works', async (req, res) => {
  try {
    const authorId = req.params.id;
    if (!authorId) {
      return res.status(400).json({ message: 'Author ID is required' });
    }
    const { page, limit, sort } = req.query;
    const worksResult = await getAuthorWorks(authorId, { page, limit, sort });
    return res.json(worksResult);
  } catch (err) {
    console.error('Author works route error:', err.message);
    return res.status(500).json({ message: 'Failed to retrieve author publications' });
  }
});

module.exports = router;
