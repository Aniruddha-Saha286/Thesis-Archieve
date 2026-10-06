/**
 * Fixtures for the three newer dataset sources in services/datasetDiscoveryService.js:
 * Hugging Face, Harvard Dataverse and OpenAIRE ScholeXplorer.
 *
 * These are hand-built to the shape of the real responses. They are NOT captures of live
 * calls: the test machine cannot reach these APIs, and every dataset, person and DOI below
 * is made up (DOIs use the 10.5555 / 10.5072 / 10.57967 test-style prefixes).
 *
 * The same objects are used in two places:
 *   1. tests/datasetSourcesAndOaFinder.test.js feeds them to a stubbed fetch, so the real
 *      mapping code runs.
 *   2. The service reads them when OFFLINE_MODE=true, so the deterministic test run gets
 *      records from these sources without touching the network.
 *
 * Where each shape comes from:
 *   - Hugging Face: key names and value types were checked against live responses of
 *     GET https://huggingface.co/api/datasets?search=...&full=true (October 2026).
 *     The "doi:..." tag is assumed from memory, it was not in the responses checked.
 *   - Harvard Dataverse: envelope and dataset item copied from the example in the official
 *     Search API guide (guides.dataverse.org). "keywords" and "publications" are assumed:
 *     they are real Dataverse fields but were not in the example that was checked.
 *   - ScholeXplorer: copied from the example response in the OpenAIRE Graph documentation
 *     (lower-case "source"/"target", "Creator[].name", "Publisher[].name").
 */

// GET https://huggingface.co/api/datasets?search=<q>&limit=<n>&full=true&sort=downloads&direction=-1
// The response is a bare array, most downloaded first.
const huggingFaceDatasetsResponse = [
  // [0] Everything filled in, including a DOI tag and a file-format tag.
  {
    _id: '64f0a1b2c3d4e5f601234501',
    id: 'panther-fixtures/bangla-news-sentiment',
    author: 'panther-fixtures',
    cardData: {
      annotations_creators: ['expert-generated'],
      language: ['bn', 'en'],
      license: 'cc-by-4.0',
      multilinguality: 'multilingual',
      size_categories: ['1K<n<10K'],
      task_categories: ['text-classification'],
      task_ids: ['sentiment-classification'],
      pretty_name: 'Bangla News Sentiment',
      tags: ['news'],
    },
    disabled: false,
    gated: false,
    lastModified: '2025-07-06T14:05:59.000Z',
    likes: 38,
    private: false,
    sha: '7261898ee3b9a739595e8dbf41df6b2332f429bb',
    // The Hub builds this from the README, which is why it starts with heading text and
    // is full of tabs and line breaks.
    description:
      '\n\t\n\t\t\n\t\tDataset Card for "bangla-news-sentiment"\n\t\n\n\n\t\n\t\t\n\t\tDataset Summary\n\t\n\nNews headlines in Bangla and English labelled as positive, negative or neutral.\nBuilt for sentiment classification experiments.',
    downloads: 7730,
    paperswithcode_id: null,
    tags: [
      'task_categories:text-classification',
      'task_ids:sentiment-classification',
      'annotations_creators:expert-generated',
      'multilinguality:multilingual',
      'language:bn',
      'language:en',
      'license:cc-by-4.0',
      'size_categories:10K<n<100K',
      'format:parquet',
      'modality:text',
      'library:datasets',
      'library:pandas',
      'doi:10.57967/hf/9990001',
      'region:us',
    ],
    createdAt: '2022-05-26T18:07:50.000Z',
    key: '',
  },
  // [1] A bare repository: no card data, no description, no licence tag.
  {
    _id: '64f0a1b2c3d4e5f601234502',
    id: 'panther-fixtures/untitled-upload',
    author: 'panther-fixtures',
    disabled: false,
    gated: false,
    lastModified: '2024-01-04T12:09:45.000Z',
    likes: 0,
    private: false,
    sha: 'de6188e66fd45b975dfaef454eae6ba38e1c9f32',
    downloads: 12,
    tags: ['region:us'],
    createdAt: '2024-01-04T12:01:00.000Z',
    key: '',
  },
  // [2] Access must be requested (gated), and the licence only appears in the card data,
  //     as a list. Some cards write it as a list and some as a single string.
  {
    _id: '64f0a1b2c3d4e5f601234503',
    id: 'panther-fixtures/clinical-notes-gated',
    author: 'panther-fixtures',
    cardData: {
      language: ['en'],
      license: ['other'],
      size_categories: ['n<1K'],
      task_categories: ['token-classification', 'summarization'],
      pretty_name: 'Clinical Notes (gated)',
    },
    disabled: false,
    gated: 'manual',
    lastModified: '2023-11-20T09:30:00.000Z',
    likes: 5,
    private: false,
    sha: '0f1e2d3c4b5a69788796a5b4c3d2e1f001234567',
    description: 'De-identified <b>clinical</b> notes. Access is granted on request.',
    downloads: 301,
    tags: [
      'task_categories:token-classification',
      'task_categories:summarization',
      'language:en',
      'size_categories:n<1K',
      'modality:text',
      'region:us',
    ],
    createdAt: '2023-10-01T08:00:00.000Z',
    key: '',
  },
  // [3] Switched off by the Hub. The link would not open, so the mapper must skip it.
  {
    _id: '64f0a1b2c3d4e5f601234504',
    id: 'panther-fixtures/taken-down',
    author: 'panther-fixtures',
    disabled: true,
    gated: false,
    lastModified: '2023-02-02T00:00:00.000Z',
    likes: 1,
    private: false,
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    description: 'Removed.',
    downloads: 4,
    tags: ['region:us'],
    createdAt: '2023-01-01T00:00:00.000Z',
    key: '',
  },
  // [4] A broken record with no id. No link can be built, so the mapper must skip it.
  {
    _id: '64f0a1b2c3d4e5f601234505',
    author: 'panther-fixtures',
    disabled: false,
    gated: false,
    private: false,
    downloads: 0,
    likes: 0,
    tags: [],
    key: '',
  },
];

