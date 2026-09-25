const User = require('../models/User');
const MembershipPeriod = require('../models/MembershipPeriod');
const TrialGrant = require('../models/TrialGrant');
const { getDhakaDateString } = require('../utils/dhakaDate');
const { getPlan, PLAN_CATALOG, resolvePlanCode } = require('./planCatalog');

// Backwards-compatible limits map
const PLAN_LIMITS = {
  free: PLAN_CATALOG.free.quotas,
  trial: PLAN_CATALOG.trial_v2.quotas,
  trial_v1: PLAN_CATALOG.trial_v1.quotas,
  trial_v2: PLAN_CATALOG.trial_v2.quotas,
  premium: PLAN_CATALOG.premium_6m.quotas,
  premium_6m: PLAN_CATALOG.premium_6m.quotas,
  pro_max_12m: PLAN_CATALOG.pro_max_12m.quotas,
  admin: PLAN_CATALOG.admin.quotas,
};

/**
 * Derives the effective real-time entitlements of a user from server time.
 * Evaluates active paid periods, active trials, and account approval status.
 * Enforces: startsAt <= serverNow < expiresAt.
 * Note: Never relies on client state or scheduled background workers for authorization.
 */
async function getEffectiveEntitlements(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date();
  const todayDhaka = getDhakaDateString(now);
  const dailySearchesUsed = (user.dailySearchUsage && user.dailySearchUsage.date === todayDhaka)
    ? (user.dailySearchUsage.count || 0)
    : 0;

  // Admins always have maximum operational permissions
  if (user.role === 'admin') {
    return {
      plan: 'admin',
      planCode: 'admin',
      label: 'Depository Administrator',
      isActive: true,
      isPaid: false,
      hasPaidAccess: true,
      expiresAt: null,
      source: 'role',
      trialEligible: false,
      quotas: PLAN_CATALOG.admin.quotas,
      usage: {
        savedPapersCount: user.savedPapers?.length || 0,
        collectionsCount: user.collections?.length || 0,
        topicAlertsCount: user.topicAlerts?.length || 0,
        comparisonsCount: user.comparisons?.length || 0,
        dailySearchesUsed,
        dailyDatasetLookupsUsed: 0,
      },
    };
  }

  // 1. Check for active paid MembershipPeriod: startsAt <= now < expiresAt
  const activePaid = await MembershipPeriod.findOne({
    user: user._id,
    status: 'active',
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  }).sort({ expiresAt: -1 });

  if (activePaid) {
    const planDef = getPlan(activePaid.plan || 'premium_6m');
    return {
      plan: planDef.code,
      planCode: planDef.code,
      label: planDef.label,
      isActive: true,
      isPaid: true,
      hasPaidAccess: true,
      startsAt: activePaid.startsAt,
      expiresAt: activePaid.expiresAt,
      source: 'paid',
      periodId: activePaid._id,
      trialEligible: false,
      quotas: planDef.quotas,
      usage: {
        savedPapersCount: user.savedPapers?.length || 0,
        collectionsCount: user.collections?.length || 0,
        topicAlertsCount: user.topicAlerts?.length || 0,
        comparisonsCount: user.comparisons?.length || 0,
        dailySearchesUsed,
        dailyDatasetLookupsUsed: 0,
      },
    };
  }

  // 2. Check for active TrialGrant: startsAt <= now < expiresAt
  const activeTrial = await TrialGrant.findOne({
    user: user._id,
    status: 'active',
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  });

  if (activeTrial) {
    // Grandfathered: missing policyVersion defaults to v1
    const policyVersion = activeTrial.policyVersion || 'v1';
    const planKey = policyVersion === 'v1' ? 'trial_v1' : 'trial_v2';
    const planDef = PLAN_CATALOG[planKey];

    const dailyDatasetLookupsUsed = (activeTrial.dailyDatasetLookups && activeTrial.dailyDatasetLookups.date === todayDhaka)
      ? (activeTrial.dailyDatasetLookups.count || 0)
      : 0;

    return {
      plan: 'trial',
      planCode: planKey,
      label: planDef.label,
      policyVersion,
      isActive: true,
      isPaid: false,
      hasPaidAccess: false, // Trial has distinct research limits, not paid tier
      startsAt: activeTrial.startsAt,
      expiresAt: activeTrial.expiresAt,
      source: 'trial',
      trialId: activeTrial._id,
      trialEligible: false,
      quotas: planDef.quotas,
      usage: {
        savedPapersCount: user.savedPapers?.length || 0,
        collectionsCount: user.collections?.length || 0,
        topicAlertsCount: user.topicAlerts?.length || 0,
        comparisonsCount: user.comparisons?.length || 0,
        dailySearchesUsed,
        dailyDatasetLookupsUsed,
      },
    };
  }

  // 3. Fallback: Free Plan
  // Check if eligible for 7-day trial:
  // Must be verified/approved, and has never had a trial or paid membership
  const [existingTrial, existingPaid] = await Promise.all([
    TrialGrant.findOne({ user: user._id }),
    MembershipPeriod.findOne({ user: user._id }),
  ]);

  const trialEligible = Boolean(user.status === 'approved' && !existingTrial && !existingPaid);

  return {
    plan: 'free',
    planCode: 'free',
    label: PLAN_CATALOG.free.label,
    isActive: false,
    isPaid: false,
    hasPaidAccess: false,
    expiresAt: null,
    source: 'free',
    trialEligible,
    quotas: PLAN_CATALOG.free.quotas,
    usage: {
      savedPapersCount: user.savedPapers?.length || 0,
      collectionsCount: user.collections?.length || 0,
      topicAlertsCount: user.topicAlerts?.length || 0,
      comparisonsCount: user.comparisons?.length || 0,
      dailySearchesUsed,
      dailyDatasetLookupsUsed: 0,
    },
  };
}

module.exports = {
  getEffectiveEntitlements,
  PLAN_LIMITS,
};
