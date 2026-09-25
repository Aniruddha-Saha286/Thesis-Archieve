const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const MembershipOrder = require('../models/MembershipOrder');
const PaymentSubmission = require('../models/PaymentSubmission');
const MembershipPeriod = require('../models/MembershipPeriod');
const TrialGrant = require('../models/TrialGrant');
const AuditEvent = require('../models/AuditEvent');
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');
const { getEffectiveEntitlements, PLAN_LIMITS } = require('../services/entitlementService');
const { getPlan, getPublicPlans } = require('../services/planCatalog');
const { addDhakaDays, addDhakaCalendarMonths, formatDhakaDateTime } = require('../utils/dhakaDate');
const { emitToUser, emitToAdmins } = require('../socket');

// All membership endpoints require authenticated user
router.use(authenticateToken);

// GET /api/membership/plans
// Publicly defined plan definitions from authoritative versioned catalog
router.get('/plans', (req, res) => {
  return res.json({
    plans: getPublicPlans(),
  });
});

// GET /api/membership/status
// Retrieves effective membership status, entitlements, active periods, and cancellation eligibility
router.get('/status', async (req, res) => {
  try {
    const entitlements = await getEffectiveEntitlements(req.user._id);
    const now = new Date();

    const allActivePeriods = await MembershipPeriod.find({
      user: req.user._id,
      status: 'active',
      expiresAt: { $gt: now },
    }).sort({ startsAt: 1, expiresAt: 1 });

    // Strict currentPeriod definition: startsAt <= now < expiresAt
    const currentPeriodDoc = allActivePeriods.find(p => p.startsAt <= now && p.expiresAt > now) || null;
    const futureRenewalDoc = allActivePeriods.find(p => p.startsAt > now && (!currentPeriodDoc || String(p._id) !== String(currentPeriodDoc._id))) || null;

    const formatPeriod = (p) => {
      if (!p) return null;
      return {
        id: p._id,
        plan: p.plan,
        planCode: p.plan,
        startsAt: p.startsAt,
        expiresAt: p.expiresAt,
        formattedExpiry: formatDhakaDateTime(p.expiresAt),
      };
    };

    const currentPeriod = formatPeriod(currentPeriodDoc);
    const futureRenewal = formatPeriod(futureRenewalDoc);

    const activeTrial = await TrialGrant.findOne({
      user: req.user._id,
      status: 'active',
      expiresAt: { $gt: now },
    });

    const pendingPayment = await PaymentSubmission.findOne({
      user: req.user._id,
      status: { $in: ['submitted', 'under_review'] },
    }).sort({ createdAt: -1 });

    const canCancel = Boolean(allActivePeriods.length > 0 || activeTrial);

    return res.json({
      entitlements,
      currentPeriod,
      futureRenewal,
      activePeriod: currentPeriod, // Backwards-compatible
      activeTrial: activeTrial ? {
        id: activeTrial._id,
        policyVersion: activeTrial.policyVersion || 'v1',
        startsAt: activeTrial.startsAt,
        expiresAt: activeTrial.expiresAt,
        formattedExpiry: formatDhakaDateTime(activeTrial.expiresAt),
      } : null,
      canCancel,
      pendingPayment: pendingPayment ? {
        id: pendingPayment._id,
        status: pendingPayment.status,
        trxId: pendingPayment.trxId,
        claimedAmount: pendingPayment.claimedAmountPaisa / 100,
        createdAt: pendingPayment.createdAt,
      } : null,
      serverTime: new Date(),
    });
  } catch (err) {
    console.error('Membership status error:', err);
    return res.status(500).json({ message: 'Failed to retrieve membership status.' });
  }
});

