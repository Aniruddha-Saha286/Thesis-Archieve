import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import {
  Shield,
  Users,
  CheckCircle,
  Ban,
  Trash2,
  Search,
  ExternalLink,
  Plus,
  BookOpen,
  AlertOctagon,
  Eye,
  RefreshCw,
  FileText,
  Check,
  X,
  GraduationCap,
  Building2,
  Clock,
  Layers,
  ArrowRight,
  LogOut,
  CreditCard,
  FileWarning,
  AlertTriangle,
  ShieldCheck,
  CheckSquare,
  Square,
} from 'lucide-react';
import ProposeThesisModal from './ProposeThesisModal';
import PublicationDetailModal from './PublicationDetailModal';
import ThesisCard from './ThesisCard';

export default function AdminPortalView({ onSwitchToStudentPreview }) {
  const { user, logout } = useAuth();

  // Active admin tab: 'pending' | 'roster' | 'publications'
  const [activeTab, setActiveTab] = useState('pending');

  // Student management state
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all'); // 'all', 'approved', 'pending', 'banned'
  const [actionLoading, setActionLoading] = useState(null);

  // Publications state
  const [theses, setTheses] = useState([]);
  const [loadingTheses, setLoadingTheses] = useState(false);
  const [searchTheses, setSearchTheses] = useState('');
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [selectedThesisDetail, setSelectedThesisDetail] = useState(null);

  // ID Card Image Zoom Modal
  const [zoomedIdCard, setZoomedIdCard] = useState(null);

  // bKash Payments State
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [searchPayment, setSearchPayment] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [reviewingPayment, setReviewingPayment] = useState(null);
  const [statementVerified, setStatementVerified] = useState(false);
  const [adminReviewNotes, setAdminReviewNotes] = useState('');

  // Depository Reports State
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportFilter, setReportFilter] = useState('all'); // 'all', 'open', 'resolved', 'dismissed'

  // Real-time WebSocket connection
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    fetchStudents();
    fetchTheses();
    fetchPayments();
    fetchReports();
  }, []);

  // Real-time synchronization
  useEffect(() => {
    if (!socket) return;

    const handleStudentEvent = () => {
      fetchStudents();
    };

    const handlePaymentEvent = () => {
      fetchPayments();
    };

    const handleReportEvent = () => {
      fetchReports();
    };

    const handleThesisCreated = () => {
      fetchTheses();
    };

    const handleThesisUpdated = () => {
      fetchTheses();
    };

    const handleThesisPinned = ({ thesisId, isPinned }) => {
      setTheses((prev) =>
        prev.map((t) => ((t._id || t.id) === thesisId ? { ...t, isPinned } : t))
      );
    };

    const handleThesisDeleted = ({ thesisId }) => {
      setTheses((prev) => prev.filter((t) => (t._id || t.id) !== thesisId));
    };

    socket.on('admin:new_student_application', handleStudentEvent);
    socket.on('admin:student_profile_updated', handleStudentEvent);
    socket.on('admin:student_updated', handleStudentEvent);
    socket.on('admin:payment_submitted', handlePaymentEvent);
    socket.on('admin:payment_updated', handlePaymentEvent);
    socket.on('admin:report_submitted', handleReportEvent);
    socket.on('thesis:created', handleThesisCreated);
    socket.on('thesis:updated', handleThesisUpdated);
    socket.on('thesis:pinned', handleThesisPinned);
    socket.on('thesis:deleted', handleThesisDeleted);

    return () => {
      socket.off('admin:new_student_application', handleStudentEvent);
      socket.off('admin:student_profile_updated', handleStudentEvent);
      socket.off('admin:student_updated', handleStudentEvent);
      socket.off('admin:payment_submitted', handlePaymentEvent);
      socket.off('admin:payment_updated', handlePaymentEvent);
      socket.off('admin:report_submitted', handleReportEvent);
      socket.off('thesis:created', handleThesisCreated);
      socket.off('thesis:updated', handleThesisUpdated);
      socket.off('thesis:pinned', handleThesisPinned);
      socket.off('thesis:deleted', handleThesisDeleted);
    };
  }, [socket]);

  const fetchStudents = async () => {
    try {
      setLoadingStudents(true);
      const res = await axios.get('/api/admin/students');
      setStudents(res.data);
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchTheses = async () => {
    try {
      setLoadingTheses(true);
      const res = await axios.get('/api/thesis');
      setTheses(Array.isArray(res.data) ? res.data : (res.data.records || []));
    } catch (err) {
      console.error('Failed to load theses:', err);
    } finally {
      setLoadingTheses(false);
    }
  };

  const fetchPayments = async () => {
    try {
      setLoadingPayments(true);
      const res = await axios.get('/api/admin/payments');
      setPayments(res.data || []);
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const res = await axios.get('/api/admin/reports');
      setReports(res.data || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  // Payment Verification Actions
  const handleApprovePayment = async (submissionId) => {
    if (!statementVerified) {
      alert('Verification requirement: You must confirm the transaction was reconciled against the official bKash merchant statement.');
      return;
    }

    try {
      setActionLoading(submissionId);
      const res = await axios.post(`/api/admin/payments/${submissionId}/approve`, {
        merchantStatementVerified: true,
        verifiedAgainstStatement: true,
        adminNotes: adminReviewNotes.trim(),
      });
      alert(res.data?.message || 'bKash payment successfully verified! Membership activated.');
      setReviewingPayment(null);
      setStatementVerified(false);
      setAdminReviewNotes('');
      await fetchPayments();
      await fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve payment.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayment = async (submissionId) => {
    const reason = window.prompt(
      'Enter mandatory rejection reason (this will be communicated to the student):',
      'Transaction ID not found on bKash merchant statement / amount mismatch.'
    );
    if (!reason || !reason.trim()) return;

    try {
      setActionLoading(submissionId);
      await axios.post(`/api/admin/payments/${submissionId}/reject`, {
        rejectionReason: reason.trim(),
      });
      alert('Payment submission rejected.');
      setReviewingPayment(null);
      await fetchPayments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject payment.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestCorrection = async (submissionId) => {
    const instructions = window.prompt(
      'Enter correction instructions for the student (e.g. clarify TrxID or sender number):',
      'TrxID could not be matched. Please double-check digits from your bKash SMS and re-submit.'
    );
    if (!instructions || !instructions.trim()) return;

    try {
      setActionLoading(submissionId);
      await axios.post(`/api/admin/payments/${submissionId}/request-correction`, {
        adminInstructions: instructions.trim(),
      });
      alert('Correction request dispatched to student.');
      setReviewingPayment(null);
      await fetchPayments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to request correction.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelMembership = async (studentId, studentName) => {
    const reason = window.prompt(
      `Enter mandatory cancellation reason for scholar "${studentName}":`,
      'Membership cancelled per administrative audit / student inquiry'
    );
    if (!reason || !reason.trim()) return;

    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/membership/${studentId}/cancel`, {
        cancellationReason: reason.trim(),
      });
      alert(`Membership for ${studentName} has been cancelled.`);
      await fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel membership.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateReport = async (reportId, status) => {
    const notes = window.prompt(
      `Enter resolution notes for report (${status}):`,
      status === 'resolved' ? 'Metadata corrected / source PDF link repaired' : 'Investigated and dismissed'
    );
    if (notes === null) return;

    try {
      setActionLoading(reportId);
      await axios.put(`/api/admin/reports/${reportId}`, {
        status,
        resolutionNotes: notes.trim(),
      });
      alert(`Report marked as ${status}.`);
      await fetchReports();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update report.');
    } finally {
      setActionLoading(null);
    }
  };

  // Student Verification Actions
  const handleVerifyStudent = async (studentId, decision) => {
    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/verify-student/${studentId}`, { decision });
      await fetchStudents();
    } catch (err) {
      alert('Error updating student verification.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBanStudent = async (studentId, studentName) => {
    const reason = window.prompt(
      `Enter reason for suspending student "${studentName}":`,
      'Violation of academic honor code / unverified student credentials'
    );
    if (reason === null) return;

    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/student/${studentId}/ban`, { reason });
      await fetchStudents();
    } catch (err) {
      alert('Failed to ban student.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnbanStudent = async (studentId) => {
    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/student/${studentId}/unban`);
      await fetchStudents();
    } catch (err) {
      alert('Failed to reinstate student.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete the account of ${studentName}? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setActionLoading(studentId);
      await axios.delete(`/api/admin/student/${studentId}`);
      await fetchStudents();
    } catch (err) {
      alert('Failed to delete student account.');
    } finally {
      setActionLoading(null);
    }
  };

  // Publications Actions
  const handlePinThesis = async (id, isPinned, thesisObj) => {
    const targetId = id;
    if (!targetId) return;
    try {
      const paperPayload = thesisObj || theses.find((t) => (t._id || t.id) === targetId);
      const res = await axios.put(`/api/thesis/${targetId}/pin`, {
        isPinned: !isPinned,
        paper: paperPayload,
      });
      const nextPinned = res.data?.isPinned ?? !isPinned;
      setTheses((prev) =>
        prev.map((t) => ((t._id || t.id) === targetId ? { ...t, isPinned: nextPinned } : t))
      );
    } catch (err) {
      console.error('Failed to update pin state:', err);
      alert('Failed to update pin state.');
    }
  };

  const handleDeleteThesis = async (id, title) => {
    const targetId = id;
    if (!targetId) return;
    if (!window.confirm(`Delete publication "${title}" from the depository?`)) return;
    try {
      await axios.delete(`/api/thesis/${targetId}`);
      setTheses((prev) => prev.filter((t) => (t._id || t.id) !== targetId));
    } catch (err) {
      console.error('Failed to delete thesis:', err);
      alert('Failed to delete thesis.');
    }
  };

  const handleThesisCreated = (newThesis) => {
    setTheses((prev) => [newThesis, ...prev]);
  };

  // Metrics
  const pendingStudents = students.filter((s) => s.status === 'pending');
  const approvedStudents = students.filter((s) => s.status === 'approved');
  const bannedStudents = students.filter((s) => s.status === 'banned');

  // Filtered Roster
  const filteredRoster = students.filter((s) => {
    const matchesTab =
      rosterFilter === 'all' ||
      (rosterFilter === 'approved' && s.status === 'approved') ||
      (rosterFilter === 'pending' && s.status === 'pending') ||
      (rosterFilter === 'banned' && s.status === 'banned');

    const searchLower = searchStudent.toLowerCase();
    const matchesSearch =
      !searchStudent ||
      s.name?.toLowerCase().includes(searchLower) ||
      s.email?.toLowerCase().includes(searchLower) ||
      s.university?.toLowerCase().includes(searchLower) ||
      s.studentId?.toLowerCase().includes(searchLower);

    return matchesTab && matchesSearch;
  });

  // Filtered Theses
  const filteredTheses = theses.filter((t) => {
    if (!searchTheses) return true;
    const q = searchTheses.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.author?.toLowerCase().includes(q) ||
      t.university?.toLowerCase().includes(q) ||
      t.institution?.toLowerCase().includes(q) ||
      t.publisher?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#F4F3EE] text-[#1C1B18] flex flex-col justify-between">
      
      {/* Top Dedicated Admin Header */}
      <header className="bg-[#1C1B18] text-[#FAF9F5] border-b border-neutral-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          
          {/* Brand & Portal Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-amber-500 text-neutral-950 flex items-center justify-center font-serif-title text-xl font-bold">
              §
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif-title text-xl tracking-tight text-[#FAF9F5] block leading-none">
                  The Thesis Archive
                </span>
                <span className="bg-amber-500 text-neutral-950 text-[10px] font-mono-meta font-extrabold px-1.5 py-0.5 rounded-xs tracking-wider uppercase">
                  Admin Console
                </span>
              </div>
              <span className="text-[10px] font-mono-meta text-neutral-400 uppercase tracking-wider block mt-0.5">
                Editorial Board & Academic Verification Desk
              </span>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-sm border border-neutral-800 text-xs font-mono-meta">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Reviews</span>
              {pendingStudents.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'pending' ? 'bg-neutral-950 text-amber-300' : 'bg-amber-600 text-neutral-950'
                }`}>
                  {pendingStudents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('roster')}
              className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'roster'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Student Roster</span>
              <span className="text-[10px] opacity-75 font-mono">({students.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('payments')}
              className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'payments'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>bKash Payments</span>
              {payments.filter((p) => ['submitted', 'under_review'].includes(p.status)).length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'payments' ? 'bg-neutral-950 text-amber-300' : 'bg-pink-600 text-white'
                }`}>
                  {payments.filter((p) => ['submitted', 'under_review'].includes(p.status)).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <FileWarning className="w-3.5 h-3.5" />
              <span>Issue Reports</span>
              {reports.filter((r) => r.status === 'open').length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'reports' ? 'bg-neutral-950 text-amber-300' : 'bg-red-600 text-white'
                }`}>
                  {reports.filter((r) => r.status === 'open').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('publications')}
              className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'publications'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Depository Papers</span>
              <span className="text-[10px] opacity-75 font-mono">({theses.length})</span>
            </button>
          </div>

          {/* Right: Switch to Student Preview & Sign Out */}
          <div className="flex items-center gap-3">
            {/* Realtime Status Indicator */}
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-xs text-[10px] font-mono-meta font-bold border transition ${
                isConnected
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 shadow-xs'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}
              title={isConnected ? 'Realtime WebSocket connection active' : 'Connecting to Realtime stream...'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`}></span>
              <span>{isConnected ? 'Realtime Synced' : 'Connecting...'}</span>
            </div>

            <button
              onClick={onSwitchToStudentPreview}
              className="bg-neutral-800 hover:bg-neutral-700 text-amber-300 hover:text-amber-200 border border-neutral-700 text-xs font-mono-meta px-3 py-1.5 rounded-sm transition flex items-center gap-1.5 cursor-pointer"
              title="Preview public repository as approved students see it"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Student View</span>
            </button>

            <div className="text-right text-xs hidden lg:block border-l border-neutral-800 pl-3">
              <div className="font-medium text-white text-[11px]">{user?.name || 'Administrator'}</div>
              <div className="text-[9px] font-mono-meta text-amber-400 font-semibold tracking-wider">
                EDITORIAL DESK
              </div>
            </div>

            <button
              onClick={logout}
              className="text-xs font-mono-meta text-neutral-400 hover:text-white flex items-center gap-1 transition cursor-pointer p-1.5"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Admin Console Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 w-full flex-1 space-y-6">
        
        {/* Editorial Telemetry Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2DFD8] p-4 rounded-sm shadow-2xs">
            <div className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider flex items-center justify-between">
              <span>Pending Reviews</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-2xl font-serif-title text-[#1C1B18] mt-1 font-bold flex items-center gap-2">
              <span>{pendingStudents.length}</span>
              {pendingStudents.length > 0 && (
                <span className="text-[10px] font-mono-meta font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-xs">
                  Action Needed
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#8C887E] mt-0.5">Awaiting ID card & university check</div>
          </div>

          <div className="bg-white border border-[#E2DFD8] p-4 rounded-sm shadow-2xs">
            <div className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider flex items-center justify-between">
              <span>Verified Students</span>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-serif-title text-[#1C1B18] mt-1 font-bold">
              {approvedStudents.length}
            </div>
            <div className="text-[11px] text-[#8C887E] mt-0.5">Active unmetered repository access</div>
          </div>

          <div className="bg-white border border-[#E2DFD8] p-4 rounded-sm shadow-2xs">
            <div className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider flex items-center justify-between">
              <span>Suspended / Banned</span>
              <Ban className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div className="text-2xl font-serif-title text-[#1C1B18] mt-1 font-bold">
              {bannedStudents.length}
            </div>
            <div className="text-[11px] text-[#8C887E] mt-0.5">Revoked due to honor code or terms</div>
          </div>

          <div className="bg-white border border-[#E2DFD8] p-4 rounded-sm shadow-2xs">
            <div className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider flex items-center justify-between">
              <span>Depository Publications</span>
              <Layers className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-2xl font-serif-title text-[#1C1B18] mt-1 font-bold">
              {theses.length}
            </div>
            <div className="text-[11px] text-[#8C887E] mt-0.5">Curated peer-reviewed thesis records</div>
          </div>
        </div>

        {/* TAB 1: PENDING VERIFICATION QUEUE */}
        {activeTab === 'pending' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">
                  Student Academic Credential Queue
                </h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Review student ID cards stored in Cloudinary and verify student enrollment before granting depository access.
                </p>
              </div>

              <button
                onClick={fetchStudents}
                disabled={loadingStudents}
                className="text-xs font-mono-meta text-[#5C5950] hover:text-[#1C1B18] flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStudents ? 'animate-spin' : ''}`} />
                <span>Refresh List</span>
              </button>
            </div>

            {pendingStudents.length === 0 ? (
              <div className="bg-white border border-[#E2DFD8] p-12 text-center rounded-sm space-y-2">
                <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
                <div className="text-base font-semibold text-[#1C1B18]">Verification Queue Clear</div>
                <p className="text-xs text-[#737067] max-w-md mx-auto">
                  All student registrations have been reviewed. When new students sign in via Google or student credentials, their ID cards will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {pendingStudents.map((student) => (
                  <div
                    key={student._id}
                    className="bg-white border border-[#D5D1C7] rounded-sm p-5 shadow-xs space-y-4 hover:border-amber-400 transition"
                  >
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-base text-[#1C1B18]">{student.name}</span>
                          <span className="text-[10px] font-mono-meta bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded-xs font-bold uppercase">
                            Pending Review
                          </span>
                        </div>
                        <div className="text-xs font-mono-meta text-[#5C5950] mt-0.5">
                          {student.email}
                        </div>
                      </div>

                      <div className="w-9 h-9 rounded-sm bg-[#FAF9F5] border border-[#E2DFD8] flex items-center justify-center text-xs font-mono-meta font-bold text-[#1C1B18]">
                        {student.name ? student.name.slice(0, 2).toUpperCase() : 'ST'}
                      </div>
                    </div>

                    {/* Academic Details Grid */}
                    <div className="bg-[#FAF9F5] border border-[#E5E2DA] p-3 text-xs font-mono-meta space-y-1.5 rounded-xs text-[#4A4740]">
                      <div className="flex justify-between items-center">
                        <span className="text-[#737067]">UNIVERSITY:</span>
                        <span className="font-bold text-[#1C1B18] text-right truncate max-w-[200px]">
                          {student.university || 'Not Provided'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#737067]">STUDENT ID:</span>
                        <span className="font-bold text-[#1C1B18]">{student.studentId || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#737067]">DEGREE:</span>
                        <span className="text-[#1C1B18]">{student.degreeProgram || 'B.Sc. Thesis'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#737067]">DOMAIN:</span>
                        <span className="text-[#1C1B18]">{student.researchDomain || 'Computer Science'}</span>
                      </div>
                      {student.thesisGoal && (
                        <div className="pt-1.5 border-t border-[#E5E2DA] text-[11px]">
                          <span className="text-[#737067] block">RESEARCH INQUIRY / THESIS TOPIC:</span>
                          <span className="text-[#1C1B18] italic block mt-0.5 line-clamp-2">
                            "{student.thesisGoal}"
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ID Card Proof Section */}
                    <div>
                      <div className="text-[11px] font-mono-meta font-bold text-[#605D55] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>Student ID Card Proof</span>
                        {student.idCardProof && student.idCardProof.includes('cloudinary') && (
                          <span className="text-[9px] bg-blue-50 text-blue-800 border border-blue-200 px-1 py-0.2 rounded-xs">
                            Cloudinary CDN Verified
                          </span>
                        )}
                      </div>

                      {student.idCardProof ? (
                        <div className="relative group border border-[#D5D1C7] rounded-sm overflow-hidden bg-neutral-950 h-36 flex items-center justify-center">
                          <img
                            src={student.idCardProof}
                            alt={`ID Card of ${student.name}`}
                            className="w-full h-full object-contain cursor-pointer transition group-hover:scale-105"
                            onClick={() => setZoomedIdCard(student.idCardProof)}
                          />
                          <div
                            onClick={() => setZoomedIdCard(student.idCardProof)}
                            className="absolute inset-0 bg-neutral-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer text-white text-xs font-mono-meta gap-1.5"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Click to Zoom Proof</span>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-[#D5D1C7] rounded-sm p-4 text-center text-xs font-mono-meta text-[#8C887E] bg-[#FAF9F5]">
                          No image proof uploaded yet
                        </div>
                      )}
                    </div>

                    {/* Evaluation Buttons */}
                    <div className="pt-2 border-t border-[#E2DFD8] flex items-center gap-2">
                      <button
                        onClick={() => handleVerifyStudent(student._id, 'approve')}
                        disabled={actionLoading === student._id}
                        className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-mono-meta font-bold text-xs py-2 px-3 rounded-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{actionLoading === student._id ? 'Processing...' : 'Approve Student'}</span>
                      </button>

                      <button
                        onClick={() => handleVerifyStudent(student._id, 'reject')}
                        disabled={actionLoading === student._id}
                        className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 font-mono-meta text-xs py-2 px-3 rounded-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5 text-neutral-600" />
                        <span>Decline</span>
                      </button>

                      <button
                        onClick={() => handleBanStudent(student._id, student.name)}
                        disabled={actionLoading === student._id}
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-mono-meta text-xs py-2 px-2.5 rounded-xs transition cursor-pointer"
                        title="Suspend / Ban student with reason"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STUDENT ROSTER & ACCESS MODERATION */}
        {activeTab === 'roster' && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-5">
            
            {/* Header & Search */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">
                  Student Roster & Directory
                </h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Filter by status, inspect university enrollments, or revoke service access.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={searchStudent}
                  onChange={(e) => setSearchStudent(e.target.value)}
                  placeholder="Search student, email, ID..."
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs rounded-xs focus:outline-none focus:border-[#1C1B18] transition font-mono-meta"
                />
                <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 text-xs font-mono-meta bg-[#FAF9F5] p-1 border border-[#E2DFD8] rounded-xs w-fit">
              <button
                onClick={() => setRosterFilter('all')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  rosterFilter === 'all' ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#737067] hover:text-[#1C1B18]'
                }`}
              >
                All Students ({students.length})
              </button>
              <button
                onClick={() => setRosterFilter('approved')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  rosterFilter === 'approved' ? 'bg-emerald-700 text-white font-bold' : 'text-[#737067] hover:text-emerald-700'
                }`}
              >
                Approved Active ({approvedStudents.length})
              </button>
              <button
                onClick={() => setRosterFilter('pending')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  rosterFilter === 'pending' ? 'bg-amber-600 text-white font-bold' : 'text-[#737067] hover:text-amber-800'
                }`}
              >
                Pending Review ({pendingStudents.length})
              </button>
              <button
                onClick={() => setRosterFilter('banned')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  rosterFilter === 'banned' ? 'bg-red-700 text-white font-bold' : 'text-[#737067] hover:text-red-700'
                }`}
              >
                Suspended / Banned ({bannedStudents.length})
              </button>
            </div>

            {/* Table of Students */}
            <div className="overflow-x-auto border border-[#E2DFD8] rounded-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F5] border-b border-[#E2DFD8] font-mono-meta text-[11px] text-[#737067] uppercase">
                    <th className="py-2.5 px-4 font-semibold">Scholar / Student</th>
                    <th className="py-2.5 px-4 font-semibold">University & Student ID</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold">Membership</th>
                    <th className="py-2.5 px-4 font-semibold">ID Proof</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2DFD8]">
                  {filteredRoster.map((student) => {
                    const isStudentApproved = student.status === 'approved';
                    const isStudentPending = student.status === 'pending';
                    const isStudentBanned = student.status === 'banned';

                    return (
                      <tr key={student._id} className="hover:bg-[#FAF9F5]/70 transition">
                        
                        {/* Name & Email */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1C1B18]">{student.name}</div>
                          <div className="text-[11px] font-mono-meta text-[#737067]">{student.email}</div>
                          {student.role === 'admin' && (
                            <span className="inline-block mt-0.5 text-[9px] font-mono-meta bg-amber-100 text-amber-900 border border-amber-300 px-1 rounded-xs font-bold">
                              ADMIN
                            </span>
                          )}
                        </td>

                        {/* University & ID */}
                        <td className="py-3 px-4 font-mono-meta text-xs">
                          <div className="font-semibold text-[#1C1B18]">{student.university || 'N/A'}</div>
                          <div className="text-[11px] text-[#737067]">ID: {student.studentId || 'N/A'}</div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4">
                          {isStudentApproved && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono-meta text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-xs font-semibold">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Approved</span>
                            </span>
                          )}
                          {isStudentPending && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono-meta text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-xs font-semibold">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Pending</span>
                            </span>
                          )}
                          {isStudentBanned && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono-meta text-red-800 bg-red-50 border border-red-300 px-2 py-0.5 rounded-xs font-semibold" title={student.banReason}>
                              <AlertOctagon className="w-3 h-3 text-red-600" />
                              <span>Suspended</span>
                            </span>
                          )}
                        </td>

                        {/* Membership Tier Badge */}
                        <td className="py-3 px-4 font-mono-meta">
                          {student.membership?.plan === 'premium' ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[11px] text-purple-900 bg-purple-50 border border-purple-300 px-2 py-0.5 rounded-xs font-bold">
                                ★ Premium
                              </span>
                              {student.membership?.formattedExpiry && (
                                <div className="text-[10px] text-purple-700 mt-0.5 truncate max-w-[140px]" title={student.membership.formattedExpiry}>
                                  Thru {student.membership.formattedExpiry.split(',')[0]}
                                </div>
                              )}
                            </div>
                          ) : student.membership?.plan === 'trial' ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[11px] text-blue-900 bg-blue-50 border border-blue-300 px-2 py-0.5 rounded-xs font-bold">
                                7-Day Trial
                              </span>
                              {student.membership?.formattedExpiry && (
                                <div className="text-[10px] text-blue-700 mt-0.5 truncate max-w-[140px]" title={student.membership.formattedExpiry}>
                                  Thru {student.membership.formattedExpiry.split(',')[0]}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#737067] bg-[#FAF9F5] border border-[#D5D1C7] px-1.5 py-0.5 rounded-xs">
                              Standard Free
                            </span>
                          )}
                        </td>

                        {/* ID Card Proof */}
                        <td className="py-3 px-4">
                          {student.idCardProof ? (
                            <button
                              onClick={() => setZoomedIdCard(student.idCardProof)}
                              className="text-[11px] font-mono-meta text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View Proof</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono-meta text-[#8C887E]">None</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 font-mono-meta text-xs">
                            
                            {/* If pending: Approve / Reject */}
                            {isStudentPending && (
                              <button
                                onClick={() => handleVerifyStudent(student._id, 'approve')}
                                disabled={actionLoading === student._id}
                                className="bg-emerald-700 hover:bg-emerald-800 text-white px-2 py-1 rounded-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Approve
                              </button>
                            )}

                            {/* If approved: Ban */}
                            {isStudentApproved && student.role !== 'admin' && (
                              <button
                                onClick={() => handleBanStudent(student._id, student.name)}
                                disabled={actionLoading === student._id}
                                className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded-xs cursor-pointer disabled:opacity-50"
                                title="Suspend student access"
                              >
                                Suspend
                              </button>
                            )}

                            {/* If banned: Reinstate */}
                            {isStudentBanned && (
                              <button
                                onClick={() => handleUnbanStudent(student._id)}
                                disabled={actionLoading === student._id}
                                className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2 py-1 rounded-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Reinstate
                              </button>
                            )}

                            {/* Cancel Membership / Trial */}
                            {student.role !== 'admin' && student.membership?.plan && student.membership.plan !== 'free' && (
                              <button
                                onClick={() => handleCancelMembership(student._id, student.name)}
                                disabled={actionLoading === student._id}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2 py-1 rounded-xs cursor-pointer disabled:opacity-50 font-bold"
                                title="Cancel student membership / trial with mandatory reason"
                              >
                                Cancel Plan
                              </button>
                            )}

                            {/* Delete account */}
                            {student.role !== 'admin' && (
                              <button
                                onClick={() => handleDeleteStudent(student._id, student.name)}
                                disabled={actionLoading === student._id}
                                className="text-neutral-400 hover:text-red-700 p-1 transition cursor-pointer"
                                title="Permanently delete account"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* TAB 3: BKASH PAYMENT VERIFICATION QUEUE */}
        {activeTab === 'payments' && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-5">
            
            {/* Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18] flex items-center gap-2">
                  <span>bKash Payment Verification Desk</span>
                  <span className="text-[10px] font-mono-meta bg-pink-100 text-pink-900 border border-pink-300 px-2 py-0.5 rounded-xs font-bold uppercase tracking-wider">
                    Manual Reconciliation
                  </span>
                </h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Verify TrxIDs against official bKash merchant statement before approving 6-calendar-month Premium subscriptions.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchPayments}
                  className="bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-xs font-mono-meta px-3 py-1.5 rounded-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPayments ? 'animate-spin' : ''}`} />
                  <span>Refresh Queue</span>
                </button>

                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={searchPayment}
                    onChange={(e) => setSearchPayment(e.target.value)}
                    placeholder="Search TrxID, order, scholar..."
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs rounded-xs focus:outline-none focus:border-[#1C1B18] transition font-mono-meta"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 text-xs font-mono-meta bg-[#FAF9F5] p-1 border border-[#E2DFD8] rounded-xs w-fit">
              <button
                onClick={() => setPaymentFilter('all')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  paymentFilter === 'all' ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#737067] hover:text-[#1C1B18]'
                }`}
              >
                All Submissions ({payments.length})
              </button>
              <button
                onClick={() => setPaymentFilter('pending')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  paymentFilter === 'pending' ? 'bg-pink-700 text-white font-bold' : 'text-[#737067] hover:text-pink-800'
                }`}
              >
                Pending Verification ({payments.filter((p) => ['submitted', 'under_review'].includes(p.status)).length})
              </button>
              <button
                onClick={() => setPaymentFilter('approved')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  paymentFilter === 'approved' ? 'bg-emerald-700 text-white font-bold' : 'text-[#737067] hover:text-emerald-700'
                }`}
              >
                Approved ({payments.filter((p) => p.status === 'approved').length})
              </button>
              <button
                onClick={() => setPaymentFilter('rejected')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  paymentFilter === 'rejected' ? 'bg-red-700 text-white font-bold' : 'text-[#737067] hover:text-red-700'
                }`}
              >
                Rejected ({payments.filter((p) => p.status === 'rejected').length})
              </button>
            </div>

            {/* Payments Table */}
            <div className="overflow-x-auto border border-[#E2DFD8] rounded-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F5] border-b border-[#E2DFD8] font-mono-meta text-[11px] text-[#737067] uppercase">
                    <th className="py-2.5 px-4 font-semibold">Scholar / Student</th>
                    <th className="py-2.5 px-4 font-semibold">Order Ref & bKash TrxID</th>
                    <th className="py-2.5 px-4 font-semibold">Amount & Term</th>
                    <th className="py-2.5 px-4 font-semibold">Sender Details</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2DFD8]">
                  {payments
                    .filter((p) => {
                      const matchesFilter =
                        paymentFilter === 'all' ||
                        (paymentFilter === 'pending' && ['submitted', 'under_review'].includes(p.status)) ||
                        p.status === paymentFilter;
                      if (!matchesFilter) return false;
                      if (!searchPayment) return true;
                      const q = searchPayment.toLowerCase();
                      return (
                        p.trxId?.toLowerCase().includes(q) ||
                        p.order?.orderRef?.toLowerCase().includes(q) ||
                        p.user?.name?.toLowerCase().includes(q) ||
                        p.user?.email?.toLowerCase().includes(q) ||
                        p.senderNumber?.includes(q)
                      );
                    })
                    .map((sub) => {
                      const isPending = ['submitted', 'under_review'].includes(sub.status);
                      const isApproved = sub.status === 'approved';
                      const isRejected = sub.status === 'rejected';

                      return (
                        <tr key={sub._id} className="hover:bg-[#FAF9F5]/70 transition">
                          
                          {/* Student Info */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#1C1B18]">{sub.user?.name || 'Unknown Student'}</div>
                            <div className="text-[11px] font-mono-meta text-[#737067]">{sub.user?.email}</div>
                          </td>

                          {/* Order Ref & TrxID */}
                          <td className="py-3 px-4 font-mono-meta">
                            <div className="text-[11px] text-neutral-500">{sub.order?.orderRef || 'N/A'}</div>
                            <div className="font-bold text-sm text-[#1C1B18] bg-neutral-100 px-1.5 py-0.5 rounded-xs w-fit mt-0.5">
                              {sub.trxId}
                            </div>
                          </td>

                          {/* Amount */}
                          <td className="py-3 px-4">
                            <div className="font-serif-title font-bold text-sm text-purple-950">
                              ৳{sub.claimedAmountPaisa / 100} BDT
                            </div>
                            <div className="text-[10px] font-mono-meta text-neutral-500">6 Calendar Months</div>
                          </td>

                          {/* Sender Details */}
                          <td className="py-3 px-4 font-mono-meta text-xs">
                            <div className="text-[#1C1B18]">
                              Sender: <strong>{sub.senderNumber || 'Not specified'}</strong>
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              Claimed: {new Date(sub.paymentDateTime || sub.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-xs text-[10px] font-mono-meta font-bold uppercase tracking-wider ${
                                isApproved
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : isRejected
                                  ? 'bg-red-100 text-red-900 border border-red-300'
                                  : sub.status === 'under_review'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-pink-100 text-pink-900 border border-pink-300'
                              }`}
                            >
                              {sub.status === 'under_review' ? 'Needs Correction' : sub.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            {isPending ? (
                              <button
                                onClick={() => {
                                  setReviewingPayment(sub);
                                  setStatementVerified(false);
                                  setAdminReviewNotes('');
                                }}
                                className="bg-pink-700 hover:bg-pink-800 text-white font-mono-meta text-xs font-bold px-3 py-1.5 rounded-xs transition cursor-pointer shadow-2xs"
                              >
                                Verify Claim
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setReviewingPayment(sub);
                                  setStatementVerified(false);
                                  setAdminReviewNotes('');
                                }}
                                className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 font-mono-meta text-xs px-2.5 py-1 rounded-xs cursor-pointer"
                              >
                                View Log
                              </button>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* TAB 4: DEPOSITORY ISSUE & RETRACTION REPORTS */}
        {activeTab === 'reports' && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-5">
            
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18] flex items-center gap-2">
                  <span>Scholarly Issue & Retraction Reports</span>
                </h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Review student reports regarding broken links, publisher retractions, or metadata errors.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchReports}
                  className="bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-xs font-mono-meta px-3 py-1.5 rounded-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
                  <span>Refresh Reports</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 text-xs font-mono-meta bg-[#FAF9F5] p-1 border border-[#E2DFD8] rounded-xs w-fit">
              <button
                onClick={() => setReportFilter('all')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  reportFilter === 'all' ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#737067] hover:text-[#1C1B18]'
                }`}
              >
                All Reports ({reports.length})
              </button>
              <button
                onClick={() => setReportFilter('open')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  reportFilter === 'open' ? 'bg-red-700 text-white font-bold' : 'text-[#737067] hover:text-red-700'
                }`}
              >
                Open Issues ({reports.filter((r) => r.status === 'open').length})
              </button>
              <button
                onClick={() => setReportFilter('resolved')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  reportFilter === 'resolved' ? 'bg-emerald-700 text-white font-bold' : 'text-[#737067] hover:text-emerald-700'
                }`}
              >
                Resolved ({reports.filter((r) => r.status === 'resolved').length})
              </button>
              <button
                onClick={() => setReportFilter('dismissed')}
                className={`px-3 py-1 rounded-xs transition cursor-pointer ${
                  reportFilter === 'dismissed' ? 'bg-neutral-800 text-white font-bold' : 'text-[#737067] hover:text-neutral-800'
                }`}
              >
                Dismissed ({reports.filter((r) => r.status === 'dismissed').length})
              </button>
            </div>

            {/* Reports List */}
            {reports.filter((r) => reportFilter === 'all' || r.status === reportFilter).length === 0 ? (
              <div className="text-center py-12 text-[#737067] font-mono-meta text-xs">
                No reports found matching criteria.
              </div>
            ) : (
              <div className="space-y-3">
                {reports
                  .filter((r) => reportFilter === 'all' || r.status === reportFilter)
                  .map((rep) => {
                    const isOpen = rep.status === 'open';
                    return (
                      <div
                        key={rep._id}
                        className="bg-[#FAF9F5] border border-[#E2DFD8] p-4 rounded-xs text-xs space-y-2 hover:border-[#1C1B18] transition"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DFD8] pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#1C1B18]">
                              {rep.thesisTitle || 'Scholarly Record'}
                            </span>
                            <span className="text-[10px] font-mono-meta bg-neutral-200 text-neutral-800 px-1.5 py-0.5 rounded-xs uppercase">
                              {rep.issueType}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-xs text-[10px] font-mono-meta font-bold uppercase tracking-wider ${
                                isOpen
                                  ? 'bg-red-100 text-red-900 border border-red-300'
                                  : rep.status === 'resolved'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-neutral-200 text-neutral-800'
                              }`}
                            >
                              {rep.status}
                            </span>
                          </div>
                        </div>

                        <div className="text-[#2E2C28] font-sans">
                          <strong>Student Description:</strong> {rep.description || 'No description provided.'}
                        </div>

                        {rep.resolutionNotes && (
                          <div className="text-neutral-700 bg-white p-2 rounded-xs border border-neutral-300 text-[11px]">
                            <strong>Resolution Note:</strong> {rep.resolutionNotes}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-[#E2DFD8] text-[10px] font-mono-meta text-neutral-500">
                          <div>
                            Reported by: <strong>{rep.reportedBy?.name || 'Anonymous'}</strong> ({rep.reportedBy?.email || 'N/A'})
                          </div>

                          {isOpen && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleUpdateReport(rep._id, 'resolved')}
                                className="bg-emerald-700 hover:bg-emerald-800 text-white px-2 py-1 rounded-xs font-bold cursor-pointer"
                              >
                                Mark Resolved
                              </button>
                              <button
                                onClick={() => handleUpdateReport(rep._id, 'dismissed')}
                                className="bg-neutral-200 hover:bg-neutral-300 text-neutral-800 px-2 py-1 rounded-xs cursor-pointer"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
              </div>
            )}

          </div>
        )}

        {/* TAB 5: PUBLICATIONS & DEPOSITORY MANAGEMENT */}
        {activeTab === 'publications' && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-5">
            
            {/* Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">
                  Depository Publications & Empirical Datasets
                </h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Publish new research papers, feature seminal works to top, or remove entries from repository.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={searchTheses}
                    onChange={(e) => setSearchTheses(e.target.value)}
                    placeholder="Search titles, authors..."
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs rounded-xs focus:outline-none focus:border-[#1C1B18] transition font-mono-meta"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
                </div>

                <button
                  onClick={() => setIsProposeOpen(true)}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs font-mono-meta px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Publish New Thesis</span>
                </button>
              </div>
            </div>

            {/* List of Theses */}
            <div className="space-y-3">
              {filteredTheses.map((thesis) => {
                const paperId = thesis._id || thesis.id;
                return (
                  <div
                    key={paperId}
                    className="border border-[#E2DFD8] p-4 rounded-xs hover:border-[#1C1B18] transition flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FAF9F5]"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {thesis.isPinned && (
                          <span className="text-[10px] font-mono-meta font-bold bg-[#1C1B18] text-white px-1.5 py-0.5 rounded-xs">
                            ★ PINNED SEMINAL WORK
                          </span>
                        )}
                        <span className="text-[10px] font-mono-meta bg-white border border-[#D5D1C7] text-[#605D55] px-1.5 py-0.5 rounded-xs">
                          {thesis.category}
                        </span>
                        {thesis.publisher && (
                          <span className="text-[10px] font-mono-meta text-[#737067]">
                            Press: <strong>{thesis.publisher}</strong>
                          </span>
                        )}
                      </div>

                      <h3 className="font-serif-title text-base font-normal text-[#1C1B18] leading-tight">
                        {thesis.title}
                      </h3>

                      <div className="text-xs text-[#737067] font-mono-meta">
                        Author: <span className="text-[#1C1B18] font-medium">{thesis.author}</span> • {thesis.university || thesis.institution || 'Global University'} ({thesis.publishedYear || thesis.year})
                      </div>
                    </div>

                    {/* Admin controls for thesis */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedThesisDetail(thesis)}
                        className="text-xs font-mono-meta text-blue-800 bg-white border border-[#D5D1C7] px-2.5 py-1 rounded-xs hover:bg-[#F2EFE8] cursor-pointer"
                      >
                        Inspect
                      </button>

                      <button
                        onClick={() => handlePinThesis(paperId, thesis.isPinned, thesis)}
                        className={`text-xs font-mono-meta px-2.5 py-1 rounded-xs transition cursor-pointer border ${
                          thesis.isPinned
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-white text-[#5C5950] border-[#D5D1C7] hover:bg-[#F2EFE8]'
                        }`}
                      >
                        {thesis.isPinned ? '★ Unpin' : '☆ Pin to Top'}
                      </button>

                      <button
                        onClick={() => handleDeleteThesis(paperId, thesis.title)}
                        className="text-xs font-mono-meta text-red-700 bg-white border border-red-200 hover:bg-red-50 p-1.5 rounded-xs cursor-pointer"
                        title="Delete publication"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

      </main>

      {/* Propose Thesis Modal (Admin publish) */}
      <ProposeThesisModal
        isOpen={isProposeOpen}
        onClose={() => setIsProposeOpen(false)}
        onCreated={handleThesisCreated}
      />

      {/* Detail Modal */}
      <PublicationDetailModal
        thesis={selectedThesisDetail}
        onClose={() => setSelectedThesisDetail(null)}
      />

      {/* bKash Payment Checklist & Verification Modal */}
      {reviewingPayment && (() => {
        const isApproved = reviewingPayment.status === 'approved';
        const isRejected = reviewingPayment.status === 'rejected';
        const isPending = ['submitted', 'under_review'].includes(reviewingPayment.status);
        const claimedAmount = reviewingPayment.claimedAmountPaisa
          ? reviewingPayment.claimedAmountPaisa / 100
          : reviewingPayment.order?.pricePaisa
          ? reviewingPayment.order.pricePaisa / 100
          : 500;

        return (
          <div
            className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            onClick={() => setReviewingPayment(null)}
          >
            <div
              className="bg-white border border-[#D5D1C7] rounded-sm max-w-xl w-full p-6 space-y-5 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-xs text-white font-bold flex items-center justify-center text-xs ${
                      isApproved ? 'bg-emerald-600' : isRejected ? 'bg-red-600' : 'bg-pink-600'
                    }`}
                  >
                    {isApproved ? '✓' : isRejected ? '✕' : 'bK'}
                  </div>
                  <div>
                    <h3 className="font-serif-title text-base font-bold text-[#1C1B18]">
                      {isApproved
                        ? 'Verified bKash Payment Record'
                        : isRejected
                        ? 'Rejected bKash Payment Record'
                        : 'Verify bKash Payment Claim'}
                    </h3>
                    <p className="text-[11px] font-mono-meta text-[#737067]">
                      Order: {reviewingPayment.order?.orderRef || 'N/A'} · Status:{' '}
                      <span
                        className={`font-bold uppercase ${
                          isApproved
                            ? 'text-emerald-700'
                            : isRejected
                            ? 'text-red-700'
                            : 'text-pink-700'
                        }`}
                      >
                        {reviewingPayment.status === 'under_review'
                          ? 'Needs Correction'
                          : reviewingPayment.status}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setReviewingPayment(null)}
                  className="text-[#737067] hover:text-black p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Student & Payment Summary */}
              <div className="bg-[#FAF9F5] border border-[#E2DFD8] p-4 rounded-xs text-xs space-y-2 font-mono-meta">
                <div className="flex justify-between">
                  <span className="text-neutral-500">SCHOLAR:</span>
                  <span className="font-bold text-[#1C1B18]">
                    {reviewingPayment.user?.name || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">EMAIL:</span>
                  <span className="text-[#1C1B18]">{reviewingPayment.user?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[#E2DFD8]">
                  <span className="text-neutral-500">CLAIMED TrxID:</span>
                  <span className="font-bold text-base text-pink-700 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded-xs select-all">
                    {reviewingPayment.trxId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">SENDER PHONE:</span>
                  <span className="font-bold text-[#1C1B18]">
                    {reviewingPayment.senderNumber || 'Not specified'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">PAYABLE AMOUNT:</span>
                  <span className="font-bold text-purple-950 font-serif-title text-sm">
                    ৳{claimedAmount} BDT
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">DURATION:</span>
                  <span className="text-[#1C1B18]">6 Calendar Months (Asia/Dhaka)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">CLAIM TIMESTAMP:</span>
                  <span className="text-[#1C1B18]">
                    {new Date(
                      reviewingPayment.paymentDateTime || reviewingPayment.createdAt
                    ).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}{' '}
                    (Dhaka)
                  </span>
                </div>
              </div>

              {/* Conditional Section: Approved / Rejected / Pending */}
              {isApproved && (
                <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xs space-y-2 text-xs text-emerald-950 font-mono-meta">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span>Payment Verified & Premium Membership Active</span>
                  </div>
                  <p className="text-[12px] text-emerald-900 leading-relaxed font-sans">
                    This payment claim has been reconciled against the bKash merchant statement and verified. The scholar has been granted 6 calendar months of full Premium access.
                  </p>
                  <div className="pt-2 border-t border-emerald-200 flex flex-wrap justify-between gap-2 text-[11px] text-emerald-800">
                    <span>
                      <strong>Reviewed At:</strong>{' '}
                      {reviewingPayment.reviewedAt
                        ? new Date(reviewingPayment.reviewedAt).toLocaleString('en-US', {
                            timeZone: 'Asia/Dhaka',
                          }) + ' (Dhaka)'
                        : 'Confirmed'}
                    </span>
                    {reviewingPayment.reviewedBy?.name && (
                      <span>
                        <strong>Auditor:</strong> {reviewingPayment.reviewedBy.name}
                      </span>
                    )}
                  </div>
                  {reviewingPayment.adminInstructions && (
                    <div className="text-[11px] text-emerald-900 bg-white/80 p-2.5 rounded-xs border border-emerald-200 mt-1">
                      <strong className="block text-[10px] text-emerald-700 uppercase tracking-wider mb-0.5">
                        Internal Audit Note:
                      </strong>
                      {reviewingPayment.adminInstructions}
                    </div>
                  )}
                </div>
              )}

              {isRejected && (
                <div className="bg-red-50 border border-red-300 p-4 rounded-xs space-y-2 text-xs text-red-950 font-mono-meta">
                  <div className="flex items-center gap-2 font-bold text-red-800 text-sm">
                    <AlertOctagon className="w-5 h-5 text-red-600" />
                    <span>Payment Claim Rejected</span>
                  </div>
                  <p className="text-[12px] text-red-900 font-sans leading-relaxed">
                    <strong>Reason recorded:</strong>{' '}
                    {reviewingPayment.rejectionReason ||
                      'Transaction ID not found on merchant statement or amount mismatch.'}
                  </p>
                  <div className="pt-2 border-t border-red-200 flex flex-wrap justify-between gap-2 text-[11px] text-red-800">
                    <span>
                      <strong>Reviewed At:</strong>{' '}
                      {reviewingPayment.reviewedAt
                        ? new Date(reviewingPayment.reviewedAt).toLocaleString('en-US', {
                            timeZone: 'Asia/Dhaka',
                          }) + ' (Dhaka)'
                        : 'N/A'}
                    </span>
                    {reviewingPayment.reviewedBy?.name && (
                      <span>
                        <strong>Auditor:</strong> {reviewingPayment.reviewedBy.name}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {isPending && (
                <div className="space-y-3">
                  {reviewingPayment.status === 'under_review' && reviewingPayment.adminInstructions && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xs text-xs text-amber-900 font-mono-meta">
                      <strong>Pending Correction:</strong> Student was requested: "{reviewingPayment.adminInstructions}"
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer p-3 bg-amber-50/80 border border-amber-300 rounded-xs text-xs text-amber-950">
                    <input
                      type="checkbox"
                      checked={statementVerified}
                      onChange={(e) => setStatementVerified(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded-xs text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="leading-relaxed">
                      <strong>Verification Requirement:</strong> I certify that I have confirmed transaction{' '}
                      <strong className="font-mono text-pink-700">{reviewingPayment.trxId}</strong> for{' '}
                      <strong>৳{claimedAmount}</strong> on our official bKash Merchant App or bank statement.
                    </span>
                  </label>

                  <div>
                    <label className="block text-[11px] font-mono-meta text-neutral-600 mb-1">
                      Editorial Review Notes (Optional / Internal):
                    </label>
                    <input
                      type="text"
                      value={adminReviewNotes}
                      onChange={(e) => setAdminReviewNotes(e.target.value)}
                      placeholder="e.g. Matched statement line #4819"
                      className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-xs rounded-xs font-mono-meta focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              {isPending ? (
                <div className="pt-2 border-t border-[#E2DFD8] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRejectPayment(reviewingPayment._id)}
                      disabled={actionLoading === reviewingPayment._id}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 text-xs font-mono-meta rounded-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      Reject Claim
                    </button>

                    <button
                      onClick={() => handleRequestCorrection(reviewingPayment._id)}
                      disabled={actionLoading === reviewingPayment._id}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-mono-meta rounded-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      Request Correction
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setReviewingPayment(null)}
                      className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-mono-meta rounded-xs cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={() => handleApprovePayment(reviewingPayment._id)}
                      disabled={!statementVerified || actionLoading === reviewingPayment._id}
                      className={`px-4 py-1.5 rounded-xs text-xs font-mono-meta font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                        statementVerified
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>
                        {actionLoading === reviewingPayment._id
                          ? 'Activating...'
                          : 'Approve & Activate Premium'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-[#E2DFD8] flex items-center justify-end">
                  <button
                    onClick={() => setReviewingPayment(null)}
                    className="px-4 py-1.5 bg-[#1C1B18] hover:bg-neutral-800 text-white font-mono-meta text-xs font-bold rounded-xs transition cursor-pointer"
                  >
                    Close Record
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Zoom ID Card Modal */}
      {zoomedIdCard && (
        <div
          className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomedIdCard(null)}
        >
          <div
            className="bg-white p-2 rounded-sm max-w-3xl max-h-[90vh] overflow-hidden relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E2DFD8]">
              <span className="text-xs font-mono-meta font-bold text-[#1C1B18]">
                Student ID Proof Verification (Cloudinary Hosted)
              </span>
              <button
                onClick={() => setZoomedIdCard(null)}
                className="text-[#737067] hover:text-[#1C1B18] text-xs font-mono-meta cursor-pointer"
              >
                [✕ CLOSE]
              </button>
            </div>
            <img
              src={zoomedIdCard}
              alt="Student ID Proof Full"
              className="max-h-[75vh] w-auto mx-auto object-contain rounded-xs"
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-4 w-full border-t border-[#E2DFD8] text-center text-xs font-mono-meta text-[#737067]">
        The Thesis Archive • Master Administrative Console
      </footer>

    </div>
  );
}
