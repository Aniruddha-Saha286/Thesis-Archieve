const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Thesis = require('../models/Thesis');
const Report = require('../models/Report');
const TrialGrant = require('../models/TrialGrant');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');
const { orchestrateScholarlySearch } = require('../services/searchOrchestrator');
const { validateAndGetSession, normalizePublicationType } = require('../services/searchSessionManager');
const { parseAndValidateThesisQuery } = require('../services/queryParser');
const { generateApaCitation, generateBibtex, generateRis } = require('../services/citationGenerator');
const { createNormalizedRecord } = require('../services/scholarlyRecord');
const { enrichPaperDatasets, searchGlobalDatasets } = require('../services/datasetDiscoveryService');
const { getEffectiveEntitlements } = require('../services/entitlementService');
const { getDhakaDateString } = require('../utils/dhakaDate');
const {
  emitThesisCreated,
  emitThesisUpdated,
  emitThesisDeleted,
  emitThesisPinned,
} = require('../socket');
const {
  reserveUsage,
  releaseReservedCredit,
  createSearchContextId,
  isAlreadyBilled,
  guestSearchStore,
} = require('../services/usageReservationService');
const { summaryGenerationLimiter } = require('../middleware/rateLimit');
const { getOrGeneratePaperSummary } = require('../services/paperSummaryService');
const {
  isValidDatasetRepositoryUrl,
  isValidCodeRepositoryUrl,
  isValidDocumentUrl,
} = require('../utils/urlValidator');

