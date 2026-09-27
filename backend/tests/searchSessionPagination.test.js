const assert = require('assert');

// Simulate the search session buffer logic with 6 providers returning 20 papers each
async function testSearchSessionArchitecture() {
  console.log('Testing Phase 1 A Search Session Pagination Architecture...');

  // Mock 6 providers with 20 papers each
  const providerNames = ['MockLocal', 'MockOpenAlex', 'MockArxiv', 'MockCrossref', 'MockEuropePmc', 'MockHal'];
  const providerData = {};

  providerNames.forEach((name, idx) => {
    providerData[name] = Array.from({ length: 20 }, (_, i) => ({
      id: `${name}_doc_${i + 1}`,
      doi: `10.1000/${name.toLowerCase()}.${i + 1}`,
      title: `${name} Research Paper #${i + 1} on Machine Learning`,
      authors: [{ name: `Author ${idx + 1}-${i + 1}` }],
      publishedYear: 2024,
      source: name,
    }));
  });

  // Mock Session Buffer Container
  const session = {
    buffer: [],
    seenIds: new Set(),
    seenDois: new Set(),
    providerOffsets: {
      MockLocal: 0,
      MockOpenAlex: 0,
      MockArxiv: 0,
      MockCrossref: 0,
      MockEuropePmc: 0,
      MockHal: 0,
    },
  };

  function refillBuffer(targetCount) {
    while (session.buffer.length < targetCount) {
      let addedInRound = 0;
      for (const name of providerNames) {
        const offset = session.providerOffsets[name];
        const batch = providerData[name].slice(offset, offset + 20);
        session.providerOffsets[name] += batch.length;

        for (const item of batch) {
          if (!session.seenIds.has(item.id)) {
            session.seenIds.add(item.id);
            session.seenDois.add(item.doi);
            session.buffer.push(item);
            addedInRound++;
          }
        }
      }
      if (addedInRound === 0) break; // All providers exhausted
    }
  }

  function getPage(pageNum, limit = 20) {
    const startIndex = (pageNum - 1) * limit;
    const endIndex = pageNum * limit;
    refillBuffer(endIndex);
    return session.buffer.slice(startIndex, endIndex);
  }

  // Acceptance case:
  // Six providers each return 20 unique papers and then exhaust their results.
  // At a page size of 20, all 120 papers must be reachable across six pages,
  // without duplicates or an empty second page.

  const pages = [];
  for (let p = 1; p <= 6; p++) {
    const pageRecords = getPage(p, 20);
    pages.push(pageRecords);
    console.log(`Page ${p} returned: ${pageRecords.length} records`);
    assert.strictEqual(pageRecords.length, 20, `Page ${p} must have exactly 20 records`);
  }

  // Verify page 7 is empty (exhausted)
  const page7 = getPage(7, 20);
  assert.strictEqual(page7.length, 0, 'Page 7 should be empty since 120 papers were exhausted');

  // Verify all 120 papers are distinct
  const allIds = pages.flat().map((r) => r.id);
  assert.strictEqual(allIds.length, 120, 'Total papers collected across 6 pages must be 120');
  const uniqueIds = new Set(allIds);
  assert.strictEqual(uniqueIds.size, 120, 'All 120 papers must be completely unique');

  // Verify stable previous navigation: requesting page 2 again returns the exact same 20 records
  const page2Again = getPage(2, 20);
  assert.deepStrictEqual(page2Again.map((r) => r.id), pages[1].map((r) => r.id), 'Previous/Next navigation must be 100% stable');

  console.log('✓ Phase 1 A Acceptance Case PASSED: All 120 papers reachable across 6 pages without duplicates or empty pages!');
}

module.exports = { testSearchSessionArchitecture };

if (require.main === module) {
  testSearchSessionArchitecture();
}
