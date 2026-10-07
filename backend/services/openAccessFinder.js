
const { normalizeDoi } = require('../utils/doiNormalizer');
const { isValidDocumentUrl, isPrivateIpOrHost } = require('../utils/urlValidator');

const UNPAYWALL_BASE_URL = 'https://api.unpaywall.org/v2';

let requestTimeoutMs = 6000;

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
  return { ...item.data };
}

function setCached(doi, data) {
  if (!oaCache.has(doi) && oaCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = oaCache.keys().next().value;
    oaCache.delete(oldestKey);
  }
  const ttl = data.found ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  oaCache.set(doi, { data: { ...data }, expiresAt: Date.now() + ttl });
}

const DEFAULT_RATE_LIMIT_PAUSE_MS = 60 * 1000;
const MAX_RATE_LIMIT_PAUSE_MS = 10 * 60 * 1000;
let rateLimitedUntil = 0;

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

function getConfiguredEmail() {
  const email = String(process.env.UNPAYWALL_EMAIL || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

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
    if (bare === host && !host.includes('.')) return false;
    return true;
  } catch (err) {
    return false;
  }
}

async function discardBody(res) {
  try {
    if (res && res.body && typeof res.body.cancel === 'function') await res.body.cancel();
  } catch (err) {
  }
}

function safeUrlOrNull(value) {
  return isSafePublicUrl(value) ? value.trim() : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

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

  for (const loc of locations) {
    const pdfUrl = safeUrlOrNull(loc.url_for_pdf);
    if (pdfUrl) {
      return buildFound(loc, pdfUrl, safeUrlOrNull(loc.url_for_landing_page));
    }
  }

  for (const loc of locations) {
    const landingUrl = safeUrlOrNull(loc.url_for_landing_page) || safeUrlOrNull(loc.url);
    if (landingUrl) {
      return buildFound(loc, null, landingUrl);
    }
  }

  return { found: false, reason: 'no_open_copy' };
}

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

async function findOpenAccessPdf(input) {
  try {
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
        await discardBody(res);
        return { found: false, reason: 'not_configured' };
      } else if (!res.ok) {
        await discardBody(res);
        return { found: false, reason: 'unavailable' };
      } else {
        const data = await res.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return { found: false, reason: 'unavailable' };
        }
        result = pickOpenCopy(data);
      }
    } finally {
      clearTimeout(timer);
    }

    setCached(cleanDoi, result);
    return { ...result };
  } catch (err) {
    return { found: false, reason: 'unavailable' };
  }
}

module.exports = {
  findOpenAccessPdf,
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