// GET /api/thesis
// Public discovery search endpoint with daily search quotas:
// GET /api/thesis
// Public discovery search endpoint with daily search quotas:
// - Free tier: 10 committed searches per Asia/Dhaka day
// - Trial v2: 20 committed searches per Asia/Dhaka day
// - Premium / Pro Max: unlimited searches
// - Guest: 10 committed searches per Asia/Dhaka day
// Bills credits ONLY on explicit committed search/filter submissions (page 1, new query session).
// Pagination (page > 1), back navigation, details, and retries on total technical failure do NOT bill credits.
router.get('/', optionalAuth, async (req, res) => {
  let reservedUserCredit = false;
  let reservedGuestCredit = false;

  try {
    const queryValidation = parseAndValidateThesisQuery(req.query);
    if (!queryValidation.valid) {
      return res.status(queryValidation.status).json({
        message: queryValidation.message,
        code: queryValidation.code,
      });
    }

    const {
      searchTerm,
      sortOrder,
      page: cleanPage,
      limit: cleanLimit,
      filters,
      sessionId: cleanSessionId,
      searchContextId: cleanContextId,
      isSearchInquiry,
    } = queryValidation;

    const scope = req.user ? String(req.user._id) : (req.ip || 'guest');
    const existingSessionValidation = await validateAndGetSession(cleanSessionId, scope, searchTerm, filters, sortOrder);
    const hasValidSession = existingSessionValidation.valid;

    const todayDhaka = getDhakaDateString(new Date());
    let entitlements = null;
    let canAccessDataset = false;
    let searchLimit = 10;

    if (req.user) {
      entitlements = await getEffectiveEntitlements(req.user._id);
      canAccessDataset = Boolean(entitlements.quotas.canAccessPaperDatasets);
      searchLimit = entitlements.quotas.dailySearchLimit;
    }

    // Context tracking for instant filter refinements
    const effectiveContextId = cleanContextId || (hasValidSession ? cleanSessionId : createSearchContextId());

    // Billable Action Rule:
    // 1. Must be an active search inquiry on page 1.
    // 2. Must not be a cached session page replay.
    // 3. Must not have already been billed under this searchContextId today (instant filter refinements within the active inquiry do NOT consume quota).
    const alreadyBilledForContext = isAlreadyBilled(scope, 'search', effectiveContextId, todayDhaka);
    const isBillableAction = Boolean(isSearchInquiry && !hasValidSession && cleanPage === 1 && !alreadyBilledForContext);

    let searchQuota = { limit: 'unlimited', used: 0, remaining: 'unlimited', plan: 'guest' };

    if (isBillableAction) {
      const reservation = await reserveUsage({
        user: req.user,
        scope,
        metric: 'search',
        idempotencyKey: effectiveContextId,
        limit: searchLimit,
        dateStr: todayDhaka,
      });

      if (!reservation.allowed) {
        const planLabel = entitlements ? entitlements.label : 'Standard Free Plan';
        return res.status(403).json({
          message: `Daily search limit reached. You have completed ${searchLimit}/${searchLimit} searches today on the ${planLabel}. Upgrade to Premium or activate your 7-day free trial for unlimited daily searches.`,
          code: 'SEARCH_QUOTA_EXCEEDED',
          limit: searchLimit,
          used: reservation.used,
          remaining: 0,
          plan: entitlements ? entitlements.plan : 'guest',
          resetsAt: 'Midnight 00:00 (Asia/Dhaka)',
        });
      }

      if (reservation.billed) {
        reservedUserCredit = Boolean(req.user);
        reservedGuestCredit = !req.user;
      }

      searchQuota = {
        limit: searchLimit === null ? 'unlimited' : searchLimit,
        used: reservation.count,
        remaining: reservation.remaining,
        plan: entitlements ? entitlements.plan : 'guest',
        resetsAt: 'Midnight 00:00 (Asia/Dhaka)',
      };
    } else {
      let currentUsed = 0;
      if (req.user) {
        if (!req.user.dailySearchUsage || req.user.dailySearchUsage.date !== todayDhaka) {
          currentUsed = 0;
        } else {
          currentUsed = req.user.dailySearchUsage.count || 0;
        }
      } else {
        const gu = guestSearchStore.get(scope);
        currentUsed = (gu && gu.date === todayDhaka) ? gu.count : 0;
      }

      searchQuota = {
        limit: searchLimit === null ? 'unlimited' : searchLimit,
        used: currentUsed,
        remaining: searchLimit !== null ? Math.max(0, searchLimit - currentUsed) : 'unlimited',
        plan: entitlements ? entitlements.plan : 'guest',
        resetsAt: 'Midnight 00:00 (Asia/Dhaka)',
      };
    }

    let searchResult;
    try {
      searchResult = await orchestrateScholarlySearch({
        query: searchTerm,
        page: cleanPage,
        limit: cleanLimit,
        filters,
        sort: sortOrder,
        sessionId: hasValidSession ? cleanSessionId : null,
        scope,
      });
    } catch (searchErr) {
      if (reservedUserCredit || reservedGuestCredit) {
        await releaseReservedCredit({
          user: req.user,
          scope,
          metric: 'search',
          idempotencyKey: effectiveContextId,
          dateStr: todayDhaka,
        });
      }
      throw searchErr;
    }

    // Auto-release reserved credit on total technical failure
    if (searchResult && searchResult.totalTechnicalFailure && (reservedUserCredit || reservedGuestCredit)) {
      await releaseReservedCredit({
        user: req.user,
        scope,
        metric: 'search',
        idempotencyKey: effectiveContextId,
        dateStr: todayDhaka,
      });
      reservedUserCredit = false;
      reservedGuestCredit = false;
      searchQuota.used = Math.max(0, searchQuota.used - 1);
      if (searchQuota.remaining !== 'unlimited') {
        searchQuota.remaining = Math.min(searchLimit, searchQuota.remaining + 1);
      }
    }

    // Enforce dataset access rule: Free tier cannot access datasets of each file
    if (Array.isArray(searchResult.records)) {
      searchResult.records = searchResult.records.map((r) => {
        const hasDataset = Boolean(r.datasetUrl);
        return {
          ...r,
          hasDataset,
          isDatasetLocked: !canAccessDataset && hasDataset,
          // Hide direct URL for free tier to prevent unauthorized bypass
          datasetUrl: canAccessDataset ? r.datasetUrl : null,
        };
      });

      // Strict PDF-only enforcement if requested
      if (filters.hasPdf) {
        searchResult.records = searchResult.records.filter((r) =>
          Boolean(r.isDirectPdf || (r.pdfUrl && (r.pdfUrl.endsWith('.pdf') || r.pdfUrl.includes('/pdf/') || r.pdfUrl.includes('pmc.ncbi.nlm.nih.gov') || r.pdfUrl.includes('/servlets/purl'))))
        );
        if (searchResult.pagination) {
          searchResult.pagination.returnedCount = searchResult.records.length;
        }
        searchResult.totalReturned = searchResult.records.length;
      }
    }

    // Attach search quota telemetry and active inquiry context ID
    searchResult.searchQuota = searchQuota;
    searchResult.searchContextId = effectiveContextId;

    return res.json(searchResult);
  } catch (err) {
    console.error('Thesis search error:', err);
    return res.status(500).json({ message: 'Scholarly discovery service encountered an error.' });
  }
});

