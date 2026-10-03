import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Calendar, Clock, ShieldCheck, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export default function ManualGrantModal({ isOpen, onClose, student, onSuccess }) {
  const [planCode, setPlanCode] = useState('premium_6m');
  const [overlapMode, setOverlapMode] = useState('start_now');
  const [durationPreset, setDurationPreset] = useState('7d');
  const [grantType, setGrantType] = useState('test'); // 'test' | 'research_grant' | 'custom'
  const [customLabelInput, setCustomLabelInput] = useState('');
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [expiresAtLocal, setExpiresAtLocal] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [grantRequestId, setGrantRequestId] = useState('');
  const [step, setStep] = useState('edit'); // 'edit' | 'review'
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [error, setError] = useState('');
  const [currentMembership, setCurrentMembership] = useState(student?.membership || null);

  // Helper: Format a Date to YYYY-MM-DDTHH:mm in Asia/Dhaka timezone
  const toDhakaDatetimeLocal = (date) => {
    const d = new Date(date);
    // Asia/Dhaka is UTC+6
    const utcTime = d.getTime() + d.getTimezoneOffset() * 60000;
    const dhakaTime = new Date(utcTime + 6 * 3600000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${dhakaTime.getFullYear()}-${pad(dhakaTime.getMonth() + 1)}-${pad(dhakaTime.getDate())}T${pad(dhakaTime.getHours())}:${pad(dhakaTime.getMinutes())}`;
  };

  // Helper: Convert Asia/Dhaka local string to ISO UTC string
  const dhakaLocalToIso = (dhakaStr) => {
    if (!dhakaStr) return null;
    return `${dhakaStr}:00+06:00`;
  };

  // Helper: Clamped calendar month addition to avoid end-of-month rollover errors
  const addClampedMonths = (date, months) => {
    const d = new Date(date);
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() !== day) {
      d.setDate(0); // Clamps to the last day of the intended month
    }
    return d;
  };

  const applyPreset = (presetKey, baseDate = new Date()) => {
    setDurationPreset(presetKey);
    const start = new Date(baseDate);
    let expiry = new Date(start);

    if (presetKey === '1d') {
      expiry.setDate(start.getDate() + 1);
    } else if (presetKey === '7d') {
      expiry.setDate(start.getDate() + 7);
    } else if (presetKey === '30d') {
      expiry.setDate(start.getDate() + 30);
    } else if (presetKey === '6m') {
      expiry = addClampedMonths(start, 6);
    } else if (presetKey === '12m') {
      expiry = addClampedMonths(start, 12);
    }

    setStartsAtLocal(toDhakaDatetimeLocal(start));
    setExpiresAtLocal(toDhakaDatetimeLocal(expiry));
  };

  const getComputedLabel = () => {
    if (grantType === 'custom' && customLabelInput.trim()) {
      return customLabelInput.trim();
    }
    const tier = planCode === 'pro_max_12m' ? 'Pro Max Tier' : 'Premium Tier';
    if (durationPreset === '1d') {
      return grantType === 'test' ? 'Complimentary Test Access (24 Hours)' : `Research Grant (${tier} · 24 Hours)`;
    }
    if (durationPreset === '7d') {
      return grantType === 'test' ? 'Complimentary Test Access (7 Days)' : `Academic Research Grant (7 Days)`;
    }
    if (durationPreset === '30d') {
      return grantType === 'test' ? 'Complimentary Test Access (30 Days)' : `Academic Research Grant (30 Days)`;
    }
    if (durationPreset === '6m') {
      return `Academic Research Grant (Premium 6-Month)`;
    }
    if (durationPreset === '12m') {
      return `Academic Research Grant (Pro Max Annual)`;
    }
    return grantType === 'test' ? `Complimentary Test Access (${tier})` : `Academic Research Grant (${tier})`;
  };

  useEffect(() => {
    if (isOpen && student) {
      setStep('edit');
      setError('');
      setGrantReason('');
      setPlanCode('premium_6m');
      setOverlapMode('start_now');
      setGrantType('test');
      setCustomLabelInput('');
      setCurrentMembership(student?.membership || null);
      setGrantRequestId(`GRANT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      applyPreset('7d', new Date());
    }
  }, [isOpen, student]);

  if (!isOpen || !student) return null;

  const handleModeChange = (mode) => {
    setOverlapMode(mode);
    if (mode === 'extend_from_current_expiry' && (currentMembership?.expiresAt || student.membership?.expiresAt)) {
      applyPreset(durationPreset, new Date(currentMembership?.expiresAt || student.membership.expiresAt));
    } else {
      applyPreset(durationPreset, new Date());
    }
  };

  const handleProceedToReview = (e) => {
    e.preventDefault();
    setError('');

    if (!grantReason || grantReason.trim().length < 5) {
      setError('A mandatory grant reason of at least 5 characters is required for administrative audit.');
      return;
    }

    const startIso = dhakaLocalToIso(startsAtLocal);
    const expiryIso = dhakaLocalToIso(expiresAtLocal);

    if (!startIso || !expiryIso) {
      setError('Please provide valid start and expiry timestamps.');
      return;
    }

    if (new Date(expiryIso) <= new Date(startIso)) {
      setError('Expiry timestamp must be strictly after the start timestamp.');
      return;
    }

    setStep('review');
  };

  const handleConfirmRevoke = async () => {
    setShowRevokeConfirm(false);
    try {
      setRevoking(true);
      setError('');
      await axios.post(`/api/admin/membership/${student._id || student.id}/revoke`, {
        reason: 'Revoked by administrator from grant override modal',
      });
      setCurrentMembership({ plan: 'free', label: 'Standard Free', expiresAt: null, formattedExpiry: null });
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error revoking membership:', err);
      setError(err.response?.data?.message || 'Failed to revoke membership.');
    } finally {
      setRevoking(false);
    }
  };

  const handleConfirmGrant = async () => {
    try {
      setLoading(true);
      setError('');

      const effectiveRequestId = grantRequestId || `GRANT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const payload = {
        userId: student._id || student.id,
        planCode,
        startsAt: dhakaLocalToIso(startsAtLocal),
        expiresAt: dhakaLocalToIso(expiresAtLocal),
        grantReason: grantReason.trim(),
        overlapMode,
        grantRequestId: effectiveRequestId,
        grantType,
        customLabel: getComputedLabel(),
      };

      await axios.post('/api/admin/memberships/grants', payload);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error submitting manual grant:', err);
      setError(
        err.response?.data?.message ||
        'Failed to grant manual membership. Please verify parameters and retry.'
      );
      setStep('edit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-neutral-900 border border-[#D5D1C7] dark:border-neutral-800 rounded-sm shadow-2xl max-w-xl w-full max-h-[95vh] flex flex-col overflow-hidden z-10 font-mono-meta text-xs text-[#1C1B18] dark:text-neutral-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E2DFD8] dark:border-neutral-800 bg-[#FAF9F5] dark:bg-neutral-950">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-[#1C1B18] dark:text-neutral-100">
                Grant Manual Research Access
              </h3>
              <p className="text-[10px] text-[#737067] dark:text-neutral-400">
                Depository Director Override • Asia/Dhaka Calendar Timestamps
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Student Info Box */}
          <div className="bg-[#FAF9F5] dark:bg-neutral-800/80 border border-[#E5E2DA] dark:border-neutral-700 p-3 rounded-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-[#8C887E] dark:text-neutral-400">TARGET SCHOLAR:</span>
              <strong className="text-[#1C1B18] dark:text-neutral-100">{student.name}</strong>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#8C887E] dark:text-neutral-400">EMAIL:</span>
              <span className="text-[#524F47] dark:text-neutral-300">{student.email}</span>
            </div>
            <div className="flex justify-between text-[11px] items-center">
              <span className="text-[#8C887E] dark:text-neutral-400">CURRENT ACCESS:</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                  {currentMembership?.label || 'Standard Free'}
                  {currentMembership?.formattedExpiry ? ` (Expires: ${currentMembership.formattedExpiry})` : ''}
                </span>
                {currentMembership?.plan && currentMembership.plan !== 'free' && (
                  <button
                    type="button"
                    onClick={() => setShowRevokeConfirm(true)}
                    disabled={revoking}
                    className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xs text-[10px] font-bold cursor-pointer transition disabled:opacity-50"
                  >
                    {revoking ? 'Revoking...' : '✕ Revoke Access'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {step === 'edit' ? (
            <form onSubmit={handleProceedToReview} className="space-y-4">
              
              {/* Plan Selection */}
              <div>
                <label className="block font-bold text-[#1C1B18] mb-1.5 uppercase text-[11px]">
                  Benefit Plan Tier
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPlanCode('premium_6m')}
                    className={`p-3 border rounded-sm text-left transition cursor-pointer ${
                      planCode === 'premium_6m'
                        ? 'border-[#1C1B18] bg-white ring-1 ring-[#1C1B18]'
                        : 'border-[#D5D1C7] bg-[#FAF9F5] text-[#737067]'
                    }`}
                  >
                    <div className="font-bold text-[#1C1B18]">Premium Scholarly</div>
                    <div className="text-[10px] text-[#737067] mt-0.5">৳500 / 6 Calendar Months</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanCode('pro_max_12m')}
                    className={`p-3 border rounded-sm text-left transition cursor-pointer ${
                      planCode === 'pro_max_12m'
                        ? 'border-amber-700 bg-amber-50/40 ring-1 ring-amber-700'
                        : 'border-[#D5D1C7] bg-[#FAF9F5] text-[#737067]'
                    }`}
                  >
                    <div className="font-bold text-amber-900">Pro Max Annual</div>
                    <div className="text-[10px] text-amber-800 mt-0.5">৳850 / 12 Calendar Months</div>
                  </button>
                </div>
              </div>

              {/* Grant Nature */}
              <div>
                <label className="block font-bold text-[#1C1B18] mb-1.5 uppercase text-[11px]">
                  Grant Nature & Scholar Presentation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setGrantType('test'); applyPreset('1d'); }}
                    className={`p-2 border rounded-sm text-left transition cursor-pointer ${
                      grantType === 'test'
                        ? 'border-blue-700 bg-blue-50/50 text-blue-900 ring-1 ring-blue-700 font-bold'
                        : 'border-[#D5D1C7] bg-[#FAF9F5] text-[#737067]'
                    }`}
                  >
                    <div>🧪 Testing / Trial</div>
                    <div className="text-[9px] font-normal opacity-80 mt-0.5">Complimentary Test Access</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setGrantType('research_grant'); applyPreset('30d'); }}
                    className={`p-2 border rounded-sm text-left transition cursor-pointer ${
                      grantType === 'research_grant'
                        ? 'border-purple-700 bg-purple-50/50 text-purple-900 ring-1 ring-purple-700 font-bold'
                        : 'border-[#D5D1C7] bg-[#FAF9F5] text-[#737067]'
                    }`}
                  >
                    <div>🎓 Research Grant</div>
                    <div className="text-[9px] font-normal opacity-80 mt-0.5">Academic Research Grant</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGrantType('custom')}
                    className={`p-2 border rounded-sm text-left transition cursor-pointer ${
                      grantType === 'custom'
                        ? 'border-amber-700 bg-amber-50/50 text-amber-900 ring-1 ring-amber-700 font-bold'
                        : 'border-[#D5D1C7] bg-[#FAF9F5] text-[#737067]'
                    }`}
                  >
                    <div>✍ Custom Title</div>
                    <div className="text-[9px] font-normal opacity-80 mt-0.5">Enter bespoke plan label</div>
                  </button>
                </div>

                {grantType === 'custom' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={customLabelInput}
                      onChange={(e) => setCustomLabelInput(e.target.value)}
                      placeholder="e.g. Special Evaluation Grant, Fellowship Access..."
                      className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-2.5 py-1.5 rounded-sm focus:outline-none focus:border-[#1C1B18]"
                    />
                  </div>
                )}
              </div>

              {/* Overlap Mode */}
              <div>
                <label className="block font-bold text-[#1C1B18] mb-1.5 uppercase text-[11px]">
                  Overlap & Scheduling Strategy
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="overlapMode"
                      value="start_now"
                      checked={overlapMode === 'start_now'}
                      onChange={() => handleModeChange('start_now')}
                    />
                    <span>
                      <strong className="text-[#1C1B18]">Start Immediately</strong> — begins at current server time
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="overlapMode"
                      value="extend_from_current_expiry"
                      checked={overlapMode === 'extend_from_current_expiry'}
                      onChange={() => handleModeChange('extend_from_current_expiry')}
                    />
                    <span>
                      <strong className="text-[#1C1B18]">Extend from Expiry</strong> — appends to current active membership
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="overlapMode"
                      value="schedule"
                      checked={overlapMode === 'schedule'}
                      onChange={() => handleModeChange('schedule')}
                    />
                    <span>
                      <strong className="text-[#1C1B18]">Schedule for Future</strong> — begins at chosen future date
                    </span>
                  </label>
                </div>
              </div>

              {/* Duration Presets */}
              <div>
                <label className="block font-bold text-[#1C1B18] mb-1.5 uppercase text-[11px]">
                  Preset Durations
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: '1d', label: '24 Hours (Test)' },
                    { key: '7d', label: '7 Days' },
                    { key: '30d', label: '30 Days' },
                    { key: '6m', label: '6 Months' },
                    { key: '12m', label: '12 Months' },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p.key)}
                      className={`px-3 py-1 border rounded-sm transition cursor-pointer text-xs ${
                        durationPreset === p.key
                          ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                          : 'bg-[#FAF9F5] border-[#D5D1C7] text-[#524F47] hover:border-[#1C1B18]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview of Recipient Badge */}
              <div className="bg-[#FAF9F5] border border-blue-200 p-2.5 rounded-sm flex items-center justify-between text-[11px]">
                <span className="text-[#737067]">Scholar Presentation:</span>
                <span className="font-bold text-blue-900 bg-blue-50 border border-blue-300 px-2 py-0.5 rounded-xs">
                  {getComputedLabel()}
                </span>
              </div>

              {/* Custom Date Pickers (Asia/Dhaka) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-medium text-[#1C1B18] mb-1 text-[11px]">
                    Starts At (Asia/Dhaka) *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startsAtLocal}
                    onChange={(e) => {
                      setStartsAtLocal(e.target.value);
                      setDurationPreset('custom');
                    }}
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-2.5 py-1.5 rounded-sm focus:outline-none focus:border-[#1C1B18]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#1C1B18] mb-1 text-[11px]">
                    Expires At (Asia/Dhaka) *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={expiresAtLocal}
                    onChange={(e) => {
                      setExpiresAtLocal(e.target.value);
                      setDurationPreset('custom');
                    }}
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-2.5 py-1.5 rounded-sm focus:outline-none focus:border-[#1C1B18]"
                  />
                </div>
              </div>

              {/* Mandatory Reason */}
              <div>
                <label className="block font-bold text-[#1C1B18] mb-1 uppercase text-[11px]">
                  Reason / Administrative Note *
                </label>
                <textarea
                  rows="2"
                  required
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder="e.g. Granted for exceptional thesis research on NLP datasets..."
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 rounded-sm focus:outline-none focus:border-[#1C1B18]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#E2DFD8]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-[#D5D1C7] rounded-sm text-[#737067] hover:text-[#1C1B18] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1C1B18] hover:bg-[#2C2A24] text-white rounded-sm font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>Review Grant Parameters</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </form>
          ) : (
            /* Review Screen */
            <div className="space-y-4">
              <div className="bg-amber-50/50 border border-amber-300 p-4 rounded-sm space-y-2">
                <div className="font-bold text-amber-950 uppercase text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-700" />
                  Please Confirm Manual Grant Parameters
                </div>
                
                <div className="space-y-1.5 text-xs text-[#524F47]">
                  <div>
                    <span className="text-[#8C887E]">Selected Tier:</span>{' '}
                    <strong className="text-[#1C1B18]">{planCode === 'pro_max_12m' ? 'Pro Max Tier (Full Capabilities)' : 'Premium Tier (Full Capabilities)'}</strong>
                  </div>
                  <div className="bg-white p-2 rounded border border-[#E5E2DA]">
                    <span className="text-[#8C887E] block text-[10px] uppercase font-bold">Scholar Presentation:</span>
                    <strong className="text-blue-900 font-mono text-xs">{getComputedLabel()}</strong>
                    <div className="text-[10px] text-[#737067] mt-0.5">
                      No commercial pricing or misleading "6-Month" label will be presented.
                    </div>
                  </div>
                  <div>
                    <span className="text-[#8C887E]">Overlap Strategy:</span>{' '}
                    <code className="bg-white px-1 py-0.5 rounded border border-[#E5E2DA]">{overlapMode}</code>
                  </div>
                  <div>
                    <span className="text-[#8C887E]">Starts (Asia/Dhaka):</span>{' '}
                    <strong className="text-[#1C1B18]">{startsAtLocal} (+06:00)</strong>
                  </div>
                  <div>
                    <span className="text-[#8C887E]">Expires (Asia/Dhaka):</span>{' '}
                    <strong className="text-[#1C1B18]">{expiresAtLocal} (+06:00)</strong>
                  </div>
                  <div className="text-[10px] text-[#737067] pt-1 border-t border-amber-200">
                    UTC Start: {dhakaLocalToIso(startsAtLocal)}
                    <br />
                    UTC Expiry: {dhakaLocalToIso(expiresAtLocal)}
                  </div>
                  <div className="pt-1">
                    <span className="text-[#8C887E]">Audited Reason:</span>
                    <p className="italic text-[#1C1B18] bg-white p-2 border border-[#E5E2DA] rounded mt-0.5">
                      "{grantReason}"
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-between gap-2 border-t border-[#E2DFD8]">
                <button
                  type="button"
                  onClick={() => setStep('edit')}
                  disabled={loading}
                  className="px-4 py-2 border border-[#D5D1C7] rounded-sm text-[#737067] hover:text-[#1C1B18] cursor-pointer"
                >
                  ← Edit Parameters
                </button>
                <button
                  type="button"
                  onClick={handleConfirmGrant}
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-sm font-bold cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Activating Grant...' : 'Confirm & Activate Manual Grant'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* In-App Revoke Confirmation Modal */}
        {showRevokeConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs" onClick={() => setShowRevokeConfirm(false)} />
            <div className="relative bg-white dark:bg-neutral-900 border border-[#D5D1C7] dark:border-neutral-800 rounded-sm p-5 max-w-sm w-full shadow-2xl z-10 font-mono-meta text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-neutral-800 mb-3">
                <h3 className="font-bold text-rose-700 dark:text-rose-400">Revoke Access Grant</h3>
                <button onClick={() => setShowRevokeConfirm(false)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18] dark:hover:text-white">✕</button>
              </div>
              <p className="text-[#605D55] dark:text-neutral-400 mb-4">
                Revoke current active access for <strong className="text-[#1C1B18] dark:text-neutral-100">{student?.name}</strong>? Their account will return to Standard Free.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRevokeConfirm(false)}
                  className="px-3 py-1.5 border border-[#D5D1C7] dark:border-neutral-700 text-[#737067] dark:text-neutral-400 hover:bg-[#FAF9F5] dark:hover:bg-neutral-800 rounded-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRevoke}
                  disabled={revoking}
                  className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-sm cursor-pointer disabled:opacity-50"
                >
                  {revoking ? 'Revoking...' : 'Revoke Access'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
