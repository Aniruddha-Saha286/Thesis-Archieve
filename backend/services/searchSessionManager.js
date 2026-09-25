const crypto = require('crypto');
const { searchLocal } = require('./providers/local');
const { searchOpenAlex } = require('./providers/openalex');
const { searchArxiv } = require('./providers/arxiv');
const { searchCrossref } = require('./providers/crossref');
const { searchEuropePmc } = require('./providers/europePmc');
const { searchHal } = require('./providers/hal');
const { searchDoaj } = require('./providers/doaj');
const { mergeTwoRecords, cleanTitleForMatching, getFirstAuthorSurname } = require('./deduplicator');
const { mapToCanonicalSubject } = require('./subjectCatalog');

// Bounded in-memory search session cache (30-minute TTL, max 200 active sessions)
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 200;

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

function normalizePublicationType(type) {
  if (!type || type === 'all') return 'all';
  const t = String(type).trim().toLowerCase();
  if (t === 'article') return 'journal-article';
  if (t === 'proceedings') return 'conference-paper';
  return t;
}

function normalizeCountryCodes(countryCodes) {
  if (!countryCodes) return '';
  if (Array.isArray(countryCodes)) {
    return countryCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean).sort().join(',');
  }
  return String(countryCodes).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean).sort().join(',');
}

function normalizeSessionFilterKey(filters = {}) {
  return {
    publicationType: normalizePublicationType(filters.publicationType),
    hasPdf: Boolean(filters.hasPdf),
    isOpenAccess: Boolean(filters.isOpenAccess),
    category: filters.category || 'All Disciplines',
    subjectId: filters.subjectId ? String(filters.subjectId).trim().toLowerCase() : '',
    yearMin: filters.yearMin ? String(filters.yearMin) : '',
    yearMax: filters.yearMax ? String(filters.yearMax) : '',
    publisher: filters.publisher ? filters.publisher.trim().toLowerCase() : '',
    source: filters.source ? filters.source.trim().toLowerCase() : '',
    institutionId: filters.institutionId ? String(filters.institutionId).trim().split('/').pop() : '',
    institutionMode: filters.institutionMode === 'awarding' ? 'awarding' : 'affiliation',
    countryCodes: normalizeCountryCodes(filters.countryCodes),
    authorId: filters.authorId ? String(filters.authorId).trim().split('/').pop() : '',
    minCitations: filters.minCitations && !isNaN(parseInt(filters.minCitations)) ? parseInt(filters.minCitations) : 0,
  };
}

function computeSessionHash(query = '', filters = {}, sort = 'relevance') {
  const normQuery = (query || '').trim().toLowerCase();
  const normFilters = normalizeSessionFilterKey(filters);
  const payload = JSON.stringify({ q: normQuery, f: normFilters, s: sort });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 20);
}

function computeRelevanceScore(record, queryWords) {
  if (!queryWords || queryWords.length === 0) return 0;
  const lowerTitle = (record.title || '').toLowerCase();
  const lowerAbstract = (record.abstract || '').toLowerCase();
  const lowerAuthors = (record.authorDisplay || '').toLowerCase();

  let score = 0;
  for (const word of queryWords) {
    if (!word) continue;
    if (lowerTitle.includes(word)) score += 10;
    if (lowerTitle.startsWith(word)) score += 5;
    if (lowerAbstract.includes(word)) score += 2;
    if (lowerAuthors.includes(word)) score += 4;
  }
  if (record.pdfUrl) score += 2;
  if (record.isPeerReviewed || record.publicationType === 'thesis') score += 1;
  return score;
}