// POST /api/membership/cancel
// Allows student/user to self-cancel active subscription or trial at any time
router.post('/cancel', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { reason } = req.body || {};
    const cancellationReason = (reason && typeof reason === 'string' && reason.trim())
      ? reason.trim().slice(0, 500)
      : 'Cancelled by user';

    // 1. Find all active membership periods
    const activePeriods = await MembershipPeriod.find({
      user: user._id,
      status: 'active',
    });

    // 2. Find active trial grant
    const activeTrial = await TrialGrant.findOne({
      user: user._id,
      status: 'active',
    });

    // If user has neither an active paid period nor an active trial, reject request
    if (activePeriods.length === 0 && !activeTrial) {
      return res.status(400).json({
        message: 'No active subscription or trial found to cancel.',
        code: 'NO_ACTIVE_SUBSCRIPTION',
      });
    }

    const now = new Date();

    // Cancel all active periods
    for (const period of activePeriods) {
      period.status = 'cancelled';
      period.cancelledAt = now;
      period.cancelledBy = user._id;
      period.cancellationReason = cancellationReason;
      await period.save();
    }

    // Cancel active trial
    if (activeTrial) {
      activeTrial.status = 'cancelled';
      activeTrial.cancelledAt = now;
      activeTrial.cancellationReason = cancellationReason;
      await activeTrial.save();
    }

    // Record audit event
    await AuditEvent.create({
      actor: user._id,
      action: 'membership.user_cancelled',
      targetType: 'User',
      targetId: String(user._id),
      metadata: {
        reason: cancellationReason,
        cancelledPeriodsCount: activePeriods.length,
        cancelledTrial: Boolean(activeTrial),
      },
      ipAddress: req.ip || '',
    });

    // Send user notification with assurance that research data remains intact
    const notif = new Notification({
      user: user._id,
      type: 'editorial_update',
      title: 'Subscription Cancelled',
      message: 'Your subscription has been cancelled per your request. Your existing research papers, collections, and personal library notes remain completely preserved.',
    });
    await notif.save();

    // Emit live events to user and admin channels
    emitToUser(String(user._id), 'notification:new', notif);
    emitToUser(String(user._id), 'membership:updated', { plan: 'free', expiresAt: null });
    if (emitToAdmins) {
      emitToAdmins('admin:student_updated', { studentId: String(user._id) });
    }

    // Retrieve fresh entitlements reflecting cancellation (falls back to free)
    const entitlements = await getEffectiveEntitlements(user._id);

    return res.json({
      message: 'Your subscription has been successfully cancelled. Your saved papers and collections remain safely intact.',
      entitlements,
      cancelledPeriods: activePeriods.length,
      cancelledTrial: Boolean(activeTrial),
    });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ message: 'Failed to cancel subscription.' });
  }
});

// POST /api/membership/trial
// Starts the 7-day trial for an eligible verified account
router.post('/trial', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Trial rule: must be approved/verified
    if (user.status !== 'approved') {
      return res.status(403).json({
        message: 'Account verification required before activating the 7-day Premium trial.',
        code: 'VERIFICATION_REQUIRED',
      });
    }

    // Trial rule: available once per eligible account for life
    const [existingTrial, existingPaid] = await Promise.all([
      TrialGrant.findOne({ user: user._id }),
      MembershipPeriod.findOne({ user: user._id }),
    ]);

    if (existingTrial) {
      return res.status(400).json({
        message: 'The 7-day trial has already been utilized on this account.',
        code: 'TRIAL_ALREADY_USED',
      });
    }

    if (existingPaid) {
      return res.status(400).json({
        message: 'Account has previously held a paid membership and is not eligible for trial.',
        code: 'INELIGIBLE_FOR_TRIAL',
      });
    }

    const now = new Date();
    const expiresAt = addDhakaDays(now, 7);

    const trial = new TrialGrant({
      user: user._id,
      startsAt: now,
      expiresAt: expiresAt,
      status: 'active',
      policyVersion: 'v2', // New trial grants use policy v2
    });
    await trial.save();

    // Log audit event
    await AuditEvent.create({
      actor: user._id,
      action: 'membership.trial_started',
      targetType: 'TrialGrant',
      targetId: String(trial._id),
      metadata: {
        startsAt: now,
        expiresAt: expiresAt,
        policyVersion: 'v2',
      },
      ipAddress: req.ip || '',
    });

    // Notify user
    const notif = new Notification({
      user: user._id,
      type: 'editorial_update',
      title: '7-Day Research Trial Activated',
      message: `Your 7-day Research trial is now active through ${formatDhakaDateTime(expiresAt)}. Enjoy research workspace privileges.`,
    });
    await notif.save();
    emitToUser(String(user._id), 'notification:new', notif);

    const entitlements = await getEffectiveEntitlements(user._id);

    return res.status(201).json({
      message: '7-Day Research Trial activated successfully!',
      trial,
      entitlements,
      formattedExpiry: formatDhakaDateTime(expiresAt),
    });
  } catch (err) {
    console.error('Start trial error:', err);
    return res.status(500).json({ message: 'Failed to start trial.' });
  }
});

