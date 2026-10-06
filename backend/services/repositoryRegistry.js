/**
 * Repository Registry for the thesis harvester.
 *
 * Each entry describes one university repository that speaks OAI-PMH (the standard
 * "please copy my catalogue" protocol that DSpace and similar systems offer on purpose).
 * The harvester (services/repositoryHarvester.js) only ever reads this list; it never
 * guesses addresses on its own.
 *
 * Fields:
 *   key              short stable id, stored on every harvested thesis (Thesis.sourceRepository).
 *                    Do NOT rename a key after harvesting: old records would lose their link to it.
 *   name             university name exactly as the site should show it (Thesis.university).
 *   repositoryName   what the repository calls itself (Thesis.sourceRepositoryName, shown next to
 *                    the "view in original repository" link).
 *   countryCode      ISO 3166-1 alpha-2.
 *   oaiBaseUrl       OAI-PMH base URL, without any "?verb=..." part.
 *   metadataPrefix   preferred metadata format. "dim" is DSpace's own format: it labels advisor,
 *                    department, abstract and issue date explicitly, so nothing has to be guessed.
 *   fallbackMetadataPrefix  used automatically when the repository answers
 *                    "cannotDisseminateFormat" for the preferred one. "oai_dc" is mandatory in
 *                    OAI-PMH, so every repository has it.
 *   sets             optional list of OAI setSpecs to limit the harvest (one pass per set).
 *                    Empty = whole repository; non-thesis records are then filtered out by dc.type.
 *   treatAllAsThesis optional. Only set true together with `sets` that contain nothing but theses,
 *                    for repositories that do not fill in dc.type.
 *   requestDelayMs   optional pause between two requests to this repository (default 1000 ms).
 *   enabled          false = the command line tool refuses to harvest it unless --force is given.
 *   notes            what was checked, when, and what is still unknown.
 *
 * HOW TO ADD A REPOSITORY
 *   1. Open "<oaiBaseUrl>?verb=Identify" in a browser. You must get XML with <repositoryName>.
 *   2. Open "<oaiBaseUrl>?verb=ListMetadataFormats" and look for "dim".
 *   3. Add the entry with enabled: false and run
 *        node scripts/harvestRepository.js --repo <key> --max 50 --dry-run --force
 *      Read the printed samples. Only then switch enabled to true.
 */