// GET /api/thesis/publishers/list
router.get('/publishers/list', async (req, res) => {
  try {
    const publishersFromDb = await Thesis.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$publisher', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const majorPublishers = [
      { name: 'arXiv Open Access / Cornell University', count: null },
      { name: 'PubMed Central / Europe PMC Open Science', count: null },
      { name: 'HAL Open Science / CNRS European Archive', count: null },
      { name: 'DOAJ Open Access Directory', count: null },
      { name: 'Springer Nature Open', count: null },
      { name: 'Elsevier / ScienceDirect Open', count: null },
      { name: 'Oxford University Press', count: null },
      { name: 'Cambridge University Press', count: null },
      { name: 'IEEE Computer Society', count: null },
      { name: 'Wiley Open Access', count: null },
    ];

    const list = publishersFromDb
      .filter((p) => p._id && p._id.trim())
      .map((p) => ({ name: p._id, count: p.count }));

    for (const pub of majorPublishers) {
      if (!list.some((item) => item.name.toLowerCase() === pub.name.toLowerCase())) {
        list.push(pub);
      }
    }

    return res.json(list);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load publisher list.' });
  }
});

// GET /api/thesis/:id
// Retrieve individual paper details by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Thesis.findById(id).lean();
      if (!doc) {
        return res.status(404).json({ message: 'Scholarly publication not found in archive.' });
      }

      // Convert to normalized record
      const directPdf = doc.pdfUrl && doc.pdfUrl.trim() ? doc.pdfUrl.trim() : null;
      const isDirectPdf = Boolean(directPdf && (doc.isDirectPdf || directPdf.includes('/pdf') || directPdf.endsWith('.pdf')));

      const record = createNormalizedRecord({
        id: String(doc._id),
        doi: doc.doi || null,
        title: doc.title,
        author: doc.author,
        authors: doc.authors && doc.authors.length > 0 ? doc.authors : [{ name: doc.author, affiliation: doc.university || null }],
        abstract: doc.abstract,
        publicationType: doc.publicationType || 'thesis',
        isPeerReviewed: doc.publicationType === 'journal-article' || doc.publicationType === 'conference-paper',
        publishedYear: doc.publishedYear,
        venue: doc.university ? `${doc.university} • ${doc.department}` : doc.publisher,
        publisher: doc.publisher || doc.university || 'The Thesis Archive',
        isOpenAccess: doc.isOpenAccess !== false,
        license: doc.license || null,
        pdfUrl: isDirectPdf ? directPdf : null,
        isDirectPdf: isDirectPdf,
        fullTextUrl: directPdf,
        isRetracted: doc.isRetracted || false,
        datasetUrl: doc.datasetUrl || null,
        codeUrl: doc.codeUrl || null,
        catalogId: doc.catalogId,
        upvotes: doc.upvotes || 0,
        isPinned: doc.isPinned || false,
        isSample: doc.isSample || false,
        source: doc.source || 'Local Archive',
      });

      // Dataset locking for individual record
      let canAccessDataset = false;
      if (req.user) {
        const entitlements = await getEffectiveEntitlements(req.user._id);
        canAccessDataset = Boolean(entitlements.quotas.canAccessPaperDatasets);
      }
      record.hasDataset = Boolean(doc.datasetUrl);
      record.isDatasetLocked = !canAccessDataset && record.hasDataset;
      if (!canAccessDataset) {
        record.datasetUrl = null;
      }

      return res.json(record);
    }

    // For external IDs, return 404 with guidance to use client-held metadata
    return res.status(404).json({ message: 'External provider record. Details provided via search index.' });
  } catch (err) {
    return res.status(500).json({ message: 'Error retrieving record.' });
  }
});

