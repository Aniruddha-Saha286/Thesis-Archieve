/**
 * Unpaywall fixtures (GET https://api.unpaywall.org/v2/<doi>?email=<address>)
 *
 * Hand-built to the shape of a real Unpaywall v2 response. They are NOT captures of live
 * calls: the test machine cannot reach api.unpaywall.org, and the articles, repositories
 * and DOIs below are made up (10.5555 is a test prefix).
 *
 * Used in two places:
 *   1. tests/datasetSourcesAndOaFinder.test.js feeds them to a stubbed fetch.
 *   2. services/openAccessFinder.js reads them when OFFLINE_MODE=true.
 *
 * Where the shape comes from: the field names of the article object and of each "OA
 * location" were checked against the published Unpaywall field list (as reproduced in the
 * rOpenSci "roadoi" reference). The 404 error body is written from memory and was not
 * checked; the finder only looks at the HTTP status, never at that body.
 */

// One place where a free copy lives. Unpaywall always sends every one of these keys and
// uses null for the ones it does not know.
function location(overrides) {
  return {
    endpoint_id: null,
    evidence: 'open (via page says license)',
    host_type: 'publisher',
    is_best: false,
    license: null,
    oa_date: null,
    pmh_id: null,
    repository_institution: null,
    updated: '2024-03-01T10:15:30.123456',
    url: null,
    url_for_landing_page: null,
    url_for_pdf: null,
    version: 'publishedVersion',
    ...overrides,
  };
}

function article(overrides) {
  return {
    doi: '10.5555/oa.gold.2023.001',
    doi_url: 'https://doi.org/10.5555/oa.gold.2023.001',
    title: 'A Made-Up Open Access Article',
    genre: 'journal-article',
    is_paratext: false,
    published_date: '2023-04-12',
    year: 2023,
    journal_name: 'Journal of Fixture Studies',
    journal_issns: '1234-5678,8765-4321',
    journal_issn_l: '1234-5678',
    journal_is_oa: true,
    journal_is_in_doaj: true,
    publisher: 'Example Open Press',
    is_oa: true,
    oa_status: 'gold',
    has_repository_copy: false,
    best_oa_location: null,
    first_oa_location: null,
    oa_locations: [],
    oa_locations_embargoed: [],
    updated: '2024-03-01T10:15:30.123456',
    data_standard: 2,
    z_authors: [{ given: 'Farhana', family: 'Rahman', sequence: 'first' }],
    ...overrides,
  };
}

// The easy case: the publisher itself offers a PDF under an open licence.
const goldPublisherPdf = location({
  host_type: 'publisher',
  is_best: true,
  license: 'cc-by',
  url: 'https://journals.example.org/jfs/article/001/pdf',
  url_for_landing_page: 'https://doi.org/10.5555/oa.gold.2023.001',
  url_for_pdf: 'https://journals.example.org/jfs/article/001/pdf',
  version: 'publishedVersion',
});

const unpaywallOpenResponse = article({
  best_oa_location: goldPublisherPdf,
  first_oa_location: goldPublisherPdf,
  oa_locations: [goldPublisherPdf],
});

// The best location is a publisher page with no PDF link. A university repository further
// down the list does have a PDF (the author's accepted manuscript).
const bronzeLandingOnly = location({
  evidence: 'open (via free article)',
  host_type: 'publisher',
  is_best: true,
  url: 'https://publisher.example.com/articles/green-2020-17',
  url_for_landing_page: 'https://publisher.example.com/articles/green-2020-17',
  url_for_pdf: null,
});

const repositoryPdf = location({
  endpoint_id: 'a1b2c3d4e5f6a7b8c9d0',
  evidence: 'oa repository (via OAI-PMH doi match)',
  host_type: 'repository',
  license: 'cc-by-nc',
  pmh_id: 'oai:repository.example.edu:1234/5678',
  repository_institution: 'Example University - Institutional Repository',
  url: 'https://repository.example.edu/bitstream/1234/5678/1/manuscript.pdf',
  url_for_landing_page: 'https://repository.example.edu/handle/1234/5678',
  url_for_pdf: 'https://repository.example.edu/bitstream/1234/5678/1/manuscript.pdf',
  version: 'acceptedVersion',
});

const unpaywallRepositoryFallbackResponse = article({
  doi: '10.5555/oa.green.2020.017',
  doi_url: 'https://doi.org/10.5555/oa.green.2020.017',
  title: 'A Made-Up Article With a Repository Copy',
  journal_is_oa: false,
  journal_is_in_doaj: false,
  oa_status: 'green',
  has_repository_copy: true,
  best_oa_location: bronzeLandingOnly,
  first_oa_location: bronzeLandingOnly,
  oa_locations: [bronzeLandingOnly, repositoryPdf],
});

// Free to read on the publisher's page, but nobody offers a direct PDF link.
const unpaywallLandingOnlyResponse = article({
  doi: '10.5555/oa.bronze.2019.003',
  doi_url: 'https://doi.org/10.5555/oa.bronze.2019.003',
  title: 'A Made-Up Article That Is Free To Read Online',
  journal_is_oa: false,
  journal_is_in_doaj: false,
  oa_status: 'bronze',
  best_oa_location: bronzeLandingOnly,
  first_oa_location: bronzeLandingOnly,
  oa_locations: [bronzeLandingOnly],
});

// A paywalled article: Unpaywall knows the DOI but has found no free copy.
const unpaywallClosedResponse = article({
  doi: '10.5555/closed.2022.009',
  doi_url: 'https://doi.org/10.5555/closed.2022.009',
  title: 'A Made-Up Paywalled Article',
  journal_is_oa: false,
  journal_is_in_doaj: false,
  is_oa: false,
  oa_status: 'closed',
  has_repository_copy: false,
  best_oa_location: null,
  first_oa_location: null,
  oa_locations: [],
});

// What Unpaywall sends, with HTTP 404, for a DOI it has never seen.
const unpaywallNotFoundBody = {
  HTTP_status_code: 404,
  error: true,
  message: "'10.5555/unknown.doi' isn't a valid DOI.",
};

// In OFFLINE_MODE the finder answers from this table. Any DOI that is not listed gets
// unpaywallOpenResponse, so offline runs normally see "found".
const OFFLINE_DOI_TABLE = {
  '10.5555/oa.green.2020.017': unpaywallRepositoryFallbackResponse,
  '10.5555/oa.bronze.2019.003': unpaywallLandingOnlyResponse,
  '10.5555/closed.2022.009': unpaywallClosedResponse,
  '10.5555/unknown.doi': null, // null stands for "Unpaywall answered 404"
};

module.exports = {
  unpaywallOpenResponse,
  unpaywallRepositoryFallbackResponse,
  unpaywallLandingOnlyResponse,
  unpaywallClosedResponse,
  unpaywallNotFoundBody,
  OFFLINE_DOI_TABLE,
};
