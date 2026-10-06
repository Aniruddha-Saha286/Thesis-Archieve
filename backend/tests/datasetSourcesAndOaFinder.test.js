/**
 * Tests for:
 *   - the three newer dataset sources in services/datasetDiscoveryService.js
 *     (Hugging Face, Harvard Dataverse, OpenAIRE ScholeXplorer)
 *   - services/openAccessFinder.js (free legal PDF lookup through Unpaywall)
 *
 * Nothing here touches the network. global.fetch is replaced with a stand-in that answers
 * from the fixtures, and is put back at the end whatever happens.
 *
 * Run on its own with:  node tests/datasetSourcesAndOaFinder.test.js
 */

const assert = require('assert');
const {
  isSafeDatasetUrl,
  queryHuggingFace,
  queryDataverse,
  queryScholexplorer,
  enrichPaperDatasets,
  searchGlobalDatasets,
} = require('../services/datasetDiscoveryService');
const { findOpenAccessPdf, __testing: oaTesting } = require('../services/openAccessFinder');
const {
  huggingFaceDatasetsResponse,
  dataverseSearchResponse,
  scholexplorerLinksResponse,
} = require('./fixtures/datasetSourceFixtures');
const {
  unpaywallOpenResponse,
  unpaywallRepositoryFallbackResponse,
  unpaywallLandingOnlyResponse,
  unpaywallClosedResponse,
  unpaywallNotFoundBody,
} = require('./fixtures/unpaywallFixtures');

// The fields every dataset record must carry, whichever source it came from. The pages
// that show datasets read these names, so a new source must not leave any of them out.
const BASE_FIELDS = [
  'id',
  'title',
  'url',
  'doi',
  'publisher',
  'publicationYear',
  'description',
  'formats',
  'size',
  'license',
  'isLinked',
  'relationType',
  'relationshipDirection',
  'relationEvidence',
  'source',
  'sourceUrl',
];

// Builds the small part of a fetch Response that the services use.
function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    json: async () => body,
  };
}

// Replaces global.fetch. "routes" is a list of [text found in the address, answer].
// The answer is a function, so a test can also throw to imitate a network failure.
// Any address that no route covers fails loudly: a test must never call out by accident.
function installFetch(routes) {
  const calls = [];
  global.fetch = async (url, options) => {
    const address = String(url);
    calls.push({ url: address, options: options || {} });
    for (const [needle, handler] of routes) {
      if (address.includes(needle)) return handler(address, options || {});
    }
    throw new Error(`Unexpected outbound request in test: ${address}`);
  };
  return calls;
}

const DATACITE = 'api.datacite.org';
const ZENODO = 'zenodo.org/api';
const FIGSHARE = 'api.figshare.com';
const DRYAD = 'datadryad.org/api';
const HUGGING_FACE = 'huggingface.co/api/datasets';
const DATAVERSE = 'dataverse.harvard.edu/api/search';
const SCHOLEXPLORER = 'scholexplorer';

// "Nothing found" answers, in each service's own shape.
const EMPTY = {
  [DATACITE]: () => jsonResponse({ data: [], meta: { total: 0 } }),
  [ZENODO]: () => jsonResponse({ hits: { total: 0, hits: [] } }),
  [FIGSHARE]: () => jsonResponse([]),
  [DRYAD]: () => jsonResponse({ total: 0, _embedded: { 'stash:datasets': [] } }),
  [HUGGING_FACE]: () => jsonResponse([]),
  [DATAVERSE]: () => jsonResponse({ status: 'OK', data: { total_count: 0, start: 0, items: [], count_in_response: 0 } }),
  [SCHOLEXPLORER]: () => jsonResponse({ currentPage: 0, totalLinks: 0, totalPages: 0, result: [] }),
};

// Every service answers "nothing found" unless the test says otherwise.
function routesWith(overrides = {}) {
  return Object.keys(EMPTY).map((needle) => [needle, overrides[needle] || EMPTY[needle]]);
}

function assertBaseShape(record, label) {
  for (const field of BASE_FIELDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(record, field), `${label}: record must carry the "${field}" field`);
  }
  assert.ok(Array.isArray(record.formats), `${label}: formats must be a list`);
  assert.strictEqual(typeof record.isLinked, 'boolean', `${label}: isLinked must be true or false`);
  assert.ok(isSafeDatasetUrl(record.url), `${label}: url must pass the safe-link check`);
  assert.strictEqual(record.sourceUrl, record.url, `${label}: sourceUrl must match url`);
}

// One realistic answer from each of the four original sources, used to prove that adding
// sources did not change what they return.
const ORIGINAL_SOURCE_PAYLOADS = {
  [DATACITE]: () =>
    jsonResponse({
      data: [
        {
          id: '10.5555/dc.one',
          attributes: {
            doi: '10.5555/dc.one',
            url: 'https://zenodo.org/records/111',
            titles: [{ title: 'DataCite One' }],
            publisher: 'Example Repository',
            publicationYear: 2020,
            descriptions: [{ description: 'First description.' }],
            formats: ['csv'],
            rightsList: [{ rightsIdentifier: 'cc-by-4.0' }],
          },
        },
      ],
      meta: { total: 9 },
    }),
  [ZENODO]: () =>
    jsonResponse({
      hits: {
        total: 3,
        hits: [
          {
            id: 222,
            doi: '10.5555/zen.two',
            doi_url: 'https://doi.org/10.5555/zen.two',
            metadata: {
              title: 'Zenodo Two',
              publication_date: '2021-06-15',
              description: '<p>Second description.</p>',
              license: { id: 'cc0-1.0' },
            },
            files: [{ key: 'data.zip', size: 2 * 1024 * 1024 }],
          },
        ],
      },
    }),
  [FIGSHARE]: () =>
    jsonResponse([
      {
        id: 333,
        title: 'Figshare Three',
        doi: '10.5555/FIG.three',
        url_public_html: 'https://figshare.com/articles/dataset/three/333',
        published_date: '2022-03-03T12:00:00Z',
      },
    ]),
  [DRYAD]: () =>
    jsonResponse({
      total: 1,
      _embedded: {
        'stash:datasets': [
          {
            id: 444,
            identifier: 'doi:10.5555/dryad.four',
            title: 'Dryad Four',
            publicationDate: '2023-05-05',
            abstract: '<p>Fourth description.</p>',
            storageSize: 5 * 1024 * 1024,
            license: 'https://creativecommons.org/publicdomain/zero/1.0/',
          },
        ],
      },
    }),
};

const EXPECTED_ORIGINAL_RECORDS = {
  DataCite: {
    id: 'datacite_10.5555/dc.one',
    title: 'DataCite One',
    url: 'https://zenodo.org/records/111',
    doi: '10.5555/dc.one',
    publisher: 'Example Repository',
    publicationYear: 2020,
    description: 'First description.',
    formats: ['CSV'],
    size: null,
    license: 'cc-by-4.0',
    isLinked: false,
    relationType: 'Topic Similarity Discovery',
    relationshipDirection: 'topic',
    relationEvidence: 'Discovered through keyword matching against dataset titles and abstracts.',
    source: 'DataCite',
    sourceUrl: 'https://zenodo.org/records/111',
  },
  Zenodo: {
    id: 'zenodo_222',
    title: 'Zenodo Two',
    url: 'https://doi.org/10.5555/zen.two',
    doi: '10.5555/zen.two',
    publisher: 'Zenodo / CERN Open Science',
    publicationYear: 2021,
    description: 'Second description.',
    formats: ['ZIP'],
    size: '2.0 MB',
    license: 'cc0-1.0',
    isLinked: false,
    relationType: 'Topic Similarity Discovery',
    relationshipDirection: 'topic',
    relationEvidence: 'Discovered through keyword matching against Zenodo record metadata.',
    source: 'Zenodo',
    sourceUrl: 'https://doi.org/10.5555/zen.two',
  },
  Figshare: {
    id: 'figshare_333',
    title: 'Figshare Three',
    url: 'https://figshare.com/articles/dataset/three/333',
    doi: '10.5555/fig.three',
    publisher: 'Figshare Open Repository',
    publicationYear: 2022,
    description: null,
    formats: ['DATASET'],
    size: null,
    license: 'Unknown / Not specified',
    isLinked: false,
    relationType: 'Topic Similarity Discovery',
    relationshipDirection: 'topic',
    relationEvidence: 'Discovered through search against Figshare repository without verified relation.',
    source: 'Figshare',
    sourceUrl: 'https://figshare.com/articles/dataset/three/333',
  },
  Dryad: {
    id: 'dryad_444',
    title: 'Dryad Four',
    url: 'https://doi.org/10.5555/dryad.four',
    doi: '10.5555/dryad.four',
    publisher: 'Dryad Digital Repository',
    publicationYear: 2023,
    description: 'Fourth description.',
    formats: ['DATASET'],
    size: '5.0 MB',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    isLinked: false,
    relationType: 'Topic Similarity Discovery',
    relationshipDirection: 'topic',
    relationEvidence: 'Discovered through search against Dryad repository without verified relation.',
    source: 'Dryad',
    sourceUrl: 'https://doi.org/10.5555/dryad.four',
  },
};

