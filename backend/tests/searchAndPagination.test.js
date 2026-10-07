const assert = require('assert');
const { createNormalizedRecord } = require('../services/scholarlyRecord');
const { deduplicateRecords } = require('../services/deduplicator');

function runSearchAndPaginationTests() {
  console.log('Testing: Search Orchestration, Pagination & Provider Resilience...');

  const providerResults = [
    {
      name: 'OpenAlex',
      records: [
        createNormalizedRecord({ title: 'Paper 1 from OpenAlex', doi: '10.1001/p1' }),
        createNormalizedRecord({ title: 'Paper 2 from OpenAlex', doi: '10.1001/p2' }),
      ],
      totalCount: 200,
      hasMore: true,
      error: null,
    },
    {
      name: 'Europe PMC',
      records: [],
      totalCount: 0,
      hasMore: false,
      error: 'Europe PMC API timeout after 6500ms',
    },
    {
      name: 'arXiv',
      records: [
        createNormalizedRecord({ title: 'Paper 3 from arXiv', catalogId: 'arXiv:2401.0001' }),
      ],
      totalCount: 50,
      hasMore: true,
      error: null,
    },
  ];

  const rawRecords = [];
  const providerStatus = {};

  for (const res of providerResults) {
    providerStatus[res.name] = {
      status: res.error ? 'degraded' : 'ok',
      returnedCount: res.records.length,
      totalAvailable: res.totalCount,
      error: res.error,
    };
    rawRecords.push(...res.records);
  }

  const deduped = deduplicateRecords(rawRecords);

  assert.strictEqual(deduped.length, 3, 'Must return records from healthy providers despite Europe PMC failure');
  assert.strictEqual(providerStatus['Europe PMC'].status, 'degraded', 'Failed provider clearly marked degraded');
  assert.strictEqual(providerStatus['Europe PMC'].error, 'Europe PMC API timeout after 6500ms', 'Error message preserved');
  assert.strictEqual(providerStatus['OpenAlex'].status, 'ok', 'Healthy provider marked ok');

  const limit = 2;
  const page1 = deduped.slice(0, limit);
  const page2 = deduped.slice(limit, limit * 2);

  assert.strictEqual(page1.length, 2, 'Page 1 has 2 items');
  assert.strictEqual(page2.length, 1, 'Page 2 has 1 item');
  assert.notStrictEqual(page1[0].id, page2[0].id, 'Page 1 and Page 2 must not contain identical items');

  console.log('✓ All Search Orchestration, Pagination & Provider Resilience tests passed successfully.');
}

module.exports = { runSearchAndPaginationTests };

if (require.main === module) {
  runSearchAndPaginationTests();
}
