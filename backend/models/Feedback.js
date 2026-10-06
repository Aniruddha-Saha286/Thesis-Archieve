const mongoose = require('mongoose');
const {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_PAGE_CONTEXT_MAX,
} = require('../utils/feedbackFields');

// One message a signed-in user sent to the team, plus the team's reply to it.
const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Name and email are copied here when the message is sent, so staff can still see who
    // wrote it (and reply by email) even if the account is later renamed or removed.
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
    // Which screen the user was on, for example "discover", "library" or "paper:<id>".
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
    // False until the user opens the reply. It only means something once adminReply is filled in:
    // "has an unread reply" is adminReply present and userSeenReply false.
    userSeenReply: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
