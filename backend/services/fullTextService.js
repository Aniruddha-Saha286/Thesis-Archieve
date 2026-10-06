/**
 * Full-Text Reader Service
 *
 * Downloads the free PDF of a paper and returns the authors' OWN words from the parts readers ask
 * about most: Limitations, Future work, Conclusion, Data availability and Code availability, plus
 * the code and dataset links the paper mentions.
 *
 * No AI is involved and nothing is written for the authors. Every piece of text returned here is
 * copied from the PDF. The only changes are to white space (lines are joined into paragraphs) and
 * to words that the PDF split with a hyphen at the end of a line. When a part cannot be found the
 * answer for it is null. It is never guessed.
 *
 * The work is done in six steps, each one exported so it can be tested by itself:
 *   1. fetchPdfBuffer      download, with protection against requests to internal addresses
 *   2. extractPdfText      turn the PDF into lines of text (needs the optional package pdfjs-dist)
 *   3. splitIntoSections   find the headings and cut the text into sections
 *   4. extractKeySections  pick the limitations / future work / conclusion / availability text
 *   5. findResourceLinks   pick the code and dataset links
 *   6. readPaperFullText   all of the above, with a cache and a small queue
 */

const crypto = require('crypto');
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const { Worker } = require('worker_threads');
const { isValidHttpUrl, isPrivateIpOrHost, isPublicIpAddress } = require('../utils/urlValidator');

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const DEFAULT_MAX_MB = 15;
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 4;

// Theses are long, and the parts we want sit near the end. Reading the first 60 pages and the
// last 15 covers almost every paper completely and keeps the work for a 300-page thesis bounded.
const DEFAULT_MAX_PAGES = 75;
const TAIL_PAGES = 15;
// In a long thesis the conclusion chapter is often followed by more than 15 pages of references
// and appendices. Up to this many extra pages may be read to reach it (see planExtraPages).
const SEEK_PAGES = 30;
// Reading runs on the main thread. This is the longest one PDF may keep it busy.
const DEFAULT_PARSE_BUDGET_MS = 20000;
// Limits against a PDF built to waste the server's time or memory. An honest page of a thesis
// has a few thousand pieces of text and a few thousand characters; a printed line has a few hundred.
const MAX_ITEMS_PER_PAGE = 25000;
const MAX_CHARS_PER_PAGE = 60000;
const MAX_LINE_CHARS = 1200;
// The PDF is read in a separate thread. That thread is stopped when it passes these limits,
// so one bad file cannot freeze the site or use up its memory.
const WORKER_HARD_LIMIT_MS = DEFAULT_PARSE_BUDGET_MS + 10000;
const WORKER_MAX_HEAP_MB = 384;
// A small file can unpack into hundreds of megabytes. While a PDF is being read the server's
// memory is watched; the reading is stopped when it has grown by more than this (FULLTEXT_MAX_MEMORY_MB).
const DEFAULT_MEMORY_GROWTH_MB = 400;

const KEY_TEXT_LIMIT = 1400;
const MAX_LINKS = 15;

const CACHE_MAX_ENTRIES = 40;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 60 * 1000;
const MAX_WAITING = 3;

// The same honest identification the search providers use, so a repository administrator who
// sees these requests in a log can tell who made them and how to reach the site.
const DEFAULT_USER_AGENT =
  'ThesisArchive/1.0 (https://projectpanther.org; reads open-access PDFs to show their limitations and conclusion sections; mailto:panther.thesis.vault@gmail.com)';

function maxBytesFromEnv() {
  const mb = Number(process.env.FULLTEXT_MAX_MB);
  const safe = Number.isFinite(mb) && mb > 0 ? Math.min(mb, 100) : DEFAULT_MAX_MB;
  return Math.floor(safe * 1024 * 1024);
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ===========================================================================
// 1. Download
// ===========================================================================

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function defaultLookup(hostname) {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

/**
 * Resolves a host name and returns its addresses, or null when the host, or ANY address it
 * resolves to, is not an ordinary public internet address.
 *
 * Checking the name alone is not enough: "papers.example.org" may be a DNS record that points at
 * 127.0.0.1, at 10.x.x.x or at the cloud metadata address 169.254.169.254.
 */
async function resolvePublicAddresses(hostname, lookup) {
  const host = String(hostname || '')
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (!host || isPrivateIpOrHost(host)) return null;
  if (/(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/.test(host)) return null;

  const family = net.isIP(host);
  if (family) return isPublicIpAddress(host) ? [{ address: host, family }] : null;

  const found = await lookup(host);
  const list = (Array.isArray(found) ? found : [found])
    .map((entry) => (typeof entry === 'string' ? { address: entry } : entry))
    .filter((entry) => entry && typeof entry.address === 'string')
    .map((entry) => ({ address: entry.address, family: net.isIP(entry.address) }));
  if (list.length === 0) throw new Error('Host name did not resolve to any address');
  if (list.some((entry) => !entry.family || !isPublicIpAddress(entry.address))) return null;
  return list;
}

/**
 * The default way of making one HTTP request. It never follows redirects by itself, and it
 * connects only to the addresses that were checked a moment ago.
 *
 * Why not the built-in fetch(): fetch() looks the host name up a second time when it connects. A
 * hostile DNS server can answer the first lookup with a public address and the second with an
 * internal one ("DNS rebinding"). Handing the checked addresses to the socket closes that gap.
 */
function pinnedHttpRequest(urlString, { headers, signal, addresses } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const transport = target.protocol === 'https:' ? https : http;
    const options = { method: 'GET', headers, signal, agent: false };
    if (Array.isArray(addresses) && addresses.length > 0) {
      options.lookup = (hostname, lookupOptions, callback) => {
        const done = typeof lookupOptions === 'function' ? lookupOptions : callback;
        const wantsAll = lookupOptions && typeof lookupOptions === 'object' && lookupOptions.all;
        if (wantsAll) done(null, addresses.map((a) => ({ address: a.address, family: a.family })));
        else done(null, addresses[0].address, addresses[0].family);
      };
    }
    const request = transport.request(target, options, (response) => {
      resolve({
        status: response.statusCode,
        headers: {
          get(name) {
            const value = response.headers[String(name).toLowerCase()];
            if (Array.isArray(value)) return value[0];
            return value === undefined ? null : value;
          },
        },
        body: response,
      });
    });
    request.on('error', reject);
    request.end();
  });
}

/** Stops a response we are not going to read, so its socket is closed instead of left hanging. */
function discardBody(response) {
  try {
    const body = response && response.body;
    if (!body) return;
    if (typeof body.destroy === 'function') body.destroy();
    else if (typeof body.cancel === 'function') Promise.resolve(body.cancel()).catch(() => {});
  } catch {
    // nothing useful can be done if closing fails
  }
}

function toBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  if (chunk instanceof ArrayBuffer) return Buffer.from(chunk);
  return Buffer.from(String(chunk));
}

/**
 * Looks at the first bytes of a download. Returns true when they are the start of a PDF, false
 * when they are something else, and null when too few bytes have arrived to tell.
 *
 * A URL that ends in ".pdf" proves nothing: publishers often answer it with an HTML sign-in page.
 */
function startsLikePdf(buffer) {
  let i = 0;
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) i = 3; // byte-order mark
  while (i < buffer.length && i < 64 && buffer[i] <= 0x20) i++; // stray blank lines before the header
  if (buffer.length - i < 5) return i >= 64 ? false : null;
  return buffer.toString('latin1', i, i + 5) === '%PDF-';
}

/**
 * Downloads a PDF into memory.
 *
 * Safety rules, applied to the first address and again to every redirect:
 *   - only http and https, and no user name or password inside the URL
 *   - the host name is resolved here and refused when any of its addresses is private, loopback,
 *     link-local, carrier-grade NAT, multicast or a cloud metadata address (IPv4 and IPv6)
 *   - at most 4 redirects, one overall time limit, and a hard size limit while the body arrives
 *   - the body must really be a PDF
 *
 * opts: { lookup, fetchImpl, timeoutMs, maxBytes, maxRedirects, userAgent }
 *   lookup(hostname)        -> address list, as dns.promises.lookup(host, { all: true }) returns
 *   fetchImpl(url, options) -> { status, headers: { get(name) }, body }, where body can be read
 *                              with "for await". It receives redirect: 'manual' and must not
 *                              follow redirects itself. Tests pass stubs for both.
 *
 * Returns { ok: true, buffer, finalUrl, bytes } or { ok: false, reason }. It does not throw.
 */
