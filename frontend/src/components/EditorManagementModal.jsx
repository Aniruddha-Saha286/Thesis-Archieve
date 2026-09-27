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

  const isEditing = Boolean(editor && editor.role === 'editor');

  useEffect(() => {
    if (isOpen) {
      setError('');
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

  const handleRevoke = async () => {
    if (!editor) return;
    if (!window.confirm(`Are you sure you want to revoke editor privileges for ${editor.name}? Their account will return to an approved student role.`)) {
      return;
    }

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

      <div className="relative bg-white border border-[#D5D1C7] rounded-sm shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden z-10 font-mono-meta text-xs">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E2DFD8] bg-[#FAF9F5]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-700" />
            <div>
              <h3 className="text-sm font-bold text-[#1C1B18]">
                {isEditing ? `Edit Permissions: ${editor.name}` : (editor?.name ? `Appoint Editor: ${editor.name}` : 'Appoint New Editor')}
              </h3>
              <p className="text-[10px] text-[#737067]">
                Granular Capability Delegation • Team & Access Management
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#737067] hover:text-[#1C1B18] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Email field */}
          <div>
            <label className="block font-bold text-[#1C1B18] mb-1 uppercase text-[11px]">
              Editor Google Email *
            </label>
            {isEditing ? (
              <div className="bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm">
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
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                />
                <p className="text-[10px] text-[#737067] mt-1">
                  Note: Pre-provisioning supported. If this user hasn&apos;t signed in with Google yet, their editor account will activate automatically on first login.
                </p>
              </div>
            )}
          </div>

          {/* Permissions selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-bold text-[#1C1B18] uppercase text-[11px]">
                Assigned Moderation Capabilities ({selectedPerms.length})
              </label>
              <div className="flex gap-2 text-[10px]">
                <button
                  type="button"
                  onClick={handleSelectDefault}
                  className="text-blue-700 hover:underline cursor-pointer"
                >
                  Default Bundle
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[#737067] hover:text-[#1C1B18] cursor-pointer"
                >
                  All
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-red-700 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border border-[#E2DFD8] rounded-sm divide-y divide-[#E5E2DA] max-h-[300px] overflow-y-auto bg-white">
              {PERMISSION_DEFINITIONS.map((perm) => {
                const isChecked = selectedPerms.includes(perm.key);
                return (
                  <div
                    key={perm.key}
                    onClick={() => togglePermission(perm.key)}
                    className="p-2.5 flex items-start gap-2.5 hover:bg-[#FAF9F5] cursor-pointer transition select-none"
                  >
                    <div className="mt-0.5 text-amber-700">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-800" />
                      ) : (
                        <Square className="w-4 h-4 text-[#8C887E]" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-[#1C1B18] text-xs">{perm.label}</div>
                      <div className="text-[10px] text-[#737067] leading-relaxed">{perm.desc}</div>
                      <code className="text-[9px] text-[#8C887E]">{perm.key}</code>
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
                onClick={handleRevoke}
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

      </div>
    </div>
  );
}
