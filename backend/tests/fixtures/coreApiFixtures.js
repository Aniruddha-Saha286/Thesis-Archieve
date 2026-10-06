/**
 * CORE API v3 fixtures ("search works": GET https://api.core.ac.uk/v3/search/works)
 *
 * These are hand-built to the shape of a real CORE response. They are NOT a capture of a
 * live call: the test machine cannot reach api.core.ac.uk, and the titles, people and
 * repositories below are made up (DOIs use the 10.5555 test prefix).
 *
 * The same object is used in two places:
 *   1. tests/newProviders.test.js feeds it to a stubbed fetch, so the real mapping code runs.
 *   2. services/providers/core.js reads it when OFFLINE_MODE=true, so the deterministic
 *      test run gets CORE records without touching the network.
 *
 * Each work is there to exercise one thing:
 *   [0] a doctoral thesis with every field filled in
 *   [1] a journal article: "Surname, Given" author names, a publisher wrapped in stray
 *       quotes (CORE really does this), HTML entities and tags in the title
 *   [2] a research paper with no journal, no yearPublished (only publishedDate), no
 *       downloadUrl, and sourceFulltextUrls given as a plain string instead of a list
 *   [3] a record with nearly everything missing or null
 *   [4] a record with no title at all (the adapter must skip it)
 *   [5] a master's dissertation in Spanish whose documentType arrives as a list
 */

