const assert = require('assert');
const { searchCore, resetCoreStateForTests } = require('../services/providers/core');
const { searchDblp, resetDblpStateForTests } = require('../services/providers/dblp');
const {
  executeSearchSession,
  PROVIDER_NAMES,
  PROVIDER_CAPABILITIES,
} = require('../services/searchSessionManager');
const sessionStore = require('../services/sessionStore');
const { coreSearchWorksResponse } = require('./fixtures/coreApiFixtures');
const { dblpSearchPublResponse, dblpEmptyResponse } = require('./fixtures/dblpApiFixtures');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A copy that a test can change without spoiling the fixture for the next test.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Builds the small part of a fetch() answer that the adapters read.
// Pass body = undefined to imitate an answer whose text is not valid JSON.
function fakeResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected token < in JSON at position 0');
      return body;
    },
  };
}

// Replaces the real fetch. Nothing in this file ever reaches the internet.
// Returns the list of calls made so a test can look at the address and headers used.
function stubFetch(handler) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const call = { url: String(url), params: new URL(String(url)).searchParams, options };
    calls.push(call);
    return handler(call, calls.length);
  };
  return calls;
}

function coreBody(results, extra = {}) {
  return { totalHits: results.length, limit: 10, offset: 0, scrollId: null, results, ...extra };
}

function dblpBody(hits, total = hits.length) {
  return {
    result: {
      query: 'test*',
      status: { '@code': '200', text: 'OK' },
      time: { '@unit': 'msecs', text: '1.00' },
      completions: { '@total': '0', '@computed': '0', '@sent': '0' },
      hits: {
        '@total': String(total),
        '@computed': String(hits.length),
        '@sent': String(hits.length),
        '@first': '0',
        hit: hits,
      },
    },
  };
}

function dblpHit(info) {
  return { '@score': '1', '@id': '1', info, url: 'URL#1' };
}

function manyCoreWorks(count, startId = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    title: `Generated CORE work number ${startId + i}`,
    authors: [{ name: `Author, Sample${startId + i}` }],
    documentType: 'research',
    yearPublished: 2020,
  }));
}

function manyDblpHits(count, startId = 1) {
  return Array.from({ length: count }, (_, i) =>
    dblpHit({
      authors: { author: { '@pid': `1/${startId + i}`, text: `Sample Author${startId + i}` } },
      title: `Generated DBLP paper number ${startId + i}.`,
      year: '2020',
      type: 'Journal Articles',
      key: `journals/gen/${startId + i}`,
    })
  );
}

function byProvider(records, provider) {
  return records.filter((r) => (r.sources || []).some((s) => s.provider === provider));
}

