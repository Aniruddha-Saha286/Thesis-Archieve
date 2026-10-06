const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const {
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
  _internals,
} = require('../services/fullTextService');
const { isPublicIpAddress } = require('../utils/urlValidator');

const FIXTURES = path.join(__dirname, 'fixtures', 'fulltext');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUBLIC_DNS = async () => [{ address: '93.184.216.34', family: 4 }];

/** A stand-in for one HTTP response, shaped like what fetchPdfBuffer expects from its transport. */
function fakeResponse(status, headers = {}, chunks = []) {
  const lower = {};
  for (const [name, value] of Object.entries(headers)) lower[name.toLowerCase()] = String(value);
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() in lower ? lower[name.toLowerCase()] : null) },
    body: (async function* body() {
      for (const chunk of chunks) yield chunk;
    })(),
  };
}

/** A transport stub that answers from a table of URL -> response maker and records every call. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    const route = routes[url];
    if (!route) throw new Error(`unexpected request to ${url}`);
    return typeof route === 'function' ? route(options) : route;
  };
  impl.calls = calls;
  return impl;
}

const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

/** Breaks a paragraph into lines of about `width` characters, the way a PDF page holds it. */
function wrap(text, width = 80) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Builds one page for splitIntoSections. A string is a paragraph (wrapped into lines),
 * [text, size] is a line in another size, { line } is one line exactly as given.
 */
function makePage(number, entries, bodySize = 10) {
  const lines = [];
  for (const entry of entries) {
    if (Array.isArray(entry)) lines.push({ text: entry[0], size: entry[1] });
    else if (typeof entry === 'object') lines.push({ text: entry.line, size: bodySize });
    else for (const text of wrap(entry)) lines.push({ text, size: bodySize });
  }
  return { page: number, lines };
}

const squash = (text) => String(text).replace(/\s+/g, ' ').trim();
const titlesOf = (sections) => sections.map((section) => section.title).filter(Boolean);
const byTitle = (sections, title) => sections.find((section) => section.title === title);

const FILLER =
  'The measurements were repeated on three days and averaged before any further analysis was carried out by the team. ' +
  'Every site was visited by two observers who filled in the same form and compared their notes on the same evening.';

