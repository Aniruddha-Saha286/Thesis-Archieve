/**
 * Usage Reservation Service
 * Atomic, idempotent quota reservation for scholarly discovery searches and dataset lookups.
 * Enforces Asia/Dhaka day boundaries and protects against quota abuse during instant filter refinements.
 */

const crypto = require('crypto');
const { getDhakaDateString } = require('../utils/dhakaDate');
const User = require('../models/User');

// In-memory idempotency store for billed actions/contexts: Map<`${scope}:${metric}:${date}`, Set<idempotencyKey>>
const billedContexts = new Map();

// In-memory guest search usage store: Map<clientIp, { date: string, count: number }>
const guestSearchStore = new Map();

// Clean up stale date entries once every hour
setInterval(() => {
  const today = getDhakaDateString(new Date());
  for (const [key] of billedContexts.entries()) {
    if (!key.endsWith(`:${today}`)) {
      billedContexts.delete(key);
    }
  }
  for (const [ip, record] of guestSearchStore.entries()) {
    if (record.date !== today) {
      guestSearchStore.delete(ip);
    }
  }
}, 60 * 60 * 1000).unref();

function getContextKey(scope, metric, dateStr) {
  return `${scope}:${metric}:${dateStr}`;
}

/**
 * Checks if a specific search context or action has already been billed for today.
 */
function isAlreadyBilled(scope, metric, idempotencyKey, dateStr) {
  if (!idempotencyKey) return false;
  const contextKey = getContextKey(scope, metric, dateStr);
  const billedSet = billedContexts.get(contextKey);
  return Boolean(billedSet && billedSet.has(idempotencyKey));
}

/**
 * Marks a context or action ID as billed for today.
 */
function markBilled(scope, metric, idempotencyKey, dateStr) {
  if (!idempotencyKey) return;
  const contextKey = getContextKey(scope, metric, dateStr);
  if (!billedContexts.has(contextKey)) {
    billedContexts.set(contextKey, new Set());
  }
  billedContexts.get(contextKey).add(idempotencyKey);
}

function getUsageField(metric) {
  if (metric === 'summary') return 'dailySummaryUsage';
  if (metric === 'dataset') return 'dailyDatasetUsage';
  return 'dailySearchUsage';
}

function getQuotaExceededCode(metric) {
  if (metric === 'summary') return 'SUMMARY_QUOTA_EXCEEDED';
  if (metric === 'dataset') return 'DATASET_QUOTA_EXCEEDED';
  return 'SEARCH_QUOTA_EXCEEDED';
}

/**
 * Atomically reserves a usage credit (search query, dataset lookup, or paper summary) with idempotency.
 * Refinements under an already-billed context or replayed actionId
 * do NOT decrement credits.
 */
async function reserveUsage({
  user = null,
  scope = 'guest',
  metric = 'search',
  idempotencyKey = null,
  limit = null, // null means unlimited
  dateStr = null,
}) {
  const todayDhaka = dateStr || getDhakaDateString(new Date());
  const usageField = getUsageField(metric);
  const quotaExceededCode = getQuotaExceededCode(metric);

  // Check if this action/context has already been billed
  if (idempotencyKey && isAlreadyBilled(scope, metric, idempotencyKey, todayDhaka)) {
    let currentCount = 0;
    if (user) {
      currentCount = (user[usageField] && user[usageField].date === todayDhaka)
        ? (user[usageField].count || 0)
        : 0;
    } else {
      const gu = guestSearchStore.get(`${scope}:${metric}`);
      currentCount = (gu && gu.date === todayDhaka) ? gu.count : 0;
    }

    return {
      allowed: true,
      billed: false,
      alreadyBilled: true,
      count: currentCount,
      remaining: limit !== null ? Math.max(0, limit - currentCount) : 'unlimited',
      limit,
    };
  }

  // If user is authenticated
  if (user) {
    if (!user[usageField] || user[usageField].date !== todayDhaka) {
      user[usageField] = { date: todayDhaka, count: 0 };
    }

    const currentCount = user[usageField].count || 0;

    // Check limit
    if (limit !== null && currentCount >= limit) {
      return {
        allowed: false,
        billed: false,
        code: quotaExceededCode,
        count: currentCount,
        used: currentCount,
        limit,
        remaining: 0,
      };
    }

    // Atomically increment and save
    user[usageField].count = currentCount + 1;
    await user.save();

    if (idempotencyKey) {
      markBilled(scope, metric, idempotencyKey, todayDhaka);
    }

    const updatedCount = user[usageField].count;
    return {
      allowed: true,
      billed: true,
      alreadyBilled: false,
      count: updatedCount,
      remaining: limit !== null ? Math.max(0, limit - updatedCount) : 'unlimited',
      limit,
    };
  }

  // Unauthenticated guest user
  const guestKey = `${scope}:${metric}`;
  let guestUsage = guestSearchStore.get(guestKey);
  if (!guestUsage || guestUsage.date !== todayDhaka) {
    guestUsage = { date: todayDhaka, count: 0 };
    guestSearchStore.set(guestKey, guestUsage);
  }

  if (limit !== null && guestUsage.count >= limit) {
    return {
      allowed: false,
      billed: false,
      code: quotaExceededCode,
      count: guestUsage.count,
      used: guestUsage.count,
      limit,
      remaining: 0,
    };
  }

  guestUsage.count += 1;
  if (idempotencyKey) {
    markBilled(scope, metric, idempotencyKey, todayDhaka);
  }

  return {
    allowed: true,
    billed: true,
    alreadyBilled: false,
    count: guestUsage.count,
    remaining: limit !== null ? Math.max(0, limit - guestUsage.count) : 'unlimited',
    limit,
  };
}

/**
 * Releases a reserved credit in case of downstream technical failure.
 */
async function releaseReservedCredit({
  user = null,
  scope = 'guest',
  metric = 'search',
  idempotencyKey = null,
  dateStr = null,
}) {
  const todayDhaka = dateStr || getDhakaDateString(new Date());
  const usageField = getUsageField(metric);

  if (idempotencyKey) {
    const contextKey = getContextKey(scope, metric, todayDhaka);
    const billedSet = billedContexts.get(contextKey);
    if (billedSet) {
      billedSet.delete(idempotencyKey);
    }
  }

  if (user && user[usageField] && user[usageField].date === todayDhaka) {
    user[usageField].count = Math.max(0, (user[usageField].count || 1) - 1);
    await user.save().catch(() => {});
  } else if (!user) {
    const guestKey = `${scope}:${metric}`;
    const gu = guestSearchStore.get(guestKey);
    if (gu && gu.date === todayDhaka) {
      gu.count = Math.max(0, gu.count - 1);
    }
  }
}

/**
 * Creates a unique search context identifier for tracking inquiry refinements.
 */
function createSearchContextId() {
  return `sctx_${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = {
  reserveUsage,
  releaseReservedCredit,
  isAlreadyBilled,
  markBilled,
  createSearchContextId,
  guestSearchStore,
  billedContexts,
};
