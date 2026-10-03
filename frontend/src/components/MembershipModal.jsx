import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  ShieldCheck,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  CreditCard,
  History,
  Check,
  RefreshCw,
  X,
  Sparkles,
  Lock,
  ArrowRight,
  Info,
  Calendar,
} from 'lucide-react';

export default function MembershipModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const { socket, showNotice } = useSocket();

  const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'bkash' | 'history'
  const [plans, setPlans] = useState([]);
  const [membershipStatus, setMembershipStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Active Order & Payment Form State
  const [activeOrder, setActiveOrder] = useState(null);
  const [paymentInstructions, setPaymentInstructions] = useState(null);
  const [trxId, setTrxId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [copiedField, setCopiedField] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Payment History State
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Correction Mode State
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [correctionTrxId, setCorrectionTrxId] = useState('');
  const [correctionSender, setCorrectionSender] = useState('');
  const [correctionLoading, setCorrectionLoading] = useState(false);

  // Cancellation State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonPreset, setCancelReasonPreset] = useState('Completed current research project');
  const [cancelReasonCustom, setCancelReasonCustom] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState({ type: '', message: '' });

  const fetchPlans = async () => {
    try {
      const res = await axios.get('/api/membership/plans');
      setPlans(res.data.plans || []);
    } catch (err) {
      console.error('Failed to load plans:', err);
    }
  };

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/membership/status');
      setMembershipStatus(res.data);
    } catch (err) {
      console.error('Failed to load membership status:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await axios.get('/api/membership/payments/history');
      setHistory(res.data || []);
    } catch (err) {
      console.error('Failed to load payment history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPlans();
      fetchStatus();
      fetchHistory();
    }
  }, [isOpen]);

  // Listen for real-time membership updates
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchStatus();
      fetchHistory();
    };
    socket.on('membership:updated', handleUpdate);
    socket.on('notification:new', handleUpdate);
    return () => {
      socket.off('membership:updated', handleUpdate);
      socket.off('notification:new', handleUpdate);
    };
  }, [socket]);

  const handleCancelSubscription = async () => {
    try {
      setCancelLoading(true);
      setCancelFeedback({ type: '', message: '' });
      const fullReason =
        cancelReasonPreset === 'Other'
          ? cancelReasonCustom.trim() || 'Cancelled by user'
          : cancelReasonPreset + (cancelReasonCustom.trim() ? ` - ${cancelReasonCustom.trim()}` : '');

      const res = await axios.post('/api/membership/cancel', {
        reason: fullReason,
      });

      setCancelFeedback({
        type: 'success',
        message: res.data.message || 'Subscription successfully cancelled. Your library remains intact.',
      });
      setShowCancelModal(false);
      setCancelReasonCustom('');
      await fetchStatus();
    } catch (err) {
      setCancelFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to cancel subscription.',
      });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleStartTrial = async () => {
    try {
      setActionLoading(true);
      const res = await axios.post('/api/membership/trial');
      showNotice(res.data.message || '7-Day Research Trial activated!', 'info');
      await fetchStatus();
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to activate trial.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitiateOrder = async (planCode = 'premium_6m') => {
    try {
      setActionLoading(true);
      setSubmitError('');
      setSubmitSuccess('');
      const res = await axios.post('/api/membership/orders', { planCode });
      setActiveOrder(res.data.order);
      setPaymentInstructions(res.data.paymentInstructions);
      setActiveTab('bkash');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to initiate membership order.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!activeOrder) {
      setSubmitError('Please initiate an order first.');
      return;
    }
    if (!trxId.trim()) {
      setSubmitError('bKash Transaction ID (TrxID) is required.');
      return;
    }

    try {
      setActionLoading(true);
      setSubmitError('');
      setSubmitSuccess('');

      const res = await axios.post('/api/membership/payments', {
        orderId: activeOrder.id,
        trxId: trxId.trim().toUpperCase(),
        senderNumber: senderNumber.trim(),
      });

      setSubmitSuccess(res.data.message || 'Payment submitted successfully!');
      setTrxId('');
      setSenderNumber('');
      await fetchStatus();
      await fetchHistory();
      setTimeout(() => {
        setActiveTab('history');
      }, 1500);
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit payment claim.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCorrectSubmission = async (e) => {
    e.preventDefault();
    if (!editingSubmission) return;

    try {
      setCorrectionLoading(true);
      await axios.post(`/api/membership/payments/${editingSubmission.id}/correct`, {
        trxId: correctionTrxId.trim().toUpperCase(),
        senderNumber: correctionSender.trim(),
      });
      showNotice('Payment details updated and re-queued for admin review.', 'info');
      setEditingSubmission(null);
      await fetchHistory();
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to update payment.', 'error');
    } finally {
      setCorrectionLoading(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!isOpen) return null;

  const currentPlan = membershipStatus?.entitlements?.plan || 'free';
  const currentPlanCode = membershipStatus?.entitlements?.planCode || currentPlan;
  const effectiveIsTrial = membershipStatus?.entitlements?.source === 'trial';
  const activePeriod = membershipStatus?.activePeriod;
  const isEligibleForTrial = Boolean(membershipStatus?.entitlements?.trialEligible);

  const orderPriceBdt = activeOrder
    ? (activeOrder.pricePaisa ? activeOrder.pricePaisa / 100 : (activeOrder.plan === 'pro_max_12m' ? 850 : 500))
    : 500;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FAF9F5] dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col text-[#1C1B18] dark:text-[#F0EDE6] overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#1C1B18] dark:bg-[#141412] text-[#FAF9F5] px-6 py-4 flex items-center justify-between border-b border-neutral-800 dark:border-[#2C2A26]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-amber-500 text-neutral-950 flex items-center justify-center font-bold">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-lg font-serif-title tracking-tight leading-tight">
                Academic Depository Membership
              </h2>
              <p className="text-[11px] font-mono-meta text-neutral-300 dark:text-neutral-400">
                Transparent Scholarly Pricing · 7-Day Research Trial · Manual Renewal via bKash (No Auto-Debit)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-neutral-400 hover:text-white hover:bg-neutral-800 dark:hover:bg-[#272521] transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white dark:bg-[#201F1C] border-b border-[#E2DFD8] dark:border-[#2C2A26] px-6 py-2 flex items-center justify-between text-xs font-mono-meta">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-3 py-1.5 rounded-sm transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'plans'
                  ? 'bg-[#1C1B18] dark:bg-[#F0EDE6] text-white dark:text-[#141412] font-bold'
                  : 'text-[#737067] dark:text-[#9C988F] hover:bg-[#F2EFE8] dark:hover:bg-[#272521] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Membership Plans</span>
            </button>

            <button
              onClick={() => setActiveTab('bkash')}
              className={`px-3 py-1.5 rounded-sm transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'bkash'
                  ? 'bg-[#1C1B18] dark:bg-[#F0EDE6] text-white dark:text-[#141412] font-bold'
                  : 'text-[#737067] dark:text-[#9C988F] hover:bg-[#F2EFE8] dark:hover:bg-[#272521] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>bKash Checkout</span>
              {activeOrder && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-sm transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-[#1C1B18] dark:bg-[#F0EDE6] text-white dark:text-[#141412] font-bold'
                  : 'text-[#737067] dark:text-[#9C988F] hover:bg-[#F2EFE8] dark:hover:bg-[#272521] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Payment History</span>
              {history.length > 0 && (
                <span className="bg-[#FAF9F5] dark:bg-[#272521] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#E8E6E1] px-1.5 py-0.2 rounded-xs text-[10px]">
                  {history.length}
                </span>
              )}
            </button>
          </div>

          {/* Current Status Pill */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#737067] dark:text-[#9C988F]">Current Tier:</span>
            <span
              className={`px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider ${
                activePeriod?.source === 'manual_admin'
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-300 border border-blue-400 dark:border-blue-800'
                  : currentPlanCode === 'pro_max_12m'
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-400 dark:border-amber-800'
                  : currentPlan === 'premium' || currentPlanCode === 'premium_6m'
                  ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                  : effectiveIsTrial
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                  : currentPlan === 'admin'
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : 'bg-neutral-100 dark:bg-neutral-900/60 text-neutral-800 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700'
              }`}
            >
              {activePeriod?.source === 'manual_admin'
                ? (activePeriod.customLabel || activePeriod.label || 'Administrative Grant')
                : effectiveIsTrial
                ? '7-Day Trial'
                : currentPlanCode === 'pro_max_12m'
                ? 'Pro Max Annual'
                : currentPlanCode === 'premium_6m' || currentPlan === 'premium'
                ? 'Premium'
                : currentPlan}
            </span>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#FAF9F5] dark:bg-[#141412] space-y-6">
          {/* Action Feedback Banner */}
          {cancelFeedback.message && (
            <div
              className={`p-3.5 rounded-sm border flex items-start justify-between gap-3 text-xs animate-in fade-in duration-200 ${
                cancelFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {cancelFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold block">
                    {cancelFeedback.type === 'success' ? 'Subscription Updated' : 'Notice'}
                  </span>
                  <p className="mt-0.5 leading-relaxed">{cancelFeedback.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelFeedback({ type: '', message: '' })}
                className="text-neutral-500 hover:text-neutral-800 p-0.5 cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: PLANS & STATUS */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              {/* Active Plan Notification Banner */}
              {activePeriod && (
                <div className={`p-4 rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border ${
                  activePeriod.source === 'manual_admin'
                    ? 'bg-blue-50/70 border-blue-300'
                    : 'bg-purple-50 border-purple-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${
                      activePeriod.source === 'manual_admin' ? 'text-blue-700' : 'text-purple-700'
                    }`} />
                    <div>
                      <h4 className={`font-semibold text-sm ${
                        activePeriod.source === 'manual_admin' ? 'text-blue-950' : 'text-purple-900'
                      }`}>
                        {activePeriod.source === 'manual_admin'
                          ? (activePeriod.customLabel || activePeriod.label || 'Administrative Access Grant')
                          : `Active Paid Membership (${activePeriod.plan === 'pro_max_12m' ? 'Pro Max Annual' : 'Premium 6-Month'})`}
                      </h4>
                      <div className={`text-xs mt-0.5 ${
                        activePeriod.source === 'manual_admin' ? 'text-blue-900' : 'text-purple-800'
                      }`}>
                        {activePeriod.source === 'manual_admin' ? (
                          <>
                            <span>
                              You have complimentary research access granted by Depository Administration, active through{' '}
                              <strong>{activePeriod.formattedExpiry || new Date(activePeriod.expiresAt).toLocaleDateString()}</strong> (Asia/Dhaka time). Unlimited daily searches, grounded paper summaries, and full research tools active.
                            </span>
                            {activePeriod.grantReason && (
                              <span className="block mt-1 italic text-[11px] text-blue-800 bg-white/70 px-2 py-0.5 rounded border border-blue-200">
                                Note: "{activePeriod.grantReason}"
                              </span>
                            )}
                          </>
                        ) : (
                          <span>
                            Your coverage is active through{' '}
                            <strong>{activePeriod.formattedExpiry || new Date(activePeriod.expiresAt).toLocaleDateString()}</strong> (Asia/Dhaka time). You enjoy unlimited daily searches, unlimited paper dataset discovery, 1,000 saved papers, 50 collections, bulk export, and 10 topic alerts.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelFeedback({ type: '', message: '' });
                      setShowCancelModal(true);
                    }}
                    className="shrink-0 px-3 py-1.5 text-xs font-mono-meta text-rose-700 hover:text-white hover:bg-rose-700 border border-rose-300 hover:border-rose-700 rounded-xs transition cursor-pointer flex items-center gap-1.5"
                    title={activePeriod.source === 'manual_admin' ? 'Cancel Grant' : 'Cancel Active Subscription'}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{activePeriod.source === 'manual_admin' ? 'Cancel Access' : 'Cancel Subscription'}</span>
                  </button>
                </div>
              )}

              {effectiveIsTrial && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm text-blue-900">
                        7-Day Research Trial In Progress
                      </h4>
                      <p className="text-xs text-blue-800 mt-0.5">
                        You have 20 daily searches, up to 5 paper dataset lookups per day, 50 saved papers, and 1 active topic alert. No automatic debit or credit card charge will ever occur.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelFeedback({ type: '', message: '' });
                      setShowCancelModal(true);
                    }}
                    className="shrink-0 px-3 py-1.5 text-xs font-mono-meta text-rose-700 hover:text-white hover:bg-rose-700 border border-rose-300 hover:border-rose-700 rounded-xs transition cursor-pointer flex items-center gap-1.5"
                    title="Cancel 7-Day Research Trial"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Trial</span>
                  </button>
                </div>
              )}

              {/* Four Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Free Academic */}
                <div className="bg-white border border-[#D5D1C7] rounded-sm p-4 flex flex-col justify-between shadow-2xs relative">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="font-serif-title text-base font-bold text-[#1C1B18]">
                        Standard Academic
                      </h3>
                      {currentPlan === 'free' && !effectiveIsTrial && (
                        <span className="bg-[#1C1B18] text-white text-[9px] px-1.5 py-0.5 rounded-xs font-mono-meta uppercase">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-serif-title font-bold text-[#1C1B18] my-2">
                      ৳0{' '}
                      <span className="text-[11px] font-mono-meta text-[#737067] font-normal">
                        / permanent
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737067] mb-3">
                      Essential scholarly search for verified university students.
                    </p>
                    <ul className="space-y-1.5 text-xs text-[#2E2C28] border-t border-[#F2EFE8] pt-2.5">
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span><strong>10 searches</strong> / Dhaka day</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>Up to 10 saved papers in library</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>1 project collection</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>Individual APA, BibTeX, & RIS citations</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px] text-neutral-400">
                        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-700" />
                        <span>Paper dataset discovery locked</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px] text-neutral-400">
                        <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>No bulk bibliography export</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-[#F2EFE8]">
                    <span className="text-[10px] font-mono-meta text-[#737067] block text-center">
                      Included with verified student account
                    </span>
                  </div>
                </div>

                {/* 2. 7-Day Research Trial */}
                <div className="bg-white border-2 border-blue-500 rounded-sm p-4 flex flex-col justify-between shadow-xs relative">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-mono-meta uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shadow-2xs whitespace-nowrap">
                    Single-Use Trial
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="font-serif-title text-base font-bold text-blue-950">
                        7-Day Research Trial
                      </h3>
                      {effectiveIsTrial && (
                        <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-xs font-mono-meta uppercase">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-serif-title font-bold text-blue-950 my-2">
                      ৳0{' '}
                      <span className="text-[11px] font-mono-meta text-[#737067] font-normal">
                        / 7 continuous days
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737067] mb-3">
                      High-capacity research workflow with zero payment credentials required.
                    </p>
                    <ul className="space-y-1.5 text-xs text-[#2E2C28] border-t border-[#F2EFE8] pt-2.5">
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <span><strong>20 searches</strong> / Dhaka day</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <span><strong>5 dataset lookups</strong> / day</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <span>Up to 50 saved papers</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <span>3 project collections</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <span>1 saved comparison matrix</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <span>1 active topic alert</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-[#F2EFE8]">
                    <button
                      onClick={handleStartTrial}
                      disabled={actionLoading || !isEligibleForTrial}
                      className={`w-full py-1.5 px-2 rounded-xs font-mono-meta text-[11px] uppercase tracking-wider font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        isEligibleForTrial
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                          : 'bg-neutral-100 text-neutral-400 cursor-not-allowed border border-neutral-200'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        {effectiveIsTrial
                          ? 'Trial Active'
                          : activePeriod
                          ? 'Paid Plan Active'
                          : isEligibleForTrial
                          ? 'Activate 7-Day Trial'
                          : 'Trial Already Used'}
                      </span>
                    </button>
                    {!isEligibleForTrial && !effectiveIsTrial && !activePeriod && (
                      <span className="text-[9px] text-neutral-500 block text-center mt-1">
                        One trial per eligible account
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Premium Scholarly Discovery (6 Months) */}
                <div className="bg-white border-2 border-purple-600 rounded-sm p-4 flex flex-col justify-between shadow-xs relative">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-purple-700 text-white text-[9px] font-mono-meta uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shadow-2xs whitespace-nowrap">
                    Semiannual (6 Mo)
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="font-serif-title text-base font-bold text-purple-950">
                        Premium (6 Mo)
                      </h3>
                      {currentPlanCode === 'premium_6m' && (
                        <span className="bg-purple-700 text-white text-[9px] px-1.5 py-0.5 rounded-xs font-mono-meta uppercase">
                          {activePeriod?.source === 'manual_admin' ? 'Active (Admin Grant)' : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-serif-title font-bold text-purple-950 my-2">
                      ৳500{' '}
                      <span className="text-[11px] font-mono-meta text-[#737067] font-normal">
                        / 6 calendar months
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737067] mb-3">
                      Complete uninhibited scholarly discovery for semester thesis research.
                    </p>
                    <ul className="space-y-1.5 text-xs text-[#2E2C28] border-t border-[#F2EFE8] pt-2.5">
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-purple-700 mt-0.5 shrink-0" />
                        <span><strong>Unlimited</strong> daily paper searches</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-purple-700 mt-0.5 shrink-0" />
                        <span><strong>Unlimited</strong> paper dataset discovery</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-purple-700 mt-0.5 shrink-0" />
                        <span>Up to 1,000 saved papers & notes</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-purple-700 mt-0.5 shrink-0" />
                        <span>Up to 50 topic collections</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-purple-700 mt-0.5 shrink-0" />
                        <span>Bulk BibTeX & RIS export</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-purple-700 mt-0.5 shrink-0" />
                        <span>10 active topic inquiry alerts</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-[#F2EFE8]">
                    <button
                      onClick={() => handleInitiateOrder('premium_6m')}
                      disabled={actionLoading}
                      className="w-full py-1.5 px-2 rounded-xs bg-purple-700 hover:bg-purple-800 text-white font-mono-meta text-[11px] uppercase tracking-wider font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Choose Premium (৳500)</span>
                    </button>
                    {activePeriod && (
                      <span className="text-[9px] text-neutral-500 block text-center mt-1">
                        Renewal extends active coverage by 6 months
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. Pro Max Annual (12 Months) */}
                <div className="bg-white border-2 border-amber-500 rounded-sm p-4 flex flex-col justify-between shadow-xs relative">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-[9px] font-mono-meta uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shadow-2xs whitespace-nowrap">
                    Best Value · Annual
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="font-serif-title text-base font-bold text-amber-950">
                        Pro Max Annual
                      </h3>
                      {currentPlanCode === 'pro_max_12m' && (
                        <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded-xs font-mono-meta uppercase">
                          {activePeriod?.source === 'manual_admin' ? 'Active (Admin Grant)' : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-serif-title font-bold text-amber-950 my-2">
                      ৳850{' '}
                      <span className="text-[11px] font-mono-meta text-[#737067] font-normal">
                        / 12 calendar months
                      </span>
                    </div>

                    <div className="p-1.5 bg-amber-50 border border-amber-300 rounded-xs text-[10px] text-amber-900 font-mono-meta font-medium mb-3">
                      Save BDT 150 (15%) versus two BDT 500 six-month memberships
                    </div>

                    <ul className="space-y-1.5 text-xs text-[#2E2C28] border-t border-[#F2EFE8] pt-2.5">
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span><strong>12 full calendar months</strong> coverage</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span><strong>Unlimited</strong> daily paper searches</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span><strong>Unlimited</strong> paper dataset discovery</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span>Up to 1,000 saved papers & notes</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span>Up to 50 topic collections</span>
                      </li>
                      <li className="flex items-start gap-1.5 text-[11px]">
                        <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span>Bulk BibTeX & RIS exports & 10 alerts</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-[#F2EFE8]">
                    <button
                      onClick={() => handleInitiateOrder('pro_max_12m')}
                      disabled={actionLoading}
                      className="w-full py-1.5 px-2 rounded-xs bg-amber-600 hover:bg-amber-700 text-white font-mono-meta text-[11px] uppercase tracking-wider font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Choose Pro Max (৳850)</span>
                    </button>
                    {activePeriod && (
                      <span className="text-[9px] text-neutral-500 block text-center mt-1">
                        Renewal extends active coverage by 12 months
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Exact Feature Comparison Matrix Table */}
              <div className="bg-white border border-[#D5D1C7] rounded-sm p-4 shadow-2xs space-y-3">
                <h4 className="font-serif-title text-sm font-bold text-[#1C1B18] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#737067]" />
                  <span>Comprehensive Research Entitlement Matrix</span>
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono-meta border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2DFD8] text-[11px] text-[#737067] uppercase">
                        <th className="py-2 pr-4 font-bold">Research Feature</th>
                        <th className="py-2 px-3">Standard Academic</th>
                        <th className="py-2 px-3 text-blue-900 bg-blue-50/40">7-Day Trial</th>
                        <th className="py-2 px-3 text-purple-900 bg-purple-50/40">Premium (6 Mo)</th>
                        <th className="py-2 pl-3 text-amber-950 bg-amber-50/40">Pro Max (12 Mo)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2EFE8] text-[11px]">
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Committed Paper Searches</td>
                        <td className="py-2 px-3 text-[#737067]">10 / Dhaka day</td>
                        <td className="py-2 px-3 bg-blue-50/40 font-bold text-blue-900">20 / Dhaka day</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">Unlimited</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">Unlimited</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Paper-Specific Dataset Discovery</td>
                        <td className="py-2 px-3 text-neutral-400">Locked</td>
                        <td className="py-2 px-3 bg-blue-50/40 font-bold text-blue-900">5 lookups / day</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">Unlimited</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">Unlimited</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Saved Papers Library</td>
                        <td className="py-2 px-3 text-[#737067]">Up to 10</td>
                        <td className="py-2 px-3 bg-blue-50/40 text-blue-900">Up to 50</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">Up to 1,000</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">Up to 1,000</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Research Collections</td>
                        <td className="py-2 px-3 text-[#737067]">1 collection</td>
                        <td className="py-2 px-3 bg-blue-50/40 text-blue-900">3 collections</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">Up to 50</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">Up to 50</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Literature Comparison Matrices</td>
                        <td className="py-2 px-3 text-neutral-400">None</td>
                        <td className="py-2 px-3 bg-blue-50/40 text-blue-900">1 matrix</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">Unlimited (with CSV)</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">Unlimited (with CSV)</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Citation Exports</td>
                        <td className="py-2 px-3 text-[#737067]">Individual APA/Bib/RIS</td>
                        <td className="py-2 px-3 bg-blue-50/40 text-blue-900">Individual APA/Bib/RIS</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">Bulk BibTeX & RIS</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">Bulk BibTeX & RIS</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Automated Topic Alerts</td>
                        <td className="py-2 px-3 text-neutral-400">0</td>
                        <td className="py-2 px-3 bg-blue-50/40 text-blue-900">1 alert</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">Up to 10 alerts</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">Up to 10 alerts</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-[#1C1B18]">Pricing & Term</td>
                        <td className="py-2 px-3 font-bold text-[#1C1B18]">BDT 0</td>
                        <td className="py-2 px-3 bg-blue-50/40 font-bold text-blue-900">BDT 0 (7 days)</td>
                        <td className="py-2 px-3 bg-purple-50/40 font-bold text-purple-900">৳500 / 6 months</td>
                        <td className="py-2 pl-3 bg-amber-50/40 font-bold text-amber-900">৳850 / 12 months</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SEPARATE CANCELLATION SECTION EXPLAINING DATA PRESERVATION AND NO AUTO-DEBIT */}
              <div className="bg-white border border-[#D5D1C7] rounded-sm p-5 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#F2EFE8] pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif-title font-bold text-base text-[#1C1B18]">
                        Self-Service Subscription Cancellation & Data Preservation
                      </span>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono-meta font-bold px-2 py-0.5 rounded-xs">
                        Zero Lock-In
                      </span>
                    </div>
                    <p className="text-xs text-[#737067] max-w-2xl leading-relaxed">
                      You are completely free to cancel your active subscription or 7-day trial at any time. When cancelled or expired, <strong className="text-[#1C1B18]">100% of your saved papers, private annotations, and collections remain permanently preserved</strong> in your account.
                    </p>
                  </div>

                  {(currentPlan === 'premium' || currentPlanCode === 'pro_max_12m' || effectiveIsTrial || membershipStatus?.canCancel) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelFeedback({ type: '', message: '' });
                        setShowCancelModal(true);
                      }}
                      className="shrink-0 px-3.5 py-2 text-xs font-mono-meta uppercase tracking-wider font-bold text-rose-700 hover:text-white hover:bg-rose-700 border border-rose-300 hover:border-rose-700 rounded-xs transition cursor-pointer"
                    >
                      Cancel Subscription
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1 font-sans">
                  <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-xs space-y-1">
                    <div className="font-bold text-[#1C1B18] font-mono-meta text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Data Preservation Vault</span>
                    </div>
                    <p className="text-[11px] text-[#605D55] leading-relaxed">
                      Previously saved items, personal annotations, and chapter collections remain permanently viewable and exportable.
                    </p>
                  </div>

                  <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-xs space-y-1">
                    <div className="font-bold text-[#1C1B18] font-mono-meta text-[11px] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-700" />
                      <span>No Automatic Debit</span>
                    </div>
                    <p className="text-[11px] text-[#605D55] leading-relaxed">
                      All payments are manually initiated through bKash. We never store bank cards and no recurring debit exists.
                    </p>
                  </div>

                  <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-xs space-y-1">
                    <div className="font-bold text-[#1C1B18] font-mono-meta text-[11px] flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-blue-700" />
                      <span>Seamless Re-activation</span>
                    </div>
                    <p className="text-[11px] text-[#605D55] leading-relaxed">
                      You can renew at any time in the future to regain unlimited daily searches and active topic alerts.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BKASH PAYMENT CHECKOUT */}
          {activeTab === 'bkash' && (
            <div className="max-w-2xl mx-auto space-y-6">
              {!activeOrder ? (
                <div className="text-center py-10 bg-white border border-[#D5D1C7] rounded-sm p-8 space-y-4">
                  <CreditCard className="w-12 h-12 text-purple-700 mx-auto" />
                  <h3 className="font-serif-title text-xl font-bold text-[#1C1B18]">
                    Select a Plan to Initiate Checkout
                  </h3>
                  <p className="text-xs text-[#737067] max-w-md mx-auto">
                    Please choose between Premium (৳500 / 6 Mo) or Pro Max Annual (৳850 / 12 Mo) to generate your verified bKash order reference.
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => handleInitiateOrder('premium_6m')}
                      disabled={actionLoading}
                      className="bg-purple-700 hover:bg-purple-800 text-white px-4 py-2 rounded-xs font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <span>Choose Premium (৳500)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleInitiateOrder('pro_max_12m')}
                      disabled={actionLoading}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xs font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <span>Choose Pro Max (৳850)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#D5D1C7] rounded-sm p-6 shadow-2xs space-y-5">
                  {/* Order Summary Header */}
                  <div className="border-b border-[#E2DFD8] pb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider block">
                        Order Snapshot Reference ({activeOrder.planName || (activeOrder.plan === 'pro_max_12m' ? 'Pro Max Annual' : 'Premium 6-Month')})
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-base font-bold text-[#1C1B18] bg-[#FAF9F5] px-2.5 py-0.5 border border-[#D5D1C7] rounded-xs">
                          {activeOrder.orderRef}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(activeOrder.orderRef, 'orderRef')}
                          className="p-1 text-[#737067] hover:text-[#1C1B18] transition cursor-pointer"
                          title="Copy Order Reference"
                        >
                          {copiedField === 'orderRef' ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider block">
                        Payable Amount ({activeOrder.plan === 'pro_max_12m' ? '12 Months' : '6 Months'})
                      </span>
                      <span className="font-serif-title text-2xl font-bold text-purple-900 block leading-tight">
                        ৳{orderPriceBdt}.00 <span className="text-xs font-mono font-normal">BDT</span>
                      </span>
                    </div>
                  </div>

                  {/* bKash Payment Instructions Card */}
                  <div className="bg-pink-50/60 border border-pink-200 rounded-sm p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-xs bg-pink-600 text-white font-bold flex items-center justify-center text-[10px]">
                          bK
                        </div>
                        <span className="font-bold text-pink-950 font-serif-title">
                          Official bKash Payment Details
                        </span>
                      </div>
                      <span className="text-[10px] font-mono-meta text-pink-800 bg-pink-100 px-2 py-0.5 rounded-xs font-semibold">
                        Manual Verification
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="bg-white p-2.5 rounded-xs border border-pink-200">
                        <span className="text-[10px] font-mono-meta text-neutral-500 block uppercase">
                          Merchant / Account Number
                        </span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-mono font-bold text-sm text-[#1C1B18]">
                            {paymentInstructions?.merchantNumber || '01777000000'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                paymentInstructions?.merchantNumber || '01777000000',
                                'merchantNum'
                              )
                            }
                            className="p-0.5 text-neutral-500 hover:text-black transition cursor-pointer"
                            title="Copy number"
                          >
                            {copiedField === 'merchantNum' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xs border border-pink-200">
                        <span className="text-[10px] font-mono-meta text-neutral-500 block uppercase">
                          Account Name
                        </span>
                        <span className="font-sans font-semibold text-xs text-[#1C1B18] block mt-1 truncate">
                          {paymentInstructions?.merchantName || 'The Thesis Archive'}
                        </span>
                      </div>
                    </div>

                    {/* Step-by-Step Instructions */}
                    <div className="pt-2 border-t border-pink-200/60">
                      <span className="font-bold text-[11px] text-pink-950 block mb-1.5">
                        Instructions:
                      </span>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-pink-900 leading-relaxed font-sans">
                        <li>Open your bKash mobile application.</li>
                        <li>Select <strong>"Make Payment"</strong> (or "Send Money") to <strong>{paymentInstructions?.merchantNumber || '01777000000'}</strong>.</li>
                        <li>Enter exact amount: <strong>৳{orderPriceBdt}</strong>.</li>
                        <li>In the <strong>Reference</strong> field, enter: <strong className="font-mono text-neutral-900">{activeOrder.orderRef}</strong>.</li>
                        <li>Confirm the transaction with your PIN inside the official bKash app.</li>
                        <li>Copy the <strong>Transaction ID (TrxID)</strong> from your confirmation SMS or receipt and paste it below.</li>
                      </ol>
                    </div>

                    {/* Security Notice */}
                    <div className="bg-white/80 p-2.5 rounded-xs border border-amber-300 text-amber-900 flex items-start gap-2 text-[11px]">
                      <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>
                        <strong>Security Guarantee:</strong> We will <u>NEVER</u> ask for your bKash PIN or OTP. All financial authorizations occur exclusively inside your official bKash mobile application.
                      </span>
                    </div>
                  </div>

                  {/* Submission Form */}
                  <form onSubmit={handleSubmitPayment} className="space-y-4 pt-2">
                    <h4 className="font-serif-title text-base font-bold text-[#1C1B18] border-b border-[#E2DFD8] pb-1">
                      Submit Payment Verification Claim
                    </h4>

                    {submitError && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    {submitSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{submitSuccess}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-mono-meta font-bold text-[#1C1B18] mb-1">
                        bKash Transaction ID (TrxID) *
                      </label>
                      <input
                        type="text"
                        required
                        value={trxId}
                        onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                        placeholder="e.g. BKA7X89Q1Z"
                        className="w-full bg-[#FAF9F5] border border-[#D5D1C7] focus:border-[#1C1B18] px-3 py-2 text-sm font-mono text-[#1C1B18] rounded-xs uppercase tracking-wider focus:outline-none"
                      />
                      <span className="text-[10px] text-[#737067] font-mono-meta block mt-0.5">
                        Found in your bKash confirmation SMS or app transaction statement.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-mono-meta font-bold text-[#1C1B18] mb-1">
                        Sender bKash Mobile Number (Optional)
                      </label>
                      <input
                        type="text"
                        value={senderNumber}
                        onChange={(e) => setSenderNumber(e.target.value)}
                        placeholder="e.g. 017XXXXXXXX"
                        className="w-full bg-[#FAF9F5] border border-[#D5D1C7] focus:border-[#1C1B18] px-3 py-2 text-xs font-mono text-[#1C1B18] rounded-xs focus:outline-none"
                      />
                      <span className="text-[10px] text-[#737067] font-mono-meta block mt-0.5">
                        Assists the depository administrator in locating your transaction on the bKash merchant ledger.
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setActiveOrder(null)}
                        className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] cursor-pointer"
                      >
                        ← Choose Another Plan
                      </button>

                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="bg-purple-700 hover:bg-purple-800 text-white px-5 py-2 rounded-xs font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying Claim...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Submit Payment for Verification</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PAYMENT HISTORY & STATUS TRACKING */}
          {activeTab === 'history' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif-title text-base font-bold text-[#1C1B18]">
                    Your bKash Payment Submissions
                  </h3>
                  <p className="text-xs text-[#737067]">
                    Track manual verification status, review admin notes, or correct flagged transaction IDs.
                  </p>
                </div>
                <button
                  onClick={fetchHistory}
                  className="px-2.5 py-1 text-xs font-mono-meta bg-white border border-[#D5D1C7] hover:bg-[#F2EFE8] rounded-xs flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Editing / Correction Inline */}
              {editingSubmission && (
                <div className="bg-amber-50 border border-amber-300 p-4 rounded-sm shadow-xs mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-700" />
                      <h4 className="font-bold text-xs text-amber-950 font-mono-meta uppercase">
                        Correct Transaction Submission ({editingSubmission.orderRef})
                      </h4>
                    </div>
                    <button
                      onClick={() => setEditingSubmission(null)}
                      className="text-amber-800 hover:text-black text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  {editingSubmission.adminInstructions && (
                    <div className="bg-white p-2.5 rounded-xs border border-amber-200 text-xs text-amber-900 mb-3 font-sans">
                      <strong>Admin Verification Note:</strong> {editingSubmission.adminInstructions}
                    </div>
                  )}

                  <form onSubmit={handleCorrectSubmission} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-mono-meta font-bold text-neutral-800 mb-0.5">
                          Correct bKash TrxID *
                        </label>
                        <input
                          type="text"
                          required
                          value={correctionTrxId}
                          onChange={(e) => setCorrectionTrxId(e.target.value.toUpperCase())}
                          className="w-full bg-white border border-[#D5D1C7] px-2.5 py-1.5 text-xs font-mono rounded-xs focus:outline-none uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono-meta font-bold text-neutral-800 mb-0.5">
                          Sender Mobile Number
                        </label>
                        <input
                          type="text"
                          value={correctionSender}
                          onChange={(e) => setCorrectionSender(e.target.value)}
                          className="w-full bg-white border border-[#D5D1C7] px-2.5 py-1.5 text-xs font-mono rounded-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingSubmission(null)}
                        className="px-3 py-1 bg-white border border-neutral-300 text-xs font-mono-meta rounded-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={correctionLoading}
                        className="px-3 py-1 bg-[#1C1B18] text-white text-xs font-mono-meta font-bold uppercase rounded-xs cursor-pointer hover:bg-neutral-800"
                      >
                        {correctionLoading ? 'Saving...' : 'Re-submit for Verification'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {history.length === 0 ? (
                <div className="text-center py-10 bg-white border border-[#D5D1C7] rounded-sm p-6 text-xs text-[#737067]">
                  No bKash payment claims submitted yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((sub) => {
                    const isApproved = sub.status === 'approved';
                    const isRejected = sub.status === 'rejected';
                    const isUnderReview = sub.status === 'under_review';
                    const isSubmitted = sub.status === 'submitted';

                    return (
                      <div
                        key={sub.id}
                        className="bg-white border border-[#D5D1C7] rounded-sm p-4 text-xs space-y-2 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F2EFE8] pb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-sm text-[#1C1B18]">
                              {sub.orderRef}
                            </span>
                            <span className="font-mono text-xs text-neutral-500">
                              TrxID: <strong>{sub.trxId}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-serif-title font-bold text-sm text-[#1C1B18]">
                              ৳{sub.amount} BDT
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-xs text-[10px] font-mono-meta font-bold uppercase tracking-wider ${
                                isApproved
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : isRejected
                                  ? 'bg-red-100 text-red-900 border border-red-300'
                                  : isUnderReview
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-blue-100 text-blue-900 border border-blue-300'
                              }`}
                            >
                              {isApproved
                                ? 'Approved & Active'
                                : isRejected
                                ? 'Rejected'
                                : isUnderReview
                                ? 'Needs Correction'
                                : 'Pending Verification'}
                            </span>
                          </div>
                        </div>

                        {/* Status Explanations */}
                        {isApproved && (
                          <div className="text-emerald-800 text-[11px] flex items-center gap-1.5 pt-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Verified against bKash merchant statement. Research membership period is active.
                            </span>
                          </div>
                        )}

                        {isRejected && (
                          <div className="bg-red-50 border border-red-200 p-2.5 rounded-xs text-red-900 text-xs">
                            <strong>Editorial Rejection Reason:</strong> {sub.rejectionReason || 'Transaction ID could not be reconciled against merchant statement.'}
                          </div>
                        )}

                        {isUnderReview && (
                          <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xs text-amber-900 text-xs flex items-center justify-between gap-3">
                            <div>
                              <strong>Admin Instruction:</strong>{' '}
                              {sub.adminInstructions || 'Please review your TrxID and re-submit.'}
                            </div>
                            <button
                              onClick={() => {
                                setEditingSubmission(sub);
                                setCorrectionTrxId(sub.trxId);
                                setCorrectionSender(sub.senderNumber || '');
                              }}
                              className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xs text-[10px] font-mono-meta uppercase tracking-wider font-bold cursor-pointer shrink-0"
                            >
                              Correct TrxID
                            </button>
                          </div>
                        )}

                        {isSubmitted && (
                          <div className="text-[#737067] text-[11px] flex items-center gap-1.5 pt-1">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Awaiting administrative verification against merchant bank statement. Approvals are typically completed within 1 to 4 hours.
                            </span>
                          </div>
                        )}

                        <div className="text-[10px] font-mono-meta text-neutral-400 pt-1 flex items-center justify-between">
                          <span>
                            Submitted: {new Date(sub.submittedAt).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} (Dhaka)
                          </span>
                          {sub.reviewedAt && (
                            <span>
                              Reviewed: {new Date(sub.reviewedAt).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#FAF9F5] border-t border-[#E2DFD8] px-6 py-3 flex items-center justify-between text-xs font-mono-meta">
          <span className="text-[#737067] text-[11px]">
            The Thesis Archive Depository · Asia/Dhaka Financial Operations
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1C1B18] hover:bg-[#2E2C28] text-white rounded-xs text-xs font-mono-meta uppercase tracking-wider cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Cancellation Confirmation Dialog */}
      {showCancelModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#FAF9F5] border border-[#D5D1C7] rounded-sm shadow-2xl w-full max-w-lg p-6 text-[#1C1B18] space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-sm bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif-title text-base font-bold text-[#1C1B18]">
                    Cancel Subscription
                  </h3>
                  <p className="text-[11px] font-mono-meta text-[#737067]">
                    Academic Depository Vault Guarantee
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer p-1"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Crucial Data Preservation Notice */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xs p-3.5 text-xs text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Your Saved Papers & Collections Are 100% Safe</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Cancelling will never delete or erase your research. Everything in your personal library and existing collections remains permanently available for viewing, individual citation exports, and note-taking.
              </p>
            </div>

            {/* Quota Transition Explanation */}
            <div className="bg-neutral-100 border border-neutral-200 rounded-xs p-3 text-xs text-[#737067] space-y-1 font-mono-meta text-[11px]">
              <div className="text-neutral-900 font-bold">What changes upon cancellation:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Your account returns to the Standard Academic plan immediately.</li>
                <li>Adding new saved papers beyond 10 and automated topic inquiry alerts are paused.</li>
                <li>No automated charges exist—bKash payments are strictly manual and never auto-debited.</li>
              </ul>
            </div>

            {/* Optional Reason Form */}
            <div className="space-y-2">
              <label className="block text-xs font-mono-meta text-[#737067]">
                Reason for cancellation (optional):
              </label>
              <select
                value={cancelReasonPreset}
                onChange={(e) => setCancelReasonPreset(e.target.value)}
                className="w-full text-xs p-2 bg-white border border-[#D5D1C7] rounded-xs text-[#1C1B18] focus:outline-hidden focus:border-[#1C1B18]"
              >
                <option value="Completed current research project">Completed current research / thesis project</option>
                <option value="Taking a temporary break">Taking a temporary break from research</option>
                <option value="Features didn't fit my workflow">Features didn't fit my current workflow</option>
                <option value="Budget / financial considerations">Budget / financial considerations</option>
                <option value="Other">Other reason</option>
              </select>

              <textarea
                value={cancelReasonCustom}
                onChange={(e) => setCancelReasonCustom(e.target.value)}
                rows={2}
                placeholder="Additional notes or suggestions for depository editors (optional)..."
                className="w-full text-xs p-2 bg-white border border-[#D5D1C7] rounded-xs text-[#1C1B18] placeholder:text-neutral-400 focus:outline-hidden focus:border-[#1C1B18]"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2DFD8]">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={cancelLoading}
                className="px-3 py-1.5 text-xs font-mono-meta rounded-xs border border-[#D5D1C7] text-[#1C1B18] hover:bg-[#F2EFE8] transition cursor-pointer"
              >
                Keep Subscription
              </button>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
                className="px-4 py-1.5 text-xs font-mono-meta font-bold uppercase tracking-wider rounded-xs bg-rose-700 hover:bg-rose-800 text-white transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                {cancelLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Confirm Cancellation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
