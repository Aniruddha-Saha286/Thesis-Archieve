import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Shield, Ban, CheckCircle, Search, ExternalLink, Trash2, X, AlertTriangle, Eye } from 'lucide-react';
import DocumentViewerModal from './DocumentViewerModal';

export default function StudentManagementModal({ isOpen, onClose, onRefreshStats }) {
  const [students, setStudents] = useState([]);
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'approved', 'pending', 'banned'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [inspectingStudent, setInspectingStudent] = useState(null);

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
    } catch (err) {
      alert('Error updating student verification.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBan = async (id, studentName) => {
    const reason = window.prompt(`Enter suspension reason for student ${studentName}:`, 'Violation of academic terms / suspicious activity');
    if (reason === null) return; // cancelled

    try {
      setActionLoading(id);
      await axios.post(`/api/admin/student/${id}/ban`, { reason });
      await fetchStudents();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      alert('Failed to ban student.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async (id) => {
    try {
      setActionLoading(id);
      await axios.post(`/api/admin/student/${id}/unban`);
      await fetchStudents();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      alert('Failed to unban student.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id, studentName) => {
    if (!window.confirm(`Are you sure you want to permanently delete the account of ${studentName}? This cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(id);
      await axios.delete(`/api/admin/student/${id}`);
      await fetchStudents();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      alert('Failed to delete student account.');
    } finally {
      setActionLoading(null);
    }
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
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-4xl p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-amber-600 text-white flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-serif-title text-[#1C1B18]">
                Student & Researcher Access Administration
              </h2>
              <p className="text-xs font-mono-meta text-[#737067]">
                Manage enrollments, grant unmetered access, or suspend student privileges
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer"
          >
            [✕ CLOSE]
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 my-4">
          
          {/* Tabs */}
          <div className="flex items-center gap-1 text-xs font-mono-meta bg-[#FAF9F5] p-1 border border-[#E2DFD8] rounded-sm">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'all' ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#737067] hover:text-[#1C1B18]'
              }`}
            >
              All ({students.length})
            </button>
            <button
              onClick={() => setFilterTab('approved')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'approved' ? 'bg-[#2C6B3F] text-white font-bold' : 'text-[#737067] hover:text-[#2C6B3F]'
              }`}
            >
              Active ({countApproved})
            </button>
            <button
              onClick={() => setFilterTab('pending')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'pending' ? 'bg-amber-600 text-white font-bold' : 'text-[#737067] hover:text-amber-800'
              }`}
            >
              Pending ({countPending})
            </button>
            <button
              onClick={() => setFilterTab('banned')}
              className={`px-3 py-1 rounded-sm transition cursor-pointer ${
                filterTab === 'banned' ? 'bg-red-700 text-white font-bold' : 'text-[#737067] hover:text-red-700'
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
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
            />
            <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
          </div>

        </div>

        {/* Student Roster Table */}
        <div className="overflow-y-auto flex-1 border border-[#E2DFD8] rounded-sm">
          {loading ? (
            <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
              Loading students registry...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
              No student records found.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#FAF9F5] border-b border-[#E2DFD8] text-[11px] font-mono-meta text-[#605D55] uppercase sticky top-0">
                <tr>
                  <th className="p-3">Student & Academic Identity</th>
                  <th className="p-3">University & Student ID</th>
                  <th className="p-3">Domain / Thesis Topic</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2DA] font-sans">
                {filteredStudents.map((s) => (
                  <tr key={s._id} className="hover:bg-[#FAF9F5]/70 transition-colors">
                    
                    {/* Student Identity */}
                    <td className="p-3">
                      <div className="font-bold text-[#1C1B18]">{s.name}</div>
                      <div className="text-[11px] font-mono-meta text-[#737067]">{s.email}</div>
                      {(s.hasVerificationDocument || s.idCardProof) && (
                        <button
                          type="button"
                          onClick={() => setInspectingStudent(s)}
                          className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:text-blue-900 hover:underline font-mono-meta mt-1 cursor-pointer"
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>View ID Proof</span>
                        </button>
                      )}
                    </td>

                    {/* University & ID */}
                    <td className="p-3 text-[11px]">
                      <div className="font-medium text-[#1C1B18]">{s.university || 'Not Provided'}</div>
                      <div className="font-mono-meta text-[#737067]">ID: {s.studentId || 'N/A'}</div>
                      <div className="text-[10px] text-[#8C887E]">{s.degreeProgram}</div>
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
    </div>
  );
}
