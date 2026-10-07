const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    default: null,
  },
  googleId: {
    type: String,
    default: null,
  },
  avatar: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    enum: ['student', 'editor', 'admin'],
    default: 'student',
  },
  permissions: {
    type: [String],
    default: [],
  },
  roleChangedAt: {
    type: Date,
    default: null,
  },
  roleChangedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'banned'],
    default: 'pending',
  },
  banReason: {
    type: String,
    default: '',
  },
  isProfileComplete: {
    type: Boolean,
    default: false,
  },
  university: {
    type: String,
    default: '',
    trim: true,
  },
  studentId: {
    type: String,
    default: '',
    trim: true,
  },
  degreeProgram: {
    type: String,
    default: 'B.Sc. Undergraduate Thesis',
  },
  researchDomain: {
    type: String,
    default: 'Computer Science & NLP',
  },
  thesisGoal: {
    type: String,
    default: '',
  },
  idCardProof: {
    type: String,
    default: '',
  },
  verifiedAt: {
    type: Date,
    default: null,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  savedPapers: [{
    paperId: { type: String, required: true },
    title: { type: String, required: true },
    doi: { type: String, default: '' },
    authors: { type: String, default: '' },
    year: { type: Number, default: null },
    pdfUrl: { type: String, default: '' },
    publicationType: { type: String, default: 'unknown' },
    degreeType: { type: String, default: '' },
    venue: { type: String, default: '' },
    publisher: { type: String, default: '' },
    notes: { type: String, default: '' },
    readingStatus: {
      type: String,
      enum: ['To read', 'Reading', 'Reviewed', 'To cite'],
      default: 'To read',
    },
    structuredNotes: {
      researchQuestion: { type: String, default: '' },
      method: { type: String, default: '' },
      dataset: { type: String, default: '' },
      findings: { type: String, default: '' },
      limitations: { type: String, default: '' },
      relevanceToMyThesis: { type: String, default: '' },
    },
    savedAt: { type: Date, default: Date.now },
  }],

  collections: [{
    name: { type: String, required: true },
    description: { type: String, default: '' },
    paperIds: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
  }],

  searchHistory: [{
    query: { type: String, required: true },
    searchedAt: { type: Date, default: Date.now },
  }],

  dailySearchUsage: {
    date: { type: String, default: '' },
    count: { type: Number, default: 0 },
  },

  dailyDatasetUsage: {
    date: { type: String, default: '' },
    count: { type: Number, default: 0 },
  },

  dailySummaryUsage: {
    date: { type: String, default: '' },
    count: { type: Number, default: 0 },
  },

  topicAlerts: [{
    topic: { type: String, required: true },
    category: { type: String, default: 'All Disciplines' },
    active: { type: Boolean, default: true },
    lastCheckedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  }],

  comparisons: [{
    title: { type: String, required: true },
    paperIds: [{ type: String }],
    criteria: {
      type: Map,
      of: new mongoose.Schema({
        researchQuestion: { type: String, default: '' },
        methodology: { type: String, default: '' },
        dataset: { type: String, default: '' },
        findings: { type: String, default: '' },
        limitations: { type: String, default: '' },
      }, { _id: false }),
    },
    updatedAt: { type: Date, default: Date.now },
  }],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      googleId: { $type: 'string' },
    },
  }
);

module.exports = mongoose.model('User', userSchema);
