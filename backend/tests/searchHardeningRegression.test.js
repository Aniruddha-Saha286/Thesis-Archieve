const assert = require('assert');
const { parseAndValidateThesisQuery, normalizePublicationType } = require('../services/queryParser');
const {
  cleanPublisherForMatching,
  matchesPublisherFilter,
  computeSessionHash,
  PROVIDER_CAPABILITIES,
} = require('../services/searchSessionManager');
const sessionStore = require('../services/sessionStore');
const { resolveCountryCodeForThesis } = require('../migrations/backfillThesisCountryCodes');

async function runSearchHardeningRegressionTests() {
  console.log('===============================================================');
  console.log('  TEST SUITE: SEARCH HARDENING, CANONICAL PARSER & CAPABILITIES');
  console.log('===============================================================');

  const q1 = parseAndValidateThesisQuery({ search: '  machine learning  ', page: '2', limit: '30' });
  assert.strictEqual(q1.valid, true, 'Query parsing should succeed for valid search');
  assert.strictEqual(q1.searchTerm, 'machine learning', 'Search term should be trimmed');
  assert.strictEqual(q1.page, 2, 'Page should be parsed as integer');
  assert.strictEqual(q1.limit, 30, 'Limit should be parsed as integer');
  assert.strictEqual(q1.isSearchInquiry, true, 'Search term makes it a search inquiry');

  const qClamp = parseAndValidateThesisQuery({ limit: '200' });
  assert.strictEqual(qClamp.valid, true);
  assert.strictEqual(qClamp.limit, 50, 'Limit must be clamped to max 50');

  const qBadPage = parseAndValidateThesisQuery({ page: '-5' });
  assert.strictEqual(qBadPage.valid, false);
  assert.strictEqual(qBadPage.code, 'INVALID_PAGE');
  assert.strictEqual(qBadPage.status, 400);

  const qValidYear = parseAndValidateThesisQuery({ yearMin: '2018', yearMax: '2024' });
  assert.strictEqual(qValidYear.valid, true);
  assert.strictEqual(qValidYear.filters.yearMin, '2018');
  assert.strictEqual(qValidYear.filters.yearMax, '2024');

  const qBadYearMin = parseAndValidateThesisQuery({ yearMin: '1750' });
  assert.strictEqual(qBadYearMin.valid, false);
  assert.strictEqual(qBadYearMin.code, 'INVALID_YEAR');

  const qBadYearFormat = parseAndValidateThesisQuery({ yearMin: '202' });
  assert.strictEqual(qBadYearFormat.valid, false);
  assert.strictEqual(qBadYearFormat.code, 'INVALID_YEAR');

  const qInvertedYears = parseAndValidateThesisQuery({ yearMin: '2025', yearMax: '2020' });
  assert.strictEqual(qInvertedYears.valid, false);
  assert.strictEqual(qInvertedYears.code, 'INVALID_YEAR_RANGE');

  const qValidCountry = parseAndValidateThesisQuery({ countryCodes: 'bd,us,gb' });
  assert.strictEqual(qValidCountry.valid, true);
  assert.strictEqual(qValidCountry.filters.countryCodes, 'BD,GB,US');

  const qInvalidCountry = parseAndValidateThesisQuery({ countryCodes: 'BANGLADESH' });
  assert.strictEqual(qInvalidCountry.valid, false);
  assert.strictEqual(qInvalidCountry.code, 'INVALID_COUNTRY_CODE');

  const qArticleAlias = parseAndValidateThesisQuery({ publicationType: 'article' });
  assert.strictEqual(qArticleAlias.valid, true);
  assert.strictEqual(qArticleAlias.filters.publicationType, 'journal-article');

  const qProceedingsAlias = parseAndValidateThesisQuery({ publicationType: 'proceedings' });
  assert.strictEqual(qProceedingsAlias.valid, true);
  assert.strictEqual(qProceedingsAlias.filters.publicationType, 'conference-paper');

  const qInvalidPubType = parseAndValidateThesisQuery({ publicationType: 'tweet_stream' });
  assert.strictEqual(qInvalidPubType.valid, false);
  assert.strictEqual(qInvalidPubType.code, 'INVALID_PUBLICATION_TYPE');

  const qValidSort = parseAndValidateThesisQuery({ sort: 'citations' });
  assert.strictEqual(qValidSort.valid, true);
  assert.strictEqual(qValidSort.sortOrder, 'citations');

  const qInvalidSort = parseAndValidateThesisQuery({ sort: 'alphabetical' });
  assert.strictEqual(qInvalidSort.valid, false);
  assert.strictEqual(qInvalidSort.code, 'INVALID_SORT_ORDER');

  const qValidField = parseAndValidateThesisQuery({ fieldId: 'https://openalex.org/fields/17' });
  assert.strictEqual(qValidField.valid, true);
  assert.strictEqual(qValidField.filters.fieldId, '17');

  const qInvalidField = parseAndValidateThesisQuery({ fieldId: 'computer_science' });
  assert.strictEqual(qInvalidField.valid, false);
  assert.strictEqual(qInvalidField.code, 'INVALID_FIELD_ID');

  const qValidSubject = parseAndValidateThesisQuery({ subjectId: 'cybersecurity' });
  assert.strictEqual(qValidSubject.valid, true);
  assert.strictEqual(qValidSubject.filters.subjectId, 'cybersecurity');

  const qInvalidSubject = parseAndValidateThesisQuery({ subjectId: 'invalid@@slug' });
  assert.strictEqual(qInvalidSubject.valid, false);
  assert.strictEqual(qInvalidSubject.code, 'INVALID_SUBJECT_ID');

  const qEmpty = parseAndValidateThesisQuery({});
  assert.strictEqual(qEmpty.isSearchInquiry, false, 'Empty query is not a search inquiry');

  const qSpaces = parseAndValidateThesisQuery({ search: '     ' });
  assert.strictEqual(qSpaces.isSearchInquiry, false, 'Whitespace search is not a search inquiry');

  const qFilterOnly = parseAndValidateThesisQuery({ fieldId: '17' });
  assert.strictEqual(qFilterOnly.isSearchInquiry, true, 'Active filter alone constitutes a search inquiry');

  console.log('  ✓ [PASS] Canonical query parser rigorously enforces validation, clamping, and inquiry detection');

  const cleanedElsevier = cleanPublisherForMatching('Elsevier B.V.');
  assert.strictEqual(cleanedElsevier, 'elsevier', 'Should strip legal suffix B.V.');

  const cleanedIEEE = cleanPublisherForMatching('IEEE Computer Society Press, Inc.');
  assert.strictEqual(cleanedIEEE, 'ieee computer society', 'Should strip Press, Inc.');

  const cleanedSpringer = cleanPublisherForMatching('Springer Nature Publishing Group LLC');
  assert.strictEqual(cleanedSpringer, 'springer nature', 'Should strip Publishing Group LLC');

  assert.strictEqual(
    matchesPublisherFilter({ publisher: 'Elsevier BV' }, 'Elsevier'),
    true,
    'Elsevier BV should match Elsevier'
  );
  assert.strictEqual(
    matchesPublisherFilter({ publisher: 'IEEE Computer Society' }, 'IEEE'),
    true,
    'IEEE Computer Society should match IEEE'
  );
  assert.strictEqual(
    matchesPublisherFilter({ publisher: 'Springer-Verlag GmbH' }, 'Springer'),
    true,
    'Springer-Verlag should match Springer'
  );
  assert.strictEqual(
    matchesPublisherFilter({ publisher: 'Oxford University Press' }, 'Oxford'),
    true,
    'Oxford University Press should match Oxford'
  );
  assert.strictEqual(
    matchesPublisherFilter({ publisher: 'John Wiley & Sons' }, 'Elsevier'),
    false,
    'Wiley must not match Elsevier'
  );
  assert.strictEqual(
    matchesPublisherFilter({ publisher: null }, 'Elsevier'),
    false,
    'Missing publisher must not match publisher query'
  );
  console.log('  ✓ [PASS] Publisher normalization strips legal suffixes and performs accurate token matching');

  assert.strictEqual(PROVIDER_CAPABILITIES.crossref.supportsPublisher, true);
  assert.strictEqual(PROVIDER_CAPABILITIES.openalex.supportsPublisher, true);
  assert.strictEqual(PROVIDER_CAPABILITIES.local.supportsPublisher, true);
  assert.strictEqual(PROVIDER_CAPABILITIES.arxiv.supportsPublisher, false);
  assert.strictEqual(PROVIDER_CAPABILITIES.doaj.supportsPublisher, false);
  assert.strictEqual(PROVIDER_CAPABILITIES.hal.supportsPublisher, false);
  assert.strictEqual(PROVIDER_CAPABILITIES.europepmc.supportsPublisher, false);

  assert.strictEqual(PROVIDER_CAPABILITIES.openalex.supportsInstitution, true);
  assert.strictEqual(PROVIDER_CAPABILITIES.local.supportsInstitution, true);
  assert.strictEqual(PROVIDER_CAPABILITIES.arxiv.supportsInstitution, false);
  console.log('  ✓ [PASS] Provider capability matrix correctly restricts federated providers without false queries');

  const hashP1 = computeSessionHash('quantum computing', { fieldId: '17' }, 'relevance');
  const hashP2 = computeSessionHash('quantum computing', { fieldId: '17' }, 'relevance');
  assert.strictEqual(hashP1, hashP2, 'Identical queries must produce identical session hashes');

  const hashDiffFilter = computeSessionHash('quantum computing', { fieldId: '20' }, 'relevance');
  assert.notStrictEqual(hashP1, hashDiffFilter, 'Different filters must produce distinct session hashes');

  const testSession = {
    sessionId: 'sess_test_123',
    sessionHash: hashP1,
    query: 'quantum computing',
    filters: { fieldId: '17' },
    sort: 'relevance',
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    buffer: [{ id: 'test_rec_1', title: 'Quantum Teleportation' }],
  };
  await sessionStore.saveSession(testSession);
  const retrieved = await sessionStore.getSession('sess_test_123');
  assert.ok(retrieved, 'Session must be retrievable from session store');
  assert.strictEqual(retrieved.sessionHash, hashP1);
  assert.strictEqual(retrieved.buffer.length, 1);
  console.log('  ✓ [PASS] Search session hashing is deterministic, pagination-invariant, and stored durably');

  const rBuet = resolveCountryCodeForThesis({ university: 'Bangladesh University of Engineering and Technology' });
  assert.strictEqual(rBuet.code, 'BD');

  const rDhaka = resolveCountryCodeForThesis({ university: 'University of Dhaka' });
  assert.strictEqual(rDhaka.code, 'BD');

  const rMit = resolveCountryCodeForThesis({ university: 'Massachusetts Institute of Technology (MIT)' });
  assert.strictEqual(rMit.code, 'US');

  const rOxford = resolveCountryCodeForThesis({ university: 'University of Oxford' });
  assert.strictEqual(rOxford.code, 'GB');

  const rUnknown = resolveCountryCodeForThesis({ university: 'Independent Researcher Institute of Unknown Lands' });
  assert.strictEqual(rUnknown, null, 'Unknown institutions must return null and never default to BD');
  console.log('  ✓ [PASS] Country code resolution accurately maps institutions and preserves null honesty for unknown entities');

  console.log('\n===============================================================');
  console.log('  ALL SEARCH HARDENING & REGRESSION TESTS PASSED (100% OK)');
  console.log('===============================================================\n');
}

if (require.main === module) {
  runSearchHardeningRegressionTests().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runSearchHardeningRegressionTests };
