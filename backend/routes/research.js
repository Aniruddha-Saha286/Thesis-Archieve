const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Thesis = require('../models/Thesis');
const PaperSummary = require('../models/PaperSummary');
const { authenticateToken, requireApproved } = require('../middleware/auth');
const { readFeed, parseFeedQuery } = require('../services/discoveryFeed');
const { getEffectiveEntitlements } = require('../services/entitlementService');
const { matrixRow, publicCollection } = require('../services/literatureMatrix');
const { neighborhood } = require('../services/citationNeighborhood');
const { ResearchCache } = require('../services/researchCache');
const router = express.Router();
const metadataCache = new ResearchCache({ ttl: 60000, maxEntries: 100, maxBytes: 1024 * 1024 });

router.get('/radar', authenticateToken, requireApproved, async (req, res) => {
  try { parseFeedQuery(req.query); }
  catch (err) { return res.status(400).json({ message: err.message }); }
  try { res.set('Cache-Control', 'private, no-store').json(await readFeed(req.query)); }
  catch { res.status(503).json({ message: 'Research Radar is temporarily unavailable. Try again shortly.' }); }
});

router.get('/suggestions', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q.length < 2) return res.json({ suggestions: [] });
  try {
    const result = await metadataCache.get('suggest:' + q.toLowerCase(), async () => {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const records = await Thesis.find({ status: 'approved', title: regex }).select('title').limit(8).lean();
      return { suggestions: [...new Set(records.map(r => r.title))] };
    });
    res.json(result);
  } catch { res.status(503).json({ message: 'Suggestions are temporarily unavailable.' }); }
});

router.get('/trends', async (_req, res) => {
  try {
    const now = new Date(); const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const result = await metadataCache.get('trends:' + start.toISOString(), async () => ({
      since: start.toISOString(), basis: 'Approved papers added to this archive this month; not global research popularity.',
      topics: await Thesis.aggregate([{ $match: { status: 'approved', createdAt: { $gte: start } } },
        { $group: { _id: '$category', papers: { $sum: 1 } } }, { $sort: { papers: -1, _id: 1 } }, { $limit: 6 }]),
    }));
    res.json(result);
  } catch { res.status(503).json({ message: 'Topic activity is temporarily unavailable.' }); }
});

router.post('/neighborhood', async (req, res) => {
  const paper = req.body?.paper;
  if (!paper || typeof paper !== 'object' || Array.isArray(paper)) return res.status(400).json({ message: 'A seed paper is required.' });
  try { res.json(await neighborhood({ id: paper.id, catalogId: paper.catalogId, doi: paper.doi, ids: paper.ids })); }
  catch { res.status(503).json({ message: 'Citation sources could not be reached. Try again later.' }); }
});

router.post('/matrix', authenticateToken, async (req, res) => {
  const selections = req.body?.papers;
  if (!Array.isArray(selections) || !selections.length || selections.length > 10 || selections.some(p => !p || typeof p !== 'object' || typeof p.paperId !== 'string' || !p.paperId.trim() || p.paperId.length > 200) || new Set(selections.map(p => p.paperId)).size !== selections.length) {
    return res.status(400).json({ message: 'Select between 1 and 10 papers.' });
  }
  try {
    const user = await User.findById(req.user._id).select('savedPapers');
    const entitlement = await getEffectiveEntitlements(req.user._id);
    const canReadAnalysis = entitlement?.quotas?.canUsePaperSummarizer === true && entitlement.plan !== 'free';
    const ids = selections.map(p => p.paperId);
    const cleanDoi = value => typeof value === 'string' ? value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim().toLowerCase().slice(0, 200) : '';
    const dois = selections.map(p => cleanDoi(user?.savedPapers.find(s => s.paperId === p.paperId)?.doi || p.doi)).filter(Boolean);
    const summaries = canReadAnalysis ? await PaperSummary.find({ $or: [{ paperId: { $in: ids } }, { doi: { $in: dois } }], language: 'en' }).sort({ generatedAt: -1 }).limit(100).lean() : [];
    const rows = selections.map(selection => {
      const saved = user?.savedPapers.find(p => p.paperId === selection.paperId);
      // A comparison can contain unsaved public metadata. Personal notes only come from this user's library.
      const paper = saved || { paperId: selection.paperId, title: selection.title, authors: selection.authors, year: selection.year, doi: selection.doi, pdfUrl: selection.pdfUrl };
      const summary = summaries.find(s => s.paperId === selection.paperId || (cleanDoi(paper.doi) && cleanDoi(s.doi) === cleanDoi(paper.doi)));
      return matrixRow(paper, summary, selection.overrides && typeof selection.overrides === 'object' ? selection.overrides : {});
    });
    res.set('Cache-Control', 'no-store').json({ rows, note: 'Uses existing analyses and your notes. Missing fields are not invented. No AI call is made by exporting.' });
  } catch { res.status(500).json({ message: 'The literature matrix could not be prepared.' }); }
});

router.get('/shared/:token', async (req, res) => {
  if (!/^[a-f0-9]{48}$/.test(req.params.token)) return res.status(404).json({ message: 'This collection is unavailable.' });
  try {
    const owner = await User.findOne({ 'collections.shareToken': req.params.token, status: { $ne: 'banned' }, $or: [{ status: 'approved' }, { role: { $in: ['admin', 'editor'] } }] }).select('collections savedPapers');
    const collection = owner?.collections.find(c => c.shareToken === req.params.token);
    if (!collection) return res.status(404).json({ message: 'This collection is unavailable or sharing has been turned off.' });
    res.set('Cache-Control', 'no-store').json(publicCollection(collection, owner.savedPapers));
  } catch { res.status(500).json({ message: 'The shared collection could not be loaded.' }); }
});

router.post('/collections/:id/share', authenticateToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid collection.' });
  try {
    const user = await User.findById(req.user._id).select('collections');
    const collection = user?.collections.id(req.params.id);
    if (!collection) return res.status(404).json({ message: 'Collection not found.' });
    const token = collection.shareToken || crypto.randomBytes(24).toString('hex');
    let effectiveToken = token;
    if (!collection.shareToken) {
      const update = await User.updateOne({ _id: req.user._id, collections: { $elemMatch: { _id: req.params.id, shareToken: { $exists: false } } } }, { $set: { 'collections.$.shareToken': token } });
      if (!update.modifiedCount) {
        const refreshed = await User.findById(req.user._id).select('collections');
        effectiveToken = refreshed?.collections.id(req.params.id)?.shareToken;
        if (!effectiveToken) return res.status(409).json({ message: 'Collection changed. Please try again.' });
      }
    }
    res.set('Cache-Control', 'no-store').json({ token: effectiveToken });
  } catch { res.status(500).json({ message: 'Sharing could not be enabled.' }); }
});
router.delete('/collections/:id/share', authenticateToken, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid collection.' });
  try {
    const result = await User.updateOne({ _id: req.user._id, 'collections._id': req.params.id }, { $unset: { 'collections.$.shareToken': '' } });
    if (!result.matchedCount) return res.status(404).json({ message: 'Collection not found.' });
    res.json({ revoked: true });
  } catch { res.status(500).json({ message: 'Sharing could not be turned off.' }); }
});
module.exports = router;
