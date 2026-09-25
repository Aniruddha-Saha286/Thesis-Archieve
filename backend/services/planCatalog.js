/**
 * Centralized, Versioned Academic Membership Plan Catalog
 * Single authoritative source of truth for pricing, durations, quotas, and display metadata.
 */

const PLAN_CATALOG = {
  free: {
    code: 'free',
    name: 'Standard Academic Plan',
    label: 'Standard Academic Plan',
    price: 0,
    pricePaisa: 0,
    currency: 'BDT',
    durationMonths: 0,
    durationDisplay: 'Permanent Free Access',
    quotas: {
      maxSavedPapers: 10,
      maxCollections: 1,
      maxTopicAlerts: 0,
      canExportBulk: false,
      canSaveComparisons: false,
      canAccessPaperDatasets: false, // Paper-specific dataset discovery locked
      dailySearchLimit: 10,          // 10 committed searches per Asia/Dhaka day
      dailyDatasetLookupLimit: 0,
    },
    features: [
      '10 committed paper searches per Asia/Dhaka calendar day',
      'Source links & authentic PDF access',
      'Individual APA, BibTeX, & RIS citations',
      'Up to 10 saved papers in personal library',
      '1 research project collection',
      'General open science dataset search',
      'Paper-specific dataset discovery locked (Trial or Premium required)',
      'Export personal library anytime',
    ],
    isPaid: false,
  },

  trial_v2: {
    code: 'trial_v2',
    name: '7-Day Research Trial',
    label: '7-Day Research Trial',
    price: 0,
    pricePaisa: 0,
    currency: 'BDT',
    durationDays: 7,
    durationDisplay: '7 calendar days',
    quotas: {
      maxSavedPapers: 50,
      maxCollections: 3,
      maxTopicAlerts: 1,
      canExportBulk: false,           // Individual citations allowed; bulk export disabled
      canSaveComparisons: true,
      maxComparisons: 1,
      canAccessPaperDatasets: true,   // Paper-specific dataset discovery enabled
      dailySearchLimit: 20,           // 20 committed paper searches per Asia/Dhaka day
      dailyDatasetLookupLimit: 5,     // Up to 5 paper dataset lookups per day
    },
    features: [
      '20 committed paper searches per Asia/Dhaka calendar day',
      'Up to 5 paper-specific dataset lookups per day',
      'Up to 50 saved papers in personal library',
      '3 research project collections',
      '1 saved literature comparison matrix',
      '1 active topic alert for new research',
      'Individual APA, BibTeX, & RIS citations (bulk export reserved for Premium)',
      'General dataset search access',
      'One trial per eligible account · No payment or automatic debit',
    ],
    isPaid: false,
  },

  // Legacy Trial policy (v1) for grandfathering active trials created prior to policy v2
  trial_v1: {
    code: 'trial_v1',
    name: 'Legacy 7-Day Trial (Grandfathered)',
    label: '7-Day Premium Trial (Legacy)',
    price: 0,
    pricePaisa: 0,
    currency: 'BDT',
    durationDays: 7,
    durationDisplay: '7 calendar days',
    quotas: {
      maxSavedPapers: 1000,
      maxCollections: 50,
      maxTopicAlerts: 10,
      canExportBulk: true,
      canSaveComparisons: true,
      canAccessPaperDatasets: true,
      dailySearchLimit: null,        // Unlimited
      dailyDatasetLookupLimit: null, // Unlimited
    },
    features: [
      'Unlimited daily scholarly searches',
      'Unlimited paper-specific dataset discovery',
      'Up to 1,000 saved papers',
      'Up to 50 project collections',
      'Bulk BibTeX & RIS exports',
    ],
    isPaid: false,
  },

  premium_6m: {
    code: 'premium_6m',
    name: 'Premium Scholarly Discovery (6 Months)',
    label: 'Premium Scholarly Discovery',
    price: 500,
    pricePaisa: 50000,
    currency: 'BDT',
    durationMonths: 6,
    durationDisplay: '6 calendar months',
    quotas: {
      maxSavedPapers: 1000,
      maxCollections: 50,
      maxTopicAlerts: 10,
      canExportBulk: true,
      canSaveComparisons: true,
      canAccessPaperDatasets: true,
      dailySearchLimit: null,        // Unlimited
      dailyDatasetLookupLimit: null, // Unlimited
    },
    features: [
      'Unlimited daily scholarly searches',
      'Unlimited paper-specific dataset discovery',
      'Up to 1,000 saved papers in personal library',
      'Up to 50 research project collections',
      'Bulk BibTeX & RIS bibliography exports',
      'Persistent literature comparison matrices with CSV export',
      'Up to 10 automated topic inquiry alerts',
      'Full research workspace tools',
      'Manual renewal via bKash (no automatic debit)',
      'Preserves all saved data after expiration',
    ],
    isPaid: true,
  },

  pro_max_12m: {
    code: 'pro_max_12m',
    name: 'Pro Max Annual — Premium benefits for 12 months',
    label: 'Pro Max Annual',
    price: 850,
    pricePaisa: 85000,
    currency: 'BDT',
    durationMonths: 12,
    durationDisplay: '12 calendar months',
    savingsNote: 'Save BDT 150 (15%) versus two BDT 500 six-month memberships',
    quotas: {
      maxSavedPapers: 1000,
      maxCollections: 50,
      maxTopicAlerts: 10,
      canExportBulk: true,
      canSaveComparisons: true,
      canAccessPaperDatasets: true,
      dailySearchLimit: null,        // Unlimited
      dailyDatasetLookupLimit: null, // Unlimited
    },
    features: [
      'All Premium research benefits for a full 12 calendar months',
      'Save BDT 150 (15%) versus two 6-month memberships',
      'Unlimited daily scholarly searches',
      'Unlimited paper-specific dataset discovery',
      'Up to 1,000 saved papers in personal library',
      'Up to 50 research collections',
      'Bulk BibTeX & RIS exports',
      'Persistent literature comparison matrices with CSV export',
      'Up to 10 automated topic inquiry alerts',
      'Manual renewal via bKash (no automatic debit)',
      'Preserves all saved data after expiration',
    ],
    isPaid: true,
  },

  admin: {
    code: 'admin',
    name: 'Depository Administrator',
    label: 'Depository Administrator',
    price: 0,
    pricePaisa: 0,
    currency: 'BDT',
    durationMonths: 0,
    durationDisplay: 'Operational Role',
    quotas: {
      maxSavedPapers: 5000,
      maxCollections: 100,
      maxTopicAlerts: 50,
      canExportBulk: true,
      canSaveComparisons: true,
      canAccessPaperDatasets: true,
      dailySearchLimit: null,
      dailyDatasetLookupLimit: null,
    },
    features: ['Depository Operations & Moderator Privileges'],
    isPaid: false,
  },
};

