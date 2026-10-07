const { createNormalizedRecord } = require('../scholarlyRecord');


const CORE_SEARCH_URL = 'https://api.core.ac.uk/v3/search/works';
const REQUEST_TIMEOUT_MS = 6500;
const MAX_PAGE_SIZE = 30;

const DEFAULT_COOLDOWN_SECONDS = 10;
const MAX_COOLDOWN_SECONDS = 300;

let rateLimitedUntil = 0;
let excludeHintRejected = false;

function resetCoreStateForTests() {
  rateLimitedUntil = 0;
  excludeHintRejected = false;
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
}

function sanitizeQuery(query) {
  const cleaned = String(query || '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'research';
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function looksLikePdf(url) {
  return /\.pdf(\?|$|#)/i.test(url) || url.includes('/pdf/');
}

function isCoreHostedPdf(url) {
  return /^https?:\/\/(www\.)?core\.ac\.uk\/download\//i.test(url);
}

const ORGANISATION_WORDS = /\b(universit|institut|department|organi[sz]ation|college|laborator|cent(er|re)\b|group|consortium|committee|society|association|team|project|ministry|council)/i;

function normalizeAuthorName(rawName) {
  const name = cleanText(rawName);
  if (!name) return '';
  const parts = name.split(',').map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return name;
  if (ORGANISATION_WORDS.test(name) || /\d/.test(name)) return name;
  if (parts[0].split(' ').length > 3 || parts[1].split(' ').length > 4) return name;
  return `${parts[1]} ${parts[0]}`;
}

function extractAuthors(item) {
  if (!Array.isArray(item.authors)) return [];
  return item.authors
    .map((a) => {
      const raw = typeof a === 'string' ? a : a && a.name;
      return { name: normalizeAuthorName(raw), affiliation: null };
    })
    .filter((a) => a.name);
}

function extractYear(item) {
  const maxYear = new Date().getFullYear() + 1;
  const fromField = parseInt(item.yearPublished, 10);
  if (Number.isInteger(fromField) && fromField >= 1400 && fromField <= maxYear) return fromField;

  for (const raw of [item.publishedDate, item.acceptedDate, item.depositedDate]) {
    const match = typeof raw === 'string' ? raw.match(/^(\d{4})-\d{2}-\d{2}/) : null;
    if (match) {
      const yr = parseInt(match[1], 10);
      if (yr >= 1400 && yr <= maxYear) return yr;
    }
  }
  return null;
}

function extractDoi(item) {
  if (typeof item.doi === 'string' && item.doi.trim()) return item.doi.toLowerCase().trim();
  if (Array.isArray(item.identifiers)) {
    const hit = item.identifiers.find(
      (i) => i && String(i.type || '').toLowerCase() === 'doi' && typeof i.identifier === 'string' && i.identifier.trim()
    );
    if (hit) return hit.identifier.toLowerCase().trim();
  }
  return null;
}

function mapPublicationType(item, venue) {
  const raw = Array.isArray(item.documentType) ? item.documentType.join(' ') : String(item.documentType || '');
  const type = raw.toLowerCase();
  if (/thes[ie]s|dissertation|doctoral|\bph\.?d\b/.test(type)) return 'thesis';
  if (/proceeding|conference/.test(type)) return 'conference-paper';
  if (/preprint/.test(type)) return 'preprint';
  if (/\bbook\b|monograph/.test(type)) return 'book';
  if (/slide|presentation|poster/.test(type)) return 'unknown';
  if (venue) return 'journal-article';
  return 'unknown';
}

function wantedPublicationType(filters) {
  const raw = String(filters.publicationType || '').trim().toLowerCase();
  if (!raw || raw === 'all') return null;
  if (raw === 'dissertation') return 'thesis';
  if (raw === 'article') return 'journal-article';
  if (raw === 'proceedings') return 'conference-paper';
  return raw;
}

function mapCoreWork(item, filters) {
  if (!item || typeof item !== 'object') return null;

  const title = cleanText(item.title);
  if (!title) return null;

  const doi = extractDoi(item);
  const coreId = item.id !== undefined && item.id !== null && String(item.id).trim() ? String(item.id).trim() : null;
  const repositoryName =
    Array.isArray(item.dataProviders) && item.dataProviders[0] ? cleanText(item.dataProviders[0].name) || null : null;

  let directPdfUrl = null;
  const fullTextLocations = [];
  const seenUrls = new Set();
  const addLocation = (url, type, source, isDirectPdf) => {
    if (!isHttpUrl(url)) return;
    const clean = url.trim();
    if (seenUrls.has(clean)) return;
    seenUrls.add(clean);
    fullTextLocations.push({ type, url: clean, source, isDirectPdf });
  };
  const addCandidate = (url, landingSource) => {
    if (!isHttpUrl(url)) return;
    const clean = url.trim();
    if (isCoreHostedPdf(clean) || looksLikePdf(clean)) {
      if (!directPdfUrl) directPdfUrl = clean;
      addLocation(clean, 'pdf', isCoreHostedPdf(clean) ? 'CORE Full Text PDF' : landingSource, true);
    } else {
      addLocation(clean, 'landing', landingSource, false);
    }
  };

  const links = Array.isArray(item.links) ? item.links.filter((l) => l && typeof l === 'object') : [];
  const linkOfType = (type) => {
    const hit = links.find((l) => l.type === type && isHttpUrl(l.url));
    return hit ? hit.url.trim() : null;
  };

  addCandidate(item.downloadUrl, repositoryName || 'CORE Repository Copy');
  addCandidate(linkOfType('download'), repositoryName || 'CORE Repository Copy');

  const sourceUrls = Array.isArray(item.sourceFulltextUrls)
    ? item.sourceFulltextUrls
    : typeof item.sourceFulltextUrls === 'string'
    ? [item.sourceFulltextUrls]
    : [];
  for (const u of sourceUrls) addCandidate(u, repositoryName || 'CORE Repository Copy');

  if (filters.hasPdf && !directPdfUrl) return null;

  const readerUrl = linkOfType('reader');
  const hasReadableCopy = fullTextLocations.length > 0 || Boolean(readerUrl);

  if (readerUrl) addLocation(readerUrl, 'html', 'CORE Reader', false);

  if (doi) addLocation(`https://doi.org/${doi}`, 'landing', 'Publisher DOI Landing Page', false);

  const coreWorkUrl = linkOfType('display') || (coreId ? `https://core.ac.uk/works/${encodeURIComponent(coreId)}` : null);
  if (coreWorkUrl) addLocation(coreWorkUrl, 'landing', 'CORE Record Page', false);

  const publishedYear = extractYear(item);
  if (filters.yearMin || filters.yearMax) {
    if (!publishedYear) return null;
    if (filters.yearMin && publishedYear < parseInt(filters.yearMin, 10)) return null;
    if (filters.yearMax && publishedYear > parseInt(filters.yearMax, 10)) return null;
  }

  const venue =
    Array.isArray(item.journals) && item.journals.length > 0
      ? cleanText((item.journals.find((j) => j && j.title) || {}).title) || null
      : null;

  const pubType = mapPublicationType(item, venue);
  const wantedType = wantedPublicationType(filters);
  if (wantedType && pubType !== wantedType) return null;

  let publisher = cleanText(item.publisher).replace(/^['"]+|['"]+$/g, '').trim() || null;
  if (!publisher && pubType === 'thesis' && repositoryName) publisher = repositoryName;

  const publishedDateMatch = typeof item.publishedDate === 'string' ? item.publishedDate.match(/^(\d{4})-\d{2}-\d{2}/) : null;
  const publicationDate =
    publishedDateMatch && publishedYear && parseInt(publishedDateMatch[1], 10) === publishedYear ? publishedDateMatch[0] : null;

  const abstract = cleanText(typeof item.abstract === 'string' ? item.abstract.replace(/<[^>]*>/g, ' ') : '') || null;

  const record = createNormalizedRecord({
    id: `core_${coreId ? coreId.replace(/[^a-zA-Z0-9]/g, '_') : doi ? doi.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(7)}`,
    doi,
    title,
    authors: extractAuthors(item),
    abstract,
    category: cleanText(item.fieldOfStudy) || null,
    publicationType: pubType,
    isPeerReviewed: pubType === 'journal-article' || pubType === 'conference-paper',
    publishedYear,
    publicationDate,
    venue,
    publisher,
    isOpenAccess: hasReadableCopy,
    pdfUrl: directPdfUrl,
    isDirectPdf: Boolean(directPdfUrl),
    fullTextUrl: coreWorkUrl || (doi ? `https://doi.org/${doi}` : null),
    fullTextLocations,
    source: 'CORE',
    catalogId: coreId ? `CORE:${coreId}` : doi ? `DOI:${doi}` : null,
  });

  const languageCode = item.language && typeof item.language === 'object' ? cleanText(item.language.code).toLowerCase() : '';
  record.language = languageCode || null;

  return record;
}

function emptyResult(error) {
  return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error };
}

function buildResult({ items, totalCount, offset, page, filters }) {
  const records = items.map((item) => mapCoreWork(item, filters)).filter(Boolean);
  const hasMore = items.length > 0 && offset + items.length < totalCount;
  return {
    records,
    rawCount: items.length,
    totalCount,
    hasMore,
    nextOffset: offset + items.length,
    nextPage: hasMore ? page + 1 : null,
    error: null,
  };
}

function loadOfflineFixture() {
  try {
    return require('../../tests/fixtures/coreApiFixtures').coreSearchWorksResponse;
  } catch (err) {
    return null;
  }
}

function readRetryAfterSeconds(res) {
  const get = (name) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null);
  const raw = get('retry-after') || get('x-ratelimit-retry-after');
  if (!raw) return 0;
  const text = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.ceil(parseFloat(text));
  const when = Date.parse(text);
  if (Number.isNaN(when)) return 0;
  return Math.max(0, Math.ceil((when - Date.now()) / 1000));
}

function buildUrl({ q, pageSize, offset, withExcludeHint }) {
  const params = new URLSearchParams();
  params.append('q', q);
  params.append('limit', String(pageSize));
  params.append('offset', String(offset));
  if (withExcludeHint) params.append('exclude', 'fullText');
  return `${CORE_SEARCH_URL}?${params.toString()}`;
}

async function fetchCorePage({ q, pageSize, offset, headers, signal }) {
  const withHint = !excludeHintRejected;
  let res = await fetch(buildUrl({ q, pageSize, offset, withExcludeHint: withHint }), { signal, headers });

  const refusedForAnotherReason = res.status === 401 || res.status === 403 || res.status === 429;
  if (withHint && !res.ok && !refusedForAnotherReason) {
    const retry = await fetch(buildUrl({ q, pageSize, offset, withExcludeHint: false }), { signal, headers });
    if (retry.ok) excludeHintRejected = true;
    res = retry;
  }
  return res;
}

async function searchCore({
  query = '',
  page = 1,
  limit = 20,
  offset: explicitOffset = null,
  filters = {},
  sort = 'relevance',
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(parseInt(limit, 10) || 20, MAX_PAGE_SIZE));
  const offset = typeof explicitOffset === 'number' && explicitOffset >= 0 ? explicitOffset : (pageNum - 1) * pageSize;
  const safeFilters = filters || {};

  if (process.env.OFFLINE_MODE === 'true') {
    const fixture = loadOfflineFixture();
    const all = fixture && Array.isArray(fixture.results) ? fixture.results : [];
    return buildResult({
      items: all.slice(offset, offset + pageSize),
      totalCount: all.length,
      offset,
      page: pageNum,
      filters: safeFilters,
    });
  }

  if (Date.now() < rateLimitedUntil) {
    return emptyResult('CORE rate limit reached');
  }

  const q = sanitizeQuery(query);

  const headers = {
    'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
    Accept: 'application/json',
  };
  if (process.env.CORE_API_KEY && process.env.CORE_API_KEY.trim()) {
    headers.Authorization = `Bearer ${process.env.CORE_API_KEY.trim()}`;
  }

  async function executeFetch(isRetry = false) {
    try {
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const res = await fetchCorePage({ q, pageSize, offset, headers, signal });

      if (res.status === 429) {
        const retryAfterSec = readRetryAfterSeconds(res);

        if (!isRetry && retryAfterSec > 0 && retryAfterSec <= 2) {
          await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
          return executeFetch(true);
        }

        const cooldownSec = Math.min(retryAfterSec > 0 ? retryAfterSec : DEFAULT_COOLDOWN_SECONDS, MAX_COOLDOWN_SECONDS);
        rateLimitedUntil = Date.now() + cooldownSec * 1000;
        return emptyResult('CORE rate limit reached');
      }

      if (res.status === 401) {
        return emptyResult('CORE authentication failed (401)');
      }

      if (res.status === 403) {
        return emptyResult('CORE access forbidden (403)');
      }

      if (res.status >= 500) {
        return emptyResult(`CORE service error (${res.status})`);
      }

      if (!res.ok) {
        return emptyResult(`CORE HTTP ${res.status}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        return emptyResult('CORE returned malformed response');
      }

      if (!data || typeof data !== 'object' || (data.results !== undefined && !Array.isArray(data.results))) {
        return emptyResult('CORE returned malformed response');
      }

      const items = Array.isArray(data.results) ? data.results : [];
      const reportedTotal = parseInt(data.totalHits, 10);
      const totalCount = Number.isFinite(reportedTotal) && reportedTotal >= 0 ? reportedTotal : items.length;

      return buildResult({ items, totalCount, offset, page: pageNum, filters: safeFilters });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return emptyResult('CORE request timed out');
      }
      return emptyResult(`CORE network error: ${err.message}`);
    }
  }

  return executeFetch(false);
}

module.exports = { searchCore, resetCoreStateForTests };
