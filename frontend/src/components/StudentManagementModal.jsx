import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Shield, Ban, CheckCircle, Search, ExternalLink, Trash2, X, AlertTriangle, Eye } from 'lucide-react';
import DocumentViewerModal from './DocumentViewerModal';
import { useSocket } from '../context/SocketContext';

export default function StudentManagementModal({ isOpen, onClose, onRefreshStats }) {
  const { showNotice } = useSocket();
  const [students, setStudents] = useState([]);
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'approved', 'pending', 'banned'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [inspectingStudent, setInspectingStudent] = useState(null);

  // In-app modals
  const [confirmModal, setConfirmModal] = useState(null);
  const [promptModal, setPromptModal] = useState(null);
  const [promptInput, setPromptInput] = useState('');

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/students');
      setStudents(res.data);
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
  }, [isOpen]);

  const handleVerify = async (id, decision) => {
    try {
      setActionLoading(id);
      await axios.post(`/api/admin/verify-student/${id}`, { decision });
      await fetchStudents();
      if (onRefreshStats) onRefreshStats();
      showNotice(decision === 'approve' ? 'Student verified and approved.' : 'Student rejected.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Error updating student verification.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBan = (id, studentName) => {
    setPromptInput('Violation of academic terms / suspicious activity');
    setPromptModal({
      title: 'Suspend Student Account',
      message: `Enter suspension reason for student ${studentName}:`,
      placeholder: 'Suspension reason...',
      confirmText: 'Suspend Account',
      danger: true,
      onConfirm: async (reason) => {
        try {
          setActionLoading(id);
          await axios.post(`/api/admin/student/${id}/ban`, { reason });
          await fetchStudents();
          if (onRefreshStats) onRefreshStats();
          showNotice(`Student ${studentName} was suspended.`, 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to ban student.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleUnban = async (id) => {
    try {
      setActionLoading(id);
      await axios.post(`/api/admin/student/${id}/unban`);
      await fetchStudents();
      if (onRefreshStats) onRefreshStats();
      showNotice('Student suspension lifted.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to unban student.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = (id, studentName) => {
    setConfirmModal({
      title: 'Delete Student Account',
      message: `Are you sure you want to permanently delete the account of ${studentName}? This cannot be undone.`,
      confirmText: 'Permanently Delete',
      danger: true,
      onConfirm: async () => {
        try {
          setActionLoading(id);
          await axios.delete(`/api/admin/student/${id}`);
          await fetchStudents();
          if (onRefreshStats) onRefreshStats();
          showNotice(`Student ${studentName} was permanently deleted.`, 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to delete student account.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  if (!isOpen) return null;

  // Filter students by tab and search
  const filteredStudents = students.filter((s) => {
    const matchesTab =
      filterTab === 'all' ||
      (filterTab === 'approved' && s.status === 'approved') ||
      (filterTab === 'pending' && s.status === 'pending') ||
      (filterTab === 'banned' && s.status === 'banned');

    const searchLower = search.toLowerCase();
    const matchesSearch =
      !search ||
      s.name?.toLowerCase().includes(searchLower) ||
      s.email?.toLowerCase().includes(searchLower) ||
      s.university?.toLowerCase().includes(searchLower) ||
      s.studentId?.toLowerCase().includes(searchLower) ||
      s.researchDomain?.toLowerCase().includes(searchLower);

    return matchesTab && matchesSearch;
  });

  const countApproved = students.filter((s) => s.status === 'approved').length;
  const countPending = students.filter((s) => s.status === 'pending').length;
  const countBanned = students.filter((s) => s.status === 'banned').length;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-neutral-900 border border-[#D5D1C7] dark:border-neutral-800 rounded-sm w-full max-w-4xl p-6 shadow-2xl relative max-h-[92vh] flex flex-col text-[#1C1B18] dark:text-neutral-100">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8] dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-amber-600 dark:bg-amber-500 text-white dark:text-neutral-950 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-serif-title text-[#1C1B18] dark:text-neutral-100">
                Student & Researcher Access Administration
              </h2>
              <p className="text-xs font-mono-meta text-[#737067] dark:text-neutral-400">
                Manage enrollments, grant unmetered access, or suspend student privileges
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white font-mono-meta text-xs cursor-pointer"
          >
            [✕ CLOSE]
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 my-4">
          
          {/* Tabs */}
          <div className="flex items-center gap-1 text-xs font-mono-meta bg-[#FAF9F5] dark:bg-neutral-800 p-1 border border-[#E2DFD8] dark:border-neutral-700 rounded-sm">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'all' ? 'bg-[#1C1B18] dark:bg-neutral-100 text-white dark:text-neutral-950 font-bold' : 'text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white'
              }`}
            >
              All ({students.length})
            </button>
            <button
              onClick={() => setFilterTab('approved')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'approved' ? 'bg-[#2C6B3F] text-white font-bold' : 'text-[#737067] dark:text-neutral-400 hover:text-[#2C6B3F] dark:hover:text-emerald-400'
              }`}
            >
              Active ({countApproved})
            </button>
            <button
              onClick={() => setFilterTab('pending')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'pending' ? 'bg-amber-600 text-white font-bold' : 'text-[#737067] dark:text-neutral-400 hover:text-amber-800 dark:hover:text-amber-400'
              }`}
            >
              Pending ({countPending})
            </button>
            <button
              onClick={() => setFilterTab('banned')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'banned' ? 'bg-red-700 text-white font-bold' : 'text-[#737067] dark:text-neutral-400 hover:text-red-700 dark:hover:text-red-400'
              }`}
            >
              Banned ({countBanned})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, university..."
              className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-1.5 pl-8 text-xs text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
            />
            <Search className="w-3.5 h-3.5 text-[#8C887E] dark:text-neutral-400 absolute left-2.5 top-2.5" />
          </div>

        </div>

        {/* Student Roster Table */}
        <div className="overflow-y-auto flex-1 border border-[#E2DFD8] dark:border-neutral-800 rounded-sm">
          {loading ? (
            <div className="py-16 text-center text-xs font-mono-meta text-[#737067] dark:text-neutral-400">
              Loading students registry...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-xs font-mono-meta text-[#737067] dark:text-neutral-400">
              No student records found.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#FAF9F5] dark:bg-neutral-800/90 border-b border-[#E2DFD8] dark:border-neutral-700 text-[11px] font-mono-meta text-[#605D55] dark:text-neutral-300 uppercase sticky top-0">
                <tr>
                  <th className="p-3">Student & Academic Identity</th>
                  <th className="p-3">University & Student ID</th>
                  <th className="p-3">Domain / Thesis Topic</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2DA] dark:divide-neutral-800 font-sans">
                {filteredStudents.map((s) => (
                  <tr key={s._id} className="hover:bg-[#FAF9F5]/70 dark:hover:bg-neutral-800/50 transition-colors">
                    
                    {/* Student Identity */}
                    <td className="p-3">
                      <div className="font-bold text-[#1C1B18] dark:text-neutral-100">{s.name}</div>
                      <div className="text-[11px] font-mono-meta text-[#737067] dark:text-neutral-400">{s.email}</div>
                      {(s.hasVerificationDocument || s.idCardProof) && (
                        <button
                          type="button"
                          onClick={() => setInspectingStudent(s)}
                          className="inline-flex items-center gap-1 text-[10px] text-blue-700 dark:text-blue-400 hover:underline font-mono-meta mt-1 cursor-pointer"
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>View ID Proof</span>
                        </button>
                      )}
                    </td>

                    {/* University & ID */}
                    <td className="p-3 text-[11px]">
                      <div className="font-medium text-[#1C1B18] dark:text-neutral-200">{s.university || 'Not Provided'}</div>
                      <div className="font-mono-meta text-[#737067] dark:text-neutral-400">ID: {s.studentId || 'N/A'}</div>
                      <div className="text-[10px] text-[#8C887E] dark:text-neutral-500">{s.degreeProgram}</div>
                    </td>

                    {/* Domain & Thesis Inquiry */}
                    <td className="p-3 text-[11px] max-w-[200px]">
                      <div className="font-medium text-[#2C6B3F]">{s.researchDomain}</div>
                      <div className="text-[#605D55] truncate" title={s.thesisGoal}>
                        {s.thesisGoal || 'No topic registered'}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="p-3">
                      {s.status === 'approved' && (
                        <span className="px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono-meta text-[10px] font-bold">
                          ✓ ACTIVE
                        </span>
                      )}
                      {s.status === 'pending' && (
                        <span className="px-2 py-0.5 rounded-sm bg-amber-50 text-amber-800 border border-amber-300 font-mono-meta text-[10px] font-bold">
                          ⏳ PENDING
                        </span>
                      )}
                      {s.status === 'banned' && (
                        <div className="space-y-0.5">
                          <span className="px-2 py-0.5 rounded-sm bg-red-100 text-red-800 border border-red-300 font-mono-meta text-[10px] font-bold">
                            ⛔ BANNED
                          </span>
                          {s.banReason && (
                            <div className="text-[10px] text-red-600 truncate max-w-[120px]" title={s.banReason}>
                              {s.banReason}
                            </div>
                          )}
                        </div>
                      )}
                      {s.status === 'rejected' && (
                        <span className="px-2 py-0.5 rounded-sm bg-neutral-200 text-neutral-800 font-mono-meta text-[10px]">
                          ✕ DECLINED
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 font-mono-meta text-[11px]">
                        
                        {/* If Pending: Approve / Decline */}
                        {s.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleVerify(s._id, 'approve')}
                              disabled={actionLoading === s._id}
                              className="px-2 py-1 bg-[#2C6B3F] hover:bg-emerald-800 text-white rounded-sm font-bold transition cursor-pointer disabled:opacity-50"
                              title="Verify student and grant unmetered access"
                            >
                              ✓ Verify
                            </button>
                            <button
                              onClick={() => handleVerify(s._id, 'reject')}
                              disabled={actionLoading === s._id}
                              className="px-2 py-1 bg-white border border-[#D5D1C7] hover:bg-neutral-100 text-[#737067] rounded-sm transition cursor-pointer disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {/* If Approved: Ban Option */}
                        {s.status === 'approved' && (
                          <button
                            onClick={() => handleBan(s._id, s.name)}
                            disabled={actionLoading === s._id}
                            className="px-2 py-1 bg-red-50 border border-red-300 hover:bg-red-100 text-red-700 rounded-sm font-bold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            title="Ban student and revoke access to services"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Ban</span>
                          </button>
                        )}

                        {/* If Banned: Unban Option */}
                        {s.status === 'banned' && (
                          <button
                            onClick={() => handleUnban(s._id)}
                            disabled={actionLoading === s._id}
                            className="px-2 py-1 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-sm font-bold transition cursor-pointer disabled:opacity-50"
                            title="Restore student access"
                          >
                            ✓ Unban
                          </button>
                        )}

                        {/* Purge / Delete Account */}
                        <button
                          onClick={() => handleDelete(s._id, s.name)}
                          disabled={actionLoading === s._id}
                          className="p-1 text-[#737067] hover:text-red-700 transition cursor-pointer"
                          title="Purge student profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#E2DFD8] flex items-center justify-between text-xs font-mono-meta text-[#737067] mt-3">
          <span>* Banning a student immediately suspends their access to thesis papers and raw datasets.</span>
          <button
            onClick={onClose}
            className="bg-[#1C1B18] text-white px-4 py-1.5 rounded-sm hover:bg-[#2E2C28] cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>

      {inspectingStudent && (
        <DocumentViewerModal
          isOpen={!!inspectingStudent}
          onClose={() => setInspectingStudent(null)}
          studentId={inspectingStudent._id || inspectingStudent.id}
          studentName={inspectingStudent.name}
        />
      )}

      {/* In-App Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-60 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-white border border-[#D5D1C7] rounded-sm shadow-2xl max-w-md w-full p-6 z-10 font-mono-meta text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8]">
              <h3 className={`text-sm font-bold ${confirmModal.danger ? 'text-red-700' : 'text-[#1C1B18]'}`}>
                {confirmModal.title}
              </h3>
              <button onClick={() => setConfirmModal(null)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#524F47] text-xs leading-relaxed font-sans">
              {confirmModal.message}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2DFD8]">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 border border-[#D5D1C7] rounded-xs cursor-pointer text-[#737067] hover:bg-[#F2EFE8]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  if (fn) await fn();
                }}
                className={`px-4 py-1.5 rounded-xs font-bold cursor-pointer text-white ${
                  confirmModal.danger ? 'bg-red-700 hover:bg-red-800' : 'bg-[#1C1B18] hover:bg-black'
                }`}
              >
                {confirmModal.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Prompt Modal */}
      {promptModal && (
        <div className="fixed inset-0 z-60 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs" onClick={() => setPromptModal(null)} />
          <div className="relative bg-white border border-[#D5D1C7] rounded-sm shadow-2xl max-w-md w-full p-6 z-10 font-mono-meta text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8]">
              <h3 className={`text-sm font-bold ${promptModal.danger ? 'text-red-700' : 'text-[#1C1B18]'}`}>
                {promptModal.title}
              </h3>
              <button onClick={() => setPromptModal(null)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#524F47] text-xs leading-relaxed font-sans">
              {promptModal.message}
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fn = promptModal.onConfirm;
                const val = promptInput;
                setPromptModal(null);
                if (fn) await fn(val);
              }}
              className="space-y-3"
            >
              <textarea
                required
                rows="3"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder={promptModal.placeholder || 'Enter details...'}
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] p-2 text-xs font-mono-meta rounded-xs text-[#1C1B18] focus:outline-none focus:border-[#1C1B18]"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2DFD8]">
                <button
                  type="button"
                  onClick={() => setPromptModal(null)}
                  className="px-3 py-1.5 border border-[#D5D1C7] rounded-xs cursor-pointer text-[#737067] hover:bg-[#F2EFE8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 rounded-xs font-bold cursor-pointer text-white ${
                    promptModal.danger ? 'bg-red-700 hover:bg-red-800' : 'bg-[#1C1B18] hover:bg-black'
                  }`}
                >
                  {promptModal.confirmText || 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
