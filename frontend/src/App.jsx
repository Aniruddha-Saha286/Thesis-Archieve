import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import axios from 'axios';
import Header from './components/Header';
import AdminDesk from './components/AdminDesk';
import ThesisCard from './components/ThesisCard';
import LoginView from './components/LoginView';
import StudentRegistrationView from './components/StudentRegistrationView';
import PendingView from './components/PendingView';
import DiscoveryFiltersPanel from './components/DiscoveryFiltersPanel';
import DiscoverSearchBar from './components/DiscoverSearchBar';
import FilterSection from './components/FilterSection';
import { isTrialPlan } from './utils/plan';
import { parseUrlState, buildUrl, paperParams, isArchiveId, rememberPaper, recallPaper, rememberSearchContext, recallSearchContext } from './utils/urlState';
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
  Calendar,
  Layers,
  ArrowUpDown,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import lazyWithRetry from './utils/lazyWithRetry';

const VerificationDrawer = lazyWithRetry(() => import('./components/VerificationDrawer'));
const ProposeThesisModal = lazyWithRetry(() => import('./components/ProposeThesisModal'));
const FeedbackModal = lazyWithRetry(() => import('./components/FeedbackModal'));
const CiteModal = lazyWithRetry(() => import('./components/CiteModal'));
const PublicationDetailModal = lazyWithRetry(() => import('./components/PublicationDetailModal'));
const StudentManagementModal = lazyWithRetry(() => import('./components/StudentManagementModal'));
const AdminPortalView = lazyWithRetry(() => import('./components/AdminPortalView'));
const SavedPapersModal = lazyWithRetry(() => import('./components/SavedPapersModal'));
const CollectionsModal = lazyWithRetry(() => import('./components/CollectionsModal'));
const ComparisonMatrixModal = lazyWithRetry(() => import('./components/ComparisonMatrixModal'));
const TopicAlertsModal = lazyWithRetry(() => import('./components/TopicAlertsModal'));
const ReportIssueModal = lazyWithRetry(() => import('./components/ReportIssueModal'));
const MembershipModal = lazyWithRetry(() => import('./components/MembershipModal'));
const AuthorProfileModal = lazyWithRetry(() => import('./components/AuthorProfileModal'));
const InstitutionLandscapeModal = lazyWithRetry(() => import('./components/InstitutionLandscapeModal'));
const CoverageModal = lazyWithRetry(() => import('./components/CoverageModal'));
const LibraryHub = lazyWithRetry(() => import('./components/LibraryHub'));
const TopicCheck = lazyWithRetry(() => import('./components/TopicCheck'));

function PartLoading() {
  return (
    <div role="status" className="py-16 text-center text-xs text-[#737067] dark:text-[#9A968D]">
      <div className="w-6 h-6 border-2 border-[#1C1B18] dark:border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
      Loading…
    </div>
  );
}


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

const PUBLICATION_TYPE_LABELS = {
  all: 'All Records',
  thesis: 'Theses & Dissertations',
  article: 'Journal Articles',
  'journal-article': 'Journal Articles',
  proceedings: 'Conference Papers',
  'conference-paper': 'Conference Papers',
  preprint: 'Preprints',
  book: 'Books',
};

