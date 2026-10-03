const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'site_config',
    index: true,
  },
  maintenance: {
    enabled: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      default: 'Sorry, maintenance is currently in progress. Please try again later.',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
});

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
