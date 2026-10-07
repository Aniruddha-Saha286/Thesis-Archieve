const assert = require('assert');
const { searchSemanticScholar } = require('../services/providers/semanticScholar');
const { searchOpenAire } = require('../services/providers/openaire');

async function runProviderIntegrationTests() {
  console.log('Testing: Federated Upstream Provider Integration Suite...');

  const originalFetch = global.fetch;
  const originalEnvOffline = process.env.OFFLINE_MODE;

  console.log('--- 1. Semantic Scholar Provider Adapter ---');

  {
    process.env.OFFLINE_MODE = 'true';
    const res = await searchSemanticScholar({ query: 'deep learning', page: 1, limit: 2 });
    assert.strictEqual(Array.isArray(res.records), true, 'Records should be an array');
    assert.strictEqual(res.records.length, 2, 'Should return 2 offline fixture records');
    assert.strictEqual(res.records[0].sources[0].provider, 'Semantic Scholar');
    assert.strictEqual(res.error, null);
    console.log('  ✓ [PASS] Semantic Scholar offline mode returns deterministic normalized records');
  }

  process.env.OFFLINE_MODE = 'false';

  {
    global.fetch = async (url) => {
      assert.ok(url.includes('api.semanticscholar.org/graph/v1/paper/search'));
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({
          total: 150,
          offset: 0,
          data: [
            {
              paperId: 'doc_001',
              title: 'Attention Is All You Need In Practice',
              abstract: 'A deep empirical survey of self-attention mechanisms in natural language.',
              year: 2023,
              venue: 'NeurIPS',
              publicationTypes: ['JournalArticle'],
              externalIds: { DOI: '10.1234/s2.2023.01' },
              openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762.pdf' },
              authors: [{ name: 'Vaswani, Ashish' }, { name: 'Shazeer, Noam' }],
              citationCount: 4500,
              isOpenAccess: true,
            },
          ],
        }),
      };
    };

    const res = await searchSemanticScholar({ query: 'attention', page: 1, limit: 10 });
    assert.strictEqual(res.records.length, 1);
    const rec = res.records[0];
    assert.strictEqual(rec.id, 's2_doc_001');
    assert.strictEqual(rec.title, 'Attention Is All You Need In Practice');
    assert.strictEqual(rec.doi, '10.1234/s2.2023.01');
    assert.strictEqual(rec.publishedYear, 2023);
    assert.strictEqual(rec.citationCount, 4500);
    assert.strictEqual(rec.pdfUrl, 'https://arxiv.org/pdf/1706.03762.pdf');
    assert.strictEqual(rec.isOpenAccess, true);
    assert.strictEqual(res.error, null);
    console.log('  ✓ [PASS] Semantic Scholar 200 OK accurately maps fields and normalized record structures');
  }

  {
    global.fetch = async () => ({
      ok: false,
      status: 429,
      headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? '30' : null) },
    });

    const res = await searchSemanticScholar({ query: 'graph neural network' });
    assert.strictEqual(res.records.length, 0);
    assert.strictEqual(res.rawCount, 0);
    assert.strictEqual(res.hasMore, false);
    assert.ok(res.error.includes('rate limit'), 'Must report clear rate limit error');
    console.log('  ✓ [PASS] Semantic Scholar 429 rate limit safely handled without throwing');
  }

  {
    let attempts = 0;
    global.fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? '1' : null) },
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({
          total: 1,
          data: [{ paperId: 'retry_success', title: 'Post-Retry Paper' }],
        }),
      };
    };

    const res = await searchSemanticScholar({ query: 'quantum computing' });
    assert.strictEqual(attempts, 2, 'Should retry exactly once when Retry-After is 1 second');
    assert.strictEqual(res.records.length, 1);
    assert.strictEqual(res.records[0].id, 's2_retry_success');
    console.log('  ✓ [PASS] Semantic Scholar single retry succeeds when Retry-After is <= 2s');
  }

  {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      headers: new Map(),
    });

    const res = await searchSemanticScholar({ query: 'cybersecurity' });
    assert.strictEqual(res.records.length, 0);
    assert.ok(res.error.includes('service error (500)'));
    console.log('  ✓ [PASS] Semantic Scholar 500 upstream failure isolated without unhandled rejection');
  }

  {
    global.fetch = async () => ({
      ok: false,
      status: 401,
      headers: new Map(),
    });

    const res401 = await searchSemanticScholar({ query: 'test auth' });
    assert.ok(res401.error.includes('authentication failed (401)'));

    global.fetch = async () => ({
      ok: false,
      status: 403,
      headers: new Map(),
    });

    const res403 = await searchSemanticScholar({ query: 'test forbidden' });
    assert.ok(res403.error.includes('access forbidden (403)'));
    console.log('  ✓ [PASS] Semantic Scholar 401 and 403 responses handled gracefully');
  }

  {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    });

    const res = await searchSemanticScholar({ query: 'malformed' });
    assert.strictEqual(res.records.length, 0);
    assert.ok(res.error.includes('malformed response'));
    console.log('  ✓ [PASS] Semantic Scholar malformed JSON handled cleanly');
  }

  {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ total: 0, data: [] }),
    });

    const res = await searchSemanticScholar({ query: 'nonexistentquery123456789' });
    assert.strictEqual(res.records.length, 0);
    assert.strictEqual(res.totalCount, 0);
    assert.strictEqual(res.hasMore, false);
    assert.strictEqual(res.error, null);
    console.log('  ✓ [PASS] Semantic Scholar zero results handled properly');
  }

  console.log('--- 2. OpenAIRE Graph API V3 Provider Adapter ---');

  {
    process.env.OFFLINE_MODE = 'true';
    const res = await searchOpenAire({ query: 'energy systems', page: 1, limit: 2 });
    assert.strictEqual(Array.isArray(res.records), true);
    assert.strictEqual(res.records.length, 2);
    assert.strictEqual(res.records[0].sources[0].provider, 'OpenAIRE');
    assert.strictEqual(res.error, null);
    console.log('  ✓ [PASS] OpenAIRE Graph V3 offline mode returns deterministic normalized records');
  }

  process.env.OFFLINE_MODE = 'false';

  {
    let interceptedUrl = '';
    global.fetch = async (url) => {
      interceptedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({
          header: { numFound: 820 },
          results: [
            {
              id: 'v3_item_1',
              mainTitle: 'Open Science and Fair Data in European Research',
              description: 'An analysis of OpenAIRE Graph V3 infrastructure.',
              publicationDate: '2024-03-15',
              publisher: 'European Science Foundation',
              bestAccessRight: { label: 'Open Access' },
              authors: [{ fullName: 'Schmidt, Birgit' }],
              pids: [{ scheme: 'doi', value: '10.5000/openaire.v3.01' }],
              instances: [
                {
                  accessRight: { label: 'Open Access' },
                  urls: ['https://europepmc.org/articles/PMC123456.pdf'],
                  license: 'CC-BY',
                },
              ],
            },
          ],
        }),
      };
    };

    const res = await searchOpenAire({
      query: 'open science',
      page: 2,
      limit: 10,
      filters: { isOpenAccess: true },
    });

    assert.ok(interceptedUrl.includes('api.openaire.eu/graph/v3/research-products'));
    assert.ok(interceptedUrl.includes('type=publication'));
    assert.ok(interceptedUrl.includes('page=2'));
    assert.ok(interceptedUrl.includes('pageSize=10'));
    assert.ok(interceptedUrl.includes('accessRightLabel='));

    assert.strictEqual(res.records.length, 1);
    const rec = res.records[0];
    assert.strictEqual(rec.id, 'openaire_v3_item_1');
    assert.strictEqual(rec.title, 'Open Science and Fair Data in European Research');
    assert.strictEqual(rec.doi, '10.5000/openaire.v3.01');
    assert.strictEqual(rec.publishedYear, 2024);
    assert.strictEqual(rec.publisher, 'European Science Foundation');
    assert.strictEqual(rec.isOpenAccess, true);
    assert.strictEqual(rec.isDirectPdf, true);
    assert.strictEqual(rec.pdfUrl, 'https://europepmc.org/articles/PMC123456.pdf');
    console.log('  ✓ [PASS] OpenAIRE Graph V3 accurately targets v3 endpoints, extracts instances, and handles pagination');
  }

  {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      headers: new Map(),
    });

    const res = await searchOpenAire({ query: 'cloud architecture' });
    assert.strictEqual(res.records.length, 0);
    assert.ok(res.error.includes('service error (500)'));
    console.log('  ✓ [PASS] OpenAIRE 500 upstream failure isolated gracefully');
  }

  {
    global.fetch = async () => ({
      ok: false,
      status: 400,
      headers: new Map(),
    });

    const res = await searchOpenAire({ query: 'broken syntax [' });
    assert.strictEqual(res.records.length, 0);
    assert.ok(res.error.includes('HTTP 400'));
    console.log('  ✓ [PASS] OpenAIRE 400 bad query handled without crash');
  }

  {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ header: { numFound: 0 }, results: [] }),
    });

    const res = await searchOpenAire({ query: 'completelyemptyresults98765' });
    assert.strictEqual(res.records.length, 0);
    assert.strictEqual(res.totalCount, 0);
    assert.strictEqual(res.hasMore, false);
    assert.strictEqual(res.error, null);
    console.log('  ✓ [PASS] OpenAIRE zero results handled cleanly');
  }

  global.fetch = originalFetch;
  process.env.OFFLINE_MODE = originalEnvOffline;

  console.log('\n===============================================================');
  console.log('  ALL 13/13 PROVIDER INTEGRATION TESTS PASSED (100% OK)');
  console.log('===============================================================');
}

module.exports = { runProviderIntegrationTests };

if (require.main === module) {
  runProviderIntegrationTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