// GET /api/thesis/:id/datasets
// Asynchronously enriches a paper with authentic Linked Datasets (explicit DOI relations)
// and Related Datasets (topic similarity discovery).
// Business Rule: Free tier cannot access datasets of each file; Premium/trial has unlimited access.
router.get('/:id/datasets', optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(403).json({
        message: 'Dataset access for publications is reserved for Premium members. Please sign in and upgrade to Premium or activate your 7-day free trial.',
        code: 'FEATURE_LOCKED',
        feature: 'datasets',
        plan: 'guest',
      });
    }

    const entitlements = await getEffectiveEntitlements(req.user._id);
    if (!entitlements.quotas.canAccessPaperDatasets) {
      return res.status(403).json({
        message: 'Direct dataset access for publications is a Premium feature. The Standard Academic plan does not include dataset access. Upgrade to Premium or activate your 7-day free trial for uninhibited dataset access.',
        code: 'FEATURE_LOCKED',
        feature: 'datasets',
        plan: entitlements.plan,
      });
    }

    // Check trial daily lookup limit if applicable (e.g. trial_v2 limit: 5)
    if (entitlements.trialId && entitlements.quotas.dailyDatasetLookupLimit !== null) {
      const limit = entitlements.quotas.dailyDatasetLookupLimit;
      const used = entitlements.usage.dailyDatasetLookupsUsed || 0;
      if (used >= limit) {
        return res.status(429).json({
          message: `You have reached your daily trial limit of ${limit} dataset lookups. Quota resets at midnight Asia/Dhaka. Upgrade to Premium for unlimited dataset discovery.`,
          code: 'DAILY_DATASET_LIMIT_REACHED',
          datasetQuota: {
            limit,
            used,
            remaining: 0,
            resetsAt: 'Midnight 00:00 (Asia/Dhaka)',
          },
        });
      }
    }

    const { id } = req.params;
    let doi = null;
    let title = '';
    let explicitDatasetUrl = null;
    let explicitDatasetFormat = null;
    let explicitDatasetSize = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Thesis.findById(id).lean();
      if (doc) {
        doi = doc.doi || null;
        title = doc.title || '';
        explicitDatasetUrl = doc.datasetUrl || null;
        explicitDatasetFormat = doc.datasetFormat || null;
        explicitDatasetSize = doc.datasetSize || null;
      } else {
        doi = req.query.doi || null;
        title = req.query.title || '';
      }
    } else {
      // External paper: allow DOI and title search, reject spoofed external author deposits
      doi = req.query.doi || null;
      title = req.query.title || '';
      explicitDatasetUrl = null;
      explicitDatasetFormat = null;
      explicitDatasetSize = null;
    }

    const enrichment = await enrichPaperDatasets({
      paperId: id,
      doi,
      title,
      explicitDatasetUrl,
      explicitDatasetFormat,
      explicitDatasetSize,
    });

    // If both DataCite & Zenodo failed and returned 0 datasets, return typed 503
    // without consuming trial quota
    if (enrichment.hasOutage && enrichment.totalCount === 0) {
      return res.status(503).json({
        message: 'Scholarly dataset discovery providers (DataCite and Zenodo) are temporarily unreachable. Please retry in a few moments.',
        code: 'DATASET_PROVIDERS_UNAVAILABLE',
        providerErrors: enrichment.providerErrors,
      });
    }

    let datasetQuota = {
      limit: null,
      unlimited: true,
      used: 0,
      remaining: null,
    };

    if (entitlements.trialId && entitlements.quotas.dailyDatasetLookupLimit !== null) {
      const todayDhaka = getDhakaDateString(new Date());
      const trial = await TrialGrant.findById(entitlements.trialId);
      let newCount = 1;
      if (trial) {
        if (trial.dailyDatasetLookups && trial.dailyDatasetLookups.date === todayDhaka) {
          trial.dailyDatasetLookups.count = (trial.dailyDatasetLookups.count || 0) + 1;
        } else {
          trial.dailyDatasetLookups = { date: todayDhaka, count: 1 };
        }
        await trial.save();
        newCount = trial.dailyDatasetLookups.count;
      }
      const limit = entitlements.quotas.dailyDatasetLookupLimit;
      datasetQuota = {
        limit,
        used: newCount,
        remaining: Math.max(0, limit - newCount),
        resetsAt: 'Midnight 00:00 (Asia/Dhaka)',
      };
    }

    enrichment.datasetQuota = datasetQuota;
    return res.json(enrichment);
  } catch (err) {
    console.error('Error enriching paper datasets:', err);
    return res.status(500).json({ message: 'Failed to discover datasets for this paper.' });
  }
});

