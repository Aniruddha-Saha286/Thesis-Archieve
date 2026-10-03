import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Shield, CheckSquare, Square, AlertCircle, Trash2, CheckCircle2 } from 'lucide-react';

const PERMISSION_DEFINITIONS = [
  { key: 'students.view', label: 'View Student Applications & Roster', desc: 'Allows reading the candidate list and student details.' },
  { key: 'students.verify', label: 'Approve / Reject Student Registrations', desc: 'Allows verifying or declining student access.' },
  { key: 'students.suspend', label: 'Ban / Reinstate Student Accounts', desc: 'Allows suspending or unbanning student accounts.' },
  { key: 'documents.view', label: 'Inspect Student Verification Documents', desc: 'Allows viewing protected student ID proofs.' },
  { key: 'payments.view', label: 'View bKash Payment Queue', desc: 'Allows reading submitted transaction claims.' },
  { key: 'payments.review', label: 'Approve / Reject bKash Payment Claims', desc: 'Allows reconciling payments against merchant statements.' },
  { key: 'publications.moderate', label: 'Moderate Submitted Publications', desc: 'Allows approving or rejecting student thesis submissions.' },
  { key: 'reports.moderate', label: 'Resolve Depository Issue Reports', desc: 'Allows managing metadata and dead-link reports.' },
];

const DEFAULT_BUNDLE = [
  'students.view',
  'students.verify',
  'students.suspend',
  'documents.view',
  'payments.view',
  'payments.review',
];