async function fetchPdfBuffer(url, opts = {}) {
  const timeoutMs = positiveNumber(opts.timeoutMs, positiveNumber(process.env.FULLTEXT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
  const maxBytes = positiveNumber(opts.maxBytes, maxBytesFromEnv());
  const maxRedirects = Number.isInteger(opts.maxRedirects) && opts.maxRedirects >= 0 ? opts.maxRedirects : MAX_REDIRECTS;
  const lookup = typeof opts.lookup === 'function' ? opts.lookup : defaultLookup;
  const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : pinnedHttpRequest;
  const headers = {
    'User-Agent': opts.userAgent || process.env.FULLTEXT_USER_AGENT || DEFAULT_USER_AGENT,
    Accept: 'application/pdf,*/*;q=0.5',
    // No compression: the size limit below must count the bytes that are really kept in memory.
    'Accept-Encoding': 'identity',
  };

  if (typeof url !== 'string' || !url.trim()) return { ok: false, reason: 'invalid_url' };
  let current;
  try {
    current = new URL(url.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  // One clock for the whole download: DNS, every redirect and the body together.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // A lookup or a stub may ignore the abort signal, so every wait also races against this promise.
  const whenAborted = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  whenAborted.catch(() => {});
  const guarded = (promise) => Promise.race([promise, whenAborted]);

  let response = null;
  try {
    for (let hop = 0; ; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') return { ok: false, reason: 'invalid_url' };
      if (current.username || current.password) return { ok: false, reason: 'invalid_url' };

      const addresses = await guarded(resolvePublicAddresses(current.hostname, lookup));
      if (!addresses) return { ok: false, reason: 'blocked_host' };

      response = await guarded(
        fetchImpl(current.href, { method: 'GET', headers, redirect: 'manual', signal: controller.signal, addresses })
      );
      const status = Number(response && response.status);

      if (REDIRECT_STATUSES.has(status)) {
        const location = response.headers && response.headers.get('location');
        discardBody(response);
        response = null;
        if (!location) return { ok: false, reason: `http_${status}` };
        if (hop >= maxRedirects) return { ok: false, reason: 'too_many_redirects' };
        try {
          current = new URL(location, current);
        } catch {
          return { ok: false, reason: 'invalid_url' };
        }
        continue; // the new address goes through every check above again
      }

      if (!(status >= 200 && status < 300)) return { ok: false, reason: `http_${status || 0}` };

      const declared = Number(response.headers && response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: 'too_large' };

      // Read the body piece by piece so that an oversized or endless download is cut off early.
      const chunks = [];
      let bytes = 0;
      let headChecked = false;
      const body = response.body;
      if (body && typeof body[Symbol.asyncIterator] === 'function') {
        const iterator = body[Symbol.asyncIterator]();
        try {
          for (;;) {
            const step = await guarded(iterator.next());
            if (step.done) break;
            const chunk = toBuffer(step.value);
            bytes += chunk.length;
            if (bytes > maxBytes) return { ok: false, reason: 'too_large' };
            chunks.push(chunk);
            if (!headChecked) {
              // Decide from the first bytes, so a 10 MB web page is not downloaded for nothing.
              const verdict = startsLikePdf(chunks.length === 1 ? chunk : Buffer.concat(chunks));
              if (verdict === false) return { ok: false, reason: 'not_pdf' };
              if (verdict === true) headChecked = true;
            }
          }
        } finally {
          if (typeof iterator.return === 'function') Promise.resolve(iterator.return()).catch(() => {});
        }
      } else if (response && typeof response.arrayBuffer === 'function') {
        const whole = Buffer.from(await guarded(response.arrayBuffer()));
        bytes = whole.length;
        if (bytes > maxBytes) return { ok: false, reason: 'too_large' };
        chunks.push(whole);
      }

      const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      if (startsLikePdf(buffer) !== true) return { ok: false, reason: 'not_pdf' };
      return { ok: true, buffer, finalUrl: current.href, bytes };
    }
  } catch {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
    discardBody(response);
    controller.abort(); // closes the socket when we leave early; harmless after a full read
  }
}

// ===========================================================================
// 2. PDF -> lines of text
// ===========================================================================

let pdfjsPromise = null;
let pdfjsFailedAt = 0;
let pdfjsLoaderOverride = null;

function resolvePdfjsEntry() {
  // CommonJS resolution is used on purpose: it honours NODE_PATH and the normal node_modules
  // folders, while import() of a bare package name does not look at NODE_PATH at all.
  return require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
}

/** True when the optional package pdfjs-dist is installed. Cheap; safe to call on every request. */
function isPdfReaderAvailable() {
  try {
    resolvePdfjsEntry();
    return true;
  } catch {
    return false;
  }
}

/**
 * pdf.js is written for browsers. When its optional drawing package (@napi-rs/canvas) is missing
 * it stops while loading because the browser class DOMMatrix does not exist in Node. We never
 * draw a page, we only read its text, so empty stand-ins are enough to let it load.
 */
function ensureBrowserStandIns(entryPath) {
  if (typeof globalThis.DOMMatrix !== 'undefined' && typeof globalThis.Path2D !== 'undefined') return;
  try {
    const canvas = createRequire(entryPath)('@napi-rs/canvas');
    if (canvas && canvas.DOMMatrix && canvas.Path2D) return; // pdf.js will pick up the real classes itself
  } catch {
    // not installed, or its native part does not load on this machine
  }
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class TextOnlyDOMMatrix {
      constructor(init) {
        const m = Array.isArray(init) && init.length >= 6 ? init : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = m;
      }
    };
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class TextOnlyPath2D {};
  }
}

/** Runs fn while hiding the "Warning: ..." lines pdf.js prints when it starts under Node. */
async function withoutPdfjsWarnings(fn) {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const isNoise = (args) => typeof args[0] === 'string' && /^(Warning|Info|Deprecated API usage): /.test(args[0]);
  console.warn = (...args) => (isNoise(args) ? undefined : originalWarn.apply(console, args));
  console.log = (...args) => (isNoise(args) ? undefined : originalLog.apply(console, args));
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}

/**
 * Loads pdf.js the first time it is needed. Resolves to null, and never throws, when the package
 * is not installed or does not run on this version of Node.
 */
function loadPdfjs() {
  if (pdfjsLoaderOverride) return Promise.resolve().then(pdfjsLoaderOverride);
  if (pdfjsPromise) return pdfjsPromise;
  // After a failure, do not search the disk again on every request.
  if (pdfjsFailedAt && Date.now() - pdfjsFailedAt < 60000) return Promise.resolve(null);

  let entry;
  try {
    entry = resolvePdfjsEntry();
  } catch {
    pdfjsFailedAt = Date.now();
    return Promise.resolve(null);
  }

  pdfjsPromise = withoutPdfjsWarnings(async () => {
    ensureBrowserStandIns(entry);
    const lib = await import(pathToFileURL(entry).href);
    // Character maps (needed for Chinese, Japanese and Korean text) and the standard font
    // metrics are shipped inside the package.
    const root = path.resolve(path.dirname(entry), '..', '..');
    return { lib, root };
  }).catch((err) => {
    pdfjsPromise = null;
    pdfjsFailedAt = Date.now();
    console.warn(`[fullText] pdfjs-dist is installed but could not be loaded: ${err && err.message}`);
    return null;
  });
  return pdfjsPromise;
}

function median(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = numbers.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** The entry of a tally Map with the highest count. */
function topOfTally(tally) {
  let best = null;
  let bestCount = -1;
  for (const [key, count] of tally) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Groups text pieces that sit on the same baseline into rows.
 * The tolerance lets a raised footnote mark or a lowered index stay on its line.
 */
function clusterRows(items) {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let row = null;
  for (const item of sorted) {
    const tolerance = row ? Math.min(5, Math.max(2, 0.4 * Math.max(row.size, item.size))) : 0;
    if (row && Math.abs(row.y - item.y) <= tolerance) {
      row.items.push(item);
      if (item.size > row.size) {
        row.size = item.size;
        row.y = item.y; // the largest letters decide where the baseline is
      }
    } else {
      row = { y: item.y, size: item.size, items: [item] };
      rows.push(row);
    }
  }
  return rows;
}

/**
 * The unbroken stretches of text in a row (normal word gaps do not break a stretch), each as
 * [start, end, pieces].
 */
function rowIntervals(row) {
  const items = row.items.slice().sort((a, b) => a.x - b.x);
  const intervals = [];
  for (const item of items) {
    const last = intervals[intervals.length - 1];
    if (last && item.x - last[1] < 0.8 * row.size) {
      last[1] = Math.max(last[1], item.x + item.w);
      last[2].push(item);
    } else {
      intervals.push([item.x, item.x + item.w, [item]]);
    }
  }
  return intervals;
}

/**
 * Finds the empty vertical strip between two text columns, or returns null for a one-column page.
 *
 * A strip counts as a column gap when it lies near the middle of the page, few rows cross it,
 * the text on its left reaches it on many rows (so the left side is a column of running text and
 * not a table of short labels) and there is text on its right.
 */
function findColumnGutter(rows, pageWidth) {
  if (rows.length < 8 || !(pageWidth > 0)) return null;
  const BIN = 2;
  const bins = Math.ceil(pageWidth / BIN) + 1;
  const from = Math.floor(bins * 0.3);
  const to = Math.ceil(bins * 0.7);
  const cover = new Uint16Array(bins);
  const allIntervals = rows.map(rowIntervals);
  for (const intervals of allIntervals) {
    for (const [start, end] of intervals) {
      const first = Math.max(from, Math.floor(start / BIN));
      const last = Math.min(to, Math.floor(end / BIN));
      for (let b = first; b <= last; b++) cover[b]++;
    }
  }

  let least = Infinity;
  for (let b = from; b <= to; b++) least = Math.min(least, cover[b]);
  const allowed = least + Math.floor(rows.length * 0.03);
  // The widest run of nearly empty bins is the gap.
  let best = null;
  let runStart = -1;
  for (let b = from; b <= to + 1; b++) {
    const empty = b <= to && cover[b] <= allowed;
    if (empty && runStart < 0) runStart = b;
    if (!empty && runStart >= 0) {
      if (!best || b - runStart > best[1] - best[0]) best = [runStart, b];
      runStart = -1;
    }
  }
  if (!best) return null;
  const left = best[0] * BIN;
  const right = best[1] * BIN;
  if (right - left < 4) return null;

  let crossing = 0;
  let leftRows = 0;
  let leftFull = 0;
  let rightRows = 0;
  for (const intervals of allIntervals) {
    let crosses = false;
    let leftEdge = -Infinity;
    let hasRight = false;
    for (const [start, end] of intervals) {
      if (start < left + 1 && end > right - 1) crosses = true;
      else if (end <= left + 1) leftEdge = Math.max(leftEdge, end);
      else if (start >= right - 1) hasRight = true;
    }
    if (crosses) {
      crossing++;
      continue;
    }
    if (leftEdge > -Infinity) {
      leftRows++;
      if (left - leftEdge <= pageWidth * 0.1) leftFull++;
    }
    if (hasRight) rightRows++;
  }
  if (crossing > rows.length * 0.5) return null;
  if (leftFull < 6 || leftFull < leftRows * 0.4 || rightRows < 2) return null;
  return { left, right, mid: (left + right) / 2 };
}

/** Turns rows of positioned pieces into lines of text, with the facts later steps need. */
function rowsToLines(rows) {
  const lines = [];
  for (const row of rows) {
    const items = row.items.slice().sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    let previous = null;
    const wideGaps = [];
    const sizeTally = new Map();
    const fontTally = new Map();
    for (const item of items) {
      // Some PDFs fake bold type by printing the same words twice on the same spot.
      if (previous && item.str === previous.str && Math.abs(item.x - previous.x) < 1) continue;
      if (previous) {
        const gap = item.x - end;
        const unit = Math.min(previous.size, item.size);
        if (gap > Math.max(2.2 * unit, 14)) wideGaps.push(gap); // a hole this wide may separate table cells
        // A gap of an eighth of the letter height is already a word space: in a tightly set
        // line the spaces are squeezed, and "available at" must not fuse with the link after it.
        if (gap > 0.12 * unit && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
      }
      text += item.str;
      end = Math.max(end, item.x + item.w);
      const letters = item.str.trim().length;
      const sizeKey = Math.round(item.size * 2) / 2;
      sizeTally.set(sizeKey, (sizeTally.get(sizeKey) || 0) + letters);
      fontTally.set(item.font, (fontTally.get(item.font) || 0) + letters);
      previous = item;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    // Size of the line: the size most letters have. Headings in small capitals mix a large first
    // letter with smaller ones; the slightly larger size is then the real size of the heading.
    const common = topOfTally(sizeTally);
    let size = common;
    for (const key of sizeTally.keys()) if (key > size && key <= common * 1.3) size = key;

    // Wide holes of exactly the same width are not a table: they are one justified line whose
    // few words were pulled apart to fill the column (common just before a long web address).
    const evenlyStretched = wideGaps.length >= 2 && Math.max(...wideGaps) - Math.min(...wideGaps) <= 0.1 * Math.max(...wideGaps);
    const cells = evenlyStretched ? 1 : wideGaps.length + 1;

    const x = items[0].x;
    lines.push({ text, size, x, xEnd: end, y: row.y, cells, font: topOfTally(fontTally) });
  }
  return lines;
}

/**
 * Marks where paragraphs start inside one column. A paragraph starts after a wider gap than
 * the usual line spacing, or with an indented first line. The first line of a column is left
 * unmarked unless it is indented, because the paragraph may continue from the previous column.
 */
function markParagraphStarts(lines) {
  if (lines.length < 2) return;
  const leftTally = new Map();
  for (const line of lines) leftTally.set(Math.round(line.x), (leftTally.get(Math.round(line.x)) || 0) + 1);
  const columnLeft = topOfTally(leftTally);
  const steps = [];
  for (let i = 1; i < lines.length; i++) {
    const step = lines[i - 1].y - lines[i].y;
    if (step > 0.7 * lines[i].size && step < 2.6 * lines[i].size) steps.push(step);
  }
  const usualStep = median(steps) || lines[0].size * 1.2;
  let previousIndented = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.x - columnLeft;
    const indented = indent >= 0.6 * line.size && indent <= 4 * line.size;
    if (i === 0) {
      if (indented) line.para = true;
    } else {
      line.para = lines[i - 1].y - line.y > 1.35 * usualStep || (indented && !previousIndented);
    }
    previousIndented = indented;
  }
}

/**
 * Manuscripts sent out for review, and many preprints, print a number beside every line. Those
 * numbers share a baseline with the text and would end up in front of every line ("118 The
 * main limitation ..."). A margin column of at least ten numbers that count up by one, from
 * the top of the page down, is removed here.
 */
function withoutLineNumbers(items, pageWidth) {
  const columns = new Map();
  for (const item of items) {
    const text = item.str.trim();
    if (!/^\d{1,4}$/.test(text)) continue;
    const inMargin = item.x + item.w < pageWidth * 0.16 || item.x > pageWidth * 0.88;
    if (!inMargin) continue;
    const key = Math.round((item.x + item.w) / 4); // line numbers are aligned on their right edge
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(item);
  }
  const remove = new Set();
  for (const column of columns.values()) {
    if (column.length < 10) continue;
    column.sort((a, b) => b.y - a.y);
    let steps = 0;
    for (let i = 1; i < column.length; i++) if (Number(column[i].str) === Number(column[i - 1].str) + 1) steps++;
    if (steps >= (column.length - 1) * 0.8) for (const item of column) remove.add(item);
  }
  return remove.size > 0 ? items.filter((item) => !remove.has(item)) : items;
}

/**
 * Rebuilds the lines of one page, in reading order, from the positioned text pieces pdf.js gives.
 *
 * rawItems: [{ str, transform: [a, b, c, d, x, y], width, fontName }]
 * view:     [x0, y0, x1, y1] of the page, in the same units
 *
 * On a two-column page the left column is read before the right one. Lines that run across both
 * columns (the title, a wide caption) keep their place: what is above them is read first.
 */
function buildPageLines(rawItems, view) {
  const x0 = view ? view[0] : 0;
  const y0 = view ? view[1] : 0;
  const width = view ? view[2] - view[0] : 612;
  const height = view ? view[3] - view[1] : 792;

  const items = [];
  for (const raw of rawItems || []) {
    if (!raw || typeof raw.str !== 'string' || !raw.str.trim() || !Array.isArray(raw.transform)) continue;
    const t = raw.transform;
    if (Math.abs(t[1]) > Math.abs(t[0])) continue; // text printed sideways, e.g. a stamp in the margin
    const size = Math.hypot(t[2], t[3]) || raw.height || 0;
    if (size < 2) continue; // too small to be meant for reading
    items.push({ str: raw.str, x: t[4] - x0, y: t[5] - y0, w: Number(raw.width) || 0, size, font: raw.fontName || '' });
  }
  if (items.length === 0) return { lines: [], columns: 1, width, height };

  const rows = clusterRows(withoutLineNumbers(items, width));
  const gutter = findColumnGutter(rows, width);

  // The lines of each column (or of the whole page), top to bottom.
  const groups = [];
  let ordered;
  if (!gutter) {
    ordered = rowsToLines(rows);
    groups.push(ordered);
  } else {
    const spanning = [];
    const leftItems = [];
    const rightItems = [];
    for (const row of rows) {
      // A row crosses the gap when one unbroken stretch of text covers it. It is a true
      // full-width line only when that stretch reaches well into both columns, or is a short
      // centred line such as a page number. A left-column line that merely pokes into the gap
      // must stay in its column, or the whole page would be read in the wrong order.
      const stretches = rowIntervals(row);
      const crossingStretch = stretches.find(([start, end]) => start < gutter.left + 1 && end > gutter.right - 1);
      let isSpan = false;
      if (crossingStretch) {
        const [start, end] = crossingStretch;
        const reachLeft = gutter.left - start;
        const reachRight = end - gutter.right;
        const centred = Math.abs((start + end) / 2 - gutter.mid) <= 12 && end - start < width * 0.3;
        isSpan = (reachLeft >= 30 && reachRight >= 30) || centred;
      }
      if (isSpan) {
        spanning.push(row);
        continue;
      }
      // Each unbroken stretch goes to one column as a whole. A line too long for its column (a
      // web address that could not be broken) sticks out into the gap; its last letters and its
      // full stop must stay with it and not be handed to the other column.
      for (const [start, end, pieces] of stretches) {
        const target = (start + end) / 2 < gutter.mid ? leftItems : rightItems;
        for (const item of pieces) target.push(item);
      }
    }
    const leftLines = rowsToLines(clusterRows(leftItems));
    const rightLines = rowsToLines(clusterRows(rightItems));
    const spanLines = rowsToLines(spanning);
    groups.push(leftLines, rightLines, spanLines);

    ordered = [];
    let li = 0;
    let ri = 0;
    for (const span of spanLines) {
      while (li < leftLines.length && leftLines[li].y > span.y) ordered.push(leftLines[li++]);
      while (ri < rightLines.length && rightLines[ri].y > span.y) ordered.push(rightLines[ri++]);
      ordered.push(span);
    }
    while (li < leftLines.length) ordered.push(leftLines[li++]);
    while (ri < rightLines.length) ordered.push(rightLines[ri++]);
  }

  // What most of the page is printed in: used to notice small print and emphasised lines.
  const sizeTally = new Map();
  const fontTally = new Map();
  for (const line of ordered) {
    sizeTally.set(line.size, (sizeTally.get(line.size) || 0) + line.text.length);
    fontTally.set(line.font, (fontTally.get(line.font) || 0) + line.text.length);
  }
  const bodySize = topOfTally(sizeTally);
  const bodyFont = topOfTally(fontTally);

  // Page furniture: running headers, footers, page numbers, the copyright line under the first
  // column. Such a line sits in the outer strip of the page and is either small print or stands
  // well apart from the text. It is never larger than the text, which keeps a chapter title at
  // the top of a page from being mistaken for a header.
  for (const line of ordered) {
    const fromTop = (height - line.y) / height;
    const fromBottom = line.y / height;
    const side = fromTop < 0.075 ? 'top' : fromBottom < 0.075 ? 'bottom' : null;
    if (!side || line.size > bodySize + 0.5) continue;
    let nearest = Infinity;
    for (const other of ordered) {
      if (other === line || other.xEnd < line.x || other.x > line.xEnd) continue;
      nearest = Math.min(nearest, Math.abs(other.y - line.y));
    }
    if (line.size < bodySize - 0.9 || nearest > 1.8 * bodySize) line.margin = side;
  }
  // Footnotes: a block of small print at the foot of a column whose first line starts with a
  // footnote mark ("1The protocol is described at ..."). They are kept apart from the running
  // text, which they would otherwise interrupt in the middle of a sentence.
  for (const group of groups) {
    const body = group.filter((line) => !line.margin);
    let first = body.length;
    while (first > 0 && body[first - 1].size < bodySize - 0.9) first--;
    // Footnotes are a few lines under normal text. A long run of small print, or small print
    // under a "References" heading, is a reference list set in a smaller size and is left alone.
    if (first === 0 || body.length - first > 12) continue;
    if (body.slice(0, first).some((line) => /^(?:references?|bibliography|works cited|literature cited)$/i.test(line.text))) continue;
    // Other small print may sit right above the footnotes (a table, a caption): start at the mark.
    while (first < body.length && !/^(?:\d{1,2}|[*†‡§¶])\s?[A-Z"“]/.test(body[first].text)) first++;
    for (let i = first; i < body.length; i++) body[i].note = true;
  }
  // Paragraphs are marked after the furniture is known, so that the distance between a running
  // header and the first line of the page is not read as the start of a new paragraph.
  for (const group of groups) markParagraphStarts(group.filter((line) => !line.margin && !line.note));
  const top = ordered.filter((line) => line.margin === 'top');
  const bottom = ordered.filter((line) => line.margin === 'bottom');
  const middle = ordered.filter((line) => !line.margin);

  const lines = [...top, ...middle, ...bottom].map((line) => {
    const out = { text: line.text, size: line.size, x: round1(line.x), y: round1(line.y) };
    if (line.para !== undefined) out.para = line.para;
    if (line.margin) out.margin = line.margin;
    if (line.note) out.note = true;
    if (line.cells > 1) out.cells = line.cells;
    if (line.font !== bodyFont) out.emph = true; // printed in another typeface than the page's text: bold, italic...
    return out;
  });
  return { lines, columns: gutter ? 2 : 1, width: round1(width), height: round1(height) };
}

async function outlinePageNumber(doc, dest) {
  try {
    const target = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(target) || target.length === 0) return null;
    const ref = target[0];
    if (Number.isInteger(ref)) return ref + 1;
    if (ref && typeof ref === 'object') return (await doc.getPageIndex(ref)) + 1;
  } catch {
    // a broken bookmark is simply ignored
  }
  return null;
}

const SEEK_TYPES = new Set(['conclusion', 'discussion', 'limitations', 'future_work', 'data_availability', 'code_availability']);

/**
 * For a document too long to read completely: which pages between the first block and the last
 * block should also be read because, according to the PDF's bookmarks, the conclusion,
 * limitations, future work or availability sections are there?
 */
async function pagesFromOutline(doc, firstSkipped, lastSkipped, budget) {
  let outline;
  try {
    outline = await doc.getOutline();
  } catch {
    return [];
  }
  if (!Array.isArray(outline) || outline.length === 0) return [];

  const flat = [];
  const walk = (entries, level) => {
    for (const entry of entries) {
      if (flat.length >= 600) return;
      flat.push({ title: String(entry.title || ''), dest: entry.dest, level });
      if (Array.isArray(entry.items) && entry.items.length) walk(entry.items, level + 1);
    }
  };
  walk(outline, 1);

  const wanted = new Set();
  for (let i = 0; i < flat.length && wanted.size < budget; i++) {
    const { types } = classifyHeadingTitle(flat[i].title);
    if (!types.some((type) => SEEK_TYPES.has(type))) continue;
    const start = await outlinePageNumber(doc, flat[i].dest);
    if (!start) continue;
    // The section runs to the next bookmark on the same or a higher level.
    let end = null;
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[j].level <= flat[i].level) {
        end = await outlinePageNumber(doc, flat[j].dest);
        break;
      }
    }
    const last = Math.min(end || start + 3, start + 12);
    for (let p = start; p <= last && wanted.size < budget; p++) {
      if (p >= firstSkipped && p <= lastSkipped) wanted.add(p);
    }
  }
  return [...wanted];
}

function titleKey(text) {
  return stripHeadingNumber(text).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The same question answered from the table of contents, for a PDF without bookmarks. The
 * contents page says "6 Conclusions ........ 84". Printed page numbers are not PDF page numbers
 * (the front pages are often counted separately), so the difference is measured first, from
 * headings that the contents page lists and that we can see in the pages already read.
 */
function pagesFromContents(headPages, firstSkipped, lastSkipped, budget) {
  const entries = [];
  let lastContentsPage = 0;
  for (const page of headPages.slice(0, 25)) {
    const found = [];
    const lines = page.lines.filter((line) => !line.margin && !line.note);
    for (const line of lines) {
      if (line.text.length > 200) continue;
      const match = /^(.{3,120}?)\s*(?:(?:\.\s?){3,}|\s)\s*(\d{1,4})$/.exec(line.text);
      if (!match || match[1].replace(/[^A-Za-z]/g, '').length < 3) continue;
      found.push({ title: match[1].replace(/[\s.]+$/, ''), printed: Number(match[2]) });
    }
    // A contents page is a page on which most lines end in a page number.
    if (found.length >= 4 && found.length >= lines.length * 0.5) {
      entries.push(...found);
      lastContentsPage = page.page;
    }
  }
  if (entries.length < 3) return [];

  const standsOn = new Map();
  for (const page of headPages) {
    if (page.page <= lastContentsPage) continue;
    for (const line of page.lines) {
      if (line.margin || line.text.length > 100) continue;
      const key = titleKey(line.text);
      if (key.length >= 4 && !standsOn.has(key)) standsOn.set(key, page.page);
    }
  }
  const differences = new Map();
  for (const entry of entries) {
    const actual = standsOn.get(titleKey(entry.title));
    if (actual !== undefined) differences.set(actual - entry.printed, (differences.get(actual - entry.printed) || 0) + 1);
  }
  const difference = topOfTally(differences);
  // One lucky match is not enough to trust when other matches disagree with it.
  if (difference === null || (differences.get(difference) < 2 && differences.size > 1)) return [];

  const depthOf = (title) => {
    const number = /^\s*(\d{1,2}(?:\.\d{1,2}){0,3})/.exec(title);
    return number ? number[1].split('.').length : 1;
  };
  const wanted = new Set();
  for (let i = 0; i < entries.length && wanted.size < budget; i++) {
    if (!classifyHeadingTitle(entries[i].title).types.some((type) => SEEK_TYPES.has(type))) continue;
    const start = entries[i].printed + difference;
    let end = null;
    for (let j = i + 1; j < entries.length; j++) {
      if (depthOf(entries[j].title) <= depthOf(entries[i].title)) {
        end = entries[j].printed + difference;
        break;
      }
    }
    const last = Math.min(end || start + 3, start + 12);
    for (let p = start; p <= last && wanted.size < budget; p++) {
      if (p >= firstSkipped && p <= lastSkipped) wanted.add(p);
    }
  }
  return [...wanted];
}

/** Which of the sections we look for have a heading on this page (used when there are no bookmarks). */
function seekTypesOnPage(page) {
  const found = new Set();
  for (const line of page.lines) {
    if (line.margin || line.text.length > 90 || isTocEntry(line.text)) continue;
    const bare = stripHeadingNumber(line.text);
    if (!STRICT_HEADING_RE.test(bare.replace(/[:.]$/, ''))) continue;
    for (const type of classifyHeadingTitle(bare).types) if (SEEK_TYPES.has(type)) found.add(type);
  }
  return found;
}

/**
 * The pieces of text on one page. They are taken as they arrive, and reading stops as soon as
 * the page holds more than any real page does: a file can pack many megabytes of text
 * instructions into a few kilobytes, and reading all of it would use up memory.
 */
async function readTextItems(page) {
  const params = { includeMarkedContent: false, disableNormalization: false };
  if (typeof page.streamTextContent !== 'function') {
    const content = await page.getTextContent(params);
    return Array.isArray(content.items) ? content.items.slice(0, MAX_ITEMS_PER_PAGE) : [];
  }
  const reader = page.streamTextContent(params).getReader();
  const items = [];
  let characters = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const item of (value && value.items) || []) {
        items.push(item);
        if (item && typeof item.str === 'string') characters += item.str.length;
      }
      if (items.length >= MAX_ITEMS_PER_PAGE || characters >= MAX_CHARS_PER_PAGE) {
        // pdf.js insists on a reason, and it must be an Error.
        await Promise.resolve(reader.cancel(new Error('page size limit reached'))).catch(() => {});
        break;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released by cancel()
    }
  }
  return items;
}

/**
 * Reads the text of a PDF held in memory.
 *
 * opts: { maxPages, tailPages, seekPages, useOutline, useContents, budgetMs }
 *   maxPages  how many pages to read at most before looking for end sections (default 75:
 *             the first 60 and, when the document is longer, the last 15)
 *
 * Returns { ok: true, pageCount, pagesRead, truncated, pages: [{ page, lines: [{ text, size }] }] }
 * (lines also carry position hints: x, y, para, margin, note, cells, emph; pages carry columns,
 * width and height) or { ok: false, reason } with reason 'reader_not_installed', 'encrypted',
 * 'unreadable', 'no_text_layer' or, when reading took longer than budgetMs and produced nothing
 * useful, 'timeout'. It does not throw.
 */
async function extractPdfText(buffer, opts = {}) {
  if (!buffer || !buffer.length) return { ok: false, reason: 'unreadable' };
  const loaded = await loadPdfjs();
  if (!loaded) return { ok: false, reason: 'reader_not_installed' };
  const { lib, root } = loaded;

  const maxPages = Math.max(1, Math.floor(positiveNumber(opts.maxPages, positiveNumber(process.env.FULLTEXT_MAX_PAGES, DEFAULT_MAX_PAGES))));
  const tailCount = Math.min(Math.floor(positiveNumber(opts.tailPages, TAIL_PAGES)), Math.floor(maxPages / 4));
  const headCount = maxPages - tailCount;
  const seekBudget = opts.seekPages === 0 ? 0 : Math.floor(positiveNumber(opts.seekPages, SEEK_PAGES));
  const budgetMs = positiveNumber(opts.budgetMs, DEFAULT_PARSE_BUDGET_MS);
  const startedAt = Date.now();

  // pdf.js takes the bytes over for itself, so it gets a private copy and the caller's buffer
  // stays usable.
  const data = new Uint8Array(buffer.length);
  data.set(buffer);

  let task = null;
  try {
    const params = {
      data,
      verbosity: 0, // errors only: no font warnings in the server log
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      enableXfa: false,
      stopAtErrors: false,
    };
    if (root) {
      params.cMapUrl = path.join(root, 'cmaps') + path.sep;
      params.cMapPacked = true;
      params.standardFontDataUrl = path.join(root, 'standard_fonts') + path.sep;
    }
    task = lib.getDocument(params);

    let doc;
    try {
      doc = await task.promise;
    } catch (err) {
      return { ok: false, reason: err && err.name === 'PasswordException' ? 'encrypted' : 'unreadable' };
    }

    const pageCount = doc.numPages;
    const read = new Map();
    let outOfTime = false;
    const readPage = async (number) => {
      if (read.has(number)) return read.get(number);
      if (Date.now() - startedAt > budgetMs) {
        outOfTime = true;
        return null;
      }
      let result;
      try {
        const page = await doc.getPage(number);
        const items = await readTextItems(page);
        const built = buildPageLines(items, page.view);
        result = { page: number, lines: built.lines, columns: built.columns, width: built.width, height: built.height };
        page.cleanup();
      } catch {
        result = { page: number, lines: [], columns: 1 }; // one damaged page should not lose the document
      }
      read.set(number, result);
      // Reading runs on the server's main thread. Stepping aside after every few pages lets
      // other requests be answered while a long thesis is being read.
      if (read.size % 4 === 0) await new Promise((resolve) => setImmediate(resolve));
      return result;
    };

    const keep = new Set();
    let extraPages = [];
    let tailFrom = pageCount + 1;
    if (pageCount <= maxPages) {
      for (let n = 1; n <= pageCount; n++) keep.add(n);
    } else {
      const tailStart = pageCount - tailCount + 1;
      tailFrom = tailStart;
      for (let n = 1; n <= headCount; n++) keep.add(n);
      for (let n = tailStart; n <= pageCount; n++) keep.add(n);

      if (seekBudget > 0 && tailStart - headCount > 1) {
        // 1. Trust the bookmarks when the PDF has them.
        let extra = opts.useOutline === false ? [] : await pagesFromOutline(doc, headCount + 1, tailStart - 1, seekBudget);
        // 2. Otherwise use the table of contents, which nearly every thesis has.
        if (extra.length === 0 && opts.useContents !== false) {
          // The contents pages and the first chapters are enough to work out where things are.
          const head = [];
          for (let n = 1; n <= Math.min(headCount, 40); n++) {
            const page = await readPage(n);
            if (page) head.push(page);
          }
          extra = pagesFromContents(head, headCount + 1, tailStart - 1, seekBudget);
        }
        // 3. Otherwise walk backwards from the last block until the conclusion heading turns up.
        if (extra.length === 0) {
          let earliest = null;
          for (let n = tailStart - 1, scanned = 0; n > headCount && scanned < seekBudget; n--, scanned++) {
            const page = await readPage(n);
            if (!page) break;
            const types = seekTypesOnPage(page);
            if (types.size > 0) earliest = n;
            if (types.has('conclusion') || types.has('discussion')) break;
          }
          if (earliest !== null) for (let n = earliest; n < tailStart; n++) extra.push(n);
        }
        for (const n of extra) keep.add(n);
        extraPages = extra;
      }
    }

    // Read in order of usefulness, so that a PDF that is slow to read and runs out of time
    // loses the middle of its first block rather than its conclusion: the opening pages first,
    // then the end sections, then the last block, then everything else.
    const order = [];
    for (let n = 1; n <= Math.min(10, pageCount); n++) order.push(n);
    order.push(...extraPages);
    for (let n = tailFrom; n <= pageCount; n++) order.push(n);
    order.push(...[...keep].sort((a, b) => a - b));
    for (const number of order) if (keep.has(number)) await readPage(number);
    const pages = [...keep].sort((a, b) => a - b).map((number) => read.get(number)).filter(Boolean);
    // Out of time before anything useful was read: say so, instead of blaming the document.
    if (pages.length === 0) return { ok: false, reason: outOfTime ? 'timeout' : 'no_text_layer' };

    // A scanned document is a pile of pictures. Without a text layer there is nothing to read
    // (a watermark or a stamp on each page does not count as text).
    let characters = 0;
    for (const page of pages) for (const line of page.lines) characters += line.text.length;
    if (characters < 200 || characters / pages.length < 40) return { ok: false, reason: outOfTime ? 'timeout' : 'no_text_layer' };

    return { ok: true, pageCount, pagesRead: pages.length, truncated: pages.length < pageCount, pages };
  } catch {
    return { ok: false, reason: 'unreadable' };
  } finally {
    // Frees the document and stops pdf.js's helper, so nothing keeps the process alive.
    if (task) await Promise.resolve(task.destroy()).catch(() => {});
  }
}

// ===========================================================================
// 3. Lines -> sections
// ===========================================================================

const SECTION_TYPES = [
  'abstract', 'introduction', 'related_work', 'method', 'results', 'discussion', 'limitations', 'future_work',
  'conclusion', 'data_availability', 'code_availability', 'acknowledgements', 'references', 'appendix', 'other',
];

// What a heading is about, judged from its words. A heading can be about two things
// ("Limitations and Future Work"); every match is kept, in the order the words appear.
const TITLE_TYPE_RULES = [
  ['references', /^(?:references?(?: cited)?|bibliography|works cited|literature cited|reference list|references and notes)$/],
  ['appendix', /^(?:appendi(?:x|ces)|annex(?:es)?|supplementa(?:ry|l) (?:materials?|information|data|files?)|supporting information)\b/],
  ['abstract', /^(?:abstract|executive summary)$/],
  ['data_availability', /\bdata (?:and (?:code|materials?|software) )?(?:availability|accessibility|sharing|access statement)|\bavailability of (?:the )?(?:data|datasets?|materials)|\bopen (?:data|research)\b|\bcode and data availability/],
  ['code_availability', /\b(?:code|software) (?:and data )?availability|\bavailability of (?:the )?(?:code|software|source code)|\bdata and (?:code|software) availability|\bavailability of data and (?:code|software)|\breproducibility\b/],
  ['limitations', /\blimitations?\b|\bthreats? to (?:the )?validity\b|\bshortcomings\b|\bweaknesses\b|\bcaveats\b/],
  ['future_work', /\bfuture (?:works?|research|directions?|scope|stud(?:y|ies)|plans?|enhancements?|improvements?|perspectives?|developments?|outlook|extensions?)\b|\boutlook\b|\bfurther (?:work|research|stud(?:y|ies))\b|\b(?:directions|recommendations|suggestions|avenues|opportunities) for (?:future|further)\b|\bopen (?:problems|questions|issues|challenges)\b|\bnext steps\b/],
  ['conclusion', /\bconclusions?\b|\b(?:concluding|closing|final) remarks\b/],
  ['discussion', /\bdiscussions?\b/],
  ['acknowledgements', /\backnowledge?ments?\b|\bfunding\b|\bauthors?'? contributions?\b|\bcredit authorship\b|\bconflicts? of interests?\b|\bcompeting interests?\b|^declarations?\b|^dedication$/],
  ['introduction', /\bintroduction\b/],
  ['related_work', /\brelated (?:works?|research|literature|studies)\b|\bliterature (?:review|survey)\b|\bbackground\b|\bstate of the art\b|\b(?:prior|previous) work\b/],
  ['method', /\bmethods?\b|\bmethodolog(?:y|ies)\b|\bapproach\b|\bproposed (?:system|framework|model|solution)\b|\bexperimental (?:setup|set-up|design)\b|\b(?:system|study|research) design\b|\bimplementation\b|\bdata collection\b|\bmaterials\b/],
  ['results', /\bresults?\b|\bfindings\b|\bevaluation\b|\bexperiments?\b|\banalysis\b|\bperformance\b/],
];

const SUMMARY_TITLE_RE = /^(?:chapter )?summary(?: of (?:the )?(?:findings|results|contributions|thesis|work|study|chapter))?$/;

/** Removes "5.2", "VI.", "Chapter 5:", "Appendix A" and similar from the front of a heading. */
function stripHeadingNumber(title) {
  return String(title || '')
    .replace(/^\s*(?:chapter|part|section)\s+(?:\d{1,3}|[ivxlc]{1,7}|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*[:.\-–—]?\s*/i, '')
    .replace(/^\s*\d{1,2}(?:\.\d{1,2}){0,3}\.?\s+/, '')
    .replace(/^\s*[IVXL]{1,6}\.\s+/, '')
    .replace(/^\s*[A-Z]\.\s+(?=[A-Z])/, '')
    .trim();
}

/**
 * Says what kind of section a heading opens.
 * Returns { type, types }: type is the first kind named in the heading, types lists all of them.
 */
function classifyHeadingTitle(title, context = {}) {
  const raw = String(title || '').trim();
  const bare = stripHeadingNumber(raw).toLowerCase().replace(/[:.]+$/, '').replace(/\s+/g, ' ').replace(/&/g, 'and').trim();
  if (!bare) return { type: 'other', types: ['other'] };
  if (/^appendi(?:x|ces)\b/i.test(raw)) return { type: 'appendix', types: ['appendix'] };
  // "Summary" means different things in different places: the abstract on the opening pages,
  // the conclusion when it is a main heading or sits inside the conclusion chapter, and merely
  // the end of a chapter otherwise ("2.6 Summary"). The caller says where the heading stands.
  if (SUMMARY_TITLE_RE.test(bare)) {
    if (bare === 'summary' && context.page && context.page <= 3 && !context.sawAbstract) return { type: 'abstract', types: ['abstract'] };
    if (context.mainHeading || context.insideConclusion) return { type: 'conclusion', types: ['conclusion'] };
    return { type: 'other', types: ['other'] };
  }

  const found = [];
  for (const [type, rule] of TITLE_TYPE_RULES) {
    const match = bare.match(rule);
    if (match) found.push({ type, index: match.index });
  }
  if (found.length === 0) return { type: 'other', types: ['other'] };
  for (const exact of ['references', 'appendix', 'abstract']) {
    if (found.some((entry) => entry.type === exact)) return { type: exact, types: [exact] };
  }
  found.sort((a, b) => a.index - b.index);
  const types = [...new Set(found.map((entry) => entry.type))];
  return { type: types[0], types };
}

// Headings that are accepted even when they are printed no larger than the text and carry no
// number. The whole line has to be one of these phrases; a sentence that merely contains the
// word "limitations" must never be taken for a heading.
const STRICT_HEADING_RE = new RegExp(
  '^(?:' +
    [
      'abstract', 'summary', 'executive summary', 'keywords?', 'index terms', 'introduction', 'background', 'motivation',
      'related works?', 'literature review', 'prior work', 'previous work', 'state of the art',
      '(?:materials? and )?methods?', 'methods and materials', '(?:research )?methodology',
      'proposed (?:method|approach|system|methodology|framework|model)',
      'experimental (?:setup|set-up|design|results|evaluation)', 'experiments?(?: and results)?', 'evaluation', 'implementation',
      'results?', 'findings', 'results? and (?:discussions?|analysis)', '(?:general )?discussions?', 'analysis',
      'discussions? and (?:conclusions?|future work|limitations|implications|outlook)',
      '(?:study |research |key |main |potential |methodological )?limitations?',
      'limitations? (?:of|and) [a-z ,-]{3,50}', 'strengths and limitations(?: of [a-z ]{3,30})?', 'scope and limitations',
      'challenges and limitations', 'threats to (?:the )?validity',
      'future (?:works?|research|directions?|scope|studies|enhancements?|improvements?|perspectives|outlook|plans?)(?: and [a-z ]{3,30})?',
      '(?:directions|recommendations|suggestions|opportunities|avenues) for (?:future|further) (?:work|research|studies|study)',
      'further (?:work|research)', 'outlook', 'open (?:problems|questions|issues|challenges)',
      '(?:general |overall |final )?conclusions?', 'conclusions? (?:and|&) [a-z ,-]{3,50}',
      '(?:concluding|closing|final) remarks', 'summary and (?:conclusions?|outlook|future work|discussion)',
      '(?:discussion|summary|recommendations|outlook|future work|limitations) and conclusions?',
      'data availability(?: statement)?', 'data and (?:code|materials?|software) availability(?: statement)?',
      'availability of (?:data|code|software)(?: and (?:materials?|code|data|software))?',
      'data accessibility(?: statement)?', 'data access statement', 'data sharing(?: statement)?', 'open (?:data|research)(?: statement)?',
      'code availability(?: statement)?', 'code and data availability(?: statement)?', 'software(?: and data)? availability',
      'reproducibility(?: statement)?', 'supplementary (?:materials?|information|data)', 'supporting information',
      'acknowledge?ments?', 'funding(?: information| statement)?', "authors?'? contributions?",
      'credit authorship contribution statement', 'conflicts? of interests?', 'competing interests?',
      'declaration of (?:competing |conflicting )?interests?', 'declarations?', 'ethics (?:statement|approval)',
      'ethical (?:approval|considerations|statement)', 'dedication',
      'references?(?: cited)?', 'bibliography', 'works cited', 'literature cited', 'reference list',
      'appendix(?: [a-z0-9]{1,3})?', 'appendices', 'annex(?:es)?', 'nomenclature', 'abbreviations',
      'list of (?:figures|tables|abbreviations|symbols|acronyms|publications)', 'table of contents', 'contents',
    ].join('|') +
    ')$',
  'i'
);

const TOC_TITLE_RE = /^(?:table of contents|contents|list of (?:figures|tables|abbreviations|symbols|acronyms|publications))$/i;

// A heading that sits at the start of its paragraph: "Limitations. Our study ..." or
// "Data availability: The data ...". Only these labels are accepted, with a capital first letter.
const RUN_IN_RE =
  /^(Abstract|Index Terms|Keywords|Key words|Limitations?(?: and Future (?:Work|Directions|Research))?|Limitations? of (?:the|this) (?:Study|Work)|Threats to Validity|Future (?:Work|Directions|Research)|Data (?:and (?:Code|Materials) )?Availability(?: Statement)?|Code (?:and Data )?Availability(?: Statement)?|Availability of (?:Data|Code)(?: and (?:Materials?|Code|Data))?|Data Accessibility|Reproducibility(?: Statement)?|Acknowledge?ments?|Funding|Author Contributions?|Conflicts? of Interest|Competing Interests?)\s*(?:[.:—–]|\s-)\s*(\S.*)$/i;

const CAPTION_RE =
  /^(?:fig(?:ure)?s?\.?|table|tab\.|algorithm|listing|scheme|chart|plate|exhibit|supplementary (?:figure|table))\s*(?:[0-9]+(?:\.[0-9]+)*[a-z]?|[IVXL]+|[A-Z]\.?[0-9]+)(?![A-Za-z0-9])\s*(.*)$/i;

// Copyright and licence notes that appear once, in the margin of the first page.
const NOTICE_RE = /©|\(c\)\s*(?:19|20)\d\d|copyright|all rights reserved|licen[cs]ed (?:use|under)|creative commons|\bISBN\b|\bISSN\b|\b97[89]-\d|\$\d+\.\d\d|downloaded (?:from|on)|arxiv:\d/i;

const PAGE_NUMBER_RE = /^(?:(?:page|p\.)\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$|^[-–—]\s*\d{1,4}\s*[-–—]$|^(?=[ivx])x{0,3}(?:ix|iv|v?i{0,3})$|^\d{1,4}\s*\|\s*p\s*a\s*g\s*e$|^p\s*a\s*g\s*e\s*\|?\s*\d{1,4}$/i;

function cleanLineText(text) {
  // No printed line is this long. Cutting it here keeps every later check quick, whatever the file holds.
  return String(text == null ? '' : text)
    .slice(0, MAX_LINE_CHARS)
    .replace(/\u00ad$/, '-') // a "soft hyphen" at the end of a line is a line-break hyphen
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A contents line: a title, a row of dots, a page number. */
function isTocEntry(text) {
  return /(?:\.[ \u00a0]?){5,}\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*$/i.test(text) || /[.·…_]{5,}\s*\S{1,6}$/.test(text);
}

function romanToInt(text) {
  const match = /^(X{0,3})(IX|IV|V?I{0,3})$/.exec(text);
  if (!match || !text) return 0;
  const ones = { '': 0, I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 };
  return match[1].length * 10 + ones[match[2]];
}

function isAllCaps(text) {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 && letters === letters.toUpperCase();
}

/** "Summary of Findings" and "RELATED WORK" look like titles; "Collect the data first" does not. */
function isTitleLike(text) {
  if (isAllCaps(text)) return true;
  const words = text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length === 0 || !/^["“(]?[A-Z0-9]/.test(words[0])) return false;
  const major = words.slice(1).filter((word) => word.replace(/[^A-Za-z]/g, '').length >= 4);
  if (major.length === 0) return true;
  return major.filter((word) => /^["“(]?[A-Z]/.test(word)).length / major.length >= 0.6;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Is `next` the number that may follow `last` in a numbered outline (5.1 -> 5.2, 5.1.1 or 6)? */
function isNextSectionNumber(last, next) {
  if (!last) return next.length === 1 && next[0] <= 2;
  if (next.length > last.length + 1) return false;
  if (next.length === last.length + 1) {
    return last.every((part, i) => part === next[i]) && next[next.length - 1] <= 1;
  }
  const k = next.length - 1;
  for (let i = 0; i < k; i++) if (next[i] !== last[i]) return false;
  return next[k] === last[k] + 1;
}

function normaliseRepeatKey(text) {
  return text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

/**
 * Words of the document that are written with a hyphen ("low-cost") and without one. They decide
 * whether "low-" at the end of a line followed by "cost" is one hyphenated word or a word that
 * was only split to fit the line ("general-" + "ization").
 */
function buildVocabulary(records) {
  const hyphenated = new Set();
  const plain = new Set();
  for (const record of records) {
    const lower = record.text.toLowerCase();
    for (const match of lower.matchAll(/[a-z]+(?:-[a-z]+)+/g)) {
      const parts = match[0].split('-');
      for (let i = 0; i + 1 < parts.length; i++) hyphenated.add(`${parts[i]}-${parts[i + 1]}`);
    }
    for (const match of lower.matchAll(/[a-z]{5,}/g)) plain.add(match[0]);
  }
  return { hyphenated, plain };
}

const URL_JOIN_STOPWORDS = new Set([
  'and', 'or', 'under', 'for', 'with', 'the', 'in', 'on', 'at', 'to', 'is', 'are', 'which', 'where', 'as', 'by', 'from',
  'that', 'this', 'we', 'it', 'was', 'were', 'has', 'have', 'be', 'can', 'will', 'a', 'an', 'of', 'our', 'all', 'see',
  'accessed', 'last', 'retrieved', 'but', 'so', 'while', 'when', 'also', 'both', 'these', 'those', 'their', 'its',
]);

/** Does a web address at the end of one line carry on at the start of the next line? */
function urlContinues(previousText, nextText) {
  const tail = previousText.match(/(?:https?:\/{0,2}|www\.)\S*$/i) || previousText.match(/(?:^|\s)((?:[a-z0-9-]+\.)+[a-z]{2,6}\/\S*)$/i);
  if (!tail) return false;
  const last = previousText[previousText.length - 1];
  const nextToken = nextText.split(/\s/)[0] || '';
  const nextWord = nextToken.replace(/[^A-Za-z0-9]+$/, '').toLowerCase();
  if (!/^[A-Za-z0-9/?#&=._~%-]/.test(nextToken)) return false;
  if (last === '-') return /^[A-Za-z0-9]/.test(nextToken); // an address never ends with a hyphen
  if (/[/_=?&%~+#:]/.test(last)) return !URL_JOIN_STOPWORDS.has(nextWord);
  if (last === '.') {
    // "…/record/1." at the end of a sentence must not swallow the first word of the next one.
    return /^[a-z0-9]/.test(nextToken) && (/[/_]/.test(nextToken) || /^(?:com|org|net|edu|io|gov|html?|pdf|git|zip|php)\b/.test(nextToken));
  }
  return /^[/?#&=]/.test(nextToken);
}

/**
 * Joins lines into running text. Returns the text and "marks" that remember on which page each
 * part of the text was printed.
 */
function composeText(records, vocabulary, usualLength) {
  // The text is collected as a list of pieces and joined once at the end. Only the last few
  // hundred characters ("tail") are needed to decide how the next line is attached, so the work
  // per line stays the same however long the section becomes.
  const pieces = [];
  let length = 0;
  let tail = '';
  const marks = [];
  let previous = null;
  let currentPage = null;
  for (const record of records) {
    const piece = record.bodyText !== undefined ? record.bodyText : record.text;
    if (!piece) continue;
    let joiner = ' ';
    if (!previous) {
      joiner = '';
    } else if (urlContinues(tail, piece)) {
      joiner = '';
    } else {
      const broken = /([A-Za-zÀ-ɏ]{2,})[-‐]$/.exec(tail);
      const carries = /^([a-zß-ɏ]{2,})/.exec(piece);
      if (broken && carries) {
        const left = broken[1].toLowerCase();
        const right = carries[1].toLowerCase();
        const keepHyphen = vocabulary.hyphenated.has(`${left}-${right}`) && !vocabulary.plain.has(left + right);
        if (!keepHyphen) {
          // Drop the line-break hyphen from the end of the line before.
          pieces[pieces.length - 1] = pieces[pieces.length - 1].slice(0, -1);
          tail = tail.slice(0, -1);
          length--;
        }
        joiner = '';
      } else {
        let newParagraph;
        if (record.para !== undefined) newParagraph = record.para;
        else newParagraph = /[.!?:]["'”’)\]]*$/.test(previous.text) && previous.text.length < usualLength * 0.75 && /^["“(\[]?[A-Z0-9]/.test(piece);
        if (newParagraph && /[.!?:]["'”’)\]]*$/.test(tail)) joiner = '\n\n';
      }
    }
    if (record.page !== currentPage) {
      marks.push([length + joiner.length, record.page]);
      currentPage = record.page;
    }
    pieces.push(joiner + piece);
    length += joiner.length + piece.length;
    tail = (tail + joiner + piece).slice(-300);
    previous = record;
  }
  return { text: pieces.join(''), marks };
}

/**
 * Reading may start in the middle of a reference list (the last pages of a long thesis), where
 * no "References" heading tells us what the lines are. Reference entries give themselves away:
 * most lines carry a year, and many carry "et al.", "pp.", "vol.", a journal or a DOI.
 */
function looksLikeReferenceList(records) {
  if (records.length < 2) return false;
  let withYear = 0;
  let withMarks = 0;
  for (const record of records) {
    if (/\b(?:19|20)\d{2}[a-z]?\b/.test(record.text)) withYear++;
    if (/^\[\d{1,3}\]|\bet al\b|\bpp?\.\s*\d|\bvol\.|\bdoi\b|\bjournal\b|\bproceedings\b|\bconference\b|\bpress\b|\(\d{4}[a-z]?\)/i.test(record.text)) withMarks++;
  }
  return withYear >= records.length * 0.3 && withMarks >= Math.max(2, records.length * 0.3);
}

const analysisCache = new WeakMap();

/**
 * The shared work behind splitIntoSections and findResourceLinks: clean the lines, find the
 * headings and build the sections. The result is remembered per `pages` array, so asking for
 * the sections and then for the links does the work once.
 */
function analysePages(pages) {
  if (!Array.isArray(pages)) return { sections: [], noteBlocks: [] };
  if (analysisCache.has(pages)) return analysisCache.get(pages);

  // ---- 1. One flat list of lines ----------------------------------------------------------
  const sortedPages = pages
    .filter((page) => page && Array.isArray(page.lines))
    .slice()
    .sort((a, b) => (Number(a.page) || 0) - (Number(b.page) || 0));
  let records = [];
  sortedPages.forEach((page, pageIndex) => {
    const pageNumber = Number(page.page) || pageIndex + 1;
    const previousNumber = pageIndex > 0 ? Number(sortedPages[pageIndex - 1].page) || pageIndex : null;
    const lines = page.lines.filter((line) => line && cleanLineText(line.text));
    lines.forEach((line, index) => {
      records.push({
        text: cleanLineText(line.text),
        size: Number(line.size) || 0,
        page: pageNumber,
        y: typeof line.y === 'number' ? line.y : null,
        margin: line.margin || null,
        note: Boolean(line.note),
        para: typeof line.para === 'boolean' ? line.para : undefined,
        cells: Number(line.cells) || 1,
        emph: Boolean(line.emph),
        edge: index < 2 || index >= lines.length - 2, // among the first or last two lines of its page
        // Pages were skipped before this one (a long thesis is not read completely).
        gapBefore: index === 0 && previousNumber !== null && pageNumber > previousNumber + 1,
      });
    });
  });
  const pageTotal = sortedPages.length;

  // The size most of the text is printed in. Headings are measured against it.
  const sizeTally = new Map();
  for (const record of records) {
    if (record.size > 0) {
      const key = Math.round(record.size * 2) / 2;
      sizeTally.set(key, (sizeTally.get(key) || 0) + record.text.length);
    }
  }
  const bodySize = sizeTally.size > 0 ? topOfTally(sizeTally) : 0;
  const isLarger = (record) => bodySize > 0 && record.size >= bodySize + 0.8;

  // ---- 2. Running headers, footers and page numbers -----------------------------------------
  // (a) the same words on several pages; (b) small print at the same height on most pages, which
  // also catches headers whose words change with the chapter; (c) bare page numbers.
  const textPages = new Map();
  const heightPages = new Map();
  for (const record of records) {
    if (!record.edge && !record.margin) continue;
    const key = normaliseRepeatKey(record.text);
    if (!textPages.has(key)) textPages.set(key, new Set());
    textPages.get(key).add(record.page);
    if (record.margin && record.y !== null) {
      const bucket = `${record.margin}:${Math.round(record.y / 4)}`;
      if (!heightPages.has(bucket)) heightPages.set(bucket, new Set());
      heightPages.get(bucket).add(record.page);
    }
  }
  const repeatNeeded = pageTotal <= 3 ? 2 : 3;
  records = records.filter((record) => {
    if (!record.edge && !record.margin) return true;
    if (PAGE_NUMBER_RE.test(record.text)) return false;
    if (isLarger(record)) return true; // a chapter title at the top of every chapter is not a header
    if (pageTotal >= 2 && record.text.length <= 150 && textPages.get(normaliseRepeatKey(record.text)).size >= repeatNeeded) return false;
    if (record.margin) {
      if (NOTICE_RE.test(record.text)) return false;
      if (record.y !== null) {
        const bucket = Math.round(record.y / 4);
        let seenOn = 0;
        for (const b of [bucket - 1, bucket, bucket + 1]) {
          const set = heightPages.get(`${record.margin}:${b}`);
          if (set) seenOn = Math.max(seenOn, set.size);
        }
        if (seenOn >= 3 && seenOn >= pageTotal * 0.5) return false;
      }
    }
    return true;
  });
  // What is left of the page margins and the footnotes is not running text. It is set aside and
  // only searched for links ("1Code: https://github.com/...").
  const notes = records.filter((record) => record.margin || record.note);
  records = records.filter((record) => !record.margin && !record.note);

  // A gap marker must survive when the first line of its page was removed just now.
  let lastPage = null;
  const pageOrder = sortedPages.map((page, index) => Number(page.page) || index + 1);
  for (const record of records) {
    if (record.page !== lastPage) {
      const position = pageOrder.indexOf(record.page);
      record.gapBefore = position > 0 && record.page > pageOrder[position - 1] + 1;
      lastPage = record.page;
    } else {
      record.gapBefore = false;
    }
  }

  const lengths = records.filter((record) => record.text.length > 20 && !isTocEntry(record.text)).map((record) => record.text.length);
  // The usual length of a full line of text: the upper part of the spread, because paragraphs
  // end in short lines.
  const usualLength = lengths.length > 0 ? lengths.slice().sort((a, b) => a - b)[Math.floor(lengths.length * 0.7)] : 80;
  const vocabulary = buildVocabulary(records);

  // ---- 3. Headings --------------------------------------------------------------------------
  const state = {
    toc: false,
    tocMisses: 0,
    inReferences: false,
    sawRoman: false,
    lastRoman: 0,
    lastLetter: '',
    lastNumber: null,
    rejectedNumber: null,
    caption: null,
    topSize: 0, // size of the main section headings, to tell sub-headings apart
    topType: 'other', // kind of the main section we are inside
    sawTitle: false, // the paper's own title has been passed
    sawKnown: false, // a heading of a known kind has been passed
    plainLevel: 0, // level given to the latest heading printed as small as the text
    depth: 1,
    sawAbstract: false,
  };

  const endsParagraph = (index) => {
    const record = records[index];
    const previous = records[index - 1];
    if (!previous || record.gapBefore) return true;
    if (previous.heading || previous.drop) return true;
    if (record.para === true) return true;
    if (/[.!?:;)\]"”’]$/.test(previous.text)) return true;
    return previous.text.length < usualLength * 0.6;
  };
  const nextIsBody = (index) => {
    const next = records[index + 1];
    return !next || !/^[a-z]/.test(next.text);
  };

  const detectHeading = (index) => {
    const record = records[index];
    const text = record.text;
    const larger = isLarger(record);
    if (text.length < 3 || text.length > 120) return null;
    const sentenceEnd = /[.;,]$/.test(text);
    const afterBreak = endsParagraph(index);
    const followed = nextIsBody(index);
    const restricted = state.inReferences || state.toc; // inside a reference list or a contents page

    // (a) "Chapter 5", "Chapter 5: Conclusion", "Appendix A", "Part II"
    const chapter = /^(chapter|appendix|part)\s+(\d{1,2}|[ivxlc]{1,6}|[a-z])(?![a-z0-9])\s*[:.\-–—]?\s*(.*)$/i.exec(text);
    if (chapter && (larger || (afterBreak && followed && !state.toc))) {
      const rest = chapter[3];
      const type = /^appendix/i.test(chapter[1]) ? 'appendix' : null;
      if (rest) {
        const fine = /^["“(]?[A-Z0-9]/.test(rest) && rest.length <= 90 && (larger || (!sentenceEnd && wordCount(rest) <= 10 && isTitleLike(rest)));
        if (fine) return { title: text, level: 1, kind: 'chapter', forcedType: type };
      } else {
        // The title is often on the next line, in large type: "Chapter 5" / "Conclusion".
        let title = text;
        let extra = 0;
        for (let k = 1; k <= 2; k++) {
          const next = records[index + k];
          if (!next || next.page !== record.page || next.text.length > 90 || /[.;,]$/.test(next.text)) break;
          const bigEnough = bodySize > 0 ? isLarger(next) : isTitleLike(next.text) && wordCount(next.text) <= 10;
          if (!bigEnough || (k === 2 && Math.abs(next.size - records[index + 1].size) > 0.3)) break;
          if (CAPTION_RE.test(next.text) || /^\d/.test(next.text)) break;
          title += ` ${next.text}`;
          extra = k;
        }
        if (extra > 0 || larger) return { title, level: 1, kind: 'chapter', extra, forcedType: type };
      }
    }

    // (b) "5. Limitations", "5.2 Limitations and Future Work", "5 Conclusion"
    const numbered = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(.+)$/.exec(text);
    if (numbered) {
      const number = numbered[1].split('.').map(Number);
      const title = numbered[2];
      const known = classifyHeadingTitle(title).type !== 'other';
      const looksLikeReference = /\b(?:19|20)\d{2}\b/.test(title) || /\bet al\b/i.test(title) || (title.match(/,/g) || []).length >= 2;
      let accept = false;
      if (/^["“(]?[A-Z]/.test(title) && title.length <= 100 && wordCount(title) <= 14 && !/[;,]$/.test(title)) {
        if (larger) accept = !looksLikeReference || known;
        else if (!restricted && afterBreak && followed && !sentenceEnd && !looksLikeReference) {
          // A numbered list ("1. Collect photographs", "2. Train the model") restarts at 1 in the
          // middle of the document; real section numbers continue from the previous heading.
          const inSequence = isNextSectionNumber(state.lastNumber, number);
          const listItem = state.rejectedNumber !== null && number.length === 1 && number[0] === state.rejectedNumber + 1;
          const short = text.length <= usualLength * 0.8;
          if (known && wordCount(title) <= 9 && (inSequence || (short && isTitleLike(title) && !listItem))) accept = true;
          else if (inSequence && !listItem && wordCount(title) <= 10 && (short || isTitleLike(title))) accept = true;
          if (!accept && number.length === 1) state.rejectedNumber = number[0];
        }
      }
      if (accept) return { title: text, level: Math.min(number.length, 4), kind: 'numbered', number };
    }

    // (c) "VI. CONCLUSION" as in IEEE papers, and their lettered sub-headings "A. Data Collection"
    const roman = /^([IVX]{1,6})\.\s+(.+)$/.exec(text);
    if (roman && !restricted) {
      const value = romanToInt(roman[1]);
      const title = roman[2];
      if (value > 0 && title.length <= 90 && !sentenceEnd && /^[A-Z]/.test(title) && !/,/.test(title) && wordCount(title) <= 10) {
        const known = classifyHeadingTitle(title).type !== 'other';
        const inSequence = value === state.lastRoman + 1 || (value === 1 && state.lastRoman === 0);
        if (larger || (afterBreak && followed && (isAllCaps(title) || (isTitleLike(title) && (known || inSequence))))) {
          return { title: text, level: 1, kind: 'roman', roman: value };
        }
      }
    }
    const lettered = /^([A-Z])\.\s+([A-Z].*)$/.exec(text);
    if (lettered && state.sawRoman && !restricted && !sentenceEnd && afterBreak && followed) {
      const title = lettered[2];
      const expected = state.lastLetter ? String.fromCharCode(state.lastLetter.charCodeAt(0) + 1) : 'A';
      if ((lettered[1] === expected || lettered[1] === 'A') && title.length <= 70 && wordCount(title) <= 8 && !/,/.test(title) && isTitleLike(title)) {
        return { title: text, level: 2, kind: 'lettered', letter: lettered[1] };
      }
    }

    // (d) A heading at the start of its paragraph: "Abstract—...", "Limitations. Our study ..."
    const runIn = RUN_IN_RE.exec(text);
    if (runIn && /^[A-Z]/.test(runIn[1]) && /^["“(]?[A-Z0-9]/.test(runIn[2]) && afterBreak && !state.toc) {
      const label = runIn[1];
      const front = /^(?:abstract|index terms|keywords|key words)$/i.test(label);
      const allowed = state.inReferences ? !front : !front || record.page <= 3;
      if (allowed) return { title: label, level: front ? 1 : 3, kind: 'runin', bodyText: runIn[2] };
    }

    // (e) A known heading without a number: "Limitations", "Threats to Validity", "REFERENCES"
    const bare = text.replace(/[:.]$/, '');
    if (/^[A-Z]/.test(text) && wordCount(bare) <= 8 && bare.length <= 70 && STRICT_HEADING_RE.test(bare)) {
      const { type } = classifyHeadingTitle(bare);
      const exitsReferences = ['appendix', 'acknowledgements', 'data_availability', 'code_availability'].includes(type);
      const shape = isAllCaps(bare) || isTitleLike(bare) || wordCount(bare) <= 5;
      const standsAlone = bare.length <= usualLength * 0.75 || (records[index + 1] && records[index + 1].para === true);
      if (larger) return { title: text, kind: 'known' };
      if (afterBreak && followed && shape && standsAlone && !state.toc && (!state.inReferences || exitsReferences) && record.cells < 2) {
        return { title: text, kind: 'known', plain: true };
      }
    }

    // (f) Any short line printed larger than the text. On the opening pages the first such line
    // is the paper's title; the large lines after it (authors, university) are not headings.
    if (larger && text.length <= 100 && wordCount(text) <= 14 && /^["“(]?[A-Z0-9]/.test(text) && !sentenceEnd) {
      const frontMatter = record.page <= 2 && state.sawTitle && !state.sawKnown && !(records[index - 1] && records[index - 1].heading && Math.abs(records[index - 1].size - record.size) <= 0.3);
      if (text.replace(/[^A-Za-z]/g, '').length >= 3 && !frontMatter) return { title: text, kind: 'large' };
    }

    if (restricted || !afterBreak || !followed || sentenceEnd || record.cells >= 2) return null;

    // (g) A short line in capitals standing between two paragraphs: "EXPERIMENTAL SETUP"
    const next = records[index + 1];
    if (isAllCaps(text) && wordCount(text) <= 8 && text.replace(/[^A-Za-z]/g, '').length >= 8 && text.length <= usualLength * 0.8) {
      if (next && /^["“(]?[A-Z0-9]/.test(next.text) && !isAllCaps(next.text)) return { title: text, kind: 'caps', plain: true };
    }

    // (h) A short line in bold or italic type, on its own, followed by a full line of normal
    // text: the unnumbered sub-headings many journals use ("Implications for practice").
    if (record.emph && next && !next.emph && record.para !== false) {
      const letters = text.replace(/[^A-Za-z]/g, '').length;
      if (text.length <= 70 && wordCount(text) <= 9 && /^[A-Z]/.test(text) && letters >= text.length * 0.6 && letters >= 4) {
        if (next.text.length >= usualLength * 0.6 && /^["“(]?[A-Z0-9]/.test(next.text)) return { title: text, kind: 'emph', plain: true };
      }
    }
    return null;
  };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.gapBefore) {
      state.toc = false;
      state.caption = null;
    }

    // Contents pages: every entry is dropped, so that none of them is mistaken for a heading
    // and none of them ends up inside the text of a section.
    if (isTocEntry(record.text)) {
      record.drop = 'toc';
      continue;
    }
    if (state.toc) {
      if (/\s(?:\d{1,4}|[ivxlc]{1,6})$/i.test(record.text) && record.text.length < 130 && !isLarger(record)) {
        record.drop = 'toc';
        state.tocMisses = 0;
        continue;
      }
      if (!isLarger(record)) {
        state.tocMisses++;
        if (state.tocMisses >= 2) state.toc = false;
      }
    }

    // Captions of figures and tables. "Table 2 shows ..." is a sentence, not a caption: after
    // the number a caption has punctuation, a capital letter, or nothing at all.
    if (state.caption) {
      const open = state.caption;
      const sameType = !(open.size > 0 && record.size > 0) || Math.abs(record.size - open.size) <= 0.3;
      if (open.labelOnly || (open.lines < 6 && sameType && record.para !== true && !isLarger(record))) {
        record.drop = 'caption';
        open.lines++;
        open.labelOnly = false;
        if (/[.!?]$/.test(record.text) || record.text.length < usualLength * 0.7) state.caption = null;
        continue;
      }
      state.caption = null;
    }
    const caption = CAPTION_RE.exec(record.text);
    if (caption && !isLarger(record)) {
      const rest = caption[1];
      if (rest === '' || /^[.:|—–-]/.test(rest) || /^[A-Z]/.test(rest)) {
        record.drop = 'caption';
        const complete = rest !== '' && (/[.!?]$/.test(record.text) || record.text.length < usualLength * 0.7);
        state.caption = complete ? null : { size: record.size, lines: 1, labelOnly: rest === '' };
        continue;
      }
    }

    // Rows of a table: several separated cells on one line, with another such row or the
    // table's caption next to it. A single line like that is more likely stretched text.
    if (record.cells >= 2) {
      const before = records[i - 1];
      const after = records[i + 1];
      const afterTable = before && (before.drop === 'table' || before.drop === 'caption');
      if (afterTable || (after && after.cells >= 3) || (record.cells >= 3 && after && after.cells >= 2)) {
        record.drop = 'table';
        continue;
      }
    }

    const heading = detectHeading(i);
    if (!heading) continue;

    const classified = heading.forcedType
      ? { type: heading.forcedType, types: [heading.forcedType] }
      : classifyHeadingTitle(heading.title, { page: record.page, sawAbstract: state.sawAbstract });
    heading.type = classified.type;
    heading.types = classified.types;
    heading.size = record.size;

    // Levels for headings without a number come from their size. When unsure the heading is
    // treated as a main heading: a section that stands by itself is never merged into the text
    // of the section before it.
    const endMatter = ['abstract', 'references', 'acknowledgements', 'appendix', 'data_availability', 'code_availability'].includes(classified.type);
    const clearlySmaller = state.topSize > 0 && record.size > 0 && record.size < state.topSize * 0.85;
    if (heading.level === undefined) {
      if (endMatter) heading.level = 1;
      else if (heading.plain && heading.kind !== 'known') heading.level = state.plainLevel || Math.min(3, state.depth + 1);
      else if (heading.plain) heading.level = state.plainLevel || (clearlySmaller ? 2 : 1);
      else heading.level = clearlySmaller ? 2 : 1;
    }
    if (heading.plain && !endMatter) state.plainLevel = heading.level;
    else if (heading.kind !== 'runin') {
      if (heading.level === 1) state.plainLevel = 0;
      state.depth = heading.level;
    }
    const numberedKind = ['numbered', 'roman', 'chapter'].includes(heading.kind);
    if (heading.level === 1 && heading.kind !== 'runin' && !endMatter && (numberedKind || classified.type !== 'other')) {
      state.topSize = Math.max(state.topSize, record.size);
    }
    if (classified.type === 'other' && SUMMARY_TITLE_RE.test(stripHeadingNumber(heading.title).toLowerCase().replace(/[:.]+$/, ''))) {
      // Now that the level is known, decide what this "Summary" is (see classifyHeadingTitle).
      const again = classifyHeadingTitle(heading.title, { mainHeading: heading.level === 1, insideConclusion: heading.level > 1 && state.topType === 'conclusion' });
      heading.type = again.type;
      heading.types = again.types;
    }
    if (heading.level === 1 && heading.kind !== 'runin') state.topType = heading.type;
    if (heading.type !== 'other' || numberedKind) state.sawKnown = true;

    if (heading.kind === 'numbered') state.lastNumber = heading.number;
    if (heading.kind === 'chapter') {
      const chapterNumber = /^chapter\s+(\d{1,2})/i.exec(heading.title);
      if (chapterNumber) state.lastNumber = [Number(chapterNumber[1])];
    }
    if (heading.kind === 'roman') {
      state.sawRoman = true;
      state.lastRoman = heading.roman;
      state.lastLetter = '';
    }
    if (heading.kind === 'lettered') state.lastLetter = heading.letter;
    state.rejectedNumber = null;
    if (heading.type === 'abstract') state.sawAbstract = true;
    if (heading.kind !== 'runin' || heading.type !== 'other') {
      state.inReferences = heading.type === 'references';
    }
    state.toc = TOC_TITLE_RE.test(stripHeadingNumber(heading.title).replace(/[:.]$/, ''));
    state.tocMisses = 0;

    if (heading.kind === 'large') state.sawTitle = true;
    record.heading = heading;
    if (heading.bodyText !== undefined) record.bodyText = heading.bodyText;
    for (let k = 1; k <= (heading.extra || 0); k++) records[i + k].drop = 'heading';
    i += heading.extra || 0;
  }

  // A title that needs two lines: join a large line to the large line above it.
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record.heading || record.heading.kind === 'runin' || !isLarger(record)) continue;
    let merged = 0;
    for (let k = i + 1; k < records.length && merged < 2; k++) {
      const next = records[k];
      if (!next.heading || next.heading.kind !== 'large' || next.page !== record.page) break;
      if (Math.abs(next.size - record.size) > 0.3 || (record.heading.title + next.text).length > 160) break;
      record.heading.title += ` ${next.text}`;
      if (record.heading.type === 'other') {
        const again = classifyHeadingTitle(record.heading.title, { page: record.page });
        record.heading.type = again.type;
        record.heading.types = again.types;
      }
      next.heading = null;
      next.drop = 'heading';
      merged++;
    }
  }

  // Four or more headings in a row with no text between them are not headings. Large lines are
  // a title page (title, author, university, date) and stay as plain text; numbered ones are a
  // contents list without dots and are dropped.
  for (let i = 0; i < records.length; i++) {
    if (!records[i].heading) continue;
    const run = [];
    let k = i;
    while (k < records.length && (records[k].heading || records[k].drop === 'heading')) {
      if (records[k].heading && records[k].heading.kind === 'runin') break;
      // Chapter headings many pages apart are not a list, even when the pages between them
      // were not read.
      if (k > i && (records[k].gapBefore || records[k].page - records[k - 1].page > 1)) break;
      if (records[k].heading) run.push(k);
      k++;
    }
    if (run.length >= 4) {
      for (const index of run) {
        const heading = records[index].heading;
        const keepAsText = heading.kind === 'large' || heading.kind === 'known';
        records[index].heading = null;
        if (!keepAsText) records[index].drop = 'toc';
      }
    }
    i = Math.max(i, k - 1);
  }

  // ---- 4. Sections --------------------------------------------------------------------------
  const sections = [];
  let current = { title: '', type: 'other', types: ['other'], level: 0, startPage: records.length ? records[0].page : 1, records: [] };
  const close = () => {
    const composed = composeText(current.records, vocabulary, usualLength);
    if (!current.title && !composed.text) return;
    if (current.afterGap && looksLikeReferenceList(current.records)) {
      current.type = 'references';
      current.types = ['references'];
    }
    const endPage = current.records.length ? current.records[current.records.length - 1].page : current.startPage;
    const section = {
      title: current.title,
      type: current.type,
      types: current.types,
      level: current.level,
      startPage: current.startPage,
      endPage: Math.max(endPage, current.startPage),
      text: composed.text,
    };
    // Kept out of sight so that JSON output and comparisons in tests show only the public fields.
    Object.defineProperty(section, '_marks', { value: composed.marks, enumerable: false });
    Object.defineProperty(section, '_runIn', { value: Boolean(current.runIn), enumerable: false });
    sections.push(section);
  };
  for (const record of records) {
    if (record.gapBefore) {
      // Pages were skipped here, so whatever section was open does not continue. Its kind is
      // decided once its lines are known (see looksLikeReferenceList).
      close();
      current = { title: '', type: 'other', types: ['other'], level: 0, startPage: record.page, records: [], afterGap: true };
    }
    if (record.heading) {
      close();
      const heading = record.heading;
      current = {
        title: heading.title,
        type: heading.type,
        types: heading.types,
        level: heading.level,
        startPage: record.page,
        records: [],
        runIn: heading.kind === 'runin',
      };
      if (heading.kind === 'runin') current.records.push(record);
      continue;
    }
    if (record.drop) continue;
    current.records.push(record);
  }
  close();

  // Footnotes of each page as one small block of text, for the link finder.
  const noteBlocks = [];
  for (const note of notes) {
    const last = noteBlocks[noteBlocks.length - 1];
    if (last && last.page === note.page) last.records.push(note);
    else noteBlocks.push({ page: note.page, records: [note] });
  }
  for (const block of noteBlocks) block.text = composeText(block.records, vocabulary, usualLength).text;

  const result = { sections, bodySize, noteBlocks };
  analysisCache.set(pages, result);
  return result;
}

/**
 * Cuts the lines of a document into sections.
 *
 * pages: [{ page, lines: [{ text, size }] }] as returned by extractPdfText (hand-made input with
 * only text and size works too).
 *
 * Returns [{ title, type, types, level, startPage, endPage, text }]. `type` is one of
 * SECTION_TYPES. `types` lists every kind the heading names, so "Limitations and Future Work"
 * has type 'limitations' and types ['limitations', 'future_work']. Text before the first heading
 * is returned as a section with an empty title and level 0.
 */
function splitIntoSections(pages) {
  return analysePages(pages).sections;
}

// ===========================================================================
// 4. Sections -> the parts readers ask about
// ===========================================================================

const ABBREVIATIONS = new Set([
  'al', 'fig', 'figs', 'eq', 'eqs', 'eqn', 'tab', 'sec', 'sect', 'ref', 'refs', 'no', 'nos', 'vs', 'cf', 'e.g', 'i.e',
  'etc', 'dr', 'prof', 'mr', 'mrs', 'ms', 'st', 'approx', 'resp', 'ca', 'pp', 'vol', 'inc', 'ltd', 'co', 'jr', 'sr', 'viz',
  'ch', 'chap', 'app', 'def', 'thm', 'incl', 'est', 'dept', 'univ', 'ed', 'eds',
]);

/**
 * Finds the sentences of a text. Returns [{ start, end, para }], positions into the SAME string,
 * so that a sentence can be cut out exactly as it was printed. `para` counts paragraphs.
 */
function sentenceSpans(text) {
  const spans = [];
  let start = 0;
  let para = 0;
  const boundary = /([.!?]+["'”’)\]]*)(\s+)|\n\s*\n/g;
  let match;
  while ((match = boundary.exec(text))) {
    let end;
    let paragraphBreak = true;
    if (match[1] === undefined) {
      end = match.index; // a paragraph that ends without a full stop
    } else {
      end = match.index + match[1].length;
      paragraphBreak = /\n\s*\n/.test(match[2]);
      if (!paragraphBreak) {
        if (!/[A-Z0-9"“‘'(\[]/.test(text[boundary.lastIndex] || '')) continue;
        if (match[1][0] === '.') {
          const before = text.slice(Math.max(start, match.index - 14), match.index);
          const word = (/([A-Za-z.]+)$/.exec(before) || ['', ''])[1].toLowerCase();
          const lastPart = word.slice(word.lastIndexOf('.') + 1);
          if (lastPart.length === 1) continue; // an initial: "J. Smith", "U.S. data"
          if (ABBREVIATIONS.has(word) || ABBREVIATIONS.has(lastPart)) continue; // "et al. (2018)", "Fig. 3"
        }
      }
    }
    if (end > start) spans.push({ start, end, para });
    if (paragraphBreak) para++;
    start = boundary.lastIndex;
  }
  const lastEnd = text.replace(/\s+$/, '').length;
  if (lastEnd > start) spans.push({ start, end: lastEnd, para });
  return spans;
}

/**
 * Shortens a text to about `limit` characters, always at the end of a sentence, never inside
 * one. Nothing is added: no "..." is appended, the `truncated` flag says the text was cut.
 */
function capText(text, limit = KEY_TEXT_LIMIT) {
  const clean = String(text || '').trim();
  if (clean.length <= limit) return { text: clean, truncated: false };
  const spans = sentenceSpans(clean);
  let cut = 0;
  for (const span of spans) {
    if (span.end <= limit) cut = span.end;
    else break;
  }
  if (cut === 0) {
    // The very first sentence is longer than the limit: let it finish if it is close, otherwise
    // stop at a word.
    if (spans[0] && spans[0].end <= limit * 1.25) cut = spans[0].end;
    else cut = clean.lastIndexOf(' ', limit) > 0 ? clean.lastIndexOf(' ', limit) : limit;
  }
  return { text: clean.slice(0, cut).trim(), truncated: true };
}

// Words with which authors state a limitation. "Strong" ones are enough by themselves.
const LIMITATION_STRONG = [
  /\blimitations?\b/i,
  /\b(?:drawbacks?|shortcomings?|caveats?)\b/i,
  /\bweakness(?:es)?\b/i,
  /\bthreats? to (?:the )?(?:internal |external |construct )?validity\b/i,
  /\b(?:cannot|can not|could not|may not|might not|should not|do not|does not|did not)\s+(?:be\s+)?(?:readily\s+|easily\s+|necessarily\s+|directly\s+)?generali[sz]/i,
  /\bnot\s+(?:be\s+)?generali[sz]able\b/i,
  /\b(?:is|are|was|were|remains?)\s+(?:\w+\s+)?limited\s+(?:to|by|in)\b/i,
  /\b(?:interpreted|read|treated|viewed|taken|considered)\s+with\s+(?:care|caution)\b/i,
];
// "Weak" ones count only next to a strong one, in the same paragraph: "we did not measure ..."
// is a limitation after "The main limitation is ...", but not in the middle of a results section.
const LIMITATION_WEAK = [
  /\bwe\s+(?:did|do|could|were)\s*(?:not|n't)\s+(?:able to\s+)?(?:measure|collect|consider|examine|evaluate|test|include|account|control|assess|investigate|have|explore|study|address|compare|verify|validate|analy[sz]e)/i,
  /\b(?:was|were|is|are)\s+not\s+(?:possible|measured|available|assessed|evaluated|tested|considered|collected|included|examined|controlled)\b/i,
  /\b(?:small|limited|modest)\s+sample\b/i,
  /\bsample size\b/i,
  /\bsingle (?:site|cent(?:er|re)|institution|university|dataset|country|city|region|hospital|school)\b/i,
  /\bself[- ]report/i,
  /\bselection bias\b/i,
  /\bconfound/i,
  /\buntested\b/i,
  /\bmay not (?:transfer|hold|apply|extend|reflect)\b/i,
  /\bbeyond the scope\b/i,
  /\bremains? (?:unclear|unknown|untested)\b/i,
];
const FUTURE_STRONG = [
  /\bfuture (?:works?|research|stud(?:y|ies)|directions?|investigations?|efforts?|iterations?|versions?|experiments?|extensions?)\b/i,
  /\bin (?:the )?(?:near )?future\b/i,
  /\bfurther (?:research|work|stud(?:y|ies)|investigations?|experiments?|validation)\b/i,
  /\bwe (?:also )?(?:plan|intend|aim|hope|would like) to\b/i,
  /\b(?:remains?|left|leave) (?:\w+\s+){0,3}(?:for|as|to) future\b/i,
  /\bnext steps?\b/i,
  /\bwill be (?:explored|investigated|addressed|studied|extended|examined)\b/i,
  /\bfollow[- ]up (?:study|studies|work|research)\b/i,
];
// A sentence that carries on from the one before it.
const CONTINUES_RE = /^(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth|finally|lastly|also|additionally|moreover|furthermore|in addition|another|next|similarly|we also)\b/i;

function matchesAny(rules, text) {
  return rules.some((rule) => rule.test(text));
}

/**
 * Picks the sentences in which the authors themselves say what the rules look for. Returns
 * groups of neighbouring sentences as { start, end } positions into `text`.
 */
function pickCueSentences(text, strongRules, weakRules) {
  const spans = sentenceSpans(text);
  const strong = spans.map((span) => matchesAny(strongRules, text.slice(span.start, span.end)));
  const parasWithStrong = new Set(spans.filter((_, i) => strong[i]).map((span) => span.para));
  const chosen = spans.map((span, i) => {
    if (strong[i]) return true;
    return parasWithStrong.has(span.para) && matchesAny(weakRules, text.slice(span.start, span.end));
  });
  for (let i = 1; i < spans.length; i++) {
    if (!chosen[i] && chosen[i - 1] && spans[i].para === spans[i - 1].para && CONTINUES_RE.test(text.slice(spans[i].start, spans[i].end))) {
      chosen[i] = true;
    }
  }
  const groups = [];
  for (let i = 0; i < spans.length; i++) {
    if (!chosen[i]) continue;
    const last = groups[groups.length - 1];
    if (last && last.lastIndex === i - 1 && spans[i].para === spans[i - 1].para) {
      last.end = spans[i].end;
      last.lastIndex = i;
      last.count++;
    } else {
      groups.push({ start: spans[i].start, end: spans[i].end, lastIndex: i, count: 1, strong: 0 });
    }
    if (strong[i]) groups[groups.length - 1].strong++;
  }
  return groups;
}

function typesOfSection(section) {
  const own = Array.isArray(section.types) && section.types.length ? section.types : [section.type || 'other'];
  // Hand-made input may carry only one type; the title can still name a second purpose.
  const fromTitle = classifyHeadingTitle(section.title || '').types.filter((type) => type !== 'other');
  return [...new Set([...own, ...fromTitle])];
}

function pageAtOffset(section, offset) {
  let page = section.startPage;
  for (const [position, markPage] of section._marks || []) {
    if (position <= offset) page = markPage;
    else break;
  }
  return page === undefined ? null : page;
}

const NEVER_QUOTED = ['references', 'acknowledgements'];

/**
 * Picks the limitations, future work, conclusion, data availability and code availability text.
 *
 * Each answer is null or { text, sectionTitle, page, source, truncated }:
 *   source 'own_section'     the paper has a section for it; text is that section
 *   source 'within_section'  no such section; text is the sentences, inside the section named in
 *                            sectionTitle, in which the authors state it
 * Text is copied from the paper (see the note at the top of this file) and capped at about
 * 1,400 characters at the end of a sentence. Nothing is taken from the reference list, the
 * acknowledgements, the contents pages or captions.
 */
function extractKeySections(sections) {
  const result = { limitations: null, futureWork: null, conclusion: null, dataAvailability: null, codeAvailability: null };
  const list = (Array.isArray(sections) ? sections : []).filter((section) => section && typeof section.text === 'string');
  if (list.length === 0) return result;

  const types = list.map(typesOfSection);
  const level = (i) => (Number(list[i].level) > 0 ? Number(list[i].level) : 1);
  const quotable = (i) => !types[i].some((type) => NEVER_QUOTED.includes(type));

  // The sub-sections that belong to section i ("5.2.1 ..." under "5.2 Limitations").
  const childrenOf = (i) => {
    const children = [];
    if (!(Number(list[i].level) > 0)) return children;
    for (let j = i + 1; j < list.length; j++) {
      if (!(Number(list[j].level) > 0) || level(j) <= level(i)) break;
      children.push(j);
    }
    return children;
  };
  // Text of a section together with its sub-sections, leaving out those that are about
  // something else (the "Future Work" sub-section of a conclusion chapter, for instance).
  const gather = (i, skipTypes, alsoSkip = () => false) => {
    const parts = [];
    let own = list[i].text.trim();
    if (list[i]._runIn) own = own.split(/\n\s*\n/)[0]; // a paragraph heading covers its paragraph only
    if (own) parts.push(own);
    let skippingBelow = Infinity; // a skipped sub-section takes its own sub-sections with it
    for (const j of childrenOf(i)) {
      if (level(j) > skippingBelow) continue;
      skippingBelow = Infinity;
      if (!quotable(j) || alsoSkip(j) || types[j].some((type) => skipTypes.includes(type))) {
        skippingBelow = level(j);
        continue;
      }
      if (list[j].text.trim()) parts.push(list[j].text.trim());
    }
    return parts.join('\n\n');
  };
  const answer = (text, i, source, offset = 0) => {
    const capped = capText(text);
    if (!capped.text) return null;
    return { text: capped.text, sectionTitle: list[i].title || '', page: pageAtOffset(list[i], offset), source, truncated: capped.truncated };
  };
  const indexesOfType = (type) => list.map((_, i) => i).filter((i) => types[i].includes(type) && quotable(i));
  // Prefer a section that is only about the thing, then the last one in the document (a thesis
  // may mention "scope and limitations" in chapter 1 and discuss them properly near the end).
  const best = (candidates, type, skipTypes) => {
    const withText = candidates.filter((i) => gather(i, skipTypes).length >= 40);
    const only = withText.filter((i) => types[i].length === 1); // "Limitations"
    const mainly = withText.filter((i) => list[i].type === type); // "Limitations and Future Work"
    const pool = only.length ? only : mainly.length ? mainly : withText; // "Discussion and Limitations"
    return pool.length ? pool[pool.length - 1] : -1;
  };
  const firstFutureCue = (text) => {
    for (const span of sentenceSpans(text)) if (matchesAny(FUTURE_STRONG, text.slice(span.start, span.end))) return span.start;
    return -1;
  };

  // Sections in which authors usually state limitations and plans when there is no heading
  // for them: the discussion and the conclusion, with their sub-sections.
  const scope = [];
  list.forEach((_, i) => {
    if (!quotable(i) || !(types[i].includes('discussion') || types[i].includes('conclusion'))) return;
    for (const j of [i, ...childrenOf(i)]) if (quotable(j) && !scope.includes(j)) scope.push(j);
  });
  const withinScope = (strongRules, weakRules) => {
    let chosen = null;
    for (const i of scope) {
      const text = list[i].text;
      const groups = pickCueSentences(text, strongRules, weakRules).filter((group) => group.strong > 0);
      if (groups.length === 0) continue;
      const weight = groups.reduce((sum, group) => sum + group.count, 0);
      if (!chosen || weight > chosen.weight) chosen = { i, groups, weight };
    }
    if (!chosen) return null;
    const text = chosen.groups.map((group) => list[chosen.i].text.slice(group.start, group.end)).join('\n\n');
    return answer(text, chosen.i, 'within_section', chosen.groups[0].start);
  };

  // ---- Limitations ----
  const otherParts = ['future_work', 'data_availability', 'code_availability', 'conclusion'];
  const limitationsAt = best(indexesOfType('limitations'), 'limitations', otherParts);
  if (limitationsAt >= 0) {
    let text = gather(limitationsAt, otherParts);
    if (types[limitationsAt].includes('future_work')) {
      // "Limitations and Future Work": the limitations are what comes before the first sentence
      // about the future.
      const cut = firstFutureCue(text);
      if (cut >= 60) text = text.slice(0, cut);
    }
    result.limitations = answer(text, limitationsAt, 'own_section');
  } else {
    result.limitations = withinScope(LIMITATION_STRONG, LIMITATION_WEAK);
  }

  // ---- Future work ----
  const futureAt = best(indexesOfType('future_work'), 'future_work', ['limitations', 'data_availability', 'code_availability']);
  if (futureAt >= 0) {
    let text = gather(futureAt, ['limitations', 'data_availability', 'code_availability']);
    let offset = 0;
    if (types[futureAt].length > 1) {
      // "Conclusion and Future Work": start at the first sentence about the future.
      const cut = firstFutureCue(text);
      if (cut > 0) {
        text = text.slice(cut);
        offset = cut;
      }
    }
    result.futureWork = answer(text, futureAt, 'own_section', offset);
  } else {
    result.futureWork = withinScope(FUTURE_STRONG, []);
  }

  // ---- Conclusion ----
  const conclusionSkip = ['limitations', 'data_availability', 'code_availability'];
  // The conclusion of the whole work is a main section, or a sub-section of the discussion or
  // conclusion. The "3.6 Conclusion" that closes a chapter about something else is not it, and
  // saying nothing is better than presenting that as the paper's conclusion.
  const mainSectionTypes = (i) => {
    for (let j = i - 1; j >= 0; j--) if (Number(list[j].level) > 0 && level(j) < level(i)) return types[j];
    return null;
  };
  let conclusionCandidates = indexesOfType('conclusion').filter((i) => {
    if (level(i) <= 1) return true;
    const parent = mainSectionTypes(i);
    return !parent || parent.includes('conclusion') || parent.includes('discussion');
  });
  // A chapter-level conclusion wins over the sub-sections inside it.
  const topLevel = Math.min(...conclusionCandidates.map(level));
  conclusionCandidates = conclusionCandidates.filter((i) => level(i) === topLevel);
  const conclusionAt = best(conclusionCandidates, 'conclusion', [...conclusionSkip, 'future_work']);
  if (conclusionAt >= 0) {
    // "6.3 Future Work" is left to the future-work answer; "6.4 Conclusion and Outlook" is kept.
    let text = gather(conclusionAt, conclusionSkip, (j) => list[j].type === 'future_work');
    if (types[conclusionAt].includes('future_work')) {
      const cut = firstFutureCue(text);
      if (cut >= 80) text = text.slice(0, cut);
    }
    result.conclusion = answer(text, conclusionAt, 'own_section');
  }

  // ---- Data and code availability ----
  const dataAt = best(indexesOfType('data_availability'), 'data_availability', []);
  if (dataAt >= 0) result.dataAvailability = answer(gather(dataAt, []), dataAt, 'own_section');
  const codeAt = best(indexesOfType('code_availability'), 'code_availability', []);
  if (codeAt >= 0) result.codeAvailability = answer(gather(codeAt, []), codeAt, 'own_section');

  if (!result.dataAvailability || !result.codeAvailability) {
    const found = { data: null, code: null };
    list.forEach((section, i) => {
      if (!quotable(i) || types[i].includes('appendix')) return;
      const text = section.text;
      let lastKind = null;
      for (const span of sentenceSpans(text)) {
        const kinds = availabilityKinds(text.slice(span.start, span.end));
        for (const kind of kinds) {
          const entry = found[kind];
          if (!entry) found[kind] = { i, start: span.start, end: span.end, lastEnd: span.end };
          // Two availability sentences in a row belong together.
          else if (entry.i === i && lastKind === kind && entry.lastEnd <= span.start && span.start - entry.lastEnd < 4) {
            entry.end = span.end;
            entry.lastEnd = span.end;
          }
        }
        lastKind = kinds.length === 1 ? kinds[0] : kinds.length ? 'both' : null;
        if (lastKind === 'both') lastKind = null;
      }
    });
    if (!result.dataAvailability && found.data) {
      result.dataAvailability = answer(list[found.data.i].text.slice(found.data.start, found.data.end), found.data.i, 'within_section', found.data.start);
    }
    if (!result.codeAvailability && found.code) {
      result.codeAvailability = answer(list[found.code.i].text.slice(found.code.start, found.code.end), found.code.i, 'within_section', found.code.start);
    }
  }

  return result;
}

const DATA_NOUN = '(?:data|datasets?|data sets?|corpus|corpora|recordings|photographs|images|annotations|labels|measurements|records|benchmarks?|materials)';
const CODE_NOUN = '(?:source code|code|software|scripts?|implementations?|notebooks?|toolkit|toolbox|package|library|trained models?|model weights|checkpoints|applications?)';
const SHARED = '(?:available|accessible|released|deposited|archived|hosted|open[- ]sourced|uploaded|shared|provided|published)';
// "<the data> are (publicly) available ..." and "we release <the code> ..."
const AVAILABILITY_RULES = [['data', DATA_NOUN], ['code', CODE_NOUN]].map(([kind, noun]) => [
  kind,
  [
    new RegExp(`\\b${noun}\\b[^.;]{0,160}?\\b(?:is|are|was|were|will be|has been|have been|can be|may be)\\s+(?:not\\s+)?(?:made\\s+)?(?:(?:publicly|openly|freely|also|now)\\s+)*${SHARED}\\b`, 'i'),
    new RegExp(`\\bwe\\s+(?:(?:have|also|will)\\s+)*(?:release|share|provide|publish|open[- ]source|make|deposit|upload)[a-z]*\\b[^.;]{0,120}\\b${noun}\\b`, 'i'),
  ],
]);
const URL_IN_TEXT = /https?:\/\/|\bwww\.|\bdoi\.org\/|\b10\.\d{4,9}\//i;
const AVAILABILITY_ANCHOR =
  /\b(?:up)?on (?:reasonable )?request\b|\b(?:this|our|the present|the current) (?:study|work|paper|article|thesis|research|project|manuscript)\b|\bcorresponding author\b|\bsupplementary (?:materials?|information|data|files?)\b|\b(?:publicly|openly|freely) (?:available|accessible)\b|\brepository\b/i;

/**
 * Is this sentence the authors' statement about where their data or code can be obtained?
 * Returns [] or a list with 'data' and/or 'code'. The rules are strict on purpose: "we use the
 * publicly available ImageNet dataset [3]" describes somebody else's data and must not match
 * unless the sentence also points to a place (a link, a request, "this study").
 */
function availabilityKinds(sentence) {
  if (sentence.length > 700) return [];
  const kinds = [];
  if (/\bno (?:new )?(?:data|datasets?) (?:were|was) (?:generated|created|collected|analy[sz]ed|used)\b/i.test(sentence)) kinds.push('data');
  const anchored = URL_IN_TEXT.test(sentence) || AVAILABILITY_ANCHOR.test(sentence);
  if (!anchored) return kinds;
  for (const [kind, rules] of AVAILABILITY_RULES) {
    if (kinds.includes(kind)) continue;
    if (rules.some((rule) => rule.test(sentence))) kinds.push(kind);
  }
  return kinds;
}

// ===========================================================================
// 5. Code and dataset links
// ===========================================================================

const CODE_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'sourceforge.net', 'gist.github.com'];
const DATASET_HOSTS = [
  'zenodo.org', 'figshare.com', 'datadryad.org', 'dryad.org', 'osf.io', 'kaggle.com', 'data.mendeley.com',
  'physionet.org', 'archive.ics.uci.edu', 'ieee-dataport.org', 'dataverse.harvard.edu', 'dataverse.org', 'pangaea.de',
];
// DOI prefixes that belong to data repositories: Zenodo, Figshare, Dryad, Dataverse, Mendeley
// Data, OSF, IEEE DataPort, PhysioNet, UCI.
const DATA_DOI_RE = /^\/?10\.(?:5281|6084|5061|7910|17632|17605|21227|13026|24432)\//;
const IGNORED_LINK_HOSTS = ['creativecommons.org', 'orcid.org', 'crossmark.crossref.org', 'w3.org', 'adobe.com'];

const BARE_HOSTS = 'github\\.com|gitlab\\.com|bitbucket\\.org|codeberg\\.org|zenodo\\.org|figshare\\.com|osf\\.io|doi\\.org|dx\\.doi\\.org|huggingface\\.co|kaggle\\.com|datadryad\\.org|physionet\\.org|data\\.mendeley\\.com|ieee-dataport\\.org';
const LINK_RE = new RegExp(
  `(?:https?:\\/\\/|www\\.)[^\\s<>"“”‘’{}|\\\\^\`]+` + // ordinary links
    `|(?<![\\w./@-])(?:${BARE_HOSTS})\\/[^\\s<>"“”‘’{}|\\\\^\`]+` + // "github.com/user/repo" printed without https://
    `|(?<![\\w./])(?:doi:\\s*)?10\\.(?:5281|6084|5061|7910|17632|17605|21227|13026|24432)\\/[^\\s<>"“”‘’{}|\\\\^\`]+`, // a bare data DOI
  'gi'
);

const OWN_WORK_RE =
  /\b(?:our|this (?:paper|work|study|article|thesis|research|project)|the (?:present|current) (?:paper|work|study|article|thesis))\b[^.]{0,100}\b(?:data|datasets?|code|software|implementation|materials|scripts?)\b|\b(?:data|datasets?|code|software|implementation|materials|scripts?)\b[^.]{0,80}\b(?:of|for|from|supporting|accompanying|used in|underlying) (?:this|our|the present|the current) (?:paper|work|study|article|thesis|research|project)\b/i;

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Tidies a link found in running text, or returns null when it is not a usable public link. */
function cleanLink(raw) {
  let text = raw.trim();
  const doi = /^(?:doi:\s*)?(10\.\d{4,9}\/.+)$/i.exec(text);
  if (doi) text = `https://doi.org/${doi[1]}`;
  else if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  // Two links printed without a space between them: keep the first.
  const second = text.slice(8).search(/https?:\/\//i);
  if (second >= 0) text = text.slice(0, 8 + second);
  // Full stops, commas and closing brackets after a link belong to the sentence, not to the link.
  for (;;) {
    const last = text[text.length - 1];
    if (/[.,;:!?'"”’*]/.test(last)) text = text.slice(0, -1);
    else if (last === ')' && (text.match(/\(/g) || []).length < (text.match(/\)/g) || []).length) text = text.slice(0, -1);
    else if (/[\]}>]/.test(last)) text = text.slice(0, -1);
    else break;
  }
  if (!isValidHttpUrl(text)) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  return { url: parsed.href, host, path: parsed.pathname };
}

function linkKind(host, pathname, lead) {
  let kind = 'other';
  if (CODE_HOSTS.some((domain) => hostMatches(host, domain)) || /^gitlab\./.test(host)) kind = 'code';
  else if (hostMatches(host, 'huggingface.co')) kind = /^\/datasets\//.test(pathname) ? 'dataset' : 'other';
  else if (hostMatches(host, 'kaggle.com')) kind = /^\/code\//.test(pathname) ? 'code' : 'dataset';
  else if (DATASET_HOSTS.some((domain) => hostMatches(host, domain)) || /(^|\.)dataverse\./.test(host)) kind = 'dataset';
  else if ((host === 'doi.org' || host === 'dx.doi.org') && DATA_DOI_RE.test(pathname)) kind = 'dataset';
  // Zenodo, Figshare and OSF also hold software. When the words that lead up to the link speak
  // of code and not of data ("the code is archived at ..."), believe them.
  if (kind === 'dataset' && /zenodo|figshare|osf\.io|^doi\.org$|^dx\.doi\.org$/.test(host)) {
    const aboutCode = /\b(?:source code|code|software|scripts?|implementation)\b/i.test(lead);
    const aboutData = /\b(?:data|datasets?|photographs|recordings|readings|images|labels|records|files)\b/i.test(lead);
    if (aboutCode && !aboutData) kind = 'code';
  }
  return kind;
}

function shortContext(text, start, end, linkStart, linkEnd) {
  let from = start;
  let to = end;
  if (to - from > 200) {
    // Keep the link in view: take the words that lead up to it.
    to = Math.min(end, Math.max(linkEnd, from + 200));
    from = Math.max(start, to - 200);
    if (from > start) {
      const space = text.indexOf(' ', from);
      if (space > 0 && space < linkStart) from = space + 1;
    }
    if (to < end && to > linkEnd) {
      const space = text.lastIndexOf(' ', to);
      if (space > linkEnd) to = space;
    }
  }
  return text.slice(from, to).replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Lists the code and dataset links a paper mentions.
 *
 * Returns up to 15 of { url, kind: 'code' | 'dataset' | 'other', host, page, context }, code and
 * dataset links first. `context` is the sentence the link was printed in (200 characters at
 * most). Links that appear only in the reference list are other people's work and are left out,
 * unless the entry itself says that it holds the data or code of this work.
 */
function findResourceLinks(pages) {
  const { sections, noteBlocks } = analysePages(pages);
  const seen = new Map();
  const footnotes = noteBlocks.map((block) => ({ title: '', type: 'other', types: ['other'], startPage: block.page, text: block.text }));
  for (const section of [...sections, ...footnotes]) {
    const sectionTypes = typesOfSection(section);
    const inReferences = sectionTypes.includes('references');
    const text = section.text;
    if (!text || !/[./]/.test(text)) continue;
    const spans = sentenceSpans(text);
    LINK_RE.lastIndex = 0;
    let match;
    let previousLinkEnd = 0;
    while ((match = LINK_RE.exec(text))) {
      const afterPreviousLink = previousLinkEnd;
      previousLinkEnd = match.index + match[0].length;
      const link = cleanLink(match[0]);
      if (!link) continue;
      if (IGNORED_LINK_HOSTS.some((domain) => hostMatches(link.host, domain))) continue;
      const position = match.index;
      const linkEnd = position + match[0].length;
      const span = spans.find((s) => position >= s.start && position < s.end) || { start: Math.max(0, position - 120), end: Math.min(text.length, linkEnd + 60) };
      const context = shortContext(text, span.start, span.end, position, linkEnd);
      if (inReferences) {
        // In a reference list the "sentence" is often just the link, so look at the entry the
        // link closes: back to the entry's number, the paragraph start or the previous link.
        const before = text.slice(0, position);
        const marker = [...before.matchAll(/(?:^|\s)\[\d{1,3}\]\s/g)].pop();
        const entryStart = Math.max(position - 300, afterPreviousLink, before.lastIndexOf('\n\n') + 1, marker ? marker.index : 0);
        if (!OWN_WORK_RE.test(text.slice(entryStart, linkEnd))) continue;
      }
      const key = `${link.host}${link.path.replace(/\.git$/, '').replace(/\/+$/, '')}`.toLowerCase();
      if (seen.has(key)) continue;
      // The words of the same sentence just before the link, but not before an earlier link.
      let lead = text.slice(Math.max(span.start, position - 90), position);
      const earlierLink = lead.search(/(?:https?:\/\/|www\.)\S*\s(?!.*(?:https?:\/\/|www\.))/i);
      if (earlierLink >= 0) lead = lead.slice(earlierLink).replace(/^\S+\s/, '');
      seen.set(key, {
        url: link.url,
        kind: linkKind(link.host, link.path, lead),
        host: link.host,
        page: pageAtOffset(section, position),
        context,
      });
    }
  }
  const all = [...seen.values()];
  const useful = all.filter((link) => link.kind !== 'other');
  const rest = all.filter((link) => link.kind === 'other');
  return [...useful, ...rest].slice(0, MAX_LINKS);
}

// ===========================================================================
// 6. Everything together, with a cache and a queue
// ===========================================================================

// Reading a PDF costs a download and up to a few seconds of processor time, and the same popular
// paper is opened again and again. Results are therefore remembered for a while. The Map keeps
// its entries in the order they were last used, so the first key is always the one to discard.
const resultCache = new Map();
const inFlight = new Map();
let jobsInSystem = 0;
let parseChain = Promise.resolve();

// Failures that say nothing about the PDF itself are not remembered.
const NOT_CACHED = new Set(['busy', 'reader_not_installed']);

/** A failure that may well go away on the next try (the host was slow or down) is not remembered either. */
function isPassingFailure(reason) {
  const key = String(reason || '');
  return NOT_CACHED.has(key) || key === 'timeout' || key === 'network' || key === 'http_429' || /^http_5\d\d$/.test(key);
}

function cacheKeyFor(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function cacheGet(key, now) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    resultCache.delete(key);
    return null;
  }
  resultCache.delete(key);
  resultCache.set(key, entry); // most recently used goes to the end
  return entry.value;
}

function cacheSet(key, value, now) {
  resultCache.delete(key);
  resultCache.set(key, { value, expiresAt: now + (value.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS) });
  while (resultCache.size > CACHE_MAX_ENTRIES) resultCache.delete(resultCache.keys().next().value);
}

/** Runs `job` after every job queued before it has finished: one PDF is parsed at a time. */
function parseInTurn(job) {
  const run = parseChain.then(job, job);
  parseChain = run.catch(() => {});
  return run;
}

/** From the bytes of a PDF to the finished answer. Runs inside the reading thread. */
async function parsePdfBuffer(buffer, opts = {}) {
  const extract = typeof opts.extractImpl === 'function' ? opts.extractImpl : extractPdfText;
  const extracted = await extract(buffer, { maxPages: opts.maxPages });
  if (!extracted || !extracted.ok) return { ok: false, reason: (extracted && extracted.reason) || 'unreadable' };

  const sections = splitIntoSections(extracted.pages);
  // Only headers and page numbers were found: the pages themselves are pictures.
  const letters = sections.reduce((sum, section) => sum + section.text.length, 0);
  if (letters < 300) return { ok: false, reason: 'no_text_layer' };

  return {
    ok: true,
    pageCount: extracted.pageCount,
    pagesRead: extracted.pagesRead,
    truncated: Boolean(extracted.truncated),
    keySections: extractKeySections(sections),
    links: findResourceLinks(extracted.pages),
    sectionTitles: sections
      .filter((section) => section.title)
      .slice(0, 120)
      .map((section) => ({ title: section.title, type: section.type, page: section.startPage })),
  };
}

/**
 * Reads the PDF in a separate thread with a memory limit and a time limit. When either limit is
 * passed the thread is stopped and the request gets an ordinary "could not be read" answer; the
 * rest of the site keeps answering in the meantime.
 */
function parseInWorker(buffer, opts = {}) {
  return new Promise((resolve) => {
    let worker = null;
    let timer = null;
    let watch = null;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (watch) clearInterval(watch);
      if (worker) Promise.resolve(worker.terminate()).catch(() => {});
      resolve(value && typeof value === 'object' ? value : { ok: false, reason: 'unreadable' });
    };
    try {
      const bytes = new Uint8Array(buffer.length);
      bytes.set(buffer);
      worker = new Worker(path.join(__dirname, 'fullTextWorker.js'), {
        workerData: { bytes, maxPages: opts.maxPages },
        transferList: [bytes.buffer],
        resourceLimits: { maxOldGenerationSizeMb: WORKER_MAX_HEAP_MB, maxYoungGenerationSizeMb: 48 },
      });
    } catch {
      // Threads are not available on this host: read in the main process, with the other limits still on.
      parsePdfBuffer(buffer, opts).then(finish, () => finish(null));
      return;
    }
    timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), positiveNumber(opts.workerLimitMs, WORKER_HARD_LIMIT_MS));
    const allowedGrowth = positiveNumber(opts.workerMemoryMb, positiveNumber(process.env.FULLTEXT_MAX_MEMORY_MB, DEFAULT_MEMORY_GROWTH_MB)) * 1048576;
    const memoryAtStart = process.memoryUsage().rss;
    watch = setInterval(() => {
      if (process.memoryUsage().rss - memoryAtStart > allowedGrowth) finish({ ok: false, reason: 'too_large' });
    }, 150);
    worker.once('message', finish);
    worker.once('error', (err) => finish({ ok: false, reason: err && err.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'too_large' : 'unreadable' }));
    worker.once('exit', () => finish(null));
  });
}

async function readUncached(pdfUrl, opts) {
  const fetched = await fetchPdfBuffer(pdfUrl, opts);
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  return parseInTurn(async () => {
    // Tests hand in their own reader; that one runs here. The real reader runs in its own thread.
    const inProcess = typeof opts.extractImpl === 'function' || Boolean(pdfjsLoaderOverride) || opts.inProcess === true;
    let result;
    if (inProcess) result = await parsePdfBuffer(fetched.buffer, opts);
    else if (!isPdfReaderAvailable()) result = { ok: false, reason: 'reader_not_installed' };
    else result = await parseInWorker(fetched.buffer, opts);
    if (result && result.ok) result.finalUrl = fetched.finalUrl;
    return result || { ok: false, reason: 'unreadable' };
  });
}

/**
 * Reads the PDF at `pdfUrl` and returns the authors' own key sections and links.
 *
 * Returns { ok: true, pageCount, pagesRead, truncated, keySections, links, sectionTitles, finalUrl }
 * or { ok: false, reason }. It never throws.
 *
 * Results are remembered for 24 hours (failures for 30 minutes). One PDF is parsed at a time and
 * three more may wait; a request beyond that is answered at once with reason 'busy', which the
 * caller should present as "try again in a moment".
 *
 * opts (all optional, mainly for tests): { lookup, fetchImpl, extractImpl, now, maxPages,
 * timeoutMs, maxBytes, skipCache }
 */
async function readPaperFullText(input, opts = {}) {
  try {
    const pdfUrl = input && typeof input.pdfUrl === 'string' ? input.pdfUrl.trim() : '';
    if (!pdfUrl) return { ok: false, reason: 'invalid_url' };
    const options = opts && typeof opts === 'object' ? opts : {};
    const clock = typeof options.now === 'function' ? options.now : Date.now;
    const key = cacheKeyFor(pdfUrl);

    if (!options.skipCache) {
      const cached = cacheGet(key, clock());
      if (cached) return structuredClone(cached);
    }
    // Two people opening the same paper at the same moment share one download.
    if (inFlight.has(key)) return structuredClone(await inFlight.get(key));

    if (jobsInSystem >= 1 + MAX_WAITING) return { ok: false, reason: 'busy' };
    jobsInSystem++;
    const job = readUncached(pdfUrl, options)
      .catch(() => ({ ok: false, reason: 'unreadable' }))
      .then((value) => {
        if (value.ok || !isPassingFailure(value.reason)) cacheSet(key, value, clock());
        return value;
      })
      .finally(() => {
        jobsInSystem--;
        inFlight.delete(key);
      });
    inFlight.set(key, job);
    return structuredClone(await job);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/** Empties the cache and the queue counters. For tests only. */
function resetFullTextStateForTests() {
  resultCache.clear();
  inFlight.clear();
  jobsInSystem = 0;
  parseChain = Promise.resolve();
  pdfjsFailedAt = 0;
  pdfjsLoaderOverride = null;
}

module.exports = {
  fetchPdfBuffer,
  extractPdfText,
  splitIntoSections,
  extractKeySections,
  findResourceLinks,
  readPaperFullText,
  resetFullTextStateForTests,
  isPdfReaderAvailable,
  classifyHeadingTitle,
  SECTION_TYPES,
  // Small building blocks, exported so the tests can check them one by one.
  _internals: {
    buildPageLines,
    pinnedHttpRequest,
    resolvePublicAddresses,
    startsLikePdf,
    sentenceSpans,
    capText,
    availabilityKinds,
    parsePdfBuffer,
    parseInWorker,
    readTextItems,
    setPdfjsLoaderForTests(loader) {
      pdfjsLoaderOverride = loader;
    },
  },
};
