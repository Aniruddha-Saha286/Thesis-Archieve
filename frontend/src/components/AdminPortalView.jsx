import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
  Sun,
  Moon,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { getPlanInfo } from '../utils/plan';
import AdminFeedbackPanel from './AdminFeedbackPanel';
import ProposeThesisModal from './ProposeThesisModal';
import PublicationDetailModal from './PublicationDetailModal';
import DocumentViewerModal from './DocumentViewerModal';
import ManualGrantModal from './ManualGrantModal';
import EditorManagementModal from './EditorManagementModal';

const ROSTER_PAGE_SIZE = 25;

export default function AdminPortalView({ onSwitchToStudentPreview }) {
  const { user, logout, isAdmin, isEditor, hasPermission } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { socket, showNotice } = useSocket();

  const canViewStudents = hasPermission('students.view');
  const canVerifyStudents = hasPermission('students.verify');
  const canSuspendStudents = hasPermission('students.suspend');
  const canViewDocuments = hasPermission('documents.view');
  const canViewPayments = hasPermission('payments.view');
  const canReviewPayments = hasPermission('payments.review');
  const canModeratePublications = hasPermission('publications.moderate');
  const canModerateReports = hasPermission('reports.moderate');

  const permittedTabs = useMemo(() => {
    const tabs = [];
    if (canViewStudents) tabs.push('pending', 'roster');
    if (canModeratePublications || isAdmin) tabs.push('publications');
    if (canViewPayments) tabs.push('payments');
    if (canModerateReports) tabs.push('reports', 'feedback');
    if (isAdmin) tabs.push('staff', 'system');
    return tabs;
  }, [canViewStudents, canModeratePublications, canViewPayments, canModerateReports, isAdmin]);

  const [activeTab, setActiveTab] = useState(() => (
    canViewStudents ? 'pending' : (canModeratePublications || isAdmin ? 'publications' : (canViewPayments ? 'payments' : (canModerateReports ? 'reports' : (isAdmin ? 'staff' : 'pending'))))
  ));

  useEffect(() => {
    if (permittedTabs.length > 0 && !permittedTabs.includes(activeTab)) {
      setActiveTab(permittedTabs[0]);
    }
  }, [permittedTabs, activeTab]);

  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const [rosterPage, setRosterPage] = useState(1);
  const [openRowMenuId, setOpenRowMenuId] = useState(null);

  useEscapeToClose(() => setOpenRowMenuId(null), Boolean(openRowMenuId));
  useEffect(() => {
    if (!openRowMenuId) return undefined;
    const close = (e) => {
      if (!e.target.closest || !e.target.closest('[data-row-menu]')) setOpenRowMenuId(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openRowMenuId]);

  const [theses, setTheses] = useState([]);
  const [thesesTotal, setThesesTotal] = useState(0);
  const [pendingThesesCount, setPendingThesesCount] = useState(0);
  const [thesesPage, setThesesPage] = useState(1);
  const [loadingTheses, setLoadingTheses] = useState(false);
  const [searchTheses, setSearchTheses] = useState('');
  const [publicationStatusFilter, setPublicationStatusFilter] = useState('all');
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [selectedThesisDetail, setSelectedThesisDetail] = useState(null);
  const [rejectingThesis, setRejectingThesis] = useState(null);
  const [thesisRejectionReason, setThesisRejectionReason] = useState('');

  const [inspectingDocStudent, setInspectingDocStudent] = useState(null);

  const [manualGrantTarget, setManualGrantTarget] = useState(null);

  const [staffList, setStaffList] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [editingEditor, setEditingEditor] = useState(null);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);

  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [searchPayment, setSearchPayment] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [reviewingPayment, setReviewingPayment] = useState(null);
  const [statementVerified, setStatementVerified] = useState(false);
  const [adminReviewNotes, setAdminReviewNotes] = useState('');

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportFilter, setReportFilter] = useState('pending');

  const [newFeedbackCount, setNewFeedbackCount] = useState(0);
  const handleFeedbackCounts = useCallback((counts) => setNewFeedbackCount((counts && counts.new) || 0), []);

  const [maintenanceState, setMaintenanceState] = useState({ enabled: false, message: '' });
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const [confirmModal, setConfirmModal] = useState(null);
  const [promptModal, setPromptModal] = useState(null);
  const [promptInput, setPromptInput] = useState('');


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

  const fetchPublications = async (page = 1, statusOverride = null) => {
    try {
      setLoadingTheses(true);
      const effectiveStatus = statusOverride !== null ? statusOverride : publicationStatusFilter;
      const res = await axios.get('/api/admin/publications', {
        params: {
          status: effectiveStatus,
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

  const REPORT_TYPE_LABELS = {
    'dead-link': 'Broken link or PDF',
    paywall: 'Link asks for payment',
    'metadata-inaccuracy': 'Wrong title, author or details',
    'retraction-unflagged': 'Retracted or disputed paper',
    'copyright-claim': 'Copyright concern',
    other: 'Other',
  };

  const handleUpdateReport = (report, nextStatus) => {
    const save = async (note) => {
      try {
        const body = { status: nextStatus };
        if (typeof note === 'string' && note.trim()) body.adminNotes = note.trim();
        const res = await axios.put(`/api/admin/reports/${report._id}`, body);
        const updated = res.data?.report;
        setReports((prev) => prev.map((r) => (r._id === report._id ? { ...r, ...(updated || { status: nextStatus }) } : r)));
        showNotice(nextStatus === 'pending' ? 'Report reopened.' : nextStatus === 'resolved' ? 'Report marked as resolved.' : 'Report dismissed.', 'info');
      } catch (err) {
        showNotice(err.response?.data?.message || 'Failed to update the report.', 'error');
      }
    };

    if (nextStatus === 'pending') {
      save('');
      return;
    }
    setPromptInput('');
    setPromptModal({
      title: nextStatus === 'resolved' ? 'Mark report as resolved' : 'Dismiss report',
      message: `"${report.title || 'Publication issue'}". You can add a short note about what was done. The note is optional.`,
      placeholder: nextStatus === 'resolved' ? 'e.g. Replaced the broken PDF link' : 'e.g. Could not reproduce the problem',
      confirmText: nextStatus === 'resolved' ? 'Mark resolved' : 'Dismiss report',
      optional: true,
      onConfirm: save,
    });
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

  const fetchMaintenance = async () => {
    try {
      setLoadingMaintenance(true);
      const res = await axios.get('/api/admin/system/maintenance');
      if (res.data?.maintenance) {
        setMaintenanceState(res.data.maintenance);
      }
    } catch (err) {
      console.error('Error fetching maintenance settings:', err);
    } finally {
      setLoadingMaintenance(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchMaintenance();
    }
  }, [isAdmin]);

  const didInitialLoadRef = useRef(false);
  useEffect(() => {
    if (canViewStudents) fetchStudents();
    if (canModeratePublications || isAdmin) fetchPublications();
    if (canViewPayments) fetchPayments();
    if (canModerateReports) fetchReports();
    if (canModerateReports) {
      axios
        .get('/api/feedback/admin', { params: { status: 'new', limit: 1 } })
        .then((res) => handleFeedbackCounts(res.data?.counts))
        .catch(() => {});
    }
    if (isAdmin) fetchStaff();
  }, []);

  useEffect(() => {
    if (!didInitialLoadRef.current) {
      didInitialLoadRef.current = true;
      return;
    }
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
    } else if (activeTab === 'system') {
      if (isAdmin) fetchMaintenance();
    }
  }, [activeTab]);

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

    const handleMaintenanceEvent = (status) => {
      if (status) setMaintenanceState(status);
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
    socket.on('system:maintenance_changed', handleMaintenanceEvent);

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
      socket.off('system:maintenance_changed', handleMaintenanceEvent);
    };
  }, [socket, canViewStudents, canViewPayments, canModerateReports, canModeratePublications, isAdmin]);


  const handleVerifyStudent = async (studentId, decision) => {
    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/verify-student/${studentId}`, { decision });
      await fetchStudents();
      showNotice(decision === 'approve' ? 'Student verified and approved.' : 'Student application rejected.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Error updating student verification.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBanStudent = (studentId, studentName) => {
    setPromptInput('Violation of depository terms / academic honor policy');
    setPromptModal({
      title: 'Suspend Student Account',
      message: `Enter administrative suspension reason for ${studentName}:`,
      placeholder: 'Suspension reason...',
      confirmText: 'Suspend Account',
      danger: true,
      onConfirm: async (reason) => {
        try {
          setActionLoading(studentId);
          await axios.post(`/api/admin/student/${studentId}/ban`, { reason });
          await fetchStudents();
          showNotice(`Student ${studentName} was suspended.`, 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to suspend student.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleUnbanStudent = async (studentId) => {
    try {
      setActionLoading(studentId);
      await axios.post(`/api/admin/student/${studentId}/unban`);
      await fetchStudents();
      showNotice('Student suspension lifted successfully.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to unban student.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteStudent = (studentId, studentName) => {
    setConfirmModal({
      title: 'Delete Student Account',
      message: `Permanently remove student account for ${studentName}? This action cannot be undone.`,
      confirmText: 'Permanently Delete',
      danger: true,
      onConfirm: async () => {
        try {
          setActionLoading(studentId);
          await axios.delete(`/api/admin/student/${studentId}`);
          await fetchStudents();
          showNotice(`Student account for ${studentName} has been deleted.`, 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to delete student.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleRevokeMembership = (studentId, studentName) => {
    setPromptInput('Trial completed / administrative revocation');
    setPromptModal({
      title: 'Revoke Membership Access',
      message: `Enter reason for revoking membership access for ${studentName}:`,
      placeholder: 'Revocation reason...',
      confirmText: 'Revoke Access',
      danger: true,
      onConfirm: async (reason) => {
        try {
          setActionLoading(studentId);
          await axios.post(`/api/admin/membership/${studentId}/revoke`, {
            reason: (reason || '').trim() || 'Administrative revocation by staff',
          });
          await fetchStudents();
          showNotice(`Membership access revoked for ${studentName}.`, 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to revoke membership access.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleAppointEditorFromStudent = (student) => {
    setEditingEditor({
      ...student,
      role: 'student',
    });
    setIsEditorModalOpen(true);
  };

  const handleRevokeEditorRole = (userId, userName) => {
    setConfirmModal({
      title: 'Revoke Editor Privileges',
      message: `Revoke editor privileges for ${userName}? Account will return to standard student status.`,
      confirmText: 'Revoke Privileges',
      danger: true,
      onConfirm: async () => {
        try {
          setActionLoading(userId);
          await axios.delete(`/api/admin/editors/${userId}`);
          await fetchStudents();
          await fetchStaff();
          showNotice(`Editor privileges revoked for ${userName}.`, 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to revoke editor privileges.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };


  const handleApprovePublication = async (thesisId) => {
    try {
      await axios.put(`/api/admin/publications/${thesisId}/approve`);
      await fetchPublications(thesesPage);
      showNotice('Publication approved and cataloged.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to approve publication.', 'error');
    }
  };

  const handleRejectPublicationSubmit = async (e) => {
    e.preventDefault();
    if (!thesisRejectionReason || !thesisRejectionReason.trim()) {
      showNotice('A mandatory rejection reason is required.', 'error');
      return;
    }

    try {
      await axios.put(`/api/admin/publications/${rejectingThesis._id}/reject`, {
        rejectionReason: thesisRejectionReason.trim(),
      });
      setRejectingThesis(null);
      setThesisRejectionReason('');
      await fetchPublications(thesesPage);
      showNotice('Publication proposal rejected.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to reject publication.', 'error');
    }
  };

  const handleDeletePublication = (thesisId, title) => {
    setConfirmModal({
      title: 'Delete Repository Record',
      message: `Permanently delete "${title}" from the local repository? This action cannot be undone.`,
      confirmText: 'Delete Publication',
      danger: true,
      onConfirm: async () => {
        try {
          await axios.delete(`/api/admin/publications/${thesisId}`);
          await fetchPublications(thesesPage);
          showNotice('Publication removed from repository.', 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to delete publication.', 'error');
        }
      },
    });
  };


  const handleApprovePayment = async (paymentId) => {
    if (!statementVerified) {
      showNotice('Verification requirement: Please reconcile the transaction against the bKash merchant statement first.', 'error');
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
      showNotice('Payment claim verified and membership granted.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to approve payment claim.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayment = (paymentId) => {
    setPromptInput('Transaction ID not found in bKash merchant statement');
    setPromptModal({
      title: 'Reject Payment Claim',
      message: 'Enter reason for rejecting this payment claim (will be sent to student):',
      placeholder: 'Rejection reason...',
      confirmText: 'Reject Claim',
      danger: true,
      onConfirm: async (rejectionReason) => {
        try {
          setActionLoading(paymentId);
          await axios.post(`/api/admin/payments/${paymentId}/reject`, {
            rejectionReason: (rejectionReason || '').trim() || 'Payment details could not be verified in merchant statement.',
          });
          setReviewingPayment(null);
          await fetchPayments();
          showNotice('Payment claim rejected.', 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to reject payment.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleRequestCorrection = (paymentId) => {
    setPromptInput('Please verify your bKash Transaction ID and resubmit.');
    setPromptModal({
      title: 'Request Payment Update',
      message: 'Enter correction instructions for student:',
      placeholder: 'Instructions for student...',
      confirmText: 'Send Request',
      danger: false,
      onConfirm: async (adminInstructions) => {
        try {
          setActionLoading(paymentId);
          await axios.post(`/api/admin/payments/${paymentId}/request-correction`, {
            adminInstructions: (adminInstructions || '').trim() || 'Please verify your bKash transaction and resubmit.',
          });
          setReviewingPayment(null);
          await fetchPayments();
          showNotice('Correction instructions sent to student.', 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to request correction.', 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };


  const handleToggleMaintenance = (newEnabled) => {
    setConfirmModal({
      title: newEnabled ? 'Enable Platform Maintenance Mode' : 'Disable Maintenance Mode',
      message: newEnabled
        ? 'Enabling maintenance mode will immediately lock scholarly search for students and public visitors (returning HTTP 503). Active sessions will receive a real-time push event. Only administrators retain access. Proceed?'
        : 'Disabling maintenance mode will restore public access to federated scholarly search and datasets. Proceed?',
      confirmText: newEnabled ? 'Enable Maintenance Mode' : 'Resume Public Operations',
      danger: newEnabled,
      onConfirm: async () => {
        try {
          setSavingMaintenance(true);
          const res = await axios.put('/api/admin/system/maintenance', {
            enabled: newEnabled,
            message: maintenanceState.message,
          });
          setMaintenanceState(res.data?.maintenance || { enabled: newEnabled, message: maintenanceState.message });
          showNotice(res.data?.message || 'Maintenance settings updated.', 'info');
        } catch (err) {
          showNotice(err.response?.data?.message || 'Failed to update maintenance settings.', 'error');
        } finally {
          setSavingMaintenance(false);
        }
      },
    });
  };

  const handleSaveMaintenanceMessage = async () => {
    try {
      setSavingMaintenance(true);
      const res = await axios.put('/api/admin/system/maintenance', {
        enabled: maintenanceState.enabled,
        message: maintenanceState.message,
      });
      setMaintenanceState(res.data?.maintenance || maintenanceState);
      showNotice('Maintenance notice message saved successfully.', 'info');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to update maintenance notice.', 'error');
    } finally {
      setSavingMaintenance(false);
    }
  };

  const pendingStudents = students.filter((s) => s.status === 'pending' && s.isProfileComplete !== false);
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
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-neutral-950 text-[#1C1B18] dark:text-neutral-100 flex flex-col justify-between transition-colors">
      
      <header className="bg-[#1C1B18] text-[#FAF9F5] border-b border-[#38352E] sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-white text-[#1C1B18] flex items-center justify-center font-serif-title text-xl font-normal">
              §
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif-title text-lg tracking-tight block leading-tight">
                  {isAdmin ? 'Admin console' : 'Staff console'}
                </span>
                <span className={`text-[11px] font-mono-meta font-bold px-1.5 py-0.2 rounded-xs uppercase ${
                  isAdmin ? 'bg-amber-400 text-neutral-950' : 'bg-emerald-400 text-neutral-950'
                }`}>
                  {isAdmin ? 'Administrator' : 'Editor'}
                </span>
              </div>
              <span className="text-[11px] font-mono-meta text-neutral-400 uppercase tracking-wider">
                The Thesis Archive
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
                  <span>New students</span>
                  {pendingStudents.length > 0 && (
                    <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
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
                  <span>Students</span>
                  <span className="text-[11px] opacity-75 font-mono">({students.length})</span>
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
                <span>Theses</span>
                {pendingThesesCount > 0 && (
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
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
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
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
                <span>Reports</span>
                {reports.filter((r) => r.status === 'pending').length > 0 && (
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === 'reports' ? 'bg-neutral-950 text-amber-300' : 'bg-amber-500 text-neutral-950'
                  }`}>
                    {reports.filter((r) => r.status === 'pending').length}
                  </span>
                )}
              </button>
            )}

            {canModerateReports && (
              <button
                onClick={() => setActiveTab('feedback')}
                className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'feedback'
                    ? 'bg-amber-500 text-neutral-950 font-bold'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Feedback</span>
                {newFeedbackCount > 0 && (
                  <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === 'feedback' ? 'bg-neutral-950 text-amber-300' : 'bg-amber-500 text-neutral-950'
                  }`}>
                    {newFeedbackCount}
                  </span>
                )}
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('staff')}
                  className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'staff'
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Team</span>
                </button>

                <button
                  onClick={() => setActiveTab('system')}
                  className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'system'
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>System</span>
                  {maintenanceState?.enabled && (
                    <span className="text-[11px] px-1.5 py-0.2 rounded-full font-mono bg-red-600 text-white font-bold">
                      MAINTENANCE
                    </span>
                  )}
                </button>
              </>
            )}

          </div>

          {/* Right: Open Research Library, Theme Toggle & Sign Out */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-sm border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white transition cursor-pointer"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-neutral-300" />}
            </button>

            <button
              onClick={onSwitchToStudentPreview}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 px-3.5 py-1.5 rounded-xs transition font-mono-meta text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="See the site as students see it"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Open the student site</span>
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
      <main className="tta-light-panel max-w-7xl mx-auto px-4 sm:px-6 py-5 w-full flex-1">
        
        {/* TAB 1: PENDING APPLICANTS */}
        {activeTab === 'pending' && canViewStudents && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title font-semibold text-[#1C1B18]">
                  New students to check
                </h2>
                <p className="text-xs font-mono-meta text-[#737067]">
                  Look at each student's academic details, then approve or decline.
                </p>
              </div>
              <button
                onClick={fetchStudents}
                disabled={loadingStudents}
                className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStudents ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
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
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-xs text-[11px] font-mono-meta font-bold">
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
                          Verification document: Not requested
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
                          <span>Approve</span>
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
        {activeTab === 'roster' && canViewStudents && (() => {
          const totalPages = Math.max(1, Math.ceil(filteredStudents.length / ROSTER_PAGE_SIZE));
          const page = Math.min(rosterPage, totalPages);
          const pageRows = filteredStudents.slice((page - 1) * ROSTER_PAGE_SIZE, page * ROSTER_PAGE_SIZE);

          const statusChip = (s) => (
            <span className="inline-flex items-center gap-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded-xs text-[11px] font-bold uppercase border ${
                s.status === 'approved'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : s.status === 'pending'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-red-100 text-red-900 border-red-300'
              }`}>
                {s.status === 'banned' ? 'suspended' : s.status}
              </span>
              {s.role === 'editor' && (
                <span className="px-1.5 py-0.5 rounded-xs text-[11px] font-bold uppercase bg-purple-100 text-purple-900 border border-purple-300">Editor</span>
              )}
            </span>
          );

          const planCell = (s) => {
            const m = s.membership || {};
            const expiry = m.formattedExpiry ? <div className="text-[11px] text-[#737067] mt-0.5">Until {m.formattedExpiry}</div> : null;
            if (m.source === 'manual_admin') {
              return (
                <div>
                  <span className={`border px-1.5 py-0.5 rounded-xs text-[11px] font-bold ${m.grantType === 'test' ? 'bg-purple-100 text-purple-900 border-purple-300' : 'bg-blue-100 text-blue-900 border-blue-300'}`}>
                    {m.customLabel || m.label || 'Given by admin'}
                  </span>
                  {m.grantReason && <div className="text-[11px] text-[#737067] italic truncate max-w-[180px]" title={m.grantReason}>“{m.grantReason}”</div>}
                  {expiry}
                </div>
              );
            }
            const info = getPlanInfo(m.plan);
            if (info.isPaid || info.isTrial) {
              return (
                <div>
                  <span className={`border px-1.5 py-0.5 rounded-xs text-[11px] font-bold ${info.isTrial ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-emerald-100 text-emerald-900 border-emerald-400'}`}>
                    {info.label}
                  </span>
                  {expiry}
                </div>
              );
            }
            return <span className="text-[11px] text-[#737067] bg-[#FAF9F5] border border-[#D5D1C7] px-1.5 py-0.5 rounded-xs">Free</span>;
          };

          // One clear action per row; everything else is in the row's menu
          const mainAction = (s) => {
            const busy = actionLoading === s._id;
            if (s.status === 'pending' && s.isProfileComplete === false) {
              return <span className="text-[11px] text-neutral-500 italic" title="This person signed in but has not filled in the registration form">Registration not finished</span>;
            }
            if (s.status === 'pending' && canVerifyStudents) {
              return <button type="button" onClick={() => handleVerifyStudent(s._id, 'approve')} disabled={busy} className="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1.5 rounded-xs font-bold text-xs cursor-pointer disabled:opacity-50">Approve</button>;
            }
            if (s.status === 'approved' && canSuspendStudents) {
              return <button type="button" onClick={() => handleBanStudent(s._id, s.name)} disabled={busy} className="bg-white hover:bg-red-50 text-neutral-700 hover:text-red-700 border border-neutral-300 px-2.5 py-1.5 rounded-xs text-xs cursor-pointer disabled:opacity-50">Suspend</button>;
            }
            if (s.status === 'banned' && canSuspendStudents) {
              return <button type="button" onClick={() => handleUnbanStudent(s._id)} disabled={busy} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1.5 rounded-xs text-xs cursor-pointer disabled:opacity-50 font-bold">Reinstate</button>;
            }
            return null;
          };

          const menuItems = (s) => {
            const items = [];
            if (s.hasVerificationDocument || s.idCardProof) items.push({ label: 'View ID card', run: () => setInspectingDocStudent(s) });
            if (isAdmin) {
              items.push({ label: 'Give membership…', run: () => setManualGrantTarget(s) });
              if (s.membership?.plan && s.membership.plan !== 'free') items.push({ label: 'Remove membership', run: () => handleRevokeMembership(s._id, s.name), danger: true });
              if (s.role === 'editor') items.push({ label: 'Remove editor role', run: () => handleRevokeEditorRole(s._id, s.name) });
              // Only an approved student can be made an editor
              else if (s.status === 'approved') items.push({ label: 'Make editor…', run: () => handleAppointEditorFromStudent(s) });
              items.push({ label: 'Delete account', run: () => handleDeleteStudent(s._id, s.name), danger: true });
            }
            return items;
          };

          const rowMenu = (s) => {
            const items = menuItems(s);
            if (items.length === 0) return null;
            const open = openRowMenuId === s._id;
            return (
              <div className="relative inline-block text-left" data-row-menu>
                <button
                  type="button"
                  onClick={() => setOpenRowMenuId(open ? null : s._id)}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-label={`More actions for ${s.name}`}
                  className="p-1.5 border border-[#D5D1C7] rounded-xs bg-white hover:bg-[#F2EFE8] text-[#605D55] cursor-pointer"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {open && (
                  <div role="menu" className="absolute right-0 top-full mt-1 w-48 max-w-[calc(100vw-2rem)] bg-white border border-[#D5D1C7] rounded-sm shadow-xl z-20 py-1 text-xs text-left">
                    {items.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        disabled={actionLoading === s._id}
                        onClick={() => {
                          setOpenRowMenuId(null);
                          item.run();
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-[#FAF9F5] cursor-pointer disabled:opacity-50 ${item.danger ? 'text-red-700' : 'text-[#1C1B18]'}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          };

          return (
            <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2DFD8]">
                <div>
                  <h2 className="text-xl font-serif-title text-[#1C1B18]">Students</h2>
                  <p className="text-xs text-[#737067]">Everyone who has signed up, with account status and membership.</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none sm:w-64">
                    <input
                      type="text"
                      value={searchStudent}
                      onChange={(e) => {
                        setSearchStudent(e.target.value);
                        setRosterPage(1);
                      }}
                      placeholder="Search by name, student ID or email"
                      aria-label="Search students"
                      className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs rounded-xs focus:outline-none focus:border-[#1C1B18]"
                    />
                    <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
                  </div>

                  <div className="flex gap-1 text-xs border border-[#D5D1C7] p-0.5 rounded-xs bg-[#FAF9F5]">
                    {[['all', 'All'], ['approved', 'Approved'], ['pending', 'Pending'], ['banned', 'Suspended']].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setRosterFilter(key);
                          setRosterPage(1);
                        }}
                        aria-pressed={rosterFilter === key}
                        className={`px-2.5 py-1 rounded-xs text-[11px] cursor-pointer transition ${rosterFilter === key ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#737067] hover:text-[#1C1B18]'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadingStudents && students.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#737067]">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading students…
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-10 text-center text-xs text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm">No students match.</div>
              ) : (
                <>
                  {/* Wide screens: a table */}
                  <div className="hidden md:block border border-[#E2DFD8] rounded-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#FAF9F5] border-b border-[#E2DFD8] text-[11px] text-[#605D55] uppercase">
                        <tr>
                          <th className="py-2.5 px-4 font-semibold">Student</th>
                          <th className="py-2.5 px-4 font-semibold">University</th>
                          <th className="py-2.5 px-4 font-semibold">Status</th>
                          <th className="py-2.5 px-4 font-semibold">Membership</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E2DA]">
                        {pageRows.map((s) => (
                          <tr key={s._id} className="hover:bg-[#FAF9F5]/70 transition-colors">
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-[#1C1B18]">{s.name}</div>
                              <div className="text-[11px] text-[#737067] break-all">{s.email}</div>
                            </td>
                            <td className="py-2.5 px-4 text-[12px]">
                              <div className="text-[#1C1B18]">{s.university || 'Not given'}</div>
                              <div className="text-[11px] text-[#8C887E]">ID {s.studentId || 'not given'}{s.degreeProgram ? ` · ${s.degreeProgram}` : ''}</div>
                            </td>
                            <td className="py-2.5 px-4">{statusChip(s)}</td>
                            <td className="py-2.5 px-4">{planCell(s)}</td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {mainAction(s)}
                                {rowMenu(s)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Phones: one card per student, nothing cut off */}
                  <ul className="md:hidden space-y-2.5">
                    {pageRows.map((s) => (
                      <li key={s._id} className="border border-[#E2DFD8] rounded-sm p-3 space-y-2 text-xs bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[#1C1B18]">{s.name}</div>
                            <div className="text-[11px] text-[#737067] break-all">{s.email}</div>
                          </div>
                          {statusChip(s)}
                        </div>
                        <div className="text-[#524F47]">
                          {s.university || 'University not given'} · ID {s.studentId || 'not given'}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F0ECE1]">
                          {planCell(s)}
                          <div className="inline-flex items-center gap-1.5 shrink-0">
                            {mainAction(s)}
                            {rowMenu(s)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-between gap-2 text-xs text-[#605D55]">
                    <span>
                      {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}
                      {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
                    </span>
                    {totalPages > 1 && (
                      <span className="flex items-center gap-2">
                        <button type="button" disabled={page <= 1} onClick={() => setRosterPage(page - 1)} className="px-2.5 py-1 border border-[#D5D1C7] rounded-sm bg-white cursor-pointer disabled:opacity-40">Previous</button>
                        <button type="button" disabled={page >= totalPages} onClick={() => setRosterPage(page + 1)} className="px-2.5 py-1 border border-[#D5D1C7] rounded-sm bg-white cursor-pointer disabled:opacity-40">Next</button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* TAB 3: DEPOSITORY PUBLICATIONS MODERATION */}
        {activeTab === 'publications' && (canModeratePublications || isAdmin) && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">
                  Deposited theses
                </h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Theses students have deposited. Approve a thesis to make it appear in search.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <div className="relative flex-1 min-w-0 sm:flex-none sm:w-64">
                  <input
                    type="text"
                    aria-label="Search deposited theses"
                    value={searchTheses}
                    onChange={(e) => setSearchTheses(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchPublications(1)}
                    placeholder="Search by title or author"
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 pl-8 text-xs font-mono-meta rounded-xs focus:outline-none focus:border-[#1C1B18]"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-2.5 top-2.5" />
                </div>

                <div className="flex gap-1 text-xs font-mono-meta border border-[#D5D1C7] p-0.5 rounded-xs bg-[#FAF9F5] flex-wrap">
                  {['all', 'pending', 'approved', 'rejected'].map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        setPublicationStatusFilter(st);
                        fetchPublications(1, st);
                      }}
                      className={`px-2 py-1 rounded-xs uppercase text-[11px] cursor-pointer transition ${
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
                    <span>Add a thesis</span>
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
                      <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono-meta">
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
                          <code className="break-all">{paper.catalogId || paper._id}</code>
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
                          <strong>Reason given:</strong> "{paper.rejectionReason}"
                        </div>
                      )}
                    </div>

                    {/* Moderation Controls */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap font-mono-meta text-xs">
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
                          title="Delete this thesis for good"
                          aria-label="Delete this thesis"
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
                <h2 className="text-xl font-serif-title text-[#1C1B18]">bKash payments</h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Check each transaction ID against your bKash statement, then approve to start the membership.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchPayments}
                  disabled={loadingPayments}
                  className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPayments ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
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
                  <thead className="bg-[#FAF9F5] border-b border-[#E2DFD8] text-[11px] font-mono-meta text-[#605D55] uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Student and order</th>
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
                            <div className="font-bold text-[#1C1B18]">{sub.user?.name || 'Student'}</div>
                            <div className="text-[11px] font-mono-meta text-[#737067]">{sub.user?.email}</div>
                            <div className="text-[11px] font-mono-meta text-neutral-500">Ref: {sub.order?.orderRef || 'N/A'}</div>
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
                            <div className="text-[11px] text-neutral-500">
                              {sub.order?.durationMonths || 6} Months ({sub.order?.planName || 'Premium'})
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono-meta text-xs">
                            <div>Sender: <strong>{sub.senderNumber || 'Not specified'}</strong></div>
                            <div className="text-[11px] text-neutral-500">
                              {new Date(sub.paymentDateTime || sub.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-xs text-[11px] font-mono-meta font-bold uppercase ${
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
                <h2 className="text-xl font-serif-title text-[#1C1B18]">Reported problems</h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Broken links and wrong details that users reported on a paper.
                </p>
              </div>
              <button
                onClick={fetchReports}
                disabled={loadingReports}
                className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {loadingReports ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-neutral-800 mb-2" />
                Loading reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono-meta text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm">
                No issue reports yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-1 bg-[#FAF9F5] border border-[#D5D1C7] p-1 rounded-sm text-[11px] font-mono-meta w-fit flex-wrap">
                  {[
                    ['all', 'All'],
                    ['pending', 'Pending'],
                    ['resolved', 'Resolved'],
                    ['dismissed', 'Dismissed'],
                  ].map(([key, label]) => {
                    const count = key === 'all' ? reports.length : reports.filter((r) => r.status === key).length;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={reportFilter === key}
                        onClick={() => setReportFilter(key)}
                        className={`px-2.5 py-1 rounded-xs cursor-pointer transition ${
                          reportFilter === key ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#605D55] hover:text-[#1C1B18]'
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>

                {reports.filter((r) => reportFilter === 'all' || r.status === reportFilter).length === 0 && (
                  <div className="p-8 text-center text-xs font-mono-meta text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm">
                    No reports with this status.
                  </div>
                )}

                {reports
                  .filter((r) => reportFilter === 'all' || r.status === reportFilter)
                  .map((r) => (
                    <div key={r._id} className="border border-[#E2DFD8] p-4 rounded-xs bg-[#FAF9F5] space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-bold text-sm text-[#1C1B18] block">{r.title || 'Publication issue'}</span>
                          <span className="text-[11px] font-mono-meta text-[#524F47]">
                            {REPORT_TYPE_LABELS[r.issueType] || r.issueType || 'Other'}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-xs text-[11px] font-mono-meta uppercase font-bold border ${
                            r.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : r.status === 'dismissed'
                              ? 'bg-neutral-100 text-neutral-700 border-neutral-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#524F47] break-words">{r.description}</p>
                      <div className="text-[11px] font-mono-meta text-[#737067] break-all">
                        Reported by: <strong>{r.reportedBy}</strong>
                        {r.createdAt && <> • {new Date(r.createdAt).toLocaleDateString()}</>} • Record ID: <code>{r.recordId}</code>
                      </div>
                      {r.adminNotes && (
                        <div className="text-[11px] text-[#1C1B18] bg-white border border-[#E2DFD8] rounded-xs px-2 py-1.5">
                          <strong>Staff note:</strong> {r.adminNotes}
                          {r.resolvedBy?.name && <span className="text-[#737067]"> ({r.resolvedBy.name})</span>}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 font-mono-meta text-[11px]">
                        {r.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateReport(r, 'resolved')}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 rounded-xs font-bold cursor-pointer"
                            >
                              Mark resolved
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateReport(r, 'dismissed')}
                              className="bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 px-2.5 py-1 rounded-xs cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUpdateReport(r, 'pending')}
                            className="text-[#605D55] hover:text-[#1C1B18] underline cursor-pointer"
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: TEAM & ACCESS (Admin Only) */}
        {activeTab === 'feedback' && canModerateReports && (
          <AdminFeedbackPanel onCountsChange={handleFeedbackCounts} />
        )}

        {activeTab === 'staff' && isAdmin && (
          <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-6 space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#E2DFD8]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18]">Team</h2>
                <p className="text-xs text-[#737067] font-mono-meta">
                  Make a student an editor and choose what each editor may do.
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
                <span>Add an editor</span>
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
                  <thead className="bg-[#FAF9F5] border-b border-[#E2DFD8] text-[11px] font-mono-meta text-[#605D55] uppercase">
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
                            <span className={`px-2 py-0.5 rounded-xs text-[11px] font-mono-meta font-bold uppercase ${
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
                                  <span key={p} className="bg-white border border-[#D5D1C7] text-[#524F47] px-1.5 py-0.5 rounded text-[11px]">
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

        {/* TAB 7: SYSTEM STATUS & MAINTENANCE MODE (Admin Only) */}
        {activeTab === 'system' && isAdmin && (
          <div className="bg-white dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-sm shadow-xs p-6 space-y-6 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
              <div>
                <h2 className="text-xl font-serif-title text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span>Maintenance mode</span>
                </h2>
                <p className="text-xs text-[#737067] dark:text-[#9A968D] font-mono-meta mt-1">
                  Global repository traffic gates, upstream protection, and public availability controls.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchMaintenance}
                  disabled={loadingMaintenance}
                  className="px-3 py-1.5 bg-[#FAF9F5] dark:bg-[#1E1D1A] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-xs font-mono-meta rounded-xs text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMaintenance ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Current Status Card */}
            <div className={`p-5 rounded-sm border ${
              maintenanceState.enabled
                ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${maintenanceState.enabled ? 'bg-red-600 animate-pulse' : 'bg-emerald-600'}`} />
                    <span className="font-serif-title font-bold text-base text-[#1C1B18] dark:text-[#F0EDE6]">
                      {maintenanceState.enabled ? 'MAINTENANCE MODE IS CURRENTLY ACTIVE' : 'SYSTEM IS FULLY OPERATIONAL'}
                    </span>
                  </div>
                  <p className="text-xs font-mono-meta text-[#524F47] dark:text-[#A8A49C]">
                    {maintenanceState.enabled
                      ? 'Public and student search queries are currently returning HTTP 503 (Maintenance). Quota counters are paused. Only administrators retain system access.'
                      : 'All student accounts and public visitors have normal access to federated search, datasets, and catalog services.'}
                  </p>
                  {maintenanceState.updatedAt && (
                    <div className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9A968D] pt-1">
                      Last toggled: {new Date(maintenanceState.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => handleToggleMaintenance(!maintenanceState.enabled)}
                    disabled={savingMaintenance}
                    className={`px-5 py-2.5 rounded-sm text-xs font-mono-meta font-bold cursor-pointer transition shadow-2xs ${
                      maintenanceState.enabled
                        ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                        : 'bg-red-700 hover:bg-red-800 text-white'
                    }`}
                  >
                    {savingMaintenance
                      ? 'Updating System...'
                      : maintenanceState.enabled
                      ? 'Resume Public Operations'
                      : 'Enable Maintenance Mode'}
                  </button>
                </div>
              </div>
            </div>

            {/* Maintenance Notice Configuration */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-mono-meta font-bold uppercase tracking-wider text-[#1C1B18] dark:text-[#F0EDE6]">
                Maintenance Notice Message (Public Facing)
              </label>
              <p className="text-xs text-[#737067] dark:text-[#9A968D]">
                This explanation will be displayed to scholars, students, and visitors when maintenance mode is active:
              </p>
              <textarea
                rows="3"
                value={maintenanceState.message || ''}
                onChange={(e) => setMaintenanceState((prev) => ({ ...prev, message: e.target.value }))}
                placeholder="The Thesis Archive is currently undergoing scheduled platform upgrades and database maintenance..."
                className="w-full bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] p-3 text-xs font-mono-meta text-[#1C1B18] dark:text-[#F0EDE6] rounded-xs focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveMaintenanceMessage}
                  disabled={savingMaintenance}
                  className="px-4 py-2 bg-[#1C1B18] hover:bg-black dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 text-xs font-mono-meta font-bold rounded-xs cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {savingMaintenance ? 'Saving...' : 'Save Public Notice'}
                </button>
              </div>
            </div>

            {/* Policy & Operational Invariants */}
            <div className="pt-4 border-t border-[#E2DFD8] dark:border-[#2C2A26] space-y-2 text-xs font-mono-meta text-[#737067] dark:text-[#9A968D]">
              <div className="font-bold text-[#1C1B18] dark:text-[#F0EDE6] uppercase tracking-wider text-[11px]">
                Platform Maintenance Invariants:
              </div>
              <ul className="list-disc pl-5 space-y-1 text-[11px] leading-relaxed">
                <li>Non-admin searches and dataset inquiries are rejected with <code>503 Service Unavailable</code> before any quota is consumed.</li>
                <li>Exempt routes (<code>/api/system/status</code>, <code>/api/health</code>, <code>/api/auth/*</code>) remain active so administrators can log in.</li>
                <li>Changes are persisted to MongoDB and broadcasted instantaneously over WebSocket to all open client sessions.</li>
                <li>Admin operations within the management console are never interrupted.</li>
              </ul>
            </div>

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
        const planName = reviewingPayment.order?.planName || (reviewingPayment.order?.plan === 'pro_max_12m' ? 'Pro Max' : 'Premium');

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
                    <p className="text-[11px] font-mono-meta text-neutral-500">
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

      {/* In-App Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#38352F] rounded-sm shadow-2xl max-w-md w-full p-6 z-10 font-mono-meta text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
              <h3 className={`text-sm font-bold ${confirmModal.danger ? 'text-red-700 dark:text-red-400' : 'text-[#1C1B18] dark:text-[#F0EDE6]'}`}>
                {confirmModal.title}
              </h3>
              <button onClick={() => setConfirmModal(null)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18] dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#524F47] dark:text-[#A8A49C] text-xs leading-relaxed font-sans">
              {confirmModal.message}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26]">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 border border-[#D5D1C7] dark:border-[#38352F] rounded-xs cursor-pointer text-[#737067] dark:text-[#9A968D] hover:bg-[#F2EFE8] dark:hover:bg-[#282622]"
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
                  confirmModal.danger
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-[#1C1B18] hover:bg-black dark:bg-amber-400 dark:text-neutral-950'
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
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs" onClick={() => setPromptModal(null)} />
          <div className="relative bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#38352F] rounded-sm shadow-2xl max-w-md w-full p-6 z-10 font-mono-meta text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
              <h3 className={`text-sm font-bold ${promptModal.danger ? 'text-red-700 dark:text-red-400' : 'text-[#1C1B18] dark:text-[#F0EDE6]'}`}>
                {promptModal.title}
              </h3>
              <button onClick={() => setPromptModal(null)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18] dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#524F47] dark:text-[#A8A49C] text-xs leading-relaxed font-sans">
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
                required={!promptModal.optional}
                rows="3"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder={promptModal.placeholder || 'Enter details...'}
                className="w-full bg-[#FAF9F5] dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#38352F] p-2 text-xs font-mono-meta rounded-xs text-[#1C1B18] dark:text-[#F0EDE6] focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26]">
                <button
                  type="button"
                  onClick={() => setPromptModal(null)}
                  className="px-3 py-1.5 border border-[#D5D1C7] dark:border-[#38352F] rounded-xs cursor-pointer text-[#737067] dark:text-[#9A968D] hover:bg-[#F2EFE8] dark:hover:bg-[#282622]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 rounded-xs font-bold cursor-pointer text-white ${
                    promptModal.danger
                      ? 'bg-red-700 hover:bg-red-800'
                      : 'bg-[#1C1B18] hover:bg-black dark:bg-amber-400 dark:text-neutral-950'
                  }`}
                >
                  {promptModal.confirmText || 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-4 w-full border-t border-[#E2DFD8] dark:border-neutral-800 text-center text-xs text-[#737067] dark:text-neutral-500">
        The Thesis Archive · Staff console
      </footer>

    </div>
  );
}
