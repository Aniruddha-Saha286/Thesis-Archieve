const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Thesis = require('../models/Thesis');
const Report = require('../models/Report');
const TrialGrant = require('../models/TrialGrant');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');
const { requirePermission, PERMISSIONS } = require('../middleware/rbac');
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
  emitToAdmins,
  emitToUser,
} = require('../socket');
const {
  reserveUsage,
  releaseReservedCredit,
  createSearchContextId,
  isAlreadyBilled,
  guestSearchStore,
} = require('../services/usageReservationService');
const { summaryGenerationLimiter, fullTextLimiter, openAccessFinderLimiter } = require('../middleware/rateLimit');
const { readPaperFullText } = require('../services/fullTextService');
const { findOpenAccessPdf } = require('../services/openAccessFinder');
const { fullTextMessage, isRetryableFullTextReason } = require('../utils/fullTextMessages');
const thesisFileStorage = require('../services/thesisFileStorage');
const emailService = require('../services/emailService');
const { normalizeReportIssueType } = require('../utils/reportIssueType');
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
    console.error('[routes/thesis.js] Failed to load publisher list:', err);
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

      const isApproved = doc.status === 'approved' || doc.isApproved === true;
      if (!isApproved) {
        const isStaff = req.user && (
          req.user.role === 'admin' ||
          (req.user.role === 'editor' && Array.isArray(req.user.permissions) && (
            req.user.permissions.includes(PERMISSIONS.PUBLICATIONS_MODERATE) ||
            req.user.permissions.includes(PERMISSIONS.DOCUMENTS_VIEW)
          ))
        );
        const isSubmitter = req.user && doc.submittedBy && String(doc.submittedBy) === String(req.user._id);

        if (!isStaff && !isSubmitter) {
          return res.status(404).json({ message: 'Scholarly publication not found in archive.' });
        }
      }

      // Convert to normalized record
      const directPdf = doc.pdfUrl && doc.pdfUrl.trim() ? doc.pdfUrl.trim() : null;
      const isDirectPdf = Boolean(directPdf && (doc.isDirectPdf || directPdf.includes('/pdf') || directPdf.endsWith('.pdf')));

      const sourceUrl = doc.sourceUrl && String(doc.sourceUrl).trim() ? String(doc.sourceUrl).trim() : null;

      const record = createNormalizedRecord({
        id: String(doc._id),
        doi: doc.doi || null,
        title: doc.title,
        author: doc.author,
        authors: doc.authors && doc.authors.length > 0 ? doc.authors : [{ name: doc.author, affiliation: doc.university || null }],
        abstract: doc.abstract,
        publicationType: doc.publicationType || 'thesis',
        degreeType: doc.degreeType || null,
        advisor: doc.advisor || null,
        department: doc.department || null,
        origin: doc.origin || 'deposit',
        sourceRepositoryName: doc.sourceRepositoryName || null,
        sourceUrl: sourceUrl,
        sourceRights: doc.sourceRights || null,
        fullTextLocations: sourceUrl ? [{ type: 'landing', url: sourceUrl, source: doc.sourceRepositoryName || 'Original repository', isDirectPdf: false }] : undefined,
        isPeerReviewed: doc.publicationType === 'journal-article' || doc.publicationType === 'conference-paper',
        publishedYear: doc.publishedYear,
        venue: doc.university ? `${doc.university} • ${doc.department}` : doc.publisher,
        publisher: doc.publisher || doc.university || 'The Thesis Archive',
        isOpenAccess: doc.isOpenAccess !== false,
        license: doc.license || null,
        pdfUrl: isDirectPdf ? directPdf : null,
        isDirectPdf: isDirectPdf,
        fullTextUrl: directPdf || sourceUrl,
        isRetracted: doc.isRetracted || false,
        datasetUrl: doc.datasetUrl || null,
        codeUrl: doc.codeUrl || null,
        catalogId: doc.catalogId,
        upvotes: doc.upvotes || 0,
        isPinned: doc.isPinned || false,
        isSample: doc.isSample || false,
        source: doc.origin === 'harvest' && doc.sourceRepositoryName ? doc.sourceRepositoryName : (doc.source || 'Local Archive'),
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
    console.error('[routes/thesis.js] Error retrieving record:', err);
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
        const isApproved = doc.status === 'approved' || doc.isApproved === true;
        if (!isApproved) {
          const isStaff = req.user && (
            req.user.role === 'admin' ||
            (req.user.role === 'editor' && Array.isArray(req.user.permissions) && (
              req.user.permissions.includes(PERMISSIONS.PUBLICATIONS_MODERATE) ||
              req.user.permissions.includes(PERMISSIONS.DOCUMENTS_VIEW)
            ))
          );
          const isSubmitter = req.user && doc.submittedBy && String(doc.submittedBy) === String(req.user._id);

          if (!isStaff && !isSubmitter) {
            return res.status(404).json({ message: 'Scholarly publication not found in archive.' });
          }
        }

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
        message: 'The dataset sources could not be reached just now. Please try again in a few moments.',
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

// An approved paper is visible to everyone. A paper still waiting for review (or rejected)
// is visible only to staff who moderate publications and to the person who deposited it.
function canSeeUnapprovedPaper(user, doc) {
  if (!doc) return false;
  if (doc.status === 'approved' || doc.isApproved === true) return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (
    user.role === 'editor' &&
    Array.isArray(user.permissions) &&
    (user.permissions.includes(PERMISSIONS.PUBLICATIONS_MODERATE) || user.permissions.includes(PERMISSIONS.DOCUMENTS_VIEW))
  ) {
    return true;
  }
  return Boolean(doc.submittedBy && String(doc.submittedBy) === String(user._id));
}

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
        message: 'Sign in and start your 7-day trial or a Premium membership to use Quick Summary.',
      });
    }

    const entitlements = await getEffectiveEntitlements(req.user._id);
    if (!entitlements || !entitlements.quotas || entitlements.quotas.canUsePaperSummarizer === false || entitlements.quotas.dailySummaryGenerationLimit === 0 || entitlements.plan === 'free') {
      return res.status(403).json({
        enabled: true,
        error: true,
        code: 'FEATURE_LOCKED',
        feature: 'paper_summary',
        message: 'Quick Summary is included in the 7-day trial and in Premium. It is not part of the free plan.',
      });
    }

    const { id } = req.params;
    const { language = 'en', forceRefresh = false, paper: inputPaper } = req.body || {};

    let paper = inputPaper || null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      const localDoc = await Thesis.findById(id).lean();
      if (localDoc) {
        // Same visibility rule as the GET route: a paper still waiting for review is only
        // summarised for staff and for the person who deposited it.
        if (!canSeeUnapprovedPaper(req.user, localDoc)) {
          return res.status(404).json({ message: 'Scholarly publication not found in archive.' });
        }
        // The archive's own record wins over anything the browser sends
        paper = {
          ...(paper || {}),
          ...localDoc,
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
        message: 'Sign in and start your 7-day trial or a Premium membership to use Quick Summary.',
      });
    }

    const entitlements = await getEffectiveEntitlements(req.user._id);
    if (!entitlements || !entitlements.quotas || entitlements.quotas.canUsePaperSummarizer === false || entitlements.quotas.dailySummaryGenerationLimit === 0 || entitlements.plan === 'free') {
      return res.status(403).json({
        enabled: true,
        error: true,
        code: 'FEATURE_LOCKED',
        feature: 'paper_summary',
        message: 'Quick Summary is included in the 7-day trial and in Premium. It is not part of the free plan.',
      });
    }

    const { id } = req.params;
    const language = req.query.language === 'bn' ? 'bn' : 'en';
    const forceRefresh = req.query.forceRefresh === 'true';

    let paper = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Thesis.findById(id).lean();
      if (doc) {
        if (!canSeeUnapprovedPaper(req.user, doc)) {
          return res.status(404).json({ message: 'Scholarly publication not found in archive.' });
        }
        paper = doc;
      }
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

