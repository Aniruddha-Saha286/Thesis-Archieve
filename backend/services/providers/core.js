const { createNormalizedRecord } = require('../scholarlyRecord');

/**
 * CORE API v3 Provider Adapter ("search works")
 * Endpoint: https://api.core.ac.uk/v3/search/works
 *
 * CORE collects open-access papers and theses from thousands of university repositories,
 * so it is one of the best outside sources of theses for this site.
 *
 * It works without a key, but the keyless limit is low and is counted per server address,
 * which means every visitor of the site shares it. Set CORE_API_KEY to get a higher limit.
 */

const CORE_SEARCH_URL = 'https://api.core.ac.uk/v3/search/works';
const REQUEST_TIMEOUT_MS = 6500;
const MAX_PAGE_SIZE = 30;

// When CORE says "too many requests" and gives no waiting time, stay away this long.
// The documented keyless limit is counted over 10 seconds, so 10 seconds is enough.
const DEFAULT_COOLDOWN_SECONDS = 10;
const MAX_COOLDOWN_SECONDS = 300;

// Shared by every search on this server.
// rateLimitedUntil: after a 429 we stop calling CORE until this moment, because more
//   calls would only be refused again and could get the server address blocked.
// excludeHintRejected: see fetchCorePage() below.
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

// Turns "&amp;", "&#8211;" and "&#x27;" back into the real characters.
// It is done in one pass on purpose: decoding "&amp;" first and "&lt;" afterwards would
// wrongly turn the text "&amp;lt;" into "<".
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

// CORE has its own query language where ":" picks a field, quotes and brackets group
// words, and a leading "-" excludes a word. A visitor's text such as
// "BERT: pre-training (2019)" would then be read as a broken command and fail.
// Keeping only letters and digits makes every search a plain word search.
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

// Files that CORE itself hosts live under core.ac.uk/download/... and are always the PDF.
function isCoreHostedPdf(url) {
  return /^https?:\/\/(www\.)?core\.ac\.uk\/download\//i.test(url);
}

const ORGANISATION_WORDS = /\b(universit|institut|department|organi[sz]ation|college|laborator|cent(er|re)\b|group|consortium|committee|society|association|team|project|ministry|council)/i;

// Repositories usually store names as "Surname, Given". The rest of the site shows
// "Given Surname", and duplicate detection compares the LAST word of the first author's
// name, so an unturned name would stop a CORE record from merging with the same paper
// from another source. Names of organisations ("University of X, Dept of Y") are left alone.
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

  // Some works have no yearPublished but do have a full date.
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

