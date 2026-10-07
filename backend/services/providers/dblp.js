const { createNormalizedRecord } = require('../scholarlyRecord');


const DBLP_SEARCH_URL = 'https://dblp.org/search/publ/api';
const REQUEST_TIMEOUT_MS = 6500;
const MAX_PAGE_SIZE = 30;

const DEFAULT_COOLDOWN_SECONDS = 30;
const MAX_COOLDOWN_SECONDS = 300;

let rateLimitedUntil = 0;

function resetDblpStateForTests() {
  rateLimitedUntil = 0;
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

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
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

function cleanTitle(rawTitle) {
  const title = cleanText(rawTitle);
  if (title.endsWith('.') && !title.endsWith('..')) return title.slice(0, -1).trim();
  return title;
}

function cleanAuthorName(rawName) {
  return cleanText(rawName).replace(/\s+\d{4}$/, '').trim();
}

function extractAuthors(info) {
  const raw = info.authors && typeof info.authors === 'object' ? info.authors.author : null;
  return asList(raw)
    .map((a) => {
      const name = typeof a === 'string' ? a : a && a.text;
      return { name: cleanAuthorName(name), affiliation: null };
    })
    .filter((a) => a.name);
}

function extractYear(info) {
  const maxYear = new Date().getFullYear() + 1;
  const yr = parseInt(info.year, 10);
  return Number.isInteger(yr) && yr >= 1400 && yr <= maxYear ? yr : null;
}

function extractDoi(info, eeLinks) {
  if (typeof info.doi === 'string' && info.doi.trim()) return info.doi.toLowerCase().trim();
  for (const link of eeLinks) {
    const match = link.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

function deriveArxivPdfUrl(doi, eeLinks) {
  for (const link of eeLinks) {
    const match = link.match(/^https?:\/\/(?:www\.)?arxiv\.org\/abs\/([^?#\s]+)$/i);
    if (match) return `https://arxiv.org/pdf/${match[1]}`;
  }
  const doiMatch = doi ? doi.match(/^10\.48550\/arxiv\.(.+)$/i) : null;
  if (doiMatch) return `https://arxiv.org/pdf/${doiMatch[1]}`;
  return null;
}

function mapPublicationType(info) {
  const type = String(info.type || '').toLowerCase();
  const key = String(info.key || '').toLowerCase();
  if (type.includes('journal')) return 'journal-article';
  if (type.includes('conference') || type.includes('workshop')) return 'conference-paper';
  if (type.includes('informal')) return 'preprint';
  if (type.includes('thes')) return key.startsWith('phd/') ? 'thesis' : 'book';
  if (type.includes('book') || type.includes('editorship') || type.includes('reference')) return 'book';
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

function mapDblpHit(hit, filters) {
  const info = hit && typeof hit === 'object' ? hit.info : null;
  if (!info || typeof info !== 'object') return null;

  const title = cleanTitle(info.title);
  if (!title) return null;

  const dblpKey = typeof info.key === 'string' && info.key.trim() ? info.key.trim() : null;
  const eeLinks = asList(info.ee)
    .filter(isHttpUrl)
    .map((u) => u.trim());
  const doi = extractDoi(info, eeLinks);

  const directPdfUrl = deriveArxivPdfUrl(doi, eeLinks);
  if (filters.hasPdf && !directPdfUrl) return null;

  const fullTextLocations = [];
  const seenUrls = new Set();
  const addLocation = (url, type, source, isDirectPdf) => {
    if (!isHttpUrl(url)) return;
    const seenKey = url.toLowerCase();
    if (seenUrls.has(seenKey)) return;
    seenUrls.add(seenKey);
    fullTextLocations.push({ type, url, source, isDirectPdf });
  };

  if (directPdfUrl) addLocation(directPdfUrl, 'pdf', 'arXiv PDF', true);
  for (const link of eeLinks) {
    const isDoiLink = /^https?:\/\/(?:dx\.)?doi\.org\//i.test(link);
    addLocation(link, 'landing', isDoiLink ? 'Publisher DOI Landing Page' : 'Publisher or Repository Page (via DBLP)', false);
  }
  if (doi) addLocation(`https://doi.org/${doi}`, 'landing', 'Publisher DOI Landing Page', false);
  const dblpRecordUrl = isHttpUrl(info.url)
    ? info.url.trim()
    : dblpKey
    ? `https://dblp.org/rec/${dblpKey.split('/').map(encodeURIComponent).join('/')}`
    : null;
  if (dblpRecordUrl) addLocation(dblpRecordUrl, 'landing', 'DBLP Record Page', false);

  const publishedYear = extractYear(info);
  if (filters.yearMin || filters.yearMax) {
    if (!publishedYear) return null;
    if (filters.yearMin && publishedYear < parseInt(filters.yearMin, 10)) return null;
    if (filters.yearMax && publishedYear > parseInt(filters.yearMax, 10)) return null;
  }

  const pubType = mapPublicationType(info);
  const wantedType = wantedPublicationType(filters);
  if (wantedType && pubType !== wantedType) return null;

  const venue = cleanText(asList(info.venue).find((v) => typeof v === 'string' && v.trim())) || null;

  return createNormalizedRecord({
    id: `dblp_${dblpKey ? dblpKey.replace(/[^a-zA-Z0-9]/g, '_') : doi ? doi.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(7)}`,
    doi,
    title,
    authors: extractAuthors(info),
    abstract: null,
    publicationType: pubType,
    isPeerReviewed: pubType === 'journal-article' || pubType === 'conference-paper',
    publishedYear,
    venue,
    publisher: cleanText(info.publisher) || null,
    isOpenAccess: String(info.access || '').toLowerCase() === 'open' || Boolean(directPdfUrl),
    pdfUrl: directPdfUrl,
    isDirectPdf: Boolean(directPdfUrl),
    fullTextUrl: eeLinks[0] || (doi ? `https://doi.org/${doi}` : dblpRecordUrl),
    fullTextLocations,
    source: 'DBLP',
    catalogId: dblpKey ? `DBLP:${dblpKey}` : doi ? `DOI:${doi}` : null,
  });
}

function emptyResult(error) {
  return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error };
}

function buildResult({ items, totalCount, offset, page, filters }) {
  const records = items.map((item) => mapDblpHit(item, filters)).filter(Boolean);
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
    return require('../../tests/fixtures/dblpApiFixtures').dblpSearchPublResponse;
  } catch (err) {
    return null;
  }
}

function readHits(data) {
  const result = data && typeof data === 'object' ? data.result : null;
  if (!result || typeof result !== 'object') return null;
  const hits = result.hits && typeof result.hits === 'object' ? result.hits : {};
  const items = asList(hits.hit);
  const reportedTotal = parseInt(hits['@total'], 10);
  const totalCount = Number.isFinite(reportedTotal) && reportedTotal >= 0 ? reportedTotal : items.length;
  return { items, totalCount };
}

function readRetryAfterSeconds(res) {
  const raw = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
  if (!raw) return 0;
  const text = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.ceil(parseFloat(text));
  const when = Date.parse(text);
  if (Number.isNaN(when)) return 0;
  return Math.max(0, Math.ceil((when - Date.now()) / 1000));
}

async function searchDblp({
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
    const parsed = readHits(loadOfflineFixture()) || { items: [], totalCount: 0 };
    return buildResult({
      items: parsed.items.slice(offset, offset + pageSize),
      totalCount: parsed.items.length,
      offset,
      page: pageNum,
      filters: safeFilters,
    });
  }

  if (Date.now() < rateLimitedUntil) {
    return emptyResult('DBLP rate limit reached');
  }

  const params = new URLSearchParams();
  params.append('q', sanitizeQuery(query));
  params.append('format', 'json');
  params.append('h', String(pageSize));
  params.append('f', String(offset));
  params.append('c', '0');
  const url = `${DBLP_SEARCH_URL}?${params.toString()}`;

  const headers = {
    'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
    Accept: 'application/json',
  };

  async function executeFetch(isRetry = false) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers,
      });

      if (res.status === 429) {
        const retryAfterSec = readRetryAfterSeconds(res);

        if (!isRetry && retryAfterSec > 0 && retryAfterSec <= 2) {
          await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
          return executeFetch(true);
        }

        const cooldownSec = Math.min(retryAfterSec > 0 ? retryAfterSec : DEFAULT_COOLDOWN_SECONDS, MAX_COOLDOWN_SECONDS);
        rateLimitedUntil = Date.now() + cooldownSec * 1000;
        return emptyResult('DBLP rate limit reached');
      }

      if (res.status >= 500) {
        return emptyResult(`DBLP service error (${res.status})`);
      }

      if (!res.ok) {
        return emptyResult(`DBLP HTTP ${res.status}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        return emptyResult('DBLP returned malformed response');
      }

      const parsed = readHits(data);
      if (!parsed) {
        return emptyResult('DBLP returned malformed response');
      }

      return buildResult({ items: parsed.items, totalCount: parsed.totalCount, offset, page: pageNum, filters: safeFilters });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return emptyResult('DBLP request timed out');
      }
      return emptyResult(`DBLP network error: ${err.message}`);
    }
  }

  return executeFetch(false);
}

module.exports = { searchDblp, resetDblpStateForTests };