// POST /api/thesis/:id/summary
// Grounded Quick Summary endpoint (feature flagged under PAPER_SUMMARIZER_ENABLED).
// Extracts grounded research components from authorized abstract or full text.
router.post('/:id/summary', summaryGenerationLimiter, optionalAuth, async (req, res) => {
  try {
    const isEnabled = process.env.PAPER_SUMMARIZER_ENABLED !== 'false';
    if (!isEnabled) {
      return res.status(200).json({
        enabled: false,
        message: 'Quick Summary is currently disabled by administrator configuration.',
      });
    }

    if (!req.user) {
      return res.status(403).json({
        enabled: true,
        error: true,
        code: 'FEATURE_LOCKED',
        feature: 'paper_summary',
        message: 'Sign in to Project Panther and activate your 7-Day Trial or Premium membership to access grounded Quick Summaries.',
      });
    }

    const entitlements = await getEffectiveEntitlements(req.user._id);
    if (!entitlements || !entitlements.quotas || entitlements.quotas.canUsePaperSummarizer === false || entitlements.quotas.dailySummaryGenerationLimit === 0 || entitlements.plan === 'free') {
      return res.status(403).json({
        enabled: true,
        error: true,
        code: 'FEATURE_LOCKED',
        feature: 'paper_summary',
        message: 'Quick Summary is a Premium research benefit. Please activate your 7-Day Trial or upgrade to Premium for grounded paper summaries.',
      });
    }

    const { id } = req.params;
    const { language = 'en', forceRefresh = false, paper: inputPaper } = req.body || {};

    let paper = inputPaper || null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      const localDoc = await Thesis.findById(id).lean();
      if (localDoc) {
        paper = {
          ...localDoc,
          ...(paper || {}),
        };
      }
    }

    if (!paper) {
      paper = {
        _id: id,
        id,
        title: req.body?.title || req.query?.title || '',
        abstract: req.body?.abstract || req.query?.abstract || '',
        doi: req.body?.doi || req.query?.doi || '',
        pdfUrl: req.body?.pdfUrl || req.query?.pdfUrl || '',
      };
    }

    const scope = String(req.user._id);
    const summaryResult = await getOrGeneratePaperSummary({
      paper,
      user: req.user,
      scope,
      entitlements,
      language: language === 'bn' ? 'bn' : 'en',
      forceRefresh: Boolean(forceRefresh),
    });

    if (summaryResult.error) {
      return res.status(summaryResult.statusCode || 500).json(summaryResult);
    }

    if (summaryResult.quotaExceeded) {
      return res.status(429).json(summaryResult);
    }

    return res.json(summaryResult);
  } catch (err) {
    console.error('Error generating paper summary:', err);
    return res.status(500).json({
      message: 'Failed to generate summary for this publication.',
      code: 'SUMMARY_GENERATION_FAILED',
    });
  }
});

// GET /api/thesis/:id/summary
router.get('/:id/summary', summaryGenerationLimiter, optionalAuth, async (req, res) => {
  try {
    const isEnabled = process.env.PAPER_SUMMARIZER_ENABLED !== 'false';
    if (!isEnabled) {
      return res.status(200).json({
        enabled: false,
        message: 'Quick Summary is currently disabled by administrator configuration.',
      });
    }

    if (!req.user) {
      return res.status(403).json({
        enabled: true,
        error: true,
        code: 'FEATURE_LOCKED',
        feature: 'paper_summary',
        message: 'Sign in to Project Panther and activate your 7-Day Trial or Premium membership to access grounded Quick Summaries.',
      });
    }

    const entitlements = await getEffectiveEntitlements(req.user._id);
    if (!entitlements || !entitlements.quotas || entitlements.quotas.canUsePaperSummarizer === false || entitlements.quotas.dailySummaryGenerationLimit === 0 || entitlements.plan === 'free') {
      return res.status(403).json({
        enabled: true,
        error: true,
        code: 'FEATURE_LOCKED',
        feature: 'paper_summary',
        message: 'Quick Summary is a Premium research benefit. Please activate your 7-Day Trial or upgrade to Premium for grounded paper summaries.',
      });
    }

    const { id } = req.params;
    const language = req.query.language === 'bn' ? 'bn' : 'en';
    const forceRefresh = req.query.forceRefresh === 'true';

    let paper = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      paper = await Thesis.findById(id).lean();
    }

    if (!paper) {
      paper = {
        _id: id,
        id,
        title: req.query.title || '',
        abstract: req.query.abstract || '',
        doi: req.query.doi || '',
        pdfUrl: req.query.pdfUrl || '',
      };
    }

    const scope = String(req.user._id);
    const summaryResult = await getOrGeneratePaperSummary({
      paper,
      user: req.user,
      scope,
      entitlements,
      language,
      forceRefresh,
    });

    if (summaryResult.error) {
      return res.status(summaryResult.statusCode || 500).json(summaryResult);
    }

    if (summaryResult.quotaExceeded) {
      return res.status(429).json(summaryResult);
    }

    return res.json(summaryResult);
  } catch (err) {
    console.error('Error fetching paper summary:', err);
    return res.status(500).json({
      message: 'Failed to generate summary for this publication.',
      code: 'SUMMARY_GENERATION_FAILED',
    });
  }
});