// POST /api/membership/orders
// Creates an immutable order snapshot for chosen paid plan (৳500 / 6m or ৳850 / 12m)
router.post('/orders', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const merchantNumber = process.env.BKASH_MERCHANT_NUMBER || '01777000000';
    const merchantName = process.env.BKASH_MERCHANT_NAME || 'Project Panther / The Thesis Archive';
    const merchantQr = process.env.BKASH_MERCHANT_QR || '';

    // If merchant account is not configured, disclose honestly
    if (!merchantNumber || merchantNumber === 'NONE') {
      return res.status(503).json({
        available: false,
        message: 'Online bKash collection is currently undergoing maintenance. Please contact depository staff.',
      });
    }

    const { planCode, plan } = req.body || {};
    const targetPlanCode = planCode || plan || 'premium_6m';
    const planDef = getPlan(targetPlanCode);

    if (!planDef.isPaid) {
      return res.status(400).json({
        message: 'Invalid plan selected. Only paid membership tiers (Premium or Pro Max) can generate payment orders.',
      });
    }

    const randSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderRef = `ORD-${dateStr}-${randSuffix}`;

    const order = new MembershipOrder({
      orderRef,
      user: user._id,
      plan: planDef.code,
      planCode: planDef.code,
      planName: planDef.name,
      pricePaisa: planDef.pricePaisa,
      currency: planDef.currency || 'BDT',
      durationMonths: planDef.durationMonths,
      status: 'pending',
      merchantNumberSnapshot: merchantNumber,
      merchantNameSnapshot: merchantName,
    });
    await order.save();

    await AuditEvent.create({
      actor: user._id,
      action: 'membership.order_created',
      targetType: 'MembershipOrder',
      targetId: String(order._id),
      metadata: {
        orderRef,
        planCode: planDef.code,
        pricePaisa: planDef.pricePaisa,
        durationMonths: planDef.durationMonths,
      },
      ipAddress: req.ip || '',
    });

    return res.status(201).json({
      order: {
        id: order._id,
        orderRef: order.orderRef,
        plan: planDef.code,
        planCode: planDef.code,
        planName: planDef.name,
        pricePaisa: order.pricePaisa,
        amount: order.pricePaisa / 100,
        currency: order.currency,
        durationMonths: order.durationMonths,
        durationDisplay: planDef.durationDisplay,
        savingsNote: planDef.savingsNote || null,
      },
      paymentInstructions: {
        provider: 'bKash',
        planName: planDef.name,
        merchantName,
        merchantNumber,
        merchantQr,
        orderRef: order.orderRef,
        amount: planDef.price,
        durationDisplay: planDef.durationDisplay,
        steps: [
          `Open your bKash app and select "Make Payment" or "Send Money" to: ${merchantNumber}.`,
          `Enter exact amount: ৳${planDef.price}.`,
          `In the Reference field, enter your unique order reference: ${order.orderRef}.`,
          `Complete payment with your bKash PIN in your mobile app (never share your PIN on any website!).`,
          `Copy your 8-12 character Transaction ID (TrxID) and submit it below for manual verification.`,
        ],
      },
    });
  } catch (err) {
    console.error('Create order error:', err);
    return res.status(500).json({ message: 'Failed to generate membership order.' });
  }
});

