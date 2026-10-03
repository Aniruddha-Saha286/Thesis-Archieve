import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import axios from 'axios';
import Header from './components/Header';
import AdminDesk from './components/AdminDesk';
import VerificationDrawer from './components/VerificationDrawer';
import ThesisCard from './components/ThesisCard';
import ProposeThesisModal from './components/ProposeThesisModal';
import CiteModal from './components/CiteModal';
import PublicationDetailModal from './components/PublicationDetailModal';
import StudentManagementModal from './components/StudentManagementModal';
import LoginView from './components/LoginView';
import StudentRegistrationView from './components/StudentRegistrationView';
import PendingView from './components/PendingView';
import AdminPortalView from './components/AdminPortalView';
import SavedPapersModal from './components/SavedPapersModal';
import CollectionsModal from './components/CollectionsModal';
import ComparisonMatrixModal from './components/ComparisonMatrixModal';
import TopicAlertsModal from './components/TopicAlertsModal';
import ReportIssueModal from './components/ReportIssueModal';
import MembershipModal from './components/MembershipModal';
import AuthorProfileModal from './components/AuthorProfileModal';
import InstitutionLandscapeModal from './components/InstitutionLandscapeModal';
import CoverageModal from './components/CoverageModal';
import DiscoveryFiltersPanel from './components/DiscoveryFiltersPanel';
import LibraryHub from './components/LibraryHub';
import DiscoverSearchBar from './components/DiscoverSearchBar';
import {
  Filter,
  Building2,
  Globe,
  Users,
  Shield,
  ArrowLeft,
  Search,
  Plus,
  Scale,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle2,
  FileText,
  AlertTriangle,
  X,
  Database,
  ExternalLink,
  Sparkles,
  Bookmark,
  Folder,
  RefreshCw,
} from 'lucide-react';

const DEFAULT_CATEGORIES = [
  { id: '', label: 'All Disciplines', shortLabel: 'All Disciplines' },
  { id: 'cybersecurity', label: 'Cybersecurity / Information Security', shortLabel: 'Cybersecurity' },
  { id: 'data-science', label: 'Data Science / Data Analytics', shortLabel: 'Data Science' },
  { id: 'ai-ml', label: 'Artificial Intelligence and Machine Learning', shortLabel: 'AI & ML' },
  { id: 'nlp', label: 'Natural Language Processing', shortLabel: 'NLP' },
  { id: 'computer-vision', label: 'Computer Vision', shortLabel: 'Computer Vision' },
  { id: 'software-engineering', label: 'Software Engineering', shortLabel: 'Software Eng.' },
  { id: 'networks-distributed', label: 'Computer Networks and Distributed Systems', shortLabel: 'Networks' },
  { id: 'databases', label: 'Databases and Data Management', shortLabel: 'Databases' },
  { id: 'hci', label: 'Human–Computer Interaction', shortLabel: 'HCI' },
  { id: 'iot-embedded', label: 'Internet of Things and Embedded Systems', shortLabel: 'IoT & Embedded' },
  { id: 'renewable-energy', label: 'Renewable Energy & Materials', shortLabel: 'Renewable Energy' },
  { id: 'biomedical', label: 'Biomedical & Clinical Science', shortLabel: 'Biomedical' },
  { id: 'agriculture', label: 'Agricultural Systems & Soil', shortLabel: 'Agriculture' },
  { id: 'development-economics', label: 'Development Economics', shortLabel: 'Economics' },
  { id: 'other', label: 'Other Disciplines / Unclassified', shortLabel: 'Other Disciplines' },
];