// GET /api/thesis/datasets/discover
// Global dataset search querying DataCite and Zenodo
router.get('/datasets/discover', optionalAuth, async (req, res) => {
  try {
    const { q, query, page = 1, limit = 15 } = req.query;
    const searchTerm = (q || query || '').trim();
    const result = await searchGlobalDatasets({ query: searchTerm, page, limit });
    return res.json(result);
  } catch (err) {
    console.error('Dataset search error:', err);
    return res.status(500).json({ message: 'Failed to search datasets.' });
  }
});

// POST /api/thesis/cite
// Generates BibTeX, RIS, and APA citations for any passed record metadata
router.post('/cite', (req, res) => {
  try {
    const record = (req.body && req.body.record) ? req.body.record : req.body;
    if (!record || !record.title) {
      return res.status(400).json({ message: 'Record with at least a title is required for citation.' });
    }

    const apa = generateApaCitation(record);
    const bibtex = generateBibtex(record);
    const ris = generateRis(record);

    return res.json({
      apa: apa.citation,
      bibtex: bibtex.citation,
      ris: ris,
      missingFields: Array.from(new Set([...apa.missingFields, ...bibtex.missingFields])),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to generate citations.' });
  }
});

// POST /api/thesis/:id/report
// Dead link / metadata inaccuracy report
router.post('/:id/report', optionalAuth, async (req, res) => {
  try {
    const { issueType, description, userEmail, title } = req.body;
    const newReport = new Report({
      recordId: req.params.id,
      title: title || 'Scholarly Publication',
      issueType: issueType || 'dead-link',
      description: description || 'User reported issue with metadata or access.',
      reportedBy: req.user ? req.user.email : (userEmail || 'anonymous'),
      status: 'pending',
    });
    await newReport.save();

    return res.status(201).json({
      message: 'Thank you. Your report has been logged persistently for editorial review.',
      reportId: newReport._id,
      report: newReport,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to submit report.' });
  }
});

// POST /api/thesis/:id/upvote
// Endorse a research publication (atomic toggle for local repository records)
router.post('/:id/upvote', authenticateToken, async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId) {
      return res.status(400).json({ message: 'Thesis identifier is required.' });
    }

    let thesis = null;
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      thesis = await Thesis.findById(rawId);
    }
    if (!thesis) {
      thesis = await Thesis.findOne({
        $or: [
          { catalogId: rawId },
          { doi: rawId },
        ],
      });
    }

    if (!thesis) {
      return res.status(200).json({
        code: 'EXTERNAL_PAPER_UPVOTE_UNSUPPORTED',
        message: 'Endorsements are currently supported for locally cataloged theses and institutional papers.',
        upvotes: 0,
        hasUpvoted: false,
      });
    }

    const userIdStr = req.user._id.toString();
    const alreadyUpvoted = (thesis.upvotedBy || []).some(
      (uid) => (uid?._id ? uid._id.toString() : uid.toString()) === userIdStr
    );

    let updatedThesis;
    if (alreadyUpvoted) {
      updatedThesis = await Thesis.findByIdAndUpdate(
        thesis._id,
        {
          $pull: { upvotedBy: req.user._id },
          $inc: { upvotes: -1 },
        },
        { new: true }
      );
    } else {
      updatedThesis = await Thesis.findByIdAndUpdate(
        thesis._id,
        {
          $addToSet: { upvotedBy: req.user._id },
          $inc: { upvotes: 1 },
        },
        { new: true }
      );
    }

    const finalUpvotes = Math.max(0, updatedThesis.upvotes || 0);
    if (updatedThesis.upvotes < 0) {
      await Thesis.findByIdAndUpdate(thesis._id, { upvotes: 0 });
    }

    emitThesisUpdated(updatedThesis);

    return res.json({
      success: true,
      upvotes: finalUpvotes,
      hasUpvoted: !alreadyUpvoted,
      thesisId: updatedThesis._id,
    });
  } catch (err) {
    console.error('Error upvoting thesis:', err);
    return res.status(500).json({ message: 'Failed to process endorsement.' });
  }
});

