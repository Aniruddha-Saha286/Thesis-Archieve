/**
 * Open Access Finder
 *
 * Given the DOI of a paper, asks Unpaywall (https://unpaywall.org) whether a free and LEGAL
 * copy exists somewhere: on the publisher's own site, in a university repository, on a
 * preprint server and so on. Unpaywall only lists copies that the publisher or the author
 * made available, so nothing returned here is a pirated copy.
 *
 * This file only finds the link. It never downloads the PDF: the browser opens the link
 * directly. That keeps our server out of the path and means a bad link cannot be used to
 * make our server fetch something it should not.
 *
 * findOpenAccessPdf() never throws. Every failure comes back as { found: false, reason }.
 */

const { normalizeDoi } = require('../utils/doiNormalizer');
const { isValidDocumentUrl, isPrivateIpOrHost } = require('../utils/urlValidator');

const UNPAYWALL_BASE_URL = 'https://api.unpaywall.org/v2';

// How long we wait for Unpaywall before giving up. A person is waiting on a button, so a
// slow answer is worse than "try again later".
let requestTimeoutMs = 6000;

// ---------------------------------------------------------------------------
// Small in-memory cache
// ---------------------------------------------------------------------------
// The same popular papers are opened again and again, and Unpaywall asks callers to stay
// under 100,000 requests a day, so answers are remembered for a while.
//   - "found" is kept longer: a free copy rarely disappears.
//   - "no free copy" and "unknown DOI" are kept for a shorter time, because embargoes end
//     and new papers get indexed.
//   - "unavailable", "rate_limited" and "not_configured" are never stored, so the next
//     click simply tries again.
const POSITIVE_TTL_MS = 12 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const oaCache = new Map();

function getCached(doi) {
  const item = oaCache.get(doi);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    oaCache.delete(doi);
    return null;
  }
  // Hand out a copy so a caller that edits the result cannot change what is stored.
  return { ...item.data };
}

function setCached(doi, data) {
  // A Map remembers the order things were added in, so the first key is the oldest one.
  if (!oaCache.has(doi) && oaCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = oaCache.keys().next().value;
    oaCache.delete(oldestKey);
  }
  const ttl = data.found ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  oaCache.set(doi, { data: { ...data }, expiresAt: Date.now() + ttl });
}

// ---------------------------------------------------------------------------
// Rate-limit pause
// ---------------------------------------------------------------------------
// When Unpaywall answers 429 ("too many requests") we stop calling it for a short while.
// Hammering a service that has just asked us to slow down only gets the site blocked for
// longer.
const DEFAULT_RATE_LIMIT_PAUSE_MS = 60 * 1000;
const MAX_RATE_LIMIT_PAUSE_MS = 10 * 60 * 1000;
let rateLimitedUntil = 0;

// Reads how long the server asked us to wait. The header is either a number of seconds or
// a date. Anything unreadable falls back to one minute, and we never pause longer than
// ten minutes whatever the server says.
function readRetryAfterMs(res) {
  let raw = null;
  try {
    raw = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
  } catch (err) {
    raw = null;
  }
  if (raw === null || raw === undefined || String(raw).trim() === '') return DEFAULT_RATE_LIMIT_PAUSE_MS;

  let ms;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    ms = seconds * 1000;
  } else {
    const when = Date.parse(String(raw));
    ms = Number.isNaN(when) ? DEFAULT_RATE_LIMIT_PAUSE_MS : when - Date.now();
  }
  if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_RATE_LIMIT_PAUSE_MS;
  return Math.min(ms, MAX_RATE_LIMIT_PAUSE_MS);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Unpaywall has no API key. It asks for a real contact e-mail address on every request
