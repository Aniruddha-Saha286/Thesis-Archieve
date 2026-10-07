const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');
const { batchExportCitations } = require('../services/citationGenerator');
const { checkAlertsForUser } = require('../services/topicAlertService');
const { enforceQuota } = require('../middleware/entitlements');
const { getEffectiveEntitlements } = require('../services/entitlementService');

router.use(authenticateToken);

router.get('/saved-papers', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('savedPapers');
    return res.json(user ? user.savedPapers : []);
  } catch (err) {
    console.error('[routes/user.js] Failed to retrieve saved papers:', err);
    return res.status(500).json({ message: 'Failed to retrieve saved papers.' });
  }
});

router.post('/saved-papers', async (req, res) => {
  try {
    const {
      paperId,
      title,
      doi,
      authors,
      year,
      pdfUrl,
      notes,
      readingStatus,
      structuredNotes,
      publicationType,
      degreeType,
      venue,
      publisher,
    } = req.body;
    if (!paperId || !title) {
      return res.status(400).json({ message: 'Paper ID and title are required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const existingIdx = user.savedPapers.findIndex((p) => p.paperId === paperId);
    if (existingIdx >= 0) {
      if (notes !== undefined) user.savedPapers[existingIdx].notes = notes;
      if (readingStatus !== undefined) user.savedPapers[existingIdx].readingStatus = readingStatus;
      if (structuredNotes && typeof structuredNotes === 'object') {
        user.savedPapers[existingIdx].structuredNotes = {
          ...user.savedPapers[existingIdx].structuredNotes,
          ...structuredNotes,
        };
      }
    } else {
      const entitlements = await getEffectiveEntitlements(user._id);
      if (user.savedPapers.length >= entitlements.quotas.maxSavedPapers) {
        return res.status(403).json({
          message: `You have reached the limit of ${entitlements.quotas.maxSavedPapers} saved papers on your ${entitlements.label}. Upgrade to Premium for up to 1,000 saved papers.`,
          code: 'QUOTA_EXCEEDED',
          limit: entitlements.quotas.maxSavedPapers,
        });
      }

      user.savedPapers.unshift({
        paperId,
        title,
        doi: doi || '',
        authors: authors || '',
        year: year ? parseInt(year) : null,
        pdfUrl: pdfUrl || '',
        publicationType: publicationType || 'unknown',
        degreeType: degreeType || '',
        venue: venue || '',
        publisher: publisher || '',
        notes: notes || '',
        readingStatus: readingStatus || 'To read',
        structuredNotes: structuredNotes || {},
        savedAt: new Date(),
      });
    }

    await user.save();
    return res.json({ message: 'Paper saved to your personal library.', savedPapers: user.savedPapers });
  } catch (err) {
    console.error('[routes/user.js] Failed to save paper:', err);
    return res.status(500).json({ message: 'Failed to save paper.' });
  }
});

router.delete('/saved-papers/:paperId', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.savedPapers = user.savedPapers.filter((p) => p.paperId !== req.params.paperId);
    await user.save();

    return res.json({ message: 'Paper removed from your library.', savedPapers: user.savedPapers });
  } catch (err) {
    console.error('[routes/user.js] Failed to remove saved paper:', err);
    return res.status(500).json({ message: 'Failed to remove saved paper.' });
  }
});

router.patch('/saved-papers/:paperId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const item = user.savedPapers.find((p) => p.paperId === req.params.paperId);
    if (!item) return res.status(404).json({ message: 'Saved paper not found.' });

    item.notes = notes || '';
    await user.save();

    return res.json({ message: 'Personal research notes updated.', savedPaper: item });
  } catch (err) {
    console.error('[routes/user.js] Failed to update notes:', err);
    return res.status(500).json({ message: 'Failed to update notes.' });
  }
});