const coreSearchWorksResponse = {
  totalHits: 6,
  limit: 10,
  offset: 0,
  scrollId: null,
  results: [
    {
      acceptedDate: '2021-08-19T00:00:00',
      arxivId: null,
      authors: [{ name: 'Rahman, Farhana' }],
      citationCount: 3,
      contributors: ['Hossain, Mohammad Anwar'],
      outputs: ['https://api.core.ac.uk/v3/outputs/900000001'],
      createdDate: '2022-03-14T08:21:07',
      dataProviders: [
        {
          id: 4786,
          name: 'Example University Research Repository',
          url: 'https://api.core.ac.uk/v3/data-providers/4786',
          logo: 'https://api.core.ac.uk/data-providers/4786/logo',
        },
      ],
      depositedDate: '2021-11-02T00:00:00',
      abstract:
        'This doctoral thesis develops recurrent and attention-based deep learning models that forecast river flooding several days ahead using gauge and satellite rainfall records.',
      documentType: 'thesis',
      doi: null,
      downloadUrl: 'https://core.ac.uk/download/900000001.pdf',
      fieldOfStudy: 'computer science',
      fullText: 'Deep Learning Methods for Flood Forecasting in River Deltas. Chapter 1. Introduction ...',
      id: 900000001,
      identifiers: [
        { identifier: '900000001', type: 'CORE_ID' },
        { identifier: 'oai:repository.example.edu:1234/5678', type: 'OAI_ID' },
      ],
      title: 'Deep Learning Methods for Flood Forecasting in River Deltas',
      language: { code: 'en', name: 'English' },
      magId: null,
      oaiIds: ['oai:repository.example.edu:1234/5678'],
      publishedDate: '2021-09-01T00:00:00',
      publisher: 'Example University',
      pubmedId: null,
      references: [],
      sourceFulltextUrls: ['https://repository.example.edu/bitstream/handle/1234/5678/thesis.pdf'],
      updatedDate: '2023-06-30T04:11:52',
      yearPublished: 2021,
      journals: [],
      links: [
        { type: 'download', url: 'https://core.ac.uk/download/900000001.pdf' },
        { type: 'reader', url: 'https://core.ac.uk/reader/900000001' },
        { type: 'thumbnail_l', url: 'https://core.ac.uk/image/900000001/large' },
        { type: 'thumbnail_m', url: 'https://core.ac.uk/image/900000001/medium' },
        { type: 'display', url: 'https://core.ac.uk/works/900000001' },
      ],
    },
    {
      acceptedDate: '',
      arxivId: null,
      authors: [{ name: 'Okafor, Chidinma' }, { name: 'Lindqvist, Per-Olof' }, { name: 'Tanvir Ahmed' }],
      citationCount: 12,
      contributors: [],
      outputs: ['https://api.core.ac.uk/v3/outputs/900000002', 'https://api.core.ac.uk/v3/outputs/900000102'],
      createdDate: '2020-05-02T10:00:00',
      dataProviders: [
        {
          id: 144,
          name: 'Open Research Online',
          url: 'https://api.core.ac.uk/v3/data-providers/144',
          logo: 'https://api.core.ac.uk/data-providers/144/logo',
        },
      ],
      depositedDate: '2020-04-20T00:00:00',
      abstract:
        '<p>We compare transformer language models for sentiment &amp; emotion classification on low-resource text, and release the annotated corpus.</p>',
      documentType: 'research',
      doi: '10.5555/CORE.Fixture.0002',
      downloadUrl: 'https://core.ac.uk/download/pdf/900000002.pdf',
      fieldOfStudy: null,
      fullText: 'Transformers & Sentiment ...',
      id: 900000002,
      identifiers: [
        { identifier: '900000002', type: 'CORE_ID' },
        { identifier: '10.5555/core.fixture.0002', type: 'DOI' },
      ],
      title: 'Transformers &amp; Sentiment: A Study of <i>Low-Resource</i> Text &#8211; Models, Data &quot;Gaps&quot;',
      language: { code: 'en', name: 'English' },
      magId: null,
      oaiIds: ['oai:oro.example.ac.uk:70001'],
      publishedDate: '2020-03-15T00:00:00',
      publisher: "'Example Science Publishing BV'",
      pubmedId: null,
      references: [],
      sourceFulltextUrls: ['https://oro.example.ac.uk/70001/'],
      updatedDate: '2024-01-12T09:45:10',
      yearPublished: 2020,
      journals: [{ title: 'Journal of Language Technology Research', identifiers: ['issn:1234-5678'] }],
      links: [
        { type: 'download', url: 'https://core.ac.uk/download/pdf/900000002.pdf' },
        { type: 'reader', url: 'https://core.ac.uk/reader/900000002' },
        { type: 'display', url: 'https://core.ac.uk/works/900000002' },
      ],
    },
    {
      acceptedDate: '',
      arxivId: '1905.01234',
      authors: [{ name: 'World Health Analytics Consortium, Geneva' }, { name: 'Mariam Sultana' }],
      citationCount: null,
      contributors: [],
      outputs: ['https://api.core.ac.uk/v3/outputs/900000003'],
      createdDate: '2019-06-11T12:00:00',
      dataProviders: [
        {
          id: 2612,
          name: 'Institutional Knowledge Base',
          url: 'https://api.core.ac.uk/v3/data-providers/2612',
          logo: 'https://api.core.ac.uk/data-providers/2612/logo',
        },
      ],
      depositedDate: '2019-06-10T00:00:00',
      abstract: 'A working paper on the reproducibility of epidemic forecasting pipelines.',
      documentType: 'research',
      doi: null,
      downloadUrl: null,
      fieldOfStudy: 'medicine',
      fullText: null,
      id: 900000003,
      identifiers: [{ identifier: '900000003', type: 'CORE_ID' }],
      title: 'Reproducibility of Epidemic Forecasting Pipelines',
      language: null,
      magId: null,
      oaiIds: [],
      publishedDate: '2019-05-03T01:00:00+01:00',
      publisher: '',
      pubmedId: null,
      references: [],
      sourceFulltextUrls: 'https://kb.example.org/record/4455/files/working-paper.pdf',
      updatedDate: '2022-02-02T02:02:02',
      yearPublished: null,
      journals: [],
      links: [{ type: 'display', url: 'https://core.ac.uk/works/900000003' }],
    },
    {
      authors: null,
      abstract: '',
      documentType: '',
      doi: '',
      downloadUrl: '',
      id: 900000004,
      title: '  Untitled lecture slides on network protocols  ',
      language: { code: '', name: '' },
      publishedDate: null,
      publisher: null,
      sourceFulltextUrls: [],
      yearPublished: 0,
      journals: null,
      links: [],
      dataProviders: [],
    },
    {
      authors: [{ name: 'Nobody, Atall' }],
      abstract: 'This record has no title, so the adapter must drop it.',
      documentType: 'research',
      doi: null,
      downloadUrl: 'https://core.ac.uk/download/900000005.pdf',
      id: 900000005,
      title: null,
      yearPublished: 2018,
    },
    {
      acceptedDate: '',
      arxivId: null,
      authors: [{ name: 'García Márquez, Lucía' }],
      citationCount: 0,
      contributors: [],
      outputs: ['https://api.core.ac.uk/v3/outputs/900000006'],
      createdDate: '2018-02-01T00:00:00',
      dataProviders: [
        {
          id: 951,
          name: 'Repositorio Institucional de Ejemplo',
          url: 'https://api.core.ac.uk/v3/data-providers/951',
          logo: 'https://api.core.ac.uk/data-providers/951/logo',
        },
      ],
      depositedDate: '2018-01-20T00:00:00',
      abstract: 'Tesis de maestría sobre el aprendizaje automático aplicado a la predicción de la demanda eléctrica.',
      documentType: ['Master Dissertation', 'thesis'],
      doi: null,
      downloadUrl: 'https://repositorio.example.es/handle/10000/4321',
      fieldOfStudy: 'engineering',
      fullText: null,
      id: 900000006,
      identifiers: [{ identifier: '900000006', type: 'CORE_ID' }],
      title: 'Aprendizaje automático para la predicción de la demanda eléctrica',
      language: { code: 'es', name: 'Spanish' },
      magId: null,
      oaiIds: [],
      publishedDate: '2017-12-01T00:00:00',
      publisher: null,
      pubmedId: null,
      references: [],
      sourceFulltextUrls: [],
      updatedDate: '2021-01-01T00:00:00',
      yearPublished: 2017,
      journals: [],
      links: [
        { type: 'reader', url: 'https://core.ac.uk/reader/900000006' },
        { type: 'display', url: 'https://core.ac.uk/works/900000006' },
      ],
    },
  ],
  tooks: [43, 11],
  esTook: 43,
};

module.exports = { coreSearchWorksResponse };
