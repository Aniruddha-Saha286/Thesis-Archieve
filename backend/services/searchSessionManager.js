const crypto = require('crypto');
const { searchLocal } = require('./providers/local');
const { searchOpenAlex } = require('./providers/openalex');
const { searchArxiv } = require('./providers/arxiv');
const { searchCrossref } = require('./providers/crossref');
const { searchEuropePmc } = require('./providers/europePmc');
const { searchHal } = require('./providers/hal');
const { searchDoaj } = require('./providers/doaj');
const { searchSemanticScholar } = require('./providers/semanticScholar');
const { searchOpenAire } = require('./providers/openaire');
const { mergeTwoRecords, cleanTitleForMatching, getFirstAuthorSurname } = require('./deduplicator');
const { mapToCanonicalSubject, getSubjectById } = require('./subjectCatalog');
const { CURATED_INSTITUTIONS } = require('./institutionService');
const { resolveCountryCode } = require('./countryResolver');
const sessionStore = require('./sessionStore');

const PROVIDER_NAMES = {
  local: 'Local Archive',
  openalex: 'OpenAlex',
  arxiv: 'arXiv',
  crossref: 'Crossref',
  europepmc: 'Europe PMC',
  hal: 'HAL Open Science',
  doaj: 'DOAJ',
  semanticscholar: 'Semantic Scholar',
  openaire: 'OpenAIRE',
};

const PROVIDER_CAPABILITIES = {
  local: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: true,
    supportsCountry: true,
    supportsAuthor: true,
    supportsSubject: true,
    supportsField: true,
    supportsPublisher: true,
    supportsMinCitations: false,
    supportsAwardingInstitution: true,
  },
  openalex: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: true,
    supportsCountry: true,
    supportsAuthor: true,
    supportsSubject: true,
    supportsField: true,
    supportsPublisher: true,
    supportsMinCitations: true,
    supportsAwardingInstitution: false,
  },
  arxiv: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: false,
    supportsCountry: false,
    supportsAuthor: false,
    supportsSubject: false,
    supportsField: false,
    supportsPublisher: false,
    supportsMinCitations: false,
    supportsAwardingInstitution: false,
  },
  crossref: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: false,
    supportsCountry: false,
    supportsAuthor: false,
    supportsSubject: false,
    supportsField: false,
    supportsPublisher: true,
    supportsMinCitations: false,
    supportsAwardingInstitution: false,
  },
  europepmc: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: false,
    supportsCountry: false,
    supportsAuthor: false,
    supportsSubject: false,
    supportsField: false,
    supportsPublisher: false,
    supportsMinCitations: false,
    supportsAwardingInstitution: false,
  },
  hal: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: false,
    supportsCountry: false,
    supportsAuthor: false,
    supportsSubject: false,
    supportsField: false,
    supportsPublisher: false,
    supportsMinCitations: false,
    supportsAwardingInstitution: false,
  },
  doaj: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: false,
    supportsCountry: false,
    supportsAuthor: false,
    supportsSubject: false,
    supportsField: false,
    supportsPublisher: false,
    supportsMinCitations: false,
    supportsAwardingInstitution: false,
  },
  semanticscholar: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: false,
    supportsCountry: false,
    supportsAuthor: false,
    supportsSubject: false,
    supportsField: false,
    supportsPublisher: false,
    supportsMinCitations: true,
    supportsAwardingInstitution: false,
  },
  openaire: {
    supportsQuery: true,
    supportsYear: true,
    supportsPubType: true,
    supportsPdf: true,
    supportsOpenAccess: true,
    supportsInstitution: false,
    supportsCountry: false,
    supportsAuthor: false,
    supportsSubject: false,
    supportsField: false,
    supportsPublisher: false,
    supportsMinCitations: false,
    supportsAwardingInstitution: false,
  },
};

const CURATED_BY_ID = new Map(
  CURATED_INSTITUTIONS.map((c) => [c.id.toLowerCase(), c])
);