async function runFullTextTests() {
  console.log('===============================================================');
  console.log('  TEST SUITE: FULL-TEXT READER (AUTHORS\' OWN KEY SECTIONS)    ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;
  let skipped = 0;

  async function test(description, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${description}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  resetFullTextStateForTests();

  // =========================================================================
  // 1. Download guard (DNS and HTTP are stubs; nothing leaves this machine)
  // =========================================================================
  console.log('  -- Download guard --');

  await test('IP check: private, loopback, link-local, CGNAT, multicast, metadata and IPv6 forms are not public', () => {
    const refused = [
      '127.0.0.1', '10.0.0.5', '172.16.9.1', '172.31.255.254', '192.168.1.10', '169.254.169.254', '100.64.0.1',
      '100.127.255.255', '0.0.0.0', '224.0.0.1', '239.1.2.3', '255.255.255.255', '198.18.0.1', '::1', '::',
      'fe80::1', 'fe80::1%eth0', 'fc00::1', 'fd12:3456:789a::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
      '::ffff:a9fe:a9fe', '64:ff9b::a00:1', '2002:0a00:0001::1', '2001:db8::1', 'not-an-ip', '', '999.1.1.1',
    ];
    for (const address of refused) assert.strictEqual(isPublicIpAddress(address), false, `${address} must be refused`);
    const allowed = ['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'];
    for (const address of allowed) assert.strictEqual(isPublicIpAddress(address), true, `${address} must be allowed`);
  });

  await test('Refuses anything that is not a plain http(s) URL, without touching DNS or the network', async () => {
    let lookups = 0;
    const lookup = async () => {
      lookups++;
      return [{ address: '93.184.216.34', family: 4 }];
    };
    const fetchImpl = fakeFetch({});
    for (const bad of ['ftp://example.org/a.pdf', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '', null, 42]) {
      assert.deepStrictEqual(await fetchPdfBuffer(bad, { lookup, fetchImpl }), { ok: false, reason: 'invalid_url' });
    }
    assert.deepStrictEqual(await fetchPdfBuffer('https://user:secret@example.org/a.pdf', { lookup, fetchImpl }), { ok: false, reason: 'invalid_url' });
    assert.strictEqual(lookups, 0);
    assert.strictEqual(fetchImpl.calls.length, 0);
  });

  await test('Refuses internal hosts written as names, IPv4, IPv6 or numbers, before any request is made', async () => {
    const fetchImpl = fakeFetch({});
    const urls = [
      'http://localhost/a.pdf', 'http://127.0.0.1:8080/a.pdf', 'http://[::1]/a.pdf', 'http://169.254.169.254/latest/meta-data',
      'http://10.1.2.3/a.pdf', 'http://192.168.0.7/a.pdf', 'http://100.64.1.1/a.pdf', 'http://[fd00::1]/a.pdf',
      'http://[::ffff:127.0.0.1]/a.pdf', 'http://2130706433/a.pdf', 'http://0x7f.0.0.1/a.pdf', 'http://printer.local/a.pdf',
      'http://metadata.google.internal/x', 'http://224.0.0.1/a.pdf',
    ];
    for (const url of urls) {
      assert.deepStrictEqual(await fetchPdfBuffer(url, { lookup: PUBLIC_DNS, fetchImpl }), { ok: false, reason: 'blocked_host' }, url);
    }
    assert.strictEqual(fetchImpl.calls.length, 0);
  });

  await test('Refuses a public-looking name whose DNS answer is (or includes) an internal address', async () => {
    const fetchImpl = fakeFetch({});
    const answers = [
      [{ address: '10.0.0.8', family: 4 }],
      [{ address: '169.254.169.254', family: 4 }],
      [{ address: '::1', family: 6 }],
      [{ address: '::ffff:192.168.1.1', family: 6 }],
      [{ address: '100.100.100.100', family: 4 }],
      // one good address does not excuse a bad one
      [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }],
    ];
    for (const answer of answers) {
      const result = await fetchPdfBuffer('https://papers.example.org/a.pdf', { lookup: async () => answer, fetchImpl });
      assert.deepStrictEqual(result, { ok: false, reason: 'blocked_host' }, JSON.stringify(answer));
    }
    assert.strictEqual(fetchImpl.calls.length, 0);
  });

  await test('Downloads a PDF: honest User-Agent, manual redirects, checked addresses handed to the transport', async () => {
    const fetchImpl = fakeFetch({ 'https://papers.example.org/a.pdf': fakeResponse(200, { 'Content-Type': 'application/pdf' }, [TINY_PDF.subarray(0, 3), TINY_PDF.subarray(3)]) });
    const result = await fetchPdfBuffer('https://papers.example.org/a.pdf', { lookup: PUBLIC_DNS, fetchImpl });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.bytes, TINY_PDF.length);
    assert.ok(result.buffer.equals(TINY_PDF));
    assert.strictEqual(result.finalUrl, 'https://papers.example.org/a.pdf');
    const { options } = fetchImpl.calls[0];
    assert.strictEqual(options.redirect, 'manual');
    assert.match(options.headers['User-Agent'], /ThesisArchive/);
    assert.match(options.headers['User-Agent'], /https?:\/\//, 'the User-Agent says where the site lives');
    assert.deepStrictEqual(options.addresses, [{ address: '93.184.216.34', family: 4 }]);
  });

  await test('Follows redirects itself (relative ones too) and reports the final address', async () => {
    const fetchImpl = fakeFetch({
      'http://doi.example.org/10.1/x': fakeResponse(302, { Location: 'https://repo.example.org/item/7' }),
      'https://repo.example.org/item/7': fakeResponse(301, { Location: '/bitstream/7/paper.pdf' }),
      'https://repo.example.org/bitstream/7/paper.pdf': fakeResponse(200, {}, [TINY_PDF]),
    });
    const result = await fetchPdfBuffer('http://doi.example.org/10.1/x', { lookup: PUBLIC_DNS, fetchImpl });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.finalUrl, 'https://repo.example.org/bitstream/7/paper.pdf');
    assert.strictEqual(fetchImpl.calls.length, 3);
  });

  await test('A redirect to a private address is refused on that hop, and never requested', async () => {
    const lookup = async (host) => (host === 'evil.example.org' ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '10.0.0.5', family: 4 }]);
    const fetchImpl = fakeFetch({
      'https://evil.example.org/a.pdf': fakeResponse(302, { Location: 'http://intranet.example.org/admin.pdf' }),
      'https://evil.example.org/b.pdf': fakeResponse(302, { Location: 'http://169.254.169.254/latest/meta-data/' }),
      'https://evil.example.org/c.pdf': fakeResponse(307, { Location: 'file:///etc/passwd' }),
    });
    assert.deepStrictEqual(await fetchPdfBuffer('https://evil.example.org/a.pdf', { lookup, fetchImpl }), { ok: false, reason: 'blocked_host' });
    assert.deepStrictEqual(await fetchPdfBuffer('https://evil.example.org/b.pdf', { lookup, fetchImpl }), { ok: false, reason: 'blocked_host' });
    assert.deepStrictEqual(await fetchPdfBuffer('https://evil.example.org/c.pdf', { lookup, fetchImpl }), { ok: false, reason: 'invalid_url' });
    assert.strictEqual(fetchImpl.calls.length, 3, 'only the three public first hops were requested');
  });

  await test('Gives up after 4 redirects', async () => {
    const routes = {};
    for (let i = 0; i < 6; i++) routes[`https://loop.example.org/${i}`] = () => fakeResponse(302, { Location: `/${i + 1}` });
    routes['https://loop.example.org/4'] = () => fakeResponse(200, {}, [TINY_PDF]);
    const four = fakeFetch(routes);
    assert.strictEqual((await fetchPdfBuffer('https://loop.example.org/0', { lookup: PUBLIC_DNS, fetchImpl: four })).ok, true, '4 redirects are allowed');
    routes['https://loop.example.org/4'] = () => fakeResponse(302, { Location: '/5' });
    const five = fakeFetch(routes);
    assert.deepStrictEqual(await fetchPdfBuffer('https://loop.example.org/0', { lookup: PUBLIC_DNS, fetchImpl: five }), { ok: false, reason: 'too_many_redirects' });
    assert.strictEqual(five.calls.length, 5);
  });

  await test('Size cap: a declared length over the limit is refused before the body is read', async () => {
    let bodyTouched = false;
    const response = fakeResponse(200, { 'Content-Length': 50 * 1024 * 1024 }, []);
    response.body = (async function* body() {
      bodyTouched = true;
      yield TINY_PDF;
    })();
    const fetchImpl = fakeFetch({ 'https://big.example.org/a.pdf': response });
    assert.deepStrictEqual(await fetchPdfBuffer('https://big.example.org/a.pdf', { lookup: PUBLIC_DNS, fetchImpl }), { ok: false, reason: 'too_large' });
    assert.strictEqual(bodyTouched, false);
  });

  await test('Size cap: a body that keeps coming is cut off as soon as it passes the limit', async () => {
    let produced = 0;
    const response = fakeResponse(200, {}, []);
    response.body = (async function* endless() {
      yield Buffer.from('%PDF-1.7\n');
      for (;;) {
        produced++;
        yield Buffer.alloc(1024, 0x20);
      }
    })();
    const fetchImpl = fakeFetch({ 'https://big.example.org/b.pdf': response });
    const result = await fetchPdfBuffer('https://big.example.org/b.pdf', { lookup: PUBLIC_DNS, fetchImpl, maxBytes: 10 * 1024 });
    assert.deepStrictEqual(result, { ok: false, reason: 'too_large' });
    assert.ok(produced <= 12, `stopped after ${produced} KB instead of reading on`);
  });

  await test('Size cap comes from FULLTEXT_MAX_MB (default 15 MB)', async () => {
    const original = process.env.FULLTEXT_MAX_MB;
    try {
      const big = () => fakeResponse(200, { 'Content-Length': 2 * 1024 * 1024 }, [TINY_PDF]);
      process.env.FULLTEXT_MAX_MB = '1';
      const small = await fetchPdfBuffer('https://x.example.org/a.pdf', { lookup: PUBLIC_DNS, fetchImpl: fakeFetch({ 'https://x.example.org/a.pdf': big }) });
      assert.deepStrictEqual(small, { ok: false, reason: 'too_large' });
      delete process.env.FULLTEXT_MAX_MB;
      const normal = await fetchPdfBuffer('https://x.example.org/a.pdf', { lookup: PUBLIC_DNS, fetchImpl: fakeFetch({ 'https://x.example.org/a.pdf': big }) });
      assert.strictEqual(normal.ok, true, '2 MB is fine under the default limit');
      const sixteen = () => fakeResponse(200, { 'Content-Length': 16 * 1024 * 1024 }, [TINY_PDF]);
      const over = await fetchPdfBuffer('https://x.example.org/a.pdf', { lookup: PUBLIC_DNS, fetchImpl: fakeFetch({ 'https://x.example.org/a.pdf': sixteen }) });
      assert.deepStrictEqual(over, { ok: false, reason: 'too_large' });
    } finally {
      if (original === undefined) delete process.env.FULLTEXT_MAX_MB;
      else process.env.FULLTEXT_MAX_MB = original;
    }
  });

  await test('A sign-in page served from a .pdf address is reported as not_pdf', async () => {
    const html = fixture('login_page.html');
    const fetchImpl = fakeFetch({
      'https://publisher.example.org/article/123.pdf': () => fakeResponse(200, { 'Content-Type': 'application/pdf' }, [html]),
      'https://publisher.example.org/empty.pdf': () => fakeResponse(200, {}, []),
    });
    assert.deepStrictEqual(await fetchPdfBuffer('https://publisher.example.org/article/123.pdf', { lookup: PUBLIC_DNS, fetchImpl }), { ok: false, reason: 'not_pdf' });
    assert.deepStrictEqual(await fetchPdfBuffer('https://publisher.example.org/empty.pdf', { lookup: PUBLIC_DNS, fetchImpl }), { ok: false, reason: 'not_pdf' });
    assert.strictEqual(_internals.startsLikePdf(Buffer.from('\ufeff\n%PDF-1.5')), true, 'a byte-order mark or blank line before the header is tolerated');
    assert.strictEqual(_internals.startsLikePdf(Buffer.from('<!DOCTYPE html><html>')), false);
  });

  await test('Timeout covers a server that never answers, a body that stalls and a DNS lookup that hangs', async () => {
    const never = new Promise(() => {});
    const started = Date.now();
    const silent = await fetchPdfBuffer('https://slow.example.org/a.pdf', { lookup: PUBLIC_DNS, fetchImpl: () => never, timeoutMs: 60 });
    assert.deepStrictEqual(silent, { ok: false, reason: 'timeout' });

    const stalling = fakeResponse(200, {}, []);
    stalling.body = (async function* body() {
      yield Buffer.from('%PDF-1.7\n');
      await never;
    })();
    const stalled = await fetchPdfBuffer('https://slow.example.org/b.pdf', { lookup: PUBLIC_DNS, fetchImpl: async () => stalling, timeoutMs: 60 });
    assert.deepStrictEqual(stalled, { ok: false, reason: 'timeout' });

    const dns = await fetchPdfBuffer('https://slow.example.org/c.pdf', { lookup: () => never, fetchImpl: fakeFetch({}), timeoutMs: 60 });
    assert.deepStrictEqual(dns, { ok: false, reason: 'timeout' });
    assert.ok(Date.now() - started < 2000, 'three timeouts of 60 ms must not take seconds');
  });

  await test('HTTP errors, connection errors and DNS failures get their own reasons', async () => {
    const fetchImpl = fakeFetch({
      'https://x.example.org/missing.pdf': () => fakeResponse(404),
      'https://x.example.org/forbidden.pdf': () => fakeResponse(403),
      'https://x.example.org/broken.pdf': () => fakeResponse(503),
      'https://x.example.org/reset.pdf': () => {
        throw new Error('ECONNRESET');
      },
    });
    const opts = { lookup: PUBLIC_DNS, fetchImpl };
    assert.deepStrictEqual(await fetchPdfBuffer('https://x.example.org/missing.pdf', opts), { ok: false, reason: 'http_404' });
    assert.deepStrictEqual(await fetchPdfBuffer('https://x.example.org/forbidden.pdf', opts), { ok: false, reason: 'http_403' });
    assert.deepStrictEqual(await fetchPdfBuffer('https://x.example.org/broken.pdf', opts), { ok: false, reason: 'http_503' });
    assert.deepStrictEqual(await fetchPdfBuffer('https://x.example.org/reset.pdf', opts), { ok: false, reason: 'network' });
    const noDns = async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    };
    assert.deepStrictEqual(await fetchPdfBuffer('https://nowhere.example.org/a.pdf', { lookup: noDns, fetchImpl }), { ok: false, reason: 'network' });
  });

  await test('Built-in transport connects to the checked address, not to whatever the name resolves to later', async () => {
    // A local server stands in for a repository. The host name below does not exist in DNS;
    // the request can only arrive because the transport uses the address it was handed.
    const server = http.createServer((req, res) => {
      if (req.url === '/moved') {
        res.writeHead(302, { Location: '/paper.pdf' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'X-Seen-Host': req.headers.host, 'X-Seen-Agent': req.headers['user-agent'] });
      res.end(TINY_PDF);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      const pinned = [{ address: '127.0.0.1', family: 4 }];
      const response = await _internals.pinnedHttpRequest(`http://pdf-host.invalid:${port}/paper.pdf`, { headers: { 'User-Agent': 'test-agent' }, addresses: pinned });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('x-seen-host'), `pdf-host.invalid:${port}`);
      assert.strictEqual(response.headers.get('X-Seen-Agent'), 'test-agent');
      const chunks = [];
      for await (const chunk of response.body) chunks.push(chunk);
      assert.ok(Buffer.concat(chunks).equals(TINY_PDF));

      const moved = await _internals.pinnedHttpRequest(`http://pdf-host.invalid:${port}/moved`, { headers: {}, addresses: pinned });
      assert.strictEqual(moved.status, 302, 'the transport reports a redirect instead of following it');
      assert.strictEqual(moved.headers.get('location'), '/paper.pdf');
      moved.body.resume();

      // And the public entry point refuses the loopback address outright.
      assert.deepStrictEqual(await fetchPdfBuffer(`http://127.0.0.1:${port}/paper.pdf`), { ok: false, reason: 'blocked_host' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await test('Whole download path over real sockets (loopback server): redirect, size cap, stalled body, sign-in page', async () => {
    const stalled = [];
    const server = http.createServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/files/paper.pdf' });
        res.end();
      } else if (req.url === '/files/paper.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.write(TINY_PDF.subarray(0, 12));
        setTimeout(() => res.end(TINY_PDF.subarray(12)), 15);
      } else if (req.url === '/huge.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.write('%PDF-1.7\n');
        const pump = setInterval(() => res.write(Buffer.alloc(64 * 1024, 0x20)), 1);
        res.on('close', () => clearInterval(pump));
      } else if (req.url === '/stall.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.write('%PDF-1.7\n');
        stalled.push(res); // never finished by the server
      } else if (req.url === '/login.pdf') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fixture('login_page.html'));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      // The guard sees a public address; only the last step, the socket, is pointed at the test server.
      const viaLoopback = (url, options) => _internals.pinnedHttpRequest(url, { ...options, addresses: [{ address: '127.0.0.1', family: 4 }] });
      const opts = { lookup: PUBLIC_DNS, fetchImpl: viaLoopback };
      const base = `http://repo.example.org:${port}`;

      const good = await fetchPdfBuffer(`${base}/start`, opts);
      assert.strictEqual(good.ok, true);
      assert.strictEqual(good.finalUrl, `${base}/files/paper.pdf`);
      assert.ok(good.buffer.equals(TINY_PDF), 'a body that arrives in two parts is put together');

      assert.deepStrictEqual(await fetchPdfBuffer(`${base}/huge.pdf`, { ...opts, maxBytes: 300 * 1024 }), { ok: false, reason: 'too_large' });
      assert.deepStrictEqual(await fetchPdfBuffer(`${base}/stall.pdf`, { ...opts, timeoutMs: 80 }), { ok: false, reason: 'timeout' });
      assert.deepStrictEqual(await fetchPdfBuffer(`${base}/login.pdf`, opts), { ok: false, reason: 'not_pdf' });
      assert.deepStrictEqual(await fetchPdfBuffer(`${base}/missing.pdf`, opts), { ok: false, reason: 'http_404' });

      // Every connection was closed by the client, including the stalled and the endless one.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const open = await new Promise((resolve) => server.getConnections((err, count) => resolve(count)));
      assert.strictEqual(open, 0, 'no socket is left open');
    } finally {
      for (const res of stalled) res.destroy();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // 2. Rebuilding lines from positioned text (no PDF library needed)
  // =========================================================================
  console.log('\n  -- Lines from text positions --');

  await test('Two-column page: left column is read before the right one; the full-width title stays on top', () => {
    const items = [];
    const put = (str, x, y, size = 10) => items.push({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.45, fontName: 'f1' });
    put('A Title That Runs Across Both Columns of the Page', 150, 740, 18);
    for (let row = 0; row < 12; row++) {
      // Left and right baselines are deliberately not level, as in real papers.
      put(`left column line number ${row + 1} runs to the edge of column`, 50, 700 - row * 12);
      put(`right column line number ${row + 1} is read afterwards`, 320, 697 - row * 12);
    }
    put('3', 303, 30); // page number, centred under the gap
    const built = _internals.buildPageLines(items, [0, 0, 612, 792]);
    assert.strictEqual(built.columns, 2);
    const texts = built.lines.map((line) => line.text);
    assert.strictEqual(texts[0], 'A Title That Runs Across Both Columns of the Page');
    assert.match(texts[1], /^left column line number 1 /);
    assert.match(texts[12], /^left column line number 12 /);
    assert.match(texts[13], /^right column line number 1 /);
    assert.match(texts[24], /^right column line number 12 /);
    assert.strictEqual(texts[25], '3');
    assert.strictEqual(built.lines[25].margin, 'bottom', 'the page number is marked as page furniture');
    assert.strictEqual(built.lines[0].size, 18);
  });

  await test('Words on one baseline become one line with spaces from the gaps; small capitals are joined', () => {
    const items = [
      { str: 'VI. C', transform: [10, 0, 0, 10, 100, 500], width: 22, fontName: 'f1' },
      { str: 'ONCLUSION', transform: [8, 0, 0, 8, 122, 500], width: 48, fontName: 'f1' },
      { str: 'second', transform: [10, 0, 0, 10, 100, 480], width: 28, fontName: 'f1' },
      { str: 'word', transform: [10, 0, 0, 10, 132, 480], width: 20, fontName: 'f1' },
      { str: 'first', transform: [10, 0, 0, 10, 72, 480], width: 20, fontName: 'f1' },
      { str: 'sideways stamp', transform: [0, 10, -10, 0, 20, 300], width: 70, fontName: 'f1' },
    ];
    const built = _internals.buildPageLines(items, [0, 0, 612, 792]);
    assert.deepStrictEqual(built.lines.map((line) => line.text), ['VI. CONCLUSION', 'first second word']);
    assert.strictEqual(built.lines[0].size, 10, 'a small-capitals heading keeps the size of its large letters');
    assert.strictEqual(built.columns, 1);
  });

  await test('Line numbers printed in the margin of a review manuscript are not glued to the text', () => {
    const items = [];
    const put = (str, x, y, size = 11) => items.push({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.45, fontName: 'f1' });
    for (let row = 0; row < 14; row++) {
      const number = String(118 + row);
      put(number, 52 - number.length * 8 * 0.45, 700 - row * 16, 8); // right-aligned, small
      put(`this is line ${row + 1} of the manuscript and it carries on to the right margin`, 72, 700 - row * 16);
    }
    put('3 patients left the study in 2019 and', 72, 460); // a real number at the start of a line stays
    const built = _internals.buildPageLines(items, [0, 0, 612, 792]);
    assert.strictEqual(built.lines.length, 15);
    assert.ok(built.lines.slice(0, 14).every((line, i) => line.text === `this is line ${i + 1} of the manuscript and it carries on to the right margin`));
    assert.strictEqual(built.lines[14].text, '3 patients left the study in 2019 and');
  });

  // =========================================================================
  // 3. Sections
  // =========================================================================
  console.log('\n  -- Headings and sections --');

  const header = 'Journal of Careful Testing 12(3)';
  const numberedPaper = [
    makePage(1, [
      header,
      ['Soil Moisture Sensing for Small Farms', 16],
      ['Abstract', 12],
      `We test cheap soil moisture sensors on small farms. ${FILLER}`,
      ['1. Introduction', 12],
      `Irrigation is costly for smallholders. ${FILLER} Table 2 shows the outline of the paper and the list of sites that were visited by the team. ${FILLER}`,
      ['2. Related Work', 12],
      `Earlier studies used laboratory sensors (Smith, 2019). ${FILLER}`,
      'Page 1',
    ]),
    makePage(2, [
      header,
      ['3. Method', 12],
      `Sensors were buried at two depths. ${FILLER}`,
      ['4. Discussion', 12],
      `The sensors agreed with the reference instrument. ${FILLER}`,
      ['5. Limitations', 12],
      // This paragraph runs over the page break, and a word is split by a hyphen there.
      // "low-cost" is split too, but the paper also writes it inside a line, so it keeps its hyphen.
      { line: 'All farms lie in one valley. Each low-cost probe was checked once, and the low-' },
      { line: 'cost loggers were not checked at all. The findings may not hold outside this general-' },
      'Page 2',
    ]),
    makePage(3, [
      header,
      { line: 'ization is left to later studies with more farms and more seasons than ours.' },
      ['5.2 Limitations and Future Work', 12],
      `The sensors drift after six months. In future work we will test a second soil type. ${FILLER}`,
      ['6. Conclusion', 12],
      `Cheap sensors are good enough for irrigation scheduling. ${FILLER}`,
      ['Data Availability Statement', 12],
      'The readings are available at https://doi.org/10.5281/zenodo.1111111 for anyone to use in their own work.',
      ['Code availability', 12],
      'The analysis scripts are available at https://github.com/soil-lab/sensor-study under an open licence.',
      ['References', 12],
      '12. Smith, J. (2019). Laboratory sensors for soil moisture. Journal of Soil Things, 3(2), 1-10.',
      '13. Kumar, R. (2020). Drift in capacitive probes over a growing season. Sensors Letters, 8(1), 22-31.',
      'Page 3',
    ]),
  ];
  const numberedSections = splitIntoSections(numberedPaper);

  await test('Numbered headings are found, in order, with the right kind', () => {
    assert.deepStrictEqual(titlesOf(numberedSections), [
      'Soil Moisture Sensing for Small Farms', 'Abstract', '1. Introduction', '2. Related Work', '3. Method', '4. Discussion',
      '5. Limitations', '5.2 Limitations and Future Work', '6. Conclusion', 'Data Availability Statement', 'Code availability', 'References',
    ]);
    const kinds = Object.fromEntries(numberedSections.map((section) => [section.title, section.type]));
    assert.strictEqual(kinds.Abstract, 'abstract');
    assert.strictEqual(kinds['1. Introduction'], 'introduction');
    assert.strictEqual(kinds['2. Related Work'], 'related_work');
    assert.strictEqual(kinds['3. Method'], 'method');
    assert.strictEqual(kinds['4. Discussion'], 'discussion');
    assert.strictEqual(kinds['5. Limitations'], 'limitations');
    assert.strictEqual(kinds['6. Conclusion'], 'conclusion');
    assert.strictEqual(kinds['Data Availability Statement'], 'data_availability');
    assert.strictEqual(kinds['Code availability'], 'code_availability');
    assert.strictEqual(kinds.References, 'references');
    for (const section of numberedSections) assert.ok(SECTION_TYPES.includes(section.type), section.type);
    assert.strictEqual(byTitle(numberedSections, '5. Limitations').level, 1);
    assert.strictEqual(byTitle(numberedSections, '5.2 Limitations and Future Work').level, 2);
  });

  await test('"Limitations and Future Work" serves both purposes', () => {
    const combined = byTitle(numberedSections, '5.2 Limitations and Future Work');
    assert.strictEqual(combined.type, 'limitations');
    assert.deepStrictEqual(combined.types, ['limitations', 'future_work']);
    assert.deepStrictEqual(classifyHeadingTitle('7 Conclusion and Future Work').types, ['conclusion', 'future_work']);
    assert.deepStrictEqual(classifyHeadingTitle('Chapter 6: Discussion and Conclusions').types, ['discussion', 'conclusion']);
    assert.deepStrictEqual(classifyHeadingTitle('Data and Code Availability').types, ['data_availability', 'code_availability']);
    assert.strictEqual(classifyHeadingTitle('Threats to Validity').type, 'limitations');
    assert.strictEqual(classifyHeadingTitle('IV. EXPERIMENTAL RESULTS').type, 'results');
    assert.strictEqual(classifyHeadingTitle('Acknowledgments').type, 'acknowledgements');
    assert.strictEqual(classifyHeadingTitle('Bibliography').type, 'references');
    assert.strictEqual(classifyHeadingTitle('Appendix B: Survey Form').type, 'appendix');
    assert.strictEqual(classifyHeadingTitle('Weather on the Day').type, 'other');
  });

  await test('Running header, footer and page numbers are removed from the text', () => {
    const everything = numberedSections.map((section) => `${section.title}\n${section.text}`).join('\n');
    assert.ok(!everything.includes('Journal of Careful Testing'), 'running header must be gone');
    assert.ok(!/Page [123]\b/.test(everything), 'page footer must be gone');
    assert.strictEqual(numberedSections[0].title, 'Soil Moisture Sensing for Small Farms', 'nothing is left in front of the title');
  });

  await test('A section runs across a page break, and words split by a line-end hyphen are joined', () => {
    const limitations = byTitle(numberedSections, '5. Limitations');
    assert.strictEqual(limitations.startPage, 2);
    assert.strictEqual(limitations.endPage, 3);
    assert.strictEqual(
      squash(limitations.text),
      'All farms lie in one valley. Each low-cost probe was checked once, and the low-cost loggers were not checked at all. ' +
        'The findings may not hold outside this generalization is left to later studies with more farms and more seasons than ours.'
    );
  });

  await test('A sentence that starts with "Table 2 shows" stays in the text; reference entries are not headings', () => {
    assert.ok(byTitle(numberedSections, '1. Introduction').text.includes('Table 2 shows the outline of the paper'));
    const references = byTitle(numberedSections, 'References');
    assert.ok(references.text.includes('12. Smith, J. (2019).'));
    assert.ok(references.text.includes('13. Kumar, R. (2020).'));
    assert.strictEqual(numberedSections[numberedSections.length - 1].title, 'References');
  });

  // An IEEE-style paper in which headings are printed as small as the text: only their form
  // (roman numeral, capitals, a known phrase) and their place between paragraphs can tell.
  const ieeeLike = [
    makePage(1, [
      'Abstract—We measure how quickly a network learns to sort parcels. Index terms are omitted here.',
      'I. INTRODUCTION',
      `Sorting parcels by hand is slow. ${FILLER} Limitations of this approach are discussed in a later section of the paper, where we also list the open questions.`,
      'II. METHOD',
      'A. Data Collection',
      `We filmed the conveyor for a week. ${FILLER} The procedure had three steps:`,
      '1. Collect the photographs from every camera.',
      '2. Train the model on the first four days.',
      '3. Test the model on the remaining days.',
      'B. Network Design',
      `The network has four layers. ${FILLER}`,
      'TABLE II',
      'RESULTS BY PARCEL CLASS',
      'Fig. 3. Accuracy for each class of parcel on the last three days of the week.',
      'III. RESULTS',
      `Table II lists the accuracy for every class. ${FILLER}`,
    ]),
    makePage(2, [
      'Threats to Validity',
      `The cameras were mounted at one site only. ${FILLER}`,
      'IV. CONCLUSION',
      `The network sorts nine parcels in ten correctly. ${FILLER}`,
      'REFERENCES',
      'I. Goodfellow, Y. Bengio, and A. Courville, Deep Learning. MIT Press, 2016.',
      'V. Vapnik, The Nature of Statistical Learning Theory. Springer, 1995.',
      '[3] A. Krizhevsky, "ImageNet classification with deep networks," 2012.',
    ]),
  ];
  const ieeeSections = splitIntoSections(ieeeLike);

  await test('IEEE style: roman numerals, lettered sub-headings and unnumbered known headings at text size', () => {
    assert.deepStrictEqual(titlesOf(ieeeSections), [
      'Abstract', 'I. INTRODUCTION', 'II. METHOD', 'A. Data Collection', 'B. Network Design', 'III. RESULTS',
      'Threats to Validity', 'IV. CONCLUSION', 'REFERENCES',
    ]);
    assert.strictEqual(byTitle(ieeeSections, 'IV. CONCLUSION').type, 'conclusion');
    assert.strictEqual(byTitle(ieeeSections, 'Threats to Validity').type, 'limitations');
    assert.strictEqual(byTitle(ieeeSections, 'A. Data Collection').level, 2);
    assert.strictEqual(byTitle(ieeeSections, 'Abstract').text.startsWith('We measure how quickly'), true, 'the text after "Abstract—" belongs to the abstract');
  });

  await test('Not headings: list items, captions, a sentence about limitations, author initials in references', () => {
    const titles = titlesOf(ieeeSections);
    for (const wrong of ['1. Collect the photographs from every camera.', 'TABLE II', 'RESULTS BY PARCEL CLASS']) {
      assert.ok(!titles.includes(wrong), `${wrong} must not be a heading`);
    }
    assert.ok(!titles.some((title) => /Goodfellow|Vapnik|Fig\. 3|Limitations of this approach/.test(title)));
    const dataCollection = byTitle(ieeeSections, 'A. Data Collection');
    assert.ok(dataCollection.text.includes('1. Collect the photographs from every camera.'), 'list items stay in the text of their section');
    const introduction = byTitle(ieeeSections, 'I. INTRODUCTION');
    assert.ok(introduction.text.includes('Limitations of this approach are discussed'));
    const everything = ieeeSections.map((section) => section.text).join('\n');
    assert.ok(!everything.includes('RESULTS BY PARCEL CLASS') && !everything.includes('Fig. 3.'), 'captions are left out of the text');
    assert.ok(byTitle(ieeeSections, 'III. RESULTS').text.startsWith('Table II lists the accuracy'), '"Table II lists ..." is a sentence, not a caption');
    assert.ok(byTitle(ieeeSections, 'REFERENCES').text.includes('I. Goodfellow'));
  });

  const thesisLike = [
    makePage(1, [
      ['Table of Contents', 16],
      { line: 'Abstract . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . ii' },
      { line: 'Chapter 1 Introduction . . . . . . . . . . . . . . . . . . . . . . . . 1' },
      { line: '1.1 Motivation ........................................ 2' },
      { line: 'Chapter 6 Conclusion and Future Work . . . . . . . . . . . . . . . . . 61' },
      { line: '6.1 Summary of Findings . . . . . . . . . . . . . . . . . . . . . . . 61' },
      { line: '6.2 Limitations 63' },
      { line: 'References 70' },
    ], 12),
    makePage(2, [
      ['Chapter 6: Conclusion and Future Work', 18],
      `This chapter closes the thesis. ${FILLER}`,
      ['6.1 Summary of Findings', 14],
      `The warning system worked in both seasons. ${FILLER}`,
      ['6.2 Limitations', 14],
      `Only one river was studied. ${FILLER}`,
      ['WHAT COMES NEXT', 14],
      `A second river will be added. ${FILLER}`,
    ], 12),
    makePage(3, [
      ['Chapter 7', 18],
      ['Closing Remarks', 22],
      `Thanks are due to the river authority. ${FILLER}`,
    ], 12),
  ];
  const thesisSections = splitIntoSections(thesisLike);

  await test('Thesis: contents entries (dot leaders + page number) are neither headings nor text', () => {
    assert.deepStrictEqual(titlesOf(thesisSections), [
      'Table of Contents', 'Chapter 6: Conclusion and Future Work', '6.1 Summary of Findings', '6.2 Limitations', 'WHAT COMES NEXT', 'Chapter 7 Closing Remarks',
    ]);
    assert.strictEqual(byTitle(thesisSections, 'Table of Contents').text, '');
    const everything = thesisSections.map((section) => section.text).join('\n');
    assert.ok(!/\. \. \. \.|\.{6}/.test(everything), 'no dot leaders in any text');
    assert.ok(!everything.includes('References 70'));
  });

  await test('Thesis: "Chapter 6: ..." on one line, "Chapter 7" + title on the next line, larger ALL-CAPS line', () => {
    const chapter = byTitle(thesisSections, 'Chapter 6: Conclusion and Future Work');
    assert.deepStrictEqual(chapter.types, ['conclusion', 'future_work']);
    assert.strictEqual(chapter.level, 1);
    assert.strictEqual(byTitle(thesisSections, '6.2 Limitations').level, 2);
    assert.strictEqual(byTitle(thesisSections, '6.1 Summary of Findings').type, 'conclusion', 'a summary inside the conclusion chapter concludes');
    assert.strictEqual(byTitle(thesisSections, 'WHAT COMES NEXT').type, 'other');
    assert.strictEqual(byTitle(thesisSections, 'Chapter 7 Closing Remarks').type, 'conclusion');
    assert.strictEqual(byTitle(thesisSections, 'Chapter 7 Closing Remarks').startPage, 3);
  });

  await test('"Summary" depends on where it stands: abstract at the front, chapter ending in the middle', () => {
    const sections = splitIntoSections([
      makePage(1, [['Summary', 14], `This report studies wells. ${FILLER}`, ['2 Background', 14], FILLER, ['2.4 Summary', 12], `The chapter reviewed wells. ${FILLER}`]),
      makePage(5, [['6 Summary', 14], `Wells are fine. ${FILLER}`]),
    ]);
    assert.deepStrictEqual(sections.map((section) => [section.title, section.type]), [
      ['Summary', 'abstract'], ['2 Background', 'related_work'], ['2.4 Summary', 'other'], ['6 Summary', 'conclusion'],
    ]);
  });

  await test('Skipped pages end the open section instead of gluing unrelated text to it', () => {
    const sections = splitIntoSections([
      makePage(10, [['4 Results', 14], `The first result is clear. ${FILLER}`]),
      makePage(40, [`This text comes from thirty pages later and belongs to another chapter. ${FILLER}`, ['7 Conclusion', 14], `All is well. ${FILLER}`]),
    ]);
    const results = byTitle(sections, '4 Results');
    assert.strictEqual(results.endPage, 10);
    assert.ok(!results.text.includes('thirty pages later'));
    const orphan = sections.find((section) => section.text.includes('thirty pages later'));
    assert.strictEqual(orphan.title, '');
    assert.strictEqual(orphan.level, 0);
    assert.strictEqual(byTitle(sections, '7 Conclusion').startPage, 40);
  });

  await test('Input that is empty, odd or without sizes does not break the splitter', () => {
    assert.deepStrictEqual(splitIntoSections([]), []);
    assert.deepStrictEqual(splitIntoSections(null), []);
    assert.deepStrictEqual(splitIntoSections([{ page: 1, lines: [] }, { page: 2 }, null]), []);
    const plain = splitIntoSections([{ page: 1, lines: [{ text: 'Introduction' }, { text: 'Some text without any size at all, long enough to be a line.' }, { text: 'Conclusion' }, { text: 'It ends here.' }] }]);
    assert.deepStrictEqual(titlesOf(plain), ['Introduction', 'Conclusion']);
  });

  // =========================================================================
  // 4. Key sections
  // =========================================================================
  console.log('\n  -- Key sections --');

  await test('Dedicated sections are returned whole, with title, page and source own_section', () => {
    const keys = extractKeySections(numberedSections);
    assert.strictEqual(keys.limitations.source, 'own_section');
    assert.strictEqual(keys.limitations.sectionTitle, '5. Limitations');
    assert.strictEqual(keys.limitations.page, 2);
    assert.strictEqual(keys.limitations.truncated, false);
    assert.ok(keys.limitations.text.startsWith('All farms lie in one valley.'));
    assert.strictEqual(keys.conclusion.sectionTitle, '6. Conclusion');
    assert.ok(keys.conclusion.text.startsWith('Cheap sensors are good enough'));
    assert.strictEqual(keys.dataAvailability.sectionTitle, 'Data Availability Statement');
    assert.ok(keys.dataAvailability.text.includes('https://doi.org/10.5281/zenodo.1111111'));
    assert.strictEqual(keys.codeAvailability.sectionTitle, 'Code availability');
    assert.strictEqual(keys.codeAvailability.source, 'own_section');
    assert.strictEqual(keys.codeAvailability.page, 3);
  });

  await test('A combined heading is used for both: future work starts at the first sentence about the future', () => {
    const keys = extractKeySections(numberedSections);
    assert.strictEqual(keys.futureWork.sectionTitle, '5.2 Limitations and Future Work');
    assert.strictEqual(keys.futureWork.source, 'own_section');
    assert.ok(keys.futureWork.text.startsWith('In future work we will test a second soil type.'), keys.futureWork.text.slice(0, 60));

    const only = extractKeySections([{ title: '6 Limitations and Future Work', type: 'limitations', level: 1, startPage: 9, endPage: 9,
      text: 'Our sample is small and comes from one clinic. The follow-up was short. In future work we plan to recruit from three clinics. We will also follow patients for two years.' }]);
    assert.strictEqual(only.limitations.text, 'Our sample is small and comes from one clinic. The follow-up was short.');
    assert.strictEqual(only.futureWork.text, 'In future work we plan to recruit from three clinics. We will also follow patients for two years.');
    assert.strictEqual(only.limitations.source, 'own_section');
    assert.strictEqual(only.futureWork.source, 'own_section');
    assert.strictEqual(only.futureWork.page, 9);
  });

  const discussionText =
    'The effect is similar to earlier reports. It was largest for the weakest students.\n\n' +
    'These results should be read with care. The main limitation of this study is that students chose whether to attend. ' +
    'We did not measure prior experience, which could explain part of the difference. The data come from one university, and we cannot generalize the findings.\n\n' +
    'Despite this, the pattern was the same in all cohorts.';
  const noHeadingPaper = [
    { title: '3 Results', type: 'results', level: 1, startPage: 3, endPage: 3, text: 'Scores rose by eight points. We did not observe any difference between cohorts. The sample size was 412.' },
    { title: '4 Discussion', type: 'discussion', level: 1, startPage: 4, endPage: 5, text: discussionText },
    { title: '5 Conclusion', type: 'conclusion', level: 1, startPage: 5, endPage: 5, text: 'Tutoring helps. Further research should assign places by lottery. We plan to follow the cohort for another year.' },
    { title: 'Acknowledgements', type: 'acknowledgements', level: 1, startPage: 5, endPage: 5, text: 'A limitation of our gratitude is space. In future work we will thank more people.' },
    { title: 'References', type: 'references', level: 1, startPage: 6, endPage: 6, text: 'Doe, J. (2020). Limitations of this study design: a review of future work. Journal of Limits, 1, 1-9.' },
  ];

  await test('No Limitations heading: the limitation sentences inside Discussion are returned as within_section', () => {
    const keys = extractKeySections(noHeadingPaper);
    assert.strictEqual(keys.limitations.source, 'within_section');
    assert.strictEqual(keys.limitations.sectionTitle, '4 Discussion');
    assert.strictEqual(
      keys.limitations.text,
      'These results should be read with care. The main limitation of this study is that students chose whether to attend. ' +
        'We did not measure prior experience, which could explain part of the difference. The data come from one university, and we cannot generalize the findings.'
    );
    assert.ok(discussionText.includes(keys.limitations.text), 'the answer is one unbroken piece of the section');
    assert.strictEqual(keys.futureWork.source, 'within_section');
    assert.strictEqual(keys.futureWork.sectionTitle, '5 Conclusion');
    assert.strictEqual(keys.futureWork.text, 'Further research should assign places by lottery. We plan to follow the cohort for another year.');
    assert.strictEqual(keys.conclusion.source, 'own_section');
  });

  await test('"We did not ..." alone is a finding, not a limitation; Results, References and Acknowledgements are never searched', () => {
    const keys = extractKeySections([
      noHeadingPaper[0],
      { title: '4 Discussion', type: 'discussion', level: 1, startPage: 4, endPage: 4, text: 'Scores rose in every cohort. We did not measure attendance in the first year. The pattern is stable.' },
      noHeadingPaper[3],
      noHeadingPaper[4],
    ]);
    assert.strictEqual(keys.limitations, null);
    assert.strictEqual(keys.futureWork, null);
    assert.strictEqual(keys.conclusion, null);
    assert.strictEqual(keys.dataAvailability, null);
    assert.strictEqual(keys.codeAvailability, null);
  });

  await test('Nothing to find gives nulls for every part, also for empty or broken input', () => {
    const empty = { limitations: null, futureWork: null, conclusion: null, dataAvailability: null, codeAvailability: null };
    assert.deepStrictEqual(extractKeySections([]), empty);
    assert.deepStrictEqual(extractKeySections(null), empty);
    assert.deepStrictEqual(extractKeySections([{ title: 'Results', type: 'results', text: 'Rain fell on 40 days.' }, null, { title: 'x' }]), empty);
  });

  await test('Long text is cut at about 1,400 characters, at the end of a sentence, and flagged as truncated', () => {
    const sentence = 'The seventh survey round was cut short by floods in the two lowest villages of the district.';
    const long = Array.from({ length: 40 }, (_, i) => sentence.replace('seventh', `number ${i + 1}`)).join(' ');
    const keys = extractKeySections([{ title: '7 Limitations', type: 'limitations', level: 1, startPage: 12, endPage: 13, text: long }]);
    assert.strictEqual(keys.limitations.truncated, true);
    assert.ok(keys.limitations.text.length <= 1400 && keys.limitations.text.length > 1250, `length ${keys.limitations.text.length}`);
    assert.ok(keys.limitations.text.endsWith('district.'), 'ends with a whole sentence');
    assert.ok(long.startsWith(keys.limitations.text), 'what is returned is the unchanged start of the section');
    const short = _internals.capText('One sentence only.');
    assert.deepStrictEqual(short, { text: 'One sentence only.', truncated: false });
    const abbreviations = _internals.sentenceSpans('Yields fell (Smith et al. 2019, Fig. 3) by 9.4 cm. J. Doe disagreed. It rained.');
    assert.strictEqual(abbreviations.length, 3, '"et al.", "Fig." and initials do not end a sentence');
  });

  await test('Sub-sections belong to their section; the closing section of an ordinary chapter is not "the conclusion"', () => {
    const keys = extractKeySections([
      { title: 'Chapter 3 Methods', type: 'method', level: 1, startPage: 20, endPage: 20, text: '' },
      { title: '3.6 Conclusion', type: 'conclusion', level: 2, startPage: 31, endPage: 31, text: 'This chapter described the instruments that were used in the field and how they were calibrated.' },
      { title: 'Chapter 6 Conclusion', type: 'conclusion', level: 1, startPage: 80, endPage: 80, text: 'This chapter closes the thesis.' },
      { title: '6.1 Summary of Findings', type: 'conclusion', level: 2, startPage: 80, endPage: 81, text: 'Eight sensors are enough to predict the river level.' },
      { title: '6.2 Limitations', type: 'limitations', level: 2, startPage: 81, endPage: 81, text: 'Only one river was studied, during two seasons without a severe flood.' },
      { title: '6.2.1 Data gaps', type: 'other', level: 3, startPage: 81, endPage: 82, text: 'Six percent of the readings were lost to outages.' },
      { title: '6.3 Future Work', type: 'future_work', level: 2, startPage: 82, endPage: 82, text: 'Further research should test the approach on two more rivers.' },
    ]);
    assert.strictEqual(keys.conclusion.sectionTitle, 'Chapter 6 Conclusion');
    assert.strictEqual(keys.conclusion.text, 'This chapter closes the thesis.\n\nEight sensors are enough to predict the river level.');
    assert.strictEqual(keys.limitations.text, 'Only one river was studied, during two seasons without a severe flood.\n\nSix percent of the readings were lost to outages.');
    assert.strictEqual(keys.futureWork.sectionTitle, '6.3 Future Work');

    const chapterOnly = extractKeySections([
      { title: 'Chapter 3 Methods', type: 'method', level: 1, startPage: 20, endPage: 20, text: '' },
      { title: '3.6 Conclusion', type: 'conclusion', level: 2, startPage: 31, endPage: 31, text: 'This chapter described the instruments that were used in the field and how they were calibrated.' },
    ]);
    assert.strictEqual(chapterOnly.conclusion, null, 'better nothing than the wrong conclusion');
  });

  await test('Availability statements inside other sections are found; borrowed data sets are not mistaken for them', () => {
    const keys = extractKeySections([
      { title: 'Abstract', type: 'abstract', level: 1, startPage: 1, endPage: 1, text: 'We study floods. Our code is publicly available at https://github.com/flood-lab/warn.' },
      { title: '3 Data', type: 'method', level: 1, startPage: 3, endPage: 3, text: 'We use the publicly available ImageNet dataset [3]. No data were available for 2019.' },
      { title: '7 Conclusion', type: 'conclusion', level: 1, startPage: 9, endPage: 9,
        text: 'Warnings arrive four hours early. The datasets generated during the current study are available from the corresponding author on reasonable request.' },
    ]);
    assert.strictEqual(keys.codeAvailability.source, 'within_section');
    assert.strictEqual(keys.codeAvailability.sectionTitle, 'Abstract');
    assert.strictEqual(keys.codeAvailability.text, 'Our code is publicly available at https://github.com/flood-lab/warn.');
    assert.strictEqual(keys.dataAvailability.sectionTitle, '7 Conclusion');
    assert.strictEqual(keys.dataAvailability.text, 'The datasets generated during the current study are available from the corresponding author on reasonable request.');
    assert.strictEqual(keys.dataAvailability.page, 9);
    assert.deepStrictEqual(_internals.availabilityKinds('We use the publicly available ImageNet dataset [3].'), []);
    assert.deepStrictEqual(_internals.availabilityKinds('No new data were generated in this study.'), ['data']);
  });

  // =========================================================================
  // 5. Links
  // =========================================================================
  console.log('\n  -- Code and dataset links --');

  await test('Finds code and dataset links, joins a link broken over two lines, strips sentence punctuation', () => {
    const links = findResourceLinks(numberedPaper);
    assert.deepStrictEqual(links.map((link) => [link.url, link.kind, link.host, link.page]), [
      ['https://doi.org/10.5281/zenodo.1111111', 'dataset', 'doi.org', 3],
      ['https://github.com/soil-lab/sensor-study', 'code', 'github.com', 3],
    ]);
    assert.strictEqual(links[1].context, 'The analysis scripts are available at https://github.com/soil-lab/sensor-study under an open licence.');

    const broken = findResourceLinks([{ page: 4, lines: [
      { text: 'Everything needed to repeat the study is public. The code is kept at https://github.com/river-', size: 10 },
      { text: 'lab/flood-warning-toolkit (version 2.1), and the readings are at https://zenodo.org/', size: 10 },
      { text: 'record/7654321. A copy is at (https://osf.io/q7xk2).', size: 10 },
    ] }]);
    assert.deepStrictEqual(broken.map((link) => [link.url, link.kind]), [
      ['https://github.com/river-lab/flood-warning-toolkit', 'code'],
      ['https://zenodo.org/record/7654321', 'dataset'],
      ['https://osf.io/q7xk2', 'dataset'],
    ]);
    assert.ok(broken.every((link) => link.page === 4 && link.context.length <= 200 && link.context.length > 20));
  });

  await test('Sorts hosts into code, dataset and other; recognises data DOIs and links printed without https://', () => {
    const text = [
      'Code: https://gitlab.com/a/b and https://bitbucket.org/a/c and https://codeberg.org/a/d.',
      'Data: https://figshare.com/articles/dataset/x/1 and https://datadryad.org/stash/dataset/doi:10.5061/dryad.abc and https://www.kaggle.com/datasets/a/b.',
      'More data: https://huggingface.co/datasets/a/b, https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/ABC, https://data.mendeley.com/datasets/abc/1.',
      'Also https://physionet.org/content/x/1.0/, https://archive.ics.uci.edu/dataset/53/iris and https://ieee-dataport.org/documents/x.',
      'By DOI: https://doi.org/10.6084/m9.figshare.123 and doi:10.17632/abcd.1 and plainly github.com/plain/repo.',
    ];
    const mixed = [
      'Other: https://project.example.org/demo and the paper https://doi.org/10.1000/j.jss.2020.1.',
      'Never: http://localhost:3000/x, http://192.168.1.5/data and https://creativecommons.org/licenses/by/4.0/.',
      'The software is archived at https://doi.org/10.5281/zenodo.55 and the model card is at https://huggingface.co/lab/model.',
    ];
    const links = findResourceLinks([{ page: 1, lines: text.map((line) => ({ text: line, size: 10 })) }]);
    const kindOf = Object.fromEntries(links.map((link) => [link.host + new URL(link.url).pathname, link.kind]));
    assert.strictEqual(kindOf['gitlab.com/a/b'], 'code');
    assert.strictEqual(kindOf['bitbucket.org/a/c'], 'code');
    assert.strictEqual(kindOf['codeberg.org/a/d'], 'code');
    assert.strictEqual(kindOf['github.com/plain/repo'], 'code');
    assert.strictEqual(kindOf['figshare.com/articles/dataset/x/1'], 'dataset');
    assert.strictEqual(kindOf['kaggle.com/datasets/a/b'], 'dataset');
    assert.strictEqual(kindOf['huggingface.co/datasets/a/b'], 'dataset');
    assert.strictEqual(kindOf['dataverse.harvard.edu/dataset.xhtml'], 'dataset');
    assert.strictEqual(kindOf['data.mendeley.com/datasets/abc/1'], 'dataset');
    assert.strictEqual(kindOf['physionet.org/content/x/1.0/'], 'dataset');
    assert.strictEqual(kindOf['archive.ics.uci.edu/dataset/53/iris'], 'dataset');
    assert.strictEqual(kindOf['ieee-dataport.org/documents/x'], 'dataset');
    assert.strictEqual(kindOf['doi.org/10.6084/m9.figshare.123'], 'dataset');
    assert.strictEqual(kindOf['doi.org/10.17632/abcd.1'], 'dataset');
    assert.strictEqual(links.length, 15);

    const others = findResourceLinks([{ page: 1, lines: mixed.map((line) => ({ text: line, size: 10 })) }]);
    assert.deepStrictEqual(others.map((link) => [link.url, link.kind]), [
      ['https://doi.org/10.5281/zenodo.55', 'code'], // a Zenodo DOI, but the sentence says it is software
      ['https://project.example.org/demo', 'other'],
      ['https://doi.org/10.1000/j.jss.2020.1', 'other'],
      ['https://huggingface.co/lab/model', 'other'],
    ], 'code and dataset links come first; internal and licence links are dropped');
  });

  await test('Links in the reference list are skipped, unless the entry says it holds the data of this work', () => {
    const pages = [makePage(1, [
      ['1 Introduction', 14],
      `We build on public tools. ${FILLER} Our pipeline is at https://github.com/ours/pipeline for inspection. The same link again: https://github.com/ours/pipeline.`,
      ['References', 14],
      '[1] A. Howard et al., MobileNets, 2017. Available: https://github.com/tensorflow/models',
      '[2] B. Lee, A big corpus, 2019. https://zenodo.org/record/999',
      '[3] The authors, Data supporting this paper, 2023. https://doi.org/10.5281/zenodo.4242',
    ])];
    const links = findResourceLinks(pages);
    assert.deepStrictEqual(links.map((link) => link.url), ['https://github.com/ours/pipeline', 'https://doi.org/10.5281/zenodo.4242']);
  });

  await test('At most 15 links are returned', () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ text: `Tool ${i} lives at https://github.com/lab/tool-${i} and is free.`, size: 10 }));
    assert.strictEqual(findResourceLinks([{ page: 1, lines }]).length, 15);
    assert.deepStrictEqual(findResourceLinks([]), []);
    assert.deepStrictEqual(findResourceLinks(undefined), []);
  });

  // =========================================================================
  // 6. Cache, queue and failure handling of readPaperFullText (stubbed download and reader)
  // =========================================================================
  console.log('\n  -- Cache and queue --');

  const stubPages = [makePage(1, [
    ['1 Introduction', 14], FILLER, ['2 Limitations', 14], `Only one site was studied. ${FILLER}`, ['3 Conclusion', 14], `It works. ${FILLER}`,
  ])];
  const okExtract = async () => ({ ok: true, pageCount: 1, pagesRead: 1, truncated: false, pages: stubPages });
  const pdfRoute = () => fakeResponse(200, {}, [TINY_PDF]);

  await test('Orchestrator returns the documented shape and remembers the result (one download for two calls)', async () => {
    resetFullTextStateForTests();
    const fetchImpl = fakeFetch({ 'https://repo.example.org/p1.pdf': pdfRoute });
    const opts = { lookup: PUBLIC_DNS, fetchImpl, extractImpl: okExtract };
    const first = await readPaperFullText({ pdfUrl: 'https://repo.example.org/p1.pdf' }, opts);
    assert.deepStrictEqual(Object.keys(first).sort(), ['finalUrl', 'keySections', 'links', 'ok', 'pageCount', 'pagesRead', 'sectionTitles', 'truncated']);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.finalUrl, 'https://repo.example.org/p1.pdf');
    assert.deepStrictEqual(first.sectionTitles, [
      { title: '1 Introduction', type: 'introduction', page: 1 }, { title: '2 Limitations', type: 'limitations', page: 1 }, { title: '3 Conclusion', type: 'conclusion', page: 1 },
    ]);
    assert.strictEqual(first.keySections.limitations.sectionTitle, '2 Limitations');
    assert.deepStrictEqual(first.links, []);

    first.keySections.limitations.text = 'changed by the caller';
    const second = await readPaperFullText({ pdfUrl: 'https://repo.example.org/p1.pdf' }, opts);
    assert.strictEqual(fetchImpl.calls.length, 1, 'second call is answered from the cache');
    assert.ok(second.keySections.limitations.text.startsWith('Only one site was studied.'), 'callers cannot damage the cached copy');
  });

  await test('Successes are kept 24 hours, failures 30 minutes', async () => {
    resetFullTextStateForTests();
    let now = 1_000_000;
    const clock = () => now;
    const fetchImpl = fakeFetch({ 'https://repo.example.org/ok.pdf': pdfRoute, 'https://repo.example.org/gone.pdf': () => fakeResponse(404) });
    const opts = { lookup: PUBLIC_DNS, fetchImpl, extractImpl: okExtract, now: clock };
    const count = (url) => fetchImpl.calls.filter((call) => call.url === url).length;

    await readPaperFullText({ pdfUrl: 'https://repo.example.org/ok.pdf' }, opts);
    now += 23 * 60 * 60 * 1000;
    await readPaperFullText({ pdfUrl: 'https://repo.example.org/ok.pdf' }, opts);
    assert.strictEqual(count('https://repo.example.org/ok.pdf'), 1, 'still cached after 23 hours');
    now += 2 * 60 * 60 * 1000;
    await readPaperFullText({ pdfUrl: 'https://repo.example.org/ok.pdf' }, opts);
    assert.strictEqual(count('https://repo.example.org/ok.pdf'), 2, 'fetched again after 25 hours');

    assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://repo.example.org/gone.pdf' }, opts), { ok: false, reason: 'http_404' });
    now += 29 * 60 * 1000;
    assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://repo.example.org/gone.pdf' }, opts), { ok: false, reason: 'http_404' });
    assert.strictEqual(count('https://repo.example.org/gone.pdf'), 1, 'a failure is remembered for 29 minutes');
    now += 2 * 60 * 1000;
    await readPaperFullText({ pdfUrl: 'https://repo.example.org/gone.pdf' }, opts);
    assert.strictEqual(count('https://repo.example.org/gone.pdf'), 2, 'and tried again after 31 minutes');
  });

  await test('The cache holds 40 papers and forgets the one used longest ago', async () => {
    resetFullTextStateForTests();
    const routes = {};
    for (let i = 0; i < 42; i++) routes[`https://repo.example.org/n${i}.pdf`] = pdfRoute;
    const fetchImpl = fakeFetch(routes);
    const opts = { lookup: PUBLIC_DNS, fetchImpl, extractImpl: okExtract };
    const read = (i) => readPaperFullText({ pdfUrl: `https://repo.example.org/n${i}.pdf` }, opts);
    for (let i = 0; i < 40; i++) await read(i);
    await read(0); // paper 0 is used again, so paper 1 is now the oldest
    await read(40); // pushes paper 1 out
    assert.strictEqual(fetchImpl.calls.length, 41);
    await read(0);
    assert.strictEqual(fetchImpl.calls.length, 41, 'paper 0 survived because it was used recently');
    await read(1);
    assert.strictEqual(fetchImpl.calls.length, 42, 'paper 1 had to be fetched again');
  });

  await test('One PDF is parsed at a time, three may wait, the next caller is told "busy" at once', async () => {
    resetFullTextStateForTests();
    const routes = {};
    for (let i = 0; i < 6; i++) routes[`https://repo.example.org/q${i}.pdf`] = pdfRoute;
    const fetchImpl = fakeFetch(routes);
    let active = 0;
    let mostActive = 0;
    const release = [];
    const slowExtract = async () => {
      active++;
      mostActive = Math.max(mostActive, active);
      await new Promise((resolve) => release.push(resolve));
      active--;
      return okExtract();
    };
    const opts = { lookup: PUBLIC_DNS, fetchImpl, extractImpl: slowExtract };
    const jobs = [0, 1, 2, 3].map((i) => readPaperFullText({ pdfUrl: `https://repo.example.org/q${i}.pdf` }, opts));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(release.length, 1, 'only one parse has started');

    const fifth = await readPaperFullText({ pdfUrl: 'https://repo.example.org/q4.pdf' }, opts);
    assert.deepStrictEqual(fifth, { ok: false, reason: 'busy' });
    assert.strictEqual(fetchImpl.calls.some((call) => call.url.endsWith('q4.pdf')), false, 'a refused request does not even download');

    for (let done = 0; done < 4; done++) {
      while (release.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
      release.shift()();
    }
    const results = await Promise.all(jobs);
    assert.ok(results.every((result) => result.ok), 'all four queued papers were read');
    assert.strictEqual(mostActive, 1, 'never two parses at the same time');

    // "busy" is not remembered: the same paper is read as soon as there is room.
    const retry = readPaperFullText({ pdfUrl: 'https://repo.example.org/q4.pdf' }, opts);
    while (release.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    release.shift()();
    assert.strictEqual((await retry).ok, true);
  });

  await test('Two requests for the same paper at the same moment share one download and one parse', async () => {
    resetFullTextStateForTests();
    const fetchImpl = fakeFetch({ 'https://repo.example.org/same.pdf': pdfRoute });
    let parses = 0;
    const extractImpl = async () => {
      parses++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return okExtract();
    };
    const opts = { lookup: PUBLIC_DNS, fetchImpl, extractImpl };
    const [a, b] = await Promise.all([
      readPaperFullText({ pdfUrl: 'https://repo.example.org/same.pdf' }, opts),
      readPaperFullText({ pdfUrl: ' https://repo.example.org/same.pdf ' }, opts),
    ]);
    assert.ok(a.ok && b.ok);
    assert.strictEqual(fetchImpl.calls.length, 1);
    assert.strictEqual(parses, 1);
  });

  await test('Never throws: bad input, a crashing reader and unreadable results all come back as { ok: false, reason }', async () => {
    resetFullTextStateForTests();
    for (const bad of [undefined, null, {}, { pdfUrl: '' }, { pdfUrl: 42 }, 'https://x.example.org/a.pdf']) {
      assert.deepStrictEqual(await readPaperFullText(bad), { ok: false, reason: 'invalid_url' });
    }
    assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'http://localhost/a.pdf' }), { ok: false, reason: 'blocked_host' });

    const fetchImpl = fakeFetch({
      'https://repo.example.org/crash.pdf': pdfRoute, 'https://repo.example.org/locked.pdf': pdfRoute,
      'https://repo.example.org/scan.pdf': pdfRoute, 'https://repo.example.org/login.pdf': () => fakeResponse(200, {}, [fixture('login_page.html')]),
    });
    const base = { lookup: PUBLIC_DNS, fetchImpl };
    const crashing = async () => {
      throw new Error('reader exploded');
    };
    assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://repo.example.org/crash.pdf' }, { ...base, extractImpl: crashing }), { ok: false, reason: 'unreadable' });
    assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://repo.example.org/locked.pdf' }, { ...base, extractImpl: async () => ({ ok: false, reason: 'encrypted' }) }), { ok: false, reason: 'encrypted' });
    const headersOnly = async () => ({ ok: true, pageCount: 3, pagesRead: 3, truncated: false, pages: [makePage(1, ['Scanned by the library'])] });
    assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://repo.example.org/scan.pdf' }, { ...base, extractImpl: headersOnly }), { ok: false, reason: 'no_text_layer' });
    assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://repo.example.org/login.pdf' }, { ...base, extractImpl: okExtract }), { ok: false, reason: 'not_pdf' });
    // After all that the queue is free again.
    assert.strictEqual((await readPaperFullText({ pdfUrl: 'https://repo.example.org/crash.pdf' }, { ...base, extractImpl: okExtract, skipCache: true })).ok, true);
  });

  await test('Without pdfjs-dist the reader answers reader_not_installed, does not crash and does not cache that answer', async () => {
    resetFullTextStateForTests();
    _internals.setPdfjsLoaderForTests(() => null);
    try {
      assert.deepStrictEqual(await extractPdfText(TINY_PDF), { ok: false, reason: 'reader_not_installed' });
      const fetchImpl = fakeFetch({ 'https://repo.example.org/later.pdf': pdfRoute });
      const opts = { lookup: PUBLIC_DNS, fetchImpl };
      assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://repo.example.org/later.pdf' }, opts), { ok: false, reason: 'reader_not_installed' });
      await readPaperFullText({ pdfUrl: 'https://repo.example.org/later.pdf' }, opts);
      assert.strictEqual(fetchImpl.calls.length, 2, 'asked again, so installing the package takes effect without waiting 30 minutes');
    } finally {
      _internals.setPdfjsLoaderForTests(null);
    }
    assert.deepStrictEqual(await extractPdfText(null), { ok: false, reason: 'unreadable' });
    assert.deepStrictEqual(await extractPdfText(Buffer.alloc(0)), { ok: false, reason: 'unreadable' });
  });

  // =========================================================================
  // 7. Real PDFs (needs the optional package pdfjs-dist)
  // =========================================================================
  console.log('\n  -- Reading the fixture PDFs --');
  resetFullTextStateForTests();

  if (!isPdfReaderAvailable()) {
    skipped = 19;
    console.log('  - SKIPPED (pdfjs-dist not installed): 19 tests that read the fixture PDFs.');
    console.log('    Run "npm install pdfjs-dist" in the backend folder to enable them.');
  } else {
    const read = async (name, opts) => extractPdfText(fixture(name), opts);
    const ieee = await read('ieee_two_column.pdf');
    const thesis = await read('thesis.pdf');
    const longThesis = await read('long_thesis.pdf');

    await test('IEEE two-column paper: columns are read left then right, and every heading is found', () => {
      assert.strictEqual(ieee.ok, true);
      assert.strictEqual(ieee.pageCount, 2);
      assert.strictEqual(ieee.pagesRead, 2);
      assert.strictEqual(ieee.truncated, false);
      const sections = splitIntoSections(ieee.pages);
      assert.deepStrictEqual(titlesOf(sections), [
        'Lightweight Crop Disease Recognition on Low-Cost Phones for Smallholder Farms', 'Abstract', 'I. INTRODUCTION', 'II. RELATED WORK',
        'III. METHODOLOGY', 'A. Data Collection', 'B. Network Design', 'IV. EXPERIMENTS', 'V. RESULTS AND DISCUSSION', 'VI. LIMITATIONS',
        'VII. CONCLUSION AND FUTURE WORK', 'DATA AVAILABILITY', 'ACKNOWLEDGMENT', 'REFERENCES',
      ]);
      // If the columns were mixed up, a sentence that runs down the left column would be torn apart.
      const introduction = byTitle(sections, 'I. INTRODUCTION');
      assert.ok(introduction.text.startsWith('Rice and jute are the two crops that most smallholder families in the delta depend on.'));
      assert.ok(introduction.text.endsWith('a study with 64 farmers who used the application for one season.'));
      const everything = sections.map((section) => section.text).join('\n');
      assert.ok(!everything.includes('COMPARISON OF MODELS'), 'table caption left out');
      assert.ok(!everything.includes('ResNet-50 98'), 'table rows left out');
      assert.ok(!everything.includes('Fig. 1.'), 'figure caption left out');
      assert.ok(!everything.includes('Example Conference Society'), 'copyright line of page 1 left out');
      assert.ok(byTitle(sections, 'V. RESULTS AND DISCUSSION').text.startsWith('Table I compares our network with three common baselines.'));
    });

    await test('IEEE paper: limitations section, conclusion and future work from the combined heading, both availability parts', () => {
      const keys = extractKeySections(splitIntoSections(ieee.pages));
      assert.deepStrictEqual(keys.limitations, {
        text:
          'Our study has several limitations. First, all photographs come from a single river delta, so the model may not transfer to regions with different rice varieties or soil colour. ' +
          'Second, the dataset contains few images of early-stage infection, because farmers usually report a disease only after it has spread. ' +
          'Third, the user study lasted one growing season and involved 64 farmers, which is too small to measure any effect on yield.\n\n' +
          'Finally, we evaluated a single phone model. Devices with older cameras may produce images on which the network performs worse than reported here.',
        sectionTitle: 'VI. LIMITATIONS',
        page: 1,
        source: 'own_section',
        truncated: false,
      });
      assert.deepStrictEqual(keys.conclusion, {
        text: 'We presented a 5.7 MB network that recognises twelve leaf diseases on a low-cost phone with 93.1% accuracy and no network connection. A season-long study showed that farmers were able to use it without training.',
        sectionTitle: 'VII. CONCLUSION AND FUTURE WORK',
        page: 2,
        source: 'own_section',
        truncated: false,
      });
      assert.deepStrictEqual(keys.futureWork, {
        text: 'In future work, we plan to collect photographs from two further regions and to add wheat and maize. We also intend to study whether early warnings change how much pesticide farmers apply.',
        sectionTitle: 'VII. CONCLUSION AND FUTURE WORK',
        page: 2,
        source: 'own_section',
        truncated: false,
      });
      assert.strictEqual(keys.dataAvailability.source, 'own_section');
      assert.strictEqual(keys.dataAvailability.sectionTitle, 'DATA AVAILABILITY');
      assert.ok(keys.dataAvailability.text.startsWith('The field photographs and labels that support the findings of this study are openly available in Zenodo'));
      assert.deepStrictEqual(keys.codeAvailability, {
        text: 'The training code and the phone application are available at https://github.com/riverside-agri/leaf-doctor-mobile under the MIT licence.',
        sectionTitle: 'DATA AVAILABILITY',
        page: 2,
        source: 'within_section',
        truncated: false,
      });
    });

    await test('IEEE paper: Zenodo and GitHub links found (the GitHub one re-joined), links of the reference list ignored', () => {
      assert.deepStrictEqual(findResourceLinks(ieee.pages), [
        {
          url: 'https://doi.org/10.5281/zenodo.7654321',
          kind: 'dataset',
          host: 'doi.org',
          page: 2,
          context: 'The field photographs and labels that support the findings of this study are openly available in Zenodo at https://doi.org/10.5281/zenodo.7654321.',
        },
        {
          url: 'https://github.com/riverside-agri/leaf-doctor-mobile',
          kind: 'code',
          host: 'github.com',
          page: 2,
          context: 'The training code and the phone application are available at https://github.com/riverside-agri/leaf-doctor-mobile under the MIT licence.',
        },
      ]);
    });

    await test('Thesis: the contents page is not mistaken for headings, and its lines are in no section', () => {
      assert.strictEqual(thesis.ok, true);
      assert.strictEqual(thesis.pageCount, 11);
      const sections = splitIntoSections(thesis.pages);
      assert.deepStrictEqual(titlesOf(sections), [
        'Flood Early Warning from Low-Cost River Sensors', 'Abstract', 'Table of Contents', 'Chapter 1 Introduction', '1.1 Motivation',
        '1.2 Research Questions', 'Chapter 2 Literature Review', 'Chapter 3 Methodology', '3.1 Sensor Network', '3.2 Forecasting Model',
        'Chapter 4 Results', 'Chapter 5 Conclusion', '5.1 Summary of Findings', '5.2 Limitations', '5.3 Future Work', 'References',
        'Appendix A Sensor Wiring',
      ]);
      assert.strictEqual(byTitle(sections, 'Table of Contents').text, '');
      assert.strictEqual(byTitle(sections, '5.2 Limitations').startPage, 8, 'the real heading on page 8, not the contents entry on page 3');
      assert.strictEqual(byTitle(sections, 'Chapter 5 Conclusion').level, 1);
      assert.strictEqual(byTitle(sections, '5.2 Limitations').level, 2);
      assert.strictEqual(byTitle(sections, 'Appendix A Sensor Wiring').type, 'appendix');
      const everything = sections.map((section) => section.text).join('\n');
      assert.ok(!/\. \. \. \./.test(everything), 'no dot leaders anywhere');
      assert.ok(!everything.includes('Figure 3.1') && !everything.includes('Table 4.1'), 'captions left out');
    });

    await test('Thesis: running header and page numbers removed, hyphenated word joined, section continues over the page break', () => {
      const sections = splitIntoSections(thesis.pages);
      const everything = sections.map((section) => `${section.title}\n${section.text}`).join('\n');
      assert.ok(!/Chapter \d\. /.test(everything), 'the running header "Chapter 5. Conclusion" is gone');
      assert.strictEqual((everything.match(/Flood Early Warning from Low-Cost River Sensors/g) || []).length, 1, 'the title appears once (title page), not on every page');
      const limitations = byTitle(sections, '5.2 Limitations');
      assert.strictEqual(limitations.startPage, 8);
      assert.strictEqual(limitations.endPage, 9);
      assert.strictEqual(
        limitations.text,
        'The findings rest on two monsoon seasons from one river basin. Neither season contained a flood as severe as that of 2017, so the behaviour of the model in extreme events is untested. ' +
          'Sensor outages removed 6% of the readings, and the gaps were filled by interpolation, which may hide short surges. ' +
          'The results therefore should not be taken as evidence of generalization to rivers with dams or tidal influence.'
      );
      assert.ok(byTitle(sections, '1.1 Motivation').text.includes('north-eastern basin'), 'a real hyphen inside a line is kept');
    });

    await test('Thesis: key sections come from chapter 5; no availability statement is invented', () => {
      const keys = extractKeySections(splitIntoSections(thesis.pages));
      assert.strictEqual(keys.limitations.sectionTitle, '5.2 Limitations');
      assert.strictEqual(keys.limitations.page, 8);
      assert.strictEqual(keys.limitations.source, 'own_section');
      assert.deepStrictEqual(keys.futureWork, {
        text:
          'Further research should test the approach on at least two other basins and through a season with a severe flood. ' +
          'Rainfall forecasts from satellite products could be added as inputs to extend the warning time beyond six hours. ' +
          'A field trial with the district disaster committee would show whether the warnings change what people actually do.',
        sectionTitle: '5.3 Future Work',
        page: 9,
        source: 'own_section',
        truncated: false,
      });
      assert.strictEqual(keys.conclusion.sectionTitle, 'Chapter 5 Conclusion');
      assert.strictEqual(keys.conclusion.page, 8);
      assert.ok(keys.conclusion.text.startsWith('This chapter summarises what the thesis found, states its limitations and suggests directions for further study.\n\nA network of fourteen low-cost sensors'));
      assert.ok(!keys.conclusion.text.includes('The findings rest on two monsoon seasons'), 'the limitations sub-section is not repeated inside the conclusion');
      assert.ok(!keys.conclusion.text.includes('Further research should test'), 'nor is the future work sub-section');
      assert.strictEqual(keys.dataAvailability, null);
      assert.strictEqual(keys.codeAvailability, null);
    });

    await test('Thesis: the OSF link in the appendix is found, the GitHub link in the reference list is ignored', () => {
      assert.deepStrictEqual(findResourceLinks(thesis.pages), [
        {
          url: 'https://osf.io/q7xk2',
          kind: 'dataset',
          host: 'osf.io',
          page: 11,
          context: 'The design files are kept at https://osf.io/q7xk2 for anyone who wishes to build the sensors.',
        },
      ]);
    });

    await test('Long thesis (90 pages): first 60 + last 15 are read, plus the conclusion chapter found through the bookmarks', () => {
      assert.strictEqual(longThesis.ok, true);
      assert.strictEqual(longThesis.pageCount, 90);
      assert.strictEqual(longThesis.truncated, true);
      const numbers = longThesis.pages.map((page) => page.page);
      const expected = [];
      for (let n = 1; n <= 60; n++) expected.push(n);
      for (let n = 68; n <= 71; n++) expected.push(n);
      for (let n = 76; n <= 90; n++) expected.push(n);
      assert.deepStrictEqual(numbers, expected);
      assert.strictEqual(longThesis.pagesRead, 79);
    });

    await test('Long thesis: limitations, future work and conclusion are found although they lie outside the normal window', () => {
      const sections = splitIntoSections(longThesis.pages);
      const keys = extractKeySections(sections);
      assert.deepStrictEqual(keys.limitations, {
        text: 'The sensors were calibrated against a single reference station, so drift at the other sites could not be checked. The study covered one city and one winter.',
        sectionTitle: '5.1 Limitations',
        page: 69,
        source: 'own_section',
        truncated: false,
      });
      assert.strictEqual(keys.futureWork.sectionTitle, '5.2 Future Work');
      assert.strictEqual(keys.futureWork.page, 70);
      assert.strictEqual(keys.conclusion.sectionTitle, 'Chapter 5 Conclusions and Future Work');
      assert.strictEqual(keys.conclusion.page, 68);
      assert.ok(keys.conclusion.text.startsWith('The monitoring system built in this thesis ran unattended for fourteen months'));
      // The chapter before the skipped pages must not swallow the chapter after them.
      const evaluation = byTitle(sections, 'Chapter 4 Evaluation');
      assert.strictEqual(evaluation.endPage, 60);
      assert.ok(!evaluation.text.includes('monitoring system built'));
      // Reference entries that continue after the second skipped stretch are still references.
      const orphan = sections.find((section) => section.startPage === 76 && !section.title);
      assert.strictEqual(orphan.type, 'references');
    });

    await test('Long thesis without bookmarks: walking backwards from the last pages still reaches the conclusion', async () => {
      const scanned = await read('long_thesis.pdf', { useOutline: false });
      assert.strictEqual(scanned.ok, true);
      const numbers = scanned.pages.map((page) => page.page);
      assert.strictEqual(numbers.includes(61), false);
      assert.deepStrictEqual(numbers.slice(60, 68), [68, 69, 70, 71, 72, 73, 74, 75]);
      const keys = extractKeySections(splitIntoSections(scanned.pages));
      assert.strictEqual(keys.limitations.sectionTitle, '5.1 Limitations');
      assert.strictEqual(keys.conclusion.sectionTitle, 'Chapter 5 Conclusions and Future Work');

      // With the search switched off the chapter is simply not read: proof that the search matters.
      const plain = await read('long_thesis.pdf', { seekPages: 0 });
      assert.strictEqual(plain.pagesRead, 75);
      assert.strictEqual(plain.truncated, true);
      assert.strictEqual(extractKeySections(splitIntoSections(plain.pages)).limitations, null);
    });

    await test('maxPages limits the work: 10 pages means the first 8 and the last 2', async () => {
      const few = await read('long_thesis.pdf', { maxPages: 10, seekPages: 0 });
      assert.deepStrictEqual(few.pages.map((page) => page.page), [1, 2, 3, 4, 5, 6, 7, 8, 89, 90]);
      assert.strictEqual(few.truncated, true);
      assert.strictEqual(few.pageCount, 90);
    });

    await test('Paper without a Limitations heading: sentences from Discussion and Conclusion, marked within_section', async () => {
      const paper = await read('discussion_only.pdf');
      const sections = splitIntoSections(paper.pages);
      assert.deepStrictEqual(titlesOf(sections), [
        'Peer Tutoring and First-Year Programming Outcomes', 'Abstract', '1 Introduction', '2 Method', '3 Results', '4 Discussion', '5 Conclusion', 'References',
      ]);
      const everything = sections.map((section) => section.text).join('\n');
      assert.ok(!everything.includes('Journal of Applied Learning Research'), 'running header removed in a two-page paper');
      const keys = extractKeySections(sections);
      assert.deepStrictEqual(keys.limitations, {
        text:
          'These results should be read with care. The main limitation of this study is that students chose whether to attend, so motivated students may be over-represented among attenders even after matching. ' +
          'We did not measure prior programming experience, which could explain part of the difference. ' +
          'The data come from a single university, and we cannot generalize the findings to institutions with different entry requirements.',
        sectionTitle: '4 Discussion',
        page: 1,
        source: 'within_section',
        truncated: false,
      });
      assert.deepStrictEqual(keys.futureWork, {
        text: 'Further research should assign tutoring places by lottery so that the effect can be separated from motivation. We plan to follow the 2022 cohort into the second year to see whether the advantage lasts.',
        sectionTitle: '5 Conclusion',
        page: 1,
        source: 'within_section',
        truncated: false,
      });
      assert.strictEqual(keys.conclusion.source, 'own_section');
      assert.ok(!keys.limitations.text.includes('We did not observe'), 'the finding in Results is not a limitation');
      assert.deepStrictEqual(findResourceLinks(paper.pages), []);
    });

    await test('LaTeX-typeset paper: abstract across both columns, table floating inside a paragraph, footnote, "Limitations." paragraph heading', async () => {
      const paper = await read('latex_two_column.pdf');
      assert.strictEqual(paper.ok, true);
      assert.deepStrictEqual(paper.pages.map((page) => page.columns), [2, 2]);
      const sections = splitIntoSections(paper.pages);
      assert.deepStrictEqual(titlesOf(sections), [
        'Detecting Water Stress in Tea Plants from Low-Cost Thermal Images', 'Abstract', '1 Introduction', '2 Related Work', '3 Method',
        '3.1 Data collection', '3.2 Models', '4 Results', '4.1 Effect of image resolution', '5 Discussion', 'Limitations', '6 Conclusion',
        'Data and Code Availability', 'Acknowledgements', 'References',
      ]);
      const abstract = byTitle(sections, 'Abstract').text;
      assert.ok(abstract.startsWith('Water stress lowers tea yields long before leaves show visible damage.') && abstract.endsWith('under two hundred dollars per estate.'));
      const introduction = byTitle(sections, '1 Introduction').text;
      assert.ok(introduction.includes('a field trial in which managers used the phone application'), '"man-" + "agers" joined');
      assert.ok(introduction.includes('a hand-computed index can be explained to a manager'), 'real hyphen kept, line-break hyphen removed');
      // The table floats into the middle of this paragraph; caption and rows are lifted out and
      // the sentence is whole again. The "1" after "stressed." is the footnote mark, as printed.
      assert.strictEqual(
        byTitle(sections, '3.1 Data collection').text,
        'We photographed 2,300 bushes on four estates between March and June. Each bush was photographed with a visible and a thermal camera within ten seconds. ' +
          'Leaf water potential was measured with a pressure chamber on the same day and used as the ground truth. Bushes below a threshold of minus 1.2 MPa were labelled as stressed.1'
      );
      const everything = sections.map((section) => section.text).join('\n');
      assert.ok(!everything.includes('Estate Bushes Stressed') && !everything.includes('Upper Valley') && !everything.includes('Table 1:'));
      assert.ok(!everything.includes('The measurement protocol'), 'the footnote is kept out of the running text');
      assert.ok(byTitle(sections, '3.2 Models').text.includes('1. Align the thermal and the visible image.'), 'a numbered list is text, not headings');

      const keys = extractKeySections(sections);
      assert.deepStrictEqual(keys.limitations, {
        text:
          'All four estates lie in one district and share a single tea cultivar, so the thresholds may not transfer to other regions. ' +
          'The season we studied was unusually dry, and we did not test the method under frequent rain. ' +
          'Leaf water potential was measured on a sub-sample of bushes, which limits the precision of our labels.',
        sectionTitle: 'Limitations',
        page: 2,
        source: 'own_section',
        truncated: false,
      });
      assert.strictEqual(keys.futureWork.source, 'within_section');
      assert.strictEqual(keys.futureWork.sectionTitle, '6 Conclusion');
      assert.strictEqual(keys.futureWork.text, 'In future work we will extend the dataset to two further districts and study whether the index can be computed without a reference cloth.');
      const availability =
        'The images and labels are available at https://doi.org/10.5281/zenodo.1234567, and the code used for all experiments is available at ' +
        'https://github.com/tea-lab/thermal-stress-detection-toolkit-for-phones.';
      assert.strictEqual(keys.dataAvailability.text, availability, 'three line breaks inside two web addresses are mended');
      assert.strictEqual(keys.codeAvailability.text, availability);
      assert.strictEqual(keys.codeAvailability.source, 'own_section');

      const links = findResourceLinks(paper.pages);
      assert.deepStrictEqual(links.map((link) => [link.url, link.kind, link.page]), [
        ['https://github.com/other-lab/thermal-nets', 'code', 1],
        ['https://doi.org/10.5281/zenodo.1234567', 'dataset', 2],
        ['https://github.com/tea-lab/thermal-stress-detection-toolkit-for-phones', 'code', 2],
        ['https://osf.io/ab3cd', 'dataset', 1], // from the footnote
      ]);
      assert.strictEqual(links[3].context, '1The measurement protocol is described at https://osf.io/ab3cd.');
      assert.ok(!links.some((link) => /else-toolbox|10\.1016/.test(link.url)), 'links of the reference list are ignored');
    });

    await test('Paper with none of the wanted sections: every part is null, nothing is guessed', async () => {
      const paper = await read('no_key_sections.pdf');
      assert.strictEqual(paper.ok, true);
      const sections = splitIntoSections(paper.pages);
      assert.deepStrictEqual(titlesOf(sections), ['A Note on Rainfall Records from Three Hill Stations', 'Abstract', 'Introduction', 'Data and Methods', 'Results', 'References']);
      assert.deepStrictEqual(extractKeySections(sections), { limitations: null, futureWork: null, conclusion: null, dataAvailability: null, codeAvailability: null });
      assert.deepStrictEqual(findResourceLinks(paper.pages), []);
    });

    await test('Scanned PDF -> no_text_layer, password-protected -> encrypted, damaged or not a PDF -> unreadable', async () => {
      assert.deepStrictEqual(await read('image_only.pdf'), { ok: false, reason: 'no_text_layer' });
      assert.deepStrictEqual(await read('encrypted.pdf'), { ok: false, reason: 'encrypted' });
      assert.deepStrictEqual(await extractPdfText(fixture('login_page.html')), { ok: false, reason: 'unreadable' });
      const damaged = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(600, 0x41)]);
      assert.deepStrictEqual(await extractPdfText(damaged), { ok: false, reason: 'unreadable' });
      const cutShort = fixture('thesis.pdf').subarray(0, 900);
      assert.strictEqual((await extractPdfText(cutShort)).ok, false);
    });

    await test('The caller\'s buffer is left intact (the reader works on its own copy)', async () => {
      const original = fixture('no_key_sections.pdf');
      const copy = Buffer.from(original);
      await extractPdfText(copy);
      assert.ok(copy.equals(original));
      assert.strictEqual(copy.length, original.length);
    });

    await test('Reading prints nothing: no font or library warnings reach the log', async () => {
      const seen = [];
      const original = { log: console.log, warn: console.warn, error: console.error };
      console.log = (...args) => seen.push(args.join(' '));
      console.warn = (...args) => seen.push(args.join(' '));
      console.error = (...args) => seen.push(args.join(' '));
      try {
        await read('ieee_two_column.pdf');
        await read('encrypted.pdf');
        await read('image_only.pdf');
      } finally {
        Object.assign(console, original);
      }
      assert.deepStrictEqual(seen, []);
    });

    await test('End to end: readPaperFullText on the IEEE paper and the thesis, through the (stubbed) download', async () => {
      resetFullTextStateForTests();
      const serve = (name) => () => fakeResponse(200, { 'Content-Type': 'application/pdf' }, [fixture(name)]);
      const fetchImpl = fakeFetch({
        'https://conf.example.org/redirect/42': () => fakeResponse(302, { Location: 'https://cdn.example.org/papers/42.pdf' }),
        'https://cdn.example.org/papers/42.pdf': serve('ieee_two_column.pdf'),
        'https://uni.example.org/thesis.pdf': serve('thesis.pdf'),
        'https://uni.example.org/long.pdf': serve('long_thesis.pdf'),
      });
      const opts = { lookup: PUBLIC_DNS, fetchImpl };
      const paper = await readPaperFullText({ pdfUrl: 'https://conf.example.org/redirect/42' }, opts);
      assert.strictEqual(paper.ok, true);
      assert.strictEqual(paper.finalUrl, 'https://cdn.example.org/papers/42.pdf');
      assert.strictEqual(paper.pageCount, 2);
      assert.strictEqual(paper.truncated, false);
      assert.strictEqual(paper.keySections.limitations.sectionTitle, 'VI. LIMITATIONS');
      assert.deepStrictEqual(paper.links.map((link) => link.kind), ['dataset', 'code']);
      assert.deepStrictEqual(paper.sectionTitles[9], { title: 'VI. LIMITATIONS', type: 'limitations', page: 1 });
      assert.doesNotThrow(() => JSON.stringify(paper));

      const book = await readPaperFullText({ pdfUrl: 'https://uni.example.org/thesis.pdf' }, opts);
      assert.strictEqual(book.ok, true);
      assert.strictEqual(book.pagesRead, 11);
      assert.strictEqual(book.keySections.futureWork.sectionTitle, '5.3 Future Work');
      assert.strictEqual(book.links[0].url, 'https://osf.io/q7xk2');

      const long = await readPaperFullText({ pdfUrl: 'https://uni.example.org/long.pdf' }, opts);
      assert.strictEqual(long.truncated, true);
      assert.strictEqual(long.pageCount, 90);
      assert.strictEqual(long.keySections.limitations.page, 69);
    });

    await test('End to end: scanned and password-protected PDFs give their reason, and the answer is cached', async () => {
      resetFullTextStateForTests();
      const fetchImpl = fakeFetch({
        'https://old.example.org/scan.pdf': () => fakeResponse(200, {}, [fixture('image_only.pdf')]),
        'https://old.example.org/locked.pdf': () => fakeResponse(200, {}, [fixture('encrypted.pdf')]),
      });
      const opts = { lookup: PUBLIC_DNS, fetchImpl };
      assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://old.example.org/scan.pdf' }, opts), { ok: false, reason: 'no_text_layer' });
      assert.deepStrictEqual(await readPaperFullText({ pdfUrl: 'https://old.example.org/locked.pdf' }, opts), { ok: false, reason: 'encrypted' });
      await readPaperFullText({ pdfUrl: 'https://old.example.org/scan.pdf' }, opts);
      assert.strictEqual(fetchImpl.calls.length, 2);
    });
  }

  resetFullTextStateForTests();
  const skippedNote = skipped ? ` (${skipped} PDF-reading tests SKIPPED: pdfjs-dist not installed)` : '';
  console.log(`\nAll ${passed}/${total} Full-Text Reader tests passed!${skippedNote}\n`);
  return { passed, total, skipped };
}

if (require.main === module) {
  runFullTextTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runFullTextTests };
