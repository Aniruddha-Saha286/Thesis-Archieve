const assert = require('assert');
const {
  getInstitutionResearchLandscape,
  normalizeInstitutionId,
  aggregateTopFields,
  aggregateYearTrends,
  COLOR_BLIND_PALETTE,
  SCOPE_AFFILIATION_LABEL,
  DETERMINISTIC_ANALYTICS_FIXTURES,
} = require('../services/institutionAnalyticsService');
const { CURATED_INSTITUTIONS } = require('../services/institutionService');

async function runInstitutionAnalyticsTests() {
  process.env.NODE_ENV = 'test';
  console.log('===============================================================');
  console.log('  TEST SUITE: INSTITUTION RESEARCH LANDSCAPE & ANALYTICS       ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

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

  // 1. Feature Flag Guard
  await test('Feature flag disabled: returns enabled: false when INSTITUTION_ANALYTICS_ENABLED is false', async () => {
    const orig = process.env.INSTITUTION_ANALYTICS_ENABLED;
    process.env.INSTITUTION_ANALYTICS_ENABLED = 'false';

    const res = await getInstitutionResearchLandscape({
      institutionId: 'I136199984',
    });

    assert.strictEqual(res.enabled, false);
    assert.ok(res.message.includes('disabled'));
    process.env.INSTITUTION_ANALYTICS_ENABLED = orig;
  });

  // 2. Canonical ID Validation
  await test('ID validation: normalizes canonical OpenAlex IDs and rejects invalid formats', () => {
    assert.strictEqual(normalizeInstitutionId('https://openalex.org/I136199984'), 'I136199984');
    assert.strictEqual(normalizeInstitutionId('i136199984'), 'I136199984');
    assert.strictEqual(normalizeInstitutionId('I157121650'), 'I157121650');
    assert.strictEqual(normalizeInstitutionId('Harvard University'), null);
    assert.strictEqual(normalizeInstitutionId(''), null);
    assert.strictEqual(normalizeInstitutionId('12345'), null);
  });

  // 3. Year Range Validation
  await test('Year range validation: rejects fromYear > toYear with 400 INVALID_YEAR_RANGE', async () => {
    process.env.INSTITUTION_ANALYTICS_ENABLED = 'true';

    const res = await getInstitutionResearchLandscape({
      institutionId: 'I136199984',
      fromYear: 2024,
      toYear: 2020,
    });

    assert.strictEqual(res.error, true);
    assert.strictEqual(res.code, 'INVALID_YEAR_RANGE');
    assert.strictEqual(res.statusCode, 400);
  });

  // 4. Exact Arithmetic in Field Aggregations (Top 6 + Other <= 7 slices)
  await test('Top fields aggregation: restricts to max 7 slices (top 6 + Other) with exact mathematical sum', () => {
    const sampleGroups = DETERMINISTIC_ANALYTICS_FIXTURES.I136199984.fields;
    const { slices, totalClassifiedWorks, otherCount } = aggregateTopFields(sampleGroups);

    assert.ok(slices.length <= 7, `Slices count ${slices.length} must not exceed 7`);
    assert.strictEqual(slices.length, 7, 'Harvard sample has 10 fields, must produce 6 top + 1 Other = 7 slices');

    // Total of individual slices must equal totalClassifiedWorks
    const sumOfSlices = slices.reduce((sum, s) => sum + s.count, 0);
    assert.strictEqual(sumOfSlices, totalClassifiedWorks, 'Sum of slices must exactly match total classified works');

    // Check last slice is 'Other Disciplines'
    const lastSlice = slices[slices.length - 1];
    assert.strictEqual(lastSlice.isOther, true);
    assert.strictEqual(lastSlice.fieldId, 'other');
    assert.strictEqual(lastSlice.count, otherCount);

    // Sum of percentages must equal 100% (within roundoff +/- 0.5%)
    const sumPercentages = slices.reduce((sum, s) => sum + s.percentage, 0);
    assert.ok(Math.abs(sumPercentages - 100) < 0.6, `Sum of percentages ${sumPercentages} must be approx 100%`);
  });

  // 5. Year Trends Aggregation
  await test('Year trend aggregation: filters to requested range and sorts ascending', () => {
    const rawYears = [
      { key: '2023', count: 1450 },
      { key: '2020', count: 950 },
      { key: '2022', count: 1300 },
      { key: '2021', count: 1100 },
    ];

    const result = aggregateYearTrends(rawYears, 2021, 2023);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].year, 2021);
    assert.strictEqual(result[1].year, 2022);
    assert.strictEqual(result[2].year, 2023);
    assert.strictEqual(result[2].count, 1450);
  });

  // 6. Complete Landscape Schema & Strict Affiliation Scope Label
  await test('Landscape schema: returns strict affiliation scope note, metadata, and deterministic fixture data', async () => {
    process.env.INSTITUTION_ANALYTICS_ENABLED = 'true';

    const res = await getInstitutionResearchLandscape({
      institutionId: 'I157121650', // BUET
      fromYear: 2020,
      toYear: 2025,
      forceRefresh: true,
    });

    assert.strictEqual(res.enabled, true);
    assert.strictEqual(res.institution.id, 'I157121650');
    assert.strictEqual(res.institution.countryCode, 'BD');
    assert.strictEqual(res.scopeNote, SCOPE_AFFILIATION_LABEL);
    assert.ok(res.scopeNote.includes('at least one author affiliated'));
    assert.ok(!res.scopeNote.includes('published by this university'));

    assert.ok(res.fieldDistribution.slices.length > 0);
    assert.ok(res.fieldDistribution.slices.length <= 7);
    assert.strictEqual(res.fieldDistribution.maxSlices, 7);

    // Colorblind safe palette usage
    res.fieldDistribution.slices.forEach((s) => {
      assert.ok(COLOR_BLIND_PALETTE.includes(s.color), `Slice color ${s.color} must belong to color-blind palette`);
    });
  });

  // 7. Caching deduplication
  await test('Analytics cache: returns cached result on subsequent query with cacheAgeSeconds', async () => {
    process.env.INSTITUTION_ANALYTICS_ENABLED = 'true';
    const { analyticsCache } = require('../services/institutionAnalyticsService');
    analyticsCache.clear();

    const first = await getInstitutionResearchLandscape({
      institutionId: 'I157121650',
      fromYear: 2020,
      toYear: 2025,
    });
    assert.strictEqual(first.cached, false);

    const second = await getInstitutionResearchLandscape({
      institutionId: 'I157121650',
      fromYear: 2020,
      toYear: 2025,
    });
    assert.strictEqual(second.cached, true);
    assert.ok(typeof second.cacheAgeSeconds === 'number');
  });

  // 8. Offline identity suggestion integrity (Phase 1D requirement)
  await test('Offline identity suggestions: bibliometrics must be null and marked offline identity', () => {
    CURATED_INSTITUTIONS.forEach((inst) => {
      assert.strictEqual(inst.worksCount, null, `${inst.name} offline worksCount must be null`);
      assert.strictEqual(inst.citationCount, null, `${inst.name} offline citationCount must be null`);
      assert.strictEqual(inst.metricsAvailable, false, `${inst.name} metricsAvailable must be false`);
      assert.strictEqual(inst.source, 'offline_identity');
    });
  });

  console.log(`\nAll ${passed}/${total} Institution Research Landscape tests passed!\n`);
}

if (require.main === module) {
  runInstitutionAnalyticsTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runInstitutionAnalyticsTests };