function instMatchesTarget(candidateId, candidateName, targetInstId, targetInstName) {
  const cId = candidateId ? String(candidateId).split('/').pop().toLowerCase().trim() : '';
  const cName = (candidateName || '').toLowerCase().trim();
  const tId = targetInstId ? String(targetInstId).split('/').pop().toLowerCase().trim() : '';
  const tName = (targetInstName || '').toLowerCase().trim();

  // If both target inputs are empty, no filter
  if (!tId && !tName) return false;
  // If both candidate inputs are empty, candidate cannot match
  if (!cId && !cName) return false;

  // Conflicting canonical OpenAlex IDs MUST reject immediately!
  if (cId && tId && cId.startsWith('i') && tId.startsWith('i') && cId !== tId) {
    return false;
  }

  // 1. Direct ID match
  if (tId && cId && tId === cId) return true;

  // 2. Direct name match
  if (tName && cName) {
    if (cName === tName) return true;
    if (tName.length >= 4 && (cName.includes(tName) || tName.includes(cName))) return true;
  }

  // 3. Curated institution resolution (match against name or aliases)
  if (tId && CURATED_BY_ID.has(tId)) {
    const cur = CURATED_BY_ID.get(tId);
    const curName = cur.name.toLowerCase();
    if (cName && (cName === curName || (cName.length >= 4 && (cName.includes(curName) || curName.includes(cName))))) return true;
    if (Array.isArray(cur.aliases) && cName) {
      for (const al of cur.aliases) {
        const alLower = al.toLowerCase();
        if (cName === alLower || (alLower.length >= 4 && cName.includes(alLower))) return true;
      }
    }
  }

  // 4. If targetInstId was passed as a name
  if (tId && !tId.startsWith('i') && cName && cName.length >= 4 && (cName.includes(tId) || tId.includes(cName))) return true;

  return false;
}