// GET /api/thesis/open-access/find?doi=...
// "Find a free PDF": asks Unpaywall whether a legal free copy of a paper exists.
// Open to every signed-in member, because sending a student elsewhere to look is how they leave.
router.get('/open-access/find', openAccessFinderLimiter, optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Sign in to look for a free PDF.' });
    }
    const doi = String(req.query.doi || '').trim().slice(0, 300);
    if (!doi) {
      return res.status(400).json({ found: false, reason: 'invalid_doi', message: 'This paper has no DOI, so a free copy cannot be looked up.' });
    }

    const result = await findOpenAccessPdf({ doi });
    if (result.found) {
      return res.json(result);
    }

    const messages = {
      not_configured: 'The free-PDF finder is not switched on for this site yet.',
      invalid_doi: 'This paper has no usable DOI, so a free copy cannot be looked up.',
      no_open_copy: 'No free legal copy of this paper is known.',
      not_found: 'This DOI is not known to the free-PDF index.',
      rate_limited: 'The free-PDF index is busy. Try again in a minute.',
      unavailable: 'The free-PDF index could not be reached. Try again in a moment.',
    };
    return res.json({ found: false, reason: result.reason, message: messages[result.reason] || messages.unavailable });
  } catch (err) {
    console.error('[routes/thesis.js] Free PDF lookup failed:', err);
    return res.status(500).json({ found: false, reason: 'unavailable', message: 'The free-PDF lookup failed.' });
  }
});