// POST /api/membership/payments
// Submits manual bKash transaction for admin verification
router.post('/payments', async (req, res) => {
  try {
    const { orderId, trxId, senderNumber, paymentDateTime, receiptUrl } = req.body;

    if (!orderId || !trxId || !trxId.trim()) {
      return res.status(400).json({ message: 'Order reference and bKash Transaction ID (TrxID) are required.' });
    }

    const order = await MembershipOrder.findById(orderId);
    if (!order || String(order.user) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Associated membership order not found.' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        message: `Cannot submit payment for an order with status '${order.status}'. Please create a new order.`,
        code: 'ORDER_NOT_PENDING',
      });
    }

    const normalizedTrxId = trxId.trim().toUpperCase();

    // Basic format check for bKash TrxID (alphanumeric, 8-15 characters)
    if (!/^[A-Z0-9]{8,15}$/.test(normalizedTrxId)) {
      return res.status(400).json({
        message: 'Invalid bKash Transaction ID format. TrxID must be 8 to 15 alphanumeric characters (e.g. BKA12345678).',
      });
    }

    // Check if order already has an existing submission
    const existingForOrder = await PaymentSubmission.findOne({ order: order._id });
    if (existingForOrder) {
      if (existingForOrder.status === 'rejected') {
        // Allow updating rejected submission on correction
        const duplicateOther = await PaymentSubmission.findOne({
          paymentProvider: 'bkash',
          normalizedTrxId,
          _id: { $ne: existingForOrder._id },
        });
        if (duplicateOther) {
          return res.status(409).json({
            message: 'This bKash Transaction ID has already been submitted for another record.',
            code: 'DUPLICATE_TRANSACTION_ID',
          });
        }

        const paymentDate = paymentDateTime ? new Date(paymentDateTime) : new Date();
        existingForOrder.trxId = trxId.trim();
        existingForOrder.normalizedTrxId = normalizedTrxId;
        existingForOrder.senderNumber = (senderNumber || '').trim();
        existingForOrder.paymentDateTime = isNaN(paymentDate.getTime()) ? new Date() : paymentDate;
        existingForOrder.receiptUrl = (receiptUrl || '').trim();
        existingForOrder.status = 'submitted';
        existingForOrder.rejectionReason = '';
        existingForOrder.reviewedBy = null;
        existingForOrder.reviewedAt = null;
        await existingForOrder.save();

        await AuditEvent.create({
          actor: req.user._id,
          action: 'payment.resubmitted',
          targetType: 'PaymentSubmission',
          targetId: String(existingForOrder._id),
          metadata: {
            orderId: String(order._id),
            normalizedTrxId,
            claimedAmountPaisa: order.pricePaisa,
          },
          ipAddress: req.ip || '',
        });

        return res.status(200).json({
          message: 'bKash payment claim updated and resubmitted for admin review.',
          submission: {
            id: existingForOrder._id,
            orderRef: order.orderRef,
            trxId: existingForOrder.trxId,
            status: existingForOrder.status,
            amount: existingForOrder.claimedAmountPaisa / 100,
            submittedAt: existingForOrder.updatedAt || existingForOrder.createdAt,
          },
        });
      } else {
        return res.status(409).json({
          message: `This order already has a payment submission currently under status '${existingForOrder.status}'.`,
          code: 'ORDER_ALREADY_HAS_SUBMISSION',
        });
      }
    }

    // Duplicate detection across database
    const existingSubmission = await PaymentSubmission.findOne({
      paymentProvider: 'bkash',
      normalizedTrxId,
    });

    if (existingSubmission) {
      return res.status(409).json({
        message: 'This bKash Transaction ID has already been submitted. Reusing transaction IDs is prohibited. If you believe this is an error, please contact administration.',
        code: 'DUPLICATE_TRANSACTION_ID',
      });
    }

    const paymentDate = paymentDateTime ? new Date(paymentDateTime) : new Date();

    const submission = new PaymentSubmission({
      order: order._id,
      user: req.user._id,
      paymentProvider: 'bkash',
      trxId: trxId.trim(),
      normalizedTrxId,
      senderNumber: (senderNumber || '').trim(),
      paymentDateTime: isNaN(paymentDate.getTime()) ? new Date() : paymentDate,
      claimedAmountPaisa: order.pricePaisa, // Derived from immutable server order
      receiptUrl: (receiptUrl || '').trim(),
      status: 'submitted',
    });

    await submission.save();

    await AuditEvent.create({
      actor: req.user._id,
      action: 'payment.submitted',
      targetType: 'PaymentSubmission',
      targetId: String(submission._id),
      metadata: {
        orderId: String(order._id),
        normalizedTrxId,
        claimedAmountPaisa: order.pricePaisa,
      },
      ipAddress: req.ip || '',
    });

    return res.status(201).json({
      message: 'bKash payment claim submitted successfully. It is now awaiting manual editorial review in the admin merchant desk.',
      submission: {
        id: submission._id,
        orderRef: order.orderRef,
        trxId: submission.trxId,
        status: submission.status,
        amount: submission.claimedAmountPaisa / 100,
        submittedAt: submission.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: 'This bKash Transaction ID has already been submitted and cannot be reused.',
        code: 'DUPLICATE_TRANSACTION_ID',
      });
    }
    console.error('Submit payment error:', err);
    return res.status(500).json({ message: 'Failed to record payment submission.' });
  }
});

