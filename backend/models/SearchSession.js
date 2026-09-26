const mongoose = require('mongoose');

const searchSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  scope: {
    type: String,
    default: null,
  },
  sessionHash: {
    type: String,
    required: true,
    index: true,
  },
  query: {
    type: String,
    default: '',
  },
  filters: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({}),
  },
  sort: {
    type: String,
    default: 'relevance',
  },
  buffer: {
    type: [mongoose.Schema.Types.Mixed],
    default: () => [],
  },
  providerStatus: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({}),
  },
  providerStates: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({}),
  },
  frozenIndex: {
    type: Number,
    default: 0,
  },
  allProvidersExhausted: {
    type: Boolean,
    default: false,
  },
  lastAccessedAt: {
    type: Number,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 1800, // 30 minutes TTL in MongoDB
  },
});

module.exports = mongoose.model('SearchSession', searchSessionSchema);