// POST /api/thesis/:id/full-text
// Reads the paper's free PDF and returns the authors' own Limitations, Future work, Conclusion
// and Data/Code availability text, plus dataset and code links found in the paper.
// No AI: only text that is in the PDF is returned. Same members as Quick Summary.
router.post('/:id/full-text', fullTextLimiter, optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(403).json({
        code: 'FEATURE_LOCKED',
        feature: 'paper_full_text',
        message: 'Sign in and start your 7-day trial or a Premium membership to read limitations from the full paper.',
      });
    }

    const entitlements = await getEffectiveEntitlements(req.user._id);
    const quotas = entitlements && entitlements.quotas;
    if (!quotas || entitlements.plan === 'free' || quotas.canUsePaperSummarizer === false || quotas.canAccessFullTextSummary !== true) {
      return res.status(403).json({
        code: 'FEATURE_LOCKED',
        feature: 'paper_full_text',
        message: 'Reading limitations from the full paper is included in the 7-day trial and in Premium. It is not part of the free plan.',
      });
    }

    const { id } = req.params;
    const inputPaper = (req.body && typeof req.body.paper === 'object' && req.body.paper) || {};
    let pdfUrl = typeof inputPaper.pdfUrl === 'string' ? inputPaper.pdfUrl.trim() : '';
    let doi = typeof inputPaper.doi === 'string' ? inputPaper.doi.trim().slice(0, 300) : '';

    if (mongoose.Types.ObjectId.isValid(id)) {
      const localDoc = await Thesis.findById(id).lean();
      if (localDoc) {
        if (!canSeeUnapprovedPaper(req.user, localDoc)) {
          return res.status(404).json({ message: 'Scholarly publication not found in archive.' });
        }
        // The archive's own record wins over anything the browser sends
        pdfUrl = localDoc.pdfUrl && String(localDoc.pdfUrl).trim() ? String(localDoc.pdfUrl).trim() : '';
        doi = localDoc.doi || '';
      }
    }

    let foundVia = 'record';
    if (pdfUrl && !isValidDocumentUrl(pdfUrl)) {
      pdfUrl = '';
    }
    if (!pdfUrl && doi) {
      // No PDF on the record: see whether a free legal copy exists and read that one
      const openCopy = await findOpenAccessPdf({ doi });
      if (openCopy.found && openCopy.pdfUrl) {
        pdfUrl = openCopy.pdfUrl;
        foundVia = 'unpaywall';
      }
    }

    if (!pdfUrl) {
      return res.json({ available: false, reason: 'no_pdf', retryable: false, message: fullTextMessage('no_pdf') });
    }

    const result = await readPaperFullText({ pdfUrl });
    if (!result.ok) {
      return res.json({
        available: false,
        reason: result.reason,
        retryable: isRetryableFullTextReason(result.reason),
        message: fullTextMessage(result.reason),
      });
    }

    return res.json({
      available: true,
      foundVia,
      pdfUrl: result.finalUrl || pdfUrl,
      pageCount: result.pageCount,
      pagesRead: result.pagesRead,
      truncated: Boolean(result.truncated),
      keySections: result.keySections,
      links: result.links,
      sectionTitles: result.sectionTitles,
    });
  } catch (err) {
    console.error('[routes/thesis.js] Full-text reading failed:', err);
    return res.status(500).json({ available: false, reason: 'unreadable', retryable: true, message: 'The full text could not be read for this paper.' });
  }
});