async function runDatasetSourcesAndOaFinderTests() {
  console.log('Testing: New Dataset Sources (Hugging Face, Harvard Dataverse, ScholeXplorer) & Open Access Finder...');

  const originalFetch = global.fetch;
  const originalDateNow = Date.now;
  const originalEnv = {
    OFFLINE_MODE: process.env.OFFLINE_MODE,
    UNPAYWALL_EMAIL: process.env.UNPAYWALL_EMAIL,
    SCHOLEXPLORER_API_URL: process.env.SCHOLEXPLORER_API_URL,
  };
  let passed = 0;
  const pass = (message) => {
    passed += 1;
    console.log(`  ✓ [PASS] ${message}`);
  };

  try {
    // Most tests imitate the live services, so offline mode is switched off for now.
    process.env.OFFLINE_MODE = 'false';
    delete process.env.SCHOLEXPLORER_API_URL;

    // =======================================================================
    // PART A: HUGGING FACE
    // =======================================================================
    console.log('--- 1. Hugging Face datasets ---');

    // A1: request parameters and field mapping
    {
      const calls = installFetch([[HUGGING_FACE, () => jsonResponse(huggingFaceDatasetsResponse)]]);
      const res = await queryHuggingFace({ query: 'bangla sentiment', page: 1, size: 5 });

      assert.strictEqual(calls.length, 1, 'One request is enough for one page');
      const asked = new URL(calls[0].url);
      assert.strictEqual(asked.origin + asked.pathname, 'https://huggingface.co/api/datasets');
      assert.strictEqual(asked.searchParams.get('search'), 'bangla sentiment');
      assert.strictEqual(asked.searchParams.get('limit'), '5');
      assert.strictEqual(asked.searchParams.get('full'), 'true');
      assert.strictEqual(asked.searchParams.get('sort'), 'downloads');
      assert.strictEqual(asked.searchParams.get('direction'), '-1');
      assert.ok(calls[0].options.signal, 'The request must carry a time limit');

      assert.strictEqual(res.error, null);
      // 5 raw items: one is disabled and one has no id, so 3 remain
      assert.strictEqual(res.records.length, 3, 'Disabled and id-less datasets must be skipped');
      res.records.forEach((r) => assertBaseShape(r, 'Hugging Face'));

      assert.deepStrictEqual(res.records[0], {
        id: 'huggingface_panther-fixtures/bangla-news-sentiment',
        title: 'panther-fixtures/bangla-news-sentiment',
        url: 'https://huggingface.co/datasets/panther-fixtures/bangla-news-sentiment',
        doi: '10.57967/hf/9990001',
        publisher: 'Hugging Face Hub',
        publicationYear: 2022,
        description:
          'News headlines in Bangla and English labelled as positive, negative or neutral. Built for sentiment classification experiments.',
        formats: ['PARQUET'],
        size: '10K-100K rows',
        license: 'cc-by-4.0',
        isLinked: false,
        relationType: 'Topic Similarity Discovery',
        relationshipDirection: 'topic',
        relationEvidence: 'Discovered through keyword search of the Hugging Face Hub dataset catalogue.',
        source: 'Hugging Face',
        sourceUrl: 'https://huggingface.co/datasets/panther-fixtures/bangla-news-sentiment',
        authors: ['panther-fixtures'],
        tags: ['text-classification', 'text', 'bn', 'en'],
        languages: ['bn', 'en'],
        taskCategories: ['text-classification'],
        sizeCategory: '10K<n<100K',
        downloads: 7730,
        likes: 38,
        lastModified: '2025-07-06T14:05:59.000Z',
        gated: false,
      });

      // A bare repository: honest blanks, nothing invented
      const bare = res.records[1];
      assert.strictEqual(bare.title, 'panther-fixtures/untitled-upload');
      assert.strictEqual(bare.description, null);
      assert.strictEqual(bare.license, 'Unknown / Not specified');
      assert.deepStrictEqual(bare.formats, []);
      assert.strictEqual(bare.size, null);
      assert.strictEqual(bare.doi, null);
      assert.strictEqual(bare.publicationYear, 2024);

      // Licence written as a list in the card, and a gated dataset
      const gated = res.records[2];
      assert.strictEqual(gated.license, 'other');
      assert.strictEqual(gated.gated, true);
      assert.strictEqual(gated.size, 'under 1K rows');
      assert.strictEqual(gated.description, 'De-identified clinical notes. Access is granted on request.');
      assert.deepStrictEqual(gated.taskCategories, ['token-classification', 'summarization']);
      pass('Hugging Face: sends search/limit/full/sort/direction and maps id, card data, tags, downloads, likes and dates');
    }

    // A2: paging, keyword-only behaviour and unsafe ids
    {
      const manyItems = Array.from({ length: 6 }, (_, i) => ({
        id: `panther-fixtures/page-item-${i + 1}`,
        author: 'panther-fixtures',
        tags: [],
        downloads: 100 - i,
        likes: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
      }));
      let calls = installFetch([[HUGGING_FACE, () => jsonResponse(manyItems)]]);
      const page2 = await queryHuggingFace({ query: 'paging', page: 2, size: 3 });
      assert.strictEqual(new URL(calls[0].url).searchParams.get('limit'), '6', 'Page 2 of 3 asks for the first 6');
      assert.deepStrictEqual(
        page2.records.map((r) => r.title),
        ['panther-fixtures/page-item-4', 'panther-fixtures/page-item-5', 'panther-fixtures/page-item-6'],
        'Page 2 must be the second slice, not a repeat of page 1'
      );
      assert.strictEqual(page2.hasMore, true, 'A full answer means there may be more');

      // A DOI is not something the Hub can be searched for: no request at all
      calls = installFetch([]);
      const doiOnly = await queryHuggingFace({ doi: '10.5555/some.paper', isLinked: true });
      assert.deepStrictEqual(doiOnly, { records: [], totalCount: 0, hasMore: false, error: null });
      assert.strictEqual(calls.length, 0, 'A DOI-only call must not contact Hugging Face');

      // A page so deep it would mean a huge download is refused without calling out
      const tooDeep = await queryHuggingFace({ query: 'paging', page: 50, size: 20 });
      assert.strictEqual(tooDeep.records.length, 0);
      assert.strictEqual(tooDeep.hasMore, false);
      assert.strictEqual(calls.length, 0);

      // The link is built from the id, so an id that is not a plain "owner/name" is refused
      installFetch([
        [
          HUGGING_FACE,
          () =>
            jsonResponse([
              { id: '../../etc/passwd', tags: [] },
              { id: 'evil.example.com/a/b', tags: [] },
              { id: 'has space/name', tags: [] },
              { id: 'owner/name?redirect=http://127.0.0.1', tags: [] },
              { id: 'owner/private-one', private: true, tags: [] },
              { id: 'good-owner/good.name_1', tags: [] },
            ]),
        ],
      ]);
      const filtered = await queryHuggingFace({ query: 'ids', page: 1, size: 10 });
      assert.deepStrictEqual(filtered.records.map((r) => r.url), ['https://huggingface.co/datasets/good-owner/good.name_1']);
      pass('Hugging Face: pages by slicing, ignores DOI-only calls, and refuses unsafe ids and private datasets');
    }

    // =======================================================================
    // PART B: HARVARD DATAVERSE
    // =======================================================================
    console.log('--- 2. Harvard Dataverse ---');

    // B1: request parameters and field mapping
    {
      const calls = installFetch([[DATAVERSE, () => jsonResponse(dataverseSearchResponse)]]);
      const res = await queryDataverse({ query: 'household survey', page: 3, size: 5 });

      const asked = new URL(calls[0].url);
      assert.strictEqual(asked.origin + asked.pathname, 'https://dataverse.harvard.edu/api/search');
      assert.strictEqual(asked.searchParams.get('q'), 'household survey');
      assert.strictEqual(asked.searchParams.get('type'), 'dataset');
      assert.strictEqual(asked.searchParams.get('per_page'), '5');
      assert.strictEqual(asked.searchParams.get('start'), '10', 'Page 3 of 5 starts at item 10');

      assert.strictEqual(res.error, null);
      assert.strictEqual(res.totalCount, 37);
      assert.strictEqual(res.hasMore, true);
      // 5 raw items, one of them is a file and not a dataset
      assert.strictEqual(res.records.length, 4, 'Items that are not datasets must be skipped');
      res.records.forEach((r) => assertBaseShape(r, 'Harvard Dataverse'));

      assert.deepStrictEqual(res.records[0], {
        id: 'dataverse_doi_10_5072_FK2_PANTH1',
        title: 'Replication Data for: Rural Household Survey 2019',
        url: 'https://doi.org/10.5072/FK2/PANTH1',
        doi: '10.5072/fk2/panth1',
        publisher: 'Panther Fixtures Dataverse',
        publicationYear: 2019,
        description: 'Household-level survey data covering income, schooling and health in rural districts.',
        formats: [],
        size: '3 files',
        license: 'Unknown / Not specified',
        isLinked: false,
        relationType: 'Topic Similarity Discovery',
        relationshipDirection: 'topic',
        relationEvidence: 'Discovered through search against Harvard Dataverse without verified relation.',
        source: 'Harvard Dataverse',
        sourceUrl: 'https://doi.org/10.5072/FK2/PANTH1',
        authors: ['Rahman, Farhana', 'Hossain, Anwar'],
        subjects: ['Social Sciences', 'Other'],
        keywords: [],
        fileCount: 3,
        publishedAt: '2019-12-11T15:26:10Z',
      });

      assert.strictEqual(res.records[1].size, '1 file');
      assert.deepStrictEqual(res.records[1].keywords, ['microcredit', 'education']);

      // A Handle link is not on the approved list, so the dataset's own Harvard page is used
      const handle = res.records[2];
      assert.strictEqual(handle.doi, null);
      assert.strictEqual(handle.url, 'https://dataverse.harvard.edu/dataset.xhtml?persistentId=hdl%3A1902.1%2FPANTH3');

      // A nearly empty deposit: honest blanks
      const sparse = res.records[3];
      assert.strictEqual(sparse.description, null);
      assert.strictEqual(sparse.publicationYear, null);
      assert.strictEqual(sparse.size, null);
      assert.strictEqual(sparse.publisher, 'Harvard Dataverse');
      assert.deepStrictEqual(sparse.authors, []);
      pass('Harvard Dataverse: sends q/type/per_page/start and maps name, description, DOI, publisher, date, authors, subjects, file count');
    }

    // B2: DOI lookups, query clean-up, unsafe links, bot challenge
    {
      // With a paper DOI: exact-phrase search, and only a matching "Related Publication" counts
      let calls = installFetch([[DATAVERSE, () => jsonResponse(dataverseSearchResponse)]]);
      const byDoi = await queryDataverse({ doi: 'https://doi.org/10.5555/JFE.2021.0042', isLinked: true, page: 1, size: 5 });
      assert.strictEqual(new URL(calls[0].url).searchParams.get('q'), '"10.5555/jfe.2021.0042"');
      const verified = byDoi.records.filter((r) => r.relationshipDirection === 'supplemental');
      assert.strictEqual(verified.length, 1, 'Only the dataset that names this paper is a verified link');
      assert.strictEqual(verified[0].title, 'Replication Data for: Microcredit and School Enrolment');
      assert.strictEqual(verified[0].relationType, 'Direct Supplemental Dataset');
      assert.strictEqual(verified[0].isLinked, true);
      assert.ok(
        byDoi.records.filter((r) => r !== verified[0]).every((r) => r.isLinked === false && r.relationshipDirection === 'topic'),
        'Datasets that merely matched the search stay unverified'
      );

      // Characters that would break the search engine are removed from what a visitor typed
      calls = installFetch([[DATAVERSE, EMPTY[DATAVERSE]]]);
      await queryDataverse({ query: 'title:"climate (change)" AND/OR -rain [2020]', page: 1, size: 5 });
      assert.strictEqual(new URL(calls[0].url).searchParams.get('q'), 'title climate change AND OR rain 2020');

      // Nothing left to search for: no request
      calls = installFetch([]);
      const blank = await queryDataverse({ query: ' ":()" ', page: 1, size: 5 });
      assert.strictEqual(blank.records.length, 0);
      assert.strictEqual(calls.length, 0);

      // Unsafe links
      installFetch([
        [
          DATAVERSE,
          () =>
            jsonResponse({
              status: 'OK',
              data: {
                total_count: 4,
                items: [
                  { name: 'Cloud metadata trap', type: 'dataset', url: 'http://169.254.169.254/latest/meta-data/' },
                  { name: 'Unknown host', type: 'dataset', url: 'https://evil.example.com/steal', global_id: 'not-an-id' },
                  { name: 'Script link', type: 'dataset', url: 'javascript:alert(1)', global_id: 'doi:10.5072/FK2/SAFE1' },
                  { name: 'Local file', type: 'dataset', url: 'file:///etc/passwd' },
                ],
              },
            }),
        ],
      ]);
      const unsafe = await queryDataverse({ query: 'unsafe links', page: 1, size: 5 });
      assert.strictEqual(unsafe.records.length, 1, 'Datasets with no safe link must be dropped');
      assert.strictEqual(unsafe.records[0].title, 'Script link');
      assert.strictEqual(unsafe.records[0].url, 'https://doi.org/10.5072/fk2/safe1', 'A bad link is replaced by the DOI link we build ourselves');

      // The bot filter answers 202 with a challenge page: that is a failure, not "no results"
      installFetch([[DATAVERSE, () => ({ ok: true, status: 202, headers: new Map(), json: async () => { throw new Error('not json'); } })]]);
      const challenged = await queryDataverse({ query: 'challenge', page: 1, size: 5 });
      assert.strictEqual(challenged.error, 'Harvard Dataverse HTTP 202');
      assert.deepStrictEqual(challenged.records, []);

      // An error envelope is reported as an error too
      installFetch([[DATAVERSE, () => jsonResponse({ status: 'ERROR', message: 'Something went wrong' })]]);
      const envelope = await queryDataverse({ query: 'envelope', page: 1, size: 5 });
      assert.strictEqual(envelope.error, 'Harvard Dataverse error: Something went wrong');
      pass('Harvard Dataverse: verifies links by related-publication DOI, cleans the query, drops unsafe links, treats a bot challenge as a failure');
    }

    // =======================================================================
    // PART C: OPENAIRE SCHOLEXPLORER
    // =======================================================================
    console.log('--- 3. OpenAIRE ScholeXplorer ---');

    // C1: request parameters and field mapping
    {
      const calls = installFetch([[SCHOLEXPLORER, () => jsonResponse(scholexplorerLinksResponse)]]);
      const res = await queryScholexplorer({ doi: 'doi:10.5555/JFE.2021.0042', page: 1, size: 5 });

      const asked = new URL(calls[0].url);
      assert.strictEqual(asked.origin + asked.pathname, 'https://api.scholexplorer.openaire.eu/v2/Links');
      assert.strictEqual(asked.searchParams.get('sourcePid'), '10.5555/jfe.2021.0042', 'The DOI is sent in its plain lower-case form');
      assert.strictEqual(asked.searchParams.get('targetType'), 'dataset');
      assert.strictEqual(asked.searchParams.has('page'), false, 'The first page needs no page parameter');

      assert.strictEqual(res.error, null);
      assert.strictEqual(res.totalCount, 6);
      assert.strictEqual(res.hasMore, false);
      // 6 raw links: one targets a paper, one targets a host that is not approved, and two
      // describe the same dataset. That leaves 3.
      assert.strictEqual(res.records.length, 3);
      res.records.forEach((r) => assertBaseShape(r, 'ScholeXplorer'));
      assert.ok(res.records.every((r) => r.isLinked === true), 'Every ScholeXplorer record is a declared link');
      assert.ok(res.records.every((r) => !('relationRank' in r)), 'The internal sorting field must not leak out');

      // Strongest relation first
      assert.deepStrictEqual(res.records.map((r) => r.relationshipDirection), ['supplemental', 'reference', 'associated']);

      assert.deepStrictEqual(res.records[0], {
        id: 'scholexplorer_10_5555_zenodo_9900042',
        title: 'Survey data for: Microcredit and School Enrolment',
        url: 'https://doi.org/10.5555/zenodo.9900042',
        doi: '10.5555/zenodo.9900042',
        publisher: 'Zenodo',
        publicationYear: 2021,
        description: null,
        formats: [],
        size: null,
        license: 'Unknown / Not specified',
        isLinked: true,
        relationType: 'Direct Supplemental Dataset',
        relationshipDirection: 'supplemental',
        relationEvidence:
          "Scholix link 'IsSupplementedBy' reported by DataCite (via OpenAIRE ScholeXplorer): Dataset is supplementary material of the publication.",
        source: 'OpenAIRE ScholeXplorer',
        sourceUrl: 'https://doi.org/10.5555/zenodo.9900042',
        authors: ['Nusrat Akter', 'Imran Chowdhury'],
        linkProviders: ['DataCite'],
      });

      assert.strictEqual(res.records[1].relationType, 'Referenced Work / Citation');
      assert.strictEqual(res.records[1].publisher, 'Example Data Archive');
      assert.strictEqual(res.records[1].publicationYear, 2013);

      // A dataset with no title still gets a usable label
      assert.strictEqual(res.records[2].relationType, 'Associated Resource');
      assert.strictEqual(res.records[2].title, 'Dataset 10.5555/dryad.fixture77');
      assert.strictEqual(res.records[2].publisher, 'Not specified');
      assert.strictEqual(res.records[2].publicationYear, null);
      pass('ScholeXplorer: asks for dataset links of the paper DOI, keeps datasets only, merges repeats, strongest relation first');
    }

    // C2: invalid DOI, later pages, address override, unsafe links, newer schema
    {
      let calls = installFetch([]);
      for (const bad of [undefined, null, '', 'not a doi', 'climate change', 12345]) {
        const res = await queryScholexplorer({ doi: bad });
        assert.deepStrictEqual(res, { records: [], totalCount: 0, hasMore: false, error: null });
      }
      // It is not a keyword search either
      const keyword = await queryScholexplorer({ query: 'climate change' });
      assert.strictEqual(keyword.records.length, 0);
      assert.strictEqual(calls.length, 0, 'Without a real DOI ScholeXplorer must not be contacted');

      // Later pages count from 0 on their side; the address can be changed in the settings
      process.env.SCHOLEXPLORER_API_URL = 'https://api-beta.scholexplorer.openaire.eu/v3/Links';
      calls = installFetch([[SCHOLEXPLORER, () => jsonResponse({ currentPage: 2, totalLinks: 450, totalPages: 5, result: [] })]]);
      const page3 = await queryScholexplorer({ doi: '10.5555/paged.paper', page: 3, size: 5 });
      const asked = new URL(calls[0].url);
      assert.strictEqual(asked.origin + asked.pathname, 'https://api-beta.scholexplorer.openaire.eu/v3/Links');
      assert.strictEqual(asked.searchParams.get('page'), '2');
      assert.strictEqual(page3.hasMore, true);

      // A setting that is not an https address is ignored
      process.env.SCHOLEXPLORER_API_URL = 'http://127.0.0.1:9000/scholexplorer';
      calls = installFetch([[SCHOLEXPLORER, EMPTY[SCHOLEXPLORER]]]);
      await queryScholexplorer({ doi: '10.5555/override.paper' });
      assert.ok(calls[0].url.startsWith('https://api.scholexplorer.openaire.eu/v2/Links?'));
      delete process.env.SCHOLEXPLORER_API_URL;

      // Unsafe links, and the newer schema that writes "Target" and "Name" with capitals
      installFetch([
        [
          SCHOLEXPLORER,
          () =>
            jsonResponse({
              currentPage: 0,
              totalLinks: 3,
              totalPages: 1,
              result: [
                {
                  RelationshipType: { Name: 'IsRelatedTo' },
                  target: { Type: 'dataset', Title: 'Internal host', Identifier: [{ ID: 'X1', IDScheme: 'url', IDURL: 'http://127.0.0.1/data' }] },
                },
                {
                  RelationshipType: { Name: 'Cites' },
                  // The link that came with the DOI is ignored: we always build the doi.org link
                  Target: {
                    Type: 'Dataset',
                    Title: 'Capitalised schema',
                    Identifier: [{ ID: '10.5555/Capital.DS', IDScheme: 'DOI', IDURL: 'http://10.0.0.5/steal' }],
                    Publisher: [{ Name: 'Capital Archive' }],
                    Creator: [{ Name: 'A. Author' }],
                    PublicationDate: '2020',
                  },
                  LinkProvider: [{ Name: 'Crossref' }],
                },
                { RelationshipType: { Name: 'IsRelatedTo' }, target: { Type: 'dataset', Title: 'No identifier at all', Identifier: [] } },
              ],
            }),
        ],
      ]);
      const unsafe = await queryScholexplorer({ doi: '10.5555/unsafe.paper' });
      assert.strictEqual(unsafe.records.length, 1);
      assert.strictEqual(unsafe.records[0].url, 'https://doi.org/10.5555/capital.ds');
      assert.strictEqual(unsafe.records[0].publisher, 'Capital Archive');
      assert.deepStrictEqual(unsafe.records[0].authors, ['A. Author']);
      assert.strictEqual(unsafe.records[0].relationshipDirection, 'reference');
      assert.strictEqual(unsafe.records[0].publicationYear, 2020);
      pass('ScholeXplorer: skips invalid DOIs and keyword calls, pages from 0, honours SCHOLEXPLORER_API_URL, drops unsafe links');
    }

    // =======================================================================
    // PART D: SEARCH ACROSS ALL SOURCES
    // =======================================================================
    console.log('--- 4. Global search and paper enrichment ---');

    // D1: all six sources, order, shape, the original four unchanged
    {
      const calls = installFetch(
        routesWith({
          ...ORIGINAL_SOURCE_PAYLOADS,
          [DATAVERSE]: () => jsonResponse(dataverseSearchResponse),
          [HUGGING_FACE]: () => jsonResponse(huggingFaceDatasetsResponse),
        })
      );
      const res = await searchGlobalDatasets({ query: 'd1 six sources', page: 1, limit: 15 });

      assert.deepStrictEqual(Object.keys(res).sort(), ['datasets', 'hasOutage', 'pagination', 'providerErrors', 'retrievedAt']);
      assert.deepStrictEqual(Object.keys(res.pagination).sort(), ['hasMore', 'limit', 'page', 'returnedCount']);
      assert.strictEqual(res.providerErrors, null);
      assert.strictEqual(res.hasOutage, false);
      assert.strictEqual(res.pagination.returnedCount, res.datasets.length);

      // Fixed order: the four original sources first, then Dataverse, then Hugging Face
      const order = [];
      for (const d of res.datasets) if (order[order.length - 1] !== d.source) order.push(d.source);
      assert.deepStrictEqual(order, ['DataCite', 'Zenodo', 'Figshare', 'Dryad', 'Harvard Dataverse', 'Hugging Face']);
      res.datasets.forEach((d) => assertBaseShape(d, `Global search (${d.source})`));

      // The original sources return exactly what they returned before
      for (const [source, expected] of Object.entries(EXPECTED_ORIGINAL_RECORDS)) {
        const got = res.datasets.filter((d) => d.source === source);
        assert.strictEqual(got.length, 1, `${source} must still contribute its record`);
        assert.deepStrictEqual(got[0], expected, `${source} record must be unchanged`);
      }

      // For a page of 15 each source is asked for 4, the same as before the new sources
      assert.ok(calls.find((c) => c.url.includes(DATACITE)).url.includes('page[size]=4'));
      assert.ok(calls.find((c) => c.url.includes(ZENODO)).url.includes('&size=4'));
      assert.strictEqual(JSON.parse(calls.find((c) => c.url.includes(FIGSHARE)).options.body).page_size, 4);
      assert.ok(calls.find((c) => c.url.includes(DRYAD)).url.includes('per_page=4'));
      assert.strictEqual(new URL(calls.find((c) => c.url.includes(DATAVERSE)).url).searchParams.get('per_page'), '4');
      assert.strictEqual(new URL(calls.find((c) => c.url.includes(HUGGING_FACE)).url).searchParams.get('limit'), '4');
      assert.strictEqual(res.datasets.filter((d) => d.source === 'Harvard Dataverse').length, 4);
      // 4 raw Hugging Face items were kept, one of them is disabled
      assert.strictEqual(res.datasets.filter((d) => d.source === 'Hugging Face').length, 3);

      // ScholeXplorer is not a keyword search and must not be asked
      assert.strictEqual(calls.filter((c) => c.url.includes(SCHOLEXPLORER)).length, 0);
      assert.strictEqual(calls.length, 6, 'Exactly one request per source');
      pass('Global search: six sources in a fixed order, same record fields, original four sources unchanged');
    }

    // D2: the same dataset from two sources appears once
    {
      installFetch(
        routesWith({
          [DATACITE]: () =>
            jsonResponse({
              data: [
                {
                  id: '10.57967/hf/9990001',
                  attributes: { doi: '10.57967/HF/9990001', url: 'https://huggingface.co/datasets/panther-fixtures/bangla-news-sentiment', titles: [{ title: 'Bangla News Sentiment (DataCite record)' }] },
                },
              ],
              meta: { total: 1 },
            }),
          [HUGGING_FACE]: () => jsonResponse(huggingFaceDatasetsResponse),
          [DATAVERSE]: () => jsonResponse(dataverseSearchResponse),
          [DRYAD]: () =>
            jsonResponse({
              total: 1,
              _embedded: { 'stash:datasets': [{ id: 9, identifier: 'doi:10.5072/FK2/PANTH1', title: 'Same DOI as a Dataverse record' }] },
            }),
        })
      );
      const res = await searchGlobalDatasets({ query: 'd2 duplicates', page: 1, limit: 30 });
      const dois = res.datasets.map((d) => d.doi).filter(Boolean);
      assert.strictEqual(new Set(dois).size, dois.length, 'No DOI may appear twice');
      const urls = res.datasets.map((d) => d.url.toLowerCase());
      assert.strictEqual(new Set(urls).size, urls.length, 'No link may appear twice');
      // The source that comes first in the fixed order keeps the record
      assert.strictEqual(res.datasets.find((d) => d.doi === '10.57967/HF/9990001' || d.doi === '10.57967/hf/9990001').source, 'DataCite');
      assert.strictEqual(res.datasets.find((d) => d.doi === '10.5072/fk2/panth1').source, 'Dryad');
      assert.ok(!res.datasets.some((d) => d.title === 'panther-fixtures/bangla-news-sentiment'));
      pass('Global search: a dataset returned by two sources is listed once');
    }

    // D3: one source failing never breaks the others; 429 is reported, not thrown
    {
      installFetch(
        routesWith({
          ...ORIGINAL_SOURCE_PAYLOADS,
          [HUGGING_FACE]: () => jsonResponse({ error: 'Too Many Requests' }, 429, { 'retry-after': '30' }),
          [DATAVERSE]: () => {
            throw new Error('connect ECONNREFUSED');
          },
        })
      );
      const res = await searchGlobalDatasets({ query: 'd3 partial failure', page: 1, limit: 15 });
      assert.deepStrictEqual(res.providerErrors, {
        'Harvard Dataverse': 'connect ECONNREFUSED',
        'Hugging Face': 'Hugging Face HTTP 429',
      });
      assert.strictEqual(res.hasOutage, false, 'Four working sources are not an outage');
      assert.deepStrictEqual(res.datasets.map((d) => d.source), ['DataCite', 'Zenodo', 'Figshare', 'Dryad']);

      // The other way round: all four original sources down, the two new ones still answer
      installFetch(
        routesWith({
          [DATACITE]: () => jsonResponse({}, 503),
          [ZENODO]: () => jsonResponse({}, 429),
          [FIGSHARE]: () => {
            throw new Error('socket hang up');
          },
          [DRYAD]: () => ({ ok: true, status: 200, headers: new Map(), json: async () => { throw new SyntaxError('Unexpected token <'); } }),
          [DATAVERSE]: () => jsonResponse(dataverseSearchResponse),
          [HUGGING_FACE]: () => jsonResponse(huggingFaceDatasetsResponse),
        })
      );
      const res2 = await searchGlobalDatasets({ query: 'd3 originals down', page: 1, limit: 15 });
      assert.deepStrictEqual(Object.keys(res2.providerErrors).sort(), ['DataCite', 'Dryad', 'Figshare', 'Zenodo']);
      assert.strictEqual(res2.providerErrors.Zenodo, 'Zenodo HTTP 429');
      assert.strictEqual(res2.hasOutage, false);
      assert.ok(res2.datasets.length > 0);
      assert.ok(res2.datasets.every((d) => ['Harvard Dataverse', 'Hugging Face'].includes(d.source)));

      // A timeout inside one source is contained in the same way
      installFetch([
        [
          HUGGING_FACE,
          () => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'TimeoutError';
            throw err;
          },
        ],
      ]);
      const timedOut = await queryHuggingFace({ query: 'slow', page: 1, size: 5 });
      assert.deepStrictEqual(timedOut, { records: [], totalCount: 0, hasMore: false, error: 'The operation was aborted due to timeout' });

      installFetch([[SCHOLEXPLORER, () => jsonResponse({}, 429)]]);
      const scholix429 = await queryScholexplorer({ doi: '10.5555/rate.limited' });
      assert.strictEqual(scholix429.error, 'OpenAIRE ScholeXplorer HTTP 429');
      installFetch([[DATAVERSE, () => jsonResponse({}, 429)]]);
      const dataverse429 = await queryDataverse({ query: 'rate limited' });
      assert.strictEqual(dataverse429.error, 'Harvard Dataverse HTTP 429');
      pass('Failure isolation: HTTP 429, 5xx, bad JSON, network errors and timeouts in one source leave the others working');
    }

    // D4: cache behaviour and total outage
    {
      let calls = installFetch(
        routesWith({
          ...ORIGINAL_SOURCE_PAYLOADS,
          [HUGGING_FACE]: () => jsonResponse(huggingFaceDatasetsResponse),
        })
      );
      const first = await searchGlobalDatasets({ query: 'd4 cached search', page: 1, limit: 15 });
      const callsAfterFirst = calls.length;
      assert.strictEqual(callsAfterFirst, 6);
      const second = await searchGlobalDatasets({ query: 'd4 cached search', page: 1, limit: 15 });
      assert.strictEqual(calls.length, callsAfterFirst, 'A repeated search must be answered from the cache');
      assert.deepStrictEqual(second, first);

      // Changing a cached answer must not change what the next visitor gets
      second.datasets.length = 0;
      const third = await searchGlobalDatasets({ query: 'd4 cached search', page: 1, limit: 15 });
      assert.strictEqual(third.datasets.length, first.datasets.length);

      // Another page is a different question
      await searchGlobalDatasets({ query: 'd4 cached search', page: 2, limit: 15 });
      assert.strictEqual(calls.length, callsAfterFirst + 6);

      // Every source down: reported as an outage and NOT remembered
      const allDown = Object.fromEntries(Object.keys(EMPTY).map((needle) => [needle, () => jsonResponse({}, 503)]));
      calls = installFetch(routesWith(allDown));
      const outage = await searchGlobalDatasets({ query: 'd4 total outage', page: 1, limit: 15 });
      assert.strictEqual(outage.hasOutage, true);
      assert.strictEqual(outage.datasets.length, 0);
      assert.strictEqual(Object.keys(outage.providerErrors).length, 6);
      const callsDuringOutage = calls.length;
      await searchGlobalDatasets({ query: 'd4 total outage', page: 1, limit: 15 });
      assert.strictEqual(calls.length, callsDuringOutage * 2, 'An outage must not be cached, the next search tries again');
      pass('Caching: repeated searches are served from memory as safe copies, a total outage is never cached');
    }

    // D5: paper enrichment
    {
      const PAPER = '10.5555/jfe.2021.0042';
      const calls = installFetch(
        routesWith({
          [DATACITE]: (url) =>
            url.includes('relatedIdentifiers')
              ? jsonResponse({
                  data: [
                    {
                      id: '10.5555/dc.supplement',
                      attributes: {
                        doi: '10.5555/dc.supplement',
                        url: 'https://zenodo.org/records/501',
                        titles: [{ title: 'DataCite supplement' }],
                        relatedIdentifiers: [{ relatedIdentifier: PAPER, relationType: 'IsSupplementTo' }],
                      },
                    },
                    {
                      id: '10.5555/census.2011.micro',
                      attributes: {
                        doi: '10.5555/census.2011.micro',
                        titles: [{ title: 'Population Census 2011 Microdata Sample (DataCite record)' }],
                        descriptions: [{ description: 'Rich description from DataCite.' }],
                        relatedIdentifiers: [{ relatedIdentifier: PAPER, relationType: 'IsReferencedBy' }],
                      },
                    },
                  ],
                  meta: { total: 2 },
                })
              : EMPTY[DATACITE](),
          [FIGSHARE]: (url, options) =>
            JSON.parse(options.body).search_for === PAPER
              ? jsonResponse([{ id: 77, title: 'Figshare copy of the untitled dataset', doi: '10.5555/dryad.fixture77', url_public_html: 'https://figshare.com/articles/dataset/x/77' }])
              : jsonResponse([]),
          [DATAVERSE]: () => jsonResponse(dataverseSearchResponse),
          [SCHOLEXPLORER]: () => jsonResponse(scholexplorerLinksResponse),
        })
      );

      const res = await enrichPaperDatasets({ paperId: 'd5-paper', doi: PAPER, title: 'Microcredit and School Enrolment in Rural Districts' });

      assert.deepStrictEqual(Object.keys(res).sort(), ['hasOutage', 'linkedDatasets', 'providerErrors', 'relatedDatasets', 'retrievedAt', 'totalCount']);
      assert.strictEqual(res.providerErrors, null);
      assert.strictEqual(res.hasOutage, false);
      assert.strictEqual(res.totalCount, res.linkedDatasets.length + res.relatedDatasets.length);
      [...res.linkedDatasets, ...res.relatedDatasets].forEach((d) => assertBaseShape(d, `Enrichment (${d.source})`));
      assert.ok(res.linkedDatasets.every((d) => d.isLinked === true));
      assert.ok(res.relatedDatasets.every((d) => d.isLinked === false));

      const linked = res.linkedDatasets.map((d) => `${d.source} | ${d.doi} | ${d.relationshipDirection}`);
      assert.deepStrictEqual(linked, [
        // Found by the original sources and Dataverse, in their usual order
        'DataCite | 10.5555/dc.supplement | supplemental',
        'Harvard Dataverse | 10.5072/fk2/panth2 | supplemental',
        // New from ScholeXplorer
        'OpenAIRE ScholeXplorer | 10.5555/zenodo.9900042 | supplemental',
        // Already returned by DataCite as "related": moved up, DataCite's richer record kept
        'DataCite | 10.5555/census.2011.micro | reference',
        // Already returned by Figshare as a keyword match: moved up with the declared relation
        'Figshare | 10.5555/dryad.fixture77 | associated',
      ]);

      const promotedDataCite = res.linkedDatasets[3];
      assert.strictEqual(promotedDataCite.description, 'Rich description from DataCite.');
      assert.ok(promotedDataCite.relationEvidence.startsWith('DataCite relation'), 'A declared DataCite relation keeps its own evidence text');
      const promotedFigshare = res.linkedDatasets[4];
      assert.strictEqual(promotedFigshare.relationType, 'Associated Resource');
      assert.ok(promotedFigshare.relationEvidence.includes('OpenAIRE ScholeXplorer'));

      const allDois = [...res.linkedDatasets, ...res.relatedDatasets].map((d) => d.doi).filter(Boolean);
      assert.strictEqual(new Set(allDois).size, allDois.length, 'A dataset must not be listed under both headings');
      assert.ok(res.relatedDatasets.some((d) => d.source === 'Harvard Dataverse'), 'Unverified Dataverse hits stay under "related"');

      // Hugging Face is never asked about a single paper; ScholeXplorer is asked once
      assert.strictEqual(calls.filter((c) => c.url.includes(HUGGING_FACE)).length, 0);
      assert.strictEqual(calls.filter((c) => c.url.includes(SCHOLEXPLORER)).length, 1);
      // Dataverse is asked twice: once for the DOI, once for words from the title
      assert.strictEqual(calls.filter((c) => c.url.includes(DATAVERSE)).length, 2);

      // The answer is cached
      const callsBefore = calls.length;
      const again = await enrichPaperDatasets({ paperId: 'd5-paper', doi: PAPER, title: 'Microcredit and School Enrolment in Rural Districts' });
      assert.strictEqual(calls.length, callsBefore);
      assert.deepStrictEqual(again, res);
      pass('Paper enrichment: ScholeXplorer links are filed as linked, duplicates are merged and promoted, Hugging Face is not asked');
    }

    // D6: enrichment when sources fail, and the original behaviour without the new sources
    {
      const PAPER = '10.5555/d6.paper';
      installFetch(
        routesWith({
          [DATACITE]: (url) =>
            url.includes('relatedIdentifiers')
              ? jsonResponse({
                  data: [
                    {
                      id: '10.5555/d6.supp',
                      attributes: { doi: '10.5555/d6.supp', titles: [{ title: 'D6 supplement' }], relatedIdentifiers: [{ relatedIdentifier: PAPER, relationType: 'IsSupplementTo' }] },
                    },
                    {
                      id: '10.5555/d6.cited',
                      attributes: { doi: '10.5555/d6.cited', titles: [{ title: 'D6 cited' }], relatedIdentifiers: [{ relatedIdentifier: PAPER, relationType: 'Cites' }] },
                    },
                  ],
                  meta: { total: 2 },
                })
              : EMPTY[DATACITE](),
          [SCHOLEXPLORER]: () => jsonResponse({}, 429),
          [DATAVERSE]: () => {
            throw new Error('getaddrinfo ENOTFOUND dataverse.harvard.edu');
          },
        })
      );
      const res = await enrichPaperDatasets({ paperId: 'd6-paper', doi: PAPER, title: 'Short' });
      assert.deepStrictEqual(res.providerErrors, {
        'Harvard Dataverse': 'getaddrinfo ENOTFOUND dataverse.harvard.edu',
        'OpenAIRE ScholeXplorer': 'OpenAIRE ScholeXplorer HTTP 429',
      });
      assert.strictEqual(res.hasOutage, false);
      // Exactly what the original code produced: supplement is linked, citation is related
      assert.deepStrictEqual(res.linkedDatasets.map((d) => [d.doi, d.relationType, d.isLinked]), [['10.5555/d6.supp', 'Direct Supplemental Dataset', true]]);
      assert.deepStrictEqual(res.relatedDatasets.map((d) => [d.doi, d.relationType, d.isLinked]), [['10.5555/d6.cited', 'Referenced Work / Citation', false]]);

      // Every source failing is an outage
      installFetch(routesWith(Object.fromEntries(Object.keys(EMPTY).map((needle) => [needle, () => jsonResponse({}, 500)]))));
      const outage = await enrichPaperDatasets({ paperId: 'd6-outage', doi: '10.5555/d6.outage', title: 'A Longer Title For The Outage Case' });
      assert.strictEqual(outage.hasOutage, true);
      assert.strictEqual(outage.totalCount, 0);
      assert.strictEqual(Object.keys(outage.providerErrors).length, 6);

      // A paper with nothing to look up is not an outage
      const calls = installFetch([]);
      const nothing = await enrichPaperDatasets({ paperId: 'd6-nothing', doi: null, title: '' });
      assert.strictEqual(nothing.hasOutage, false);
      assert.strictEqual(nothing.totalCount, 0);
      assert.strictEqual(calls.length, 0);
      pass('Paper enrichment: failing sources are reported per source, original linked/related rules are unchanged');
    }

    // =======================================================================
    // PART E: OFFLINE MODE (dataset sources)
    // =======================================================================
    console.log('--- 5. Offline mode ---');
    {
      process.env.OFFLINE_MODE = 'true';
      const calls = installFetch([]);

      const hf = await queryHuggingFace({ query: 'offline', page: 1, size: 5 });
      assert.strictEqual(hf.error, null);
      assert.strictEqual(hf.records.length, 3);
      assert.ok(hf.records.every((r) => r.source === 'Hugging Face'));
      assert.strictEqual((await queryHuggingFace({ query: 'offline', page: 2, size: 5 })).records.length, 0);

      const dv = await queryDataverse({ query: 'offline', page: 1, size: 5 });
      assert.strictEqual(dv.error, null);
      assert.strictEqual(dv.records.length, 4);
      assert.ok(dv.records.every((r) => r.source === 'Harvard Dataverse'));
      assert.strictEqual((await queryDataverse({ query: 'offline', page: 2, size: 5 })).records.length, 0);

      const sx = await queryScholexplorer({ doi: '10.5555/any.paper', page: 1, size: 5 });
      assert.strictEqual(sx.error, null);
      assert.strictEqual(sx.records.length, 3);
      assert.ok(sx.records.every((r) => r.source === 'OpenAIRE ScholeXplorer' && r.isLinked === true));

      const search = await searchGlobalDatasets({ query: 'e offline search', page: 1, limit: 12 });
      const sources = new Set(search.datasets.map((d) => d.source));
      assert.ok(sources.has('Hugging Face') && sources.has('Harvard Dataverse') && sources.has('DataCite'));
      assert.ok(!sources.has('OpenAIRE ScholeXplorer'));
      search.datasets.forEach((d) => assertBaseShape(d, `Offline search (${d.source})`));

      const enriched = await enrichPaperDatasets({ paperId: 'e-offline', doi: '10.5555/e.offline', title: 'Offline Enrichment Paper Title' });
      assert.ok(enriched.linkedDatasets.some((d) => d.source === 'OpenAIRE ScholeXplorer'));
      assert.strictEqual(enriched.providerErrors, null);

      assert.strictEqual(calls.length, 0, 'Offline mode must never touch the network');
      process.env.OFFLINE_MODE = 'false';
      pass('Offline mode: all three new sources answer from fixtures through the real mapping code, with no network use');
    }

    // =======================================================================
    // PART F: OPEN ACCESS FINDER (UNPAYWALL)
    // =======================================================================
    console.log('--- 6. Open Access Finder (Unpaywall) ---');
    const UNPAYWALL = 'api.unpaywall.org';
    process.env.UNPAYWALL_EMAIL = 'librarian@thesis-archive.test';

    // F1: reason "not_configured"
    {
      oaTesting.reset();
      const calls = installFetch([]);
      for (const value of [undefined, '', '   ', '—', 'not-an-email', 'two words@x.org']) {
        if (value === undefined) delete process.env.UNPAYWALL_EMAIL;
        else process.env.UNPAYWALL_EMAIL = value;
        assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/oa.gold.2023.001' }), { found: false, reason: 'not_configured' });
      }
      assert.strictEqual(calls.length, 0, 'Without an e-mail address Unpaywall must not be contacted');
      process.env.UNPAYWALL_EMAIL = 'librarian@thesis-archive.test';

      // Unpaywall refusing the address (HTTP 422) is the same setup problem, and is not cached
      const calls422 = installFetch([[UNPAYWALL, () => jsonResponse({ error: true, message: 'Please use your own email address' }, 422)]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/refused.email' }), { found: false, reason: 'not_configured' });
      await findOpenAccessPdf({ doi: '10.5555/refused.email' });
      assert.strictEqual(calls422.length, 2);
      pass("Finder reason 'not_configured': no address (or a refused one) means no lookup and no caching");
    }

    // F2: reason "invalid_doi"
    {
      oaTesting.reset();
      const calls = installFetch([]);
      for (const bad of [undefined, null, '', '   ', 'hello world', '10.1/x', 'https://example.org/paper.pdf', 42, { doi: 'x' }]) {
        assert.deepStrictEqual(await findOpenAccessPdf({ doi: bad }), { found: false, reason: 'invalid_doi' });
      }
      assert.deepStrictEqual(await findOpenAccessPdf({}), { found: false, reason: 'invalid_doi' });
      assert.deepStrictEqual(await findOpenAccessPdf(), { found: false, reason: 'invalid_doi' });
      assert.deepStrictEqual(await findOpenAccessPdf(null), { found: false, reason: 'invalid_doi' });
      assert.deepStrictEqual(await findOpenAccessPdf('10.5555/passed.as.text'), { found: false, reason: 'invalid_doi' });
      assert.strictEqual(calls.length, 0, 'Text that is not a DOI must not be sent anywhere');
      pass("Finder reason 'invalid_doi': anything that is not a DOI is refused without calling out");
    }

    // F3: found, best location's PDF; DOI normalisation; request address
    {
      oaTesting.reset();
      process.env.UNPAYWALL_EMAIL = 'li+brarian@thesis-archive.test';
      const calls = installFetch([[UNPAYWALL, () => jsonResponse(unpaywallOpenResponse)]]);
      const res = await findOpenAccessPdf({ doi: ' https://doi.org/10.5555/OA.Gold.2023.001. ' });
      assert.deepStrictEqual(res, {
        found: true,
        pdfUrl: 'https://journals.example.org/jfs/article/001/pdf',
        landingUrl: 'https://doi.org/10.5555/oa.gold.2023.001',
        license: 'cc-by',
        version: 'publishedVersion',
        hostType: 'publisher',
        repository: null,
        source: 'unpaywall',
      });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(
        calls[0].url,
        'https://api.unpaywall.org/v2/10.5555/oa.gold.2023.001?email=li%2Bbrarian%40thesis-archive.test',
        'The DOI is sent in canonical form and the e-mail address is encoded'
      );
      assert.ok(calls[0].options.signal instanceof AbortSignal, 'The request must be cancellable by the timeout');

      // Odd characters in a DOI cannot change the address that is called
      await findOpenAccessPdf({ doi: '10.5555/weird?x=1#frag' });
      assert.ok(calls[1].url.startsWith('https://api.unpaywall.org/v2/10.5555/weird%3Fx%3D1%23frag?email='));
      process.env.UNPAYWALL_EMAIL = 'librarian@thesis-archive.test';
      pass('Finder found: prefers best_oa_location.url_for_pdf, normalises the DOI, builds a safe request address');
    }

    // F4: found through fallbacks
    {
      oaTesting.reset();
      installFetch([[UNPAYWALL, () => jsonResponse(unpaywallRepositoryFallbackResponse)]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/oa.green.2020.017' }), {
        found: true,
        pdfUrl: 'https://repository.example.edu/bitstream/1234/5678/1/manuscript.pdf',
        landingUrl: 'https://repository.example.edu/handle/1234/5678',
        license: 'cc-by-nc',
        version: 'acceptedVersion',
        hostType: 'repository',
        repository: 'Example University - Institutional Repository',
        source: 'unpaywall',
      });

      // No PDF anywhere: a page where the paper can be read for free still counts
      installFetch([[UNPAYWALL, () => jsonResponse(unpaywallLandingOnlyResponse)]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/oa.bronze.2019.003' }), {
        found: true,
        pdfUrl: null,
        landingUrl: 'https://publisher.example.com/articles/green-2020-17',
        license: null,
        version: 'publishedVersion',
        hostType: 'publisher',
        repository: null,
        source: 'unpaywall',
      });

      // No best_oa_location at all, only the list
      installFetch([[UNPAYWALL, () => jsonResponse({ ...unpaywallRepositoryFallbackResponse, best_oa_location: null })]]);
      const listOnly = await findOpenAccessPdf({ doi: '10.5555/list.only' });
      assert.strictEqual(listOnly.pdfUrl, 'https://repository.example.edu/bitstream/1234/5678/1/manuscript.pdf');
      pass('Finder found: falls back to another location with a PDF, then to a free-to-read landing page');
    }

    // F5: unsafe links from Unpaywall are never returned
    {
      oaTesting.reset();
      const unsafeBest = { ...unpaywallOpenResponse.best_oa_location, url: 'http://169.254.169.254/latest/meta-data/', url_for_pdf: 'http://169.254.169.254/latest/meta-data/', url_for_landing_page: 'javascript:alert(1)' };
      const safeSecond = { ...unpaywallRepositoryFallbackResponse.oa_locations[1] };
      installFetch([[UNPAYWALL, () => jsonResponse({ ...unpaywallOpenResponse, best_oa_location: unsafeBest, oa_locations: [unsafeBest, safeSecond] })]]);
      const skipped = await findOpenAccessPdf({ doi: '10.5555/unsafe.best' });
      assert.strictEqual(skipped.found, true);
      assert.strictEqual(skipped.pdfUrl, 'https://repository.example.edu/bitstream/1234/5678/1/manuscript.pdf', 'An unsafe link is skipped in favour of the next safe one');
      assert.strictEqual(skipped.hostType, 'repository', 'The details must describe the copy that was actually chosen');

      // A safe PDF with an unsafe landing page keeps the PDF and blanks the landing page
      const mixed = { ...unpaywallOpenResponse.best_oa_location, url_for_landing_page: 'http://localhost:8080/admin' };
      installFetch([[UNPAYWALL, () => jsonResponse({ ...unpaywallOpenResponse, best_oa_location: mixed, oa_locations: [mixed] })]]);
      const mixedRes = await findOpenAccessPdf({ doi: '10.5555/unsafe.landing' });
      assert.strictEqual(mixedRes.pdfUrl, 'https://journals.example.org/jfs/article/001/pdf');
      assert.strictEqual(mixedRes.landingUrl, null);

      // Nothing safe at all
      const hostile = [
        'http://127.0.0.1/a.pdf',
        'http://localhost/a.pdf',
        'http://10.1.2.3/a.pdf',
        'http://192.168.0.9/a.pdf',
        'http://172.16.5.5/a.pdf',
        'http://[::1]/a.pdf',
        'http://[fe80::1]/a.pdf',
        'http://[fd12:3456::1]/a.pdf',
        'http://[::ffff:127.0.0.1]/a.pdf',
        'http://2130706433/a.pdf',
        'http://intranet/a.pdf',
        'http://printer.local/a.pdf',
        'http://vault.internal/a.pdf',
        'https://user:secret@example.org/a.pdf',
        'ftp://example.org/a.pdf',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '//example.org/a.pdf',
        'not a url',
        '',
        null,
        12345,
      ];
      for (const bad of hostile) {
        assert.strictEqual(oaTesting.isSafePublicUrl(bad), false, `Link must be refused: ${String(bad)}`);
      }
      for (const good of ['https://journals.example.org/a.pdf', 'http://repository.example.edu/handle/1', 'https://arxiv.org/pdf/1706.03762', 'https://8.8.8.8/a.pdf']) {
        assert.strictEqual(oaTesting.isSafePublicUrl(good), true, `Link must be accepted: ${good}`);
      }
      const allBad = hostile.slice(0, 4).map((u) => ({ ...unpaywallOpenResponse.best_oa_location, url: u, url_for_pdf: u, url_for_landing_page: u }));
      installFetch([[UNPAYWALL, () => jsonResponse({ ...unpaywallOpenResponse, best_oa_location: allBad[0], oa_locations: allBad })]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/unsafe.all' }), { found: false, reason: 'no_open_copy' });
      pass('Finder safety: private, local, credential-carrying and non-http links are never returned');
    }

    // F6: reason "no_open_copy"
    {
      oaTesting.reset();
      installFetch([[UNPAYWALL, () => jsonResponse(unpaywallClosedResponse)]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/closed.2022.009' }), { found: false, reason: 'no_open_copy' });
      installFetch([[UNPAYWALL, () => jsonResponse({ doi: '10.5555/bare', is_oa: false })]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/bare' }), { found: false, reason: 'no_open_copy' });
      pass("Finder reason 'no_open_copy': a known paper with no free copy");
    }

    // F7: reason "not_found"
    {
      oaTesting.reset();
      installFetch([[UNPAYWALL, () => jsonResponse(unpaywallNotFoundBody, 404)]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/unknown.doi' }), { found: false, reason: 'not_found' });
      pass("Finder reason 'not_found': Unpaywall does not know the DOI (HTTP 404)");
    }

    // F8: reason "rate_limited" and the pause that follows
    {
      oaTesting.reset();
      let calls = installFetch([[UNPAYWALL, () => jsonResponse({ error: true }, 429, { 'retry-after': '120' })]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/rate.one' }), { found: false, reason: 'rate_limited' });
      assert.strictEqual(calls.length, 1);

      // While paused, other DOIs are answered at once without calling Unpaywall
      calls = installFetch([[UNPAYWALL, () => jsonResponse(unpaywallOpenResponse)]]);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/rate.two' }), { found: false, reason: 'rate_limited' });
      assert.strictEqual(calls.length, 0, 'No requests while Unpaywall has asked us to wait');

      // After the wait (2 minutes as asked) lookups resume, and the 429 itself was not cached
      const realNow = Date.now;
      Date.now = () => realNow() + 121 * 1000;
      const resumed = await findOpenAccessPdf({ doi: '10.5555/rate.one' });
      Date.now = realNow;
      assert.strictEqual(resumed.found, true);
      assert.strictEqual(calls.length, 1);

      // An absurd Retry-After is capped at ten minutes; a missing one means one minute
      oaTesting.reset();
      installFetch([[UNPAYWALL, () => jsonResponse({}, 429, { 'retry-after': '999999' })]]);
      await findOpenAccessPdf({ doi: '10.5555/rate.three' });
      calls = installFetch([[UNPAYWALL, () => jsonResponse(unpaywallOpenResponse)]]);
      Date.now = () => realNow() + 11 * 60 * 1000;
      assert.strictEqual((await findOpenAccessPdf({ doi: '10.5555/rate.three' })).found, true);
      Date.now = realNow;

      oaTesting.reset();
      installFetch([[UNPAYWALL, () => ({ ok: false, status: 429, json: async () => ({}) })]]);
      await findOpenAccessPdf({ doi: '10.5555/rate.four' });
      calls = installFetch([[UNPAYWALL, () => jsonResponse(unpaywallOpenResponse)]]);
      Date.now = () => realNow() + 30 * 1000;
      assert.strictEqual((await findOpenAccessPdf({ doi: '10.5555/rate.four' })).reason, 'rate_limited');
      Date.now = () => realNow() + 61 * 1000;
      assert.strictEqual((await findOpenAccessPdf({ doi: '10.5555/rate.four' })).found, true);
      Date.now = realNow;
      pass("Finder reason 'rate_limited': HTTP 429 pauses all lookups for the time asked (capped), then resumes");
    }

    // F9: reason "unavailable", never throws, never cached
    {
      oaTesting.reset();
      const failures = {
        'HTTP 500': () => jsonResponse({}, 500),
        'HTTP 503': () => jsonResponse({}, 503),
        'HTTP 403': () => jsonResponse({}, 403),
        'network error': () => {
          throw new TypeError('fetch failed');
        },
        'body is not JSON': () => ({ ok: true, status: 200, headers: new Map(), json: async () => { throw new SyntaxError('Unexpected token <'); } }),
        'body is null': () => jsonResponse(null),
        'body is a list': () => jsonResponse([]),
        'answer has no usable parts': () => ({}),
      };
      let n = 0;
      for (const [label, handler] of Object.entries(failures)) {
        n += 1;
        const calls = installFetch([[UNPAYWALL, handler]]);
        const doi = `10.5555/unavailable.${n}`;
        assert.deepStrictEqual(await findOpenAccessPdf({ doi }), { found: false, reason: 'unavailable' }, `Case: ${label}`);
        await findOpenAccessPdf({ doi });
        assert.strictEqual(calls.length, 2, `"unavailable" must not be cached, so the next click tries again (${label})`);
      }
      assert.strictEqual(oaTesting.cacheSize(), 0);

      // A real timeout: the request is cancelled and reported as unavailable
      oaTesting.setTimeoutMs(40);
      let sawAbort = false;
      installFetch([
        [
          UNPAYWALL,
          (url, options) =>
            new Promise((resolve, reject) => {
              options.signal.addEventListener('abort', () => {
                sawAbort = true;
                const err = new Error('This operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }),
        ],
      ]);
      const started = originalDateNow();
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/slow.server' }), { found: false, reason: 'unavailable' });
      assert.ok(sawAbort, 'The slow request must be cancelled');
      assert.ok(originalDateNow() - started < 2000, 'The timeout must cut the wait short');
      pass("Finder reason 'unavailable': server errors, network errors, bad bodies and timeouts never throw and are not cached");
    }

    // F10: cache (positive, negative, expiry, size cap, safe copies)
    {
      oaTesting.reset();
      const realNow = Date.now;

      // Positive
      let calls = installFetch([[UNPAYWALL, () => jsonResponse(unpaywallOpenResponse)]]);
      const first = await findOpenAccessPdf({ doi: '10.5555/cache.positive' });
      first.pdfUrl = 'https://tampered.example.org/x.pdf';
      const second = await findOpenAccessPdf({ doi: 'DOI:10.5555/CACHE.Positive' });
      assert.strictEqual(calls.length, 1, 'The same DOI in another spelling is answered from the cache');
      assert.strictEqual(second.pdfUrl, 'https://journals.example.org/jfs/article/001/pdf', 'Editing a result must not change the stored copy');

      // Negative: "no free copy" and "unknown DOI" are remembered too
      calls = installFetch([[UNPAYWALL, (url) => (url.includes('cache.missing') ? jsonResponse(unpaywallNotFoundBody, 404) : jsonResponse(unpaywallClosedResponse))]]);
      await findOpenAccessPdf({ doi: '10.5555/cache.closed' });
      await findOpenAccessPdf({ doi: '10.5555/cache.missing' });
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/cache.closed' }), { found: false, reason: 'no_open_copy' });
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/cache.missing' }), { found: false, reason: 'not_found' });
      assert.strictEqual(calls.length, 2);

      // Expiry: negative answers go first, positive ones last longer
      assert.ok(oaTesting.NEGATIVE_TTL_MS < oaTesting.POSITIVE_TTL_MS);
      calls = installFetch([[UNPAYWALL, () => jsonResponse(unpaywallOpenResponse)]]);
      Date.now = () => realNow() + oaTesting.NEGATIVE_TTL_MS + 1000;
      assert.strictEqual((await findOpenAccessPdf({ doi: '10.5555/cache.closed' })).found, true, 'An expired "no copy" answer is looked up again');
      assert.strictEqual(calls.length, 1);
      await findOpenAccessPdf({ doi: '10.5555/cache.positive' });
      assert.strictEqual(calls.length, 1, 'A "found" answer is still remembered at that point');
      Date.now = () => realNow() + oaTesting.POSITIVE_TTL_MS + 1000;
      await findOpenAccessPdf({ doi: '10.5555/cache.positive' });
      assert.strictEqual(calls.length, 2, 'An expired "found" answer is looked up again');
      Date.now = realNow;

      // Size cap: the oldest answers make room for new ones
      oaTesting.reset();
      calls = installFetch([[UNPAYWALL, () => jsonResponse(unpaywallOpenResponse)]]);
      const total = oaTesting.MAX_CACHE_ENTRIES + 5;
      for (let i = 0; i < total; i += 1) {
        await findOpenAccessPdf({ doi: `10.5555/cap.${i}` });
      }
      assert.strictEqual(oaTesting.cacheSize(), oaTesting.MAX_CACHE_ENTRIES, 'The cache must never grow past its cap');
      assert.strictEqual(calls.length, total);
      await findOpenAccessPdf({ doi: `10.5555/cap.${total - 1}` });
      assert.strictEqual(calls.length, total, 'The newest answer is still cached');
      await findOpenAccessPdf({ doi: '10.5555/cap.0' });
      assert.strictEqual(calls.length, total + 1, 'The oldest answer was dropped and is looked up again');
      assert.strictEqual(oaTesting.cacheSize(), oaTesting.MAX_CACHE_ENTRIES);
      pass('Finder cache: positive and negative answers are remembered, expire on time, and the cache size is capped');
    }

    // F11: offline mode
    {
      oaTesting.reset();
      process.env.OFFLINE_MODE = 'true';
      delete process.env.UNPAYWALL_EMAIL; // offline mode needs no configuration
      const calls = installFetch([]);

      const open = await findOpenAccessPdf({ doi: '10.5555/any.offline.paper' });
      assert.strictEqual(open.found, true);
      assert.strictEqual(open.pdfUrl, 'https://journals.example.org/jfs/article/001/pdf');
      assert.strictEqual(open.source, 'unpaywall');
      assert.strictEqual((await findOpenAccessPdf({ doi: '10.5555/oa.green.2020.017' })).hostType, 'repository');
      assert.strictEqual((await findOpenAccessPdf({ doi: '10.5555/oa.bronze.2019.003' })).pdfUrl, null);
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/closed.2022.009' }), { found: false, reason: 'no_open_copy' });
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: '10.5555/unknown.doi' }), { found: false, reason: 'not_found' });
      assert.deepStrictEqual(await findOpenAccessPdf({ doi: 'nonsense' }), { found: false, reason: 'invalid_doi' });
      assert.strictEqual(calls.length, 0, 'Offline mode must never touch the network');
      pass('Finder offline mode: deterministic fixture answers with no network use and no configuration');
    }
  } finally {
    // Put everything back exactly as it was, even if a test failed.
    global.fetch = originalFetch;
    Date.now = originalDateNow;
    oaTesting.reset();
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  console.log(`✓ All ${passed}/${passed} New Dataset Source & Open Access Finder Tests PASSED.\n`);
}

module.exports = { runDatasetSourcesAndOaFinderTests };

if (require.main === module) {
  runDatasetSourcesAndOaFinderTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