export default function App() {
  const { user, loading, isAuthenticated, needsRegistration, isApproved, isPending, isAdmin, isEditor, isStaff, hasPermission, logout } = useAuth();
  const { socket, isConnected, realtimeNotice, clearRealtimeNotice, showNotice } = useSocket();

  // Search & Filtering State
  const [searchMode, setSearchMode] = useState('publications'); // 'publications' | 'authors'
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [searchContextId, setSearchContextId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All Disciplines');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [selectedFieldName, setSelectedFieldName] = useState('');
  const [subjectsList, setSubjectsList] = useState(DEFAULT_CATEGORIES);
  const [selectedInstitution, setSelectedInstitution] = useState(null);
  const [institutionMode, setInstitutionMode] = useState('affiliation');
  const [academicOnly, setAcademicOnly] = useState(true);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [minCitations, setMinCitations] = useState('');
  const [sortOrder, setSortOrder] = useState('relevance');
  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState(null);
  const [inspectingAuthor, setInspectingAuthor] = useState(null);
  const [selectedPublisher, setSelectedPublisher] = useState('');
  const [selectedPublicationType, setSelectedPublicationType] = useState('all');
  const [hasPdfOnly, setHasPdfOnly] = useState(false);
  const [isOpenAccessOnly, setIsOpenAccessOnly] = useState(false);
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [draftYearMin, setDraftYearMin] = useState('');
  const [draftYearMax, setDraftYearMax] = useState('');
  const [totalTechnicalFailure, setTotalTechnicalFailure] = useState(false);
  const [partialResults, setPartialResults] = useState(false);
  const [isCoverageOpen, setIsCoverageOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [paperLimit, setPaperLimit] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const [totalReturned, setTotalReturned] = useState(0);

  // Data State
  const [theses, setTheses] = useState([]);
  const [publishersList, setPublishersList] = useState([]);
  const [providerTelemetry, setProviderTelemetry] = useState({});
  const [loadingTheses, setLoadingTheses] = useState(false);
  const currentRequestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  // Research Workspace State
  const [savedPapersCount, setSavedPapersCount] = useState(0);
  const [comparisonPapers, setComparisonPapers] = useState([]);

  // Modals
  const [isSavedPapersOpen, setIsSavedPapersOpen] = useState(false);
  const [isCollectionsOpen, setIsCollectionsOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isTopicAlertsOpen, setIsTopicAlertsOpen] = useState(false);
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [citingThesis, setCitingThesis] = useState(null);
  const [selectedDetailThesis, setSelectedDetailThesis] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState('overview');
  const [reportingThesis, setReportingThesis] = useState(null);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [membershipPlan, setMembershipPlan] = useState('free');
  const [searchQuota, setSearchQuota] = useState(null);
  const [searchQuotaError, setSearchQuotaError] = useState(null);
  const [inspectingLandscapeInst, setInspectingLandscapeInst] = useState(null);

  // Primary Navigation Tabs: 'discover' | 'datasets' | 'library'
  const [activeTab, setActiveTab] = useState('discover');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Provider Telemetry Details Drawer
  const [showProviderDetails, setShowProviderDetails] = useState(false);

  // Global Open Science Dataset Discovery State (DataCite & Zenodo)
  const [datasetQuery, setDatasetQuery] = useState('');
  const [datasetInput, setDatasetInput] = useState('');
  const [datasetsList, setDatasetsList] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [datasetPage, setDatasetPage] = useState(1);
  const [hasMoreDatasets, setHasMoreDatasets] = useState(false);

  // System Status & Maintenance Mode State
  const [systemMaintenance, setSystemMaintenance] = useState({ enabled: false, message: '' });
  const [checkingMaintenance, setCheckingMaintenance] = useState(true);

  // Admin state & view mode
  const [adminPreviewStudentView, setAdminPreviewStudentView] = useState(false);
  const [pendingStudents, setPendingStudents] = useState([]);
  const [evaluating, setEvaluating] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isStudentManagementOpen, setIsStudentManagementOpen] = useState(false);

  // Load Subject Disciplines Catalog
  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const res = await axios.get('/api/subjects');
        if (Array.isArray(res.data) && res.data.length > 0) {
          setSubjectsList([{ id: '', label: 'All Disciplines', shortLabel: 'All Disciplines' }, ...res.data]);
        }
      } catch (err) {
        console.warn('Using default subjects catalog:', err.message);
      }
    };
    loadSubjects();
  }, []);

  useEffect(() => {
    setDraftYearMin(yearMin);
  }, [yearMin]);

  useEffect(() => {
    setDraftYearMax(yearMax);
  }, [yearMax]);

  const commitYearMin = (val) => {
    const trimmed = String(val || '').trim();
    if (!trimmed) {
      if (yearMin !== '') {
        setYearMin('');
        setCurrentPage(1);
      }
    } else if (/^\d{4}$/.test(trimmed)) {
      if (yearMin !== trimmed) {
        setYearMin(trimmed);
        setCurrentPage(1);
      }
    }
  };

  const commitYearMax = (val) => {
    const trimmed = String(val || '').trim();
    if (!trimmed) {
      if (yearMax !== '') {
        setYearMax('');
        setCurrentPage(1);
      }
    } else if (/^\d{4}$/.test(trimmed)) {
      if (yearMax !== trimmed) {
        setYearMax(trimmed);
        setCurrentPage(1);
      }
    }
  };

  // ==========================================
  // Fetcher Functions
  // ==========================================

  const fetchTheses = async (pageOverride) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const requestId = ++currentRequestIdRef.current;
    try {
      setLoadingTheses(true);
      const params = {};
      const activePage = pageOverride !== undefined ? pageOverride : currentPage;

      if (selectedCategory && selectedCategory !== 'All Disciplines') {
        params.category = selectedCategory;
      }
      if (searchQuery && searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      if (selectedPublisher && selectedPublisher.trim()) {
        params.publisher = selectedPublisher.trim();
      }
      if (selectedPublicationType && selectedPublicationType !== 'all') {
        params.publicationType = selectedPublicationType;
      }
      if (hasPdfOnly) {
        params.hasPdf = 'true';
      }
      if (isOpenAccessOnly) {
        params.isOpenAccess = 'true';
      }
      if (yearMin) params.yearMin = yearMin;
      if (yearMax) params.yearMax = yearMax;

      if (selectedSubjectId) {
        params.subjectId = selectedSubjectId;
      }
      if (selectedFieldId) {
        params.fieldId = selectedFieldId;
      }
      if (selectedInstitution) {
        if (selectedInstitution.id) params.institutionId = selectedInstitution.id;
        if (selectedInstitution.name) params.institutionName = selectedInstitution.name;
        params.institutionMode = institutionMode;
      }
      if (selectedCountries.length > 0) {
        params.countryCodes = selectedCountries.join(',');
      }
      if (selectedAuthorFilter?.id) {
        params.authorId = selectedAuthorFilter.id;
      }
      if (minCitations) {
        params.minCitations = minCitations;
      }
      params.sort = sortOrder;

      params.page = activePage;
      params.limit = paperLimit;
      if (sessionId) {
        params.sessionId = sessionId;
      }
      if (searchContextId) {
        params.searchContextId = searchContextId;
      }

      const res = await axios.get('/api/thesis', {
        params,
        signal: abortController.signal,
      });

      if (requestId === currentRequestIdRef.current) {
        if (Array.isArray(res.data)) {
          setTheses(res.data);
          setTotalReturned(res.data.length);
          setHasMore(res.data.length >= paperLimit);
          setTotalTechnicalFailure(false);
          setPartialResults(false);
        } else {
          setTheses(res.data.records || []);
          setTotalReturned(res.data.records?.length || 0);
          setHasMore(Boolean(res.data.pagination?.hasMore));
          setProviderTelemetry(res.data.providerStatus || {});
          setTotalTechnicalFailure(Boolean(res.data.totalTechnicalFailure));
          setPartialResults(Boolean(res.data.partialResults));
          if (res.data.sessionId) {
            setSessionId(res.data.sessionId);
          }
          if (res.data.searchContextId) {
            setSearchContextId(res.data.searchContextId);
          }
          if (res.data.searchQuota) {
            setSearchQuota(res.data.searchQuota);
          }
        }
        setSearchQuotaError(null);
      }
    } catch (err) {
      if (axios.isCancel(err) || err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }
      if (requestId === currentRequestIdRef.current) {
        console.error('Error fetching theses:', err);
        if (err.response?.status === 503 || err.response?.data?.code === 'MAINTENANCE_MODE') {
          setSystemMaintenance({
            enabled: true,
            message: err.response.data?.message || 'Scheduled platform maintenance is in progress.',
          });
        } else if (err.response?.data?.code === 'SEARCH_QUOTA_EXCEEDED') {
          setSearchQuotaError(err.response.data);
        }
      }
    } finally {
      if (requestId === currentRequestIdRef.current) {
        setLoadingTheses(false);
      }
    }
  };

  const fetchPublishers = async () => {
    try {
      const res = await axios.get('/api/thesis/publishers/list');
      setPublishersList(res.data);
    } catch (err) {
      console.error('Error fetching publishers list:', err);
    }
  };

  const fetchGlobalDatasets = async (pageOverride) => {
    try {
      setLoadingDatasets(true);
      const activePage = pageOverride !== undefined ? pageOverride : datasetPage;
      const res = await axios.get('/api/datasets', {
        params: {
          q: datasetQuery.trim() || 'research dataset',
          page: activePage,
          limit: 15,
        },
      });
      setDatasetsList(res.data.datasets || []);
      setHasMoreDatasets(Boolean(res.data.pagination?.hasMore));
    } catch (err) {
      if (err.response?.status === 503 || err.response?.data?.code === 'MAINTENANCE_MODE') {
        setSystemMaintenance({
          enabled: true,
          message: err.response.data?.message || 'Scheduled platform maintenance is in progress.',
        });
      }
      console.error('Error fetching global datasets:', err);
    } finally {
      setLoadingDatasets(false);
    }
  };

  const fetchUserSavedCount = async () => {
    try {
      const res = await axios.get('/api/user/saved-papers');
      setSavedPapersCount(res.data?.length || 0);
    } catch (err) {
      // User not authenticated or token expired
    }
  };

  const fetchMembershipStatus = async () => {
    try {
      const res = await axios.get('/api/membership/status');
      setMembershipPlan(res.data?.entitlements?.plan || 'free');
    } catch (err) {
      // User not authenticated or token expired
    }
  };

  const fetchPendingStudents = async () => {
    try {
      const res = await axios.get('/api/admin/pending-students');
      setPendingStudents(res.data);
    } catch (err) {
      console.error('Error fetching pending students:', err);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const res = await axios.get('/api/system/status');
      setSystemMaintenance({
        enabled: Boolean(res.data?.enabled ?? res.data?.maintenance),
        message: res.data?.message || '',
      });
    } catch (err) {
      // Keep existing state if network check fails
    } finally {
      setCheckingMaintenance(false);
    }
  };

  const handleEvaluateStudent = async (studentId, decision) => {
    try {
      setEvaluating(true);
      await axios.post(`/api/admin/verify-student/${studentId}`, { decision });
      await fetchPendingStudents();
    } catch (err) {
      if (showNotice) {
        showNotice(err.response?.data?.message || 'Error updating student evaluation.', 'error');
      }
    } finally {
      setEvaluating(false);
    }
  };

  // ==========================================
  // Synchronization Effects
  // ==========================================

  // Fetch theses whenever user is approved and search criteria changes
  useEffect(() => {
    if (isApproved) {
      fetchTheses();
    }
  }, [
    isApproved,
    selectedCategory,
    selectedSubjectId,
    selectedFieldId,
    selectedInstitution,
    institutionMode,
    academicOnly,
    selectedCountries,
    selectedAuthorFilter,
    minCitations,
    sortOrder,
    searchQuery,
    selectedPublisher,
    selectedPublicationType,
    hasPdfOnly,
    isOpenAccessOnly,
    yearMin,
    yearMax,
    currentPage,
    paperLimit,
  ]);

  // Fetch publishers directory
  useEffect(() => {
    if (isApproved) {
      fetchPublishers();
    }
  }, [isApproved]);

  // Fetch staff pending tasks if admin or editor with students.view permission
  useEffect(() => {
    if (isAdmin || (isEditor && hasPermission('students.view'))) {
      fetchPendingStudents();
    }
  }, [isAdmin, isEditor, hasPermission]);

  // Fetch saved papers count and membership status if user is authenticated and approved
  useEffect(() => {
    if (isApproved) {
      fetchUserSavedCount();
      fetchMembershipStatus();
    }
  }, [isApproved]);

  useEffect(() => {
    if (activeTab === 'datasets') {
      fetchGlobalDatasets();
    }
  }, [activeTab, datasetQuery, datasetPage]);

  // Real-time WebSocket synchronization for catalog and administrative states
  useEffect(() => {
    if (!socket) return;

    const handleThesisCreated = (newThesis) => {
      if (isApproved) {
        setTheses((prev) => [
          newThesis,
          ...prev.filter((t) => (t._id || t.id) !== (newThesis._id || newThesis.id)),
        ]);
      }
    };

    const handleThesisUpdated = (updatedThesis) => {
      setTheses((prev) =>
        prev.map((t) =>
          ((t._id || t.id) === (updatedThesis._id || updatedThesis.id) ? { ...t, ...updatedThesis } : t)
        )
      );
    };

    const handleThesisPinned = ({ thesisId, isPinned }) => {
      setTheses((prev) =>
        prev.map((t) => ((t._id || t.id) === thesisId ? { ...t, isPinned } : t))
      );
    };

    const handleThesisDeleted = ({ thesisId }) => {
      setTheses((prev) => prev.filter((t) => (t._id || t.id) !== thesisId));
    };

    const handleAdminUpdate = () => {
      if (isAdmin || (isEditor && hasPermission('students.view'))) {
        fetchPendingStudents();
      }
    };

    const handleMembershipUpdate = () => {
      fetchMembershipStatus();
    };

    const handleMaintenanceChanged = (status) => {
      if (status) {
        setSystemMaintenance({
          enabled: Boolean(status.enabled ?? status.maintenance),
          message: status.message || '',
        });
      }
    };

    socket.on('thesis:created', handleThesisCreated);
    socket.on('thesis:updated', handleThesisUpdated);
    socket.on('thesis:pinned', handleThesisPinned);
    socket.on('thesis:deleted', handleThesisDeleted);
    socket.on('admin:new_student_application', handleAdminUpdate);
    socket.on('admin:student_profile_updated', handleAdminUpdate);
    socket.on('admin:student_updated', handleAdminUpdate);
    socket.on('membership:updated', handleMembershipUpdate);
    socket.on('system:maintenance_changed', handleMaintenanceChanged);

    return () => {
      socket.off('thesis:created', handleThesisCreated);
      socket.off('thesis:updated', handleThesisUpdated);
      socket.off('thesis:pinned', handleThesisPinned);
      socket.off('thesis:deleted', handleThesisDeleted);
      socket.off('admin:new_student_application', handleAdminUpdate);
      socket.off('admin:student_profile_updated', handleAdminUpdate);
      socket.off('admin:student_updated', handleAdminUpdate);
      socket.off('membership:updated', handleMembershipUpdate);
      socket.off('system:maintenance_changed', handleMaintenanceChanged);
    };
  }, [socket, isApproved, isAdmin, isEditor, hasPermission]);

  useEffect(() => {
    fetchSystemStatus();
  }, []);

  const handleToggleCompare = (paper) => {
    const paperId = paper._id || paper.id || paper.paperId;
    setComparisonPapers((prev) => {
      const exists = prev.some((p) => (p._id || p.id || p.paperId) === paperId);
      if (exists) {
        return prev.filter((p) => (p._id || p.id || p.paperId) !== paperId);
      } else {
        if (prev.length >= 5) {
          if (showNotice) {
            showNotice('Comparison Limit: You can compare a maximum of 5 publications simultaneously in the synthesis matrix.', 'info');
          }
          return prev;
        }
        return [...prev, paper];
      }
    });
  };

  const hasAnyActiveFilter = Boolean(
    searchQuery ||
    selectedCategory !== 'All Disciplines' ||
    selectedSubjectId ||
    selectedFieldId ||
    selectedPublicationType !== 'all' ||
    selectedPublisher ||
    selectedInstitution ||
    selectedCountries.length > 0 ||
    selectedAuthorFilter ||
    minCitations ||
    sortOrder !== 'relevance' ||
    hasPdfOnly ||
    isOpenAccessOnly ||
    yearMin ||
    yearMax
  );

  const activeFilterCount = [
    Boolean(selectedCategory !== 'All Disciplines' || selectedSubjectId || selectedFieldId),
    Boolean(selectedInstitution),
    selectedCountries.length > 0,
    Boolean(selectedAuthorFilter),
    Boolean(minCitations),
    sortOrder !== 'relevance',
    selectedPublicationType !== 'all',
    hasPdfOnly,
    isOpenAccessOnly,
    Boolean(yearMin || yearMax),
    Boolean(selectedPublisher),
    Boolean(searchQuery),
  ].filter(Boolean).length;

  const clearCategoryFilter = () => {
    setSelectedCategory('All Disciplines');
    setSelectedSubjectId('');
    setSelectedFieldId('');
    setSelectedFieldName('');
    setSessionId(null);
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setSelectedCategory('All Disciplines');
    setSelectedSubjectId('');
    setSelectedFieldId('');
    setSelectedFieldName('');
    setSelectedInstitution(null);
    setInstitutionMode('affiliation');
    setSelectedCountries([]);
    setSelectedAuthorFilter(null);
    setMinCitations('');
    setSortOrder('relevance');
    setSelectedPublisher('');
    setSelectedPublicationType('all');
    setSearchQuery('');
    setHasPdfOnly(false);
    setIsOpenAccessOnly(false);
    setYearMin('');
    setYearMax('');
    setDraftYearMin('');
    setDraftYearMax('');
    setTotalTechnicalFailure(false);
    setPartialResults(false);
    setSessionId(null);
    setSearchContextId(null);
    setCurrentPage(1);
  };

  const handleThesisCreated = () => {
    fetchTheses(1);
    fetchPublishers();
  };

  const handleThesisDeleted = (deletedId) => {
    setTheses((prev) => prev.filter((t) => (t._id || t.id) !== deletedId));
  };

  const handleThesisPinned = (pinnedId, isPinned) => {
    setTheses((prev) =>
      prev.map((t) => ((t._id || t.id) === pinnedId ? { ...t, isPinned } : t))
    );
  };

  // 1. Initial Auth Check Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0E0D0C] text-[#1C1B18] dark:text-[#E8E6E1] flex items-center justify-center font-mono-meta text-xs transition-colors">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] dark:bg-amber-400 text-[#FAF9F5] dark:text-neutral-950 flex items-center justify-center font-serif-title text-xl mx-auto animate-pulse">
            §
          </div>
          <div>Loading Academic Depository Session...</div>
        </div>
      </div>
    );
  }

  // 2. Strict Access Gate: Without sign-in, anonymous visitors see the normal login page
  if (!isAuthenticated) {
    return <LoginView />;
  }

  // 3. Maintenance Gate: If maintenance mode is active and user is not an administrator
  if (systemMaintenance.enabled && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0E0D0C] text-[#1C1B18] dark:text-[#E8E6E1] flex flex-col justify-center items-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 flex items-center justify-center mx-auto text-amber-800 dark:text-amber-300 shadow-xs">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-serif-title font-medium tracking-tight text-[#1C1B18] dark:text-[#F0EDE6]">
              The Thesis Archive
            </h1>
            <p className="text-xs font-mono-meta font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest">
              MAINTENANCE IN PROGRESS
            </p>
          </div>
          <div className="p-4 bg-white dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm text-xs text-[#524F47] dark:text-[#A8A49C] leading-relaxed font-light">
            {systemMaintenance.message || 'The Thesis Archive is currently undergoing scheduled platform upgrades and database maintenance. Search queries and catalog access are temporarily paused to protect data integrity.'}
          </div>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={fetchSystemStatus}
              className="w-full sm:w-auto px-4 py-2 bg-[#1C1B18] hover:bg-black dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 text-xs font-mono-meta font-bold rounded-sm cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check System Status</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-[#1E1D1A] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] text-xs font-mono-meta rounded-sm cursor-pointer transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Post-Signin Student Academic Registration (if profile is incomplete)
  if (needsRegistration) {
    return <StudentRegistrationView />;
  }

  // 5. Verification Gate: If student account is awaiting verification, banned, or rejected
  if (!isApproved) {
    return <PendingView />;
  }

  // 6. Dedicated Staff / Admin Portal: If user is staff (admin or editor) and not previewing student view
  if (isStaff && !adminPreviewStudentView) {
    return <AdminPortalView onSwitchToStudentPreview={() => setAdminPreviewStudentView(true)} />;
  }

  // 7. Authenticated & Approved: Renders the Full Scholarly Discovery Repository & Workspace
  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0E0D0C] text-[#1C1B18] dark:text-[#E8E6E1] flex flex-col justify-between transition-colors duration-150">
      <div>
        {/* Real-time Push Notification Alert */}
        {realtimeNotice && (
          <div
            className={`p-3 px-6 text-xs font-mono-meta flex items-center justify-between border-b transition ${
              realtimeNotice.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2
                className={`w-4 h-4 shrink-0 ${
                  realtimeNotice.type === 'error' ? 'text-red-600' : 'text-emerald-600'
                }`}
              />
              <span>{realtimeNotice.message}</span>
            </div>
            <button
              onClick={clearRealtimeNotice}
              className="p-1 hover:opacity-75 cursor-pointer text-neutral-600"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Admin Maintenance Mode Active Notice */}
        {systemMaintenance.enabled && isAdmin && (
          <div className="bg-amber-500 text-neutral-950 px-6 py-2 flex items-center justify-between text-xs font-mono-meta font-bold border-b border-amber-600 sticky top-0 z-50 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-neutral-950 shrink-0" />
              <span>
                SYSTEM NOTICE: Maintenance Mode is currently ACTIVE. Public/student access is paused. You have administrator bypass access.
              </span>
            </div>
            {adminPreviewStudentView && (
              <button
                onClick={() => setAdminPreviewStudentView(false)}
                className="bg-neutral-950 hover:bg-neutral-900 text-amber-300 px-3 py-1 rounded-xs transition cursor-pointer text-[11px]"
              >
                Return to Admin Console
              </button>
            )}
          </div>
        )}

        {/* Top Preview Banner (Shown if Admin or Editor is inspecting Student View) */}
        {isStaff && adminPreviewStudentView && (
          <div className="bg-amber-400 text-neutral-950 px-6 py-2 flex items-center justify-between text-xs font-mono-meta font-bold border-b border-amber-500 sticky top-0 z-40 shadow-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>
                {isAdmin ? 'EDITORIAL PREVIEW' : 'MODERATOR PREVIEW'}: You are currently inspecting the repository as verified students see it.
              </span>
            </div>
            <button
              onClick={() => setAdminPreviewStudentView(false)}
              className="bg-neutral-950 hover:bg-neutral-900 text-amber-300 px-3 py-1 rounded-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isAdmin ? 'Return to Admin Console' : 'Return to Staff Console'}</span>
            </button>
          </div>
        )}

        {/* Top Header Navigation */}
        <Header
          activeTab={activeTab === 'publications' ? 'discover' : activeTab}
          onChangeActiveTab={(tab) => {
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenStudentManagement={() => setIsStudentManagementOpen(true)}
          pendingCount={pendingStudents.length}
          savedPapersCount={savedPapersCount}
          comparisonCount={comparisonPapers.length}
          onOpenMembership={() => setIsMembershipOpen(true)}
          membershipPlan={membershipPlan}
          onOpenCoverage={() => setIsCoverageOpen(true)}
        />

        {/* Admin Quick Action Desk Banner */}
        {(isAdmin || (isEditor && hasPermission('students.verify'))) && (
          <AdminDesk
            pendingCount={pendingStudents.length}
            onOpenDrawer={() => setIsDrawerOpen(true)}
            onOpenStudentManagement={() => setIsStudentManagementOpen(true)}
            onOpenNewThesis={() => setIsProposeOpen(true)}
          />
        )}

        {/* Primary Navigation Destinations */}

        {/* 1. Research Library Hub */}
        {activeTab === 'library' && (
          <LibraryHub
            savedPapersCount={savedPapersCount}
            onOpenSavedPapers={() => setIsSavedPapersOpen(true)}
            onOpenCollections={() => setIsCollectionsOpen(true)}
            comparisonCount={comparisonPapers.length}
            onOpenComparisonMatrix={() => setIsComparisonOpen(true)}
            onOpenTopicAlerts={() => setIsTopicAlertsOpen(true)}
            onOpenPropose={() => setIsProposeOpen(true)}
            onOpenMembership={() => setIsMembershipOpen(true)}
            membershipPlan={membershipPlan}
            onSwitchToDiscover={() => {
              setActiveTab('discover');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* 2. Open Science Datasets Discovery */}
        {activeTab === 'datasets' && (
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
            {/* Datasets Search Header */}
            <div className="bg-[#FAF9F5] dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#2C2A26] p-5 rounded-sm space-y-3 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-serif-title text-[#1C1B18] dark:text-[#F0EDE6] font-normal flex items-center gap-2">
                    <Database className="w-5 h-5 text-[#2C6B3F] dark:text-emerald-400" />
                    <span>Open Research Datasets Discovery</span>
                  </h3>
                  <p className="text-xs text-[#605D55] dark:text-[#9A968D] mt-1 font-light">
                    Federating official open science data depositories: <strong>DataCite</strong>, <strong>Zenodo / CERN</strong>, <strong>Figshare</strong>, <strong>Dryad</strong>, and author-deposited archives.
                  </p>
                </div>
                <div className="text-xs font-mono-meta text-[#2C6B3F] dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-sm self-start">
                  ✓ Verified Metadata & Licenses
                </div>
              </div>

              {/* Search Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setDatasetQuery(datasetInput.trim());
                  setDatasetPage(1);
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#737067] dark:text-[#9A968D] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search open research datasets (e.g., climate change models, Bengali NLP corpora, protein structures)..."
                    value={datasetInput}
                    onChange={(e) => setDatasetInput(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] text-xs font-mono-meta text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 shadow-2xs transition-colors"
                  />
                  {datasetInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setDatasetInput('');
                        setDatasetQuery('');
                        setDatasetPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737067] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] text-xs p-1 cursor-pointer"
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loadingDatasets}
                  className="px-4 py-2.5 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 text-xs font-mono-meta font-bold rounded-sm transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search Datasets</span>
                </button>
              </form>
            </div>

            {/* Datasets List */}
            {loadingDatasets ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] space-y-2">
                <div className="w-6 h-6 border-2 border-[#2C6B3F] dark:border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div>Searching official research dataset repositories across DataCite, Zenodo, Figshare, and Dryad...</div>
              </div>
            ) : datasetsList.length === 0 ? (
              <div className="bg-white dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] p-12 text-center rounded-sm space-y-3 transition-colors">
                <Database className="w-8 h-8 text-[#8C887E] dark:text-[#5C5950] mx-auto" />
                <p className="text-sm font-medium text-[#1C1B18] dark:text-[#F0EDE6]">No research datasets found matching your search.</p>
                <p className="text-xs text-[#737067] dark:text-[#9A968D] max-w-md mx-auto font-light">
                  Try broader keywords or search for scientific disciplines like "genomics", "deep learning", or "economics".
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
                  <span>Showing page <strong>{datasetPage}</strong> • <strong>{datasetsList.length}</strong> open science datasets found</span>
                  <span className="text-[10px] text-[#2C6B3F] dark:text-emerald-400 font-bold uppercase tracking-wider">Indexed from DataCite, Zenodo, Figshare & Dryad</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {datasetsList.map((ds) => (
                    <div
                      key={ds.id || ds.url}
                      className="bg-white dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#2C2A26] hover:border-[#2C6B3F] dark:hover:border-emerald-500 p-5 rounded-sm shadow-2xs space-y-3 flex flex-col justify-between transition group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono-meta flex-wrap">
                          <span className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                            {ds.source || 'DataCite'}
                          </span>
                          {ds.publicationYear && (
                            <span className="text-[#605D55] dark:text-[#9A968D]">Year: {ds.publicationYear}</span>
                          )}
                          {ds.license && (
                            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded-xs">
                              {ds.license}
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-serif-title font-medium text-[#1C1B18] dark:text-[#F0EDE6] group-hover:text-[#2C6B3F] dark:group-hover:text-emerald-400 leading-snug">
                          {ds.title}
                        </h4>

                        {ds.description && (
                          <p className="text-xs text-[#524F47] dark:text-[#A8A49C] line-clamp-3 font-light leading-relaxed">
                            {ds.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[#F2EFE8] dark:border-[#24221E] space-y-2 font-mono-meta text-xs">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[#737067] dark:text-[#9A968D] flex-wrap">
                          <span>Publisher: <strong>{ds.publisher || 'Research Depository'}</strong></span>
                          {ds.size && <span>• Size: {ds.size}</span>}
                        </div>

                        {/* Formats chips */}
                        {ds.formats && ds.formats.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] uppercase text-[#8C887E] dark:text-[#5C5950]">Formats:</span>
                            {ds.formats.map((fmt) => (
                              <span key={fmt} className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-1.5 py-0.2 rounded-2xs text-[10px] font-bold">
                                {fmt}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          {ds.doi && (
                            <a
                              href={`https://doi.org/${ds.doi}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-900 dark:text-blue-400 hover:underline"
                            >
                              DOI: {ds.doi}
                            </a>
                          )}
                          <a
                            href={ds.url}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 px-3 py-1.5 rounded-sm text-xs transition flex items-center gap-1.5 ml-auto cursor-pointer shadow-2xs font-semibold"
                          >
                            <span>Access Dataset</span>
                            <ExternalLink className="w-3.5 h-3.5 text-emerald-300 dark:text-neutral-950" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                <div className="pt-4 flex items-center justify-between border-t border-[#E2DFD8] dark:border-[#2C2A26] font-mono-meta text-xs">
                  <button
                    disabled={datasetPage <= 1}
                    onClick={() => {
                      setDatasetPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="bg-white dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <span className="text-[#737067] dark:text-[#9A968D]">Dataset Page <strong>{datasetPage}</strong></span>
                  <button
                    disabled={!hasMoreDatasets}
                    onClick={() => {
                      setDatasetPage((p) => p + 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="bg-white dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Discover Scholarly Works & Authors */}
        {(activeTab === 'discover' || activeTab === 'publications') && (
          <div>
            {/* Discover Hero & Prominent Search Bar */}
            <DiscoverSearchBar
              searchQuery={searchQuery}
              onSearch={(q) => {
                setSessionId(null);
                setSearchContextId(null);
                setSearchQuery(q);
                setCurrentPage(1);
              }}
              loadingTheses={loadingTheses}
              searchMode={searchMode}
              onChangeSearchMode={(m) => setSearchMode(m)}
              onSelectAuthor={(auth) => setInspectingAuthor(auth)}
              selectedPublicationType={selectedPublicationType}
              onChangePublicationType={(type) => {
                setSessionId(null);
                setSelectedPublicationType(type);
                setCurrentPage(1);
              }}
              hasPdfOnly={hasPdfOnly}
              onToggleHasPdfOnly={(checked) => {
                setSessionId(null);
                setHasPdfOnly(checked);
                setCurrentPage(1);
              }}
              isOpenAccessOnly={isOpenAccessOnly}
              onToggleIsOpenAccessOnly={(checked) => {
                setSessionId(null);
                setIsOpenAccessOnly(checked);
                setCurrentPage(1);
              }}
              onToggleFilterDrawer={() => setMobileFilterOpen((v) => !v)}
              activeFilterCount={activeFilterCount}
              onOpenCoverage={() => setIsCoverageOpen(true)}
            />

            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Left Column: Domains & Filters & Publishers */}
            <aside className={`md:col-span-1 space-y-5 ${mobileFilterOpen ? 'block' : 'hidden md:block'}`}>
            {/* Domain Categories */}
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26] mb-2.5">
                <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#605D55] dark:text-[#9A968D]">
                  Research Disciplines
                </span>
                <span className="text-[10px] font-mono-meta text-[#8C887E] dark:text-[#5C5950]">
                  INDEX [{subjectsList.length - 1}]
                </span>
              </div>

              <ul className="space-y-1 text-xs max-h-56 overflow-y-auto pr-1">
                {subjectsList.map((sub) => {
                  const isSelected = selectedSubjectId === sub.id || (!selectedSubjectId && !sub.id && selectedCategory === 'All Disciplines');
                  return (
                    <li key={sub.id || 'all'}>
                      <button
                        onClick={() => {
                          setSelectedSubjectId(sub.id);
                          setSelectedCategory(sub.label);
                          setSelectedFieldId('');
                          setSelectedFieldName('');
                          setSelectedPublisher('');
                          setSessionId(null);
                          setCurrentPage(1);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-sm transition flex justify-between items-center cursor-pointer ${
                          isSelected
                            ? 'bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 font-medium'
                            : 'text-[#4A4740] dark:text-[#A8A49C] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#F2EFE8] dark:hover:bg-[#201F1C]'
                        }`}
                      >
                        <span className="truncate">{sub.shortLabel || sub.label}</span>
                        {isSelected && <span className="font-mono-meta text-[10px] text-neutral-400 dark:text-neutral-900">●</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Advanced Discovery Filters (Institution, Country, Citations, Author) */}
            <div className="pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26]">
              <DiscoveryFiltersPanel
                subjects={subjectsList}
                selectedSubjectId={selectedSubjectId}
                onSelectSubject={(subId) => {
                  const matched = subjectsList.find((s) => s.id === subId);
                  setSelectedSubjectId(subId);
                  setSelectedCategory(matched ? matched.label : 'All Disciplines');
                  setSelectedFieldId('');
                  setSelectedFieldName('');
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                selectedInstitution={selectedInstitution}
                onSelectInstitution={(inst) => {
                  setSelectedInstitution(inst);
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                onViewInstitutionLandscape={(inst) => setInspectingLandscapeInst(inst)}
                institutionMode={institutionMode}
                onChangeInstitutionMode={(mode) => {
                  setInstitutionMode(mode);
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                academicOnly={academicOnly}
                onChangeAcademicOnly={(val) => {
                  setAcademicOnly(val);
                }}
                selectedCountries={selectedCountries}
                onToggleCountry={(code) => {
                  setSelectedCountries((prev) =>
                    prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
                  );
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                onClearCountries={() => {
                  setSelectedCountries([]);
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                minCitations={minCitations}
                onChangeMinCitations={(val) => {
                  setMinCitations(val);
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                sortOrder={sortOrder}
                onChangeSortOrder={(ord) => {
                  setSortOrder(ord);
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                selectedAuthor={selectedAuthorFilter}
                onClearAuthor={() => {
                  setSelectedAuthorFilter(null);
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                onResetAllFilters={resetAllFilters}
              />
            </div>

            {/* Publication Type Selector */}
            <div className="pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26] space-y-2">
              <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#605D55] dark:text-[#9A968D] block">
                Publication Type
              </span>
              <select
                value={selectedPublicationType}
                onChange={(e) => {
                  setSelectedPublicationType(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2.5 py-1.5 text-xs text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm font-mono-meta focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              >
                <option value="all">All Document Types</option>
                <option value="thesis">Theses & Dissertations</option>
                <option value="article">Peer-Reviewed Journal Articles</option>
                <option value="proceedings">Conference Proceedings</option>
                <option value="preprint">arXiv & Preprints</option>
              </select>
            </div>

            {/* Year Range Filter */}
            <div className="pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26] space-y-2">
              <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#605D55] dark:text-[#9A968D] block">
                Publication Year Range
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono-meta">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="From (e.g. 2018)"
                  value={draftYearMin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setDraftYearMin(v);
                    if (v.length === 4) {
                      commitYearMin(v);
                    }
                  }}
                  onBlur={() => commitYearMin(draftYearMin)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitYearMin(draftYearMin);
                    }
                  }}
                  aria-label="Filter from publication year"
                  className="bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-1 rounded-sm text-xs focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 text-[#1C1B18] dark:text-[#F0EDE6]"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="To (e.g. 2026)"
                  value={draftYearMax}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setDraftYearMax(v);
                    if (v.length === 4) {
                      commitYearMax(v);
                    }
                  }}
                  onBlur={() => commitYearMax(draftYearMax)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitYearMax(draftYearMax);
                    }
                  }}
                  aria-label="Filter to publication year"
                  className="bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-1 rounded-sm text-xs focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 text-[#1C1B18] dark:text-[#F0EDE6]"
                />
              </div>
              {(yearMin || yearMax || draftYearMin || draftYearMax) && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftYearMin('');
                    setDraftYearMax('');
                    setYearMin('');
                    setYearMax('');
                    setCurrentPage(1);
                  }}
                  className="text-[10px] font-mono-meta text-amber-800 dark:text-amber-400 underline cursor-pointer font-semibold"
                >
                  Clear Year Range
                </button>
              )}
            </div>

            {/* Academic Publishers Directory */}
            {publishersList.length > 0 && (
              <div className="pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26]">
                <div className="flex items-center justify-between pb-2 mb-2">
                  <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#605D55] dark:text-[#9A968D] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Academic Publishers</span>
                  </span>
                  {selectedPublisher && (
                    <button
                      onClick={() => {
                        setSelectedPublisher('');
                        setCurrentPage(1);
                      }}
                      className="text-[10px] font-mono-meta text-amber-800 dark:text-amber-400 underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <ul className="space-y-1 text-xs">
                  {publishersList.slice(0, 7).map((pub) => {
                    const isSelected = selectedPublisher === pub.name;
                    return (
                      <li key={pub.name}>
                        <button
                          onClick={() => {
                            setSelectedPublisher(pub.name);
                            setCurrentPage(1);
                          }}
                          className={`w-full text-left px-2 py-1 rounded-sm transition flex justify-between items-center cursor-pointer text-[11px] ${
                            isSelected
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700'
                              : 'text-[#5C5950] dark:text-[#A8A49C] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#F2EFE8] dark:hover:bg-[#201F1C]'
                          }`}
                        >
                          <span className="truncate max-w-[170px]" title={pub.name}>
                            {pub.name}
                          </span>
                          {pub.count !== null && pub.count !== undefined && (
                            <span className="font-mono-meta text-[10px] text-[#8C887E] dark:text-[#5C5950]">
                              [{pub.count}]
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Comparison Tray Widget (if papers selected) */}
            {comparisonPapers.length > 0 && (
              <div className="p-3.5 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-sm text-xs font-mono-meta space-y-2">
                <div className="flex items-center justify-between font-bold text-purple-900 dark:text-purple-300">
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                    Comparison Tray
                  </span>
                  <span>{comparisonPapers.length}/5</span>
                </div>
                <div className="space-y-1">
                  {comparisonPapers.map((cp) => (
                    <div
                      key={cp._id || cp.id || cp.paperId}
                      className="flex items-center justify-between text-[11px] text-[#1C1B18] dark:text-[#F0EDE6] bg-white dark:bg-[#1E1D1A] p-1.5 rounded-xs border border-purple-100 dark:border-purple-900/40"
                    >
                      <span className="truncate max-w-[170px]">{cp.title}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleCompare(cp)}
                        className="text-red-700 dark:text-red-400 hover:text-black dark:hover:text-white ml-1 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsComparisonOpen(true)}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white font-bold py-1.5 rounded-xs transition text-center cursor-pointer shadow-2xs"
                >
                  View Synthesis Matrix &rarr;
                </button>
              </div>
            )}

            {/* Live Open Science Badge */}
            <div className="p-3.5 bg-[#F2EFE8] dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-sm text-xs space-y-1.5 transition-colors">
              <div className="font-mono-meta text-[10px] font-bold uppercase tracking-wider text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                <span>Scholarly Coverage</span>
              </div>
              <p className="text-[11px] text-[#605D55] dark:text-[#9A968D] leading-relaxed font-light">
                Federated discovery connecting to <strong>OpenAlex</strong>, <strong>arXiv</strong>, <strong>Europe PMC</strong>, <strong>Crossref</strong>, <strong>HAL</strong>, <strong>DOAJ</strong>, and <strong>The Thesis Archive</strong>.
              </p>
              <button
                type="button"
                onClick={() => setIsCoverageOpen(true)}
                className="text-[10px] font-mono-meta text-[#1C1B18] dark:text-amber-400 underline hover:text-black dark:hover:text-amber-300 block pt-1 cursor-pointer"
              >
                View Sources & Disclosures &rarr;
              </button>
            </div>
          </aside>

          {/* Right Column: Thesis Catalog Grid */}
          <main className="md:col-span-3 space-y-4">
            {/* Top Bar: Summary, Search Quota & Propose Button */}
            <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#E2DFD8] dark:border-[#2C2A26] gap-3">
              <div className="text-xs text-[#605D55] dark:text-[#9A968D] flex items-center gap-3 flex-wrap">
                <span aria-live="polite" aria-atomic="true">
                  Showing page <strong className="text-[#1C1B18] dark:text-[#F0EDE6]">{currentPage}</strong> •{' '}
                  <strong className="text-[#1C1B18] dark:text-[#F0EDE6]">{theses.length}</strong> publications retrieved
                  {selectedCategory !== 'All Disciplines' && ` in ${selectedCategory}`}
                  {selectedFieldName && ` in Field: ${selectedFieldName}`}
                </span>

                {/* Daily Search Quota Indicator */}
                {searchQuota && (
                  searchQuota.limit === 'unlimited' ? (
                    <span className="text-[11px] font-mono-meta text-purple-900 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-xs font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-purple-700 dark:text-purple-400" />
                      <span>Unlimited Searches (Premium)</span>
                    </span>
                  ) : (
                    <span
                      className={`text-[11px] font-mono-meta px-2 py-0.5 rounded-xs border flex items-center gap-1 ${
                        searchQuota.remaining <= 2
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-bold'
                          : 'bg-[#F2EFE8] dark:bg-[#1E1D1A] text-[#524F47] dark:text-[#A8A49C] border-[#D5D1C7] dark:border-[#38352F]'
                      }`}
                      title={`${
                        searchQuota.plan === 'trial_v2' || searchQuota.plan === 'trial'
                          ? '7-Day Research Trial'
                          : 'Standard Academic'
                      } plan includes ${searchQuota.limit} daily searches, resetting at midnight (Asia/Dhaka)`}
                    >
                      <Search className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                      <span>Daily Searches: {searchQuota.used}/{searchQuota.limit} ({searchQuota.remaining} left)</span>
                    </span>
                  )
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsProposeOpen(true)}
                  className="bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 px-3 py-1.5 rounded-sm text-xs font-medium transition flex items-center gap-1.5 shadow-2xs cursor-pointer font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-300 dark:text-neutral-950" />
                  <span>Propose Thesis / Dataset</span>
                </button>
              </div>
            </div>

            {/* Daily Search Quota Exceeded Alert Banner */}
            {searchQuotaError && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 dark:border-amber-600 p-4 rounded-sm text-xs space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span className="font-serif-title text-sm">
                      Daily Search Limit Reached ({searchQuotaError.used || searchQuotaError.limit}/{searchQuotaError.limit} Searches Completed)
                    </span>
                  </div>
                  <span className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-[10px] font-mono-meta font-bold px-2 py-0.5 rounded-xs uppercase">
                    {searchQuotaError.plan === 'trial_v2' || searchQuotaError.plan === 'trial' ? 'Trial Quota' : 'Free Tier Quota'}
                  </span>
                </div>
                <p className="text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
                  You have completed your {searchQuotaError.limit} daily searches for today on the {searchQuotaError.plan === 'trial_v2' || searchQuotaError.plan === 'trial' ? '7-Day Research Trial' : 'Standard Academic plan'}. On the Premium plan, you get <strong>unlimited daily searches</strong> and full dataset access. Your search counter will automatically reset at midnight (Asia/Dhaka time).
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsMembershipOpen(true)}
                    className="px-3.5 py-1.5 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 rounded-xs font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 dark:text-neutral-950" />
                    <span>Upgrade to Premium for Unlimited Searches (৳500 / 6 Mo or 7-Day Trial)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Federated Sources Status & Diagnostics */}
            {Object.keys(providerTelemetry).length > 0 && (() => {
              const entries = Object.entries(providerTelemetry);
              const totalSources = entries.length;
              const fulfilledCount = entries.filter(([, m]) => m.status === 'fulfilled').length;
              const degradedCount = entries.filter(([, m]) => m.status === 'degraded' || m.status === 'rejected').length;
              const skippedCount = entries.filter(([, m]) => m.status === 'skipped_unsupported_filter').length;
              const isAllHealthy = degradedCount === 0;

              return (
                <div className="bg-[#FAF9F5] dark:bg-[#161513] border border-[#E5E2DA] dark:border-[#2C2A26] px-3.5 py-2 rounded-sm text-xs font-mono-meta transition-all">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block w-2 h-2 rounded-full ${isAllHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="font-semibold text-[#1C1B18] dark:text-[#F0EDE6] text-[11px]">
                        Federated Sources: {fulfilledCount} of {totalSources} active
                      </span>
                      {degradedCount > 0 && (
                        <span className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-1.5 py-0.2 rounded-xs font-medium">
                          {degradedCount} source{degradedCount > 1 ? 's' : ''} degraded (fallback active)
                        </span>
                      )}
                      {skippedCount > 0 && (
                        <span className="text-[10px] bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 px-1.5 py-0.2 rounded-xs">
                          {skippedCount} filter-skipped
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowProviderDetails((prev) => !prev)}
                      className="text-[11px] text-[#737067] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] underline cursor-pointer flex items-center gap-1 font-mono-meta ml-auto"
                    >
                      {showProviderDetails ? 'Hide source status ▴' : 'View source status ▾'}
                    </button>
                  </div>

                  {showProviderDetails && (
                    <div className="mt-2.5 pt-2 border-t border-[#E5E2DA] dark:border-[#2C2A26] flex items-center gap-1.5 flex-wrap animate-in fade-in duration-150">
                      {entries.map(([prov, meta]) => {
                        const isFulfilled = meta.status === 'fulfilled';
                        const isDegraded = meta.status === 'degraded';
                        const isSkipped = meta.status === 'skipped_unsupported_filter' || meta.status === 'idle';
                        const count = meta.count ?? meta.returnedCount ?? 0;
                        return (
                          <span
                            key={prov}
                            className={`px-1.5 py-0.5 rounded-xs text-[10px] border ${
                              isFulfilled && count > 0
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-bold'
                                : isDegraded
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-medium'
                                : isFulfilled && count === 0
                                ? 'bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800'
                                : isSkipped
                                ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800'
                                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                            }`}
                            title={
                              meta.error ||
                              (isFulfilled
                                ? `${count} records retrieved`
                                : isSkipped
                                ? 'This provider does not natively support the selected filter'
                                : 'Provider unavailable')
                            }
                          >
                            {prov}: {isFulfilled ? (count > 0 ? `${count} records` : '0 matches') : isDegraded ? 'degraded' : isSkipped ? 'filter unsupported' : 'unavailable'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Federated Outage Alert */}
            {totalTechnicalFailure && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 p-4 rounded-sm flex items-start justify-between gap-3 text-xs text-rose-900 dark:text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">Federated Academic Sources Outage</strong>
                    <span>Upstream providers encountered temporary connection issues. Your search quota was not charged.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchTheses(currentPage)}
                  className="min-h-[44px] px-3 font-mono-meta font-bold underline hover:text-rose-950 dark:hover:text-white cursor-pointer"
                >
                  Retry Search
                </button>
              </div>
            )}

            {/* Active Filter Chips */}
            {hasAnyActiveFilter && (
              <div className="p-2.5 bg-[#FAF9F5] dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm text-xs font-mono-meta flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-[10px] uppercase text-[#737067] dark:text-[#9A968D] mr-1">Active Filters:</span>
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Query: "{searchQuery}"</span>
                    <button onClick={() => { setSearchQuery(''); setSessionId(null); setCurrentPage(1); }} aria-label="Remove search query filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {selectedCategory !== 'All Disciplines' && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Discipline: {selectedCategory}</span>
                    <button onClick={clearCategoryFilter} aria-label="Remove discipline filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer" title="Remove discipline filter">✕</button>
                  </span>
                )}
                {selectedFieldId && (
                  <span className="inline-flex items-center gap-1 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 px-2 py-0.5 rounded-xs text-sky-950 dark:text-sky-300 font-medium">
                    <span>Field: {selectedFieldName || selectedFieldId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFieldId('');
                        setSelectedFieldName('');
                        setSessionId(null);
                        setCurrentPage(1);
                      }}
                      className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer"
                      title="Remove field filter"
                      aria-label="Remove field filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {selectedSubjectId && selectedCategory === 'All Disciplines' && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Subject: {subjectsList.find((s) => s.id === selectedSubjectId)?.shortLabel || selectedSubjectId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubjectId('');
                        setSessionId(null);
                        setCurrentPage(1);
                      }}
                      className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer"
                      title="Remove subject filter"
                      aria-label="Remove subject filter"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {selectedPublicationType !== 'all' && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Type: {selectedPublicationType}</span>
                    <button onClick={() => { setSelectedPublicationType('all'); setSessionId(null); setCurrentPage(1); }} aria-label="Remove publication type filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {selectedPublisher && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-xs text-amber-950 dark:text-amber-300 font-medium">
                    <span>Publisher: {selectedPublisher}</span>
                    <button onClick={() => { setSelectedPublisher(''); setSessionId(null); setCurrentPage(1); }} aria-label="Remove publisher filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {(yearMin || yearMax) && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Years: {yearMin || 'Any'} – {yearMax || 'Any'}</span>
                    <button onClick={() => { setYearMin(''); setYearMax(''); setDraftYearMin(''); setDraftYearMax(''); setSessionId(null); setCurrentPage(1); }} aria-label="Remove year range filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {hasPdfOnly && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>PDF Only</span>
                    <button onClick={() => { setHasPdfOnly(false); setSessionId(null); setCurrentPage(1); }} aria-label="Remove PDF filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {isOpenAccessOnly && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Open Access Only</span>
                    <button onClick={() => { setIsOpenAccessOnly(false); setSessionId(null); setCurrentPage(1); }} aria-label="Remove Open Access filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {selectedInstitution && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Inst ({institutionMode}): {selectedInstitution.name}</span>
                    <button onClick={() => { setSelectedInstitution(null); setSessionId(null); setCurrentPage(1); }} aria-label="Remove institution filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {selectedCountries.map((cCode) => (
                  <span key={cCode} className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Country: {cCode}</span>
                    <button onClick={() => { setSelectedCountries(prev => prev.filter(c => c !== cCode)); setSessionId(null); setCurrentPage(1); }} aria-label={`Remove country ${cCode} filter`} className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                ))}
                {selectedAuthorFilter && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-xs text-amber-950 dark:text-amber-300 font-medium">
                    <span>Author: {selectedAuthorFilter.name}</span>
                    <button onClick={() => { setSelectedAuthorFilter(null); setSessionId(null); setCurrentPage(1); }} aria-label="Remove author filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {minCitations && (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded-xs text-emerald-950 dark:text-emerald-300 font-medium">
                    <span>Citations: ≥{minCitations}</span>
                    <button onClick={() => { setMinCitations(''); setSessionId(null); setCurrentPage(1); }} aria-label="Remove minimum citations filter" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                {sortOrder !== 'relevance' && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>Sort: {sortOrder === 'citations' ? 'Most Cited' : sortOrder === 'newest' ? 'Newest' : sortOrder}</span>
                    <button onClick={() => { setSortOrder('relevance'); setSessionId(null); setCurrentPage(1); }} aria-label="Reset sort order" className="hover:text-red-700 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer">✕</button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-amber-800 dark:text-amber-400 hover:text-black dark:hover:text-white underline text-[11px] ml-auto cursor-pointer font-bold"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Catalog Entries List */}
            {loadingTheses ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] space-y-2">
                <div className="w-6 h-6 border-2 border-[#1C1B18] dark:border-amber-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div>Querying federated academic depositories for peer-reviewed papers...</div>
              </div>
            ) : theses.length === 0 ? (
              <div className="bg-white dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] p-12 text-center rounded-sm space-y-4 transition-colors">
                <p className="text-sm font-medium text-[#1C1B18] dark:text-[#F0EDE6]">
                  {totalTechnicalFailure
                    ? 'Upstream scholarly sources were temporarily unavailable.'
                    : 'No scholarly publications found matching your query criteria.'}
                </p>
                <p className="text-xs text-[#737067] dark:text-[#9A968D] max-w-md mx-auto">
                  {totalTechnicalFailure
                    ? 'Please retry in a moment. No search quota was consumed for this inquiry.'
                    : 'Try broadening your search terms or clearing specific publisher, year, or discipline filters.'}
                </p>
                <div>
                  {totalTechnicalFailure ? (
                    <button
                      type="button"
                      onClick={() => fetchTheses(currentPage)}
                      className="px-4 py-2 bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 hover:bg-black dark:hover:bg-amber-300 text-xs font-mono-meta rounded-sm cursor-pointer shadow-2xs font-semibold"
                    >
                      Retry Federated Search
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs font-mono-meta text-[#1C1B18] dark:text-amber-400 underline hover:text-black dark:hover:text-amber-300 cursor-pointer font-semibold"
                    >
                      Reset all filters & view all publications
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {theses.map((thesis) => (
                  <ThesisCard
                    key={thesis._id || thesis.id}
                    thesis={thesis}
                    onCite={(item) => setCitingThesis(item)}
                    onDeleted={handleThesisDeleted}
                    onPinned={handleThesisPinned}
                    onSelectPublisher={(pub) => {
                      setSessionId(null);
                      setSelectedPublisher(pub);
                      setCurrentPage(1);
                    }}
                    onViewDetail={(item, tab = 'overview') => {
                      setSelectedDetailThesis(item);
                      setDetailInitialTab(tab);
                    }}
                    onAddToCompare={handleToggleCompare}
                    inComparison={comparisonPapers.some(
                      (p) => (p._id || p.id || p.paperId) === (thesis._id || thesis.id)
                    )}
                    comparisonCount={comparisonPapers.length}
                    onReportIssue={(item) => setReportingThesis(item)}
                    onOpenMembership={() => setIsMembershipOpen(true)}
                    onSelectAuthor={(auth) => setInspectingAuthor(auth)}
                  />
                ))}

                {/* Genuine Pagination Navigation */}
                <div className="pt-4 pb-2 flex items-center justify-between border-t border-[#E2DFD8] dark:border-[#2C2A26] font-mono-meta text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => {
                        const prev = Math.max(1, currentPage - 1);
                        setCurrentPage(prev);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="bg-white dark:bg-[#1E1D1A] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous Page</span>
                    </button>

                    <button
                      type="button"
                      disabled={!hasMore}
                      onClick={() => {
                        const next = currentPage + 1;
                        setCurrentPage(next);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="bg-white dark:bg-[#1E1D1A] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <span>Next Page</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-[11px] text-[#737067] dark:text-[#9A968D]">
                    Page <strong>{currentPage}</strong> • Limit <strong>{paperLimit}</strong> records/page
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    )}
  </div>

      {/* Global Modals (Guarded conditionally to prevent unsolicited mounting or popups) */}
      {/* 1. Saved Papers Modal */}
      {isSavedPapersOpen && (
        <SavedPapersModal
          isOpen={isSavedPapersOpen}
          onClose={() => {
            setIsSavedPapersOpen(false);
            fetchUserSavedCount();
          }}
          onCite={(item) => setCitingThesis(item)}
          onAddToCompare={handleToggleCompare}
          comparisonPaperIds={comparisonPapers.map((p) => p._id || p.id || p.paperId)}
        />
      )}

      {/* 2. Collections Modal */}
      {isCollectionsOpen && (
        <CollectionsModal
          isOpen={isCollectionsOpen}
          onClose={() => setIsCollectionsOpen(false)}
        />
      )}

      {/* 3. Comparison Matrix Modal */}
      {isComparisonOpen && (
        <ComparisonMatrixModal
          isOpen={isComparisonOpen}
          onClose={() => setIsComparisonOpen(false)}
          comparisonPapers={comparisonPapers}
          onRemovePaper={(pId) => {
            setComparisonPapers((prev) => prev.filter((p) => (p._id || p.id || p.paperId) !== pId));
          }}
          onClear={() => setComparisonPapers([])}
        />
      )}

      {/* 4. Topic Alerts Modal */}
      {isTopicAlertsOpen && (
        <TopicAlertsModal
          isOpen={isTopicAlertsOpen}
          onClose={() => setIsTopicAlertsOpen(false)}
        />
      )}

      {/* 5. Broken Link / Retraction Report Modal */}
      {reportingThesis && (
        <ReportIssueModal
          thesis={reportingThesis}
          onClose={() => setReportingThesis(null)}
        />
      )}

      {/* Membership & bKash Modal */}
      {isMembershipOpen && (
        <MembershipModal
          isOpen={isMembershipOpen}
          onClose={() => {
            setIsMembershipOpen(false);
            fetchMembershipStatus();
          }}
        />
      )}

      {/* 6. Propose Thesis Modal */}
      {isProposeOpen && (
        <ProposeThesisModal
          isOpen={isProposeOpen}
          onClose={() => setIsProposeOpen(false)}
          onCreated={handleThesisCreated}
        />
      )}

      {/* 7. Cite Modal */}
      {citingThesis && (
        <CiteModal
          thesis={citingThesis}
          onClose={() => setCitingThesis(null)}
        />
      )}

      {/* 8. Publication Detail Modal */}
      {selectedDetailThesis && (
        <PublicationDetailModal
          key={selectedDetailThesis._id || selectedDetailThesis.id || selectedDetailThesis.doi || selectedDetailThesis.title || 'detail-modal'}
          thesis={selectedDetailThesis}
          initialTab={detailInitialTab}
          onClose={() => setSelectedDetailThesis(null)}
          onSelectPublisher={(pub) => {
            setSelectedPublisher(pub);
            setCurrentPage(1);
          }}
          onCite={(item) => setCitingThesis(item)}
          onAddToCompare={handleToggleCompare}
          inComparison={comparisonPapers.some(
            (p) => (p._id || p.id || p.paperId) === (selectedDetailThesis?._id || selectedDetailThesis?.id)
          )}
          onReportIssue={(item) => setReportingThesis(item)}
          onOpenMembership={() => setIsMembershipOpen(true)}
          onSelectAuthor={(auth) => setInspectingAuthor(auth)}
          onViewInstitutionLandscape={(inst) => setInspectingLandscapeInst(inst)}
          onSavedPapersChange={fetchUserSavedCount}
          onRequireAuth={(msg) => {
            if (showNotice) {
              showNotice(msg || 'Sign in with your student account to access this feature.', 'info');
            }
          }}
        />
      )}

      {/* Author Profile & Metrics Modal */}
      {inspectingAuthor && (
        <AuthorProfileModal
          authorId={inspectingAuthor.id}
          initialAuthor={inspectingAuthor}
          onClose={() => setInspectingAuthor(null)}
          onSelectAuthorPublications={(auth) => {
            setSelectedAuthorFilter(auth);
            setSearchQuery('');
            setSessionId(null);
            setCurrentPage(1);
          }}
          onViewThesisDetail={(work) => setSelectedDetailThesis(work)}
        />
      )}

      {/* Institution Research Landscape Modal */}
      {inspectingLandscapeInst && (
        <InstitutionLandscapeModal
          isOpen={!!inspectingLandscapeInst}
          institution={inspectingLandscapeInst}
          onClose={() => setInspectingLandscapeInst(null)}
          onFilterByField={(param) => {
            const fId = typeof param === 'object' && param ? param.fieldId : null;
            const fName = typeof param === 'object' && param ? (param.fieldName || param.name) : param;

            setSelectedFieldId(fId || '');
            setSelectedFieldName(fName || '');
            setSelectedSubjectId('');
            setSelectedCategory('All Disciplines');
            if (inspectingLandscapeInst) {
              setSelectedInstitution(inspectingLandscapeInst);
            }
            if (param && param.fromYear && param.toYear) {
              setYearMin(String(param.fromYear));
              setYearMax(String(param.toYear));
            }
            setInspectingLandscapeInst(null);
            setSessionId(null);
            setCurrentPage(1);
          }}
        />
      )}

      {/* Coverage & Limitations Disclosure Modal */}
      {isCoverageOpen && (
        <CoverageModal
          isOpen={isCoverageOpen}
          onClose={() => setIsCoverageOpen(false)}
        />
      )}

      {/* 9. Student Management Modal (Admin) */}
      {isStudentManagementOpen && (
        <StudentManagementModal
          isOpen={isStudentManagementOpen}
          onClose={() => setIsStudentManagementOpen(false)}
          onRefreshStats={() => {
            fetchPendingStudents();
          }}
        />
      )}

      {/* 10. Verification Drawer (Admin) */}
      {isDrawerOpen && (
        <VerificationDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          pendingStudents={pendingStudents}
          onEvaluate={handleEvaluateStudent}
          loading={evaluating}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-[#E2DFD8] dark:border-[#2C2A26] bg-white dark:bg-[#141312] py-4 mt-8 transition-colors">
        <div className="max-w-7xl mx-auto px-4 md:px-6 text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] flex flex-wrap items-center justify-between gap-4">
          <span>The Thesis Archive • Academic Depository & Open Science Vault</span>
          <span>Democratizing Scholarly Research, Benchmark Datasets & Preprints</span>
        </div>
      </footer>
    </div>
  );
}
