/**
 * Scholarly Record Test Fixtures
 * Contains verified reference fixtures for testing metadata mapping, deduplication,
 * citations, and access labeling across diverse scholarly artifacts.
 */

// 1. A Real Doctoral Thesis / Dissertation (HAL Open Science)
const realThesisFixture = {
  id: 'hal_tel-03123456',
  title: 'Deep Learning Architectures for Robust Semantic Segmentation in Autonomous Driving',
  author: 'Camille Dupont',
  authors: [{ name: 'Camille Dupont', affiliation: 'Sorbonne Université & Inria' }],
  abstract: 'This doctoral dissertation investigates convolutional and transformer architectures for real-time dense semantic prediction under adverse weather conditions.',
  publicationType: 'thesis',
  degreeType: 'Ph.D. Doctoral Dissertation',
  venue: 'Sorbonne Université • Doctoral School of Informatics',
  publisher: 'HAL Open Science Archive / CNRS',
  publishedYear: 2021,
  publicationDate: '2021-09-15',
  doi: '10.1145/tel.03123456',
  pdfUrl: 'https://tel.archives-ouvertes.fr/tel-03123456/document',
  isDirectPdf: true,
  isOpenAccess: true,
  isPeerReviewed: true,
  license: 'CC-BY 4.0',
  fullTextLocations: [
    { type: 'pdf', url: 'https://tel.archives-ouvertes.fr/tel-03123456/document', source: 'HAL Open Science', isDirectPdf: true },
  ],
  source: 'HAL Open Science',
  catalogId: 'HAL:tel-03123456',
};

// 2. A Peer-Reviewed Journal Article (Crossref / Open Access)
const journalArticleFixture = {
  id: 'crossref_10_1038_s41586_020_2314_9',
  title: 'Variability in the analysis of a single neuroimaging dataset by many teams',
  author: 'Rotem Botvinik-Nezer, Felix Holzmeister, Colin F. Camerer, et al.',
  authors: [
    { name: 'Rotem Botvinik-Nezer', affiliation: 'Tel Aviv University' },
    { name: 'Felix Holzmeister', affiliation: 'University of Innsbruck' },
  ],
  abstract: 'Data analysis workflows in many scientific domains have become exceedingly complex. Here we show that seventy independent teams analyzing the same dataset obtained strikingly diverse results.',
  publicationType: 'journal-article',
  venue: 'Nature',
  publisher: 'Springer Nature',
  publishedYear: 2020,
  publicationDate: '2020-05-20',
  doi: '10.1038/s41586-020-2314-9',
  pdfUrl: 'https://www.nature.com/articles/s41586-020-2314-9.pdf',
  isDirectPdf: true,
  isOpenAccess: true,
  isPeerReviewed: true,
  citationCount: 680,
  citationSource: 'Crossref',
  source: 'Crossref',
  catalogId: 'DOI:10.1038/s41586-020-2314-9',
};

// 3. An arXiv Preprint (Unvetted, no peer review)
const arxivPreprintFixture = {
  id: 'arxiv_2401_09999',
  title: 'Exploring Large Language Models for Mathematical Discovery: A Working Preprint',
  author: 'David R. Chen, Elena Rostova',
  authors: [
    { name: 'David R. Chen', affiliation: 'Stanford University' },
    { name: 'Elena Rostova', affiliation: 'ETH Zurich' },
  ],
  abstract: 'We report preliminary observations on heuristic reasoning and theorem proving with instruction-tuned generative models.',
  publicationType: 'preprint',
  isPeerReviewed: false,
  publishedYear: 2024,
  venue: 'arXiv Preprints',
  publisher: 'Cornell University / arXiv Open Access',
  doi: '10.48550/arxiv.2401.09999',
  pdfUrl: 'https://arxiv.org/pdf/2401.09999.pdf',
  isDirectPdf: true,
  isOpenAccess: true,
  source: 'arXiv',
  catalogId: 'arXiv:2401.09999',
};

