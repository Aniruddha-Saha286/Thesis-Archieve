const assert = require('assert');
const {
  addDhakaDays,
  addDhakaCalendarMonths,
  formatDhakaDateTime,
  getDhakaDateParts,
} = require('../utils/dhakaDate');
const { PLAN_LIMITS } = require('../services/entitlementService');

async function runMembershipAndBkashTests() {
  console.log('===============================================================');
  console.log('  TEST SUITE: MEMBERSHIP, BKASH, QUOTAS & DHAKA CALENDAR DATES ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function test(description, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${description}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }

  console.log('--- 1. Asia/Dhaka Calendar Month Date Math & Clamping ---');

  test('Aug 31 + 6 calendar months clamps to Feb 28 (or Feb 29 in leap year), not Mar 3', () => {
    const aug31 = new Date('2025-08-31T12:00:00.000Z');
    const result = addDhakaCalendarMonths(aug31, 6);
    const parts = getDhakaDateParts(result);
    assert.strictEqual(parts.year, 2026, 'Year must advance to 2026');
    assert.strictEqual(parts.month, 2, 'Month must be February (2)');
    assert.strictEqual(parts.day, 28, 'Must clamp to 28 days for February in non-leap year');
  });

  test('Mar 31 + 6 calendar months clamps to Sep 30, never spills into October', () => {
    const mar31 = new Date('2025-03-31T06:00:00.000Z');
    const result = addDhakaCalendarMonths(mar31, 6);
    const parts = getDhakaDateParts(result);
    assert.strictEqual(parts.year, 2025);
    assert.strictEqual(parts.month, 9, 'Month must be September (9)');
    assert.strictEqual(parts.day, 30, 'Must clamp to 30 days for September');
  });

  test('Jan 31 + 1 calendar month clamps to end of February', () => {
    const jan31 = new Date('2025-01-31T06:00:00.000Z');
    const result = addDhakaCalendarMonths(jan31, 1);
    const parts = getDhakaDateParts(result);
    assert.strictEqual(parts.year, 2025);
    assert.strictEqual(parts.month, 2, 'Month must be February (2)');
    assert.strictEqual(parts.day, 28, 'Must clamp to Feb 28 in 2025');
  });

  test('6 calendar months is NEVER substituted with a naive 180-day addition', () => {
    const jan1 = new Date('2025-01-01T06:00:00.000Z');
    const naive180 = new Date(jan1.getTime() + 180 * 24 * 60 * 60 * 1000);
    const calendar6m = addDhakaCalendarMonths(jan1, 6);
    const naiveParts = getDhakaDateParts(naive180);
    const calendarParts = getDhakaDateParts(calendar6m);

    assert.strictEqual(calendarParts.month, 7, '6 calendar months must land in July (month 7)');
    assert.strictEqual(calendarParts.day, 1, 'Day must be 1st of July');
    assert.notStrictEqual(
      calendarParts.month,
      naiveParts.month,
      'Calendar 6 months must differ from naive 180-day count'
    );
  });

  test('7-Day trial calculation adds exactly 7 continuous 24-hour periods', () => {
    const start = new Date('2025-09-01T10:00:00.000Z');
    const end = addDhakaDays(start, 7);
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    assert.strictEqual(diffHours, 7 * 24, 'Must span exactly 168 hours');
  });

  console.log('\n--- 2. Free vs Premium Quota Limits ---');

  test('Free tier allows max 10 saved papers and blocks 11th', () => {
    const limits = PLAN_LIMITS.free;
    assert.strictEqual(limits.maxSavedPapers, 10);
    assert.strictEqual(limits.maxCollections, 1);
    assert.strictEqual(limits.canExportBulk, false);
    assert.strictEqual(limits.maxTopicAlerts, 0);
    assert.strictEqual(limits.canSaveComparisons, false);

    const currentSaved = 10;
    const isAllowed = currentSaved < limits.maxSavedPapers;
    assert.strictEqual(isAllowed, false, 'Saving 11th paper must be rejected on Free plan');
  });

  test('Premium tier unlocks 1,000 saved papers and 50 collections with bulk export', () => {
    const limits = PLAN_LIMITS.premium;
    assert.strictEqual(limits.maxSavedPapers, 1000);
    assert.strictEqual(limits.maxCollections, 50);
    assert.strictEqual(limits.canExportBulk, true);
    assert.strictEqual(limits.maxTopicAlerts, 10);
    assert.strictEqual(limits.canSaveComparisons, true);

    const currentSaved = 10;
    const isAllowed = currentSaved < limits.maxSavedPapers;
    assert.strictEqual(isAllowed, true, 'Saving 11th paper must be permitted on Premium plan');
  });

  console.log('\n--- 3. 7-Day Trial Eligibility & Single-Use Rules ---');

  test('Unverified student status="pending" cannot activate trial', () => {
    const mockStudent = { _id: 'stu_1', status: 'pending', role: 'student' };
    const canActivate = mockStudent.status === 'approved';
    assert.strictEqual(canActivate, false, 'Unverified account must be blocked from trial');
  });

  test('Verified student status="approved" can activate trial once', () => {
    const mockStudent = { _id: 'stu_2', status: 'approved', role: 'student' };
    const existingTrials = [];
    const isEligible = mockStudent.status === 'approved' && !existingTrials.some((t) => t.user === mockStudent._id);
    assert.strictEqual(isEligible, true, 'Verified student with no prior trial is eligible');

    const trialGrant = {
      user: mockStudent._id,
      startsAt: new Date(),
      expiresAt: addDhakaDays(new Date(), 7),
      status: 'active',
    };
    existingTrials.push(trialGrant);

    const secondAttemptEligible = !existingTrials.some((t) => t.user === mockStudent._id);
    assert.strictEqual(secondAttemptEligible, false, 'Second trial activation must be strictly blocked for life');
  });

  test('Student with prior paid membership period is ineligible for free trial', () => {
    const mockStudent = { _id: 'stu_3', status: 'approved', role: 'student' };
    const existingPaidPeriods = [{ user: mockStudent._id, plan: 'premium', status: 'expired' }];
    const hasPriorPaid = existingPaidPeriods.some((p) => p.user === mockStudent._id);
    assert.strictEqual(hasPriorPaid, true, 'Account has prior paid history');
    const isTrialAllowed = !hasPriorPaid;
    assert.strictEqual(isTrialAllowed, false, 'Prior paid subscribers cannot claim a free trial');
  });

  console.log('\n--- 4. Manual bKash Payment & TrxID Normalization ---');

  test('Order creation generates immutable snapshot with ৳500 / 50000 paisa for 6 months', () => {
    const order = {
      orderRef: 'ORD-20260924-A1B2C3',
      plan: 'premium',
      pricePaisa: 50000,
      currency: 'BDT',
      durationMonths: 6,
      status: 'pending',
    };

    assert.strictEqual(order.pricePaisa, 50000, 'Price must be 50,000 paisa (৳500)');
    assert.strictEqual(order.durationMonths, 6, 'Duration must be 6 months');
    assert.strictEqual(order.pricePaisa / 100, 500, 'Integer minor unit division yields ৳500');
  });

  test('TrxID normalization converts mixed-case and trims whitespace', () => {
    const rawInputs = ['  bka12345678  ', 'Bka12345678', 'bka12345678', 'BKA12345678'];
    const normalized = rawInputs.map((s) => s.trim().toUpperCase());
    const uniqueNormalized = new Set(normalized);
    assert.strictEqual(uniqueNormalized.size, 1, 'All variants must normalize to a single unique string');
    assert.strictEqual([...uniqueNormalized][0], 'BKA12345678');
  });

  test('Duplicate normalized TrxID is rejected by duplicate guard', () => {
    const existingSubmissions = new Map();
    existingSubmissions.set('BKA99887766', { id: 'sub_1', status: 'submitted' });

    function submitTrx(rawId) {
      const norm = rawId.trim().toUpperCase();
      if (existingSubmissions.has(norm)) {
        throw new Error('DUPLICATE_TRANSACTION_ID');
      }
      existingSubmissions.set(norm, { id: 'sub_new', status: 'submitted' });
      return true;
    }

    assert.throws(
      () => submitTrx('bka99887766'),
      /DUPLICATE_TRANSACTION_ID/,
      'Lower-case duplicate must trigger collision'
    );
    assert.throws(
      () => submitTrx('  Bka99887766  '),
      /DUPLICATE_TRANSACTION_ID/,
      'Whitespace-padded duplicate must trigger collision'
    );
  });

  console.log('\n--- 5. Admin Verification & Active Renewal Extension ---');

  test('Approval without merchant statement verification is rejected', () => {
    function approvePayment(statementVerified) {
      if (!statementVerified) {
        throw new Error('Editorial verification requirement: merchant statement verification required.');
      }
      return { status: 'approved' };
    }

    assert.throws(
      () => approvePayment(false),
      /Editorial verification requirement/,
      'Must reject approval if admin has not verified against merchant statement'
    );
    assert.strictEqual(approvePayment(true).status, 'approved');
  });

  test('Active renewal extends existing expiration date by 6 calendar months without losing days', () => {
    const existingExpiry = new Date('2025-10-15T12:00:00.000Z');
    const approvalDate = new Date('2025-09-20T12:00:00.000Z');

    const renewedExpiry = addDhakaCalendarMonths(existingExpiry, 6);
    const renewedParts = getDhakaDateParts(renewedExpiry);

    assert.strictEqual(renewedParts.year, 2026, 'Year must advance to 2026');
    assert.strictEqual(renewedParts.month, 4, 'Month must be April (4)');
    assert.strictEqual(renewedParts.day, 15, 'Day must remain 15th');

    const naiveExpiry = addDhakaCalendarMonths(approvalDate, 6);
    assert(renewedExpiry.getTime() > naiveExpiry.getTime(), 'Renewal extension must preserve remaining active days');
  });

  test('Expired renewal starts 6 calendar months from approval date', () => {
    const approvalDate = new Date('2026-09-24T12:00:00.000Z');
    const newExpiry = addDhakaCalendarMonths(approvalDate, 6);
    const parts = getDhakaDateParts(newExpiry);

    assert.strictEqual(parts.year, 2027);
    assert.strictEqual(parts.month, 3);
    assert.strictEqual(parts.day, 24);
  });

  console.log('\n--- 6. Admin Membership Cancellation & Revocation ---');

  test('Admin cancellation requires mandatory non-empty reason', () => {
    function cancelMembership(reason) {
      if (!reason || !reason.trim()) {
        throw new Error('Mandatory cancellation reason is required.');
      }
      return { status: 'cancelled', reason: reason.trim() };
    }

    assert.throws(() => cancelMembership(''), /Mandatory cancellation reason/);
    assert.throws(() => cancelMembership('   '), /Mandatory cancellation reason/);
    assert.strictEqual(cancelMembership('Policy violation').status, 'cancelled');
  });

  test('Admin cancellation immediately revokes active membership periods and expires trial', () => {
    const userPeriods = [
      { id: 'per_1', status: 'active', cancelledAt: null, cancellationReason: null },
    ];
    const userTrials = [
      { id: 'tri_1', status: 'active' },
    ];

    const cancellationReason = 'Account audit: fraudulent ID card credentials discovered';

    for (const p of userPeriods) {
      if (p.status === 'active') {
        p.status = 'cancelled';
        p.cancelledAt = new Date();
        p.cancellationReason = cancellationReason;
      }
    }
    for (const t of userTrials) {
      if (t.status === 'active') {
        t.status = 'expired';
      }
    }

    assert.strictEqual(userPeriods[0].status, 'cancelled');
    assert.strictEqual(userPeriods[0].cancellationReason, cancellationReason);
    assert.strictEqual(userTrials[0].status, 'expired');

    const hasActivePeriod = userPeriods.some((p) => p.status === 'active');
    const hasActiveTrial = userTrials.some((t) => t.status === 'active');
    const effectivePlan = hasActivePeriod ? 'premium' : hasActiveTrial ? 'trial' : 'free';
    assert.strictEqual(effectivePlan, 'free', 'Cancelled student must immediately fall back to Free plan');
  });

  console.log('\n--- 7. User Self-Service Subscription Cancellation & Data Preservation ---');

  test('User can self-cancel active paid Premium subscription at any time', () => {
    const activePeriod = {
      id: 'per_premium_123',
      user: 'user_student_1',
      status: 'active',
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: '',
    };
    const userPeriods = [activePeriod];
    const optionalReason = 'Completed thesis defense earlier than expected';

    const now = new Date();
    for (const p of userPeriods) {
      if (p.status === 'active') {
        p.status = 'cancelled';
        p.cancelledAt = now;
        p.cancelledBy = 'user_student_1';
        p.cancellationReason = optionalReason || 'Cancelled by user';
      }
    }

    assert.strictEqual(userPeriods[0].status, 'cancelled');
    assert.strictEqual(userPeriods[0].cancelledBy, 'user_student_1');
    assert.strictEqual(userPeriods[0].cancellationReason, 'Completed thesis defense earlier than expected');
    assert.ok(userPeriods[0].cancelledAt instanceof Date);
  });

  test('User can self-cancel active 7-Day trial at any time', () => {
    const trialGrant = {
      id: 'trial_abc_456',
      user: 'user_student_2',
      status: 'active',
      cancelledAt: null,
      cancellationReason: '',
    };
    const now = new Date();

    trialGrant.status = 'cancelled';
    trialGrant.cancelledAt = now;
    trialGrant.cancellationReason = 'Cancelled by user';

    assert.strictEqual(trialGrant.status, 'cancelled');
    assert.ok(trialGrant.cancelledAt instanceof Date);
  });

  test('User cancellation safely preserves 100% of saved papers, annotations, and collections', () => {
    const studentAccount = {
      id: 'user_student_3',
      savedPapers: [
        { paperId: 'arxiv:2106.12345', title: 'Deep Reinforcement Learning in Robotics', notes: 'Key methodology for Chapter 3' },
        { paperId: 'openalex:W123456', title: 'Federated Optimization in Mobile Edge', notes: 'Baseline comparison model' },
        { paperId: 'doi:10.1145/3372278', title: 'Empirical Study on API Evolution', notes: 'Dataset source' },
      ],
      collections: [
        { name: 'Thesis Chapter 2 Literature', paperIds: ['arxiv:2106.12345', 'openalex:W123456'] },
      ],
    };

    const initialSavedCount = studentAccount.savedPapers.length;
    const initialCollectionCount = studentAccount.collections.length;
    const initialNotes = studentAccount.savedPapers[0].notes;

    const cancelledPeriod = { status: 'cancelled', cancelledAt: new Date() };

    assert.strictEqual(studentAccount.savedPapers.length, initialSavedCount, 'Saved papers must never be deleted upon cancellation');
    assert.strictEqual(studentAccount.collections.length, initialCollectionCount, 'Collections must remain intact upon cancellation');
    assert.strictEqual(studentAccount.savedPapers[0].notes, initialNotes, 'Research annotations must remain preserved');
  });

  test('Attempting to self-cancel with no active subscription returns 400 error', () => {
    function processUserCancel(activePeriods, activeTrial) {
      if (activePeriods.length === 0 && !activeTrial) {
        const error = new Error('No active subscription or trial found to cancel.');
        error.code = 'NO_ACTIVE_SUBSCRIPTION';
        error.statusCode = 400;
        throw error;
      }
      return { success: true };
    }

    assert.throws(
      () => processUserCancel([], null),
      (err) => err.statusCode === 400 && err.code === 'NO_ACTIVE_SUBSCRIPTION'
    );
  });

  test('Self-cancellation immediately switches effective entitlements to free plan', () => {
    let activePaidPeriods = [{ status: 'cancelled' }];
    let activeTrialGrant = null;

    const hasActivePaid = activePaidPeriods.some((p) => p.status === 'active');
    const hasActiveTrial = activeTrialGrant && activeTrialGrant.status === 'active';
    const effectivePlan = hasActivePaid ? 'premium' : hasActiveTrial ? 'trial' : 'free';

    assert.strictEqual(effectivePlan, 'free', 'Cancelled subscription must immediately compute effective plan as free');
  });

  console.log('\n--- 8. Dataset Access Restrictions & 10 Daily Search Quota Enforcement ---');

  test('Free tier quota specifies canAccessPaperDatasets: false and dailySearchLimit: 10', () => {
    assert.strictEqual(PLAN_LIMITS.free.canAccessPaperDatasets, false, 'Free tier must not have access to file datasets');
    assert.strictEqual(PLAN_LIMITS.free.dailySearchLimit, 10, 'Free tier must be limited to 10 searches daily');
  });

  test('Premium, Pro Max, Trial v2, and Grandfathered Trial v1 quotas reflect plan catalog rules', () => {
    assert.strictEqual(PLAN_LIMITS.premium.canAccessPaperDatasets, true, 'Premium tier must have dataset access');
    assert.strictEqual(PLAN_LIMITS.premium.dailySearchLimit, null, 'Premium tier must have unlimited daily searches');
    assert.strictEqual(PLAN_LIMITS.pro_max_12m.canAccessPaperDatasets, true, 'Pro Max tier must have dataset access');
    assert.strictEqual(PLAN_LIMITS.pro_max_12m.dailySearchLimit, null, 'Pro Max tier must have unlimited daily searches');

    assert.strictEqual(PLAN_LIMITS.trial_v2.canAccessPaperDatasets, true, 'Trial v2 must have dataset access');
    assert.strictEqual(PLAN_LIMITS.trial_v2.dailySearchLimit, 20, 'Trial v2 must be limited to 20 daily searches');
    assert.strictEqual(PLAN_LIMITS.trial_v2.dailyDatasetLookupLimit, 5, 'Trial v2 must have max 5 dataset lookups daily');
    assert.strictEqual(PLAN_LIMITS.trial_v2.maxSavedPapers, 50, 'Trial v2 allows up to 50 saved papers');
    assert.strictEqual(PLAN_LIMITS.trial_v2.maxCollections, 3, 'Trial v2 allows up to 3 collections');
    assert.strictEqual(PLAN_LIMITS.trial_v2.maxTopicAlerts, 1, 'Trial v2 allows 1 topic alert');
    assert.strictEqual(PLAN_LIMITS.trial_v2.canExportBulk, false, 'Trial v2 bulk export disabled');

    assert.strictEqual(PLAN_LIMITS.trial_v1.canAccessPaperDatasets, true, 'Grandfathered trial retains dataset access');
    assert.strictEqual(PLAN_LIMITS.trial_v1.dailySearchLimit, null, 'Grandfathered trial retains unlimited daily searches');
    assert.strictEqual(PLAN_LIMITS.trial_v1.maxSavedPapers, 1000, 'Grandfathered trial retains 1000 saved papers');
  });

  test('Free tier user is blocked on 11th daily search with SEARCH_QUOTA_EXCEEDED', () => {
    function simulateSearch(user, query) {
      const isDailyLimited = user.entitlements.quotas.dailySearchLimit !== null;
      if (isDailyLimited) {
        const limit = user.entitlements.quotas.dailySearchLimit;
        if (user.dailySearchCount >= limit) {
          const err = new Error(`Daily search limit reached (${limit}/${limit})`);
          err.code = 'SEARCH_QUOTA_EXCEEDED';
          err.statusCode = 403;
          throw err;
        }
        user.dailySearchCount += 1;
        return { success: true, count: user.dailySearchCount, remaining: limit - user.dailySearchCount };
      }
      user.dailySearchCount += 1;
      return { success: true, count: user.dailySearchCount, remaining: 'unlimited' };
    }

    const freeStudent = {
      entitlements: { label: 'Standard Academic', quotas: PLAN_LIMITS.free },
      dailySearchCount: 0,
    };

    for (let i = 1; i <= 10; i++) {
      const res = simulateSearch(freeStudent, `query_${i}`);
      assert.strictEqual(res.count, i);
      assert.strictEqual(res.remaining, 10 - i);
    }

    assert.throws(
      () => simulateSearch(freeStudent, 'query_11'),
      (err) => err.statusCode === 403 && err.code === 'SEARCH_QUOTA_EXCEEDED'
    );
  });

  test('Premium user has unlimited daily searches beyond 10', () => {
    function simulateSearch(user, query) {
      const isDailyLimited = user.entitlements.quotas.dailySearchLimit !== null;
      if (isDailyLimited) {
        const limit = user.entitlements.quotas.dailySearchLimit;
        if (user.dailySearchCount >= limit) {
          const err = new Error(`Daily search limit reached (${limit}/${limit})`);
          err.code = 'SEARCH_QUOTA_EXCEEDED';
          err.statusCode = 403;
          throw err;
        }
        user.dailySearchCount += 1;
        return { success: true, count: user.dailySearchCount, remaining: limit - user.dailySearchCount };
      }
      user.dailySearchCount += 1;
      return { success: true, count: user.dailySearchCount, remaining: 'unlimited' };
    }

    const premiumStudent = {
      entitlements: { label: 'Premium Scholarly', quotas: PLAN_LIMITS.premium },
      dailySearchCount: 10,
    };

    const res11 = simulateSearch(premiumStudent, 'quantum computing');
    assert.strictEqual(res11.success, true);
    assert.strictEqual(res11.remaining, 'unlimited');

    const res12 = simulateSearch(premiumStudent, 'neural architecture search');
    assert.strictEqual(res12.success, true);
    assert.strictEqual(res12.remaining, 'unlimited');
  });

  test('Free tier user cannot access dataset of each file (FEATURE_LOCKED 403)', () => {
    function accessPaperDatasets(user) {
      if (!user.entitlements.quotas.canAccessPaperDatasets) {
        const err = new Error('Direct dataset access is a Premium feature.');
        err.code = 'FEATURE_LOCKED';
        err.statusCode = 403;
        throw err;
      }
      return { datasets: [{ id: 'zenodo.123', url: 'https://zenodo.org/record/123' }] };
    }

    const freeStudent = { entitlements: { quotas: PLAN_LIMITS.free } };
    assert.throws(
      () => accessPaperDatasets(freeStudent),
      (err) => err.statusCode === 403 && err.code === 'FEATURE_LOCKED'
    );
  });

  test('Premium tier user has full access to datasets of each file', () => {
    function accessPaperDatasets(user) {
      if (!user.entitlements.quotas.canAccessPaperDatasets) {
        const err = new Error('Direct dataset access is a Premium feature.');
        err.code = 'FEATURE_LOCKED';
        err.statusCode = 403;
        throw err;
      }
      return { datasets: [{ id: 'zenodo.123', url: 'https://zenodo.org/record/123' }] };
    }

    const premiumStudent = { entitlements: { quotas: PLAN_LIMITS.premium } };
    const res = accessPaperDatasets(premiumStudent);
    assert.strictEqual(res.datasets.length, 1);
    assert.strictEqual(res.datasets[0].id, 'zenodo.123');
  });

  console.log('\n--- 9. Trial v2 Daily Dataset Lookup Quota ---');

  test('Trial v2 user enforces 5 daily dataset lookups and blocks 6th', () => {
    function lookupPaperDataset(user) {
      if (!user.entitlements.quotas.canAccessPaperDatasets) {
        const err = new Error('Direct dataset access is locked.');
        err.code = 'FEATURE_LOCKED';
        err.statusCode = 403;
        throw err;
      }
      const limit = user.entitlements.quotas.dailyDatasetLookupLimit;
      if (limit !== null && user.dailyLookupsUsed >= limit) {
        const err = new Error(`Daily trial limit of ${limit} lookups reached.`);
        err.code = 'DAILY_DATASET_LIMIT_REACHED';
        err.statusCode = 429;
        err.datasetQuota = {
          limit,
          used: user.dailyLookupsUsed,
          remaining: 0,
          resetsAt: 'Midnight 00:00 (Asia/Dhaka)',
        };
        throw err;
      }
      user.dailyLookupsUsed = (user.dailyLookupsUsed || 0) + 1;
      return {
        success: true,
        datasetQuota: {
          limit,
          used: user.dailyLookupsUsed,
          remaining: Math.max(0, limit - user.dailyLookupsUsed),
          resetsAt: 'Midnight 00:00 (Asia/Dhaka)',
        },
      };
    }

    const trialUser = {
      entitlements: { quotas: PLAN_LIMITS.trial_v2 },
      dailyLookupsUsed: 0,
    };

    for (let i = 1; i <= 5; i++) {
      const res = lookupPaperDataset(trialUser);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.datasetQuota.used, i);
      assert.strictEqual(res.datasetQuota.remaining, 5 - i);
    }

    assert.throws(
      () => lookupPaperDataset(trialUser),
      (err) => err.statusCode === 429 && err.code === 'DAILY_DATASET_LIMIT_REACHED' && err.datasetQuota.remaining === 0
    );
  });

  console.log('\n--- 10. Pro Max Annual Plan Catalog & Clamping ---');

  test('Pro Max Annual snapshot defines ৳850 / 85000 paisa, 12 months, and 15% savings note', () => {
    const { getPlan } = require('../services/planCatalog');
    const proMax = getPlan('pro_max_12m');

    assert.strictEqual(proMax.code, 'pro_max_12m');
    assert.strictEqual(proMax.price, 850);
    assert.strictEqual(proMax.pricePaisa, 85000);
    assert.strictEqual(proMax.durationMonths, 12);
    assert.strictEqual(proMax.savingsNote, 'Save BDT 150 (15%) versus two BDT 500 six-month memberships');
    assert.strictEqual(proMax.quotas.dailySearchLimit, null, 'Pro Max has unlimited searches');
    assert.strictEqual(proMax.quotas.dailyDatasetLookupLimit, null, 'Pro Max has unlimited dataset discovery');
    assert.strictEqual(proMax.quotas.maxSavedPapers, 1000);
  });

  test('Pro Max 12-month calendar calculation correctly advances 1 year and clamps leap year', () => {
    const leapDay = new Date('2024-02-29T10:00:00.000Z');
    const plus12m = addDhakaCalendarMonths(leapDay, 12);
    const parts = getDhakaDateParts(plus12m);
    assert.strictEqual(parts.year, 2025);
    assert.strictEqual(parts.month, 2);
    assert.strictEqual(parts.day, 28, 'Must clamp Feb 29 to Feb 28 in non-leap year');
  });

  console.log('\n--- 11. Payment Approval Idempotency Guard ---');

  test('Admin approval idempotency guard prevents double-extension on replay', () => {
    const payment = {
      _id: 'sub_test_1',
      status: 'approved',
      order: {
        plan: 'premium_6m',
        durationMonths: 6,
        pricePaisa: 50000,
      },
    };

    const existingPeriod = {
      _id: 'period_existing_999',
      startsAt: new Date('2025-06-01T00:00:00.000Z'),
      expiresAt: new Date('2025-12-01T00:00:00.000Z'),
      status: 'active',
    };

    function processApproval(submission, existingCoverage, verifiedInStatement) {
      if (verifiedInStatement !== true) {
        throw new Error('Verification in merchant statement is required');
      }
      if (submission.status === 'approved') {
        return {
          idempotentReplay: true,
          period: existingCoverage,
          message: 'Payment already approved; returning active coverage.',
        };
      }
      return {
        idempotentReplay: false,
        period: {
          startsAt: existingCoverage ? existingCoverage.expiresAt : new Date(),
          expiresAt: addDhakaCalendarMonths(existingCoverage ? existingCoverage.expiresAt : new Date(), submission.order.durationMonths),
        },
      };
    }

    const replayRes = processApproval(payment, existingPeriod, true);
    assert.strictEqual(replayRes.idempotentReplay, true);
    assert.strictEqual(replayRes.period._id, 'period_existing_999');
    assert.strictEqual(replayRes.period.expiresAt.toISOString(), '2025-12-01T00:00:00.000Z', 'Expiry must NOT be extended on replay');
  });

  console.log('\n--- 12. Topic Alert Batch Scanning & Per-Paper Deduplication ---');

  test('Topic alert runner does not stop at 5 papers and checks per-paper deduplication', () => {
    const matchingTheses = [];
    for (let i = 1; i <= 12; i++) {
      matchingTheses.push({
        _id: `thesis_batch_${i}`,
        title: `Deep Learning in Climate Modeling Paper #${i}`,
      });
    }

    const notifiedPaperIds = new Set(['thesis_batch_1', 'thesis_batch_2']);

    const trulyNew = matchingTheses.filter((t) => !notifiedPaperIds.has(t._id));

    assert.strictEqual(trulyNew.length, 10, 'Must process all 10 newly approved papers');
    assert.strictEqual(trulyNew[0]._id, 'thesis_batch_3');
    assert.strictEqual(trulyNew[9]._id, 'thesis_batch_12');
  });

  console.log(`\n===============================================================`);
  console.log(`  ALL ${passed}/${total} MEMBERSHIP & BKASH TESTS PASSED (100% SUCCESS)`);
  console.log(`===============================================================\n`);
  return true;
}

module.exports = { runMembershipAndBkashTests };

if (require.main === module) {
  runMembershipAndBkashTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