router.patch('/saved-papers/:paperId/reading-status', async (req, res) => {
  try {
    const { readingStatus } = req.body;
    const allowed = ['To read', 'Reading', 'Reviewed', 'To cite'];
    if (!allowed.includes(readingStatus)) {
      return res.status(400).json({ message: `Invalid reading status. Allowed values: ${allowed.join(', ')}` });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const item = user.savedPapers.find((p) => p.paperId === req.params.paperId);
    if (!item) return res.status(404).json({ message: 'Saved paper not found.' });

    item.readingStatus = readingStatus;
    await user.save();

    return res.json({ message: 'Reading status updated.', savedPaper: item });
  } catch (err) {
    console.error('[routes/user.js] Failed to update reading status:', err);
    return res.status(500).json({ message: 'Failed to update reading status.' });
  }
});

router.patch('/saved-papers/:paperId/structured-notes', async (req, res) => {
  try {
    const { researchQuestion, method, dataset, findings, limitations, relevanceToMyThesis } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const item = user.savedPapers.find((p) => p.paperId === req.params.paperId);
    if (!item) return res.status(404).json({ message: 'Saved paper not found.' });

    if (!item.structuredNotes) item.structuredNotes = {};
    if (researchQuestion !== undefined) item.structuredNotes.researchQuestion = researchQuestion;
    if (method !== undefined) item.structuredNotes.method = method;
    if (dataset !== undefined) item.structuredNotes.dataset = dataset;
    if (findings !== undefined) item.structuredNotes.findings = findings;
    if (limitations !== undefined) item.structuredNotes.limitations = limitations;
    if (relevanceToMyThesis !== undefined) item.structuredNotes.relevanceToMyThesis = relevanceToMyThesis;

    await user.save();

    return res.json({ message: 'Structured research notes updated.', savedPaper: item });
  } catch (err) {
    console.error('[routes/user.js] Failed to update structured notes:', err);
    return res.status(500).json({ message: 'Failed to update structured notes.' });
  }
});

router.get('/collections', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('collections');
    return res.json(user ? user.collections : []);
  } catch (err) {
    console.error('[routes/user.js] Failed to retrieve collections:', err);
    return res.status(500).json({ message: 'Failed to retrieve collections.' });
  }
});

router.post('/collections/templates/thesis-chapters', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const entitlements = await getEffectiveEntitlements(user._id);
    const maxAllowed = entitlements.quotas.maxCollections;

    const templates = [
      { name: 'Chapter 1: Introduction & Background', description: 'Problem statement, research objectives, and thesis scope.' },
      { name: 'Chapter 2: Literature Review & Related Work', description: 'Comprehensive survey of existing scholarly works, baselines, and theoretical foundation.' },
      { name: 'Chapter 3: Methodology & Proposed System', description: 'Proposed algorithms, theoretical models, frameworks, and system design.' },
      { name: 'Chapter 4: Experimental Evaluation & Results', description: 'Datasets, comparative evaluation, ablation studies, and empirical results.' },
      { name: 'Chapter 5: Discussion, Conclusion & Future Work', description: 'Critical insights, limitations, thesis summary, and future research directions.' },
    ];

    const currentCount = user.collections.length;
    const availableSlots = Math.max(0, maxAllowed - currentCount);

    if (availableSlots <= 0) {
      return res.status(403).json({
        message: `Your current plan (${entitlements.label}) allows up to ${maxAllowed} collection(s). You have already reached this limit. Upgrade to Premium for up to 50 collections.`,
        code: 'QUOTA_EXCEEDED',
        limit: maxAllowed,
        currentCount,
      });
    }

    const toAdd = templates.slice(0, availableSlots);
    for (const t of toAdd) {
      user.collections.push({
        name: t.name,
        description: t.description,
        paperIds: [],
        createdAt: new Date(),
      });
    }

    await user.save();

    return res.status(201).json({
      message: `Created ${toAdd.length} thesis chapter collection(s).`,
      collections: user.collections,
      addedCount: toAdd.length,
      requestedCount: templates.length,
    });
  } catch (err) {
    console.error('[routes/user.js] Failed to create thesis chapter template collections:', err);
    return res.status(500).json({ message: 'Failed to create thesis chapter template collections.' });
  }
});

router.post('/collections', enforceQuota('collections'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Collection name is required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const newColl = {
      name: name.trim(),
      description: description || '',
      paperIds: [],
      createdAt: new Date(),
    };

    user.collections.push(newColl);
    await user.save();

    return res.status(201).json({ message: 'Project collection created.', collection: user.collections[user.collections.length - 1] });
  } catch (err) {
    console.error('[routes/user.js] Failed to create collection:', err);
    return res.status(500).json({ message: 'Failed to create collection.' });
  }
});