export default function EditorManagementModal({ isOpen, onClose, editor, onSuccess }) {
  const [email, setEmail] = useState('');
  const [selectedPerms, setSelectedPerms] = useState(DEFAULT_BUNDLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  const isEditing = Boolean(editor && editor.role === 'editor');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setShowRevokeConfirm(false);
      if (editor) {
        setEmail(editor.email || '');
        setSelectedPerms(Array.isArray(editor.permissions) && editor.permissions.length > 0 ? editor.permissions : DEFAULT_BUNDLE);
      } else {
        setEmail('');
        setSelectedPerms(DEFAULT_BUNDLE);
      }
    }
  }, [isOpen, editor]);

  if (!isOpen) return null;

  const togglePermission = (permKey) => {
    setSelectedPerms((prev) =>
      prev.includes(permKey) ? prev.filter((p) => p !== permKey) : [...prev, permKey]
    );
  };

  const handleSelectAll = () => {
    setSelectedPerms(PERMISSION_DEFINITIONS.map((p) => p.key));
  };

  const handleSelectDefault = () => {
    setSelectedPerms(DEFAULT_BUNDLE);
  };

  const handleClearAll = () => {
    setSelectedPerms([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setLoading(true);
      if (isEditing) {
        await axios.patch(`/api/admin/editors/${editor._id || editor.id}`, {
          permissions: selectedPerms,
        });
      } else {
        if (!email || !email.trim()) {
          setError('Email is required.');
          return;
        }
        await axios.post('/api/admin/editors', {
          email: email.trim().toLowerCase(),
          permissions: selectedPerms,
        });
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Editor action failed:', err);
      setError(
        err.response?.data?.message ||
        'Failed to save editor. Ensure the email belongs to a registered Google user.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!editor) return;
    setShowRevokeConfirm(false);

    try {
      setLoading(true);
      await axios.delete(`/api/admin/editors/${editor._id || editor.id}`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to revoke editor privileges.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs" onClick={onClose} />

      <div className="relative bg-white dark:bg-neutral-900 border border-[#D5D1C7] dark:border-neutral-800 rounded-sm shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden z-10 font-mono-meta text-xs text-[#1C1B18] dark:text-neutral-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E2DFD8] dark:border-neutral-800 bg-[#FAF9F5] dark:bg-neutral-950">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-[#1C1B18] dark:text-neutral-100">
                {isEditing ? `Edit Permissions: ${editor.name}` : (editor?.name ? `Appoint Editor: ${editor.name}` : 'Appoint New Editor')}
              </h3>
              <p className="text-[10px] text-[#737067] dark:text-neutral-400">
                Granular Capability Delegation • Team & Access Management
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Email field */}
          <div>
            <label className="block font-bold text-[#1C1B18] dark:text-neutral-200 mb-1 uppercase text-[11px]">
              Editor Google Email *
            </label>
            {isEditing ? (
              <div className="bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm">
                <strong>{editor.email}</strong> ({editor.name})
              </div>
            ) : (
              <div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. colleague@institution.edu"
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                />
                <p className="text-[10px] text-[#737067] dark:text-neutral-400 mt-1">
                  Note: Pre-provisioning supported. If this user hasn&apos;t signed in with Google yet, their editor account will activate automatically on first login.
                </p>
              </div>
            )}
          </div>

          {/* Permissions selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-bold text-[#1C1B18] dark:text-neutral-200 uppercase text-[11px]">
                Assigned Moderation Capabilities ({selectedPerms.length})
              </label>
              <div className="flex gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={handleSelectDefault}
                  className="text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Default Bundle
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white cursor-pointer"
                >
                  All
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-red-700 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border border-[#E2DFD8] dark:border-neutral-800 rounded-sm divide-y divide-[#E5E2DA] dark:divide-neutral-800 max-h-[300px] overflow-y-auto bg-white dark:bg-neutral-900">
              {PERMISSION_DEFINITIONS.map((perm) => {
                const isChecked = selectedPerms.includes(perm.key);
                return (
                  <div
                    key={perm.key}
                    onClick={() => togglePermission(perm.key)}
                    className="p-2.5 flex items-start gap-2.5 hover:bg-[#FAF9F5] dark:hover:bg-neutral-800/60 cursor-pointer transition select-none"
                  >
                    <div className="mt-0.5 text-amber-700 dark:text-amber-400">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-800 dark:text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-[#8C887E] dark:text-neutral-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-[#1C1B18] dark:text-neutral-100 text-xs">{perm.label}</div>
                      <div className="text-[10px] text-[#737067] dark:text-neutral-400 leading-relaxed">{perm.desc}</div>
                      <code className="text-[9px] text-[#8C887E] dark:text-neutral-500">{perm.key}</code>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 border-t border-[#E2DFD8] flex items-center justify-between">
            {isEditing ? (
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(true)}
                disabled={loading}
                className="px-3 py-2 text-red-700 border border-red-200 hover:bg-red-50 rounded-sm cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke Access</span>
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#D5D1C7] rounded-sm text-[#737067] hover:text-[#1C1B18] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-[#1C1B18] hover:bg-[#2C2A24] text-white rounded-sm font-bold cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Saving...' : isEditing ? 'Update Permissions' : 'Appoint as Editor'}
              </button>
            </div>
          </div>

        </form>

        {/* In-App Revoke Confirmation Modal */}
        {showRevokeConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs" onClick={() => setShowRevokeConfirm(false)} />
            <div className="relative bg-white dark:bg-neutral-900 border border-[#D5D1C7] dark:border-neutral-800 rounded-sm p-5 max-w-sm w-full shadow-2xl z-10 font-mono-meta text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-neutral-800 mb-3">
                <h3 className="font-bold text-red-700 dark:text-red-400">Revoke Editor Privileges</h3>
                <button onClick={() => setShowRevokeConfirm(false)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18] dark:hover:text-white">✕</button>
              </div>
              <p className="text-[#605D55] dark:text-neutral-400 mb-4">
                Are you sure you want to revoke editor privileges for <strong className="text-[#1C1B18] dark:text-neutral-100">{editor?.name}</strong>? Their account will return to an approved student role.
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
                  disabled={loading}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded-sm cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Revoking...' : 'Revoke Privileges'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
