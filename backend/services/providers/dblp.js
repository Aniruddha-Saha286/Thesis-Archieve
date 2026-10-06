const { createNormalizedRecord } = require('../scholarlyRecord');

/**
 * DBLP Publication Search Provider Adapter
 * Endpoint: https://dblp.org/search/publ/api?q=...&format=json&h=<size>&f=<offset>
 *
 * DBLP is the computer science bibliography: journal articles, conference papers, arXiv
 * preprints, books and doctoral theses. It needs no key.
 *
 * Two things to know about it:
 *   - It has NO abstracts. The abstract of a DBLP record is left empty (null), never made
 *     up. When the same paper also comes from another source, the search manager merges
 *     the two and the abstract comes from there.
 *   - It only searches titles, author names, venues and years, and every word typed must
 *     match. Long sentence-like searches therefore often find nothing here.
 */

const DBLP_SEARCH_URL = 'https://dblp.org/search/publ/api';
const REQUEST_TIMEOUT_MS = 6500;
const MAX_PAGE_SIZE = 30;

// When DBLP says "too many requests" it normally also says how long to wait. If it does
// not, stay away this long. DBLP publishes no exact number, so this is a careful guess.
const DEFAULT_COOLDOWN_SECONDS = 30;
const MAX_COOLDOWN_SECONDS = 300;

// Shared by every search on this server: after a 429 we stop calling DBLP until this
// moment. DBLP has no key, so all visitors share one allowance, and a server that keeps
// asking after being told to wait can get its address blocked.
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

// DBLP sends one value as plain text and several values as a list ("venue", "ee" and the
// authors all do this). Reading everything as a list keeps the rest of the code simple.
function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// DBLP has its own search language: "|" means "or", "$" means "exact word", and
// "author:Name:" or "year:2020:" pick a field. A visitor's text such as
// "BERT: pre-training (2019)" would then be read as a broken command.
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

// DBLP writes every title with a full stop at the end ("Deep learning."). The rest of the
// site shows titles without it, and duplicate detection compares titles, so it is removed.
// "?" and "!" belong to the title and stay, and so does an ellipsis ("...").
function cleanTitle(rawTitle) {
  const title = cleanText(rawTitle);
  if (title.endsWith('.') && !title.endsWith('..')) return title.slice(0, -1).trim();
  return title;
}

// When several people share a name, DBLP tells them apart with a four-digit number:
// "Wei Wang 0001". That number is DBLP's own bookkeeping, not part of the person's name.
function cleanAuthorName(rawName) {
  return cleanText(rawName).replace(/\s+\d{4}$/, '').trim();
}