/**
 * Normalizes any legacy or alias plan code to its canonical version.
 */
function resolvePlanCode(code) {
  if (!code) return 'free';
  const c = String(code).trim().toLowerCase();
  if (c === 'premium' || c === 'premium_6m') return 'premium_6m';
  if (c === 'pro_max' || c === 'pro_max_12m' || c === 'promax' || c === 'promax_12m') return 'pro_max_12m';
  if (c === 'trial' || c === 'trial_v2') return 'trial_v2';
  if (c === 'trial_v1') return 'trial_v1';
  if (c === 'admin') return 'admin';
  return 'free';
}

/**
 * Retrieves a plan definition by code or alias.
 */
function getPlan(code) {
  const canonical = resolvePlanCode(code);
  return PLAN_CATALOG[canonical] || PLAN_CATALOG.free;
}

/**
 * Returns the public display metadata for all standard selectable plans.
 */
function getPublicPlans() {
  return [
    {
      id: 'free',
      code: 'free',
      name: PLAN_CATALOG.free.name,
      label: PLAN_CATALOG.free.label,
      price: PLAN_CATALOG.free.price,
      pricePaisa: PLAN_CATALOG.free.pricePaisa,
      currency: PLAN_CATALOG.free.currency,
      duration: PLAN_CATALOG.free.durationDisplay,
      features: PLAN_CATALOG.free.features,
      limits: PLAN_CATALOG.free.quotas,
    },
    {
      id: 'trial_v2',
      code: 'trial_v2',
      name: PLAN_CATALOG.trial_v2.name,
      label: PLAN_CATALOG.trial_v2.label,
      price: PLAN_CATALOG.trial_v2.price,
      pricePaisa: PLAN_CATALOG.trial_v2.pricePaisa,
      currency: PLAN_CATALOG.trial_v2.currency,
      duration: PLAN_CATALOG.trial_v2.durationDisplay,
      features: PLAN_CATALOG.trial_v2.features,
      limits: PLAN_CATALOG.trial_v2.quotas,
    },
    {
      id: 'premium_6m',
      code: 'premium_6m',
      name: PLAN_CATALOG.premium_6m.name,
      label: PLAN_CATALOG.premium_6m.label,
      price: PLAN_CATALOG.premium_6m.price,
      pricePaisa: PLAN_CATALOG.premium_6m.pricePaisa,
      currency: PLAN_CATALOG.premium_6m.currency,
      duration: PLAN_CATALOG.premium_6m.durationDisplay,
      features: PLAN_CATALOG.premium_6m.features,
      limits: PLAN_CATALOG.premium_6m.quotas,
    },
    {
      id: 'pro_max_12m',
      code: 'pro_max_12m',
      name: PLAN_CATALOG.pro_max_12m.name,
      label: PLAN_CATALOG.pro_max_12m.label,
      price: PLAN_CATALOG.pro_max_12m.price,
      pricePaisa: PLAN_CATALOG.pro_max_12m.pricePaisa,
      currency: PLAN_CATALOG.pro_max_12m.currency,
      duration: PLAN_CATALOG.pro_max_12m.durationDisplay,
      savingsNote: PLAN_CATALOG.pro_max_12m.savingsNote,
      features: PLAN_CATALOG.pro_max_12m.features,
      limits: PLAN_CATALOG.pro_max_12m.quotas,
    },
  ];
}

module.exports = {
  PLAN_CATALOG,
  resolvePlanCode,
  getPlan,
  getPublicPlans,
};