// CORE labels each document itself, mostly as "research", "thesis" or "slides".
// A "research" document is only called a journal article when CORE also names the
// journal; otherwise we honestly do not know whether it is an article, a report or a
// working paper, so it stays "unknown" instead of being guessed.
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

  // --- Where the full text can be read ---
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
    // Only call it a direct PDF when the address proves it. Some repositories put a
    // normal web page in downloadUrl, and the site must not promise a PDF it cannot open.
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

  // sourceFulltextUrls is normally a list, but a single address has been seen as plain text.
  const sourceUrls = Array.isArray(item.sourceFulltextUrls)
    ? item.sourceFulltextUrls
    : typeof item.sourceFulltextUrls === 'string'
    ? [item.sourceFulltextUrls]
    : [];
  for (const u of sourceUrls) addCandidate(u, repositoryName || 'CORE Repository Copy');

  if (filters.hasPdf && !directPdfUrl) return null;

  // CORE also lists works for which it only has the description and no copy of the text.
  // A work counts as open access only when CORE points at a copy that can be read (a
  // download, a repository file or its own reader). Everything collected so far is such a
  // copy; the DOI and CORE record pages added below are not.
  const readerUrl = linkOfType('reader');
  const hasReadableCopy = fullTextLocations.length > 0 || Boolean(readerUrl);

  if (readerUrl) addLocation(readerUrl, 'html', 'CORE Reader', false);

  if (doi) addLocation(`https://doi.org/${doi}`, 'landing', 'Publisher DOI Landing Page', false);

  const coreWorkUrl = linkOfType('display') || (coreId ? `https://core.ac.uk/works/${encodeURIComponent(coreId)}` : null);
  if (coreWorkUrl) addLocation(coreWorkUrl, 'landing', 'CORE Record Page', false);

  // --- Year ---
  const publishedYear = extractYear(item);
  // CORE is not asked to filter by year (see searchCore), so it is done here. A record
  // with no year cannot be shown to someone who asked for a year range.
  if (filters.yearMin || filters.yearMax) {
    if (!publishedYear) return null;
    if (filters.yearMin && publishedYear < parseInt(filters.yearMin, 10)) return null;
    if (filters.yearMax && publishedYear > parseInt(filters.yearMax, 10)) return null;
  }

  // --- Venue, type, publisher ---
  const venue =
    Array.isArray(item.journals) && item.journals.length > 0
      ? cleanText((item.journals.find((j) => j && j.title) || {}).title) || null
      : null;

  const pubType = mapPublicationType(item, venue);
  const wantedType = wantedPublicationType(filters);
  if (wantedType && pubType !== wantedType) return null;

  // CORE often wraps the publisher in stray quotes: "'Elsevier BV'".
  let publisher = cleanText(item.publisher).replace(/^['"]+|['"]+$/g, '').trim() || null;
  // A thesis is published by the university repository that holds it, so the repository
  // name is a fair publisher for a thesis. For an article it would be wrong (the journal's
  // publisher is someone else), so there the field stays empty.
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

  // The shared record builder has no language field and drops anything it does not know.
  // CORE is the only source that tells us the language, so it is added afterwards
  // (two-letter code such as "en", or null when CORE does not say).
  const languageCode = item.language && typeof item.language === 'object' ? cleanText(item.language.code).toLowerCase() : '';
  record.language = languageCode || null;

  return record;
}

function emptyResult(error) {
  return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error };
}

function buildResult({ items, totalCount, offset, page, filters }) {
  const records = items.map((item) => mapCoreWork(item, filters)).filter(Boolean);
  // An empty page means the end, whatever the reported total says. Without this check a
  // wrong total would make the search ask for the same empty page again and again.
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

// The offline fixture lives with the tests. If the tests folder is not deployed, offline
// mode simply returns nothing, the same as the other providers without offline data.
function loadOfflineFixture() {
  try {
    return require('../../tests/fixtures/coreApiFixtures').coreSearchWorksResponse;
  } catch (err) {
    return null;
  }
}

// Reads how long the server asked us to wait. The value can be a number of seconds or
// a date, and CORE may send it under its own header name.
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

// Sends the request to CORE.
//
// CORE returns the whole text of every paper in the "fullText" field. A page of theses can
// be many megabytes, which is slow and easily runs past the time limit, and this site does
// not use that text. "exclude=fullText" asks CORE to leave it out.
//
// That parameter could not be checked against the live service when this was written. So
// if CORE refuses a request that carries it, the same request is sent once more without
// it, and if that works the parameter is not sent again until the server restarts. The
// search keeps working either way.
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
  // Accepted so every provider is called the same way. CORE is always asked for its
  // default "most relevant first" order; the search manager sorts the merged list itself.
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

  // Year, publication type and "has PDF" are applied to the returned records in
  // mapCoreWork() rather than sent to CORE. CORE can filter inside its query language,
  // but the exact wording could not be checked against the live service, and a wrong
  // filter would silently return nothing. Filtering here is always correct.
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
      // One time limit for the whole attempt, including the possible second request
      // inside fetchCorePage, so a slow CORE cannot hold the search up twice as long.
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const res = await fetchCorePage({ q, pageSize, offset, headers, signal });

      if (res.status === 429) {
        const retryAfterSec = readRetryAfterSeconds(res);

        // At most ONE safe retry if the wait is very small (<= 2 seconds)
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
