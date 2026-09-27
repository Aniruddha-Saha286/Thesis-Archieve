const mongoose = require('mongoose');

const membershipPeriodSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MembershipOrder',
    default: null,
  },
  paymentSubmission: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentSubmission',
    default: null,
  },
  plan: {
    type: String,
    enum: ['premium', 'premium_6m', 'pro_max_12m'],
    default: 'premium_6m',
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
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
    index: true,
  },
  cancellationReason: {
    type: String,
    default: '',
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  source: {
    type: String,
    enum: ['payment', 'manual_admin'],
    default: 'payment',
    index: true,
  },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  grantReason: {
    type: String,
    default: '',
  },
  grantRequestId: {
    type: String,
    default: null,
  },
  customLabel: {
    type: String,
    default: '',
  },
  grantType: {
    type: String,
    enum: ['standard', 'test', 'research_grant', 'evaluation', 'custom'],
    default: 'standard',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

membershipPeriodSchema.index(
  { paymentSubmission: 1 },
  { unique: true, partialFilterExpression: { paymentSubmission: { $type: 'objectId' } } }
);

membershipPeriodSchema.index(
  { grantRequestId: 1 },
  { unique: true, partialFilterExpression: { grantRequestId: { $type: 'string' } } }
);

module.exports = mongoose.model('MembershipPeriod', membershipPeriodSchema);
