const mongoose = require('mongoose');

const membershipOrderSchema = new mongoose.Schema({
  orderRef: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  plan: {
    type: String,
    enum: ['premium', 'premium_6m', 'pro_max_12m'],
    default: 'premium_6m',
  },
  planCode: {
    type: String,
    default: 'premium_6m',
  },
  planName: {
    type: String,
    default: 'Premium Scholarly Discovery',
  },
  pricePaisa: {
    type: Number,
    required: true,
    default: 50000, // ৳500 stored in integer minor units (paisa)
  },
  currency: {
    type: String,
    default: 'BDT',
  },
  durationMonths: {
    type: Number,
    default: 6,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired', 'cancelled'],
    default: 'pending',
  },
  merchantNumberSnapshot: {
    type: String,
    default: '',
  },
  merchantNameSnapshot: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('MembershipOrder', membershipOrderSchema);
