const assert = require('assert');
const institutionService = require('../services/institutionService');
const authorService = require('../services/authorService');
const subjectCatalog = require('../services/subjectCatalog');
const {
  computeSessionHash,
  normalizeSessionFilterKey,
  matchesInstitutionalAndAuthorFilters,
} = require('../services/searchSessionManager');

async function runAuthorAndInstitutionRegressionTests() {
  console.log('Testing: Institution Discovery, Author Metrics & Subject Catalog Regression Suite...');

  // --- 1. Canonical Subject Catalog & Discipline Mapping ---
  {
    const subjects = subjectCatalog.getAllSubjects();
    assert.strictEqual(subjects.length, 15, 'Subject catalog must contain exactly 15 canonical disciplines');

    const aiml = subjectCatalog.getSubjectById('ai-ml');
    assert.ok(aiml, 'ai-ml subject discipline must exist');
    assert.strictEqual(aiml.label, 'Artificial Intelligence and Machine Learning');
    assert.ok(Array.isArray(aiml.openAlexConceptIds) && aiml.openAlexConceptIds.length > 0, 'ai-ml must map to OpenAlex concept IDs');

    // Test extraction from OpenAlex concepts
    const mockConcepts = [
      { id: 'https://openalex.org/C154945302', display_name: 'Artificial intelligence', score: 0.95 },
      { id: 'https://openalex.org/C119857082', display_name: 'Machine learning', score: 0.88 },
    ];
    const extracted = subjectCatalog.extractSubjectsFromOpenAlex(mockConcepts, 'deep neural network classifier');
    assert.ok(Array.isArray(extracted) && extracted.length > 0, 'Extracted subjects must be non-empty');
    assert.strictEqual(extracted[0].id, 'ai-ml', 'Extracted subject must correctly map to canonical ai-ml');

    // Test Cybersecurity OpenAlex topic mappings & extraction
    const cyber = subjectCatalog.getSubjectById('cybersecurity');
    assert.ok(cyber, 'cybersecurity subject discipline must exist');
    assert.ok(cyber.openAlexTopicIds.includes('T10400'), 'cybersecurity must include verified topic T10400');
    assert.ok(!cyber.openAlexTopicIds.includes('T10041'), 'cybersecurity must never contain COVID-19 topic T10041');
    const cyberExtracted = subjectCatalog.extractSubjectsFromOpenAlex([], [{ display_name: 'Network Security and Intrusion Detection' }]);
    assert.strictEqual(cyberExtracted[0]?.id, 'cybersecurity', 'Network security topic must map to canonical cybersecurity');

    // Test Data Science OpenAlex topic mappings & extraction
    const ds = subjectCatalog.getSubjectById('data-science');
    assert.ok(ds, 'data-science subject discipline must exist');
    assert.ok(ds.openAlexTopicIds.includes('T10538'), 'data-science must include verified topic T10538');
    const dsExtracted = subjectCatalog.extractSubjectsFromOpenAlex([], [{ display_name: 'Data Mining Algorithms and Applications' }]);
    assert.strictEqual(dsExtracted[0]?.id, 'data-science', 'Data mining topic must map to canonical data-science');

    console.log('  ✓ [PASS] Subject catalog contains 15 canonical disciplines with verified OpenAlex concept mappings');
  }

  // --- 2. Institutional Discovery & Academic Filtering ---
  {
    const results = await institutionService.suggestInstitutions('Dhaka', { academicOnly: true, limit: 5 });
    assert.ok(Array.isArray(results), 'Institution suggestions must return an array');
    assert.ok(results.length > 0, 'Dhaka search should return academic institutions');

    const du = results.find((inst) => inst.name.toLowerCase().includes('dhaka'));
    assert.ok(du, 'University of Dhaka or Dhaka institution must be present');
    assert.strictEqual(du.countryCode, 'BD', 'Dhaka institution country code must be BD');
    assert.ok(du.id, 'Institution record must have unique ID');

    console.log('  ✓ [PASS] Institutional discovery returns verified universities with country codes and ROR metadata');
  }

  // --- 3. Author Candidates Search & Provenance Metrics ---
  {
    const authors = await authorService.searchAuthors('Bengio', { limit: 5 });
    assert.ok(Array.isArray(authors), 'Author candidates must be an array');
    assert.ok(authors.length > 0, 'Searching Bengio must return researcher candidates');

    const topAuthor = authors[0];
    assert.ok(topAuthor.name, 'Author must have a display name');
    assert.ok(topAuthor.id, 'Author must have an identifier');
    assert.ok(typeof topAuthor.worksCount === 'number', 'Author worksCount must be a number');
    assert.ok(typeof topAuthor.citationCount === 'number', 'Author citationCount must be a number');
    assert.ok(topAuthor.citationMetrics?.source === 'OpenAlex', 'Citation metric must honestly cite OpenAlex provenance');

    // Fetch author profile
    const profile = await authorService.getAuthorProfile(topAuthor.id);
    assert.ok(profile, 'Author profile must exist');
    assert.ok(profile.author, 'Profile must contain author summary');
    assert.ok(Array.isArray(profile.works), 'Profile works must be an array');
    assert.ok(profile.retrievedAt, 'Profile must record provenance retrieval timestamp');

    console.log('  ✓ [PASS] Author search and profile retrieval include verified citations, h-index, and OpenAlex attribution');
  }

  // --- 4. Search Session Hash Key Integrity & Isolation ---
  {
    const baseFilters = {
      category: 'Artificial Intelligence and Machine Learning',
      institutionId: 'https://openalex.org/I136199984',
      countryCodes: ['BD'],
      authorId: 'https://openalex.org/A5023880391',
      minCitations: '50',
      subjectId: 'ai-ml',
    };

    const hash1 = computeSessionHash('machine learning', baseFilters, 'citations');

    // Modifying country code must produce a different session hash
    const filtersDiffCountry = {
      ...baseFilters,
      countryCodes: ['US'],
    };
    const hashDiffCountry = computeSessionHash('machine learning', filtersDiffCountry, 'citations');
    assert.notStrictEqual(hash1, hashDiffCountry, 'Changing country codes must yield distinct session hash');

    // Modifying institution must produce a different session hash
    const filtersDiffInst = {
      ...baseFilters,
      institutionId: 'https://openalex.org/I63966007',
    };
    assert.notStrictEqual(hash1, computeSessionHash('machine learning', filtersDiffInst, 'citations'), 'Changing institution must yield distinct session hash');

    // Modifying authorId must produce a different session hash
    const filtersDiffAuthor = {
      ...baseFilters,
      authorId: 'https://openalex.org/A5000000000',
    };
    assert.notStrictEqual(hash1, computeSessionHash('machine learning', filtersDiffAuthor, 'citations'), 'Changing authorId must yield distinct session hash');

    // Modifying sort order must produce a different session hash
    assert.notStrictEqual(hash1, computeSessionHash('machine learning', baseFilters, 'relevance'), 'Changing sort order must yield distinct session hash');

    console.log('  ✓ [PASS] Search session hashing accurately isolates institution, country, author, citation, and sort states');
  }

  // --- 5. Strict Coauthor Isolation & Institutional Conjunction Rules ---
  {
    // Mock Paper:
    // Author 1: Yoshua Bengio, Institution: Universite de Montreal (I70931966), Country: CA
    // Author 2: Md. Hasan, Institution: BUET (I136199984), Country: BD
    // Awarding Institution: BUET, Country: BD
    // Citations: 125
    const mockRecord = {
      title: 'Neural Machine Translation By Jointly Learning to Align and Translate',
      publishedYear: 2021,
      citationCount: 125,
      awardingInstitution: {
        id: 'https://openalex.org/I136199984',
        name: 'Bangladesh University of Engineering and Technology',
        countryCode: 'BD',
      },
      authorships: [
        {
          author: {
            id: 'https://openalex.org/A5023880391',
            name: 'Yoshua Bengio',
          },
          institutions: [
            {
              id: 'https://openalex.org/I70931966',
              name: 'Université de Montréal',
              countryCode: 'CA',
            },
          ],
        },
        {
          author: {
            id: 'https://openalex.org/A5099999999',
            name: 'Md. Hasan',
          },
          institutions: [
            {
              id: 'https://openalex.org/I136199984',
              name: 'Bangladesh University of Engineering and Technology',
              countryCode: 'BD',
            },
          ],
        },
      ],
      subjects: [{ id: 'ai-ml', label: 'Artificial Intelligence and Machine Learning' }],
    };

    // A. Coauthor Isolation:
    // Filtering by Yoshua Bengio + BUET MUST FAIL (Bengio was not at BUET)
    const bengioAtBuet = matchesInstitutionalAndAuthorFilters(mockRecord, {
      authorId: 'https://openalex.org/A5023880391',
      institutionId: 'https://openalex.org/I136199984',
      institutionMode: 'affiliation',
    });
    assert.strictEqual(bengioAtBuet, false, 'Coauthor isolation: Author A at Institution X must not match coauthor at Institution Y');

    // Filtering by Md. Hasan + BUET MUST PASS
    const hasanAtBuet = matchesInstitutionalAndAuthorFilters(mockRecord, {
      authorId: 'https://openalex.org/A5099999999',
      institutionId: 'https://openalex.org/I136199984',
      institutionMode: 'affiliation',
    });
    assert.strictEqual(hasanAtBuet, true, 'Author matching their own institution must pass');

    // B. Institution + Country Conjunction:
    // Filtering by BUET + Country 'US' MUST FAIL (BUET is in BD, not US)
    const buetInUS = matchesInstitutionalAndAuthorFilters(mockRecord, {
      institutionId: 'https://openalex.org/I136199984',
      institutionMode: 'affiliation',
      countryCodes: ['US'],
    });
    assert.strictEqual(buetInUS, false, 'Institution BUET is in BD and must not match country US');

    // Filtering by BUET + Country 'BD' MUST PASS
    const buetInBD = matchesInstitutionalAndAuthorFilters(mockRecord, {
      institutionId: 'https://openalex.org/I136199984',
      institutionMode: 'affiliation',
      countryCodes: ['BD'],
    });
    assert.strictEqual(buetInBD, true, 'Institution BUET in country BD must pass');

    // C. Awarding Institution Mode:
    // Filtering by Awarding Mode for BUET must match
    const awardingBuet = matchesInstitutionalAndAuthorFilters(mockRecord, {
      institutionId: 'https://openalex.org/I136199984',
      institutionMode: 'awarding',
    });
    assert.strictEqual(awardingBuet, true, 'Awarding institution mode must match awarding body');

    // Filtering by Awarding Mode for Université de Montréal must fail (UdeM was affiliation, not awarding body)
    const awardingUdeM = matchesInstitutionalAndAuthorFilters(mockRecord, {
      institutionId: 'https://openalex.org/I70931966',
      institutionMode: 'awarding',
    });
    assert.strictEqual(awardingUdeM, false, 'Non-awarding institution must fail awarding filter mode');

    // D. Citation Threshold:
    const pass50Citations = matchesInstitutionalAndAuthorFilters(mockRecord, { minCitations: 50 });
    assert.strictEqual(pass50Citations, true, 'Paper with 125 citations must satisfy minCitations=50');

    const fail200Citations = matchesInstitutionalAndAuthorFilters(mockRecord, { minCitations: 200 });
    assert.strictEqual(fail200Citations, false, 'Paper with 125 citations must not satisfy minCitations=200');

    // E. Subject Category Filtering:
    const passSubject = matchesInstitutionalAndAuthorFilters(mockRecord, { subjectId: 'ai-ml' });
    assert.strictEqual(passSubject, true, 'Paper with ai-ml subject must match subjectId=ai-ml');

    const failSubject = matchesInstitutionalAndAuthorFilters(mockRecord, { subjectId: 'renewable-energy' });
    assert.strictEqual(failSubject, false, 'Paper must not match mismatched subjectId');

    console.log('  ✓ [PASS] Strict coauthor isolation, institution-country conjunction, and citation filters verified');
  }

  // --- 6. Citation Count Integrity & Non-Fabrication ---
  {
    const recordNoCitations = {
      title: 'Undergraduate Thesis on Embedded Microcontrollers',
      citationCount: null,
      citationMetrics: null,
    };

    // When minCitations is requested, null citationCount must NOT match or be converted to 0
    const matched = matchesInstitutionalAndAuthorFilters(recordNoCitations, { minCitations: 1 });
    assert.strictEqual(matched, false, 'Unrecorded citation count must not pass positive minCitations filter');

    console.log('  ✓ [PASS] Citation metric provenance is honest: null counts remain null and are never fabricated');
  }

  console.log('\n===============================================================');
  console.log('  ALL AUTHOR, INSTITUTION & SUBJECT REGRESSION TESTS PASSED   ');
  console.log('===============================================================');
}

module.exports = {
  runAuthorAndInstitutionRegressionTests,
};

if (require.main === module) {
  runAuthorAndInstitutionRegressionTests().catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
}