// 4. A Paywalled Article (Publisher DOI page only, NO direct PDF)
const paywalledDoiFixture = {
  id: 'crossref_10_1016_s0140_6736_20_30183_5',
  title: 'Clinical features of patients infected with 2019 novel coronavirus in Wuhan, China',
  author: 'Chaolin Huang, Yeming Wang, Xingwang Li, et al.',
  authors: [{ name: 'Chaolin Huang', affiliation: 'Wuhan Jinyintan Hospital' }],
  abstract: 'A recent cluster of patients with pneumonia caused by a novel coronavirus was identified in Wuhan.',
  publicationType: 'journal-article',
  isPeerReviewed: true,
  publishedYear: 2020,
  venue: 'The Lancet',
  publisher: 'Elsevier',
  doi: '10.1016/s0140-6736(20)30183-5',
  pdfUrl: null, // NO direct PDF - paywalled publisher splash page
  isDirectPdf: false,
  isOpenAccess: false,
  fullTextUrl: 'https://doi.org/10.1016/s0140-6736(20)30183-5',
  fullTextLocations: [
    { type: 'landing', url: 'https://doi.org/10.1016/s0140-6736(20)30183-5', source: 'Publisher Landing Page', isDirectPdf: false },
  ],
  source: 'Crossref',
  catalogId: 'DOI:10.1016/s0140-6736(20)30183-5',
};

// 5. Two Provider Records with the Same DOI (OpenAlex vs Crossref)
const sameDoiRecordA = {
  id: 'openalex_W2995345678',
  title: 'Attention Is All You Need',
  author: 'Ashish Vaswani, Noam Shazeer',
  authors: [{ name: 'Ashish Vaswani', affiliation: 'Google Brain' }],
  abstract: 'The dominant sequence transduction models are based on complex recurrent networks. We introduce the Transformer.',
  publicationType: 'conference-paper',
  publishedYear: 2017,
  doi: '10.48550/arxiv.1706.03762',
  pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
  isDirectPdf: true,
  citationCount: 95000,
  citationSource: 'OpenAlex',
  source: 'OpenAlex',
  catalogId: 'OA:W2995345678',
};

const sameDoiRecordB = {
  id: 'crossref_10_48550_arxiv_1706_03762',
  title: 'Attention Is All You Need',
  author: 'A. Vaswani, N. Shazeer, N. Parmar, J. Uszkoreit, et al.',
  authors: [
    { name: 'Ashish Vaswani', affiliation: null },
    { name: 'Noam Shazeer', affiliation: null },
    { name: 'Niki Parmar', affiliation: null },
    { name: 'Jakob Uszkoreit', affiliation: null },
  ],
  abstract: null, // Crossref didn't supply abstract
  publicationType: 'conference-paper',
  publishedYear: 2017,
  venue: 'Advances in Neural Information Processing Systems',
  publisher: 'Curran Associates, Inc.',
  doi: '10.48550/arxiv.1706.03762',
  pdfUrl: null,
  isDirectPdf: false,
  fullTextUrl: 'https://doi.org/10.48550/arxiv.1706.03762',
  source: 'Crossref',
  catalogId: 'DOI:10.48550/arxiv.1706.03762',
};

// 6. A Retracted Record (Flagged with retraction warning)
const retractedRecordFixture = {
  id: 'crossref_10_1016_s0140_6736_97_11096_0',
  title: 'RETRACTED: Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children',
  author: 'A. J. Wakefield, S. H. Murch, A. Anthony, et al.',
  authors: [{ name: 'A. J. Wakefield', affiliation: 'Royal Free Hospital' }],
  abstract: 'We investigated a consecutive series of children with chronic enterocolitis and regressive developmental disorder.',
  publicationType: 'journal-article',
  isPeerReviewed: true,
  publishedYear: 1998,
  venue: 'The Lancet',
  publisher: 'Elsevier',
  doi: '10.1016/s0140-6736(97)11096-0',
  pdfUrl: null,
  isDirectPdf: false,
  isOpenAccess: false,
  isRetracted: true,
  retractionNoticeUrl: 'https://doi.org/10.1016/S0140-6736(10)60175-4',
  source: 'Crossref',
  catalogId: 'DOI:10.1016/s0140-6736(97)11096-0',
};

module.exports = {
  realThesisFixture,
  journalArticleFixture,
  arxivPreprintFixture,
  paywalledDoiFixture,
  sameDoiRecordA,
  sameDoiRecordB,
  retractedRecordFixture,
};
