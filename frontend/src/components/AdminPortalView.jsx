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
  Eye,
  RefreshCw,
  FileText,
  Check,
  X,
  CreditCard,
  FileWarning,
  AlertTriangle,
  ShieldCheck,
  CheckSquare,
  Square,
  Layers,
  ArrowRight,
  LogOut,
  UserPlus,
} from 'lucide-react';
import ProposeThesisModal from './ProposeThesisModal';
import PublicationDetailModal from './PublicationDetailModal';
import DocumentViewerModal from './DocumentViewerModal';
import ManualGrantModal from './ManualGrantModal';
import EditorManagementModal from './EditorManagementModal';

export default function AdminPortalView({ onSwitchToStudentPreview }) {
  const { user, logout, isAdmin, isEditor, hasPermission } = useAuth();

  // Permission helpers
  const canViewStudents = hasPermission('students.view');
  const canVerifyStudents = hasPermission('students.verify');
  const canSuspendStudents = hasPermission('students.suspend');
  const canViewDocuments = hasPermission('documents.view');
  const canViewPayments = hasPermission('payments.view');
  const canReviewPayments = hasPermission('payments.review');
  const canModeratePublications = hasPermission('publications.moderate');
  const canModerateReports = hasPermission('reports.moderate');

  // Active admin tab: 'pending' | 'roster' | 'publications' | 'payments' | 'reports' | 'staff'
  const [activeTab, setActiveTab] = useState(canViewStudents ? 'pending' : 'publications');

  // Student management state
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all'); // 'all', 'approved', 'pending', 'banned'
  const [actionLoading, setActionLoading] = useState(null);

  // Publications state (Depository Moderation)
  const [theses, setTheses] = useState([]);
  const [thesesTotal, setThesesTotal] = useState(0);
  const [pendingThesesCount, setPendingThesesCount] = useState(0);
  const [thesesPage, setThesesPage] = useState(1);
  const [loadingTheses, setLoadingTheses] = useState(false);
  const [searchTheses, setSearchTheses] = useState('');
  const [publicationStatusFilter, setPublicationStatusFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [selectedThesisDetail, setSelectedThesisDetail] = useState(null);
  const [rejectingThesis, setRejectingThesis] = useState(null);
  const [thesisRejectionReason, setThesisRejectionReason] = useState('');

  // Protected Document Viewer Modal
  const [inspectingDocStudent, setInspectingDocStudent] = useState(null);

  // Manual Grant Modal
  const [manualGrantTarget, setManualGrantTarget] = useState(null);

  // Staff (Team & Access) State
  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [editingEditor, setEditingEditor] = useState(null);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);

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

  // Lazy-load active tab data
  useEffect(() => {
    if (activeTab === 'pending' || activeTab === 'roster') {
      if (canViewStudents) fetchStudents();
    } else if (activeTab === 'publications') {
      if (canModeratePublications || isAdmin) fetchPublications();
    } else if (activeTab === 'payments') {
      if (canViewPayments) fetchPayments();
    } else if (activeTab === 'reports') {
      if (canModerateReports) fetchReports();
    } else if (activeTab === 'staff') {
      if (isAdmin) fetchStaff();
    }
  }, [activeTab]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket) return;

    const handleStudentEvent = () => {
      if (canViewStudents) fetchStudents();
      if (isAdmin) fetchStaff();
    };

    const handleStaffEvent = () => {
      if (isAdmin) fetchStaff();
      if (canViewStudents) fetchStudents();
    };

    const handlePaymentEvent = () => {
      if (canViewPayments) fetchPayments();
    };

    const handleReportEvent = () => {
      if (canModerateReports) fetchReports();
    };

    const handleThesisEvent = () => {
      if (canModeratePublications || isAdmin) fetchPublications();
    };

    socket.on('admin:student_updated', handleStudentEvent);
    socket.on('admin:new_student_application', handleStudentEvent);
    socket.on('admin:student_profile_updated', handleStudentEvent);
    socket.on('admin:staff_updated', handleStaffEvent);
    socket.on('membership:updated', handleStudentEvent);
    socket.on('admin:payment_updated', handlePaymentEvent);
    socket.on('admin:report_updated', handleReportEvent);
    socket.on('thesis:updated', handleThesisEvent);
    socket.on('admin:thesis_submitted', handleThesisEvent);

    return () => {
      socket.off('admin:student_updated', handleStudentEvent);
      socket.off('admin:new_student_application', handleStudentEvent);
      socket.off('admin:student_profile_updated', handleStudentEvent);
      socket.off('admin:staff_updated', handleStaffEvent);
      socket.off('membership:updated', handleStudentEvent);
      socket.off('admin:payment_updated', handlePaymentEvent);
      socket.off('admin:report_updated', handleReportEvent);
      socket.off('thesis:updated', handleThesisEvent);
      socket.off('admin:thesis_submitted', handleThesisEvent);
    };
  }, [socket, canViewStudents, canViewPayments, canModerateReports, canModeratePublications, isAdmin]);

  // ==========================================
  // API Fetchers
  // ==========================================

  const fetchStudents = async () => {
    try {
      setLoadingStudents(true);
      const res = await axios.get('/api/admin/students');
      setStudents(res.data);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchPublications = async (page = 1) => {
    try {
      setLoadingTheses(true);
      const res = await axios.get('/api/admin/publications', {
        params: {
          status: publicationStatusFilter,
          q: searchTheses,
          page,
          limit: 20,
        },
      });
      setTheses(res.data.publications || []);
      setThesesTotal(res.data.total || 0);
      setPendingThesesCount(res.data.pendingCount || 0);
      setThesesPage(res.data.page || 1);
    } catch (err) {
      console.error('Error fetching publications:', err);
    } finally {
      setLoadingTheses(false);
    }
  };

  const fetchPayments = async () => {
    try {
      setLoadingPayments(true);
      const res = await axios.get('/api/admin/payments');
      setPayments(res.data);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const res = await axios.get('/api/admin/reports');
      setReports(res.data);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchStaff = async () => {
    try {
      setLoadingStaff(true);
      const res = await axios.get('/api/admin/editors');
      setStaffList(res.data);
    } catch (err) {
      console.error('Error fetching staff list:', err);
    } finally {
      setLoadingStaff(false);
    }
  };

  // ==========================================
  // Student Handlers
  // ==========================================

  const handleVerifyStudent = async (studentId, decision) => {
    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/verify-student/${studentId}`, { decision });
      await fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || 'Error updating student verification.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBanStudent = async (studentId, studentName) => {
    const reason = window.prompt(
      `Enter administrative suspension reason for ${studentName}:`,
      'Violation of depository terms'
    );
    if (reason === null) return;

    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/student/${studentId}/ban`, { reason });
      await fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to suspend student.');
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
      alert(err.response?.data?.message || 'Failed to unban student.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Permanently remove student account for ${studentName}? This action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(studentId);
      await axios.delete(`/api/admin/student/${studentId}`);
      await fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete student.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeMembership = async (studentId, studentName) => {
    const reason = window.prompt(
      `Enter reason for revoking membership access for ${studentName}:`,
      'Test period completed'
    );
    if (reason === null) return;

    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/membership/${studentId}/revoke`, {
        reason: reason.trim() || 'Administrative revocation by staff',
      });
      await fetchStudents();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revoke membership access.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAppointEditorFromStudent = (student) => {
    setEditingEditor({
      ...student,
      role: 'student',
    });
    setIsEditorModalOpen(true);
  };

  const handleRevokeEditorRole = async (userId, userName) => {
    if (!window.confirm(`Revoke editor privileges for ${userName}? Account will return to standard student status.`)) {
      return;
    }

    try {
      setActionLoading(userId);
      await axios.delete(`/api/admin/editors/${userId}`);
      await fetchStudents();
      await fetchStaff();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to revoke editor privileges.');
    } finally {
      setActionLoading(null);
    }
  };

  // ==========================================
  // Publication Handlers
  // ==========================================

  const handleApprovePublication = async (thesisId) => {
    try {
      await axios.put(`/api/admin/publications/${thesisId}/approve`);
      await fetchPublications(thesesPage);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve publication.');
    }
  };

  const handleRejectPublicationSubmit = async (e) => {
    e.preventDefault();
    if (!thesisRejectionReason || !thesisRejectionReason.trim()) {
      alert('A mandatory rejection reason is required.');
      return;
    }

    try {
      await axios.put(`/api/admin/publications/${rejectingThesis._id}/reject`, {
        rejectionReason: thesisRejectionReason.trim(),
      });
      setRejectingThesis(null);
      setThesisRejectionReason('');
      await fetchPublications(thesesPage);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject publication.');
    }
  };

  const handleDeletePublication = async (thesisId, title) => {
    if (!window.confirm(`Permanently delete "${title}" from the local repository?`)) {
      return;
    }

    try {
      await axios.delete(`/api/admin/publications/${thesisId}`);
      await fetchPublications(thesesPage);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete publication.');
    }
  };

  // ==========================================
  // Payment Handlers
  // ==========================================

  const handleApprovePayment = async (paymentId) => {
    if (!statementVerified) {
      alert('Verification requirement: Please reconcile the transaction against the bKash merchant statement first.');
      return;
    }

    try {
      setActionLoading(paymentId);
      await axios.post(`/api/admin/payments/${paymentId}/approve`, {
        verifiedInMerchantStatement: true,
        adminNotes: adminReviewNotes,
      });
      setReviewingPayment(null);
      setAdminReviewNotes('');
      setStatementVerified(false);
      await fetchPayments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve payment claim.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayment = async (paymentId) => {
    const rejectionReason = window.prompt(
      'Enter reason for rejecting this payment claim (will be sent to student):',
      'Transaction ID not found in bKash merchant statement'
    );
    if (rejectionReason === null) return;

    try {
      setActionLoading(paymentId);
      await axios.post(`/api/admin/payments/${paymentId}/reject`, {
        rejectionReason,
      });
      setReviewingPayment(null);
      await fetchPayments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject payment.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestCorrection = async (paymentId) => {
    const adminInstructions = window.prompt(
      'Enter correction instructions for student:',
      'Please verify your bKash Transaction ID and resubmit.'
    );
    if (!adminInstructions) return;

    try {
      setActionLoading(paymentId);
      await axios.post(`/api/admin/payments/${paymentId}/request-correction`, {
        adminInstructions,
      });
      setReviewingPayment(null);
      await fetchPayments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to request correction.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filters
  const pendingStudents = students.filter((s) => s.status === 'pending');
  const filteredStudents = students.filter((s) => {
    const matchesFilter =
      rosterFilter === 'all' ||
      (rosterFilter === 'approved' && s.status === 'approved') ||
      (rosterFilter === 'pending' && s.status === 'pending') ||
      (rosterFilter === 'banned' && s.status === 'banned');

    const searchLower = searchStudent.toLowerCase();
    const matchesSearch =
      s.name?.toLowerCase().includes(searchLower) ||
      s.email?.toLowerCase().includes(searchLower) ||
      s.university?.toLowerCase().includes(searchLower) ||
      s.studentId?.toLowerCase().includes(searchLower);

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#1C1B18] flex flex-col justify-between">
      
      {/* Top Banner Navigation */}
      <header className="bg-[#1C1B18] text-[#FAF9F5] border-b border-[#38352E] sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          
          {/* Logo & Portal Identity */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-white text-[#1C1B18] flex items-center justify-center font-serif-title text-xl font-normal">
              §
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif-title text-lg tracking-tight block leading-tight">
                  {isAdmin ? 'Depository Administration Console' : 'Depository Moderator Console'}
                </span>
                <span className={`text-[10px] font-mono-meta font-bold px-1.5 py-0.2 rounded-xs uppercase ${
                  isAdmin ? 'bg-amber-400 text-neutral-950' : 'bg-emerald-400 text-neutral-950'
                }`}>
                  {isAdmin ? 'Depository Director' : 'Editorial Moderator'}
                </span>
              </div>
              <span className="text-[10px] font-mono-meta text-neutral-400 uppercase tracking-wider">
                Project Panther • Operational RBAC Gateway
              </span>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-700/80 p-1 rounded-sm text-xs font-mono-meta flex-wrap">
            
            {canViewStudents && (
              <>
                <button
                  onClick={() => setActiveTab('pending')}
                  className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'pending'
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Pending Applicants</span>
                  {pendingStudents.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      activeTab === 'pending' ? 'bg-neutral-950 text-amber-300' : 'bg-amber-500 text-neutral-950'
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
              </>
            )}

            {(canModeratePublications || isAdmin) && (
              <button
                onClick={() => setActiveTab('publications')}
                className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'publications'
                    ? 'bg-amber-500 text-neutral-950 font-bold'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Moderation Desk</span>
                {pendingThesesCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === 'publications' ? 'bg-neutral-950 text-amber-300' : 'bg-amber-500 text-neutral-950'
                  }`}>
                    {pendingThesesCount}
                  </span>
                )}
              </button>
            )}

            {canViewPayments && (
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
            )}

            {canModerateReports && (
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
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setActiveTab('staff')}
                className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'staff'
                    ? 'bg-amber-500 text-neutral-950 font-bold'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Team & Access</span>
              </button>
            )}

          </div>

          {/* Right: Open Research Library & Sign Out */}
          <div className="flex items-center gap-3">
            <button
              onClick={onSwitchToStudentPreview}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 px-3.5 py-1.5 rounded-xs transition font-mono-meta text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Open full research discovery repository with administrative entitlements"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Open Research Library</span>
            </button>

            <button
              onClick={logout}
              className="text-neutral-400 hover:text-white p-1 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 w-full flex-1">
        
        {/* TAB 1: PENDING APPLICANTS */}
        {activeTab === 'pending' && canViewStudents && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title font-semibold text-[#1C1B18]">
                  Candidate Verification Desk
                </h2>
                <p className="text-xs font-mono-meta text-[#737067]">
                  Inspect student academic identity credentials and evaluate access requests.
                </p>
              </div>
              <button
                onClick={fetchStudents}
                disabled={loadingStudents}
                className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStudents ? 'animate-spin' : ''}`} />
                <span>Refresh Desk</span>
              </button>
            </div>

            {loadingStudents ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-800 mb-2" />
                Loading candidate applications...
              </div>
            ) : pendingStudents.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono-meta text-[#737067] bg-white border border-[#E2DFD8] rounded-sm space-y-2">
                <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-bold text-[#1C1B18]">All candidate applications evaluated</p>
                <p className="text-[11px] text-[#8C887E]">No student registrations are currently awaiting administrative review.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingStudents.map((student) => (
                  <div
                    key={student._id}
                    className="bg-white border border-[#E2DFD8] p-5 rounded-sm shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-base text-[#1C1B18]">{student.name}</h3>
                        <p className="text-xs font-mono-meta text-[#737067]">{student.email}</p>
                      </div>
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-xs text-[10px] font-mono-meta font-bold">
                        AWAITING VERIFICATION
                      </span>
                    </div>

                    <div className="text-xs font-mono-meta space-y-1 bg-[#FAF9F5] p-3 rounded-xs border border-[#E5E2DA] text-[#524F47]">
                      <div><strong>Institution:</strong> {student.university || 'Not Specified'}</div>
                      <div><strong>Student ID:</strong> <code>{student.studentId || 'N/A'}</code></div>
                      <div><strong>Degree Program:</strong> {student.degreeProgram}</div>
                      <div><strong>Research Domain:</strong> {student.researchDomain}</div>
                      {student.thesisGoal && (
                        <div className="pt-1 border-t border-[#E5E2DA] mt-1">
                          <strong>Working Title:</strong> <em className="text-[#1C1B18]">{student.thesisGoal}</em>
                        </div>
                      )}
                    </div>

                    {/* Verification Document Action */}
                    <div className="pt-1 flex items-center justify-between">
                      {(student.hasVerificationDocument || student.idCardProof) ? (
                        <button
                          type="button"
                          onClick={() => setInspectingDocStudent(student)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xs cursor-pointer font-mono-meta transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Student ID Document (Protected) &rarr;</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono-meta text-[#8C887E]">
                          No verification document uploaded
                        </span>
                      )}
                    </div>

                    {/* Approve / Reject Actions */}
                    {canVerifyStudents && (
                      <div className="flex items-center gap-2 pt-2 border-t border-[#E2DFD8]">
                        <button
                          onClick={() => handleVerifyStudent(student._id, 'approve')}
                          disabled={actionLoading === student._id}
                          className="flex-1 bg-emerald-800 hover:bg-emerald-900 text-white py-1.5 rounded-xs font-mono-meta text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve Access</span>
                        </button>
                        <button
                          onClick={() => handleVerifyStudent(student._id, 'reject')}
                          disabled={actionLoading === student._id}
                          className="px-3 bg-white border border-[#D5D1C7] hover:bg-red-50 text-red-700 py-1.5 rounded-xs font-mono-meta text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STUDENT ROSTER */}
        {activeTab === 'roster' && canViewStudents && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-4">
            
            {/* Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">Scholarly Registry</h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Authoritative directory of registered scholars and active membership entitlements.
                </p>
              </div>

              {/* Search & Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-64">
                  <input
                    type="text"
                    value={searchStudent}
                    onChange={(e) => setSearchStudent(e.target.value)}
                    placeholder="Search by name, ID, email..."
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs font-mono-meta rounded-xs focus:outline-none focus:border-[#1C1B18]"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
                </div>

                <div className="flex gap-1 text-xs font-mono-meta border border-[#D5D1C7] p-0.5 rounded-xs bg-[#FAF9F5]">
                  {['all', 'approved', 'pending', 'banned'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setRosterFilter(f)}
                      className={`px-2.5 py-1 rounded-xs uppercase text-[10px] cursor-pointer transition ${
                        rosterFilter === f ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#737067] hover:text-[#1C1B18]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-[#E2DFD8] rounded-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#FAF9F5] border-b border-[#E2DFD8] text-[10px] font-mono-meta text-[#605D55] uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Scholar Identity</th>
                    <th className="py-2.5 px-4">Institution & Degree</th>
                    <th className="py-2.5 px-4">Account Status</th>
                    <th className="py-2.5 px-4">Membership Plan</th>
                    <th className="py-2.5 px-4">Verification ID</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2DA] font-sans">
                  {filteredStudents.map((s) => {
                    const isStudentApproved = s.status === 'approved';
                    const isStudentPending = s.status === 'pending';
                    const isStudentBanned = s.status === 'banned';

                    return (
                      <tr key={s._id} className="hover:bg-[#FAF9F5]/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#1C1B18]">{s.name}</div>
                          <div className="text-[11px] font-mono-meta text-[#737067]">{s.email}</div>
                        </td>

                        <td className="py-3 px-4 font-mono-meta text-[11px]">
                          <div>{s.university || 'N/A'}</div>
                          <div className="text-[10px] text-[#8C887E]">ID: {s.studentId || 'N/A'} • {s.degreeProgram}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`px-2 py-0.5 rounded-xs text-[10px] font-mono-meta font-bold uppercase ${
                              isStudentApproved
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : isStudentPending
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-red-100 text-red-900 border border-red-300'
                            }`}>
                              {s.status}
                            </span>
                            {s.role === 'editor' && (
                              <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-mono-meta font-bold uppercase bg-purple-100 text-purple-900 border border-purple-300">
                                Editor
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Canonical Membership Plan Badges */}
                        <td className="py-3 px-4 font-mono-meta text-xs">
                          {s.membership?.source === 'manual_admin' ? (
                            <div>
                              <span className={`border px-1.5 py-0.5 rounded-xs text-[10px] font-bold ${
                                s.membership.grantType === 'test'
                                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                                  : 'bg-blue-100 text-blue-900 border-blue-300'
                              }`}>
                                {s.membership.customLabel || s.membership.label || 'Admin Grant'}
                              </span>
                              {s.membership.grantReason && (
                                <div className="text-[9px] text-[#737067] italic truncate max-w-[160px]" title={s.membership.grantReason}>
                                  &quot;{s.membership.grantReason}&quot;
                                </div>
                              )}
                              {s.membership?.formattedExpiry && (
                                <div className="text-[9px] text-[#737067] mt-0.5">Exp: {s.membership.formattedExpiry}</div>
                              )}
                            </div>
                          ) : s.membership?.plan === 'pro_max_12m' ? (
                            <div>
                              <span className="bg-amber-100 text-amber-900 border border-amber-400 px-1.5 py-0.5 rounded-xs text-[10px] font-bold">
                                ★ Pro Max Annual
                              </span>
                              {s.membership?.formattedExpiry && (
                                <div className="text-[9px] text-[#737067] mt-0.5">Exp: {s.membership.formattedExpiry}</div>
                              )}
                            </div>
                          ) : s.membership?.plan === 'premium_6m' || s.membership?.plan === 'premium' ? (
                            <div>
                              <span className="bg-emerald-100 text-emerald-900 border border-emerald-400 px-1.5 py-0.5 rounded-xs text-[10px] font-bold">
                                Premium Scholarly
                              </span>
                              {s.membership?.formattedExpiry && (
                                <div className="text-[9px] text-[#737067] mt-0.5">Exp: {s.membership.formattedExpiry}</div>
                              )}
                            </div>
                          ) : s.membership?.plan === 'trial_v2' || s.membership?.plan === 'trial' ? (
                            <div>
                              <span className="bg-blue-100 text-blue-900 border border-blue-300 px-1.5 py-0.5 rounded-xs text-[10px]">
                                7-Day Trial
                              </span>
                              {s.membership?.formattedExpiry && (
                                <div className="text-[9px] text-[#737067] mt-0.5">Exp: {s.membership.formattedExpiry}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#737067] bg-[#FAF9F5] border border-[#D5D1C7] px-1.5 py-0.5 rounded-xs">
                              Standard Free
                            </span>
                          )}
                        </td>

                        {/* Document View */}
                        <td className="py-3 px-4">
                          {(s.hasVerificationDocument || s.idCardProof) ? (
                            <button
                              type="button"
                              onClick={() => setInspectingDocStudent(s)}
                              className="text-[11px] font-mono-meta text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Proof</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono-meta text-[#8C887E]">None</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 font-mono-meta text-xs">
                            
                            {/* Manual Grant (Admin Only) */}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setManualGrantTarget(s)}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2 py-1 rounded-xs cursor-pointer font-bold text-[10px]"
                                title="Grant manual Premium or custom test duration"
                              >
                                + Grant Access
                              </button>
                            )}

                            {/* Revoke Membership Plan (Admin Only - if user has any active plan) */}
                            {isAdmin && s.membership?.plan && s.membership.plan !== 'free' && (
                              <button
                                type="button"
                                onClick={() => handleRevokeMembership(s._id, s.name)}
                                disabled={actionLoading === s._id}
                                className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded-xs text-[10px] cursor-pointer font-bold disabled:opacity-50"
                                title="Revoke active membership or test grant"
                              >
                                Revoke Plan
                              </button>
                            )}

                            {/* Editor Management Role Action (Admin Only) */}
                            {isAdmin && (
                              s.role === 'editor' ? (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeEditorRole(s._id, s.name)}
                                  disabled={actionLoading === s._id}
                                  className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 px-2 py-1 rounded-xs text-[10px] cursor-pointer font-bold disabled:opacity-50"
                                  title="Revoke editor privileges"
                                >
                                  Revoke Editor
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAppointEditorFromStudent(s)}
                                  disabled={actionLoading === s._id}
                                  className="bg-neutral-50 hover:bg-neutral-100 text-neutral-800 border border-neutral-300 px-2 py-1 rounded-xs text-[10px] cursor-pointer font-bold disabled:opacity-50"
                                  title="Appoint this scholar as a depository editor"
                                >
                                  + Appoint Editor
                                </button>
                              )
                            )}

                            {isStudentPending && canVerifyStudents && (
                              <button
                                onClick={() => handleVerifyStudent(s._id, 'approve')}
                                disabled={actionLoading === s._id}
                                className="bg-emerald-700 hover:bg-emerald-800 text-white px-2 py-1 rounded-xs font-bold text-[10px] cursor-pointer disabled:opacity-50"
                              >
                                Approve
                              </button>
                            )}

                            {isStudentApproved && canSuspendStudents && (
                              <button
                                onClick={() => handleBanStudent(s._id, s.name)}
                                disabled={actionLoading === s._id}
                                className="bg-neutral-100 hover:bg-red-50 text-neutral-700 hover:text-red-700 border border-neutral-300 px-2 py-1 rounded-xs text-[10px] cursor-pointer disabled:opacity-50"
                              >
                                Suspend
                              </button>
                            )}

                            {isStudentBanned && canSuspendStudents && (
                              <button
                                onClick={() => handleUnbanStudent(s._id)}
                                disabled={actionLoading === s._id}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded-xs text-[10px] cursor-pointer disabled:opacity-50 font-bold"
                              >
                                Reinstate
                              </button>
                            )}

                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteStudent(s._id, s.name)}
                                disabled={actionLoading === s._id}
                                className="text-neutral-400 hover:text-red-700 p-1 cursor-pointer"
                                title="Delete account"
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

        {/* TAB 3: DEPOSITORY PUBLICATIONS MODERATION */}
        {activeTab === 'publications' && (canModeratePublications || isAdmin) && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">
                  Depository Publications Moderation Desk
                </h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Inspect and moderate locally cataloged student theses and institutional research papers.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-64">
                  <input
                    type="text"
                    value={searchTheses}
                    onChange={(e) => setSearchTheses(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchPublications(1)}
                    placeholder="Search local titles, authors..."
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs font-mono-meta rounded-xs focus:outline-none focus:border-[#1C1B18]"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
                </div>

                <div className="flex gap-1 text-xs font-mono-meta border border-[#D5D1C7] p-0.5 rounded-xs bg-[#FAF9F5]">
                  {['all', 'pending', 'approved', 'rejected'].map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        setPublicationStatusFilter(st);
                        setTimeout(() => fetchPublications(1), 50);
                      }}
                      className={`px-2 py-1 rounded-xs uppercase text-[10px] cursor-pointer transition ${
                        publicationStatusFilter === st ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#737067] hover:text-[#1C1B18]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                {isAdmin && (
                  <button
                    onClick={() => setIsProposeOpen(true)}
                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs font-mono-meta px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Deposit Paper</span>
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            {loadingTheses ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-800 mb-2" />
                Loading depository publications...
              </div>
            ) : theses.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono-meta text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm space-y-2">
                <BookOpen className="w-8 h-8 text-neutral-500 mx-auto" />
                <p className="font-bold text-[#1C1B18]">No publications matching status "{publicationStatusFilter}"</p>
                <p className="text-[11px] text-[#8C887E]">Change filters or search query to inspect other records.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {theses.map((paper) => (
                  <div
                    key={paper._id}
                    className="border border-[#E2DFD8] p-4 rounded-xs hover:border-[#1C1B18] transition flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FAF9F5]"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono-meta">
                        <span className={`px-1.5 py-0.5 rounded-xs font-bold uppercase ${
                          paper.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : paper.status === 'pending'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-red-100 text-red-900 border border-red-300'
                        }`}>
                          {paper.status}
                        </span>
                        <span className="bg-white border border-[#D5D1C7] text-[#605D55] px-1.5 py-0.5 rounded-xs">
                          {paper.category}
                        </span>
                        <span className="text-[#737067]">
                          Catalog ID: <code>{paper.catalogId || paper._id}</code>
                        </span>
                      </div>

                      <h3 className="font-serif-title text-base font-normal text-[#1C1B18] leading-tight">
                        {paper.title}
                      </h3>

                      <div className="text-xs text-[#737067] font-mono-meta">
                        Author: <strong className="text-[#1C1B18]">{paper.author}</strong> • {paper.university} ({paper.publishedYear})
                      </div>

                      {paper.status === 'rejected' && paper.rejectionReason && (
                        <div className="text-xs text-red-800 bg-red-50 border border-red-200 p-2 rounded-xs mt-1 font-mono-meta">
                          <strong>Rejection Reason:</strong> "{paper.rejectionReason}"
                        </div>
                      )}
                    </div>

                    {/* Moderation Controls */}
                    <div className="flex items-center gap-2 shrink-0 font-mono-meta text-xs">
                      <button
                        onClick={() => setSelectedThesisDetail(paper)}
                        className="bg-white border border-[#D5D1C7] hover:border-[#1C1B18] text-[#1C1B18] px-2.5 py-1.5 rounded-xs transition flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>

                      {paper.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprovePublication(paper._id)}
                            className="bg-emerald-800 hover:bg-emerald-900 text-white px-3 py-1.5 rounded-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => {
                              setRejectingThesis(paper);
                              setThesisRejectionReason('');
                            }}
                            className="bg-white border border-red-300 text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {isAdmin && (
                        <button
                          onClick={() => handleDeletePublication(paper._id, paper.title)}
                          className="text-neutral-400 hover:text-red-700 p-1.5 cursor-pointer ml-1"
                          title="Permanently remove local thesis"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* TAB 4: BKASH PAYMENTS REVIEW */}
        {activeTab === 'payments' && canViewPayments && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">bKash Payment Review Desk</h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Reconcile manual bKash transaction submissions against official statements and activate memberships.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchPayments}
                  disabled={loadingPayments}
                  className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPayments ? 'animate-spin' : ''}`} />
                  <span>Refresh Queue</span>
                </button>
              </div>
            </div>

            {loadingPayments ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-800 mb-2" />
                Loading payment claims...
              </div>
            ) : payments.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono-meta text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm">
                No payment claims recorded.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E2DFD8] rounded-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#FAF9F5] border-b border-[#E2DFD8] text-[10px] font-mono-meta text-[#605D55] uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Scholar & Order</th>
                      <th className="py-2.5 px-4">Transaction ID</th>
                      <th className="py-2.5 px-4">Plan & Amount</th>
                      <th className="py-2.5 px-4">Sender & Time</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E2DA] font-sans">
                    {payments.map((sub) => {
                      const isApproved = sub.status === 'approved';
                      const isRejected = sub.status === 'rejected';

                      return (
                        <tr key={sub._id} className="hover:bg-[#FAF9F5]/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#1C1B18]">{sub.user?.name || 'Scholar'}</div>
                            <div className="text-[11px] font-mono-meta text-[#737067]">{sub.user?.email}</div>
                            <div className="text-[10px] font-mono-meta text-neutral-500">Ref: {sub.order?.orderRef || 'N/A'}</div>
                          </td>

                          <td className="py-3 px-4 font-mono-meta">
                            <div className="font-bold text-sm text-[#1C1B18] bg-neutral-100 px-1.5 py-0.5 rounded-xs w-fit">
                              {sub.trxId}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono-meta">
                            <div className="font-bold text-sm text-purple-950">
                              ৳{sub.claimedAmountPaisa / 100} BDT
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {sub.order?.durationMonths || 6} Months ({sub.order?.planName || 'Premium'})
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono-meta text-xs">
                            <div>Sender: <strong>{sub.senderNumber || 'Not specified'}</strong></div>
                            <div className="text-[10px] text-neutral-500">
                              {new Date(sub.paymentDateTime || sub.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-xs text-[10px] font-mono-meta font-bold uppercase ${
                              isApproved
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : isRejected
                                ? 'bg-red-100 text-red-900 border border-red-300'
                                : sub.status === 'under_review'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-pink-100 text-pink-900 border border-pink-300'
                            }`}>
                              {sub.status === 'under_review' ? 'Needs Correction' : sub.status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setReviewingPayment(sub);
                                setStatementVerified(false);
                                setAdminReviewNotes(sub.adminInstructions || '');
                              }}
                              className="bg-[#1C1B18] hover:bg-neutral-800 text-white px-3 py-1.5 rounded-xs font-mono-meta text-xs font-bold cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* TAB 5: ISSUE REPORTS */}
        {activeTab === 'reports' && canModerateReports && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">Depository Reports Queue</h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Metadata inaccuracies, dead PDF links, and data issues reported by scholars.
                </p>
              </div>
              <button
                onClick={fetchReports}
                disabled={loadingReports}
                className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
                <span>Refresh Reports</span>
              </button>
            </div>

            {loadingReports ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-800 mb-2" />
                Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono-meta text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm">
                No issue reports pending.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <div key={r._id} className="border border-[#E2DFD8] p-4 rounded-xs bg-[#FAF9F5] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#1C1B18]">{r.title || 'Publication Issue'}</span>
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-xs text-[10px] font-mono-meta uppercase font-bold">
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#524F47]">{r.description}</p>
                    <div className="text-[10px] font-mono-meta text-[#737067]">
                      Reported by: <strong>{r.reportedBy}</strong> • Record ID: <code>{r.recordId}</code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: TEAM & ACCESS (Admin Only) */}
        {activeTab === 'staff' && isAdmin && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">Team & Access Control</h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Appoint depository editors, delegate granular moderation capabilities, and audit privileged accounts.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingEditor(null);
                  setIsEditorModalOpen(true);
                }}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs font-mono-meta px-3.5 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Appoint New Editor</span>
              </button>
            </div>

            {loadingStaff ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-800 mb-2" />
                Loading staff team...
              </div>
            ) : staffList.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono-meta text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm">
                No staff accounts found.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E2DFD8] rounded-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#FAF9F5] border-b border-[#E2DFD8] text-[10px] font-mono-meta text-[#605D55] uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Staff Member</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4">Assigned Permissions</th>
                      <th className="py-2.5 px-4 text-right">Access Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E2DA] font-sans">
                    {staffList.map((st) => {
                      const isTargetAdmin = st.role === 'admin';

                      return (
                        <tr key={st._id || st.id} className="hover:bg-[#FAF9F5]/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#1C1B18]">{st.name}</div>
                            <div className="text-[11px] font-mono-meta text-[#737067]">{st.email}</div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-xs text-[10px] font-mono-meta font-bold uppercase ${
                              isTargetAdmin
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}>
                              {isTargetAdmin ? 'Administrator' : 'Editor'}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono-meta">
                            {isTargetAdmin ? (
                              <span className="text-[11px] text-amber-800 font-bold">
                                Full Operational Control (Implicit All)
                              </span>
                            ) : Array.isArray(st.permissions) && st.permissions.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-md">
                                {st.permissions.map((p) => (
                                  <span key={p} className="bg-white border border-[#D5D1C7] text-[#524F47] px-1.5 py-0.5 rounded text-[9px]">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[#8C887E] text-[11px]">No active permissions</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            {!isTargetAdmin && (
                              <div className="flex items-center justify-end gap-1.5 font-mono-meta text-xs">
                                <button
                                  onClick={() => {
                                    setEditingEditor(st);
                                    setIsEditorModalOpen(true);
                                  }}
                                  className="bg-[#1C1B18] hover:bg-neutral-800 text-white px-3 py-1 rounded-xs font-mono-meta text-[11px] cursor-pointer"
                                >
                                  Edit Permissions
                                </button>
                                <button
                                  onClick={() => handleRevokeEditorRole(st._id || st.id, st.name)}
                                  disabled={actionLoading === (st._id || st.id)}
                                  className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-xs font-mono-meta text-[11px] cursor-pointer disabled:opacity-50 font-bold"
                                  title="Revoke editor privileges"
                                >
                                  Revoke Editor
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

      </main>

      {/* ========================================== */}
      {/* Modals */}
      {/* ========================================== */}

      {/* Document Viewer Modal */}
      {inspectingDocStudent && (
        <DocumentViewerModal
          isOpen={!!inspectingDocStudent}
          onClose={() => setInspectingDocStudent(null)}
          studentId={inspectingDocStudent._id || inspectingDocStudent.id}
          studentName={inspectingDocStudent.name}
        />
      )}

      {/* Manual Grant Modal */}
      {manualGrantTarget && (
        <ManualGrantModal
          isOpen={!!manualGrantTarget}
          onClose={() => setManualGrantTarget(null)}
          student={manualGrantTarget}
          onSuccess={fetchStudents}
        />
      )}

      {/* Editor Management Modal */}
      {isEditorModalOpen && (
        <EditorManagementModal
          isOpen={isEditorModalOpen}
          onClose={() => setIsEditorModalOpen(false)}
          editor={editingEditor}
          onSuccess={() => {
            fetchStaff();
            fetchStudents();
          }}
        />
      )}

      {/* Publication Detail Modal */}
      {selectedThesisDetail && (
        <PublicationDetailModal
          isOpen={!!selectedThesisDetail}
          onClose={() => setSelectedThesisDetail(null)}
          thesis={selectedThesisDetail}
        />
      )}

      {/* Propose Thesis Modal */}
      {isProposeOpen && (
        <ProposeThesisModal
          isOpen={isProposeOpen}
          onClose={() => setIsProposeOpen(false)}
          onSuccess={() => fetchPublications(1)}
        />
      )}

      {/* Reject Publication Reason Modal */}
      {rejectingThesis && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-xs" onClick={() => setRejectingThesis(null)} />
          <div className="relative bg-white border border-[#D5D1C7] rounded-sm shadow-2xl max-w-md w-full p-6 z-10 font-mono-meta text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8]">
              <h3 className="text-sm font-bold text-red-800">Reject Publication</h3>
              <button onClick={() => setRejectingThesis(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#524F47]">
              Please record a mandatory rejection reason for publication:
              <br />
              <strong className="text-[#1C1B18] font-sans text-sm block mt-1">"{rejectingThesis.title}"</strong>
            </p>

            <form onSubmit={handleRejectPublicationSubmit} className="space-y-3">
              <textarea
                required
                rows="3"
                value={thesisRejectionReason}
                onChange={(e) => setThesisRejectionReason(e.target.value)}
                placeholder="e.g. Incomplete abstract or unverified institutional affiliation..."
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] p-2 rounded-xs focus:outline-none focus:border-[#1C1B18]"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2DFD8]">
                <button
                  type="button"
                  onClick={() => setRejectingThesis(null)}
                  className="px-3 py-1.5 border border-[#D5D1C7] rounded-xs cursor-pointer text-[#737067]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-xs font-bold cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Inspection Modal */}
      {reviewingPayment && (() => {
        const isApproved = reviewingPayment.status === 'approved';
        const isRejected = reviewingPayment.status === 'rejected';
        const isUnderReview = reviewingPayment.status === 'under_review';
        const isPending = reviewingPayment.status === 'submitted' || isUnderReview;
        const durationMonths = reviewingPayment.order?.durationMonths || 6;
        const planName = reviewingPayment.order?.planName || (reviewingPayment.order?.plan === 'pro_max_12m' ? 'Pro Max Annual' : 'Premium Scholarly');

        return (
          <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-[#D5D1C7] rounded-sm max-w-xl w-full p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
              
              <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-pink-50 border border-pink-200 flex items-center justify-center text-pink-700 font-bold text-xs">
                    ৳
                  </div>
                  <div>
                    <h3 className="font-serif-title font-bold text-base text-[#1C1B18]">
                      bKash Transaction Verification Desk
                    </h3>
                    <p className="text-[10px] font-mono-meta text-neutral-500">
                      Merchant Reconciliation & Membership Activation Gate
                    </p>
                  </div>
                </div>
                <button onClick={() => setReviewingPayment(null)} className="cursor-pointer text-neutral-400 hover:text-neutral-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Detail fields */}
              <div className="bg-[#FAF9F5] border border-[#E5E2DA] p-3.5 rounded-sm space-y-1.5 text-xs font-mono-meta">
                <div className="flex justify-between">
                  <span className="text-neutral-500">SCHOLAR:</span>
                  <strong className="text-[#1C1B18]">{reviewingPayment.user?.name} ({reviewingPayment.user?.email})</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">ORDER REF:</span>
                  <span className="text-[#1C1B18]">{reviewingPayment.order?.orderRef || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">CLAIMED TRXID:</span>
                  <strong className="text-purple-950 text-sm">{reviewingPayment.trxId}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">AMOUNT:</span>
                  <strong className="text-emerald-800 text-sm">৳{reviewingPayment.claimedAmountPaisa / 100} BDT</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">DURATION & PLAN:</span>
                  <span className="text-[#1C1B18]">{durationMonths} Calendar Months ({planName})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">SENDER NUMBER:</span>
                  <span className="text-[#1C1B18]">{reviewingPayment.senderNumber || 'Not specified'}</span>
                </div>
              </div>

              {/* Approved status notice */}
              {isApproved && (
                <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-xs space-y-2 text-xs text-emerald-950 font-mono-meta">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span>Payment Verified & Membership Active</span>
                  </div>
                  <p className="text-[12px] text-emerald-900 leading-relaxed font-sans">
                    This payment claim has been reconciled against the bKash merchant statement and verified. The scholar has been granted {durationMonths} calendar months of {planName} access.
                  </p>
                </div>
              )}

              {/* Review Form if pending */}
              {isPending && canReviewPayments && (
                <div className="space-y-3 pt-2">
                  <div
                    onClick={() => setStatementVerified(!statementVerified)}
                    className="p-3 bg-neutral-50 border border-neutral-300 hover:border-neutral-900 rounded-sm flex items-start gap-2.5 cursor-pointer transition select-none"
                  >
                    <div className="mt-0.5">
                      {statementVerified ? (
                        <CheckSquare className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-400" />
                      )}
                    </div>
                    <div className="text-xs">
                      <strong className="text-neutral-900 block">
                        I confirm this transaction is reconciled with the official bKash Merchant Statement.
                      </strong>
                      <span className="text-[11px] text-neutral-500">
                        Checking this box certifies the funds were received into the depository account.
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono-meta text-neutral-700 mb-1">
                      Auditor Review Notes (Optional)
                    </label>
                    <input
                      type="text"
                      value={adminReviewNotes}
                      onChange={(e) => setAdminReviewNotes(e.target.value)}
                      placeholder="e.g. Verified via merchant portal batch #129..."
                      className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-xs font-mono-meta rounded-xs focus:outline-none focus:border-[#1C1B18]"
                    />
                  </div>

                  <div className="pt-2 border-t border-[#E2DFD8] flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRejectPayment(reviewingPayment._id)}
                        disabled={actionLoading === reviewingPayment._id}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-mono-meta font-bold rounded-xs cursor-pointer"
                      >
                        Reject Claim
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestCorrection(reviewingPayment._id)}
                        disabled={actionLoading === reviewingPayment._id}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-mono-meta font-bold rounded-xs cursor-pointer"
                      >
                        Request Update
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApprovePayment(reviewingPayment._id)}
                      disabled={!statementVerified || actionLoading === reviewingPayment._id}
                      className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-mono-meta font-bold rounded-xs cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading === reviewingPayment._id ? 'Activating...' : 'Approve & Activate'}
                    </button>
                  </div>
                </div>
              )}

              {!isPending && (
                <div className="pt-2 border-t border-[#E2DFD8] flex justify-end">
                  <button
                    onClick={() => setReviewingPayment(null)}
                    className="px-4 py-1.5 bg-[#1C1B18] text-white text-xs font-mono-meta rounded-xs cursor-pointer"
                  >
                    Close Record
                  </button>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-4 w-full border-t border-[#E2DFD8] text-center text-xs font-mono-meta text-[#737067]">
        The Thesis Archive • Master Administrative Console
      </footer>

    </div>
  );
}
