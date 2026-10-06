const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      'topic_alert',
      'payment_approved',
      'payment_rejected',
      'payment_correction',
      'payment_claim',
      'membership_granted',
      'membership_cancelled',
      'thesis_approved',
      'thesis_rejected',
      'verification_request',
      'verification_approved',
      'editor_appointed',
      'permissions_updated',
      'report_created',
      'editorial_update',
      // A user sent a message to the team / the team replied to that message
      'feedback_new',
      'feedback_reply',
      'general',
    ],
    default: 'general',
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    default: '',
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Notification', notificationSchema);
