const { getEffectiveEntitlements } = require('../services/entitlementService');

/**
 * Middleware to enforce quota limits for workspace actions
 * Supports: 'savedPapers', 'collections', 'topicAlerts', 'comparisons', 'bulkExport'
 */
function enforceQuota(resourceType) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
      }

      const entitlements = await getEffectiveEntitlements(req.user._id);
      req.entitlements = entitlements;

      if (resourceType === 'savedPapers') {
        const count = entitlements.usage.savedPapersCount;
        const limit = entitlements.quotas.maxSavedPapers;
        if (count >= limit) {
          return res.status(403).json({
            message: `You have reached the limit of ${limit} saved papers on your ${entitlements.label}. Upgrade to Premium for up to 1,000 saved papers.`,
            code: 'QUOTA_EXCEEDED',
            currentPlan: entitlements.plan,
            limit,
          });
        }
      } else if (resourceType === 'collections') {
        const count = entitlements.usage.collectionsCount;
        const limit = entitlements.quotas.maxCollections;
        if (count >= limit) {
          return res.status(403).json({
            message: `You have reached the limit of ${limit} collection(s) on your ${entitlements.label}. Upgrade to Premium for up to 50 collections.`,
            code: 'QUOTA_EXCEEDED',
            currentPlan: entitlements.plan,
            limit,
          });
        }
      } else if (resourceType === 'topicAlerts') {
        const count = entitlements.usage.topicAlertsCount;
        const limit = entitlements.quotas.maxTopicAlerts;
        if (limit === 0 || count >= limit) {
          return res.status(403).json({
            message: `Topic alerts require an active Premium membership or 7-day trial. Upgrade to activate up to 10 automated inquiry alerts.`,
            code: 'FEATURE_LOCKED',
            currentPlan: entitlements.plan,
            limit,
          });
        }
      } else if (resourceType === 'comparisons') {
        if (!entitlements.quotas.canSaveComparisons) {
          return res.status(403).json({
            message: `Saving persistent comparison matrices is a Premium feature. Upgrade to Premium or start your 7-day trial to synthesize and save literature reviews.`,
            code: 'FEATURE_LOCKED',
            currentPlan: entitlements.plan,
          });
        }
        const count = entitlements.usage.comparisonsCount || 0;
        const limit = entitlements.quotas.maxComparisons;
        if (typeof limit === 'number' && count >= limit) {
          return res.status(403).json({
            message: `You have reached the limit of ${limit} saved comparison matrix on your ${entitlements.label}. Upgrade to Premium for up to 50 saved comparisons.`,
            code: 'QUOTA_EXCEEDED',
            currentPlan: entitlements.plan,
            limit,
          });
        }
      } else if (resourceType === 'comparisonsAccess') {
        if (!entitlements.quotas.canSaveComparisons) {
          return res.status(403).json({
            message: `Saving or modifying comparison matrices requires Premium access or an active 7-day trial.`,
            code: 'FEATURE_LOCKED',
            currentPlan: entitlements.plan,
          });
        }
      } else if (resourceType === 'bulkExport') {
        if (!entitlements.quotas.canExportBulk) {
          return res.status(403).json({
            message: `Bulk BibTeX and RIS exports require Premium access. Upgrade to export collections.`,
            code: 'FEATURE_LOCKED',
            currentPlan: entitlements.plan,
          });
        }
      } else if (resourceType === 'datasets') {
        if (!entitlements.quotas.canAccessPaperDatasets) {
          return res.status(403).json({
            message: 'Direct dataset access for publications is a Premium feature. The Standard Academic plan does not include access to publication datasets. Upgrade to Premium or activate your 7-day free trial for unlimited dataset access.',
            code: 'FEATURE_LOCKED',
            currentPlan: entitlements.plan,
            feature: 'paper_datasets',
          });
        }
      }

      next();
    } catch (err) {
      console.error('Entitlement check error:', err);
      return res.status(500).json({ message: 'Error checking membership entitlements.' });
    }
  };
}

module.exports = {
  enforceQuota,
};
