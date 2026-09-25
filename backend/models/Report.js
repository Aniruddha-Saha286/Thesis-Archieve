const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  recordId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: 'Scholarly Publication',
  },
  issueType: {
    type: String,
    enum: ['dead-link', 'metadata-inaccuracy', 'retraction-unflagged', 'copyright-claim', 'other'],
    default: 'dead-link',
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  reportedBy: {
    type: String,
    default: 'anonymous',
  },
  status: {
    type: String,
    enum: ['pending', 'resolved', 'dismissed'],
    default: 'pending',
  },
  adminNotes: {
    type: String,
    default: '',
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Report', reportSchema);
