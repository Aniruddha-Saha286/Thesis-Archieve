const mongoose = require('mongoose');

const thesisSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  abstract: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
    default: 'Computer Science & NLP',
  },
  catalogId: {
    type: String,
    unique: true,
    sparse: true,
    default: function () {
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      return `THESIS-${year}-${rand}`;
    },
  },
  degreeType: {
    type: String,
    default: 'M.Sc. Thesis',
  },
  publicationType: {
    type: String,
    enum: ['thesis', 'dissertation', 'journal-article', 'conference-paper', 'preprint', 'book', 'unknown'],
    default: 'thesis',
  },
  university: {
    type: String,
    required: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
  },
  author: {
    type: String,
    required: true,
    trim: true,
  },
  authors: [{
    name: String,
    affiliation: String,
  }],
  authorships: [{
    author: {
      id: { type: String, default: null },
      name: { type: String, default: '' },
      orcid: { type: String, default: null },
    },
    institutions: [{
      id: { type: String, default: null },
      ror: { type: String, default: null },
      name: { type: String, default: null },
      countryCode: { type: String, default: null },
      type: { type: String, default: null },
    }],
    rawAffiliation: { type: String, default: null },
  }],
  awardingInstitution: {
    id: { type: String, default: null },
    ror: { type: String, default: null },
    name: { type: String, default: null },
    countryCode: { type: String, default: null },
    type: { type: String, default: null },
    evidence: { type: String, default: null },
  },
  subjects: [{
    id: { type: String, required: true },
    label: { type: String, required: true },
    shortLabel: { type: String, default: null },
    provenance: { type: String, enum: ['curated', 'openalex_predicted', 'provider_mapped'], default: 'curated' },
    sourceId: { type: String, default: null },
  }],
  citationMetrics: {
    source: { type: String, default: 'OpenAlex' },
    count: { type: Number, default: null },
    retrievedAt: { type: Date, default: null },
    sourceId: { type: String, default: null },
  },
  advisor: {
    type: String,
    default: null,
  },
  publisher: {
    type: String,
    default: '',
    trim: true,
  },
  doi: {
    type: String,
    default: '',
    trim: true,
  },
  publishedYear: {
    type: Number,
    default: () => new Date().getFullYear(),
  },
  pdfUrl: {
    type: String,
    default: '', // NO FAKE HARDCODED DEFAULTS
    trim: true,
  },
  isDirectPdf: {
    type: Boolean,
    default: false,
  },
  isOpenAccess: {
    type: Boolean,
    default: true,
  },
  license: {
    type: String,
    default: '',
  },
  isRetracted: {
    type: Boolean,
    default: false,
  },
  retractionNoticeUrl: {
    type: String,
    default: '',
  },
  datasetUrl: {
    type: String,
    default: '',
    trim: true,
  },
  datasetSize: {
    type: String,
    default: '',
  },
  datasetFormat: {
    type: String,
    default: '',
  },
  codeUrl: {
    type: String,
    default: '',
  },
  bibtex: {
    type: String,
    default: '',
  },
  upvotes: {
    type: Number,
    default: 0,
  },
  upvotedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  status: {
    type: String,
    enum: ['approved', 'pending', 'rejected'],
    default: 'pending', // User submissions default to pending admin moderation
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
  isSample: {
    type: Boolean,
    default: false,
  },
  source: {
    type: String,
    default: 'Local Repository',
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  approvedAt: {
    type: Date,
    default: null,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Thesis', thesisSchema);
