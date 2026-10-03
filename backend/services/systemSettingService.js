const mongoose = require('mongoose');
const SystemSetting = require('../models/SystemSetting');

let cachedMaintenance = {
  enabled: false,
  message: 'Sorry, maintenance is currently in progress. Please try again later.',
  updatedAt: null,
  updatedBy: null,
};

async function getMaintenanceStatus() {
  if (process.env.OFFLINE_MODE === 'true' || mongoose.connection.readyState !== 1) {
    return { ...cachedMaintenance };
  }
  try {
    const setting = await SystemSetting.findOne({ key: 'site_config' }).lean();
    if (setting && setting.maintenance) {
      cachedMaintenance = {
        enabled: Boolean(setting.maintenance.enabled),
        message:
          setting.maintenance.message ||
          'Sorry, maintenance is currently in progress. Please try again later.',
        updatedAt: setting.maintenance.updatedAt || new Date(),
        updatedBy: setting.maintenance.updatedBy || null,
      };
    } else {
      cachedMaintenance.enabled = false;
    }
  } catch (err) {
    // Fail-safe: if DB is not ready or query fails, default to normal operations
  }
  return { ...cachedMaintenance };
}

function getCachedMaintenanceStatus() {
  return { ...cachedMaintenance };
}

async function setMaintenanceStatus({ enabled, message, updatedBy }) {
  const cleanMsg =
    (message && String(message).trim()) ||
    'Sorry, maintenance is currently in progress. Please try again later.';

  if (process.env.OFFLINE_MODE === 'true' || mongoose.connection.readyState !== 1) {
    cachedMaintenance = {
      enabled: Boolean(enabled),
      message: cleanMsg,
      updatedAt: new Date(),
      updatedBy: updatedBy || 'admin',
    };
    return { ...cachedMaintenance };
  }

  const doc = await SystemSetting.findOneAndUpdate(
    { key: 'site_config' },
    {
      $set: {
        'maintenance.enabled': Boolean(enabled),
        'maintenance.message': cleanMsg,
        'maintenance.updatedAt': new Date(),
        'maintenance.updatedBy': updatedBy || 'admin',
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();

  cachedMaintenance = {
    enabled: Boolean(doc.maintenance?.enabled),
    message: doc.maintenance?.message || cleanMsg,
    updatedAt: doc.maintenance?.updatedAt || new Date(),
    updatedBy: doc.maintenance?.updatedBy || updatedBy,
  };

  return { ...cachedMaintenance };
}

module.exports = {
  getMaintenanceStatus,
  getCachedMaintenanceStatus,
  setMaintenanceStatus,
};