// GET /api/thesis/datasets/discover
// Global dataset search across the dataset sources (DataCite, Zenodo, Figshare, Dryad, Harvard Dataverse, Hugging Face)
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
    console.error('[routes/thesis.js] Failed to generate citations:', err);
    return res.status(500).json({ message: 'Failed to generate citations.' });
  }
});

// POST /api/thesis/:id/report
// Dead link / metadata inaccuracy report
router.post('/:id/report', optionalAuth, async (req, res) => {
  try {
    const { issueType, description, userEmail, title } = req.body || {};
    const newReport = new Report({
      recordId: String(req.params.id).slice(0, 200),
      title: String(title || 'Scholarly Publication').slice(0, 300),
      issueType: normalizeReportIssueType(issueType),
      description: String(description || '').trim().slice(0, 2000) || 'No details were given.',
      reportedBy: req.user ? req.user.email : (userEmail || 'anonymous'),
      status: 'pending',
    });
    await newReport.save();

    emailService.notifyAdminNewReport({
      reportId: newReport._id,
      recordId: newReport.recordId,
      issueType: newReport.issueType,
      description: newReport.description,
      reportedBy: newReport.reportedBy,
      title: newReport.title,
    }).catch((err) => console.error('[EmailService] Report notification error:', err.message));

    const reporterEmail = req.user?.email || (typeof userEmail === 'string' && userEmail.includes('@') ? userEmail.trim() : null);
    if (reporterEmail) {
      emailService.notifyUserReportSubmitted({
        userEmail: reporterEmail,
        userName: req.user?.name || reporterEmail.split('@')[0],
        title: newReport.title,
        issueType: newReport.issueType,
        reportId: newReport._id,
      }).catch((err) => console.error('[EmailService] User report acknowledgment error:', err.message));
    }

    try {
      const adminUser = await User.findOne({ role: 'admin' });
      const notifPayload = {
        type: 'report_created',
        title: 'Publication Grievance Reported',
        message: `Issue "${newReport.issueType}" reported for "${newReport.title}" by ${newReport.reportedBy}.`,
      };
      if (adminUser) {
        const adminNotif = new Notification({ user: adminUser._id, ...notifPayload });
        await adminNotif.save();
        emitToUser(String(adminUser._id), 'notification:new', adminNotif);
      }
      emitToAdmins('notification:new', notifPayload);
    } catch (notifErr) {
      console.error('[Thesis] In-app notification error:', notifErr.message);
    }

    return res.status(201).json({
      message: 'Thank you. Your report has been logged persistently for editorial review.',
      reportId: newReport._id,
      report: newReport,
    });
  } catch (err) {
    console.error('[Thesis] Report submission error:', err);
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
    if (req.user.role === 'student' && req.user.status !== 'approved') {
      return res.status(403).json({
        message: 'Access restricted: Publication submission is restricted to verified, approved scholars.',
        code: 'APPROVAL_REQUIRED',
      });
    }

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
      pdfStorageRef,
      pdfSizeBytes,
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

    // A PDF uploaded through the deposit form: accepted only when the address really is this
    // site's stored copy of that file, so a form cannot claim somebody else's upload.
    const isUploadedPdf = Boolean(pdfStorageRef) && thesisFileStorage.isOwnStorageUrl(cleanPdfUrl, pdfStorageRef);
    if (isUploadedPdf) {
      // The file must be one this member uploaded, and each upload belongs to one thesis only.
      // Otherwise deleting one record could remove a file another record still needs.
      if (!thesisFileStorage.isUploadedBy(pdfStorageRef, req.user._id)) {
        return res.status(400).json({ message: 'That uploaded file cannot be used here. Please upload your PDF again.' });
      }
      if (await Thesis.exists({ pdfStorageRef })) {
        return res.status(409).json({
          code: 'ALREADY_SUBMITTED',
          message: 'This PDF is already attached to a thesis you submitted. You do not need to send it again.',
        });
      }
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
      isDirectPdf: Boolean(cleanPdfUrl && (isUploadedPdf || cleanPdfUrl.includes('/pdf') || cleanPdfUrl.endsWith('.pdf'))),
      pdfStorageRef: isUploadedPdf ? pdfStorageRef : '',
      pdfSizeBytes: isUploadedPdf && Number.isFinite(Number(pdfSizeBytes)) ? Number(pdfSizeBytes) : null,
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

// Admin / Staff Moderation Endpoints
router.put('/:id/approve', authenticateToken, requirePermission(PERMISSIONS.PUBLICATIONS_MODERATE), async (req, res) => {
  try {
    const now = new Date();
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', approvedAt: now, approvedBy: req.user._id, updatedAt: now },
      { new: true }
    );
    if (!thesis) return res.status(404).json({ message: 'Thesis not found.' });

    // Broadcast publication approved in real-time
    emitThesisUpdated(thesis);

    return res.json({ message: 'Thesis approved for public discovery.', thesis });
  } catch (err) {
    console.error('[routes/thesis.js] Failed to approve thesis:', err);
    return res.status(500).json({ message: 'Failed to approve thesis.' });
  }
});

router.put('/:id/reject', authenticateToken, requirePermission(PERMISSIONS.PUBLICATIONS_MODERATE), async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ message: 'A mandatory rejection reason is required.' });
    }

    const now = new Date();
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id,
      {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        rejectedBy: req.user._id,
        rejectedAt: now,
        updatedAt: now,
      },
      { new: true }
    );
    if (!thesis) return res.status(404).json({ message: 'Thesis not found.' });

    // Broadcast publication updated in real-time
    emitThesisUpdated(thesis);

    return res.json({ message: 'Thesis rejected.', thesis });
  } catch (err) {
    console.error('[routes/thesis.js] Failed to reject thesis:', err);
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
      return res.status(404).json({
        message: 'Publication record not found in local depository. External federated records cannot be deleted.',
      });
    }

    // Broadcast deletion in real-time
    emitThesisDeleted(thesis._id);

    // Remove the uploaded PDF with the record (does nothing for linked PDFs; never blocks the delete)
    if (thesis.pdfStorageRef) {
      await thesisFileStorage.destroyThesisPdfIfUnused(thesis.pdfStorageRef, Thesis);
    }

    return res.json({ message: 'Thesis record purged from repository.' });
  } catch (err) {
    console.error('Delete thesis error:', err);
    return res.status(500).json({ message: 'Failed to delete thesis record.' });
  }
});

module.exports = router;