// This tab's storage, or null when the browser blocks it (private mode with strict settings)
function safeSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function App() {
  const { user, loading, isAuthenticated, needsRegistration, isApproved, isPending, isAdmin, isEditor, isStaff, hasPermission, logout } = useAuth();
  const { socket, isConnected, realtimeNotice, clearRealtimeNotice, showNotice } = useSocket();

  // Search & Filtering State
  // What the address bar says when the page loads (a shared link, or a refresh)
  const initialUrl = useRef(parseUrlState(window.location.search)).current;

  const [searchMode, setSearchMode] = useState('publications'); // 'publications' | 'authors'
  const [searchQuery, setSearchQuery] = useState(initialUrl.q);
  const [sessionId, setSessionId] = useState(null);
  // After a refresh the same search keeps its id, so it is not counted against the daily limit again
  const [searchContextId, setSearchContextId] = useState(() => recallSearchContext(safeSessionStorage(), initialUrl.q));
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
  const [sortOrder, setSortOrder] = useState(initialUrl.sort);
  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState(null);
  const [inspectingAuthor, setInspectingAuthor] = useState(null);
  const [selectedPublisher, setSelectedPublisher] = useState('');
  const [selectedPublicationType, setSelectedPublicationType] = useState(initialUrl.type);
  const [hasPdfOnly, setHasPdfOnly] = useState(initialUrl.pdf);
  const [isOpenAccessOnly, setIsOpenAccessOnly] = useState(initialUrl.oa);
  const [yearMin, setYearMin] = useState(initialUrl.from);
  const [yearMax, setYearMax] = useState(initialUrl.to);
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
  const [searchError, setSearchError] = useState(null);
  const currentRequestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  // Research Workspace State
  const [savedPapersCount, setSavedPapersCount] = useState(0);
  const [savedPaperIds, setSavedPaperIds] = useState(() => new Set());
  const [comparisonPapers, setComparisonPapers] = useState([]);

  // Modals
  const [isSavedPapersOpen, setIsSavedPapersOpen] = useState(false);
  const [isCollectionsOpen, setIsCollectionsOpen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [isTopicAlertsOpen, setIsTopicAlertsOpen] = useState(false);
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [citingThesis, setCitingThesis] = useState(null);
  const [selectedDetailThesis, setSelectedDetailThesis] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState('overview');
  const [reportingThesis, setReportingThesis] = useState(null);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [membershipPlan, setMembershipPlan] = useState('free');
  const [searchQuota, setSearchQuota] = useState(null);
  const [searchQuotaError, setSearchQuotaError] = useState(null);
  const [inspectingLandscapeInst, setInspectingLandscapeInst] = useState(null);

  // Primary Navigation Tabs: 'discover' | 'datasets' | 'topic' | 'library'
  const [activeTab, setActiveTab] = useState(initialUrl.view);
  const [topicSeed, setTopicSeed] = useState('');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Provider Telemetry Details Drawer
  const [showProviderDetails, setShowProviderDetails] = useState(false);

  // Global Open Science Dataset Discovery State (DataCite & Zenodo)
  const [datasetQuery, setDatasetQuery] = useState('');
  const [datasetInput, setDatasetInput] = useState('');
  const [datasetsList, setDatasetsList] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [datasetError, setDatasetError] = useState(null);
  const datasetRequestIdRef = useRef(0);
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

  // Fetch the paper details window in the background once the page is up,
  // so the first click on a result opens without a pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      import('./components/PublicationDetailModal').catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

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
        setSessionId(null);
        setCurrentPage(1);
      }
    } else if (/^\d{4}$/.test(trimmed)) {
      if (yearMin !== trimmed) {
        setYearMin(trimmed);
        setSessionId(null);
        setCurrentPage(1);
      }
    }
  };

  const commitYearMax = (val) => {
    const trimmed = String(val || '').trim();
    if (!trimmed) {
      if (yearMax !== '') {
        setYearMax('');
        setSessionId(null);
        setCurrentPage(1);
      }
    } else if (/^\d{4}$/.test(trimmed)) {
      if (yearMax !== trimmed) {
        setYearMax(trimmed);
        setSessionId(null);
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
      setSearchError(null);
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
            rememberSearchContext(safeSessionStorage(), params.search, res.data.searchContextId);
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
        } else {
          // Network drop, server error, rate limit... tell the user instead of silently showing stale results
          setTheses([]);
          setHasMore(false);
          setSearchError(
            err.response?.status === 429
              ? 'Too many requests in a short time. Please wait a few seconds and try again.'
              : err.response?.data?.message || 'We could not load results right now. Please check your connection and try again.'
          );
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
    const requestId = ++datasetRequestIdRef.current;
    // Nothing typed yet: show the starting suggestions instead of searching for made-up words
    if (!datasetQuery.trim()) {
      setDatasetsList([]);
      setHasMoreDatasets(false);
      setDatasetError(null);
      setLoadingDatasets(false);
      return;
    }
    try {
      setLoadingDatasets(true);
      setDatasetError(null);
      const activePage = pageOverride !== undefined ? pageOverride : datasetPage;
      const res = await axios.get('/api/datasets', {
        params: {
          q: datasetQuery.trim(),
          page: activePage,
          limit: 15,
        },
      });
      if (requestId !== datasetRequestIdRef.current) return;
      setDatasetsList(res.data.datasets || []);
      setHasMoreDatasets(Boolean(res.data.pagination?.hasMore));
    } catch (err) {
      if (requestId !== datasetRequestIdRef.current) return;
      if (err.response?.status === 503 || err.response?.data?.code === 'MAINTENANCE_MODE') {
        setSystemMaintenance({
          enabled: true,
          message: err.response.data?.message || 'Scheduled platform maintenance is in progress.',
        });
      } else {
        setDatasetError(err.response?.data?.message || 'Dataset sources could not be reached. Please try again.');
      }
      console.error('Error fetching global datasets:', err);
    } finally {
      if (requestId === datasetRequestIdRef.current) {
        setLoadingDatasets(false);
      }
    }
  };

  const fetchUserSavedCount = async () => {
    try {
      const res = await axios.get('/api/user/saved-papers');
      const list = Array.isArray(res.data) ? res.data : [];
      setSavedPapersCount(list.length);
      // Cards and the details window use this to show "Saved" correctly after a reload
      setSavedPaperIds(new Set(list.map((sp) => String(sp.paperId))));
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
      if (res.data?.maintenance) {
        setSystemMaintenance(res.data.maintenance);
      }
    } catch (err) {
      // Fallback
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

  // ==========================================
  // Address bar <-> screen
  // ==========================================

  // The paper named in the address when the page loaded; opened once the user is in
  const pendingPaperRef = useRef(initialUrl.paper ? { paper: initialUrl.paper, doi: initialUrl.doi } : null);
  // Waiting for a search (by DOI) to bring back the paper a shared link points to
  const pendingDoiRef = useRef('');
  // The paper currently being looked up for the address; kept in the address until it is found or given up
  const resolvingPaperRef = useRef(null);
  const doiSearchSeenRef = useRef(false);
  const firstAddressSyncRef = useRef(true);

  const closePaperDetails = () => {
    // If opening the paper added a step to the browser history, closing goes back over that
    // step, so Back does not reopen a window the user has just closed.
    if (window.history.state && window.history.state.ttaPaper) {
      window.history.back();
    } else {
      setSelectedDetailThesis(null);
    }
  };

  // Finds the record for a paper id: the results on screen, this tab's memory, then the archive.
  const openPaperFromAddress = async ({ paper, doi }) => {
    if (!paper) {
      resolvingPaperRef.current = null;
      setSelectedDetailThesis(null);
      return;
    }
    resolvingPaperRef.current = { paper, doi: doi || '' };
    const onScreen = theses.find((t) => String(t._id || t.id) === paper);
    const remembered = onScreen || recallPaper(safeSessionStorage(), paper);
    if (remembered) {
      setSelectedDetailThesis(remembered);
      setDetailInitialTab('overview');
      return;
    }
    if (isArchiveId(paper)) {
      try {
        const res = await axios.get(`/api/thesis/${encodeURIComponent(paper)}`);
        if (res.data && res.data.title) {
          setSelectedDetailThesis(res.data);
          setDetailInitialTab('overview');
          return;
        }
      } catch (err) {
      }
    }
    if (doi) {
      pendingDoiRef.current = doi.toLowerCase();
      doiSearchSeenRef.current = false;
      setActiveTab('discover');
      setSessionId(null);
      setSearchContextId(null);
      setSearchQuery(doi);
      setCurrentPage(1);
      return;
    }
    resolvingPaperRef.current = null;
    showNotice(
      isArchiveId(paper)
        ? 'The paper in this link is no longer in the archive.'
        : 'This link points to a paper from an outside source. Search for its title to find it again.',
      'info'
    );
    window.history.replaceState(null, '', buildUrl({ ...parseUrlState(window.location.search), paper: '', doi: '' }, window.location.pathname));
  };

  useEffect(() => {
    if (!isApproved || !pendingPaperRef.current) return;
    const target = pendingPaperRef.current;
    pendingPaperRef.current = null;
    openPaperFromAddress(target);
  }, [isApproved]);

  useEffect(() => {
    if (!pendingDoiRef.current) return;
    if (loadingTheses) {
      doiSearchSeenRef.current = true;
      return;
    }
    const wanted = pendingDoiRef.current;
    const match = theses.find((t) => String(t.doi || '').toLowerCase() === wanted);
    if (match) {
      pendingDoiRef.current = '';
      doiSearchSeenRef.current = false;
      setSelectedDetailThesis(match);
      setDetailInitialTab('overview');
    } else if (theses.length > 0 || searchError || searchQuotaError || doiSearchSeenRef.current) {
      pendingDoiRef.current = '';
      doiSearchSeenRef.current = false;
      resolvingPaperRef.current = null;
      if (!searchQuotaError) showNotice('The paper in this link could not be found again. Search for its title instead.', 'info');
      window.history.replaceState(null, '', buildUrl({ ...parseUrlState(window.location.search), paper: '', doi: '' }, window.location.pathname));
    }
  }, [theses, loadingTheses, searchError, searchQuotaError]);

  useEffect(() => {
    if (selectedDetailThesis) resolvingPaperRef.current = null;
    if (!isApproved || pendingPaperRef.current) return;
    const openPaper = paperParams(selectedDetailThesis);
    const awaited = !selectedDetailThesis ? resolvingPaperRef.current : null;
    const next = buildUrl(
      {
        view: activeTab === 'publications' ? 'discover' : activeTab,
        q: searchQuery,
        type: selectedPublicationType,
        sort: sortOrder,
        pdf: hasPdfOnly,
        oa: isOpenAccessOnly,
        from: yearMin,
        to: yearMax,
        paper: awaited ? awaited.paper : openPaper.paper,
        doi: awaited ? awaited.doi : openPaper.doi,
      },
      window.location.pathname
    );
    const current = window.location.pathname + window.location.search;
    const firstSync = firstAddressSyncRef.current;
    firstAddressSyncRef.current = false;
    if (next === current) return;
    if (firstSync) {
      window.history.replaceState(window.history.state, '', next);
      return;
    }

    const hadPaper = Boolean(parseUrlState(window.location.search).paper);
    const onPaperStep = Boolean(window.history.state && window.history.state.ttaPaper);
    if (selectedDetailThesis) rememberPaper(safeSessionStorage(), selectedDetailThesis);

    if (selectedDetailThesis && !hadPaper) {
      window.history.pushState({ ttaPaper: true }, '', next);
    } else if (hadPaper && !onPaperStep) {
      window.history.replaceState(null, '', next);
    } else if (!selectedDetailThesis && hadPaper) {
      window.history.replaceState(null, '', next);
    } else {
      window.history.pushState(selectedDetailThesis ? { ttaPaper: true } : null, '', next);
    }
  }, [isApproved, activeTab, searchQuery, selectedPublicationType, sortOrder, hasPdfOnly, isOpenAccessOnly, yearMin, yearMax, selectedDetailThesis]);

  useEffect(() => {
    const handlePopState = () => {
      const target = parseUrlState(window.location.search);
      setActiveTab(target.view);
      setMobileFilterOpen(false);
      if (target.view === 'discover') {
        const changed =
          target.q !== searchQuery || target.type !== selectedPublicationType || target.sort !== sortOrder ||
          target.pdf !== hasPdfOnly || target.oa !== isOpenAccessOnly || target.from !== yearMin || target.to !== yearMax;
        if (changed) {
          setSessionId(null);
          setSearchContextId(recallSearchContext(safeSessionStorage(), target.q));
          setCurrentPage(1);
          setSearchQuery(target.q);
          setSelectedPublicationType(target.type);
          setSortOrder(target.sort);
          setHasPdfOnly(target.pdf);
          setIsOpenAccessOnly(target.oa);
          setYearMin(target.from);
          setYearMax(target.to);
        }
      }
      const openId = selectedDetailThesis ? String(selectedDetailThesis._id || selectedDetailThesis.id) : '';
      if (target.paper !== openId) {
        openPaperFromAddress({ paper: target.paper, doi: target.doi });
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  });

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

  useEffect(() => {
    if (isApproved) {
      fetchPublishers();
    }
  }, [isApproved]);

  useEffect(() => {
    if (isAdmin || (isEditor && hasPermission('students.view'))) {
      fetchPendingStudents();
    }
  }, [isAdmin, isEditor, hasPermission]);

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
        setSystemMaintenance(status);
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
            showNotice('You can compare up to 5 papers at a time. Remove one to add another.', 'info');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0E0D0C] text-[#1C1B18] dark:text-[#E8E6E1] flex items-center justify-center font-mono-meta text-xs transition-colors">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] dark:bg-amber-400 text-[#FAF9F5] dark:text-neutral-950 flex items-center justify-center font-serif-title text-xl mx-auto animate-pulse">
            §
          </div>
          <div>Loading…</div>
        </div>
      </div>
    );
  }

  if (systemMaintenance.enabled && !isAdmin && !checkingMaintenance) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0E0D0C] text-[#1C1B18] dark:text-[#E8E6E1] flex flex-col justify-center items-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 flex items-center justify-center mx-auto text-amber-800 dark:text-amber-300 shadow-xs">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-serif-title font-medium tracking-tight text-[#1C1B18] dark:text-[#F0EDE6]">
              Back soon
            </h1>
            <p className="text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] uppercase tracking-wider">
              The Thesis Archive
            </p>
          </div>
          <div className="p-4 bg-white dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm text-xs text-[#524F47] dark:text-[#A8A49C] leading-relaxed font-light">
            {systemMaintenance.message || 'The Thesis Archive is being updated. Searching is paused for a short time. Your saved papers and account are safe.'}
          </div>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={fetchSystemStatus}
              className="w-full sm:w-auto px-4 py-2 bg-[#1C1B18] hover:bg-black dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 text-xs font-mono-meta font-bold rounded-sm cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check again</span>
            </button>
            {!user ? (
              <a
                href="/api/auth/google"
                className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-[#1E1D1A] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] text-xs font-mono-meta rounded-sm cursor-pointer text-center"
              >
                Staff sign-in
              </a>
            ) : (
              <button
                type="button"
                onClick={logout}
                className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-[#1E1D1A] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] text-xs font-mono-meta rounded-sm cursor-pointer"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. Strict Access Gate: Without sign-in, user MUST NOT see anything except the login page!
  if (!isAuthenticated) {
    return <LoginView />;
  }

  if (needsRegistration) {
    return <StudentRegistrationView />;
  }

  if (!isApproved) {
    return <PendingView />;
  }

  if (isStaff && !adminPreviewStudentView) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0E0D0C]"><PartLoading /></div>}>
        <AdminPortalView onSwitchToStudentPreview={() => setAdminPreviewStudentView(true)} />
      </Suspense>
    );
  }

  // 6. Authenticated & Approved: Renders the Full Scholarly Discovery Repository & Workspace
  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0E0D0C] text-[#1C1B18] dark:text-[#E8E6E1] flex flex-col justify-between transition-colors duration-150">
      <div>

        {systemMaintenance.enabled && isAdmin && (
          <div className="bg-amber-500 text-neutral-950 px-6 py-2 flex items-center justify-between text-xs font-mono-meta font-bold border-b border-amber-600 sticky top-0 z-50 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-neutral-950 shrink-0" />
              <span>
                Maintenance mode is ON. Students cannot use the site right now. You can, because you are an administrator.
              </span>
            </div>
            {adminPreviewStudentView && (
              <button
                onClick={() => setAdminPreviewStudentView(false)}
                className="bg-neutral-950 hover:bg-neutral-900 text-amber-300 px-3 py-1 rounded-xs transition cursor-pointer text-[11px]"
              >
                Back to the admin console
              </button>
            )}
          </div>
        )}

        {isStaff && adminPreviewStudentView && (
          <div className="bg-amber-400 text-neutral-950 px-6 py-2 flex items-center justify-between text-xs font-mono-meta font-bold border-b border-amber-500 sticky top-0 z-40 shadow-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>
                You are looking at the site as an approved student sees it.
              </span>
            </div>
            <button
              onClick={() => setAdminPreviewStudentView(false)}
              className="bg-neutral-950 hover:bg-neutral-900 text-amber-300 px-3 py-1 rounded-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isAdmin ? 'Back to the admin console' : 'Back to the staff console'}</span>
            </button>
          </div>
        )}

        {/* Top Header Navigation */}
        <Header
          activeTab={activeTab === 'publications' ? 'discover' : activeTab}
          onChangeActiveTab={(tab) => {
            if (tab === 'topic') setTopicSeed('');
            setActiveTab(tab);
            setMobileFilterOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenStudentManagement={() => setIsStudentManagementOpen(true)}
          pendingCount={pendingStudents.length}
          savedPapersCount={savedPapersCount}
          comparisonCount={comparisonPapers.length}
          onOpenMembership={() => setIsMembershipOpen(true)}
          membershipPlan={membershipPlan}
          onOpenCoverage={() => setIsCoverageOpen(true)}
          onOpenFeedback={() => setIsFeedbackOpen(true)}
          onOpenAlerts={() => setIsTopicAlertsOpen(true)}
        />

        {(isAdmin || (isEditor && hasPermission('students.verify'))) && (
          <AdminDesk
            pendingCount={pendingStudents.length}
            onOpenDrawer={() => setIsDrawerOpen(true)}
            onOpenStudentManagement={() => setIsStudentManagementOpen(true)}
            onOpenNewThesis={() => setIsProposeOpen(true)}
          />
        )}


        {activeTab === 'library' && (
          <Suspense fallback={<PartLoading />}>
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
          </Suspense>
        )}

        {/* Topic Check: is my thesis idea already done, and is it feasible? */}
        {activeTab === 'topic' && (
          <Suspense fallback={<PartLoading />}>
          <TopicCheck
            initialTopic={topicSeed}
            comparisonIds={comparisonPapers.map((p) => p._id || p.id || p.paperId)}
            onToggleCompare={handleToggleCompare}
            onViewDetail={(item) => {
              setSelectedDetailThesis(item);
              setDetailInitialTab('overview');
            }}
            onOpenMembership={() => setIsMembershipOpen(true)}
            onOpenTopicAlerts={() => setIsTopicAlertsOpen(true)}
            onSearchInDiscover={(query, contextId) => {
              setSearchMode('publications');
              setSessionId(null);
              setSearchContextId(contextId || null);
              setSearchQuery(query);
              setCurrentPage(1);
              setActiveTab('discover');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
          </Suspense>
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
                    <span>Find a dataset</span>
                  </h3>
                  <p className="text-xs text-[#605D55] dark:text-[#9A968D] mt-1 font-light">
                    Searches DataCite, Zenodo, Figshare, Dryad, Harvard Dataverse and Hugging Face in one go.
                  </p>
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
                    placeholder="What data do you need? e.g. Bangla sentiment, rice leaf images"
                    aria-label="Search datasets"
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
                  <span>Search</span>
                </button>
              </form>
            </div>

            {/* Datasets List */}
            {loadingDatasets ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] space-y-2">
                <div className="w-6 h-6 border-2 border-[#2C6B3F] dark:border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div>Searching six dataset sources…</div>
              </div>
            ) : datasetError ? (
              <div role="alert" className="bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 p-8 text-center rounded-sm space-y-3 text-rose-900 dark:text-rose-200">
                <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400 mx-auto" />
                <p className="text-sm font-semibold">Datasets could not be loaded</p>
                <p className="text-xs max-w-md mx-auto">{datasetError}</p>
                <button
                  type="button"
                  onClick={() => fetchGlobalDatasets()}
                  className="px-4 py-2 bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 text-xs font-mono-meta rounded-sm cursor-pointer shadow-2xs font-semibold"
                >
                  Try again
                </button>
              </div>
            ) : !datasetQuery.trim() ? (
              <div className="bg-white dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] p-8 sm:p-10 text-center rounded-sm space-y-4 transition-colors">
                <Database className="w-8 h-8 text-[#8C887E] dark:text-[#5C5950] mx-auto" />
                <p className="text-sm font-medium text-[#1C1B18] dark:text-[#F0EDE6]">Type what data you need, or start from one of these</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {['Bangla sentiment', 'rice leaf disease images', 'Dhaka traffic', 'flood water level', 'handwritten Bangla characters', 'phishing URLs'].map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => {
                        setDatasetInput(idea);
                        setDatasetQuery(idea);
                        setDatasetPage(1);
                      }}
                      className="px-3 py-1.5 rounded-sm border border-[#D5D1C7] dark:border-[#38352F] bg-[#FAF9F5] dark:bg-[#201F1C] hover:border-[#2C6B3F] dark:hover:border-emerald-500 text-xs text-[#1C1B18] dark:text-[#F0EDE6] cursor-pointer"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </div>
            ) : datasetsList.length === 0 ? (
              <div className="bg-white dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] p-12 text-center rounded-sm space-y-3 transition-colors">
                <Database className="w-8 h-8 text-[#8C887E] dark:text-[#5C5950] mx-auto" />
                <p className="text-sm font-medium text-[#1C1B18] dark:text-[#F0EDE6]">No dataset matched “{datasetQuery}”.</p>
                <p className="text-xs text-[#737067] dark:text-[#9A968D] max-w-md mx-auto">
                  Try fewer or more general words, or the English name of the topic.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
                  <span><strong>{datasetsList.length}</strong> datasets on page <strong>{datasetPage}</strong></span>
                  <span className="text-[11px] text-[#605D55] dark:text-[#9A968D]">From DataCite, Zenodo, Figshare, Dryad, Harvard Dataverse and Hugging Face</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {datasetsList.map((ds) => (
                    <div
                      key={ds.id || ds.url}
                      className="bg-white dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#2C2A26] hover:border-[#2C6B3F] dark:hover:border-emerald-500 p-5 rounded-sm shadow-2xs space-y-3 flex flex-col justify-between transition group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono-meta flex-wrap">
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
                          <span>Publisher: <strong>{ds.publisher || 'not recorded'}</strong></span>
                          {ds.size && <span>• Size: {ds.size}</span>}
                        </div>

                        {/* Formats chips */}
                        {ds.formats && ds.formats.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] uppercase text-[#8C887E] dark:text-[#5C5950]">Formats:</span>
                            {ds.formats.map((fmt) => (
                              <span key={fmt} className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-1.5 py-0.2 rounded-2xs text-[11px] font-bold">
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
              onOpenTopicCheck={(typed) => {
                setTopicSeed(typed || searchQuery || '');
                setActiveTab('topic');
                setMobileFilterOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* Left Column: Grouped Filters */}
            <aside
              id="discover-filters"
              aria-label="Search filters"
              className={`md:col-span-1 space-y-3 ${mobileFilterOpen ? 'block' : 'hidden md:block'}`}
            >
              {/* Filters header: one place to see how many filters are on and to reset them */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="bg-amber-400 text-neutral-950 text-[11px] px-1.5 py-0.5 rounded-2xs font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {hasAnyActiveFilter && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-[11px] font-mono-meta text-amber-800 dark:text-amber-400 underline cursor-pointer font-semibold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset all</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMobileFilterOpen(false)}
                    className="md:hidden p-1.5 text-[#737067] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer"
                    aria-label="Close filters"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Group 1: Topic */}
              <FilterSection
                title="Discipline"
                icon={Layers}
                activeCount={selectedSubjectId || selectedCategory !== 'All Disciplines' ? 1 : 0}
                onClear={clearCategoryFilter}
              >
                <ul className="space-y-1 text-xs max-h-56 overflow-y-auto pr-1">
                  {subjectsList.map((sub) => {
                    const isSelected = selectedSubjectId === sub.id || (!selectedSubjectId && !sub.id && selectedCategory === 'All Disciplines');
                    return (
                      <li key={sub.id || 'all'}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
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
                          {isSelected && <span className="font-mono-meta text-[11px] text-neutral-400 dark:text-neutral-900">●</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </FilterSection>

              {/* Group 2: Time */}
              <FilterSection
                title="Publication Year"
                icon={Calendar}
                activeCount={yearMin || yearMax || draftYearMin || draftYearMax ? 1 : 0}
                onClear={() => {
                  setDraftYearMin('');
                  setDraftYearMax('');
                  setYearMin('');
                  setYearMax('');
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                defaultOpen={false}
              >
                <div className="grid grid-cols-2 gap-2 text-xs font-mono-meta">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="From (2018)"
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
                    className="bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-1.5 rounded-sm text-xs focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 text-[#1C1B18] dark:text-[#F0EDE6]"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="To (2026)"
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
                    className="bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-1.5 rounded-sm text-xs focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 text-[#1C1B18] dark:text-[#F0EDE6]"
                  />
                </div>
                <p className="text-[11px] font-mono-meta text-[#8C887E] dark:text-[#5C5950] leading-tight">
                  Type a 4-digit year. Leave one side empty for an open range.
                </p>
              </FilterSection>

              {/* Group 3: Source */}
              {(
                <FilterSection
                  title="Publisher"
                  icon={Building2}
                  activeCount={selectedPublisher ? 1 : 0}
                  onClear={() => {
                    setSelectedPublisher('');
                    setSessionId(null);
                    setCurrentPage(1);
                  }}
                  defaultOpen={false}
                >
                  {/* Common publishers, one click. IEEE has no open search of its own; its papers
                      come through the other sources, and this narrows the results to them. */}
                  <div className="flex flex-wrap gap-1.5 pb-2" aria-label="Common publishers">
                    {['IEEE', 'ACM', 'Springer', 'Elsevier'].map((name) => {
                      const isOn = selectedPublisher === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={isOn}
                          onClick={() => {
                            setSelectedPublisher(isOn ? '' : name);
                            setSessionId(null);
                            setCurrentPage(1);
                          }}
                          className={`px-2 py-1 rounded-sm border text-[11px] cursor-pointer transition ${
                            isOn
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold border-amber-300 dark:border-amber-700'
                              : 'bg-[#FAF9F5] dark:bg-[#201F1C] border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#E8E6E1] hover:border-[#1C1B18] dark:hover:border-[#9A968D]'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  <ul className="space-y-1 text-xs">
                    {publishersList.slice(0, 7).map((pub) => {
                      const isSelected = selectedPublisher === pub.name;
                      return (
                        <li key={pub.name}>
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              // Click again to deselect
                              setSelectedPublisher(isSelected ? '' : pub.name);
                              setSessionId(null);
                              setCurrentPage(1);
                            }}
                            className={`w-full text-left px-2 py-1.5 rounded-sm transition flex justify-between items-center gap-2 cursor-pointer text-[11px] ${
                              isSelected
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700'
                                : 'text-[#5C5950] dark:text-[#A8A49C] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#F2EFE8] dark:hover:bg-[#201F1C]'
                            }`}
                          >
                            <span className="truncate" title={pub.name}>
                              {pub.name}
                            </span>
                            {pub.count !== null && pub.count !== undefined && (
                              <span className="font-mono-meta text-[11px] text-[#8C887E] dark:text-[#5C5950] shrink-0">
                                {pub.count}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </FilterSection>
              )}

              {/* Group 4 & 5: Where (University, Country) and Impact (Citations) */}
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
                selectedAuthor={selectedAuthorFilter}
                onClearAuthor={() => {
                  setSelectedAuthorFilter(null);
                  setSessionId(null);
                  setCurrentPage(1);
                }}
                className="space-y-3"
              />

              {/* Phones/tablets: close the drawer and go straight to results */}
              <button
                type="button"
                onClick={() => {
                  setMobileFilterOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="md:hidden w-full bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 py-2.5 rounded-sm text-xs font-mono-meta font-bold cursor-pointer shadow-2xs"
              >
                Show results
              </button>

              {/* Quiet footer link instead of a big promo box */}
              <button
                type="button"
                onClick={() => setIsCoverageOpen(true)}
                className="flex items-center gap-1.5 text-[11px] font-mono-meta text-[#737067] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] underline cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Which sources are searched?</span>
              </button>
            </aside>

          {/* Right Column: Thesis Catalog Grid */}
          <main className="md:col-span-3 space-y-3">
            {/* Results header, one row: how many, how they are ordered, and the two things a student may want next */}
            {(() => {
              const sourceEntries = Object.entries(providerTelemetry);
              const answered = sourceEntries.filter(([, m]) => m.status === 'fulfilled').length;
              const troubled = sourceEntries.filter(([, m]) => m.status === 'degraded' || m.status === 'rejected').length;
              return (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-2.5 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-[#605D55] dark:text-[#9A968D]">
                    <span aria-live="polite" aria-atomic="true">
                      {loadingTheses ? (
                        <span>Searching…</span>
                      ) : (
                        <span>
                          <strong className="text-[#1C1B18] dark:text-[#F0EDE6]">{theses.length}</strong>{' '}
                          {theses.length === 1 ? 'result' : 'results'} on this page
                          {selectedCategory !== 'All Disciplines' && ` in ${selectedCategory}`}
                          {selectedFieldName && ` · ${selectedFieldName}`}
                          {currentPage > 1 && <span className="text-[#8C887E]"> (page {currentPage})</span>}
                        </span>
                      )}
                    </span>

                    {sourceEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowProviderDetails((prev) => !prev)}
                        aria-expanded={showProviderDetails}
                        className="inline-flex items-center gap-1.5 text-xs hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] underline decoration-dotted underline-offset-4 cursor-pointer"
                        title="Show which sources answered this search"
                      >
                        <span className={`inline-block w-2 h-2 rounded-full ${troubled === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span>{answered} of {sourceEntries.length} sources answered</span>
                      </button>
                    )}

                    {searchQuota && (
                      searchQuota.limit === 'unlimited' ? null : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-xs border ${
                            searchQuota.remaining <= 2
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-bold'
                              : 'bg-[#F2EFE8] dark:bg-[#1E1D1A] text-[#524F47] dark:text-[#A8A49C] border-[#D5D1C7] dark:border-[#38352F]'
                          }`}
                          title={`Your plan includes ${searchQuota.limit} searches a day. The count starts again at midnight, Dhaka time.`}
                        >
                          {searchQuota.remaining} of {searchQuota.limit} searches left today
                        </span>
                      )
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-[#605D55] dark:text-[#9A968D]">
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span className="sr-only">Sort results</span>
                      <select
                        value={sortOrder}
                        onChange={(e) => {
                          setSortOrder(e.target.value);
                          setSessionId(null);
                          setCurrentPage(1);
                        }}
                        aria-label="Sort results"
                        className="bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-1.5 text-xs text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 cursor-pointer"
                      >
                        <option value="relevance">Best match</option>
                        <option value="citations">Most cited</option>
                        <option value="newest">Newest first</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => setIsProposeOpen(true)}
                      className="bg-white dark:bg-[#1E1D1A] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-2.5 py-1.5 rounded-sm text-xs transition flex items-center gap-1.5 cursor-pointer font-semibold"
                      title="Add your own thesis to the archive"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                      <span>Deposit a thesis</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Search failed (network / server) – show a clear message instead of stale results */}
            {searchError && !loadingTheses && (
              <div role="alert" className="bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 p-4 rounded-sm flex items-start justify-between gap-3 text-xs text-rose-900 dark:text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">Search could not be completed</strong>
                    <span>{searchError}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchTheses(currentPage)}
                  className="min-h-[44px] px-3 font-mono-meta font-bold underline hover:text-rose-950 dark:hover:text-white cursor-pointer shrink-0"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Daily Search Quota Exceeded Alert Banner */}
            {searchQuotaError && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 dark:border-amber-600 p-4 rounded-sm text-xs space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span className="font-serif-title text-sm">
                      You have used today's {searchQuotaError.limit} searches
                    </span>
                  </div>
                  <span className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-[11px] font-mono-meta font-bold px-2 py-0.5 rounded-xs uppercase">
                    {isTrialPlan(searchQuotaError.plan) ? '7-day trial' : 'Free plan'}
                  </span>
                </div>
                <p className="text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
                  The count starts again at midnight, Dhaka time. Premium has <strong>no daily search limit</strong>. Saved papers, collections and Topic Check results you already have stay available.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsMembershipOpen(true)}
                    className="px-3.5 py-1.5 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 rounded-xs font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 dark:text-neutral-950" />
                    <span>See plans</span>
                  </button>
                </div>
              </div>
            )}

            {/* Which sources answered (opened from the results header) */}
            {showProviderDetails && Object.keys(providerTelemetry).length > 0 && (
              <div className="bg-[#FAF9F5] dark:bg-[#161513] border border-[#E5E2DA] dark:border-[#2C2A26] px-3 py-2 rounded-sm text-xs flex items-center gap-1.5 flex-wrap">
                {Object.entries(providerTelemetry).map(([prov, meta]) => {
                  const isFulfilled = meta.status === 'fulfilled';
                  const isDegraded = meta.status === 'degraded';
                  const isSkipped = meta.status === 'skipped_unsupported_filter' || meta.status === 'idle';
                  const count = meta.count ?? meta.returnedCount ?? 0;
                  return (
                    <span
                      key={prov}
                      className={`px-1.5 py-0.5 rounded-xs text-[11px] border ${
                        isFulfilled && count > 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-semibold'
                          : isDegraded
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                          : isFulfilled || isSkipped
                          ? 'bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800'
                          : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                      }`}
                      title={
                        meta.error ||
                        (isFulfilled
                          ? `${count} results`
                          : isSkipped
                          ? 'This source cannot apply the filters you chose, so it was not asked'
                          : 'This source did not answer')
                      }
                    >
                      {prov}: {isFulfilled ? (count > 0 ? count : 'nothing found') : isDegraded ? 'slow or partial' : isSkipped ? 'not asked' : 'no answer'}
                    </span>
                  );
                })}
                <button type="button" onClick={() => setIsCoverageOpen(true)} className="ml-auto underline text-[#605D55] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer">
                  About the sources
                </button>
              </div>
            )}

            {/* Federated Outage Alert */}
            {totalTechnicalFailure && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 p-4 rounded-sm flex items-start justify-between gap-3 text-xs text-rose-900 dark:text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">The outside sources could not be reached</strong>
                    <span>This is usually temporary. The search was not counted against your daily limit.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchTheses(currentPage)}
                  className="min-h-[44px] px-3 font-mono-meta font-bold underline hover:text-rose-950 dark:hover:text-white cursor-pointer"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Active Filter Chips */}
            {hasAnyActiveFilter && (
              <div className="p-2.5 bg-[#FAF9F5] dark:bg-[#161513] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm text-xs font-mono-meta flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#737067] dark:text-[#9A968D] mr-1">Filters on:</span>
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-xs text-[#1C1B18] dark:text-[#F0EDE6]">
                    <span>“{searchQuery}”</span>
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
                    <span>Type: {PUBLICATION_TYPE_LABELS[selectedPublicationType] || selectedPublicationType}</span>
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
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-amber-800 dark:text-amber-400 hover:text-black dark:hover:text-white underline text-[11px] ml-auto cursor-pointer font-bold"
                >
                  Remove all
                </button>
              </div>
            )}

            {/* Catalog Entries List */}
            {loadingTheses ? (
              <div className="py-16 text-center text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] space-y-2">
                <div className="w-6 h-6 border-2 border-[#1C1B18] dark:border-amber-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div>Searching the archive and the outside sources…</div>
              </div>
            ) : theses.length === 0 && searchError ? null : theses.length === 0 ? (
              <div className="bg-white dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] p-12 text-center rounded-sm space-y-4 transition-colors">
                <p className="text-sm font-medium text-[#1C1B18] dark:text-[#F0EDE6]">
                  {totalTechnicalFailure
                    ? 'The sources could not be reached just now.'
                    : 'Nothing matched this search.'}
                </p>
                <p className="text-xs text-[#737067] dark:text-[#9A968D] max-w-md mx-auto">
                  {totalTechnicalFailure
                    ? 'Try again in a moment. This search was not counted against your daily limit.'
                    : 'Try fewer or different words, or remove a filter such as year, publisher or discipline.'}
                </p>
                <div>
                  {totalTechnicalFailure ? (
                    <button
                      type="button"
                      onClick={() => fetchTheses(currentPage)}
                      className="px-4 py-2 bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 hover:bg-black dark:hover:bg-amber-300 text-xs font-mono-meta rounded-sm cursor-pointer shadow-2xs font-semibold"
                    >
                      Try again
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs font-mono-meta text-[#1C1B18] dark:text-amber-400 underline hover:text-black dark:hover:text-amber-300 cursor-pointer font-semibold"
                    >
                      Remove all filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
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
                    initiallySaved={savedPaperIds.has(String(thesis._id || thesis.id))}
                    onSavedChange={fetchUserSavedCount}
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
                      <span>Previous</span>
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
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-[11px] text-[#737067] dark:text-[#9A968D]">
                    Page <strong>{currentPage}</strong>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    )}
  </div>

      {/* Floating comparison bar: visible on every screen size while papers are selected */}
      {comparisonPapers.length > 0 && activeTab !== 'library' && !isComparisonOpen && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-xl">
          <div className="bg-purple-800 dark:bg-purple-900 text-white rounded-sm shadow-xl border border-purple-600 px-3 py-2 flex items-center justify-between gap-3 text-xs font-mono-meta">
            <span className="flex items-center gap-2 min-w-0">
              <Scale className="w-4 h-4 shrink-0" />
              <span className="truncate">
                <strong>{comparisonPapers.length}</strong>/5 selected for comparison
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setComparisonPapers([])}
                className="px-2 py-1 text-purple-100 hover:text-white underline cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsComparisonOpen(true)}
                className="px-3 py-1.5 bg-white text-purple-900 rounded-xs font-bold cursor-pointer hover:bg-purple-50"
              >
                Compare
              </button>
            </span>
          </div>
        </div>
      )}

      {/* Windows (mounted only while open).
          ORDER MATTERS: all of them share the same z-index, so a window that appears later in this
          list is drawn on top. Anything that can be opened FROM another window must come after it.
          Paper details can open Author, Institution, Cite, Report and Membership, so those follow it.
          Membership can be opened from almost anywhere, so it sits near the end. */}
      <Suspense fallback={null}>
      {/* Saved Papers */}
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

      {/* Collections */}
      {isCollectionsOpen && (
        <CollectionsModal
          isOpen={isCollectionsOpen}
          onClose={() => setIsCollectionsOpen(false)}
        />
      )}

      {/* Comparison Matrix */}
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

      {/* Topic Alerts */}
      {isTopicAlertsOpen && (
        <TopicAlertsModal
          isOpen={isTopicAlertsOpen}
          onClose={() => setIsTopicAlertsOpen(false)}
        />
      )}

      {/* Deposit / Propose Thesis */}
      {isProposeOpen && (
        <ProposeThesisModal
          isOpen={isProposeOpen}
          onClose={() => setIsProposeOpen(false)}
          onCreated={handleThesisCreated}
        />
      )}

      {/* Paper Details */}
      {selectedDetailThesis && (
        <PublicationDetailModal
          key={selectedDetailThesis._id || selectedDetailThesis.id || selectedDetailThesis.doi || selectedDetailThesis.title || 'detail-modal'}
          thesis={selectedDetailThesis}
          initialTab={detailInitialTab}
          onClose={closePaperDetails}
          onSelectPublisher={(pub) => {
            setSessionId(null);
            setSelectedPublisher(pub);
            setCurrentPage(1);
            setSelectedDetailThesis(null);
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
          initiallySaved={savedPaperIds.has(String(selectedDetailThesis._id || selectedDetailThesis.id))}
          onRequireAuth={(msg) => {
            if (showNotice) {
              showNotice(msg || 'Sign in to use this.', 'info');
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
          onViewThesisDetail={(work) => {
            // Close the author window first: Paper Details is drawn underneath it
            setInspectingAuthor(null);
            setDetailInitialTab('overview');
            setSelectedDetailThesis(work);
          }}
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

      {/* Cite (above Paper Details and Saved Papers) */}
      {citingThesis && (
        <CiteModal
          thesis={citingThesis}
          onClose={() => setCitingThesis(null)}
        />
      )}

      {/* Report an issue (above Paper Details) */}
      {reportingThesis && (
        <ReportIssueModal
          thesis={reportingThesis}
          onClose={() => setReportingThesis(null)}
        />
      )}

      {/* Membership & bKash (above Paper Details) */}
      {isMembershipOpen && (
        <MembershipModal
          isOpen={isMembershipOpen}
          onClose={() => {
            setIsMembershipOpen(false);
            fetchMembershipStatus();
          }}
        />
      )}

      {/* Message the team (feedback) */}
      {isFeedbackOpen && (
        <FeedbackModal
          isOpen={isFeedbackOpen}
          onClose={() => setIsFeedbackOpen(false)}
          pageContext={selectedDetailThesis ? `paper:${String(selectedDetailThesis._id || selectedDetailThesis.id).slice(0, 100)}` : activeTab}
        />
      )}

      {/* Coverage & Limitations Disclosure Modal */}
      {isCoverageOpen && (
        <CoverageModal
          isOpen={isCoverageOpen}
          onClose={() => setIsCoverageOpen(false)}
        />
      )}

      {/* Student Management (Admin) */}
      {isStudentManagementOpen && (
        <StudentManagementModal
          isOpen={isStudentManagementOpen}
          onClose={() => setIsStudentManagementOpen(false)}
          onRefreshStats={() => {
            fetchPendingStudents();
          }}
        />
      )}

      {/* Verification Drawer (Admin) */}
      {isDrawerOpen && (
        <VerificationDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          pendingStudents={pendingStudents}
          onEvaluate={handleEvaluateStudent}
          loading={evaluating}
        />
      )}
      </Suspense>

      {comparisonPapers.length > 0 && activeTab !== 'library' && <div className="h-16" aria-hidden="true" />}

      {/* Footer */}
      <footer className="border-t border-[#E2DFD8] dark:border-[#2C2A26] bg-white dark:bg-[#141312] py-4 mt-8 transition-colors">
        <div className="max-w-7xl mx-auto px-4 md:px-6 text-xs font-mono-meta text-[#737067] dark:text-[#9A968D] flex flex-wrap items-center justify-between gap-4">
          <span>The Thesis Archive</span>
          <span className="flex items-center gap-4">
            <button type="button" onClick={() => setIsFeedbackOpen(true)} className="underline hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer">
              Message the team
            </button>
            <button type="button" onClick={() => setIsCoverageOpen(true)} className="underline hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer">
              About the sources
            </button>
          </span>
        </div>
      </footer>
    </div>
  );
}
