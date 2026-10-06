const mongoose = require('mongoose');
const crypto = require('crypto');

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
      const randHex = crypto.randomBytes(4).toString('hex').toUpperCase();
      return `THESIS-${year}-${randHex}`;
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
    required: function () {
      return ['thesis', 'dissertation'].includes(this.publicationType);
    },
    trim: true,
  },
  countryCode: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
  },
  department: {
    type: String,
    required: function () {
      return ['thesis', 'dissertation'].includes(this.publicationType);
    },
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
    source: { type: String, default: null },
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
    default: null,
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
  // Set only when the PDF was uploaded through the deposit form: where the file is stored
  // (so it can be removed with the record) and how large it is.
  pdfStorageRef: {
    type: String,
    default: '',
  },
  pdfSizeBytes: {
    type: Number,
    default: null,
  },
  isOpenAccess: {
    type: Boolean,
    default: null,
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
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  rejectionReason: {
    type: String,
    default: '',
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  rejectedAt: {
    type: Date,
    default: null,
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

  // ---------------------------------------------------------------------------------------
  // Harvested records (services/repositoryHarvester.js)
  // A thesis copied from a university repository over OAI-PMH. Every field below is optional
  // and unset on theses deposited through this site, so existing records are not affected.
  // ---------------------------------------------------------------------------------------

  // Where the record came from. 'deposit' = submitted on this site (the default, and what
  // every older record counts as). 'harvest' = copied from an outside repository.
  // The harvester only ever updates records whose origin is 'harvest'.
  origin: {
    type: String,
    enum: ['deposit', 'harvest'],
    default: 'deposit',
  },
  // Registry key of the repository (services/repositoryRegistry.js), e.g. 'bracu'.
  sourceRepository: {
    type: String,
    trim: true,
  },
  // Name of that repository for display, e.g. 'BRAC University Institutional Repository'.
  sourceRepositoryName: {
    type: String,
    trim: true,
  },
  // Permanent link back to the original record (the handle URL). Show this as
  // "View in original repository". It is a landing page, not a PDF, so it is NOT put in pdfUrl.
  sourceUrl: {
    type: String,
    trim: true,
  },
  // The rights / copyright statement the repository publishes with the record, kept word for
  // word so it can be shown next to the link back.
  sourceRights: {
    type: String,
  },
  // The record's OAI-PMH identifier, e.g. 'oai:dspace.bracu.ac.bd:10361/22810'. This is how a
  // later harvest finds the same record again instead of creating a duplicate.
  // No default on purpose: the unique index is sparse, which only skips documents where the
  // field is missing altogether. A default of null would make every deposited thesis collide.
  externalId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  // When the harvester last wrote this record.
  harvestedAt: {
    type: Date,
  },
  // When the record last changed in the source repository (OAI datestamp).
  sourceUpdatedAt: {
    type: Date,
  },
  // Set when the source repository reported the record as deleted. The harvester then hides the
  // record (status 'rejected') instead of removing it, and can bring it back if the source does.
  sourceDeletedAt: {
    type: Date,
  },
  // Fingerprint of the fields the harvester wrote last time. If the stored fields no longer
  // match it, somebody edited the record by hand, and the harvester leaves it alone from then on.
  harvestChecksum: {
    type: String,
  },
});

// Lets admin screens and reports list "everything harvested from repository X" without a full scan.
thesisSchema.index({ origin: 1, sourceRepository: 1 });

module.exports = mongoose.model('Thesis', thesisSchema);