// instead, so that they can reach the site owner if something goes wrong. Without one we
// do not call at all.
function getConfiguredEmail() {
  const email = String(process.env.UNPAYWALL_EMAIL || '').trim();
  // A loose check, only meant to catch an empty value or a placeholder such as "—".
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------
// Every link Unpaywall gives us ends up as something a visitor clicks, so each one is
// checked before it leaves this file: http or https only, and never an address inside a
// private network. The shared helpers in utils/urlValidator.js do the main check. The few
// extra lines below cover cases those helpers let through (IPv6 addresses written in
// square brackets, names such as "something.internal", and links with a user name and
// password embedded in them).
function isSafePublicUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const text = value.trim();
  if (text.length > 2000) return false;
  if (!isValidDocumentUrl(text)) return false;
  try {
    const parsed = new URL(text);
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase();
    const bare = host.replace(/^\[/, '').replace(/\]$/, '');
    if (bare !== host) {
      // An IPv6 address. Block the local and private ranges, including an IPv4 address
      // wrapped inside an IPv6 one (::ffff:...), which could hide a private address.
      if (isPrivateIpOrHost(bare)) return false;
      if (/^(::|::1|::ffff:.*|f[cd][0-9a-f]{0,2}:.*|fe[89ab][0-9a-f]:.*)$/i.test(bare)) return false;
    }
    if (
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.home.arpa')
    ) {
      return false;
    }
    // A real public site always has a dot in its name. "intranet" or "router" does not.
    if (bare === host && !host.includes('.')) return false;
    return true;
  } catch (err) {
    return false;
  }
}

// When we are not going to read an answer, tell Node to let go of it. Otherwise the
// connection can stay half-open until the garbage collector gets round to it.
async function discardBody(res) {
  try {
    if (res && res.body && typeof res.body.cancel === 'function') await res.body.cancel();
  } catch (err) {
    // Nothing to do: we were throwing the body away anyway.
  }
}

