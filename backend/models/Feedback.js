const mongoose = require('mongoose');
const {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_PAGE_CONTEXT_MAX,
} = require('../utils/feedbackFields');

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      default: '',
      trim: true,
    },
    userName: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      enum: FEEDBACK_CATEGORIES,
      default: 'other',
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: FEEDBACK_MESSAGE_MIN,
      maxlength: FEEDBACK_MESSAGE_MAX,
    },
    pageContext: {
      type: String,
      default: '',
      trim: true,
      maxlength: FEEDBACK_PAGE_CONTEXT_MAX,
    },
    status: {
      type: String,
      enum: FEEDBACK_STATUSES,
      default: 'new',
      index: true,
    },
    adminReply: {
      type: String,
      default: '',
      trim: true,
      maxlength: FEEDBACK_REPLY_MAX,
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    repliedByName: {
      type: String,
      default: '',
      trim: true,
    },
    repliedAt: {
      type: Date,
      default: null,
    },
    userSeenReply: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