// "info.authors.author" is a list for several authors and a single object for one author.
// Each entry is normally { "@pid": "...", "text": "Name" }, but plain text is accepted too.
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
  // Some records have no "doi" field although their link is a DOI link.
  for (const link of eeLinks) {
    const match = link.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

// arXiv keeps the PDF of every paper at arxiv.org/pdf/<number>, so when DBLP points at an
// arXiv page (directly, or through arXiv's own DOI) the PDF address is known for certain.
// For every other publisher DBLP only gives a web page, and no PDF is claimed.
function deriveArxivPdfUrl(doi, eeLinks) {
  for (const link of eeLinks) {
    const match = link.match(/^https?:\/\/(?:www\.)?arxiv\.org\/abs\/([^?#\s]+)$/i);
    if (match) return `https://arxiv.org/pdf/${match[1]}`;
  }
  const doiMatch = doi ? doi.match(/^10\.48550\/arxiv\.(.+)$/i) : null;
  if (doiMatch) return `https://arxiv.org/pdf/${doiMatch[1]}`;
  return null;
}

// DBLP sorts everything into a few groups. They are matched to the types this site uses:
//   "Journal Articles"                -> journal-article
//   "Conference and Workshop Papers"  -> conference-paper
//   "Informal and Other Publications" -> preprint (almost all of these are arXiv papers)
//   "Books and Theses"                -> thesis when the DBLP key starts with "phd/"
//                                        (that is where DBLP files theses), otherwise book
//   "Parts in Books or Collections", "Editorship", "Reference Works" -> book
//   anything else (for example "Data and Artifacts") -> unknown, rather than a guess
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

  // --- Where the full text can be read ---
  const directPdfUrl = deriveArxivPdfUrl(doi, eeLinks);
  if (filters.hasPdf && !directPdfUrl) return null;

  const fullTextLocations = [];
  const seenUrls = new Set();
  const addLocation = (url, type, source, isDirectPdf) => {
    if (!isHttpUrl(url)) return;
    // Compared without regard to upper/lower case, because DBLP often writes the same DOI
    // link once in capitals and once in small letters.
    const seenKey = url.toLowerCase();
    if (seenUrls.has(seenKey)) return;
    seenUrls.add(seenKey);
    fullTextLocations.push({ type, url, source, isDirectPdf });
  };

  if (directPdfUrl) addLocation(directPdfUrl, 'pdf', 'arXiv PDF', true);
  // "ee" is DBLP's link to the paper at its publisher or repository.
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

  // --- Year ---
  const publishedYear = extractYear(info);
  // DBLP is not asked to filter by year (see searchDblp), so it is done here. A record
  // with no year cannot be shown to someone who asked for a year range.
  if (filters.yearMin || filters.yearMax) {
    if (!publishedYear) return null;
    if (filters.yearMin && publishedYear < parseInt(filters.yearMin, 10)) return null;
    if (filters.yearMax && publishedYear > parseInt(filters.yearMax, 10)) return null;
  }

  // --- Type ---
  const pubType = mapPublicationType(info);
  const wantedType = wantedPublicationType(filters);
  if (wantedType && pubType !== wantedType) return null;

  const venue = cleanText(asList(info.venue).find((v) => typeof v === 'string' && v.trim())) || null;

  return createNormalizedRecord({
    id: `dblp_${dblpKey ? dblpKey.replace(/[^a-zA-Z0-9]/g, '_') : doi ? doi.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(7)}`,
    doi,
    title,
    authors: extractAuthors(info),
    abstract: null, // DBLP has no abstracts
    publicationType: pubType,
    isPeerReviewed: pubType === 'journal-article' || pubType === 'conference-paper',
    publishedYear,
    venue,
    publisher: cleanText(info.publisher) || null,
    // "access" is DBLP's own label: "open" means anyone can read the paper for free.
    // Any other value ("closed", or a value we do not know) is not counted as open.
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
    return require('../../tests/fixtures/dblpApiFixtures').dblpSearchPublResponse;
  } catch (err) {
    return null;
  }
}

// Pulls the list of hits and the total out of a DBLP answer.
// Returns null when the answer does not look like a DBLP answer at all.
function readHits(data) {
  const result = data && typeof data === 'object' ? data.result : null;
  if (!result || typeof result !== 'object') return null;
  const hits = result.hits && typeof result.hits === 'object' ? result.hits : {};
  // With no matches DBLP leaves "hit" out completely. A single object instead of a list
  // is accepted too, because DBLP does exactly that with a single author.
  // Nothing is dropped here: the count of what DBLP sent decides where the next page
  // starts. Entries that are not usable are skipped later, in mapDblpHit().
  const items = asList(hits.hit);
  // DBLP sends its numbers as text: "@total": "1234".
  const reportedTotal = parseInt(hits['@total'], 10);
  const totalCount = Number.isFinite(reportedTotal) && reportedTotal >= 0 ? reportedTotal : items.length;
  return { items, totalCount };
}

// Reads how long the server asked us to wait. The value can be a number of seconds or a date.
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
  // Accepted so every provider is called the same way. DBLP is always asked for its
  // default "best match first" order; the search manager sorts the merged list itself.
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

  // Year, publication type and "has PDF" are applied to the returned records in
  // mapDblpHit() rather than sent to DBLP. DBLP's search language can narrow by year and
  // type, but its exact wording could not be checked against the live service, and a
  // wrong filter would silently return nothing. Filtering here is always correct.
  const params = new URLSearchParams();
  params.append('q', sanitizeQuery(query));
  params.append('format', 'json');
  params.append('h', String(pageSize)); // how many hits to return
  params.append('f', String(offset)); // position of the first hit, starting at 0
  params.append('c', '0'); // no search-box suggestions; this site does not use them
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

        // At most ONE safe retry if the wait is very small (<= 2 seconds)
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