// GET https://dataverse.harvard.edu/api/search?q=<q>&type=dataset&per_page=<n>&start=<offset>
const dataverseSearchResponse = {
  status: 'OK',
  data: {
    q: 'household survey',
    total_count: 37,
    start: 0,
    spelling_alternatives: {},
    items: [
      // [0] The usual case: a DOI, an https://doi.org link and every field present.
      {
        name: 'Replication Data for: Rural Household Survey 2019',
        type: 'dataset',
        url: 'https://doi.org/10.5072/FK2/PANTH1',
        global_id: 'doi:10.5072/FK2/PANTH1',
        description:
          'Household-level survey data covering income, schooling and health in <i>rural</i> districts.',
        published_at: '2019-12-11T15:26:10Z',
        publisher: 'Panther Fixtures Dataverse',
        citationHtml:
          'Rahman, Farhana; Hossain, Anwar, 2019, "Replication Data for: Rural Household Survey 2019", <a href="https://doi.org/10.5072/FK2/PANTH1" target="_blank">https://doi.org/10.5072/FK2/PANTH1</a>, Harvard Dataverse, V3',
        identifier_of_dataverse: 'panther-fixtures',
        name_of_dataverse: 'Panther Fixtures Dataverse',
        citation:
          'Rahman, Farhana; Hossain, Anwar, 2019, "Replication Data for: Rural Household Survey 2019", https://doi.org/10.5072/FK2/PANTH1, Harvard Dataverse, V3',
        publicationStatuses: ['Published'],
        storageIdentifier: 's3://10.5072/FK2/PANTH1',
        subjects: ['Social Sciences', 'Other'],
        fileCount: 3,
        versionId: 1260,
        versionState: 'RELEASED',
        majorVersion: 3,
        minorVersion: 0,
        createdAt: '2019-09-20T18:08:29Z',
        updatedAt: '2019-12-11T15:26:10Z',
        contacts: [{ name: 'Rahman, Farhana', affiliation: 'Example University' }],
        producers: ['Example Survey Unit'],
        authors: ['Rahman, Farhana', 'Hossain, Anwar'],
      },
      // [1] Names the journal article it belongs to ("publications"). When a paper with
      //     that DOI asks for its datasets, this is real evidence of a link.
      {
        name: 'Replication Data for: Microcredit and School Enrolment',
        type: 'dataset',
        url: 'https://doi.org/10.5072/FK2/PANTH2',
        global_id: 'doi:10.5072/FK2/PANTH2',
        description: 'Stata files and code to reproduce every table in the article.',
        published_at: '2021-03-02T09:00:00Z',
        publisher: 'Journal of Fixture Economics Dataverse',
        identifier_of_dataverse: 'jfe',
        name_of_dataverse: 'Journal of Fixture Economics Dataverse',
        citation:
          'Akter, Nusrat, 2021, "Replication Data for: Microcredit and School Enrolment", https://doi.org/10.5072/FK2/PANTH2, Harvard Dataverse, V1',
        publicationStatuses: ['Published'],
        storageIdentifier: 's3://10.5072/FK2/PANTH2',
        subjects: ['Social Sciences'],
        fileCount: 1,
        versionId: 2311,
        versionState: 'RELEASED',
        majorVersion: 1,
        minorVersion: 0,
        createdAt: '2021-02-20T10:00:00Z',
        updatedAt: '2021-03-02T09:00:00Z',
        contacts: [{ name: 'Akter, Nusrat', affiliation: '' }],
        keywords: ['microcredit', 'education'],
        publications: [
          {
            citation: 'Akter, Nusrat. 2021. "Microcredit and School Enrolment." Journal of Fixture Economics 12 (1): 1-20.',
            url: 'https://doi.org/10.5555/jfe.2021.0042',
          },
        ],
        authors: ['Akter, Nusrat'],
      },
      // [2] An older dataset identified by a Handle instead of a DOI. hdl.handle.net is not
      //     on our list of approved link hosts, so the service links to the dataset's page
      //     on Harvard Dataverse instead.
      {
        name: 'National Election Panel, 1996',
        type: 'dataset',
        url: 'https://hdl.handle.net/1902.1/PANTH3',
        global_id: 'hdl:1902.1/PANTH3',
        description: 'Three-wave panel study of voters.',
        published_at: '2008-01-15T00:00:00Z',
        publisher: 'Harvard Dataverse',
        identifier_of_dataverse: 'harvard',
        name_of_dataverse: 'Harvard Dataverse',
        publicationStatuses: ['Published'],
        subjects: ['Social Sciences'],
        fileCount: 12,
        versionState: 'RELEASED',
        majorVersion: 2,
        minorVersion: 1,
        createdAt: '2008-01-10T00:00:00Z',
        updatedAt: '2014-06-01T00:00:00Z',
        authors: ['Example Election Study Group'],
      },
      // [3] Nearly empty: no description, no dates, no authors, no file count.
      {
        name: 'Untitled deposit',
        type: 'dataset',
        url: 'https://doi.org/10.5072/FK2/PANTH4',
        global_id: 'doi:10.5072/FK2/PANTH4',
        publicationStatuses: ['Published'],
        versionState: 'RELEASED',
      },
      // [4] Not a dataset. We ask for type=dataset, but the mapper checks anyway.
      {
        name: 'codebook.pdf',
        type: 'file',
        url: 'https://dataverse.harvard.edu/api/access/datafile/9900001',
        file_id: '9900001',
        description: 'Codebook',
        published_at: '2019-12-11T15:26:10Z',
        file_type: 'Adobe PDF',
        file_content_type: 'application/pdf',
        size_in_bytes: 104857,
        dataset_name: 'Replication Data for: Rural Household Survey 2019',
        dataset_persistent_id: 'doi:10.5072/FK2/PANTH1',
      },
    ],
    count_in_response: 5,
  },
};

