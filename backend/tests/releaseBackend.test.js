const assert = require('assert');
const http = require('http');
const zlib = require('zlib');
const express = require('express');
const storage = require('../services/thesisFileStorage');
const { fullTextMessage, isRetryableFullTextReason, FULL_TEXT_MESSAGES } = require('../utils/fullTextMessages');
const { jsonCompression, acceptsGzip } = require('../utils/jsonCompression');
const { generateApaCitation, generateBibtex } = require('../services/citationGenerator');
const fullText = require('../services/fullTextService');
const { normalizeReportIssueType } = require('../utils/reportIssueType');

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runReleaseBackendTests() {
  console.log('Testing: Thesis PDF Storage, Full-Text Messages, JSON Compression & Citation Levels...');
  let passed = 0;
  const check = async (name, fn) => {
    await fn();
    passed += 1;
    console.log(`  ✓ [PASS] ${name}`);
  };

  const env = { CLOUDINARY_CLOUD_NAME: 'democloud', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
  const ownerId = 'c0ffee00c0ffee00c0ffee00';
  const otherId = 'badc0de0badc0de0badc0de0';
  const ref = `thesis_vault/theses/u${ownerId}-${'a1'.repeat(16)}.pdf`;

  await check('Upload size limit: 20 MB by default, kept between 1 and 50', () => {
    assert.strictEqual(storage.getMaxUploadMb({}), 20);
    assert.strictEqual(storage.getMaxUploadMb({ THESIS_PDF_MAX_MB: '35' }), 35);
    assert.strictEqual(storage.getMaxUploadMb({ THESIS_PDF_MAX_MB: '500' }), 50);
    assert.strictEqual(storage.getMaxUploadMb({ THESIS_PDF_MAX_MB: '0' }), 20);
    assert.strictEqual(storage.getMaxUploadMb({ THESIS_PDF_MAX_MB: 'abc' }), 20);
  });

  await check('Only a file that really starts with %PDF- counts as a PDF', () => {
    assert.strictEqual(storage.looksLikePdf(Buffer.from('%PDF-1.7\n...')), true);
    assert.strictEqual(storage.looksLikePdf(Buffer.from('<html>login</html>')), false);
    assert.strictEqual(storage.looksLikePdf(Buffer.from('%PD')), false);
    assert.strictEqual(storage.looksLikePdf(null), false);
  });

  await check('A stored-file address is accepted only for this account and this exact file', () => {
    const good = `https://res.cloudinary.com/democloud/raw/upload/v1712345678/${ref}`;
    assert.strictEqual(storage.isOwnStorageUrl(good, ref, env), true);
    assert.strictEqual(storage.isOwnStorageUrl(good.replace('democloud', 'someoneelse'), ref, env), false, 'another account');
    assert.strictEqual(storage.isOwnStorageUrl(good.replace('https://res.cloudinary.com', 'https://res.cloudinary.com.evil.example'), ref, env), false, 'look-alike host');
    assert.strictEqual(storage.isOwnStorageUrl(good.replace('https:', 'http:'), ref, env), false, 'not https');
    assert.strictEqual(storage.isOwnStorageUrl('https://example.org/thesis.pdf', ref, env), false, 'outside link');
    assert.strictEqual(storage.isOwnStorageUrl(good, 'thesis_vault/student_ids/abc', env), false, 'an ID-card reference');
    assert.strictEqual(storage.isOwnStorageUrl(good, `thesis_vault/theses/u${ownerId}-${'b2'.repeat(16)}.pdf`, env), false, 'a different file');
    assert.strictEqual(storage.isOwnStorageRef(`thesis_vault/theses/${'a1'.repeat(16)}.pdf`), false, 'a name without its uploader is not accepted');
    assert.strictEqual(storage.isOwnStorageUrl(good, ref, {}), false, 'storage not configured');
    assert.strictEqual(storage.isOwnStorageRef('thesis_vault/theses/../../x.pdf'), false);
  });

  await check('Upload stores a raw PDF under a random name and returns its address', async () => {
    let seenOptions = null;
    const uploader = {
      upload_stream: (options, cb) => {
        seenOptions = options;
        return { end: (buf) => cb(null, { secure_url: `https://res.cloudinary.com/democloud/raw/upload/v1/${options.folder}/${options.public_id}`, public_id: `${options.folder}/${options.public_id}`, bytes: buf.length }) };
      },
    };
    const out = await storage.uploadThesisPdf(Buffer.from('%PDF-1.4 test'), { ownerId, uploader, env });
    assert.strictEqual(seenOptions.resource_type, 'raw');
    assert.strictEqual(seenOptions.folder, 'thesis_vault/theses');
    assert.ok(new RegExp(`^u${ownerId}-[a-f0-9]{32}\\.pdf$`).test(seenOptions.public_id));
    assert.strictEqual(storage.storageRefOwner(out.storageRef), ownerId, 'the name says who uploaded the file');
    assert.ok(storage.isOwnStorageRef(out.storageRef));
    assert.ok(storage.isOwnStorageUrl(out.pdfUrl, out.storageRef, env), 'what upload returns must pass the deposit check');
    assert.strictEqual(out.sizeBytes, 13);
  });

  await check('Upload refuses a non-PDF and reports missing storage clearly', async () => {
    await assert.rejects(() => storage.uploadThesisPdf(Buffer.from('not a pdf'), { uploader: {}, env }), (e) => e.code === 'NOT_PDF');
    await assert.rejects(() => storage.uploadThesisPdf(Buffer.from('%PDF-1.4'), { uploader: {}, env: {} }), (e) => e.code === 'STORAGE_UNAVAILABLE');
    await assert.rejects(() => storage.uploadThesisPdf(Buffer.from('%PDF-1.4'), { uploader: {}, env }), (e) => e.code === 'NO_OWNER', 'an upload must belong to a member');
  });

  await check('Removing a stored PDF never throws and ignores references that are not ours', async () => {
    const calls = [];
    const uploader = { destroy: async (r, o) => { calls.push([r, o]); return { result: 'ok' }; } };
    assert.deepStrictEqual(await storage.destroyThesisPdf(ref, { uploader, env }), { removed: true });
    assert.deepStrictEqual(calls[0], [ref, { resource_type: 'raw' }]);
    assert.deepStrictEqual(await storage.destroyThesisPdf('thesis_vault/student_ids/abc', { uploader, env }), { removed: false });
    assert.strictEqual(calls.length, 1, 'an ID-card reference must never be deleted from here');
    const failing = { destroy: async () => { throw new Error('boom'); } };
    const originalWarn = console.warn; console.warn = () => {};
    try { assert.deepStrictEqual(await storage.destroyThesisPdf(ref, { uploader: failing, env }), { removed: false }); } finally { console.warn = originalWarn; }
  });

  await check('An uploaded file belongs to the member who uploaded it', () => {
    assert.strictEqual(storage.isUploadedBy(ref, ownerId), true);
    assert.strictEqual(storage.isUploadedBy(ref, ownerId.toUpperCase()), true, 'ids compare without regard to case');
    assert.strictEqual(storage.isUploadedBy(ref, otherId), false, "another member cannot claim it");
    assert.strictEqual(storage.isUploadedBy(ref, ''), false);
    assert.strictEqual(storage.isUploadedBy('thesis_vault/student_ids/abc', ownerId), false);
    assert.strictEqual(storage.storageRefOwner('https://example.org/x.pdf'), null);
  });

  await check('A stored PDF is removed only when no thesis record still uses it', async () => {
    const calls = [];
    const uploader = { destroy: async (r) => { calls.push(r); return { result: 'ok' }; } };
    const model = (used) => ({ exists: async (filter) => { assert.deepStrictEqual(filter, { pdfStorageRef: ref }); return used ? { _id: 'x' } : null; } });
    assert.deepStrictEqual(await storage.destroyThesisPdfIfUnused(ref, model(true), { uploader, env }), { removed: false, stillUsed: true });
    assert.strictEqual(calls.length, 0, 'a file another record needs must stay');
    assert.deepStrictEqual(await storage.destroyThesisPdfIfUnused(ref, model(false), { uploader, env }), { removed: true });
    assert.deepStrictEqual(calls, [ref]);
    const brokenModel = { exists: async () => { throw new Error('database down'); } };
    const originalWarn = console.warn; console.warn = () => {};
    try { assert.deepStrictEqual(await storage.destroyThesisPdfIfUnused(ref, brokenModel, { uploader, env }), { removed: false }, 'when unsure, keep the file'); } finally { console.warn = originalWarn; }
    assert.strictEqual(calls.length, 1);
  });

  await check('Report types: odd values become "other" instead of an error', () => {
    for (const odd of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.strictEqual(normalizeReportIssueType(odd), 'other');
  });

  await check('Full paper: a line of any length is handled at once', () => {
    const pagesFrom = (text) => [{ page: 1, columns: 1, width: 612, height: 792, lines: [{ text, size: 10, x: 72, y: 700 }] }];
    for (const line of ['. '.repeat(40000), 'a'.repeat(80000), 'a-'.repeat(40000)]) {
      const started = Date.now();
      fullText.splitIntoSections(pagesFrom(line));
      assert.ok(Date.now() - started < 1000, `a ${line.length}-character line took ${Date.now() - started} ms`);
    }
  });

  await check('Full paper: a failure that may pass (host down, slow) is tried again, a lasting one is remembered', async () => {
    fullText.resetFullTextStateForTests();
    const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
    let calls = 0;
    const answer = (status) => async () => { calls += 1; return { status, headers: { get: () => null }, body: null }; };
    const down = { pdfUrl: 'https://repo.example.org/down.pdf' };
    assert.strictEqual((await fullText.readPaperFullText(down, { lookup, fetchImpl: answer(503) })).reason, 'http_503');
    assert.strictEqual((await fullText.readPaperFullText(down, { lookup, fetchImpl: answer(503) })).reason, 'http_503');
    assert.strictEqual(calls, 2, 'the second request must reach the host again');
    const gone = { pdfUrl: 'https://repo.example.org/gone.pdf' };
    await fullText.readPaperFullText(gone, { lookup, fetchImpl: answer(404) });
    await fullText.readPaperFullText(gone, { lookup, fetchImpl: answer(404) });
    assert.strictEqual(calls, 3, 'a missing file is not asked for twice');
    fullText.resetFullTextStateForTests();
  });

  if (fullText.isPdfReaderAvailable()) {
    await check('Full paper: a small file that unpacks into a huge one is stopped, and the site keeps answering', async () => {
      fullText.resetFullTextStateForTests();
      const line = Buffer.from('BT /F1 12 Tf 10 10 Td (limitations of this study are many and varied indeed) Tj ET\n');
      const raw = Buffer.alloc(Math.floor((150 * 1048576) / line.length) * line.length);
      for (let at = 0; at < raw.length; at += line.length) line.copy(raw, at);
      const packed = zlib.deflateSync(raw, { level: 1 });
      const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      ];
      const parts = [Buffer.from('%PDF-1.4\n')];
      const offsets = [];
      let position = parts[0].length;
      const add = (buf) => { parts.push(buf); position += buf.length; };
      objects.forEach((body, index) => { offsets.push(position); add(Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`)); });
      offsets.push(position);
      add(Buffer.from(`4 0 obj\n<< /Length ${packed.length} /Filter /FlateDecode >>\nstream\n`)); add(packed); add(Buffer.from('\nendstream\nendobj\n'));
      offsets.push(position);
      add(Buffer.from('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'));
      const xrefAt = position;
      add(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));
      const pdf = Buffer.concat(parts);

      let longestStall = 0;
      let last = Date.now();
      const beat = setInterval(() => { const now = Date.now(); longestStall = Math.max(longestStall, now - last - 25); last = now; }, 25);
      const started = Date.now();
      const result = await fullText.readPaperFullText(
        { pdfUrl: 'https://repo.example.org/packed.pdf' },
        {
          lookup: async () => [{ address: '93.184.216.34', family: 4 }],
          fetchImpl: async () => ({ status: 200, headers: { get: (name) => (name === 'content-type' ? 'application/pdf' : null) }, body: (async function* body() { yield pdf; })() }),
          skipCache: true,
        }
      );
      clearInterval(beat);
      assert.strictEqual(result.ok, false, 'such a file has nothing to read');
      assert.ok(Date.now() - started < 20000, `it took ${Date.now() - started} ms`);
      assert.ok(longestStall < 1500, `the server could not answer anything else for ${longestStall} ms`);
      fullText.resetFullTextStateForTests();
    });
  }

  await check('Every full-text reason has a plain message, with no technical words', () => {
    for (const reason of [...Object.keys(FULL_TEXT_MESSAGES), 'http_403', 'http_404', 'http_429', 'http_500', 'something_new', '', null]) {
      const text = fullTextMessage(reason);
      assert.ok(typeof text === 'string' && text.length > 15, `no message for ${reason}`);
      assert.ok(!/undefined|null|http_|ECONN|stack|SSRF|DNS/i.test(text), `technical wording for ${reason}: ${text}`);
    }
    assert.ok(/scan/i.test(fullTextMessage('no_text_layer')));
    assert.ok(/sign-in|download page/i.test(fullTextMessage('not_pdf')));
  });

  await check('Only passing problems are offered a "Try again"', () => {
    for (const r of ['timeout', 'network', 'busy', 'http_429', 'http_503']) assert.strictEqual(isRetryableFullTextReason(r), true, r);
    for (const r of ['no_pdf', 'encrypted', 'no_text_layer', 'not_pdf', 'http_404', 'too_large', 'blocked_host']) assert.strictEqual(isRetryableFullTextReason(r), false, r);
  });

  await check('Accept-Encoding is read correctly', () => {
    assert.strictEqual(acceptsGzip({ headers: { 'accept-encoding': 'gzip, deflate, br' } }), true);
    assert.strictEqual(acceptsGzip({ headers: { 'accept-encoding': 'br;q=1.0, gzip;q=0.8' } }), true);
    assert.strictEqual(acceptsGzip({ headers: { 'accept-encoding': 'identity' } }), false);
    assert.strictEqual(acceptsGzip({ headers: { 'accept-encoding': 'gzip;q=0' } }), false);
    assert.strictEqual(acceptsGzip({ headers: {} }), false);
  });

  const app = express();
  app.use(jsonCompression());
  const big = { records: Array.from({ length: 60 }, (_, i) => ({ id: i, title: `Bangla sentiment analysis with transformers ${i}`, abstract: 'We study sentiment in Bangla product reviews. '.repeat(6) })) };
  app.get('/big', (req, res) => res.json(big));
  app.get('/small', (req, res) => res.json({ ok: true }));
  app.get('/created', (req, res) => res.status(201).json(big));
  app.get('/bangla', (req, res) => res.json({ text: 'কৃত্রিম বুদ্ধিমত্তার লেখা নয়। '.repeat(80) }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await check('A large answer is gzip-compressed and unpacks to the same JSON', async () => {
      const res = await request(port, '/big', { 'Accept-Encoding': 'gzip' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-encoding'], 'gzip');
      assert.ok(/accept-encoding/i.test(res.headers.vary || ''));
      assert.ok(/application\/json/.test(res.headers['content-type']));
      assert.strictEqual(Number(res.headers['content-length']), res.body.length);
      const text = zlib.gunzipSync(res.body).toString('utf8');
      assert.deepStrictEqual(JSON.parse(text), big);
      assert.ok(res.body.length < Buffer.byteLength(text) / 3, 'should be at least three times smaller');
    });

    await check('A small answer and a client without gzip are left alone', async () => {
      const small = await request(port, '/small', { 'Accept-Encoding': 'gzip' });
      assert.strictEqual(small.headers['content-encoding'], undefined);
      assert.deepStrictEqual(JSON.parse(small.body.toString()), { ok: true });
      const plain = await request(port, '/big');
      assert.strictEqual(plain.headers['content-encoding'], undefined);
      assert.deepStrictEqual(JSON.parse(plain.body.toString()), big);
    });

    await check('Status codes and Bangla text survive compression', async () => {
      const created = await request(port, '/created', { 'Accept-Encoding': 'gzip' });
      assert.strictEqual(created.status, 201);
      assert.strictEqual(created.headers['content-encoding'], 'gzip');
      const bangla = await request(port, '/bangla', { 'Accept-Encoding': 'gzip, br' });
      assert.ok(JSON.parse(zlib.gunzipSync(bangla.body).toString('utf8')).text.startsWith('কৃত্রিম বুদ্ধিমত্তার লেখা নয়।'));
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  await check('Request limits count a signed-in member by account and a visitor by address', () => {
    const jwt = require('jsonwebtoken');
    const { memberOrAddressKey, generalLimitPerMinute } = require('../middleware/rateLimit');
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'unit-test-secret';
    try {
      const token = jwt.sign({ id: 'user-1' }, 'unit-test-secret');
      assert.strictEqual(memberOrAddressKey({ headers: { authorization: `Bearer ${token}` }, ip: '103.4.5.6' }), 'member:user-1');
      assert.strictEqual(memberOrAddressKey({ headers: { authorization: `Bearer ${jwt.sign({ id: 'user-2' }, 'unit-test-secret')}` }, ip: '103.4.5.6' }), 'member:user-2');
      assert.strictEqual(memberOrAddressKey({ headers: { authorization: 'Bearer made.up.token' }, ip: '103.4.5.6' }), '103.4.5.6');
      assert.strictEqual(memberOrAddressKey({ headers: { authorization: `Bearer ${jwt.sign({ id: 'user-1' }, 'another-secret')}` }, ip: '103.4.5.6' }), '103.4.5.6');
      assert.strictEqual(memberOrAddressKey({ headers: {}, ip: '103.4.5.6' }), '103.4.5.6');
      assert.ok(memberOrAddressKey({ headers: {}, ip: '2001:db8:abcd:12::1' }).startsWith('2001:db8:abcd:'), 'IPv6 visitors are grouped by network');
    } finally {
      process.env.JWT_SECRET = saved;
    }
    assert.strictEqual(generalLimitPerMinute({}), 180);
    assert.strictEqual(generalLimitPerMinute({ API_RATE_LIMIT_PER_MINUTE: '600' }), 600);
    assert.strictEqual(generalLimitPerMinute({ API_RATE_LIMIT_PER_MINUTE: '5' }), 180, 'a value too low to use the site is ignored');
    assert.strictEqual(generalLimitPerMinute({ API_RATE_LIMIT_PER_MINUTE: 'lots' }), 180);
  });

  await check('Publisher filter: "IEEE" finds the long name and the short one, without false matches', () => {
    const { matchesPublisherFilter } = require('../services/searchSessionManager');
    const rec = (publisher) => ({ publisher });
    assert.strictEqual(matchesPublisherFilter(rec('Institute of Electrical and Electronics Engineers'), 'IEEE'), true);
    assert.strictEqual(matchesPublisherFilter(rec('Institute of Electrical and Electronics Engineers (IEEE)'), 'IEEE'), true);
    assert.strictEqual(matchesPublisherFilter(rec('IEEE'), 'IEEE'), true);
    assert.strictEqual(matchesPublisherFilter(rec('IEEE Computer Society'), 'ieee'), true);
    assert.strictEqual(matchesPublisherFilter(rec('IEEE'), 'Institute of Electrical and Electronics Engineers'), true);
    assert.strictEqual(matchesPublisherFilter(rec('Association for Computing Machinery'), 'ACM'), true);
    assert.strictEqual(matchesPublisherFilter(rec('Springer Nature'), 'IEEE'), false);
    assert.strictEqual(matchesPublisherFilter(rec('Elsevier BV'), 'ACM'), false);
    assert.strictEqual(matchesPublisherFilter(rec('Macmillan'), 'ACM'), false, '"acm" inside another word is not a match');
    assert.strictEqual(matchesPublisherFilter(rec(''), 'IEEE'), false);
    assert.strictEqual(matchesPublisherFilter(rec('Elsevier BV'), 'Elsevier'), true);
    assert.strictEqual(matchesPublisherFilter(rec('Anything'), ''), true);
  });

  await check('Citations state the degree level the record states, and nothing more', () => {
    const rec = (degreeType, publicationType = 'thesis') => ({ title: 'T', authors: [{ name: 'Nusrat Jahan' }], publishedYear: 2024, publicationType, degreeType, university: 'BRAC University' });
    assert.ok(generateApaCitation(rec('B.Sc. Undergraduate Thesis')).citation.includes("[Bachelor's thesis, BRAC University]"));
    assert.ok(generateApaCitation(rec('M.Sc. Thesis')).citation.includes("[Master's thesis, BRAC University]"));
    assert.ok(generateApaCitation(rec('Ph.D. Dissertation')).citation.includes('[Doctoral dissertation, BRAC University]'));
    assert.ok(generateApaCitation(rec(null)).citation.includes('[Thesis, BRAC University]'), 'unknown level must not be called doctoral');
    assert.ok(generateApaCitation(rec(null, 'dissertation')).citation.includes('[Doctoral dissertation'));
    const bachelor = generateBibtex(rec('B.Sc. Thesis')).citation;
    assert.ok(bachelor.startsWith('@mastersthesis{') && bachelor.includes("type = {Bachelor's thesis}"));
    assert.ok(generateBibtex(rec('M.Sc. Thesis')).citation.startsWith('@mastersthesis{'));
    assert.ok(!generateBibtex(rec('M.Sc. Thesis')).citation.includes('type ='));
    assert.ok(generateBibtex(rec('Ph.D. Dissertation')).citation.startsWith('@phdthesis{'));
    assert.ok(generateBibtex(rec(null)).citation.includes('type = {Thesis}'));
  });

  console.log(`  ${passed} checks passed.`);
}

module.exports = { runReleaseBackendTests };

if (require.main === module) {
  runReleaseBackendTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