async function runNewProviderTests() {
  console.log('Testing: New Federated Providers (CORE and DBLP)...');

  const originalFetch = global.fetch;
  const originalEnvOffline = process.env.OFFLINE_MODE;
  const originalCoreKey = process.env.CORE_API_KEY;
  let passed = 0;
  const pass = (message) => {
    passed++;
    console.log(`  ✓ [PASS] ${message}`);
  };

  try {
    delete process.env.CORE_API_KEY;
    process.env.OFFLINE_MODE = 'false';
    resetCoreStateForTests();
    resetDblpStateForTests();

    // =======================================================================
    // PART A: CORE
    // =======================================================================
    console.log('--- 1. CORE Provider Adapter ---');

    // A1: the request that is sent
    {
      const calls = stubFetch(() => fakeResponse(coreBody([])));
      await searchCore({ query: 'BERT: pre-training (2019) "deep" -models', page: 1, limit: 10 });

      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].url.startsWith('https://api.core.ac.uk/v3/search/works?'), 'CORE v3 search endpoint');
      assert.strictEqual(calls[0].params.get('q'), 'BERT pre training 2019 deep models', 'query-language characters are removed');
      assert.strictEqual(calls[0].params.get('limit'), '10');
      assert.strictEqual(calls[0].params.get('offset'), '0');
      assert.strictEqual(calls[0].params.get('exclude'), 'fullText', 'CORE is asked to leave the full text out');
      assert.strictEqual(calls[0].options.headers.Authorization, undefined, 'no key, no Authorization header');
      assert.ok(calls[0].options.headers['User-Agent'].includes('ThesisArchive'));
      assert.ok(calls[0].options.signal instanceof AbortSignal, 'request carries a time limit');

      const emptyQuery = stubFetch(() => fakeResponse(coreBody([])));
      await searchCore({ query: '  ' });
      assert.strictEqual(emptyQuery[0].params.get('q'), 'research', 'empty search falls back like the other providers');
      pass('CORE request uses the v3 search endpoint, a cleaned query, a time limit and no key by default');
    }

    // A2: API key
    {
      process.env.CORE_API_KEY = '  test-core-key-123  ';
      const withKey = stubFetch(() => fakeResponse(coreBody([])));
      await searchCore({ query: 'solar cells' });
      assert.strictEqual(withKey[0].options.headers.Authorization, 'Bearer test-core-key-123');

      process.env.CORE_API_KEY = '   ';
      const blankKey = stubFetch(() => fakeResponse(coreBody([])));
      await searchCore({ query: 'solar cells' });
      assert.strictEqual(blankKey[0].options.headers.Authorization, undefined, 'a blank key is treated as no key');
      delete process.env.CORE_API_KEY;
      pass('CORE sends CORE_API_KEY as a Bearer token and works without it');
    }

    // A3: every field of a complete thesis record
    let coreRecords;
    {
      stubFetch(() => fakeResponse(clone(coreSearchWorksResponse)));
      const res = await searchCore({ query: 'deep learning', limit: 20 });
      coreRecords = res.records;

      assert.strictEqual(res.error, null);
      assert.strictEqual(res.rawCount, 6, 'rawCount counts what CORE sent');
      assert.strictEqual(res.totalCount, 6);
      assert.strictEqual(res.records.length, 5, 'the work without a title is skipped');
      assert.strictEqual(res.hasMore, false);
      assert.strictEqual(res.nextOffset, 6);
      assert.strictEqual(res.nextPage, null);

      const thesis = res.records[0];
      assert.strictEqual(thesis.id, 'core_900000001');
      assert.strictEqual(thesis._id, 'core_900000001');
      assert.strictEqual(thesis.title, 'Deep Learning Methods for Flood Forecasting in River Deltas');
      assert.deepStrictEqual(thesis.authors, [{ name: 'Farhana Rahman', affiliation: null }]);
      assert.strictEqual(thesis.authorDisplay, 'Farhana Rahman');
      assert.ok(thesis.abstract.startsWith('This doctoral thesis develops recurrent'));
      assert.strictEqual(thesis.publicationType, 'thesis');
      assert.strictEqual(thesis.isPeerReviewed, false);
      assert.strictEqual(thesis.publishedYear, 2021);
      assert.strictEqual(thesis.publicationDate, '2021-09-01');
      assert.strictEqual(thesis.venue, null);
      assert.strictEqual(thesis.publisher, 'Example University');
      assert.strictEqual(thesis.doi, null);
      assert.strictEqual(thesis.doiUrl, null);
      assert.strictEqual(thesis.isOpenAccess, true);
      assert.strictEqual(thesis.pdfUrl, 'https://core.ac.uk/download/900000001.pdf');
      assert.strictEqual(thesis.isDirectPdf, true);
      assert.strictEqual(thesis.fullTextUrl, 'https://core.ac.uk/reader/900000001');
      assert.strictEqual(thesis.category, 'computer science');
      assert.strictEqual(thesis.language, 'en');
      assert.strictEqual(thesis.catalogId, 'CORE:900000001');
      assert.strictEqual(thesis.citationCount, null, 'CORE citation numbers are not shown as verified counts');
      assert.deepStrictEqual(thesis.sources, [
        { provider: 'CORE', id: 'CORE:900000001', url: 'https://core.ac.uk/download/900000001.pdf' },
      ]);
      assert.deepStrictEqual(thesis.fullTextLocations, [
        { type: 'pdf', url: 'https://core.ac.uk/download/900000001.pdf', source: 'CORE Full Text PDF', isDirectPdf: true },
        {
          type: 'pdf',
          url: 'https://repository.example.edu/bitstream/handle/1234/5678/thesis.pdf',
          source: 'Example University Research Repository',
          isDirectPdf: true,
        },
        { type: 'html', url: 'https://core.ac.uk/reader/900000001', source: 'CORE Reader', isDirectPdf: false },
        { type: 'landing', url: 'https://core.ac.uk/works/900000001', source: 'CORE Record Page', isDirectPdf: false },
      ]);
      pass('CORE thesis record maps every field (title, author, year, type, links, language, provenance)');
    }

    // A4: journal article with HTML entities, "Surname, Given" names and a quoted publisher
    {
      const article = coreRecords[1];
      assert.strictEqual(article.title, 'Transformers & Sentiment: A Study of Low-Resource Text – Models, Data "Gaps"');
      assert.deepStrictEqual(
        article.authors.map((a) => a.name),
        ['Chidinma Okafor', 'Per-Olof Lindqvist', 'Tanvir Ahmed'],
        '"Surname, Given" is turned round; a name already in order is left alone'
      );
      assert.strictEqual(article.doi, '10.5555/core.fixture.0002', 'DOI is lower-cased');
      assert.strictEqual(article.doiUrl, 'https://doi.org/10.5555/core.fixture.0002');
      assert.strictEqual(article.publicationType, 'journal-article');
      assert.strictEqual(article.isPeerReviewed, true);
      assert.strictEqual(article.venue, 'Journal of Language Technology Research');
      assert.strictEqual(article.publisher, 'Example Science Publishing BV', 'stray quotes around the publisher are removed');
      assert.strictEqual(article.publishedYear, 2020);
      assert.ok(article.abstract.startsWith('We compare transformer language models for sentiment & emotion'));
      assert.ok(!/[<>]|&amp;/.test(article.abstract), 'abstract has no tags or entities left');
      assert.strictEqual(article.pdfUrl, 'https://core.ac.uk/download/pdf/900000002.pdf');
      assert.ok(
        article.fullTextLocations.some((l) => l.url === 'https://doi.org/10.5555/core.fixture.0002' && l.type === 'landing')
      );
      pass('CORE article decodes HTML entities, strips tags, fixes author name order and cleans the publisher');
    }

    // A5: missing and odd fields
    {
      const paper = coreRecords[2];
      assert.strictEqual(paper.publishedYear, 2019, 'year is read from publishedDate when yearPublished is empty');
      assert.deepStrictEqual(
        paper.authors.map((a) => a.name),
        ['World Health Analytics Consortium, Geneva', 'Mariam Sultana'],
        'an organisation name with a comma is not turned round'
      );
      assert.strictEqual(paper.publicationType, 'unknown', '"research" with no journal is not guessed to be an article');
      assert.strictEqual(paper.isPeerReviewed, false);
      assert.strictEqual(paper.pdfUrl, 'https://kb.example.org/record/4455/files/working-paper.pdf', 'sourceFulltextUrls as plain text');
      assert.strictEqual(paper.publisher, null);
      assert.strictEqual(paper.language, null);

      const sparse = coreRecords[3];
      assert.strictEqual(sparse.title, 'Untitled lecture slides on network protocols', 'title is trimmed');
      assert.deepStrictEqual(sparse.authors, []);
      assert.strictEqual(sparse.authorDisplay, 'Unknown Author');
      assert.strictEqual(sparse.publishedYear, null);
      assert.strictEqual(sparse.publicationDate, null);
      assert.strictEqual(sparse.abstract, null);
      assert.strictEqual(sparse.doi, null);
      assert.strictEqual(sparse.pdfUrl, null);
      assert.strictEqual(sparse.isDirectPdf, false);
      assert.strictEqual(sparse.isOpenAccess, false, 'a work with no readable copy is not called open access');
      assert.strictEqual(sparse.language, null);
      assert.strictEqual(sparse.fullTextUrl, 'https://core.ac.uk/works/900000004', 'record page is built from the id');

      const spanish = coreRecords[4];
      assert.strictEqual(spanish.id, 'core_900000006');
      assert.strictEqual(spanish.publicationType, 'thesis', 'documentType sent as a list');
      assert.strictEqual(spanish.pdfUrl, null, 'a repository web page in downloadUrl is not promised as a PDF');
      assert.strictEqual(spanish.isDirectPdf, false);
      assert.strictEqual(spanish.isOpenAccess, true);
      assert.strictEqual(spanish.publisher, 'Repositorio Institucional de Ejemplo', 'a thesis falls back to its repository');
      assert.strictEqual(spanish.language, 'es');

      // Things that are not works at all must be skipped, not crash the search.
      stubFetch(() => fakeResponse(coreBody([null, 'text', 42, { id: 7 }, { id: 8, title: 'A Valid Work About Rivers', authors: ['Plain, Text'] }])));
      const odd = await searchCore({ query: 'rivers' });
      assert.strictEqual(odd.error, null);
      assert.strictEqual(odd.rawCount, 5);
      assert.strictEqual(odd.records.length, 1);
      assert.deepStrictEqual(odd.records[0].authors, [{ name: 'Text Plain', affiliation: null }], 'author given as plain text');
      pass('CORE handles missing, empty and oddly shaped fields without inventing data');
    }

    // A6: filters
    {
      stubFetch(() => fakeResponse(clone(coreSearchWorksResponse)));
      const ids = async (filters) => {
        const res = await searchCore({ query: 'deep learning', filters });
        assert.strictEqual(res.rawCount, 6, 'filters never change rawCount, so paging stays correct');
        assert.strictEqual(res.error, null);
        return res.records.map((r) => r.id);
      };

      assert.deepStrictEqual(await ids({ yearMin: 2020 }), ['core_900000001', 'core_900000002']);
      assert.deepStrictEqual(await ids({ yearMax: '2019' }), ['core_900000003', 'core_900000006']);
      assert.deepStrictEqual(await ids({ yearMin: 2019, yearMax: 2020 }), ['core_900000002', 'core_900000003']);
      assert.deepStrictEqual(await ids({ publicationType: 'thesis' }), ['core_900000001', 'core_900000006']);
      assert.deepStrictEqual(await ids({ publicationType: 'dissertation' }), ['core_900000001', 'core_900000006']);
      assert.deepStrictEqual(await ids({ publicationType: 'journal-article' }), ['core_900000002']);
      assert.deepStrictEqual(await ids({ publicationType: 'all' }).then((l) => l.length), 5);
      assert.deepStrictEqual(await ids({ hasPdf: true }), ['core_900000001', 'core_900000002', 'core_900000003']);
      assert.deepStrictEqual(await ids({ hasPdf: true, publicationType: 'thesis', yearMin: 2018 }), ['core_900000001']);
      // filters = null must not crash (the search manager always sends an object, but be safe)
      const noFilters = await searchCore({ query: 'deep learning', filters: null });
      assert.strictEqual(noFilters.records.length, 5);
      pass('CORE applies year range, publication type and PDF filters to the returned records');
    }

    // A7: pagination and hasMore
    {
      let calls = stubFetch(() => fakeResponse(coreBody(manyCoreWorks(30), { totalHits: 95 })));
      const first = await searchCore({ query: 'water', limit: 50 });
      assert.strictEqual(calls[0].params.get('limit'), '30', 'page size is capped at 30');
      assert.strictEqual(first.records.length, 30);
      assert.strictEqual(first.totalCount, 95);
      assert.strictEqual(first.hasMore, true);
      assert.strictEqual(first.nextOffset, 30);
      assert.strictEqual(first.nextPage, 2);

      calls = stubFetch(() => fakeResponse(coreBody(manyCoreWorks(5, 91), { totalHits: 95 })));
      const last = await searchCore({ query: 'water', offset: 90, limit: 30 });
      assert.strictEqual(calls[0].params.get('offset'), '90', 'the offset from the search manager is passed on');
      assert.strictEqual(last.hasMore, false);
      assert.strictEqual(last.nextOffset, 95);
      assert.strictEqual(last.nextPage, null);

      calls = stubFetch(() => fakeResponse(coreBody([], { totalHits: 95 })));
      const byPage = await searchCore({ query: 'water', page: 3, limit: 10 });
      assert.strictEqual(calls[0].params.get('offset'), '20', 'page 3 of 10 starts at offset 20');
      assert.strictEqual(byPage.hasMore, false, 'an empty page ends the search even when the total says otherwise');

      stubFetch(() => fakeResponse({ results: manyCoreWorks(3) }));
      const noTotal = await searchCore({ query: 'water' });
      assert.strictEqual(noTotal.totalCount, 3, 'a missing total falls back to the number received');
      assert.strictEqual(noTotal.hasMore, false);

      stubFetch(() => fakeResponse(coreBody([])));
      const none = await searchCore({ query: 'zzzznothing' });
      assert.deepStrictEqual(
        { records: none.records, rawCount: none.rawCount, totalCount: none.totalCount, hasMore: none.hasMore, error: none.error },
        { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: null }
      );
      pass('CORE pagination: capped page size, offsets, hasMore, last page, empty page and zero results');
    }

    // A8: HTTP 429
    {
      resetCoreStateForTests();
      let calls = stubFetch(() => fakeResponse({ message: 'Too many requests' }, { status: 429 }));
      const limited = await searchCore({ query: 'water' });
      assert.strictEqual(limited.error, 'CORE rate limit reached');
      assert.deepStrictEqual(limited.records, []);
      assert.strictEqual(limited.rawCount, 0);
      assert.strictEqual(limited.hasMore, false);
      assert.strictEqual(calls.length, 1, 'a 429 without a short wait is not retried');

      // While told to wait, CORE is not called again at all.
      calls = stubFetch(() => fakeResponse(coreBody(manyCoreWorks(2))));
      const duringWait = await searchCore({ query: 'water' });
      assert.strictEqual(calls.length, 0, 'no request is sent during the waiting time');
      assert.strictEqual(duringWait.error, 'CORE rate limit reached');

      resetCoreStateForTests();
      const afterWait = await searchCore({ query: 'water' });
      assert.strictEqual(afterWait.error, null);
      assert.strictEqual(afterWait.records.length, 2);

      // A very short wait is honoured once, then the search goes through.
      calls = stubFetch((call, n) =>
        n === 1 ? fakeResponse({}, { status: 429, headers: { 'Retry-After': '1' } }) : fakeResponse(coreBody(manyCoreWorks(3)))
      );
      const startedAt = Date.now();
      const retried = await searchCore({ query: 'water' });
      assert.strictEqual(calls.length, 2, 'exactly one retry');
      assert.ok(Date.now() - startedAt >= 900, 'the retry waits for the time CORE asked for');
      assert.strictEqual(retried.error, null);
      assert.strictEqual(retried.records.length, 3);

      // Two refusals in a row: give up after the single retry.
      calls = stubFetch(() => fakeResponse({}, { status: 429, headers: { 'X-RateLimit-Retry-After': '1' } }));
      const refusedTwice = await searchCore({ query: 'water' });
      assert.strictEqual(calls.length, 2, 'never more than one retry');
      assert.strictEqual(refusedTwice.error, 'CORE rate limit reached');

      // A long wait is not slept through; the adapter answers at once and remembers it.
      resetCoreStateForTests();
      calls = stubFetch(() => fakeResponse({}, { status: 429, headers: { 'Retry-After': '120' } }));
      const longWait = await searchCore({ query: 'water' });
      await searchCore({ query: 'water' });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(longWait.error, 'CORE rate limit reached');
      resetCoreStateForTests();
      pass('CORE 429: clean error, one short retry at most, and no further calls while told to wait');
    }

    // A9: network errors and bad answers
    {
      const expectError = async (handler, expected) => {
        resetCoreStateForTests();
        stubFetch(handler);
        const res = await searchCore({ query: 'water' });
        assert.strictEqual(res.error, expected);
        assert.deepStrictEqual(res.records, []);
        assert.strictEqual(res.rawCount, 0);
        assert.strictEqual(res.totalCount, 0);
        assert.strictEqual(res.hasMore, false);
      };

      await expectError(() => {
        throw new Error('getaddrinfo ENOTFOUND api.core.ac.uk');
      }, 'CORE network error: getaddrinfo ENOTFOUND api.core.ac.uk');
      await expectError(() => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      }, 'CORE request timed out');
      await expectError(() => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        throw err;
      }, 'CORE request timed out');
      await expectError(() => fakeResponse({}, { status: 503 }), 'CORE service error (503)');
      await expectError(() => fakeResponse({}, { status: 401 }), 'CORE authentication failed (401)');
      await expectError(() => fakeResponse({}, { status: 403 }), 'CORE access forbidden (403)');
      await expectError(() => fakeResponse({}, { status: 404 }), 'CORE HTTP 404');
      await expectError(() => fakeResponse(undefined), 'CORE returned malformed response');
      await expectError(() => fakeResponse(null), 'CORE returned malformed response');
      await expectError(() => fakeResponse({ totalHits: 3, results: 'not a list' }), 'CORE returned malformed response');
      pass('CORE network failure, timeout, 4xx/5xx and malformed answers become an error result, never a crash');
    }

    // A10: the "leave the full text out" request falls back safely if CORE refuses it
    {
      resetCoreStateForTests();
      let calls = stubFetch((call) =>
        call.params.has('exclude') ? fakeResponse({ message: 'Unknown parameter' }, { status: 400 }) : fakeResponse(coreBody(manyCoreWorks(2)))
      );
      const res = await searchCore({ query: 'water' });
      assert.strictEqual(res.error, null);
      assert.strictEqual(res.records.length, 2);
      assert.strictEqual(calls.length, 2, 'asked once with the hint, once without');
      assert.strictEqual(calls[1].params.has('exclude'), false);

      calls = stubFetch(() => fakeResponse(coreBody(manyCoreWorks(2))));
      await searchCore({ query: 'water' });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].params.has('exclude'), false, 'once refused, the hint is not sent again');

      // A wrong key must not be asked twice.
      resetCoreStateForTests();
      calls = stubFetch(() => fakeResponse({}, { status: 401 }));
      await searchCore({ query: 'water' });
      assert.strictEqual(calls.length, 1);
      resetCoreStateForTests();
      pass('CORE keeps working if the service refuses the "exclude full text" request');
    }

    // A11: offline mode
    {
      process.env.OFFLINE_MODE = 'true';
      const calls = stubFetch(() => {
        throw new Error('offline mode must not use the network');
      });
      const res = await searchCore({ query: 'deep learning', limit: 20 });
      assert.strictEqual(calls.length, 0);
      assert.strictEqual(res.error, null);
      assert.strictEqual(res.records.length, 5);
      assert.strictEqual(res.rawCount, 6);
      assert.strictEqual(res.hasMore, false);
      assert.strictEqual(res.records[0].sources[0].provider, 'CORE');

      const page1 = await searchCore({ query: 'deep learning', offset: 0, limit: 2 });
      const page2 = await searchCore({ query: 'deep learning', offset: 2, limit: 2 });
      assert.strictEqual(page1.hasMore, true);
      assert.strictEqual(page1.nextOffset, 2);
      assert.deepStrictEqual(page1.records.map((r) => r.id), ['core_900000001', 'core_900000002']);
      assert.deepStrictEqual(page2.records.map((r) => r.id), ['core_900000003', 'core_900000004']);
      const thesesOnly = await searchCore({ query: 'deep learning', filters: { publicationType: 'thesis' } });
      assert.strictEqual(thesesOnly.records.length, 2, 'filters also work on offline records');
      process.env.OFFLINE_MODE = 'false';
      pass('CORE offline mode returns deterministic records with paging and no network call');
    }

    // =======================================================================
    // PART B: DBLP
    // =======================================================================
    console.log('--- 2. DBLP Provider Adapter ---');

    // B1: the request that is sent
    {
      const calls = stubFetch(() => fakeResponse(clone(dblpEmptyResponse)));
      await searchDblp({ query: 'author:Wei_Wang: graph|tree$ (2020)', page: 1, limit: 10 });

      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].url.startsWith('https://dblp.org/search/publ/api?'), 'DBLP publication search endpoint');
      assert.strictEqual(calls[0].params.get('q'), 'author Wei Wang graph tree 2020', 'search-language characters are removed');
      assert.strictEqual(calls[0].params.get('format'), 'json');
      assert.strictEqual(calls[0].params.get('h'), '10');
      assert.strictEqual(calls[0].params.get('f'), '0');
      assert.strictEqual(calls[0].params.get('c'), '0');
      assert.strictEqual(calls[0].options.headers.Authorization, undefined, 'DBLP has no key');
      assert.ok(calls[0].options.headers['User-Agent'].includes('ThesisArchive'));
      assert.ok(calls[0].options.signal instanceof AbortSignal, 'request carries a time limit');

      const emptyQuery = stubFetch(() => fakeResponse(clone(dblpEmptyResponse)));
      await searchDblp({ query: '' });
      assert.strictEqual(emptyQuery[0].params.get('q'), 'research');
      pass('DBLP request uses the publication search endpoint, JSON format, a cleaned query and a time limit');
    }

    // B2: every field of a complete journal article
    let dblpRecords;
    {
      stubFetch(() => fakeResponse(clone(dblpSearchPublResponse)));
      const res = await searchDblp({ query: 'deep learning', limit: 20 });
      dblpRecords = res.records;

      assert.strictEqual(res.error, null);
      assert.strictEqual(res.rawCount, 8);
      assert.strictEqual(res.totalCount, 8, '"@total" is sent as text and read as a number');
      assert.strictEqual(res.records.length, 7, 'the hit without a title is skipped');
      assert.strictEqual(res.hasMore, false);
      assert.strictEqual(res.nextOffset, 8);
      assert.strictEqual(res.nextPage, null);

      const article = res.records[0];
      assert.strictEqual(article.id, 'dblp_journals_jemlr_WangJL21');
      assert.strictEqual(article._id, 'dblp_journals_jemlr_WangJL21');
      assert.strictEqual(article.title, 'Deep Learning for Flood Forecasting in River Deltas', 'the closing full stop is removed');
      assert.deepStrictEqual(article.authors, [
        { name: 'Wei Wang', affiliation: null },
        { name: 'Nusrat Jahan', affiliation: null },
        { name: 'Per-Olof Lindqvist', affiliation: null },
      ]);
      assert.strictEqual(article.authorDisplay, 'Wei Wang, Nusrat Jahan, Per-Olof Lindqvist');
      assert.strictEqual(article.abstract, null, 'DBLP has no abstracts and none is made up');
      assert.strictEqual(article.publicationType, 'journal-article');
      assert.strictEqual(article.isPeerReviewed, true);
      assert.strictEqual(article.publishedYear, 2021);
      assert.strictEqual(article.publicationDate, '2021-01-01');
      assert.strictEqual(article.venue, 'J. Example Mach. Learn. Res.');
      assert.strictEqual(article.publisher, null);
      assert.strictEqual(article.doi, '10.5555/dblp.fixture.0001', 'DOI is lower-cased');
      assert.strictEqual(article.doiUrl, 'https://doi.org/10.5555/dblp.fixture.0001');
      assert.strictEqual(article.isOpenAccess, false, 'access "closed"');
      assert.strictEqual(article.pdfUrl, null);
      assert.strictEqual(article.isDirectPdf, false);
      assert.strictEqual(article.fullTextUrl, 'https://doi.org/10.5555/DBLP.Fixture.0001', 'the "ee" link');
      assert.strictEqual(article.catalogId, 'DBLP:journals/jemlr/WangJL21');
      assert.strictEqual(article.citationCount, null);
      assert.deepStrictEqual(article.sources, [
        { provider: 'DBLP', id: 'DBLP:journals/jemlr/WangJL21', url: 'https://doi.org/10.5555/DBLP.Fixture.0001' },
      ]);
      assert.deepStrictEqual(
        article.fullTextLocations,
        [
          { type: 'landing', url: 'https://doi.org/10.5555/DBLP.Fixture.0001', source: 'Publisher DOI Landing Page', isDirectPdf: false },
          { type: 'landing', url: 'https://dblp.org/rec/journals/jemlr/WangJL21', source: 'DBLP Record Page', isDirectPdf: false },
        ],
        'the same DOI link is not listed twice'
      );
      pass('DBLP journal article maps every field (title, authors, venue, year, type, DOI, links, access)');
    }

    // B3: single author sent as an object, homonym numbers, HTML entities
    {
      const paper = dblpRecords[1];
      assert.deepStrictEqual(paper.authors, [{ name: "Chidinma O'Brien", affiliation: null }], 'one author sent as an object');
      assert.strictEqual(paper.title, 'Deep Learning & Search: Ranking "Hard" Queries at Scale');
      assert.strictEqual(paper.publicationType, 'conference-paper');
      assert.strictEqual(paper.isPeerReviewed, true);
      assert.strictEqual(paper.venue, 'EXCONF');
      assert.strictEqual(paper.publishedYear, 2019);
      assert.strictEqual(paper.isOpenAccess, true, 'access "open"');

      assert.deepStrictEqual(
        dblpRecords[2].authors.map((a) => a.name),
        ['Mariam Sultana', 'Li Zhang'],
        'homonym number removed inside a list'
      );
      assert.deepStrictEqual(dblpRecords[3].authors, [{ name: 'Farhana Rahman', affiliation: null }], 'homonym number removed on a single object');

      stubFetch(() =>
        fakeResponse(
          dblpBody([
            dblpHit({ authors: { author: 'Plain Text Author 0042' }, title: 'Names As Plain Text.', key: 'x/1' }),
            dblpHit({ authors: { author: [{ text: 'Area 2000 Research Group' }, { text: '' }, null] }, title: 'Numbers Inside Names.', key: 'x/2' }),
            dblpHit({ authors: {}, title: 'No Author Key.', key: 'x/3' }),
          ])
        )
      );
      const odd = await searchDblp({ query: 'names' });
      assert.deepStrictEqual(odd.records[0].authors, [{ name: 'Plain Text Author', affiliation: null }]);
      assert.deepStrictEqual(
        odd.records[1].authors,
        [{ name: 'Area 2000 Research Group', affiliation: null }],
        'only a number at the very end is removed; empty entries are dropped'
      );
      assert.deepStrictEqual(odd.records[2].authors, []);
      pass('DBLP authors: single object, list, plain text, homonym numbers and HTML entities');
    }

    // B4: publication types and links
    {
      const preprint = dblpRecords[2];
      assert.strictEqual(preprint.publicationType, 'preprint', '"Informal and Other Publications"');
      assert.strictEqual(preprint.isPeerReviewed, false);
      assert.strictEqual(preprint.venue, 'CoRR');
      assert.strictEqual(preprint.doi, null);
      assert.strictEqual(preprint.pdfUrl, 'https://arxiv.org/pdf/2000.00001', 'arXiv page gives the arXiv PDF');
      assert.strictEqual(preprint.isDirectPdf, true);
      assert.strictEqual(preprint.isOpenAccess, true);
      assert.strictEqual(preprint.fullTextUrl, 'https://arxiv.org/abs/2000.00001');
      assert.strictEqual(preprint.fullTextLocations[0].type, 'pdf');

      const thesis = dblpRecords[3];
      assert.strictEqual(thesis.publicationType, 'thesis', '"Books and Theses" filed under phd/');
      assert.strictEqual(thesis.isPeerReviewed, false);
      assert.strictEqual(thesis.venue, null);
      assert.strictEqual(thesis.pdfUrl, null, 'a repository page is not promised as a PDF');
      assert.strictEqual(thesis.fullTextUrl, 'https://repository.example.edu/handle/1234/9876');
      assert.strictEqual(
        thesis.fullTextLocations[0].source,
        'Publisher or Repository Page (via DBLP)'
      );

      const chapter = dblpRecords[5];
      assert.strictEqual(chapter.title, 'Is Deep Learning Enough for Reasoning?', 'a question mark is kept');
      assert.strictEqual(chapter.publicationType, 'book', '"Parts in Books or Collections"');
      assert.strictEqual(chapter.doi, '10.5555/dblp.fixture.0007', 'DOI is read from the "ee" link when the doi field is missing');
      assert.deepStrictEqual(chapter.authors.map((a) => a.name), ['Lucía García Márquez', 'Tanvir Ahmed']);

      const book = dblpRecords[6];
      assert.strictEqual(book.publicationType, 'book', '"Books and Theses" not filed under phd/');
      assert.strictEqual(book.publisher, 'Example Academic Press');

      stubFetch(() =>
        fakeResponse(
          dblpBody([
            dblpHit({
              title: 'ArXiv Paper Listed Through Its DOI.',
              type: 'Informal and Other Publications',
              key: 'journals/corr/abs-2000-00002',
              doi: '10.48550/ARXIV.2000.00002',
              ee: 'https://doi.org/10.48550/arXiv.2000.00002',
            }),
            dblpHit({ title: 'A Data Set.', type: 'Data and Artifacts', key: 'data/10/Example' }),
            dblpHit({ title: 'No Type At All.', key: 'x/9' }),
            dblpHit({ title: 'An Encyclopedia Entry.', type: 'Reference Works', key: 'reference/ex/1' }),
          ])
        )
      );
      const more = await searchDblp({ query: 'types' });
      assert.strictEqual(more.records[0].doi, '10.48550/arxiv.2000.00002');
      assert.strictEqual(more.records[0].pdfUrl, 'https://arxiv.org/pdf/2000.00002', 'arXiv DOI gives the arXiv PDF');
      assert.strictEqual(more.records[1].publicationType, 'unknown', 'a type this site does not have is not guessed');
      assert.strictEqual(more.records[2].publicationType, 'unknown');
      assert.strictEqual(more.records[3].publicationType, 'book');
      pass('DBLP types (journal, conference, preprint, thesis, book, unknown) and links (ee, DOI, arXiv PDF)');
    }

    // B5: missing and odd fields
    {
      const volume = dblpRecords[4];
      assert.strictEqual(volume.title, 'Deep Learning in Practice - Proceedings of the Example Workshop', 'title is trimmed');
      assert.deepStrictEqual(volume.authors, []);
      assert.strictEqual(volume.authorDisplay, 'Unknown Author');
      assert.strictEqual(volume.publishedYear, null);
      assert.strictEqual(volume.publicationDate, null);
      assert.strictEqual(volume.venue, 'EXWS', 'venue sent as a list');
      assert.strictEqual(volume.publicationType, 'book', '"Editorship"');
      assert.strictEqual(volume.isOpenAccess, false, 'an access value we do not know is not called open');
      assert.strictEqual(volume.doi, null);
      assert.deepStrictEqual(
        volume.fullTextLocations.map((l) => l.url),
        ['https://proceedings.example.org/exws2017/', 'https://mirror.example.org/exws2017/', 'https://dblp.org/rec/conf/exws/2017'],
        '"ee" sent as a list'
      );

      stubFetch(() =>
        fakeResponse(
          dblpBody([
            null,
            'text',
            { '@id': '5' },
            { info: null },
            dblpHit({ title: '   ' }),
            dblpHit({ title: 'To Be Continued...', year: 'n.d.', ee: 'javascript:alert(1)', access: 'OPEN' }),
            dblpHit({ title: 'A &lt;Very&gt; Odd &#8211; Title &amp;amp; More.', year: '9999', venue: [], url: 'not a link', key: 'conf/a b/C#1' }),
          ])
        )
      );
      const odd = await searchDblp({ query: 'odd' });
      assert.strictEqual(odd.error, null);
      assert.strictEqual(odd.rawCount, 7, 'rawCount counts everything DBLP sent, so the next page starts in the right place');
      assert.strictEqual(odd.records.length, 2);

      const dots = odd.records[0];
      assert.strictEqual(dots.title, 'To Be Continued...', 'an ellipsis is part of the title');
      assert.strictEqual(dots.publishedYear, null, 'a year that is not a number is left empty');
      assert.strictEqual(dots.fullTextUrl, null, 'a link that is not http(s) is ignored');
      assert.deepStrictEqual(dots.fullTextLocations, []);
      assert.strictEqual(dots.isOpenAccess, true, 'access is read whatever its capital letters');
      assert.strictEqual(dots.catalogId, null);
      assert.ok(/^dblp_[a-z0-9]+$/.test(dots.id), 'a record with no key and no DOI still gets an id');

      const entities = odd.records[1];
      assert.strictEqual(entities.publishedYear, null, 'an impossible year is left empty');
      assert.strictEqual(entities.venue, null);
      assert.strictEqual(entities.id, 'dblp_conf_a_b_C_1');
      assert.strictEqual(entities.fullTextUrl, 'https://dblp.org/rec/conf/a%20b/C%231', 'record page is built from the key');
      assert.ok(entities.title.includes('– Title &amp; More'), 'entities are decoded once only');

      // One hit sent as a single object instead of a list.
      const single = dblpBody([]);
      single.result.hits.hit = dblpHit({ title: 'Only One Hit.', key: 'x/only' });
      single.result.hits['@total'] = '1';
      stubFetch(() => fakeResponse(single));
      const one = await searchDblp({ query: 'one' });
      assert.strictEqual(one.records.length, 1);
      assert.strictEqual(one.records[0].title, 'Only One Hit');
      pass('DBLP handles missing, empty and oddly shaped fields without inventing data');
    }

    // B6: filters
    {
      stubFetch(() => fakeResponse(clone(dblpSearchPublResponse)));
      const ids = async (filters) => {
        const res = await searchDblp({ query: 'deep learning', filters });
        assert.strictEqual(res.rawCount, 8, 'filters never change rawCount, so paging stays correct');
        assert.strictEqual(res.error, null);
        return res.records.map((r) => r.id);
      };

      assert.deepStrictEqual(await ids({ yearMin: 2020 }), ['dblp_journals_jemlr_WangJL21', 'dblp_journals_corr_abs_2000_00001']);
      assert.deepStrictEqual(await ids({ yearMax: '2015' }), ['dblp_books_ex_15_GarciaA15', 'dblp_books_ex_Hossain14']);
      assert.deepStrictEqual(await ids({ yearMin: 2018, yearMax: 2019 }), ['dblp_conf_exconf_OBrien19', 'dblp_phd_us_Rahman18']);
      assert.deepStrictEqual(await ids({ publicationType: 'journal-article' }), ['dblp_journals_jemlr_WangJL21']);
      assert.deepStrictEqual(await ids({ publicationType: 'conference-paper' }), ['dblp_conf_exconf_OBrien19']);
      assert.deepStrictEqual(await ids({ publicationType: 'proceedings' }), ['dblp_conf_exconf_OBrien19']);
      assert.deepStrictEqual(await ids({ publicationType: 'preprint' }), ['dblp_journals_corr_abs_2000_00001']);
      assert.deepStrictEqual(await ids({ publicationType: 'thesis' }), ['dblp_phd_us_Rahman18']);
      assert.deepStrictEqual(await ids({ publicationType: 'dissertation' }), ['dblp_phd_us_Rahman18']);
      assert.strictEqual((await ids({ publicationType: 'book' })).length, 3);
      assert.strictEqual((await ids({ publicationType: 'all' })).length, 7);
      assert.deepStrictEqual(await ids({ hasPdf: true }), ['dblp_journals_corr_abs_2000_00001']);
      assert.deepStrictEqual(await ids({ hasPdf: true, yearMax: 2019 }), []);
      const noFilters = await searchDblp({ query: 'deep learning', filters: null });
      assert.strictEqual(noFilters.records.length, 7);
      pass('DBLP applies year range, publication type and PDF filters to the returned records');
    }

    // B7: pagination and hasMore
    {
      let calls = stubFetch(() => fakeResponse(dblpBody(manyDblpHits(30), 95)));
      const first = await searchDblp({ query: 'graph', limit: 50 });
      assert.strictEqual(calls[0].params.get('h'), '30', 'page size is capped at 30');
      assert.strictEqual(first.records.length, 30);
      assert.strictEqual(first.totalCount, 95);
      assert.strictEqual(first.hasMore, true);
      assert.strictEqual(first.nextOffset, 30);
      assert.strictEqual(first.nextPage, 2);

      calls = stubFetch(() => fakeResponse(dblpBody(manyDblpHits(5, 91), 95)));
      const last = await searchDblp({ query: 'graph', offset: 90, limit: 30 });
      assert.strictEqual(calls[0].params.get('f'), '90', 'the offset from the search manager is passed on');
      assert.strictEqual(last.hasMore, false);
      assert.strictEqual(last.nextOffset, 95);
      assert.strictEqual(last.nextPage, null);

      calls = stubFetch(() => fakeResponse(dblpBody([], 95)));
      const byPage = await searchDblp({ query: 'graph', page: 3, limit: 10 });
      assert.strictEqual(calls[0].params.get('f'), '20', 'page 3 of 10 starts at offset 20');
      assert.strictEqual(byPage.hasMore, false, 'an empty page ends the search even when the total says otherwise');

      // Nothing found: DBLP leaves the "hit" key out completely.
      stubFetch(() => fakeResponse(clone(dblpEmptyResponse)));
      const none = await searchDblp({ query: 'zzzznothingmatches' });
      assert.deepStrictEqual(
        { records: none.records, rawCount: none.rawCount, totalCount: none.totalCount, hasMore: none.hasMore, error: none.error },
        { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: null }
      );

      const noTotal = dblpBody(manyDblpHits(3));
      delete noTotal.result.hits['@total'];
      stubFetch(() => fakeResponse(noTotal));
      const fallback = await searchDblp({ query: 'graph' });
      assert.strictEqual(fallback.totalCount, 3, 'a missing total falls back to the number received');
      pass('DBLP pagination: capped page size, offsets, hasMore, last page, empty page and zero results');
    }

    // B8: HTTP 429
    {
      resetDblpStateForTests();
      let calls = stubFetch(() => fakeResponse(undefined, { status: 429 }));
      const limited = await searchDblp({ query: 'graph' });
      assert.strictEqual(limited.error, 'DBLP rate limit reached');
      assert.deepStrictEqual(limited.records, []);
      assert.strictEqual(limited.rawCount, 0);
      assert.strictEqual(limited.hasMore, false);
      assert.strictEqual(calls.length, 1, 'a 429 without a short wait is not retried');

      calls = stubFetch(() => fakeResponse(dblpBody(manyDblpHits(2))));
      const duringWait = await searchDblp({ query: 'graph' });
      assert.strictEqual(calls.length, 0, 'no request is sent during the waiting time');
      assert.strictEqual(duringWait.error, 'DBLP rate limit reached');

      resetDblpStateForTests();
      const afterWait = await searchDblp({ query: 'graph' });
      assert.strictEqual(afterWait.error, null);
      assert.strictEqual(afterWait.records.length, 2);

      calls = stubFetch((call, n) =>
        n === 1 ? fakeResponse(undefined, { status: 429, headers: { 'Retry-After': '1' } }) : fakeResponse(dblpBody(manyDblpHits(3)))
      );
      const startedAt = Date.now();
      const retried = await searchDblp({ query: 'graph' });
      assert.strictEqual(calls.length, 2, 'exactly one retry');
      assert.ok(Date.now() - startedAt >= 900, 'the retry waits for the time DBLP asked for');
      assert.strictEqual(retried.error, null);
      assert.strictEqual(retried.records.length, 3);

      // Retry-After can also be a date. A date far away must not be slept through.
      resetDblpStateForTests();
      const inTwoMinutes = new Date(Date.now() + 120000).toUTCString();
      calls = stubFetch(() => fakeResponse(undefined, { status: 429, headers: { 'Retry-After': inTwoMinutes } }));
      const longWait = await searchDblp({ query: 'graph' });
      await searchDblp({ query: 'graph' });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(longWait.error, 'DBLP rate limit reached');
      resetDblpStateForTests();
      pass('DBLP 429: clean error, one short retry at most, and no further calls while told to wait');
    }

    // B9: network errors and bad answers
    {
      const expectError = async (handler, expected) => {
        resetDblpStateForTests();
        const calls = stubFetch(handler);
        const res = await searchDblp({ query: 'graph' });
        assert.strictEqual(res.error, expected);
        assert.deepStrictEqual(res.records, []);
        assert.strictEqual(res.rawCount, 0);
        assert.strictEqual(res.totalCount, 0);
        assert.strictEqual(res.hasMore, false);
        assert.strictEqual(calls.length, 1, 'errors other than a short 429 are not retried');
      };

      await expectError(() => {
        throw new Error('connect ECONNREFUSED 192.0.2.1:443');
      }, 'DBLP network error: connect ECONNREFUSED 192.0.2.1:443');
      await expectError(() => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      }, 'DBLP request timed out');
      await expectError(() => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        throw err;
      }, 'DBLP request timed out');
      await expectError(() => fakeResponse(undefined, { status: 500 }), 'DBLP service error (500)');
      await expectError(() => fakeResponse(undefined, { status: 503 }), 'DBLP service error (503)');
      await expectError(() => fakeResponse(undefined, { status: 404 }), 'DBLP HTTP 404');
      await expectError(() => fakeResponse(undefined), 'DBLP returned malformed response');
      await expectError(() => fakeResponse(null), 'DBLP returned malformed response');
      await expectError(() => fakeResponse({ unexpected: true }), 'DBLP returned malformed response');
      await expectError(() => fakeResponse([1, 2, 3]), 'DBLP returned malformed response');
      pass('DBLP network failure, timeout, 4xx/5xx and malformed answers become an error result, never a crash');
    }

    // B10: offline mode
    {
      process.env.OFFLINE_MODE = 'true';
      const calls = stubFetch(() => {
        throw new Error('offline mode must not use the network');
      });
      const res = await searchDblp({ query: 'deep learning', limit: 20 });
      assert.strictEqual(calls.length, 0);
      assert.strictEqual(res.error, null);
      assert.strictEqual(res.records.length, 7);
      assert.strictEqual(res.rawCount, 8);
      assert.strictEqual(res.hasMore, false);
      assert.strictEqual(res.records[0].sources[0].provider, 'DBLP');

      const page1 = await searchDblp({ query: 'deep learning', offset: 0, limit: 3 });
      const page2 = await searchDblp({ query: 'deep learning', offset: 3, limit: 3 });
      assert.strictEqual(page1.hasMore, true);
      assert.strictEqual(page1.nextOffset, 3);
      assert.strictEqual(page1.records.length, 3);
      assert.strictEqual(page2.nextOffset, 6);
      assert.deepStrictEqual(page2.records.map((r) => r.id), ['dblp_phd_us_Rahman18', 'dblp_conf_exws_2017']);
      const thesesOnly = await searchDblp({ query: 'deep learning', filters: { publicationType: 'thesis' } });
      assert.strictEqual(thesesOnly.records.length, 1, 'filters also work on offline records');
      process.env.OFFLINE_MODE = 'false';
      pass('DBLP offline mode returns deterministic records with paging and no network call');
    }

    // =======================================================================
    // PART C: BOTH PROVIDERS INSIDE A SEARCH SESSION
    // =======================================================================
    console.log('--- 3. CORE and DBLP inside a search session ---');

    // C1: registration
    {
      assert.strictEqual(PROVIDER_NAMES.core, 'CORE');
      assert.strictEqual(PROVIDER_NAMES.dblp, 'DBLP');
      for (const key of ['core', 'dblp']) {
        const caps = PROVIDER_CAPABILITIES[key];
        assert.ok(caps, `${key} has a capability entry`);
        assert.deepStrictEqual(
          Object.keys(caps).sort(),
          Object.keys(PROVIDER_CAPABILITIES.openaire).sort(),
          `${key} lists the same capabilities as the other providers`
        );
        assert.strictEqual(caps.supportsQuery, true);
        assert.strictEqual(caps.supportsYear, true);
        assert.strictEqual(caps.supportsPubType, true);
        assert.strictEqual(caps.supportsInstitution, false);
        assert.strictEqual(caps.supportsAuthor, false);
        assert.strictEqual(caps.supportsMinCitations, false);
        assert.strictEqual(caps.supportsAwardingInstitution, false);
      }
      assert.strictEqual(Object.keys(PROVIDER_NAMES).length, Object.keys(PROVIDER_CAPABILITIES).length);
      pass('CORE and DBLP are registered with display names and capabilities');
    }

    const uniqueId = (label) => `test_newprov_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // C2: an ordinary (offline) session search reports and uses both
    {
      process.env.OFFLINE_MODE = 'true';
      const calls = stubFetch(() => {
        throw new Error('offline mode must not use the network');
      });
      const sessionId = uniqueId('all');
      const res = await executeSearchSession({ query: 'deep learning', page: 1, limit: 50, explicitSessionId: sessionId });
      assert.strictEqual(calls.length, 0);

      for (const name of ['CORE', 'DBLP']) {
        const status = res.providerStatus[name];
        assert.ok(status, `${name} is reported in providerStatus`);
        assert.strictEqual(status.status, 'fulfilled');
        assert.strictEqual(status.error, null);
        assert.ok(status.count > 0, `${name} contributed records`);
        assert.ok(byProvider(res.records, name).length > 0, `${name} records are in the result list`);
      }
      assert.strictEqual(res.providerStatus.CORE.count, 5);
      assert.strictEqual(res.providerStatus.DBLP.count, 7);
      assert.strictEqual(res.providerStatus.CORE.totalAvailable, 6);
      assert.strictEqual(res.providerStatus.DBLP.totalAvailable, 8);
      // The providers that were there before are still reported.
      for (const name of Object.values(PROVIDER_NAMES)) {
        assert.ok(res.providerStatus[name], `${name} is still reported`);
      }

      const stored = sessionStore.inMemorySessions.get(sessionId);
      assert.strictEqual(stored.providerStates.core.offset, 6, 'CORE reading position is remembered in the session');
      assert.strictEqual(stored.providerStates.core.hasMore, false);
      assert.strictEqual(stored.providerStates.dblp.offset, 8, 'DBLP reading position is remembered in the session');
      assert.strictEqual(stored.providerStates.dblp.hasMore, false);
      pass('A session search reports CORE and DBLP, uses their records and tracks their paging position');
    }

    // C3: the "source" filter can pick either one, and their paging runs across pages
    {
      const sessionId = uniqueId('dblp');
      const page1 = await executeSearchSession({
        query: 'deep learning', page: 1, limit: 5, filters: { source: 'DBLP' }, explicitSessionId: sessionId,
      });
      assert.strictEqual(page1.records.length, 5);
      assert.strictEqual(page1.pagination.hasMore, true);
      for (const r of page1.records) assert.strictEqual(r.sources[0].provider, 'DBLP');
      assert.strictEqual(page1.providerStatus.DBLP.status, 'fulfilled');
      assert.strictEqual(page1.providerStatus.CORE.status, 'skipped_unsupported_filter');
      assert.strictEqual(page1.providerStatus.OpenAlex.status, 'skipped_unsupported_filter');

      const page2 = await executeSearchSession({
        query: 'deep learning', page: 2, limit: 5, filters: { source: 'DBLP' }, explicitSessionId: sessionId,
      });
      assert.strictEqual(page2.records.length, 2);
      assert.strictEqual(page2.pagination.hasMore, false);
      const overlap = page2.records.filter((r) => page1.records.some((p) => p.id === r.id));
      assert.strictEqual(overlap.length, 0, 'page 2 does not repeat page 1');

      const coreOnly = await executeSearchSession({
        query: 'deep learning', page: 1, limit: 20, filters: { source: 'core' }, explicitSessionId: uniqueId('core'),
      });
      assert.strictEqual(coreOnly.records.length, 5);
      for (const r of coreOnly.records) assert.strictEqual(r.sources[0].provider, 'CORE');
      assert.strictEqual(coreOnly.providerStatus.DBLP.status, 'skipped_unsupported_filter');

      const coreTheses = await executeSearchSession({
        query: 'deep learning', page: 1, limit: 20, filters: { source: 'core', publicationType: 'thesis', yearMin: 2020 },
        explicitSessionId: uniqueId('corethesis'),
      });
      assert.deepStrictEqual(coreTheses.records.map((r) => r.id), ['core_900000001'], 'session filters reach the adapter');
      pass('The source filter selects CORE or DBLP alone, and their records page without repeats');
    }

    // C4: a session saved before the two providers existed keeps working
    {
      const sessionId = uniqueId('old');
      await executeSearchSession({ query: 'deep learning', page: 1, limit: 5, explicitSessionId: sessionId });
      const stored = sessionStore.inMemorySessions.get(sessionId);
      delete stored.providerStates.core;
      delete stored.providerStates.dblp;
      stored.allProvidersExhausted = false;

      const page2 = await executeSearchSession({ query: 'deep learning', page: 2, limit: 5, explicitSessionId: sessionId });
      assert.ok(Array.isArray(page2.records), 'the next page is served instead of crashing');
      assert.ok(stored.providerStates.core && stored.providerStates.dblp, 'the missing entries are filled in');
      assert.ok(page2.providerStatus.CORE && page2.providerStatus.DBLP);
      pass('An older saved session without CORE/DBLP entries is repaired instead of crashing');
    }

    // C5: live-style session with a stubbed network: same paper from both is merged into one
    {
      process.env.OFFLINE_MODE = 'false';
      resetCoreStateForTests();
      resetDblpStateForTests();
      const calls = stubFetch((call) => {
        if (call.url.includes('api.core.ac.uk')) {
          return fakeResponse(
            coreBody([
              {
                id: 555,
                title: 'Shared Paper on Graph Neural Networks',
                authors: [{ name: 'Rahman, Farhana' }],
                abstract: 'The abstract that only CORE knows.',
                doi: '10.5555/SHARED.0001',
                documentType: 'research',
                yearPublished: 2022,
                downloadUrl: 'https://core.ac.uk/download/555.pdf',
                language: { code: 'en', name: 'English' },
              },
            ])
          );
        }
        if (call.url.includes('dblp.org')) {
          return fakeResponse(
            dblpBody([
              dblpHit({
                authors: { author: { '@pid': '1/1', text: 'Farhana Rahman 0001' } },
                title: 'Shared Paper on Graph Neural Networks.',
                venue: 'EXCONF',
                year: '2022',
                type: 'Conference and Workshop Papers',
                access: 'closed',
                key: 'conf/exconf/Rahman22',
                doi: '10.5555/shared.0001',
                ee: 'https://doi.org/10.5555/shared.0001',
              }),
              dblpHit({ title: 'Only DBLP Has This Graph Paper.', year: '2021', type: 'Journal Articles', key: 'journals/x/Only21' }),
            ])
          );
        }
        throw new Error(`unexpected host in test: ${call.url}`);
      });

      // "core,dblp" makes exactly these two eligible, so no other host is contacted.
      const res = await executeSearchSession({
        query: 'graph neural networks', page: 1, limit: 20, filters: { source: 'core,dblp' }, explicitSessionId: uniqueId('merge'),
      });
      assert.ok(calls.length >= 2);
      assert.ok(calls.every((c) => c.url.includes('api.core.ac.uk') || c.url.includes('dblp.org')));
      assert.strictEqual(res.records.length, 2, 'the paper found by both is listed once');
      const shared = res.records.find((r) => r.doi === '10.5555/shared.0001');
      assert.ok(shared, 'merged record keeps the DOI');
      assert.deepStrictEqual(shared.sources.map((s) => s.provider).sort(), ['CORE', 'DBLP'], 'both sources are credited');
      assert.strictEqual(shared.abstract, 'The abstract that only CORE knows.', 'the abstract DBLP lacks comes from CORE');
      assert.strictEqual(res.providerStatus.CORE.status, 'fulfilled');
      assert.strictEqual(res.providerStatus.DBLP.status, 'fulfilled');
      assert.strictEqual(res.partialResults, false);
      assert.strictEqual(res.totalTechnicalFailure, false);
      pass('The same paper from CORE and DBLP is merged into one record crediting both');
    }

    // C6: failures are reported per provider and do not break the search
    {
      resetCoreStateForTests();
      resetDblpStateForTests();
      let coreCalls = 0;
      stubFetch((call) => {
        if (call.url.includes('api.core.ac.uk')) {
          coreCalls++;
          return fakeResponse({}, { status: 429 });
        }
        return fakeResponse(dblpBody(manyDblpHits(3)));
      });
      const partial = await executeSearchSession({
        query: 'graph', page: 1, limit: 20, filters: { source: 'core,dblp' }, explicitSessionId: uniqueId('partial'),
      });
      assert.strictEqual(partial.records.length, 3, 'DBLP results are still served');
      assert.strictEqual(partial.providerStatus.CORE.status, 'degraded');
      assert.strictEqual(partial.providerStatus.CORE.error, 'CORE rate limit reached');
      assert.strictEqual(partial.providerStatus.DBLP.status, 'fulfilled');
      assert.strictEqual(partial.partialResults, true);
      assert.strictEqual(partial.totalTechnicalFailure, false);
      assert.strictEqual(coreCalls, 1, 'the session does not keep calling CORE after a 429');

      resetCoreStateForTests();
      resetDblpStateForTests();
      stubFetch(() => {
        throw new Error('socket hang up');
      });
      const failed = await executeSearchSession({
        query: 'graph', page: 1, limit: 20, filters: { source: 'core,dblp' }, explicitSessionId: uniqueId('failed'),
      });
      assert.strictEqual(failed.records.length, 0);
      assert.strictEqual(failed.providerStatus.CORE.error, 'CORE network error: socket hang up');
      assert.strictEqual(failed.providerStatus.DBLP.error, 'DBLP network error: socket hang up');
      assert.strictEqual(failed.providerStatus.DBLP.status, 'degraded');
      assert.strictEqual(failed.totalTechnicalFailure, true);
      assert.strictEqual(failed.pagination.hasMore, false);
      pass('A rate-limited or unreachable CORE/DBLP is reported as degraded and the rest of the search goes on');
    }

    console.log('\n===============================================================');
    console.log(`  ALL ${passed}/${passed} NEW PROVIDER TESTS PASSED (100% OK)`);
    console.log('===============================================================');
  } finally {
    // Put everything back, whether the tests passed or not, so other suites are not affected.
    global.fetch = originalFetch;
    if (originalEnvOffline === undefined) delete process.env.OFFLINE_MODE;
    else process.env.OFFLINE_MODE = originalEnvOffline;
    if (originalCoreKey === undefined) delete process.env.CORE_API_KEY;
    else process.env.CORE_API_KEY = originalCoreKey;
    resetCoreStateForTests();
    resetDblpStateForTests();
  }
}

module.exports = { runNewProviderTests };

if (require.main === module) {
  runNewProviderTests().catch((err) => {
    console.error('\n✗ TEST FAILURE ENCOUNTERED:');
    console.error(err);
    process.exit(1);
  });
}