router.post('/collections/:id/papers', async (req, res) => {
  try {
    const { paperId } = req.body;
    if (!paperId) return res.status(400).json({ message: 'Paper ID is required.' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const coll = user.collections.id(req.params.id);
    if (!coll) return res.status(404).json({ message: 'Collection not found.' });

    if (!coll.paperIds.includes(paperId)) {
      coll.paperIds.push(paperId);
      await user.save();
    }

    return res.json({ message: 'Paper added to collection.', collection: coll });
  } catch (err) {
    console.error('[routes/user.js] Failed to add paper to collection:', err);
    return res.status(500).json({ message: 'Failed to add paper to collection.' });
  }
});

router.delete('/collections/:id/papers/:paperId', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const coll = user.collections.id(req.params.id);
    if (!coll) return res.status(404).json({ message: 'Collection not found.' });

    const target = String(req.params.paperId);
    const before = coll.paperIds.length;
    coll.paperIds = coll.paperIds.filter((id) => String(id) !== target);
    if (coll.paperIds.length !== before) {
      await user.save();
    }

    return res.json({ message: 'Paper removed from collection.', collection: coll });
  } catch (err) {
    console.error('[User] Remove paper from collection error:', err);
    return res.status(500).json({ message: 'Failed to remove paper from collection.' });
  }
});

router.delete('/collections/:id', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const coll = user.collections.id(req.params.id);
    if (!coll) return res.status(404).json({ message: 'Collection not found.' });

    const targetId = String(coll._id);
    user.collections = user.collections.filter((item) => String(item._id) !== targetId);
    await user.save();

    return res.json({ message: 'Collection deleted.', collections: user.collections });
  } catch (err) {
    console.error('[User] Delete collection error:', err);
    return res.status(500).json({ message: 'Failed to delete collection.' });
  }
});