const REPOSITORIES = [
  {
    key: 'bracu',
    name: 'BRAC University',
    repositoryName: 'BRAC University Institutional Repository',
    countryCode: 'BD',
    oaiBaseUrl: 'https://dspace.bracu.ac.bd/server/oai/request',
    metadataPrefix: 'dim',
    fallbackMetadataPrefix: 'oai_dc',
    sets: [],
    enabled: true,
    notes: [
      'CONFIRMED LIVE on 2026-10-06 (verb=Identify): repositoryName "BRAC University Institutional Repository",',
      'protocolVersion 2.0, earliestDatestamp 2010-08-30T05:11:42Z, deletedRecord "transient",',
      'granularity YYYY-MM-DDThh:mm:ssZ, adminEmail dspace@bracu.ac.bd.',
      'The old DSpace address /oai/request returns 404; the working one is /server/oai/request (DSpace 7+), https only.',
      'ListMetadataFormats offers: oai_dc, dim, qdc, xoai, etdms, uketd_dc, mods, mets, marc, didl, ore, rdf.',
      'There are about 1,850 sets (one per community/collection, including one per faculty member) and no single',
      '"all theses" set, so the whole repository is read and records are kept only when dc.type says Thesis/Dissertation.',
      'Other dc.type values seen there and skipped: Internship Report, Research Report, Article, Journal,',
      'Newspaper article, Drawings.',
      'Their rights statement on theses: "Brac University theses are protected by copyright. They may be viewed from',
      'this source for any purpose, but reproduction or distribution in any format is prohibited without written',
      'permission." We therefore copy catalogue data only and link back; we never download or re-host the PDF.',
    ].join(' '),
  },
  {
    key: 'uiu',
    name: 'United International University',
    repositoryName: 'UIU Digital Institutional Repository',
    countryCode: 'BD',
    oaiBaseUrl: 'https://dspace.uiu.ac.bd/server/oai/request',
    metadataPrefix: 'dim',
    fallbackMetadataPrefix: 'oai_dc',
    sets: [],
    enabled: false,
    notes: [
      'ENDPOINT CONFIRMED LIVE on 2026-10-06 (verb=Identify): repositoryName "UIU Digital Institutional Repository",',
      'protocolVersion 2.0, earliestDatestamp 2017-09-10T08:24:44Z, deletedRecord "transient", adminEmail dspace@uiu.ac.bd.',
      'The "dim" format is accepted. NOT YET ENABLED because no actual record could be inspected (the test query for',
      'records changed since 2025-01-01 returned noRecordsMatch), so the dc.type wording and field quality are unknown.',
      'Run a --dry-run --force first, read the samples, then set enabled: true.',
      'Note: the repository reports its own baseURL as http://103.109.52.20/server/oai/request; the https hostname above also answers.',
    ].join(' '),
  },

  // ---------------------------------------------------------------------------------------------
  // UNVERIFIED CANDIDATES. None of these could be reached from the build environment, and the
  // addresses are best guesses based on the usual DSpace layout. They may be wrong, moved, or
  // offline. Each one must be checked by hand (see "HOW TO ADD A REPOSITORY") before enabling.
  // ---------------------------------------------------------------------------------------------
  {
    key: 'buet',
    name: 'Bangladesh University of Engineering and Technology',
    repositoryName: 'BUET Institutional Repository',
    countryCode: 'BD',
    oaiBaseUrl: 'http://lib.buet.ac.bd:8080/oai/request',
    metadataPrefix: 'oai_dc',
    fallbackMetadataPrefix: 'oai_dc',
    sets: [],
    enabled: false,
    notes: 'UNVERIFIED. Address is a guess (older DSpace on port 8080, plain http); the endpoint could not be reached to confirm it. Check by hand before enabling.',
  },
  {
    key: 'du',
    name: 'University of Dhaka',
    repositoryName: 'Dhaka University Institutional Repository',
    countryCode: 'BD',
    oaiBaseUrl: 'http://repository.library.du.ac.bd:8080/oai/request',
    metadataPrefix: 'oai_dc',
    fallbackMetadataPrefix: 'oai_dc',
    sets: [],
    enabled: false,
    notes: 'UNVERIFIED. Address is a guess (older DSpace on port 8080, plain http); the endpoint could not be reached to confirm it. Check by hand before enabling.',
  },
  {
    key: 'diu',
    name: 'Daffodil International University',
    repositoryName: 'Daffodil International University Institutional Repository',
    countryCode: 'BD',
    oaiBaseUrl: 'http://dspace.daffodilvarsity.edu.bd:8080/oai/request',
    metadataPrefix: 'oai_dc',
    fallbackMetadataPrefix: 'oai_dc',
    sets: [],
    enabled: false,
    notes: 'UNVERIFIED. Address is a guess (older DSpace on port 8080, plain http); the endpoint could not be reached to confirm it. Check by hand before enabling.',
  },
  {
    key: 'ewu',
    name: 'East West University',
    repositoryName: 'East West University Institutional Repository',
    countryCode: 'BD',
    oaiBaseUrl: 'http://dspace.ewubd.edu:8080/oai/request',
    metadataPrefix: 'oai_dc',
    fallbackMetadataPrefix: 'oai_dc',
    sets: [],
    enabled: false,
    notes: 'UNVERIFIED. Address is a guess (older DSpace on port 8080, plain http); the connection timed out when checking. Check by hand before enabling.',
  },
  {
    key: 'kuet',
    name: 'Khulna University of Engineering & Technology',
    repositoryName: 'KUET Institutional Repository',
    countryCode: 'BD',
    oaiBaseUrl: 'https://dspace.kuet.ac.bd/oai/request',
    metadataPrefix: 'oai_dc',
    fallbackMetadataPrefix: 'oai_dc',
    sets: [],
    enabled: false,
    notes: 'UNVERIFIED. Address is a guess; the host did not accept a connection when checking. Check by hand before enabling.',
  },
];

function listRepositories() {
  return REPOSITORIES.map((repo) => ({ ...repo, sets: [...(repo.sets || [])] }));
}

function getRepository(key) {
  if (!key) return null;
  const wanted = String(key).trim().toLowerCase();
  const found = REPOSITORIES.find((repo) => repo.key === wanted);
  return found ? { ...found, sets: [...(found.sets || [])] } : null;
}

module.exports = {
  REPOSITORIES,
  listRepositories,
  getRepository,
};