function sortRecords(records, sort, query, pageNum) {
  if (sort === 'citations') {
    records.sort((a, b) => {
      if (pageNum === 1 && a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const citA = typeof a.citationCount === 'number' ? a.citationCount : -1;
      const citB = typeof b.citationCount === 'number' ? b.citationCount : -1;
      if (citB !== citA) return citB - citA;
      return (b.publishedYear || 0) - (a.publishedYear || 0);
    });
  } else if (sort === 'newest') {
    records.sort((a, b) => {
      // Pin priority belongs exclusively to Page 1
      if (pageNum === 1 && a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const yrA = a.publishedYear || 0;
      const yrB = b.publishedYear || 0;
      return yrB - yrA;
    });
  } else {
    const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    records.sort((a, b) => {
      if (pageNum === 1 && a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const scoreA = computeRelevanceScore(a, words);
      const scoreB = computeRelevanceScore(b, words);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.publishedYear || 0) - (a.publishedYear || 0);
    });
  }
}

/**
 * Validates institutional, country, author, and coauthor isolation rules
 */
function matchesInstitutionalAndAuthorFilters(record, filters) {
  const instId = filters.institutionId ? String(filters.institutionId).trim().split('/').pop().toLowerCase() : null;
  const instMode = filters.institutionMode === 'awarding' ? 'awarding' : 'affiliation';
  const authorId = filters.authorId ? String(filters.authorId).trim().split('/').pop().toLowerCase() : null;

  let targetCountries = [];
  if (filters.countryCodes) {
    if (Array.isArray(filters.countryCodes)) {
      targetCountries = filters.countryCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    } else if (typeof filters.countryCodes === 'string') {
      targetCountries = filters.countryCodes.split(/[,|]/).map((c) => c.trim().toUpperCase()).filter(Boolean);
    }
  }

  // 1. Author Filter Constraint
  if (authorId) {
    const matchingAuthorships = (record.authorships || []).filter((a) => {
      const aId = a.author?.id ? String(a.author.id).split('/').pop().toLowerCase() : '';
      return aId === authorId;
    });

    if (matchingAuthorships.length === 0) {
      return false; // Author not present on paper
    }

    // Coauthor isolation: If BOTH author and institution are specified, the author must be affiliated with that institution!
    if (instId) {
      const authorAtInst = matchingAuthorships.some((a) =>
        (a.institutions || []).some((inst) => {
          const iId = inst.id ? String(inst.id).split('/').pop().toLowerCase() : '';
          const iName = (inst.name || '').toLowerCase();
          return iId === instId || iName.includes(instId);
        })
      );
      if (!authorAtInst) {
        return false;
      }
    }

    // If country is specified alongside author: author's institution must match the country
    if (targetCountries.length > 0) {
      const authorInCountry = matchingAuthorships.some((a) =>
        (a.institutions || []).some((inst) => inst.countryCode && targetCountries.includes(inst.countryCode))
      );
      if (!authorInCountry) {
        return false;
      }
    }
  }

  // 2. Institution Filter Constraint (when author not specified or already passed)
  if (instId) {
    if (instMode === 'awarding') {
      const awardId = record.awardingInstitution?.id ? String(record.awardingInstitution.id).split('/').pop().toLowerCase() : '';
      const awardName = (record.awardingInstitution?.name || (record.publicationType === 'thesis' ? record.university : '') || '').toLowerCase();
      const matchAward = Boolean((awardId && awardId === instId) || (awardName && awardName.includes(instId)));
      if (!matchAward) return false;

      if (targetCountries.length > 0) {
        const awardCountry = record.awardingInstitution?.countryCode;
        if (awardCountry && !targetCountries.includes(awardCountry)) {
          return false;
        }
      }
    } else {
      const matchingInsts = [];
      for (const a of record.authorships || []) {
        for (const inst of a.institutions || []) {
          const iId = inst.id ? String(inst.id).split('/').pop().toLowerCase() : '';
          const iName = (inst.name || '').toLowerCase();
          if (iId === instId || iName.includes(instId)) {
            matchingInsts.push(inst);
          }
        }
      }

      if (matchingInsts.length === 0) {
        const uniName = (record.university || '').toLowerCase();
        if (!uniName.includes(instId)) {
          return false;
        }
      }

      // Coauthor isolation: the matched institution itself must reside in the target country
      if (targetCountries.length > 0 && matchingInsts.length > 0) {
        const hasCountryMatch = matchingInsts.some((inst) => inst.countryCode && targetCountries.includes(inst.countryCode));
        if (!hasCountryMatch) {
          return false;
        }
      }
    }
  } else if (targetCountries.length > 0 && !authorId) {
    // Country filter alone
    let hasCountry = false;
    for (const a of record.authorships || []) {
      for (const inst of a.institutions || []) {
        if (inst.countryCode && targetCountries.includes(inst.countryCode)) {
          hasCountry = true;
          break;
        }
      }
      if (hasCountry) break;
    }
    if (!hasCountry && record.awardingInstitution?.countryCode) {
      if (targetCountries.includes(record.awardingInstitution.countryCode)) {
        hasCountry = true;
      }
    }
    if (!hasCountry) {
      return false;
    }
  }

  // 4. Minimum Citation Count Constraint
  if (filters.minCitations && !isNaN(parseInt(filters.minCitations))) {
    const minC = parseInt(filters.minCitations, 10);
    if (minC > 0) {
      if (record.citationCount === null || record.citationCount === undefined) {
        return false;
      }
      if (Number(record.citationCount) < minC) {
        return false;
      }
    }
  }

  // 5. Subject Category Constraint
  if (filters.subjectId) {
    const targetSubId = String(filters.subjectId).trim().toLowerCase();
    const hasSub = (record.subjects || []).some((s) => s.id && s.id.toLowerCase() === targetSubId);
    const mappedSub = mapToCanonicalSubject(record.category);
    if (!hasSub && (!mappedSub || mappedSub.id !== targetSubId)) {
      return false;
    }
  }

  return true;
}

function sortUnfrozenBuffer(session, sort, query, pageNum) {
  const frozenIndex = session.frozenIndex || 0;
  if (frozenIndex >= session.buffer.length) return;

  const unfrozen = session.buffer.slice(frozenIndex);
  sortRecords(unfrozen, sort, query, pageNum);
  for (let i = 0; i < unfrozen.length; i++) {
    session.buffer[frozenIndex + i] = unfrozen[i];
  }
}

function isProviderEligible(pKey, filters = {}) {
  if (filters.source) {
    const s = filters.source.toLowerCase().trim();
    if (pKey === 'local') {
      if (!s.includes('local')) return false;
    } else if (pKey === 'europepmc') {
      if (!s.includes('europe pmc') && !s.includes('europepmc')) return false;
    } else if (pKey === 'hal') {
      if (!s.includes('hal')) return false;
    } else {
      if (!s.includes(pKey)) return false;
    }
  }

  // Publication type constraints
  const pubType = normalizePublicationType(filters.publicationType);
  if (pKey === 'arxiv') {
    if (pubType === 'thesis') return false;
  }

  if (pKey === 'doaj') {
    if (pubType === 'thesis' || pubType === 'preprint') {
      return false;
    }
  }

  return true;
}

function createNewSession(sessionId, scope, query, filters, sort, sessionHash) {
  if (sessions.size >= MAX_SESSIONS) {
    cleanupExpiredSessions();
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = sessions.keys().next().value;
      sessions.delete(oldestKey);
    }
  }

  const session = {
    id: sessionId,
    scope: scope || null,
    sessionHash,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    query,
    filters,
    sort,
    buffer: [],
    recordsById: new Map(),
    recordsByDoi: new Map(),
    recordsByTitleAuthor: new Map(),
    frozenIndex: 0,
    lock: Promise.resolve(),
    providerStatus: {},
    providerStates: {
      local: { offset: 0, hasMore: true, status: 'fulfilled', count: 0 },
      openalex: { page: 1, hasMore: true, status: 'fulfilled', count: 0 },
      arxiv: { offset: 0, hasMore: true, status: 'fulfilled', count: 0 },
      crossref: { offset: 0, hasMore: true, status: 'fulfilled', count: 0 },
      europepmc: { page: 1, hasMore: true, status: 'fulfilled', count: 0 },
      hal: { offset: 0, hasMore: true, status: 'fulfilled', count: 0 },
      doaj: { page: 1, hasMore: true, status: 'fulfilled', count: 0 },
    },
    allProvidersExhausted: false,
  };

  sessions.set(sessionId, session);
  return session;
}

function acquireSessionLock(session) {
  let release;
  const nextLock = new Promise((resolve) => {
    release = resolve;
  });
  const currentLock = session.lock || Promise.resolve();
  session.lock = currentLock.then(() => nextLock);
  return currentLock.then(() => release);
}

/**
 * Core locked session search executor
 */
async function executeSearchSessionLocked(session, {
  query = '',
  page = 1,
  limit = 20,
  filters = {},
  sort = 'relevance',
}) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(5, parseInt(limit) || 20));

  const startIndex = (pageNum - 1) * limitNum;
  const endIndex = pageNum * limitNum;

  // Buffer Refill Loop: fetch until we have enough records to cover endIndex, or all eligible providers are exhausted
  let refillAttempts = 0;
  const MAX_REFILL_ATTEMPTS = 5;

  while (session.buffer.length < endIndex && !session.allProvidersExhausted && refillAttempts < MAX_REFILL_ATTEMPTS) {
    refillAttempts++;
    const fetchPromises = [];

    // Local MongoDB
    if (isProviderEligible('local', filters) && session.providerStates.local.hasMore) {
      const curOffset = session.providerStates.local.offset || 0;
      const localLimit = Math.max(limitNum, 20);
      fetchPromises.push(
        searchLocal({ query, offset: curOffset, limit: localLimit, filters, sort })
          .then((res) => ({ name: 'Local Archive', key: 'local', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'Local Archive', key: 'local', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // OpenAlex
    if (isProviderEligible('openalex', filters) && session.providerStates.openalex.hasMore) {
      const curPage = session.providerStates.openalex.page || 1;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchOpenAlex({ query, page: curPage, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'OpenAlex', key: 'openalex', ...res, nextPage: curPage + 1 }))
          .catch((err) => ({ name: 'OpenAlex', key: 'openalex', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // arXiv
    if (isProviderEligible('arxiv', filters) && session.providerStates.arxiv.hasMore) {
      const curOffset = session.providerStates.arxiv.offset || 0;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchArxiv({ query, offset: curOffset, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'arXiv', key: 'arxiv', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'arXiv', key: 'arxiv', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // Crossref
    if (isProviderEligible('crossref', filters) && session.providerStates.crossref.hasMore) {
      const curOffset = session.providerStates.crossref.offset || 0;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchCrossref({ query, offset: curOffset, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'Crossref', key: 'crossref', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'Crossref', key: 'crossref', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // Europe PMC
    if (isProviderEligible('europepmc', filters) && session.providerStates.europepmc.hasMore) {
      const curPage = session.providerStates.europepmc.page || 1;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchEuropePmc({ query, page: curPage, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'Europe PMC', key: 'europepmc', ...res, nextPage: curPage + 1 }))
          .catch((err) => ({ name: 'Europe PMC', key: 'europepmc', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // HAL Open Science
    if (isProviderEligible('hal', filters) && session.providerStates.hal.hasMore) {
      const curOffset = session.providerStates.hal.offset || 0;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchHal({ query, offset: curOffset, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'HAL Open Science', key: 'hal', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'HAL Open Science', key: 'hal', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // DOAJ
    if (isProviderEligible('doaj', filters) && session.providerStates.doaj.hasMore) {
      const curPage = session.providerStates.doaj.page || 1;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchDoaj({ query, page: curPage, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'DOAJ', key: 'doaj', ...res, nextPage: curPage + 1 }))
          .catch((err) => ({ name: 'DOAJ', key: 'doaj', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    if (fetchPromises.length === 0) {
      session.allProvidersExhausted = true;
      break;
    }

    const settled = await Promise.allSettled(fetchPromises);
    let newlyAddedCount = 0;

    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue;
      const res = outcome.value;
      const pKey = res.key;

      const provState = session.providerStates[pKey] || {};
      const isErr = Boolean(res.error);
      const provStatus = isErr ? 'degraded' : 'fulfilled';

      session.providerStatus[res.name] = {
        status: provStatus,
        count: (session.providerStatus[res.name]?.count || 0) + (res.records?.length || 0),
        returnedCount: (session.providerStatus[res.name]?.returnedCount || 0) + (res.records?.length || 0),
        total: res.totalCount || 0,
        totalAvailable: res.totalCount || 0,
        hasMore: Boolean(res.hasMore),
        error: res.error || null,
      };

      provState.hasMore = Boolean(res.hasMore);
      provState.status = provStatus;
      if (res.nextPage !== undefined) provState.page = res.nextPage;
      if (res.nextOffset !== undefined) provState.offset = res.nextOffset;
      session.providerStates[pKey] = provState;

      // Deduplicate and fuse newly arrived records into session buffer
      if (Array.isArray(res.records)) {
        for (const record of res.records) {
          if (!record || !record.title) continue;

          // Institutional, country, and author constraints validation
          if (!matchesInstitutionalAndAuthorFilters(record, filters)) {
            continue;
          }

          // Minimum citations constraint validation
          if (filters.minCitations && !isNaN(parseInt(filters.minCitations))) {
            const minC = parseInt(filters.minCitations);
            if (minC > 0 && (record.citationCount === null || record.citationCount === undefined || record.citationCount < minC)) {
              continue;
            }
          }

          // Subject category constraint validation
          if (filters.subjectId) {
            const targetSubId = String(filters.subjectId).trim().toLowerCase();
            const hasSub = (record.subjects || []).some((s) => s.id && s.id.toLowerCase() === targetSubId);
            const mappedSub = mapToCanonicalSubject(record.category);
            if (!hasSub && (!mappedSub || mappedSub.id !== targetSubId)) {
              continue;
            }
          }

          // Strict PDF constraint validation: buffer only records with authentic PDF access
          if (filters.hasPdf) {
            const hasValidPdf = Boolean(
              record.isDirectPdf ||
              (record.pdfUrl && (
                record.pdfUrl.endsWith('.pdf') ||
                record.pdfUrl.includes('/pdf/') ||
                record.pdfUrl.includes('pmc.ncbi.nlm.nih.gov') ||
                record.pdfUrl.includes('/servlets/purl')
              ))
            );
            if (!hasValidPdf) {
              continue;
            }
          }

          // Open access constraint validation
          if (filters.isOpenAccess) {
            if (record.isOpenAccess === false) {
              continue;
            }
          }

          // Publication type constraint validation
          if (filters.publicationType && filters.publicationType !== 'all') {
            const normType = normalizePublicationType(filters.publicationType);
            const recType = normalizePublicationType(record.publicationType);
            if (normType !== 'all' && recType !== 'all' && recType !== normType) {
              continue;
            }
          }

          const recordId = record._id || record.id;
          const doiKey = record.doi ? record.doi.toLowerCase().trim() : null;
          const cleanTitle = cleanTitleForMatching(record.title);
          const firstSurname = getFirstAuthorSurname(record.authors);
          const titleAuthorKey = cleanTitle.length >= 15 ? `${cleanTitle}_${firstSurname}` : null;

          // Find if there is an existing record in session
          let existing = null;
          if (doiKey && session.recordsByDoi.has(doiKey)) {
            existing = session.recordsByDoi.get(doiKey);
          } else if (recordId && session.recordsById.has(String(recordId))) {
            const cand = session.recordsById.get(String(recordId));
            if (!(cand && cand.doi && record.doi && cand.doi.toLowerCase().trim() !== record.doi.toLowerCase().trim())) {
              existing = cand;
            }
          } else if (titleAuthorKey && session.recordsByTitleAuthor.has(titleAuthorKey)) {
            const cand = session.recordsByTitleAuthor.get(titleAuthorKey);
            // Strict DOI integrity: Do NOT merge conflicting DOIs merely because normalized titles and surnames match
            if (!(cand && cand.doi && record.doi && cand.doi.toLowerCase().trim() !== record.doi.toLowerCase().trim())) {
              existing = cand;
            }
          }

          if (existing) {
            // Complementary merge into existing buffer record without shifting position
            const merged = mergeTwoRecords(existing, record);
            Object.assign(existing, merged);

            // Index newly discovered identifiers
            if (doiKey) session.recordsByDoi.set(doiKey, existing);
            if (recordId) session.recordsById.set(String(recordId), existing);
            if (titleAuthorKey) session.recordsByTitleAuthor.set(titleAuthorKey, existing);
          } else {
            // Brand new record
            session.buffer.push(record);
            newlyAddedCount++;

            if (doiKey) session.recordsByDoi.set(doiKey, record);
            if (recordId) session.recordsById.set(String(recordId), record);
            if (titleAuthorKey) session.recordsByTitleAuthor.set(titleAuthorKey, record);
          }
        }
      }
    }

    // Sort only unfrozen buffer records (records on already served pages are never moved)
    sortUnfrozenBuffer(session, sort, query, pageNum);

    // Check if any eligible provider still has items remaining
    const eligibleProviders = Object.entries(session.providerStates).filter(([key]) => isProviderEligible(key, filters));
    const anyEligibleHasMore = eligibleProviders.some(([_, p]) => p.hasMore);

    if (!anyEligibleHasMore) {
      session.allProvidersExhausted = true;
      break;
    }
  }

  // Calculate hasMore strictly from eligible providers and buffered records
  const eligibleProviders = Object.entries(session.providerStates).filter(([key]) => isProviderEligible(key, filters));
  const anyEligibleHasMore = !session.allProvidersExhausted && eligibleProviders.some(([_, p]) => p.hasMore);
  const hasMoreForClient = session.buffer.length > endIndex || anyEligibleHasMore;

  // Stable slice for the requested page
  const pageRecords = session.buffer.slice(startIndex, endIndex);

  // Freeze served boundary: records up to endIndex must never be re-ordered
  if (endIndex > (session.frozenIndex || 0)) {
    session.frozenIndex = Math.min(endIndex, session.buffer.length);
  }

  return {
    records: pageRecords,
    pagination: {
      page: pageNum,
      limit: limitNum,
      returnedCount: pageRecords.length,
      totalBuffered: session.buffer.length,
      hasMore: hasMoreForClient,
    },
    providerStatus: session.providerStatus,
    sessionId: session.id,
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Validates whether an incoming sessionId represents a currently valid, unexpired
 * session strictly matching the requested query contract and scope.
 */
function validateAndGetSession(sessionId, scope, query, filters, sort) {
  cleanupExpiredSessions();
  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, session: null };
  }
  const session = sessions.get(sessionId.trim());
  if (!session) {
    return { valid: false, session: null };
  }
  if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
    sessions.delete(sessionId.trim());
    return { valid: false, session: null };
  }
  const expectedHash = computeSessionHash(query, filters, sort);
  if (session.sessionHash !== expectedHash) {
    return { valid: false, session: null };
  }
  if (session.scope && scope && session.scope !== scope) {
    return { valid: false, session: null };
  }
  return { valid: true, session };
}

/**
 * Executes a session-buffered federated search
 * Guarantees that:
 * 1. Undisplayed papers are kept in the session buffer and never discarded.
 * 2. Deduplication is maintained across the entire search session with complementary fusion.
 * 3. Page boundaries are frozen so Page 1 order never shifts when Page 2 is refilled.
 * 4. Upstream provider cursors advance by raw count returned, not filtered count.
 * 5. Provider eligibility and hasMore are strictly calculated per active filters.
 * 6. Concurrent requests for the same session are queued safely via mutex.
 * 7. Server-issued session IDs are strictly validated without compound double-hashing.
 */
async function executeSearchSession(params) {
  cleanupExpiredSessions();

  const {
    query = '',
    filters = {},
    sort = 'relevance',
    explicitSessionId = null,
    scope = null,
  } = params;

  let session = null;
  if (explicitSessionId) {
    if (sessions.has(explicitSessionId)) {
      const validated = validateAndGetSession(explicitSessionId, scope, query, filters, sort);
      if (validated.valid) {
        session = validated.session;
      }
    } else {
      // First request initializing this session ID
      const sessionHash = computeSessionHash(query, filters, sort);
      session = createNewSession(explicitSessionId, scope, query, filters, sort, sessionHash);
    }
  }

  if (!session) {
    const sessionHash = computeSessionHash(query, filters, sort);
    const newSessionId = `sess_${crypto.randomBytes(12).toString('hex')}`;
    session = createNewSession(newSessionId, scope, query, filters, sort, sessionHash);
  }

  session.lastAccessedAt = Date.now();

  const releaseLock = await acquireSessionLock(session);
  try {
    return await executeSearchSessionLocked(session, params);
  } finally {
    releaseLock();
  }
}

module.exports = {
  executeSearchSession,
  computeSessionHash,
  validateAndGetSession,
  normalizePublicationType,
  cleanupExpiredSessions,
  normalizeSessionFilterKey,
  matchesInstitutionalAndAuthorFilters,
};