function safeUrlOrNull(value) {
  return isSafePublicUrl(value) ? value.trim() : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Turning an Unpaywall answer into our own small result object
// ---------------------------------------------------------------------------
function buildFound(location, pdfUrl, landingUrl) {
  return {
    found: true,
    pdfUrl,
    landingUrl,
    license: textOrNull(location.license),
    version: textOrNull(location.version),
    hostType: textOrNull(location.host_type),
    repository: textOrNull(location.repository_institution),
    source: 'unpaywall',
  };
}

/**
 * Picks the best free copy out of an Unpaywall answer.
 *
 * Order of preference:
 *   1. The PDF of Unpaywall's own "best" location (best_oa_location.url_for_pdf).
 *   2. A PDF from any other listed location, in the order Unpaywall ranked them.
 *   3. No PDF anywhere: a landing page where the paper can be read for free. In that case
 *      pdfUrl is null and landingUrl is set, and found is still true.
 * A link that fails the safety check is treated as if it were not there.
 */
function pickOpenCopy(data) {
  if (!data || typeof data !== 'object') return { found: false, reason: 'no_open_copy' };

  const locations = [];
  if (data.best_oa_location && typeof data.best_oa_location === 'object') {
    locations.push(data.best_oa_location);
  }
  if (Array.isArray(data.oa_locations)) {
    for (const loc of data.oa_locations) {
      if (loc && typeof loc === 'object') locations.push(loc);
    }
  }
  // Note: we do not test data.is_oa here. If Unpaywall lists a usable location we use it,
  // and if it lists none there is nothing to return either way.

  for (const loc of locations) {
    const pdfUrl = safeUrlOrNull(loc.url_for_pdf);
    if (pdfUrl) {
      return buildFound(loc, pdfUrl, safeUrlOrNull(loc.url_for_landing_page));
    }
  }

  for (const loc of locations) {
    // "url" is Unpaywall's own fallback field: the PDF when there is one, else the page.
    const landingUrl = safeUrlOrNull(loc.url_for_landing_page) || safeUrlOrNull(loc.url);
    if (landingUrl) {
      return buildFound(loc, null, landingUrl);
    }
  }

  return { found: false, reason: 'no_open_copy' };
}

// The offline fixtures live with the tests. If the tests folder is not deployed, offline
// mode reports the service as unavailable instead of crashing.
function loadOfflineFixtures() {
  try {
    return require('../tests/fixtures/unpaywallFixtures');
  } catch (err) {
    return null;
  }
}

function findOffline(doi) {
  const fixtures = loadOfflineFixtures();
  if (!fixtures) return { found: false, reason: 'unavailable' };
  const table = fixtures.OFFLINE_DOI_TABLE || {};
  if (Object.prototype.hasOwnProperty.call(table, doi)) {
    const entry = table[doi];
    if (entry === null) return { found: false, reason: 'not_found' };
    return pickOpenCopy(entry);
  }
  return pickOpenCopy(fixtures.unpaywallOpenResponse);
}

/**
 * Looks for a free, legal copy of a paper.
 *
 * @param {{ doi: string }} input  The DOI in any common form: "10.1234/abc",
 *   "doi:10.1234/abc" or "https://doi.org/10.1234/abc".
 * @returns {Promise<object>} Either
 *   { found: true, pdfUrl, landingUrl, license, version, hostType, repository, source: 'unpaywall' }
 *     pdfUrl      direct link to a PDF, or null when only a free-to-read page exists
 *     landingUrl  page describing that copy, or null (at least one of the two is set)
 *     license     e.g. "cc-by", or null when Unpaywall does not know it
 *     version     "publishedVersion", "acceptedVersion" or "submittedVersion", or null
 *     hostType    "publisher" or "repository", or null
 *     repository  name of the hosting institution for repository copies, else null
 *   or
 *   { found: false, reason }
 *     'invalid_doi'     the text is not a DOI
 *     'not_configured'  UNPAYWALL_EMAIL is missing (or Unpaywall refused the address)
 *     'no_open_copy'    Unpaywall knows the paper but lists no usable free copy
 *     'not_found'       Unpaywall does not know this DOI
 *     'rate_limited'    Unpaywall asked us to slow down
 *     'unavailable'     timeout, network problem or an unexpected answer
 */
async function findOpenAccessPdf(input) {
  try {
    // The argument is read inside the try block so that even a call with nothing, or with
    // null, ends in a normal "invalid_doi" answer and not in an error.
    const doi = input && typeof input === 'object' ? input.doi : undefined;
    const cleanDoi = normalizeDoi(typeof doi === 'string' ? doi : '');
    if (!cleanDoi) return { found: false, reason: 'invalid_doi' };

    if (process.env.OFFLINE_MODE === 'true') {
      return findOffline(cleanDoi);
    }

    const email = getConfiguredEmail();
    if (!email) return { found: false, reason: 'not_configured' };

    const cached = getCached(cleanDoi);
    if (cached) return cached;

    if (Date.now() < rateLimitedUntil) {
      return { found: false, reason: 'rate_limited' };
    }

    // The DOI goes into the address path. Each part is encoded so that odd characters
    // (#, ?, spaces) cannot change the meaning of the address, while the "/" that every
    // DOI contains is kept as it is, which is the form Unpaywall documents.
    const doiPath = cleanDoi.split('/').map(encodeURIComponent).join('/');
    const url = `${UNPAYWALL_BASE_URL}/${doiPath}?email=${encodeURIComponent(email)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let result;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
        },
      });

      if (res.status === 429) {
        rateLimitedUntil = Date.now() + readRetryAfterMs(res);
        await discardBody(res);
        return { found: false, reason: 'rate_limited' };
      }
      if (res.status === 404) {
        await discardBody(res);
        result = { found: false, reason: 'not_found' };
      } else if (res.status === 422) {
        // Unpaywall answers 422 when it rejects the e-mail address (missing, or a
        // placeholder such as an example.com address). That is a setup problem on our
        // side, so it is reported the same way as a missing address and not stored.
        await discardBody(res);
        return { found: false, reason: 'not_configured' };
      } else if (!res.ok) {
        await discardBody(res);
        return { found: false, reason: 'unavailable' };
      } else {
        // Reading the body is still covered by the timeout above.
        const data = await res.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return { found: false, reason: 'unavailable' };
        }
        result = pickOpenCopy(data);
      }
    } finally {
      // Always stop the timer, otherwise it would keep the process alive after a test run.
      clearTimeout(timer);
    }

    setCached(cleanDoi, result);
    return { ...result };
  } catch (err) {
    // Timeout, DNS failure, connection reset, a body that is not JSON... The caller only
    // needs to know it did not work this time.
    return { found: false, reason: 'unavailable' };
  }
}

module.exports = {
  findOpenAccessPdf,
  // Only for the test suite: lets a test start from a clean state and use a short timeout.
  __testing: {
    reset() {
      oaCache.clear();
      rateLimitedUntil = 0;
      requestTimeoutMs = 6000;
    },
    setTimeoutMs(ms) {
      requestTimeoutMs = ms;
    },
    cacheSize() {
      return oaCache.size;
    },
    isSafePublicUrl,
    MAX_CACHE_ENTRIES,
    POSITIVE_TTL_MS,
    NEGATIVE_TTL_MS,
  },
};