// GET /api/membership/payments/history
// User payment submission history
router.get('/payments/history', async (req, res) => {
  try {
    const history = await PaymentSubmission.find({ user: req.user._id })
      .populate('order', 'orderRef plan planCode planName pricePaisa durationMonths createdAt')
      .sort({ createdAt: -1 });

    const formatted = history.map((sub) => ({
      id: sub._id,
      orderRef: sub.order?.orderRef || 'N/A',
      planName: sub.order?.planName || (sub.order?.durationMonths === 12 ? 'Pro Max Annual' : 'Premium Scholarly Discovery'),
      durationMonths: sub.order?.durationMonths || 6,
      trxId: sub.trxId,
      amount: sub.claimedAmountPaisa / 100,
      currency: 'BDT',
      status: sub.status,
      rejectionReason: sub.rejectionReason,
      adminInstructions: sub.adminInstructions,
      paymentDateTime: sub.paymentDateTime,
      submittedAt: sub.createdAt,
      reviewedAt: sub.reviewedAt,
    }));

    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to retrieve payment history.' });
  }
});

// POST /api/membership/payments/:id/correct
// Resubmits corrected transaction ID or receipt for a flagged submission
router.post('/payments/:id/correct', async (req, res) => {
  try {
    const { trxId, receiptUrl, senderNumber } = req.body;
    const submission = await PaymentSubmission.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!submission) {
      return res.status(404).json({ message: 'Payment submission not found.' });
    }

    if (submission.status === 'approved') {
      return res.status(400).json({ message: 'Approved payments cannot be altered.' });
    }

    if (trxId && trxId.trim()) {
      const normalizedTrxId = trxId.trim().toUpperCase();
      if (!/^[A-Z0-9]{8,15}$/.test(normalizedTrxId)) {
        return res.status(400).json({ message: 'Invalid Transaction ID format.' });
      }

      // Check duplicate
      const duplicate = await PaymentSubmission.findOne({
        paymentProvider: 'bkash',
        normalizedTrxId,
        _id: { $ne: submission._id },
      });
      if (duplicate) {
        return res.status(409).json({ message: 'Transaction ID is already in use by another record.' });
      }

      submission.trxId = trxId.trim();
      submission.normalizedTrxId = normalizedTrxId;
    }

    if (receiptUrl !== undefined) submission.receiptUrl = receiptUrl.trim();
    if (senderNumber !== undefined) submission.senderNumber = senderNumber.trim();
    submission.status = 'submitted'; // Reset to submitted for review
    await submission.save();

    await AuditEvent.create({
      actor: req.user._id,
      action: 'payment.corrected',
      targetType: 'PaymentSubmission',
      targetId: String(submission._id),
      metadata: { correctedTrxId: submission.normalizedTrxId },
      ipAddress: req.ip || '',
    });

    return res.json({
      message: 'Payment details updated. Re-queued for admin verification.',
      submission,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update payment submission.' });
  }
});

module.exports = router;
