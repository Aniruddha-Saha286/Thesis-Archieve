const mongoose = require('mongoose');

const paymentSubmissionSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MembershipOrder',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  paymentProvider: {
    type: String,
    enum: ['bkash'],
    default: 'bkash',
    required: true,
  },
  trxId: {
    type: String,
    required: true,
    trim: true,
  },
  normalizedTrxId: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  senderNumber: {
    type: String,
    trim: true,
    default: '',
  },
  paymentDateTime: {
    type: Date,
    default: Date.now,
  },
  claimedAmountPaisa: {
    type: Number,
    required: true,
    default: 50000,
  },
  receiptUrl: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'approved', 'rejected'],
    default: 'submitted',
    index: true,
  },
  rejectionReason: {
    type: String,
    default: '',
  },
  adminInstructions: {
    type: String,
    default: '',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Enforce database-level uniqueness across provider + normalized transaction ID
paymentSubmissionSchema.index(
  { paymentProvider: 1, normalizedTrxId: 1 },
  { unique: true }
);

// Enforce single payment submission per order
paymentSubmissionSchema.index(
  { order: 1 },
  { unique: true }
);

module.exports = mongoose.model('PaymentSubmission', paymentSubmissionSchema);