router.get('/collections/:id/export', enforceQuota('bulkExport'), async (req, res) => {
  try {
    const { format = 'bibtex' } = req.query;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const coll = user.collections.id(req.params.id);
    if (!coll) return res.status(404).json({ message: 'Collection not found.' });

    const savedMap = new Map(user.savedPapers.map((p) => [p.paperId, p]));
    const validRecords = [];
    const omissions = [];

    for (const id of coll.paperIds) {
      const p = savedMap.get(id);
      if (p && p.title) {
        validRecords.push({
          title: p.title,
          doi: p.doi,
          authors: p.authors ? p.authors.split(',').map((n) => ({ name: n.trim() })) : [],
          publishedYear: p.year,
          pdfUrl: p.pdfUrl,
          publicationType: p.publicationType || 'unknown',
          degreeType: p.degreeType || '',
          venue: p.venue || '',
          publisher: p.publisher || '',
        });
      } else {
        omissions.push(id);
      }
    }

    const output = batchExportCitations(validRecords, format, { omissions });
    const filename = `${coll.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${format === 'ris' ? 'ris' : 'bib'}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', format === 'ris' ? 'application/x-research-info-systems' : 'application/x-bibtex');
    return res.send(output);
  } catch (err) {
    console.error('[routes/user.js] Failed to export collection:', err);
    return res.status(500).json({ message: 'Failed to export collection.' });
  }
});

router.get('/comparisons', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('comparisons');
    return res.json(user ? user.comparisons : []);
  } catch (err) {
    console.error('[routes/user.js] Failed to retrieve paper comparisons:', err);
    return res.status(500).json({ message: 'Failed to retrieve paper comparisons.' });
  }
});

router.post('/comparisons', enforceQuota('comparisons'), async (req, res) => {
  try {
    const { title, paperIds, criteria } = req.body;
    if (!title) return res.status(400).json({ message: 'Comparison title is required.' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.comparisons.push({
      title: title.trim(),
      paperIds: Array.isArray(paperIds) ? paperIds : [],
      criteria: criteria || {},
      updatedAt: new Date(),
    });

    await user.save();
    return res.status(201).json({ message: 'Comparison matrix saved.', comparison: user.comparisons[user.comparisons.length - 1] });
  } catch (err) {
    console.error('[routes/user.js] Failed to save comparison:', err);
    return res.status(500).json({ message: 'Failed to save comparison.' });
  }
});

router.put('/comparisons/:id', enforceQuota('comparisonsAccess'), async (req, res) => {
  try {
    const { title, paperIds, criteria } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const matrix = user.comparisons.id(req.params.id);
    if (!matrix) return res.status(404).json({ message: 'Comparison matrix not found.' });

    if (title && title.trim()) matrix.title = title.trim();
    if (Array.isArray(paperIds)) matrix.paperIds = paperIds;
    if (criteria) matrix.criteria = criteria;
    matrix.updatedAt = new Date();

    await user.save();
    return res.json({ message: 'Comparison matrix updated successfully.', comparison: matrix });
  } catch (err) {
    console.error('[routes/user.js] Failed to update comparison matrix:', err);
    return res.status(500).json({ message: 'Failed to update comparison matrix.' });
  }
});

router.delete('/comparisons/:id', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.comparisons = user.comparisons.filter((c) => String(c._id) !== req.params.id);
    await user.save();

    return res.json({ message: 'Comparison matrix deleted.', comparisons: user.comparisons });
  } catch (err) {
    console.error('[routes/user.js] Failed to delete comparison matrix:', err);
    return res.status(500).json({ message: 'Failed to delete comparison matrix.' });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('topicAlerts');
    return res.json(user ? user.topicAlerts : []);
  } catch (err) {
    console.error('[routes/user.js] Failed to retrieve alerts:', err);
    return res.status(500).json({ message: 'Failed to retrieve alerts.' });
  }
});

router.post('/alerts', enforceQuota('topicAlerts'), async (req, res) => {
  try {
    const { topic, category } = req.body;
    if (!topic || !topic.trim()) return res.status(400).json({ message: 'Topic is required.' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.topicAlerts.push({
      topic: topic.trim(),
      category: category || 'All Disciplines',
      active: true,
      createdAt: new Date(),
    });

    await user.save();
    return res.status(201).json({ message: 'New-paper topic alert created.', alerts: user.topicAlerts });
  } catch (err) {
    console.error('[routes/user.js] Failed to create alert:', err);
    return res.status(500).json({ message: 'Failed to create alert.' });
  }
});

router.delete('/alerts/:id', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.topicAlerts = user.topicAlerts.filter((a) => String(a._id) !== req.params.id);
    await user.save();
    return res.json({ message: 'Alert deleted.', alerts: user.topicAlerts });
  } catch (err) {
    console.error('[routes/user.js] Failed to delete alert:', err);
    return res.status(500).json({ message: 'Failed to delete alert.' });
  }
});

router.post('/alerts/check', async (req, res) => {
  try {
    const result = await checkAlertsForUser(req.user._id);
    return res.json({ message: 'Topic alerts evaluated.', ...result });
  } catch (err) {
    console.error('[routes/user.js] Failed to evaluate topic alerts:', err);
    return res.status(500).json({ message: 'Failed to evaluate topic alerts.' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    return res.json(notifications);
  } catch (err) {
    console.error('[routes/user.js] Failed to retrieve notifications:', err);
    return res.status(500).json({ message: 'Failed to retrieve notifications.' });
  }
});

router.put('/notifications/read-all', async (req, res) => {
  try {
    const result = await Notification.updateMany({ user: req.user._id, read: { $ne: true } }, { read: true });
    return res.json({ message: 'All notifications marked as read.', updated: result.modifiedCount || 0 });
  } catch (err) {
    console.error('[routes/user.js] Failed to mark notifications as read:', err);
    return res.status(500).json({ message: 'Failed to update notifications.' });
  }
});

router.put('/notifications/:id/read', async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: 'Notification not found.' });
    return res.json({ message: 'Notification marked as read.', notification: notif });
  } catch (err) {
    console.error('[routes/user.js] Failed to update notification:', err);
    return res.status(500).json({ message: 'Failed to update notification.' });
  }
});

module.exports = router;
