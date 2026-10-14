const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  provider: String, venueId: String, year: Number,
  offset: { type: Number, default: 0 },
  leaseUntil: { type: Date, default: () => new Date(0) },
  lastAttemptAt: Date, lastSuccessAt: Date,
  status: { type: String, default: 'idle' },
  accepted: { type: Number, default: 0 },
});
module.exports = mongoose.model('DiscoverySync', schema);