function cleanPublisherForMatching(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/b\.v\./gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\b(inc|incorporated|ltd|limited|llc|co|corp|corporation|press|publishing|publishers?|group|bv|academic)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesPublisherFilter(record, filterPublisher) {
  if (!filterPublisher || !filterPublisher.trim()) return true;
  if (!record || !record.publisher) return false;

  const targetClean = cleanPublisherForMatching(filterPublisher);
  const candClean = cleanPublisherForMatching(record.publisher);

  if (!targetClean || !candClean) return false;

  if (candClean === targetClean) return true;
  if (candClean.includes(targetClean) || targetClean.includes(candClean)) return true;

  const targetTokens = targetClean.split(' ').filter((w) => w.length > 2);
  if (targetTokens.length > 0 && targetTokens.every((t) => candClean.includes(t))) {
    return true;
  }

  return false;
}

// Bounded in-memory search session cache (30-minute TTL, linked to sessionStore)
const sessions = sessionStore.inMemorySessions;
const SESSION_TTL_MS = sessionStore.SESSION_TTL_MS;
const MAX_SESSIONS = 250;

function cleanupExpiredSessions() {
  sessionStore.cleanupExpiredInMemory();
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
    fieldId: filters.fieldId ? String(filters.fieldId).trim().toLowerCase() : '',
    yearMin: filters.yearMin ? String(filters.yearMin) : '',
    yearMax: filters.yearMax ? String(filters.yearMax) : '',
    publisher: filters.publisher ? filters.publisher.trim().toLowerCase() : '',
    source: filters.source ? filters.source.trim().toLowerCase() : '',
    institutionId: filters.institutionId ? String(filters.institutionId).trim().split('/').pop() : '',
    institutionName: filters.institutionName ? String(filters.institutionName).trim().toLowerCase() : '',
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
  const instName = filters.institutionName ? String(filters.institutionName).trim().toLowerCase() : null;
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
    if (instId || instName) {
      const authorAtInst = matchingAuthorships.some((a) =>
        (a.institutions || []).some((inst) =>
          instMatchesTarget(inst.id, inst.name, instId, instName)
        )
      );
      if (!authorAtInst) {
        return false;
      }
    }

    // If country is specified alongside author: author's institution must match the country
    if (targetCountries.length > 0) {
      const authorInCountry = matchingAuthorships.some((a) =>
        (a.institutions || []).some((inst) => {
          const cCode = inst.countryCode || resolveCountryCode(inst.name || a.rawAffiliation);
          return cCode && targetCountries.includes(cCode);
        })
      );
      if (!authorInCountry) {
        return false;
      }
    }
  }

  // 2. Institution Filter Constraint (when author not specified or already passed)
  if (instId || instName) {
    if (instMode === 'awarding') {
      const awardId = record.awardingInstitution?.id ? String(record.awardingInstitution.id).split('/').pop().toLowerCase() : '';
      const awardName = (record.awardingInstitution?.name || (record.publicationType === 'thesis' ? record.university : '') || '').toLowerCase();
      const matchAward = instMatchesTarget(awardId, awardName, instId, instName);
      if (!matchAward) return false;

      if (targetCountries.length > 0) {
        const awardCountry = record.awardingInstitution?.countryCode || resolveCountryCode(record.awardingInstitution?.name || record.university);
        if (!awardCountry || !targetCountries.includes(awardCountry)) {
          return false;
        }
      }
    } else {
      const matchingInsts = [];
      for (const a of record.authorships || []) {
        for (const inst of a.institutions || []) {
          if (instMatchesTarget(inst.id, inst.name, instId, instName)) {
            matchingInsts.push(inst);
          }
        }
      }

      if (matchingInsts.length === 0) {
        const uniName = (record.university || '').toLowerCase();
        if (!instMatchesTarget(null, uniName, instId, instName)) {
          return false;
        }
      }

      // Coauthor isolation & institution country conjunction:
      if (targetCountries.length > 0) {
        if (matchingInsts.length > 0) {
          const hasCountryMatch = matchingInsts.some((inst) => {
            const cCode = inst.countryCode || resolveCountryCode(inst.name);
            return cCode && targetCountries.includes(cCode);
          });
          if (!hasCountryMatch) {
            return false;
          }
        } else {
          const uniCountry = resolveCountryCode(record.university);
          if (!uniCountry || !targetCountries.includes(uniCountry)) {
            return false;
          }
        }
      }
    }
  } else if (targetCountries.length > 0 && !authorId) {
    // Country filter alone
    let hasCountry = false;
    for (const a of record.authorships || []) {
      for (const inst of a.institutions || []) {
        const cCode = inst.countryCode || resolveCountryCode(inst.name || a.rawAffiliation);
        if (cCode && targetCountries.includes(cCode)) {
          hasCountry = true;
          break;
        }
      }
      if (hasCountry) break;
    }
    if (!hasCountry && record.awardingInstitution) {
      const awardCountry = record.awardingInstitution.countryCode || resolveCountryCode(record.awardingInstitution.name || record.university);
      if (awardCountry && targetCountries.includes(awardCountry)) {
        hasCountry = true;
      }
    }
    if (!hasCountry && record.university) {
      const uniCountry = resolveCountryCode(record.university);
      if (uniCountry && targetCountries.includes(uniCountry)) {
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
  const targetSubId = filters.subjectId
    ? String(filters.subjectId).trim().toLowerCase()
    : (filters.category && filters.category !== 'All Disciplines' ? mapToCanonicalSubject(filters.category)?.id : null);

  if (targetSubId) {
    const hasSub = (record.subjects || []).some((s) => s.id && s.id.toLowerCase() === targetSubId);
    if (!hasSub) {
      const mappedSub = mapToCanonicalSubject(record.category);
      const mappedTitle = record.title ? mapToCanonicalSubject(record.title) : null;
      const mappedAbstract = record.abstract ? mapToCanonicalSubject(record.abstract.slice(0, 1000)) : null;
      const matchesCategory = mappedSub && mappedSub.id === targetSubId;
      const matchesTitle = mappedTitle && mappedTitle.id === targetSubId;
      const matchesAbstract = mappedAbstract && mappedAbstract.id === targetSubId;
      if (!matchesCategory && !matchesTitle && !matchesAbstract) {
        return false;
      }
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

function isProviderEligible(pKey, filters = {}, query = '') {
  const caps = PROVIDER_CAPABILITIES[pKey];
  if (!caps) return false;

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

  // Structured academic filter constraints
  const hasInst = Boolean(filters.institutionId || filters.institutionName);
  const hasCountry = Boolean(filters.countryCodes && filters.countryCodes.length > 0);
  const hasAuthorId = Boolean(filters.authorId);
  const hasSubject = Boolean(filters.subjectId);
  const hasField = Boolean(filters.fieldId);
  const hasPublisher = Boolean(filters.publisher && filters.publisher.trim());
  const hasMinCitations = Boolean(filters.minCitations && parseInt(filters.minCitations, 10) > 0);
  const isAwarding = filters.institutionMode === 'awarding';

  // In awarding institution mode, only Local Archive holds verified degree-awarding metadata
  if (isAwarding && hasInst && !caps.supportsAwardingInstitution) {
    return false;
  }

  // When a search query is provided (e.g. "golam rabiul"), aggregators (Crossref, Europe PMC, etc.)
  // should NOT be blocked upfront. They return relevant candidate records whose affiliations
  // and metadata are then accurately validated in the buffer dedup post-filter.
  const hasQuery = Boolean(query && String(query).trim());

  if (hasInst && !caps.supportsInstitution && !hasQuery) return false;
  if (hasCountry && !caps.supportsCountry && !hasQuery) return false;
  if (hasAuthorId && !caps.supportsAuthor && !hasQuery) return false;
  if (hasMinCitations && !caps.supportsMinCitations && !hasQuery) return false;

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
      semanticscholar: { offset: 0, hasMore: true, status: 'fulfilled', count: 0 },
      openaire: { page: 1, hasMore: true, status: 'fulfilled', count: 0 },
    },
    pageBoundaries: new Map(),
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

  let startIndex = 0;
  if (pageNum === 1) {
    startIndex = 0;
  } else if (session.pageBoundaries && session.pageBoundaries.has(pageNum - 1)) {
    startIndex = session.pageBoundaries.get(pageNum - 1).end;
  } else {
    startIndex = (pageNum - 1) * limitNum;
  }
  const targetEndIndex = startIndex + limitNum;

  // Buffer Refill Loop: fetch until we have enough records to cover targetEndIndex, or all eligible providers are exhausted
  let refillAttempts = 0;
  const MAX_REFILL_ATTEMPTS = 5;

  // When a discipline filter is active but no user query was typed, build a
  // keyword-based query for providers that lack native subject/field filtering.
  // This replaces their generic "research" fallback with discipline-specific terms,
  // dramatically improving the yield of the post-filter.
  let subjectAugmentedQuery = query;
  if (!query || !query.trim()) {
    const sub = filters.subjectId ? getSubjectById(filters.subjectId) : null;
    if (sub && sub.keywords && sub.keywords.length > 0) {
      // Use the first two keywords for breadth without over-narrowing
      subjectAugmentedQuery = sub.keywords.slice(0, 2).join(' ');
    } else if (filters.category && filters.category !== 'All Disciplines') {
      // Fallback: use the raw category label as a search term
      subjectAugmentedQuery = filters.category;
    }
  }

  while (session.buffer.length < targetEndIndex && !session.allProvidersExhausted && refillAttempts < MAX_REFILL_ATTEMPTS) {
    refillAttempts++;
    const fetchPromises = [];

    // Local MongoDB
    if (isProviderEligible('local', filters, query) && session.providerStates.local.hasMore) {
      const curOffset = session.providerStates.local.offset || 0;
      const localLimit = Math.max(limitNum, 20);
      fetchPromises.push(
        searchLocal({ query, offset: curOffset, limit: localLimit, filters, sort })
          .then((res) => ({ name: 'Local Archive', key: 'local', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'Local Archive', key: 'local', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // OpenAlex
    if (isProviderEligible('openalex', filters, query) && session.providerStates.openalex.hasMore) {
      const curPage = session.providerStates.openalex.page || 1;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchOpenAlex({ query, page: curPage, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'OpenAlex', key: 'openalex', ...res, nextPage: curPage + 1 }))
          .catch((err) => ({ name: 'OpenAlex', key: 'openalex', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // arXiv
    if (isProviderEligible('arxiv', filters, subjectAugmentedQuery) && session.providerStates.arxiv.hasMore) {
      const curOffset = session.providerStates.arxiv.offset || 0;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchArxiv({ query: subjectAugmentedQuery, offset: curOffset, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'arXiv', key: 'arxiv', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'arXiv', key: 'arxiv', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // Crossref
    if (isProviderEligible('crossref', filters, subjectAugmentedQuery) && session.providerStates.crossref.hasMore) {
      const curOffset = session.providerStates.crossref.offset || 0;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchCrossref({ query: subjectAugmentedQuery, offset: curOffset, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'Crossref', key: 'crossref', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'Crossref', key: 'crossref', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // Europe PMC
    if (isProviderEligible('europepmc', filters, subjectAugmentedQuery) && session.providerStates.europepmc.hasMore) {
      const curPage = session.providerStates.europepmc.page || 1;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchEuropePmc({ query: subjectAugmentedQuery, page: curPage, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'Europe PMC', key: 'europepmc', ...res, nextPage: curPage + 1 }))
          .catch((err) => ({ name: 'Europe PMC', key: 'europepmc', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // HAL Open Science
    if (isProviderEligible('hal', filters, subjectAugmentedQuery) && session.providerStates.hal.hasMore) {
      const curOffset = session.providerStates.hal.offset || 0;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchHal({ query: subjectAugmentedQuery, offset: curOffset, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'HAL Open Science', key: 'hal', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'HAL Open Science', key: 'hal', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // DOAJ
    if (isProviderEligible('doaj', filters, subjectAugmentedQuery) && session.providerStates.doaj.hasMore) {
      const curPage = session.providerStates.doaj.page || 1;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchDoaj({ query: subjectAugmentedQuery, page: curPage, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'DOAJ', key: 'doaj', ...res, nextPage: curPage + 1 }))
          .catch((err) => ({ name: 'DOAJ', key: 'doaj', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // Semantic Scholar
    if (isProviderEligible('semanticscholar', filters, subjectAugmentedQuery) && session.providerStates.semanticscholar.hasMore) {
      const curOffset = session.providerStates.semanticscholar.offset || 0;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchSemanticScholar({ query: subjectAugmentedQuery, offset: curOffset, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'Semantic Scholar', key: 'semanticscholar', ...res, nextOffset: curOffset + (res.rawCount ?? res.records?.length ?? 0) }))
          .catch((err) => ({ name: 'Semantic Scholar', key: 'semanticscholar', records: [], rawCount: 0, hasMore: false, error: err.message }))
      );
    }

    // OpenAIRE
    if (isProviderEligible('openaire', filters, subjectAugmentedQuery) && session.providerStates.openaire.hasMore) {
      const curPage = session.providerStates.openaire.page || 1;
      const batchSize = Math.max(limitNum, 20);
      fetchPromises.push(
        searchOpenAire({ query: subjectAugmentedQuery, page: curPage, limit: batchSize, filters, sort })
          .then((res) => ({ name: 'OpenAIRE', key: 'openaire', ...res, nextPage: curPage + 1 }))
          .catch((err) => ({ name: 'OpenAIRE', key: 'openaire', records: [], rawCount: 0, hasMore: false, error: err.message }))
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

      if (isErr) {
        provState.failureCount = (provState.failureCount || 0) + 1;
        // Allow retry on transient failure up to 2 attempts before marking exhausted
        provState.hasMore = provState.failureCount < 2;
        provState.status = 'degraded';
      } else {
        provState.hasMore = Boolean(res.hasMore);
        provState.status = 'fulfilled';
        provState.failureCount = 0;
        if (res.nextPage !== undefined) provState.page = res.nextPage;
        if (res.nextOffset !== undefined) provState.offset = res.nextOffset;
      }
      session.providerStates[pKey] = provState;

      let acceptedFromProvider = 0;

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
          const loopTargetSubId = filters.subjectId
            ? String(filters.subjectId).trim().toLowerCase()
            : (filters.category && filters.category !== 'All Disciplines' ? mapToCanonicalSubject(filters.category)?.id : null);

          if (loopTargetSubId) {
            const hasSub = (record.subjects || []).some((s) => s.id && s.id.toLowerCase() === loopTargetSubId);
            if (!hasSub) {
              const mappedFromCategory = mapToCanonicalSubject(record.category);
              const mappedFromTitle = mapToCanonicalSubject(record.title);
              const mappedFromAbstract = record.abstract ? mapToCanonicalSubject(record.abstract.slice(0, 1000)) : null;
              const categoryMatch = mappedFromCategory && mappedFromCategory.id === loopTargetSubId;
              const titleMatch = mappedFromTitle && mappedFromTitle.id === loopTargetSubId;
              const abstractMatch = mappedFromAbstract && mappedFromAbstract.id === loopTargetSubId;
              if (!categoryMatch && !titleMatch && !abstractMatch) {
                continue;
              }
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

          // Publisher constraint validation
          if (filters.publisher && !matchesPublisherFilter(record, filters.publisher)) {
            continue;
          }

          // Broad Field constraint validation
          if (filters.fieldId) {
            const targetFieldId = String(filters.fieldId).trim().split('/').pop();
            const hasField = (record.subjects || []).some((s) => {
              if (s.fieldId && String(s.fieldId).split('/').pop() === targetFieldId) return true;
              const catSub = getSubjectById(s.id);
              return catSub && String(catSub.openAlexFieldId) === targetFieldId;
            }) || (record.fieldId && String(record.fieldId).split('/').pop() === targetFieldId);
            const mappedSub = mapToCanonicalSubject(record.category);
            const mappedMatch = mappedSub && String(mappedSub.openAlexFieldId) === targetFieldId;
            if (!hasField && !mappedMatch) {
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
            acceptedFromProvider++;

            // Index newly discovered identifiers
            if (doiKey) session.recordsByDoi.set(doiKey, existing);
            if (recordId) session.recordsById.set(String(recordId), existing);
            if (titleAuthorKey) session.recordsByTitleAuthor.set(titleAuthorKey, existing);
          } else {
            // Brand new record
            session.buffer.push(record);
            newlyAddedCount++;
            acceptedFromProvider++;

            if (doiKey) session.recordsByDoi.set(doiKey, record);
            if (recordId) session.recordsById.set(String(recordId), record);
            if (titleAuthorKey) session.recordsByTitleAuthor.set(titleAuthorKey, record);
          }
        }
      }

      session.providerStatus[res.name] = {
        status: provStatus,
        count: (session.providerStatus[res.name]?.count || 0) + acceptedFromProvider,
        returnedCount: (session.providerStatus[res.name]?.returnedCount || 0) + acceptedFromProvider,
        rawCount: (session.providerStatus[res.name]?.rawCount || 0) + (res.records?.length || 0),
        total: res.totalCount || 0,
        totalAvailable: res.totalCount || 0,
        hasMore: Boolean(res.hasMore),
        error: res.error || null,
      };
    }

    // Sort only unfrozen buffer records (records on already served pages are never moved)
    sortUnfrozenBuffer(session, sort, query, pageNum);

    // Check if any eligible provider still has items remaining
    const eligibleProviders = Object.entries(session.providerStates).filter(([key]) => isProviderEligible(key, filters, subjectAugmentedQuery));
    const anyEligibleHasMore = eligibleProviders.some(([_, p]) => p.hasMore);

    if (!anyEligibleHasMore) {
      session.allProvidersExhausted = true;
      break;
    }
  }

  // Calculate hasMore strictly from eligible providers and buffered records
  const eligibleProviders = Object.entries(session.providerStates).filter(([key]) => isProviderEligible(key, filters, subjectAugmentedQuery));
  const anyEligibleHasMore = !session.allProvidersExhausted && eligibleProviders.some(([_, p]) => p.hasMore);
  const hasMoreForClient = session.buffer.length > targetEndIndex || anyEligibleHasMore;

  // Stable slice for the requested page
  const pageRecords = session.buffer.slice(startIndex, targetEndIndex);

  // Record actual served boundary for continuous pagination without record loss
  if (!session.pageBoundaries) session.pageBoundaries = new Map();
  session.pageBoundaries.set(pageNum, {
    start: startIndex,
    count: pageRecords.length,
    end: startIndex + pageRecords.length,
  });

  // Freeze served boundary: records up to served boundary must never be re-ordered
  session.frozenIndex = Math.max(session.frozenIndex || 0, startIndex + pageRecords.length);

  // Ensure honest provider telemetry status for all known federated providers
  for (const [pKey, pName] of Object.entries(PROVIDER_NAMES)) {
    if (!session.providerStatus[pName]) {
      const eligible = isProviderEligible(pKey, filters, subjectAugmentedQuery);
      session.providerStatus[pName] = {
        status: eligible ? 'idle' : 'skipped_unsupported_filter',
        count: 0,
        returnedCount: 0,
        total: 0,
        totalAvailable: 0,
        hasMore: false,
        error: null,
      };
    }
  }

  // Assess federated execution health: total technical failure vs partial results
  const queriedProviders = Object.entries(session.providerStatus).filter(
    ([_, st]) => st.status !== 'skipped_unsupported_filter' && st.status !== 'idle'
  );
  const remoteQueried = queriedProviders.filter(([pName]) => pName !== 'Local Archive');
  const allRemoteFailed = remoteQueried.length > 0 && remoteQueried.every(
    ([_, st]) => Boolean(st.error) || st.status === 'degraded' || st.status === 'error'
  );
  const allQueriedFailed = queriedProviders.length > 0 && queriedProviders.every(
    ([_, st]) => Boolean(st.error) || st.status === 'degraded' || st.status === 'error'
  );
  const totalTechnicalFailure = session.buffer.length === 0 && (allQueriedFailed || allRemoteFailed);

  const anyQueriedFailed = queriedProviders.some(
    ([_, st]) => Boolean(st.error) || st.status === 'degraded' || st.status === 'error'
  );
  const partialResults = anyQueriedFailed && session.buffer.length > 0;

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
    totalTechnicalFailure,
    partialResults,
    retrievedAt: new Date().toISOString(),
  };
}

/**
 * Synchronous session validation from local memory cache
 */
function validateAndGetSessionSync(sessionId, scope, query, filters, sort) {
  cleanupExpiredSessions();
  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, session: null };
  }
  const cleanId = sessionId.trim();
  const session = sessions.get(cleanId);
  if (!session) {
    return { valid: false, session: null };
  }
  if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
    sessions.delete(cleanId);
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
 * Asynchronous session validation supporting both in-memory cache and L2 MongoDB persistence
 */
async function validateAndGetSession(sessionId, scope, query, filters, sort) {
  cleanupExpiredSessions();
  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, session: null };
  }
  const cleanId = sessionId.trim();
  let session = sessions.get(cleanId);
  if (!session) {
    session = await sessionStore.getSession(cleanId);
  }
  if (!session) {
    return { valid: false, session: null };
  }
  if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
    sessions.delete(cleanId);
    await sessionStore.deleteSession(cleanId);
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
    const validated = await validateAndGetSession(explicitSessionId, scope, query, filters, sort);
    if (validated.valid) {
      session = validated.session;
    } else {
      // First request initializing this session ID
      const sessionHash = computeSessionHash(query, filters, sort);
      session = createNewSession(explicitSessionId, scope, query, filters, sort, sessionHash);
      await sessionStore.saveSession(session);
    }
  }

  if (!session) {
    const sessionHash = computeSessionHash(query, filters, sort);
    const newSessionId = `sess_${crypto.randomBytes(12).toString('hex')}`;
    session = createNewSession(newSessionId, scope, query, filters, sort, sessionHash);
    await sessionStore.saveSession(session);
  }

  session.lastAccessedAt = Date.now();

  const releaseLock = await acquireSessionLock(session);
  try {
    const searchResult = await executeSearchSessionLocked(session, params);
    await sessionStore.saveSession(session);
    return searchResult;
  } finally {
    releaseLock();
  }
}

module.exports = {
  executeSearchSession,
  computeSessionHash,
  validateAndGetSession,
  validateAndGetSessionSync,
  normalizePublicationType,
  cleanupExpiredSessions,
  normalizeSessionFilterKey,
  matchesInstitutionalAndAuthorFilters,
  instMatchesTarget,
  matchesPublisherFilter,
  cleanPublisherForMatching,
  PROVIDER_CAPABILITIES,
  PROVIDER_NAMES,
};