// GET https://api.scholexplorer.openaire.eu/v2/Links?sourcePid=<paper doi>&targetType=dataset
// Every entry is one link FROM the paper ("source") TO another research output ("target").
const SCHOLIX_PAPER = {
  Identifier: [
    {
      ID: '10.5555/jfe.2021.0042',
      IDScheme: 'doi',
      IDURL: 'https://doi.org/10.5555/jfe.2021.0042',
    },
    {
      ID: '50|doi_________::368a80d3c098d7b866752a75f97f3aba',
      IDScheme: 'openaireIdentifier',
      IDURL: null,
    },
  ],
  Title: 'Microcredit and School Enrolment',
  Type: 'literature',
  Creator: [
    {
      name: 'Nusrat Akter',
      identifier: [{ ID: '0000-0001-0000-0001', IDScheme: 'orcid_pending', IDURL: null }],
    },
  ],
  PublicationDate: '2021-03-01',
  Publisher: [
    {
      name: 'Journal of Fixture Economics',
      identifier: [
        { ID: '10|issn___print::802fba3b33fd96b1daf4235f3038adf7', IDScheme: 'OpenAIRE Identifier', IDURL: null },
      ],
    },
  ],
};

const scholexplorerLinksResponse = {
  currentPage: 0,
  totalLinks: 6,
  totalPages: 1,
  result: [
    // [0] The paper only mentions this dataset in its reference list.
    {
      RelationshipType: { Name: 'References', SubType: null, SubTypeSchema: null },
      source: SCHOLIX_PAPER,
      target: {
        Identifier: [
          { ID: '10.5555/census.2011.micro', IDScheme: 'doi', IDURL: 'https://doi.org/10.5555/census.2011.micro' },
        ],
        Title: 'Population Census 2011 Microdata Sample',
        Type: 'dataset',
        Creator: [{ name: 'Example Bureau of Statistics', identifier: [] }],
        PublicationDate: '2013-06-30',
        Publisher: [{ name: 'Example Data Archive', identifier: [] }],
      },
      HarvestDate: '2024-05-15',
      LicenseURL: null,
      LinkProvider: [{ name: 'Crossref', identifier: [] }],
      LinkPublicationDate: '2021-03-05',
    },
    // [1] The strongest kind of link: this dataset is the paper's own supplementary data.
    {
      RelationshipType: { Name: 'IsSupplementedBy', SubType: 'IsSupplementedBy', SubTypeSchema: 'datacite' },
      source: SCHOLIX_PAPER,
      target: {
        Identifier: [
          { ID: '10.5555/zenodo.9900042', IDScheme: 'doi', IDURL: 'https://doi.org/10.5555/zenodo.9900042' },
          { ID: '50|doi_________::aaaa80d3c098d7b866752a75f97f3aba', IDScheme: 'openaireIdentifier', IDURL: null },
        ],
        Title: 'Survey data for: Microcredit and School Enrolment',
        Type: 'dataset',
        Creator: [
          { name: 'Nusrat Akter', identifier: [] },
          { name: 'Imran Chowdhury', identifier: [] },
        ],
        PublicationDate: '2021-02-18',
        Publisher: [{ name: 'Zenodo', identifier: [] }],
      },
      HarvestDate: '2024-05-15',
      LicenseURL: null,
      LinkProvider: [{ name: 'DataCite', identifier: [] }],
      LinkPublicationDate: '2021-02-18',
    },
    // [2] A link to another paper, not a dataset. The mapper must skip it.
    {
      RelationshipType: { Name: 'IsRelatedTo', SubType: 'cites', SubTypeSchema: 'datacite' },
      source: SCHOLIX_PAPER,
      target: {
        Identifier: [
          { ID: '10.5555/other.paper.7', IDScheme: 'doi', IDURL: 'https://doi.org/10.5555/other.paper.7' },
        ],
        Title: 'An Earlier Study of Microcredit',
        Type: 'literature',
        PublicationDate: '2015-01-01',
        Publisher: [{ name: 'Another Journal', identifier: [] }],
      },
      HarvestDate: '2024-05-15',
      LicenseURL: null,
      LinkProvider: [{ name: 'Crossref', identifier: [] }],
      LinkPublicationDate: '2021-03-05',
    },
    // [3] A dataset known only by a database accession number. Its link goes to a site
    //     that is not on our list of approved hosts, so it is dropped.
    {
      RelationshipType: { Name: 'IsRelatedTo', SubType: null, SubTypeSchema: null },
      source: SCHOLIX_PAPER,
      target: {
        Identifier: [
          { ID: 'PRJEB990001', IDScheme: 'ena', IDURL: 'https://www.ebi.ac.uk/ena/browser/view/PRJEB990001' },
        ],
        Title: 'Sequencing project PRJEB990001',
        Type: 'dataset',
        PublicationDate: '2020-10-10',
        Publisher: [{ name: 'European Nucleotide Archive', identifier: [] }],
      },
      HarvestDate: '2024-05-15',
      LicenseURL: null,
      LinkProvider: [{ name: 'EMBL-EBI', identifier: [] }],
      LinkPublicationDate: '2020-10-10',
    },
    // [4] The same dataset as [1], reported a second time by a different link provider
    //     with a weaker relation. Only one entry must come out, with the stronger relation.
    {
      RelationshipType: { Name: 'IsRelatedTo', SubType: null, SubTypeSchema: null },
      source: SCHOLIX_PAPER,
      target: {
        Identifier: [
          { ID: '10.5555/ZENODO.9900042', IDScheme: 'doi', IDURL: 'https://doi.org/10.5555/ZENODO.9900042' },
        ],
        Title: 'Survey data for: Microcredit and School Enrolment',
        Type: 'dataset',
        PublicationDate: '2021-02-18',
        Publisher: [{ name: 'Zenodo', identifier: [] }],
      },
      HarvestDate: '2024-05-15',
      LicenseURL: null,
      LinkProvider: [{ name: 'OpenAIRE', identifier: [] }],
      LinkPublicationDate: '2021-04-01',
    },
    // [5] A dataset with no title, no publisher and no date.
    {
      RelationshipType: { Name: 'IsRelatedTo', SubType: null, SubTypeSchema: null },
      source: SCHOLIX_PAPER,
      target: {
        Identifier: [
          { ID: '10.5555/dryad.fixture77', IDScheme: 'doi', IDURL: 'https://doi.org/10.5555/dryad.fixture77' },
        ],
        Title: null,
        Type: 'dataset',
      },
      HarvestDate: '2024-05-15',
      LicenseURL: null,
      LinkProvider: [{ name: 'DataCite', identifier: [] }],
      LinkPublicationDate: '2022-01-01',
    },
  ],
};

module.exports = {
  huggingFaceDatasetsResponse,
  dataverseSearchResponse,
  scholexplorerLinksResponse,
};