// POST /api/thesis
// Submits a user-contributed thesis.
// Authenticated user required. Status defaults strictly to 'pending' until admin moderation.
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      abstract,
      category,
      degreeType,
      university,
      department,
      author,
      advisor,
      publisher,
      publishedYear,
      pdfUrl,
      datasetUrl,
      datasetSize,
      datasetFormat,
      codeUrl,
      bibtex,
    } = req.body;

    if (!title || !abstract || !university || !department || !author) {
      return res.status(400).json({
        message: 'Title, abstract, university, department, and author are required.',
      });
    }

    const cleanPdfUrl = (pdfUrl && typeof pdfUrl === 'string') ? pdfUrl.trim() : '';
    const cleanDatasetUrl = (datasetUrl && typeof datasetUrl === 'string') ? datasetUrl.trim() : '';
    const cleanCodeUrl = (codeUrl && typeof codeUrl === 'string') ? codeUrl.trim() : '';

    if (cleanDatasetUrl && !isValidDatasetRepositoryUrl(cleanDatasetUrl)) {
      return res.status(400).json({
        message: 'Invalid dataset repository URL. Must be a valid HTTP/HTTPS URL from a recognized repository (e.g. Zenodo, DataCite, GitHub, OSF, Kaggle).',
      });
    }

    if (cleanCodeUrl && !isValidCodeRepositoryUrl(cleanCodeUrl)) {
      return res.status(400).json({
        message: 'Invalid code repository URL. Must be a valid public code repository (e.g. GitHub, GitLab).',
      });
    }

    if (cleanPdfUrl && !isValidDocumentUrl(cleanPdfUrl)) {
      return res.status(400).json({
        message: 'Invalid document/PDF URL. Must be a valid public HTTP/HTTPS URL.',
      });
    }

    const newThesis = new Thesis({
      title: title.trim(),
      abstract: abstract.trim(),
      category: category || 'Other Disciplines',
      degreeType: degreeType || 'M.Sc. Thesis',
      publicationType: 'thesis',
      university: university.trim(),
      department: department.trim(),
      author: author.trim(),
      advisor: advisor ? advisor.trim() : null,
      publisher: publisher ? publisher.trim() : `${university.trim()} Academic Depository`,
      publishedYear: publishedYear ? parseInt(publishedYear) : new Date().getFullYear(),
      pdfUrl: cleanPdfUrl,
      isDirectPdf: Boolean(cleanPdfUrl && (cleanPdfUrl.includes('/pdf') || cleanPdfUrl.endsWith('.pdf'))),
      datasetUrl: datasetUrl ? datasetUrl.trim() : '',
      datasetSize: datasetSize ? datasetSize.trim() : '',
      datasetFormat: datasetFormat ? datasetFormat.trim() : '',
      codeUrl: codeUrl ? codeUrl.trim() : '',
      bibtex: bibtex ? bibtex.trim() : '',
      submittedBy: req.user._id,
      status: req.user.role === 'admin' ? 'approved' : 'pending', // Submissions require moderation unless admin
      approvedAt: req.user.role === 'admin' ? new Date() : null,
      updatedAt: new Date(),
    });

    await newThesis.save();

    // Broadcast newly deposited publication in real-time
    emitThesisCreated(newThesis);

    return res.status(201).json({
      message: req.user.role === 'admin'
        ? 'Thesis created and approved immediately.'
        : 'Thesis submitted successfully. It is now awaiting editorial verification.',
      thesis: newThesis,
    });
  } catch (err) {
    console.error('Error creating thesis:', err);
    return res.status(500).json({ message: 'Failed to deposit thesis record.' });
  }
});

// Admin Moderation Endpoints
router.put('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', approvedAt: now, updatedAt: now },
      { new: true }
    );
    if (!thesis) return res.status(404).json({ message: 'Thesis not found.' });

    // Broadcast publication approved in real-time
    emitThesisUpdated(thesis);

    return res.json({ message: 'Thesis approved for public discovery.', thesis });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to approve thesis.' });
  }
});

