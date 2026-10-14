const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  identityKeys: { type: [String], required: true },
  record: { type: mongoose.Schema.Types.Mixed, required: true },
  venueId: { type: String, default: null },
  publishedYear: Number,
  publicationDate: { type: Date, default: null },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  providers: [String],
  searchText: { type: String, maxlength: 20000 },
});
schema.index({ identityKeys: 1 }, { unique: true });
schema.index({ venueId: 1, publishedYear: -1, publicationDate: -1, _id: -1 });
schema.index({ publishedYear: 1, publicationDate: -1, _id: -1 });
schema.index({ publicationDate: -1, _id: -1 });
schema.index({ firstSeenAt: -1, _id: -1 });
schema.index({ searchText: 'text' });
module.exports = mongoose.model('DiscoveryPaper', schema);
