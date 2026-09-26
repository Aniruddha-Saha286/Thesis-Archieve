/**
 * Canonical Query Parser & Validator for Thesis Search Endpoint
 * GET /api/thesis
 * 
 * Enforces strict typing, length limits, enum validation, range checks,
 * and produces a single normalized filter representation.
 */

const { SUBJECT_CATALOG, getSubjectById } = require('./subjectCatalog');

const ALLOWED_PUBLICATION_TYPES = new Set([
  'all',
  'journal-article',
  'conference-paper',
  'thesis',
  'dissertation',
  'preprint',
  'book',
  'dataset',
  'article', // legacy alias
  'proceedings', // legacy alias
]);

const ALLOWED_SORT_ORDERS = new Set([
  'relevance',
  'citations',
  'newest',
]);

const ALLOWED_INSTITUTION_MODES = new Set([
  'affiliation',
  'awarding',
]);

// Standard ISO-3166-1 alpha-2 country codes regex (two uppercase letters)
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;

function normalizePublicationType(type) {
  if (!type || type === 'all') return 'all';
  const t = String(type).trim().toLowerCase();
  if (t === 'article') return 'journal-article';
  if (t === 'proceedings') return 'conference-paper';
  return t;
}

function parseStrictBoolean(val) {
  if (val === true || val === 'true') return true;
  if (val === false || val === 'false') return false;
  return null;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates and normalizes raw query parameters from GET /api/thesis
 * Returns { valid: true, parsed: { ... } } or { valid: false, status: 400, code, message }
 */
function parseAndValidateThesisQuery(rawQuery = {}) {
  const {
    search,
    query,
    page = 1,
    limit = 20,
    category,
    subjectId,
    fieldId,
    publicationType,
    yearMin,
    yearMax,
    hasPdf,
    isOpenAccess,
    source,
    publisher,
    institutionId,
    institutionName,
    institutionMode,
    countryCodes,
    countryCode,
    countries,
    authorId,
    minCitations,
    sort = 'relevance',
    sessionId,
    searchContextId,
    searchActionId,
  } = rawQuery;

  // 1. Search text
  const rawSearch = search !== undefined ? search : query;
  const searchTerm = typeof rawSearch === 'string' ? rawSearch.trim().slice(0, 250) : '';

  // 2. Pagination (clamped limit, integer page)
  const parsedPage = parseInt(page, 10);
  if (isNaN(parsedPage) || parsedPage < 1) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_PAGE',
      message: 'Page parameter must be a positive integer greater than or equal to 1.',
    };
  }
  const cleanPage = parsedPage;

  const parsedLimit = parseInt(limit, 10);
  const cleanLimit = isNaN(parsedLimit)
    ? 20
    : Math.min(50, Math.max(1, parsedLimit));

  // 3. Sort Order
  const cleanSort = String(sort || 'relevance').trim().toLowerCase();
  if (!ALLOWED_SORT_ORDERS.has(cleanSort)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_SORT_ORDER',
      message: `Sort order "${sort}" is invalid. Allowed values: ${Array.from(ALLOWED_SORT_ORDERS).join(', ')}.`,
    };
  }

  // 4. Publication Type
  let cleanPubType = 'all';
  if (publicationType && String(publicationType).trim() !== 'all') {
    const rawPub = String(publicationType).trim().toLowerCase();
    if (!ALLOWED_PUBLICATION_TYPES.has(rawPub)) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_PUBLICATION_TYPE',
        message: `Publication type "${publicationType}" is invalid. Allowed values: all, journal-article, conference-paper, thesis, dissertation, preprint, book.`,
      };
    }
    cleanPubType = normalizePublicationType(rawPub);
  }

  // 5. Year Range Validation (strictly 4-digit years 1800 <= year <= currentYear + 5)
  const currentYear = new Date().getFullYear();
  let cleanYearMin = null;
  let cleanYearMax = null;

  if (yearMin !== undefined && yearMin !== null && String(yearMin).trim() !== '') {
    const strMin = String(yearMin).trim();
    if (!/^\d{4}$/.test(strMin)) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_YEAR',
        message: `yearMin must be a valid 4-digit year between 1800 and ${currentYear + 5}. Received "${yearMin}".`,
      };
    }
    const valMin = parseInt(strMin, 10);
    if (valMin < 1800 || valMin > currentYear + 5) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_YEAR',
        message: `yearMin must be between 1800 and ${currentYear + 5}. Received "${yearMin}".`,
      };
    }
    cleanYearMin = String(valMin);
  }

  if (yearMax !== undefined && yearMax !== null && String(yearMax).trim() !== '') {
    const strMax = String(yearMax).trim();
    if (!/^\d{4}$/.test(strMax)) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_YEAR',
        message: `yearMax must be a valid 4-digit year between 1800 and ${currentYear + 5}. Received "${yearMax}".`,
      };
    }
    const valMax = parseInt(strMax, 10);
    if (valMax < 1800 || valMax > currentYear + 5) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_YEAR',
        message: `yearMax must be between 1800 and ${currentYear + 5}. Received "${yearMax}".`,
      };
    }
    cleanYearMax = String(valMax);
  }

  if (cleanYearMin && cleanYearMax && parseInt(cleanYearMin, 10) > parseInt(cleanYearMax, 10)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_YEAR_RANGE',
      message: `yearMin (${cleanYearMin}) cannot be greater than yearMax (${cleanYearMax}).`,
    };
  }

  // 6. Strict Booleans
  const cleanHasPdf = parseStrictBoolean(hasPdf) === true;
  const cleanIsOpenAccess = parseStrictBoolean(isOpenAccess) === true;

  // 7. Discipline & Subject
  let cleanCategory = null;
  if (category && typeof category === 'string' && category.trim() !== 'All Disciplines') {
    cleanCategory = category.trim().slice(0, 100);
  }

  let cleanSubjectId = null;
  if (subjectId && typeof subjectId === 'string' && subjectId.trim()) {
    const subTrim = subjectId.trim().toLowerCase();
    if (!/^[a-z0-9-_]{2,50}$/.test(subTrim)) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_SUBJECT_ID',
        message: `subjectId "${subjectId}" is malformed. Expected alphanumeric slug.`,
      };
    }
    cleanSubjectId = subTrim;
  }

  // 8. Broad Field ID
  let cleanFieldId = null;
  if (fieldId && typeof fieldId === 'string' && fieldId.trim()) {
    const rawF = fieldId.trim().split('/').pop();
    if (!/^\d{1,10}$/.test(rawF)) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_FIELD_ID',
        message: `fieldId "${fieldId}" is malformed. Expected numeric OpenAlex field ID.`,
      };
    }
    cleanFieldId = rawF;
  }

  // 9. Institution
  let cleanInstitutionId = null;
  if (institutionId && typeof institutionId === 'string' && institutionId.trim()) {
    const rawInst = institutionId.trim().split('/').pop();
    if (!/^[A-Za-z0-9-_]{2,50}$/.test(rawInst)) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_INSTITUTION_ID',
        message: `institutionId "${institutionId}" contains invalid characters.`,
      };
    }
    cleanInstitutionId = rawInst;
  }

  const cleanInstitutionName = typeof institutionName === 'string'
    ? institutionName.trim().slice(0, 200)
    : null;

  const rawInstMode = String(institutionMode || 'affiliation').trim().toLowerCase();
  if (!ALLOWED_INSTITUTION_MODES.has(rawInstMode)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_INSTITUTION_MODE',
      message: `institutionMode "${institutionMode}" is invalid. Allowed: affiliation, awarding.`,
    };
  }
  const cleanInstitutionMode = rawInstMode;

  // 10. Country Codes (ISO-3166 alpha-2)
  const rawCountryParam = countryCodes !== undefined ? countryCodes : (countryCode !== undefined ? countryCode : countries);
  let cleanCountryCodes = [];

  if (rawCountryParam) {
    let candidates = [];
    if (Array.isArray(rawCountryParam)) {
      candidates = rawCountryParam.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    } else if (typeof rawCountryParam === 'string' && rawCountryParam.trim()) {
      candidates = rawCountryParam.split(/[,|]/).map((c) => c.trim().toUpperCase()).filter(Boolean);
    }

    for (const code of candidates) {
      if (!ISO_COUNTRY_REGEX.test(code)) {
        return {
          valid: false,
          status: 400,
          code: 'INVALID_COUNTRY_CODE',
          message: `Country code "${code}" is invalid. Expected 2-letter ISO-3166 alpha-2 code (e.g. BD, US, GB).`,
        };
      }
      cleanCountryCodes.push(code);
    }
    cleanCountryCodes = Array.from(new Set(cleanCountryCodes)).sort();
  }

  // 11. Author
  let cleanAuthorId = null;
  if (authorId && typeof authorId === 'string' && authorId.trim()) {
    const rawA = authorId.trim().split('/').pop();
    if (!/^[A-Za-z0-9-_]{2,50}$/.test(rawA)) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_AUTHOR_ID',
        message: `authorId "${authorId}" contains invalid characters.`,
      };
    }
    cleanAuthorId = rawA;
  }

  // 12. Minimum Citations
  let cleanMinCitations = null;
  if (minCitations !== undefined && minCitations !== null && String(minCitations).trim() !== '') {
    const parsedMinC = parseInt(String(minCitations).trim(), 10);
    if (isNaN(parsedMinC) || parsedMinC < 0 || parsedMinC > 1000000) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_MIN_CITATIONS',
        message: `minCitations must be a non-negative integer up to 1,000,000. Received "${minCitations}".`,
      };
    }
    cleanMinCitations = parsedMinC;
  }

  // 13. Publisher & Source
  const cleanPublisher = typeof publisher === 'string' ? publisher.trim().slice(0, 200) : null;
  const cleanSource = typeof source === 'string' ? source.trim().slice(0, 100) : null;

  // 14. Session / Context Tracking
  const cleanSessionId = typeof sessionId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(sessionId.trim())
    ? sessionId.trim()
    : null;
  const cleanContextId = typeof searchContextId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(searchContextId.trim())
    ? searchContextId.trim()
    : (typeof searchActionId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(searchActionId.trim()) ? searchActionId.trim() : null);

  // Build canonical normalized filters object
  const filters = {};
  if (cleanCategory) filters.category = cleanCategory;
  if (cleanSubjectId) filters.subjectId = cleanSubjectId;
  if (cleanFieldId) filters.fieldId = cleanFieldId;
  if (cleanPubType !== 'all') filters.publicationType = cleanPubType;
  if (cleanYearMin) filters.yearMin = cleanYearMin;
  if (cleanYearMax) filters.yearMax = cleanYearMax;
  if (cleanHasPdf) filters.hasPdf = true;
  if (cleanIsOpenAccess) filters.isOpenAccess = true;
  if (cleanSource) filters.source = cleanSource;
  if (cleanPublisher) filters.publisher = cleanPublisher;
  if (cleanInstitutionId) filters.institutionId = cleanInstitutionId;
  if (cleanInstitutionName) filters.institutionName = cleanInstitutionName;
  if (cleanInstitutionMode) filters.institutionMode = cleanInstitutionMode;
  if (cleanCountryCodes.length > 0) filters.countryCodes = cleanCountryCodes.join(',');
  if (cleanAuthorId) filters.authorId = cleanAuthorId;
  if (cleanMinCitations !== null && cleanMinCitations > 0) filters.minCitations = cleanMinCitations;

  // Compute whether request is an active search inquiry
  const isSearchInquiry = Boolean(
    searchTerm ||
    cleanCategory ||
    cleanSubjectId ||
    cleanFieldId ||
    (cleanPubType && cleanPubType !== 'all') ||
    cleanYearMin ||
    cleanYearMax ||
    cleanHasPdf ||
    cleanIsOpenAccess ||
    cleanSource ||
    cleanPublisher ||
    cleanInstitutionId ||
    cleanInstitutionName ||
    cleanCountryCodes.length > 0 ||
    cleanAuthorId ||
    (cleanMinCitations !== null && cleanMinCitations > 0)
  );

  return {
    valid: true,
    searchTerm,
    sortOrder: cleanSort,
    page: cleanPage,
    limit: cleanLimit,
    filters,
    sessionId: cleanSessionId,
    searchContextId: cleanContextId,
    isSearchInquiry,
  };
}

module.exports = {
  parseAndValidateThesisQuery,
  normalizePublicationType,
  escapeRegex,
};