router.put('/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected' },
      { new: true }
    );
    if (!thesis) return res.status(404).json({ message: 'Thesis not found.' });

    // Broadcast publication updated in real-time
    emitThesisUpdated(thesis);

    return res.json({ message: 'Thesis rejected.', thesis });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to reject thesis.' });
  }
});

router.put('/:id/pin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rawId = req.params.id;
    const requestedPinned = req.body?.isPinned;
    const paperData = req.body?.paper || req.body || {};

    if (!rawId || rawId === 'undefined' || rawId === 'null') {
      return res.status(400).json({ message: 'Valid thesis identifier is required.' });
    }

    let thesis = null;
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      thesis = await Thesis.findById(rawId);
    }
    if (!thesis) {
      thesis = await Thesis.findOne({
        $or: [
          { catalogId: rawId },
          { doi: rawId },
          { title: rawId },
          ...(paperData.catalogId ? [{ catalogId: paperData.catalogId }] : []),
          ...(paperData.doi ? [{ doi: paperData.doi }] : []),
          ...(paperData.title ? [{ title: paperData.title }] : []),
        ],
      });
    }

    if (!thesis) {
      // If unpinning a paper that does not exist in local MongoDB, it is already unpinned
      if (requestedPinned === false) {
        emitThesisPinned(rawId, false);
        return res.json({
          message: 'Thesis unpinned successfully.',
          isPinned: false,
          thesisId: rawId,
        });
      }

      // If pinning an external discovery paper, import and pin it
      const authorList = Array.isArray(paperData.authors)
        ? paperData.authors
        : (paperData.author ? [{ name: paperData.author }] : [{ name: 'Academic Researcher' }]);
      const authorStr = paperData.author || (authorList.length > 0 ? authorList.map((a) => a.name).join(', ') : 'Academic Researcher');

      thesis = new Thesis({
        title: paperData.title || `Scholarly Publication ${rawId}`,
        abstract: paperData.abstract || 'No abstract provided in source catalog.',
        category: paperData.category || 'Other Disciplines',
        degreeType: paperData.degreeType || 'Research Publication',
        publicationType: paperData.publicationType || 'unknown',
        university: paperData.university || paperData.venue || '',
        department: paperData.department || '',
        author: authorStr,
        authors: authorList,
        publisher: paperData.publisher || paperData.venue || '',
        doi: paperData.doi || '',
        publishedYear: paperData.publishedYear ? parseInt(paperData.publishedYear) : null,
        pdfUrl: paperData.pdfUrl || '',
        isDirectPdf: Boolean(paperData.isDirectPdf || (paperData.pdfUrl && paperData.pdfUrl.endsWith('.pdf'))),
        isOpenAccess: paperData.isOpenAccess !== undefined && paperData.isOpenAccess !== null ? Boolean(paperData.isOpenAccess) : null,
        isPinned: true,
        status: 'approved',
        catalogId: paperData.catalogId || undefined,
        submittedBy: req.user._id,
      });

      await thesis.save();
      emitThesisPinned(thesis._id, true);
      emitThesisCreated(thesis);

      return res.json({
        message: 'Publication curated and pinned to repository.',
        isPinned: true,
        thesisId: thesis._id,
      });
    }

    thesis.isPinned = requestedPinned !== undefined ? Boolean(requestedPinned) : !thesis.isPinned;
    await thesis.save();

    // Broadcast pinned state change in real-time
    emitThesisPinned(thesis._id, thesis.isPinned);

    return res.json({
      message: `Thesis ${thesis.isPinned ? 'pinned' : 'unpinned'} successfully.`,
      isPinned: thesis.isPinned,
      thesisId: thesis._id,
    });
  } catch (err) {
    console.error('Pin thesis error:', err);
    return res.status(500).json({ message: 'Failed to update pin state.' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId || rawId === 'undefined' || rawId === 'null') {
      return res.status(400).json({ message: 'Valid thesis identifier is required.' });
    }

    let thesis = null;
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      thesis = await Thesis.findByIdAndDelete(rawId);
    }
    if (!thesis) {
      thesis = await Thesis.findOneAndDelete({
        $or: [
          { catalogId: rawId },
          { doi: rawId },
        ],
      });
    }

    // Broadcast deletion in real-time
    emitThesisDeleted(thesis?._id || rawId);

    return res.json({ message: 'Thesis record purged from repository.' });
  } catch (err) {
    console.error('Delete thesis error:', err);
    return res.status(500).json({ message: 'Failed to delete thesis record.' });
  }
});

module.exports = router;
