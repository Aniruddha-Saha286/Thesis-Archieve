const mongoose = require('mongoose');

const trialGrantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  startsAt: {
    type: Date,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'converted', 'cancelled'],
    default: 'active',
  },
  policyVersion: {
    type: String,
    enum: ['v1', 'v2'],
    default: 'v2',
  },
  dailyDatasetLookups: {
    date: { type: String, default: '' },
    count: { type: Number, default: 0 },
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
  cancellationReason: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('TrialGrant', trialGrantSchema);
