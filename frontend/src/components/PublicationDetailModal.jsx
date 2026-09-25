import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  Database,
  Building2,
  Quote,
  ExternalLink,
  X,
  AlertTriangle,
  Scale,
  Flag,
  Globe,
  Sparkles,
  Lock,
  RefreshCw,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Users,
  Calendar,
  Layers,
  Info,
} from 'lucide-react';

export default function PublicationDetailModal({
  thesis,
  onClose,
  initialTab = 'overview',
  onSelectPublisher,
  onCite,
  onAddToCompare,
  inComparison = false,
  onReportIssue,
  onOpenMembership,
  onSelectAuthor,
  onViewInstitutionLandscape,
  onRequireAuth,
  onSavedPapersChange,
}) {
  const { isAuthenticated } = useAuth();
  const currentThesisId = thesis ? (thesis._id || thesis.id || thesis.doi || thesis.title || '') : '';
  const currentThesisIdRef = useRef(currentThesisId);

  // Active Tab: 'overview' | 'authors' | 'datasets' | 'citations' | 'summary'
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingPaper, setSavingPaper] = useState(false);
  const [copiedDoi, setCopiedDoi] = useState(false);

  const [summaryState, setSummaryState] = useState({
    requested: false,
    loading: false,
    data: null,
    error: null,
    language: 'en',
    copied: false,
  });

  const [datasetsState, setDatasetsState] = useState({
    requested: false,
    loading: false,
    linked: [],
    related: [],
    isLocked: false,
    isQuotaExceeded: false,
    isError: false,
    message: '',
    quota: null,
  });

  // Background body scroll locking while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Keyboard Escape key handler to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Strictly reset dataset discovery and tabs whenever a different thesis is opened
  useEffect(() => {
    currentThesisIdRef.current = currentThesisId;
    setActiveTab(initialTab || 'overview');
    setShowAllAuthors(false);
    setCopiedDoi(false);
    setDatasetsState({
      requested: false,
      loading: false,
      linked: [],
      related: [],
      isLocked: false,
      isQuotaExceeded: false,
      isError: false,
      message: '',
      quota: null,
    });
    setSummaryState({
      requested: false,
      loading: false,
      data: null,
      error: null,
      language: 'en',
      copied: false,
    });
  }, [currentThesisId, initialTab]);

  // Check saved papers state on load
  useEffect(() => {
    let isMounted = true;
    if (isAuthenticated && thesis) {
      const paperId = thesis._id || thesis.id;
      axios
        .get('/api/user/saved-papers')
        .then((res) => {
          if (!isMounted) return;
          const exists = (res.data || []).some(
            (p) => (p.paperId || p._id) === paperId || (thesis.doi && p.doi === thesis.doi)
          );
          setIsSaved(exists);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, currentThesisId]);

  if (!thesis) return null;

  const handleToggleSave = async () => {
    if (!isAuthenticated) {
      if (onRequireAuth) {
        onRequireAuth('Sign in with your student account to save papers to your personal library.');
      } else {
        alert('Sign in with your student account to save papers.');
      }
      return;
    }

    const paperId = thesis._id || thesis.id;
    try {
      setSavingPaper(true);
      if (isSaved) {
        await axios.delete(`/api/user/saved-papers/${encodeURIComponent(paperId)}`);
        setIsSaved(false);
      } else {
        await axios.post('/api/user/saved-papers', {
          paperId: paperId,
          title: thesis.title,
          doi: thesis.doi || '',
          authors: thesis.author || (Array.isArray(thesis.authors) ? thesis.authors.map((a) => a.name).join(', ') : ''),
          year: thesis.publishedYear,
          pdfUrl: thesis.pdfUrl || '',
          publicationType: thesis.publicationType || 'unknown',
          degreeType: thesis.degreeType || '',
          venue: thesis.venue || '',
          publisher: thesis.publisher || '',
          notes: '',
        });
        setIsSaved(true);
      }
      if (onSavedPapersChange) {
        onSavedPapersChange();
      }
    } catch (err) {
      console.error('Failed to toggle save paper in modal:', err);
    } finally {
      setSavingPaper(false);
    }
  };

  const fetchDatasets = async () => {
    const requestedThesisId = currentThesisId;
    try {
      setDatasetsState((s) => ({
        ...s,
        requested: true,
        loading: true,
        isLocked: false,
        isQuotaExceeded: false,
        isError: false,
        message: '',
      }));

      const id = thesis._id || thesis.id || 'ext';
      const params = {
        doi: thesis.doi || '',
        title: thesis.title || '',
        datasetUrl: thesis.datasetUrl || '',
        datasetFormat: thesis.datasetFormat || '',
        datasetSize: thesis.datasetSize || '',
      };

      const res = await axios.get(`/api/thesis/${encodeURIComponent(id)}/datasets`, { params });

      // Stale check: discard if user switched to another paper while request was in-flight
      if (currentThesisIdRef.current !== requestedThesisId) {
        return;
      }

      setDatasetsState({
        requested: true,
        loading: false,
        linked: res.data.linkedDatasets || [],
        related: res.data.relatedDatasets || [],
        isLocked: false,
        isQuotaExceeded: false,
        isError: false,
        message: '',
        quota: res.data.datasetQuota || null,
      });
    } catch (err) {
      if (currentThesisIdRef.current !== requestedThesisId) {
        return;
      }
      const isLocked = err.response?.status === 403 || err.response?.data?.code === 'FEATURE_LOCKED';
      const isQuotaExceeded = err.response?.status === 429 || err.response?.data?.code === 'DAILY_DATASET_LIMIT_REACHED';

      setDatasetsState({
        requested: true,
        loading: false,
        linked: [],
        related: [],
        isLocked,
        isQuotaExceeded,
        isError: !isLocked && !isQuotaExceeded,
        message: err.response?.data?.message || 'Scholarly dataset discovery service encountered an error.',
        quota: err.response?.data?.datasetQuota || null,
      });
    }
  };

  const handleFindDatasetsClick = () => {
    setActiveTab('datasets');
    if (!datasetsState.requested && !datasetsState.loading) {
      fetchDatasets();
    }
  };

  const fetchSummary = async (lang = summaryState.language, force = false) => {
    if (!isAuthenticated) {
      if (onRequireAuth) {
        onRequireAuth('Sign in with your student account to generate AI-assisted research summaries.');
      } else {
        alert('Sign in with your student account to generate research summaries.');
      }
      return;
    }

    const requestedThesisId = currentThesisId;
    setSummaryState((s) => ({
      ...s,
      requested: true,
      loading: true,
      error: null,
      language: lang,
    }));

    try {
      const id = thesis._id || thesis.id || 'ext';
      const payload = {
        language: lang,
        forceRefresh: force,
        paper: {
          title: thesis.title,
          abstract: thesis.abstract,
          doi: thesis.doi || '',
          pdfUrl: thesis.pdfUrl || '',
        },
      };

      const res = await axios.post(`/api/thesis/${encodeURIComponent(id)}/summary`, payload);
      if (currentThesisIdRef.current !== requestedThesisId) return;

      if (res.data.enabled === false) {
        setSummaryState((s) => ({
          ...s,
          loading: false,
          data: null,
          error: res.data.message || 'Quick Summary is currently disabled by administrator configuration.',
        }));
        return;
      }

      setSummaryState((s) => ({
        ...s,
        loading: false,
        data: res.data,
        error: null,
      }));
    } catch (err) {
      if (currentThesisIdRef.current !== requestedThesisId) return;
      const isQuota = err.response?.status === 429 || err.response?.data?.code === 'DAILY_SUMMARY_LIMIT_REACHED';
      const msg = err.response?.data?.message || 'Failed to generate summary for this paper.';
      setSummaryState((s) => ({
        ...s,
        loading: false,
        error: isQuota ? `[Daily Limit] ${msg}` : msg,
      }));
    }
  };

  const copySummaryText = () => {
    if (!summaryState.data?.summary) return;
    const s = summaryState.data.summary;
    const text = [
      `TITLE: ${thesis.title}`,
      `TL;DR: ${s.tldr}`,
      `OBJECTIVE: ${s.researchObjective}`,
      `METHODOLOGY: ${s.methodology}`,
      `DATA/SAMPLE: ${s.datasetSample}`,
      `MAIN FINDINGS: ${s.mainFindings}`,
      `LIMITATIONS: ${s.limitations}`,
      `KEY TERMS: ${(s.keyTerms || []).join(', ')}`,
      `[AI-generated summary via Project Panther - verify against original paper]`,
    ].join('\n\n');

    navigator.clipboard.writeText(text);
    setSummaryState((prev) => ({ ...prev, copied: true }));
    setTimeout(() => {
      setSummaryState((prev) => ({ ...prev, copied: false }));
    }, 2000);
  };

  const handleQuickSummaryClick = () => {
    setActiveTab('summary');
    if (!summaryState.requested && !summaryState.loading) {
      fetchSummary(summaryState.language);
    }
  };

  const copyDoiToClipboard = () => {
    if (thesis.doi) {
      navigator.clipboard.writeText(thesis.doi);
      setCopiedDoi(true);
      setTimeout(() => setCopiedDoi(false), 2000);
    }
  };

  const pubType = (thesis.publicationType || thesis.degreeType || 'article').toLowerCase();
  const isThesisType = pubType.includes('thesis') || pubType.includes('dissertation') || pubType.includes('capstone');
  const isPreprint = pubType.includes('preprint') || thesis.source === 'arXiv';
  const isConference = pubType.includes('proceedings') || pubType.includes('conference');

  const isDirectPdf = Boolean(
    thesis.isDirectPdf ||
    (thesis.pdfUrl && (
      thesis.pdfUrl.endsWith('.pdf') ||
      thesis.pdfUrl.includes('/pdf/') ||
      thesis.pdfUrl.includes('pmc.ncbi.nlm.nih.gov') ||
      thesis.pdfUrl.includes('/servlets/purl')
    ))
  );

  const authorshipsList = thesis.authorships || [];
  const authorsCount = authorshipsList.length > 0
    ? authorshipsList.length
    : (Array.isArray(thesis.authors) ? thesis.authors.length : (thesis.author ? 1 : 0));
  const visibleAuthors = showAllAuthors ? authorshipsList : authorshipsList.slice(0, 4);
  const unrecordedCount = authorshipsList.filter(
    (a) => (!a.institutions || a.institutions.length === 0) && !a.rawAffiliation
  ).length;

  const totalDatasetsCount = datasetsState.linked.length + datasetsState.related.length;

  return (
    <div
      role="dialog"
      aria-labelledby="modal-paper-title"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FAF9F5] border border-[#D5D1C7] rounded-sm w-full max-w-4xl shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden text-[#1C1B18]">
        {/* ========================================================================= */}
        {/* 1. STICKY SUMMARY HEADER                                                  */}
        {/* ========================================================================= */}
        <div className="p-4 sm:p-5 bg-white border-b border-[#E2DFD8] shrink-0 space-y-3">
          {/* Top Meta Badges & Close Button */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono-meta">
              <span
                className={`px-2 py-0.5 rounded-sm font-bold uppercase text-[11px] ${
                  isThesisType
                    ? 'bg-blue-100 text-blue-900 border border-blue-300'
                    : isPreprint
                    ? 'bg-amber-100 text-amber-950 border border-amber-300'
                    : isConference
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}
              >
                {isThesisType
                  ? (thesis.degreeType || 'Thesis / Dissertation')
                  : isPreprint
                  ? 'Preprint (Not Peer-Reviewed)'
                  : isConference
                  ? 'Conference Paper'
                  : 'Journal Article'}
              </span>

              {thesis.publishedYear && (
                <span className="bg-[#FAF9F5] border border-[#D5D1C7] text-[#605D55] px-2 py-0.5 rounded-sm text-[11px]">
                  {thesis.publishedYear}
                </span>
              )}

              {thesis.isPeerReviewed === true && (
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-sm text-[11px] font-bold">
                  ✓ Peer-Reviewed
                </span>
              )}

              {thesis.source && (
                <span className="bg-[#1C1B18] text-white px-2 py-0.5 rounded-sm font-bold uppercase text-[10px]">
                  {thesis.source}
                </span>
              )}

              {thesis.isOpenAccess !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold ${
                    thesis.isOpenAccess
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                  }`}
                >
                  {thesis.isOpenAccess ? 'Open Access' : 'Subscription'}
                </span>
              )}

              {thesis.citationCount !== undefined && thesis.citationCount !== null && (
                <span className="bg-emerald-50/80 border border-emerald-200 text-[#2C6B3F] font-bold px-2 py-0.5 rounded-sm text-[11px]">
                  ★ {thesis.citationCount.toLocaleString()} {thesis.citationCount === 1 ? 'Citation' : 'Citations'}
                </span>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close publication details"
              className="text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 px-2 transition"
            >
              <span className="font-bold">[✕ CLOSE]</span>
            </button>
          </div>

          {/* Paper Title */}
          <h2
            id="modal-paper-title"
            className="text-lg sm:text-xl md:text-2xl font-serif-title font-normal text-[#1C1B18] leading-snug tracking-tight"
          >
            {thesis.title}
          </h2>

          {/* Primary Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F0ECE1]">
            {/* Direct PDF / Repository Access */}
            {isDirectPdf && thesis.pdfUrl && (
              <a
                href={thesis.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-3.5 py-2 bg-[#1C1B18] hover:bg-[#2E2C28] text-white rounded-sm font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Direct PDF ↗</span>
              </a>
            )}

            {!isDirectPdf && thesis.pdfUrl && (
              <a
                href={thesis.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-3.5 py-2 bg-white hover:bg-[#FAF9F5] border border-[#1C1B18] text-[#1C1B18] rounded-sm font-mono-meta text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                <Globe className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Repository Page ↗</span>
              </a>
            )}

            {!thesis.pdfUrl && thesis.doi && (
              <a
                href={`https://doi.org/${thesis.doi}`}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-3.5 py-2 bg-white hover:bg-[#FAF9F5] border border-[#D5D1C7] text-blue-900 rounded-sm font-mono-meta text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-blue-800 shrink-0" />
                <span>Publisher DOI ↗</span>
              </a>
            )}

            {/* Save to Library */}
            <button
              type="button"
              onClick={handleToggleSave}
              disabled={savingPaper}
              className={`min-h-[44px] px-3.5 py-2 rounded-sm font-mono-meta text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                isSaved
                  ? 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200/70'
                  : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18]'
              }`}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="w-4 h-4 text-amber-800" />
                  <span>Saved in Library</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4 text-[#737067]" />
                  <span>Save to Library</span>
                </>
              )}
            </button>

            {/* Cite */}
            <button
              type="button"
              onClick={() => onCite && onCite(thesis)}
              className="min-h-[44px] px-3.5 py-2 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] rounded-sm font-mono-meta text-xs font-medium transition flex items-center gap-2 cursor-pointer"
            >
              <Quote className="w-4 h-4 text-[#2C6B3F]" />
              <span>Cite</span>
            </button>

            {/* Add to Compare */}
            <button
              type="button"
              onClick={() => onAddToCompare && onAddToCompare(thesis)}
              className={`min-h-[44px] px-3.5 py-2 rounded-sm font-mono-meta text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
                inComparison
                  ? 'bg-purple-100 text-purple-900 border border-purple-300 font-bold'
                  : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18]'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>{inComparison ? 'In Comparison' : 'Add to Compare'}</span>
            </button>

            {/* Find Datasets Shortcut */}
            <button
              type="button"
              onClick={handleFindDatasetsClick}
              className={`min-h-[44px] px-3.5 py-2 rounded-sm font-mono-meta text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'datasets'
                  ? 'bg-emerald-50 text-emerald-950 border border-emerald-300 font-bold'
                  : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18]'
              }`}
            >
              <Database className="w-4 h-4 text-[#2C6B3F]" />
              <span>
                Datasets {totalDatasetsCount > 0 ? `(${totalDatasetsCount})` : ''}
              </span>
            </button>

            {/* Quick Summary Shortcut */}
            <button
              type="button"
              onClick={handleQuickSummaryClick}
              className={`min-h-[44px] px-3.5 py-2 rounded-sm font-mono-meta text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-amber-100 text-amber-950 border border-amber-400 font-bold'
                  : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Quick Summary</span>
            </button>

            {/* Report Issue */}
            {onReportIssue && (
              <button
                type="button"
                onClick={() => onReportIssue(thesis)}
                className="min-h-[44px] min-w-[44px] px-2.5 py-2 text-[#8C887E] hover:text-red-700 transition flex items-center justify-center cursor-pointer ml-auto"
                title="Report issue or broken metadata"
                aria-label="Report issue"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. TABBED NAVIGATION BAR                                                  */}
        {/* ========================================================================= */}
        <div className="bg-white border-b border-[#E2DFD8] px-4 sm:px-5 flex gap-1 sm:gap-2 overflow-x-auto shrink-0 font-mono-meta text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-[44px] px-3.5 py-2.5 border-b-2 flex items-center gap-2 transition cursor-pointer font-bold whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-[#1C1B18] text-[#1C1B18] bg-[#FAF9F5]'
                : 'border-transparent text-[#737067] hover:text-[#1C1B18] hover:bg-[#FAF9F5]/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`min-h-[44px] px-3.5 py-2.5 border-b-2 flex items-center gap-2 transition cursor-pointer font-bold whitespace-nowrap ${
              activeTab === 'summary'
                ? 'border-amber-600 text-amber-950 bg-amber-50/50'
                : 'border-transparent text-[#737067] hover:text-[#1C1B18] hover:bg-[#FAF9F5]/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Quick Summary</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('authors')}
            className={`min-h-[44px] px-3.5 py-2.5 border-b-2 flex items-center gap-2 transition cursor-pointer font-bold whitespace-nowrap ${
              activeTab === 'authors'
                ? 'border-[#1C1B18] text-[#1C1B18] bg-[#FAF9F5]'
                : 'border-transparent text-[#737067] hover:text-[#1C1B18] hover:bg-[#FAF9F5]/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              Authors & Affiliations {authorsCount > 0 ? `(${authorsCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('datasets')}
            className={`min-h-[44px] px-3.5 py-2.5 border-b-2 flex items-center gap-2 transition cursor-pointer font-bold whitespace-nowrap ${
              activeTab === 'datasets'
                ? 'border-[#1C1B18] text-[#1C1B18] bg-[#FAF9F5]'
                : 'border-transparent text-[#737067] hover:text-[#1C1B18] hover:bg-[#FAF9F5]/60'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              Full Text & Datasets {totalDatasetsCount > 0 ? `(${totalDatasetsCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('citations')}
            className={`min-h-[44px] px-3.5 py-2.5 border-b-2 flex items-center gap-2 transition cursor-pointer font-bold whitespace-nowrap ${
              activeTab === 'citations'
                ? 'border-[#1C1B18] text-[#1C1B18] bg-[#FAF9F5]'
                : 'border-transparent text-[#737067] hover:text-[#1C1B18] hover:bg-[#FAF9F5]/60'
            }`}
          >
            <Quote className="w-3.5 h-3.5" />
            <span>Citations & Provenance</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 3. SCROLLABLE TAB CONTENT                                                 */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Retraction Alert */}
              {thesis.isRetracted && (
                <div className="bg-red-50 border border-red-300 p-4 rounded-sm text-xs font-mono-meta text-red-900 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
                    <span>RETRACTED OR FORMALLY DISPUTED PUBLICATION</span>
                  </div>
                  <p className="text-xs text-red-800 leading-relaxed">
                    This publication has been flagged as retracted or formally disputed by the editorial board or original publisher. Interpret all methodology, conclusions, and empirical data with extreme caution.
                  </p>
                  {thesis.retractionNoticeUrl && (
                    <a
                      href={thesis.retractionNoticeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-bold text-red-950 inline-flex items-center gap-1 pt-1 hover:text-black min-h-[44px]"
                    >
                      <span>Inspect Official Publisher Retraction Statement ↗</span>
                    </a>
                  )}
                </div>
              )}

              {/* Sourced Citation Metrics Banner */}
              {thesis.citationCount !== undefined && thesis.citationCount !== null && (
                <div className="bg-emerald-50/60 border border-emerald-200 p-3.5 rounded-sm flex items-center justify-between gap-3 text-xs font-mono-meta">
                  <div className="flex items-center gap-2.5">
                    <Quote className="w-4 h-4 text-[#2C6B3F] shrink-0" />
                    <div>
                      <div className="font-bold text-[#1C1B18] text-sm">
                        ★ {thesis.citationCount.toLocaleString()} {thesis.citationCount === 1 ? 'Citation' : 'Citations'} Indexed
                      </div>
                      <div className="text-[11px] text-[#737067] mt-0.5">
                        Provider Source: <strong>{thesis.citationMetrics?.source || thesis.citationSource || 'OpenAlex'}</strong>
                        {thesis.citationMetrics?.retrievedAt && ` • Snapshot: ${thesis.citationMetrics.retrievedAt}`}
                      </div>
                    </div>
                  </div>
                  {thesis.citationMetrics?.sourceId && (
                    <span className="text-[11px] text-[#737067] bg-white border border-emerald-200 px-2 py-1 rounded-sm">
                      OA:{thesis.citationMetrics.sourceId.split('/').pop()}
                    </span>
                  )}
                </div>
              )}

              {/* Publisher & Venue Details */}
              <div className="bg-white border border-[#D5D1C7] p-4 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider block">
                      Publisher / Journal / Academic Venue
                    </span>
                    <span className="text-base font-bold text-[#1C1B18] block">
                      {thesis.publisher || thesis.venue || thesis.university || 'Scholarly Depository'}
                    </span>
                    <div className="text-xs text-[#605D55] mt-1 flex items-center gap-3">
                      <span>Year: <strong>{thesis.publishedYear || 'Year unrecorded'}</strong></span>
                      {thesis.doi && (
                        <span>
                          DOI:{' '}
                          <button
                            type="button"
                            onClick={copyDoiToClipboard}
                            className="font-mono-meta text-blue-900 underline hover:text-black cursor-pointer"
                            title="Click to copy DOI"
                          >
                            {thesis.doi}
                          </button>
                          {copiedDoi && <span className="ml-1 text-[#2C6B3F] font-bold">✓ Copied</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {(thesis.publisher || thesis.venue) && onSelectPublisher && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectPublisher(thesis.publisher || thesis.venue);
                      onClose();
                    }}
                    className="min-h-[44px] bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-3.5 py-2 rounded-sm text-xs font-mono-meta transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
                  >
                    <span>Filter other works from this venue &rarr;</span>
                  </button>
                )}
              </div>

              {/* Degree Awarding Institution (if thesis/dissertation) */}
              {thesis.awardingInstitution?.name && (
                <div className="bg-blue-50/80 border border-blue-200 p-3.5 rounded-sm flex items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-[11px] font-mono-meta uppercase tracking-wider text-blue-900 block font-bold">
                      Degree Awarding Institution
                    </span>
                    <span className="font-bold text-[#1C1B18] text-sm block">
                      {thesis.awardingInstitution.name}
                    </span>
                    {thesis.awardingInstitution.evidence && (
                      <span className="text-[11px] font-mono-meta text-[#737067] block mt-0.5">
                        Evidence: {thesis.awardingInstitution.evidence}
                      </span>
                    )}
                  </div>
                  {thesis.awardingInstitution.countryCode && (
                    <span className="bg-white border border-blue-300 text-blue-900 px-2.5 py-1 rounded-sm font-mono-meta font-bold text-xs">
                      Country: {thesis.awardingInstitution.countryCode}
                    </span>
                  )}
                </div>
              )}

              {/* Abstract Section with High Legibility */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#605D55]">
                  Abstract & Methodological Summary
                </h4>
                <div className="font-sans text-[15px] sm:text-base text-[#2E2C28] leading-relaxed font-normal bg-white p-5 sm:p-6 border border-[#E5E2DA] rounded-sm whitespace-pre-line shadow-2xs">
                  {thesis.abstract || 'No abstract text available in source archive.'}
                </div>
              </div>

              {/* Research Disciplines & Subjects */}
              {thesis.subjects && thesis.subjects.length > 0 && (
                <div className="space-y-2 bg-white p-4 border border-[#E5E2DA] rounded-sm">
                  <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider font-bold block">
                    Research Disciplines & Subject Classification:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {thesis.subjects.map((sub) => (
                      <span
                        key={sub.id || sub.label}
                        className="bg-[#FAF9F5] border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1 rounded-xs text-xs font-mono-meta font-bold uppercase"
                      >
                        {sub.shortLabel || sub.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Licensing & Access Model */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-4 border border-[#E5E2DA] rounded-sm text-xs font-sans">
                <div>
                  <span className="text-[11px] font-mono-meta text-[#737067] uppercase block">Open Access Licensing:</span>
                  <span className="font-medium text-[#1C1B18] mt-0.5 block">
                    {thesis.isOpenAccess
                      ? (thesis.license || 'Open Access (Free lawful access)')
                      : 'Subscription / Paywalled metadata record'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono-meta text-[#737067] uppercase block">Archival Identifier:</span>
                  <span className="font-mono-meta text-[#1C1B18] mt-0.5 block truncate">
                    {thesis.doi ? `DOI: ${thesis.doi}` : `ID: ${thesis._id || thesis.id}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AUTHORS & AFFILIATIONS */}
          {activeTab === 'authors' && (
            <div className="space-y-4">
              {authorshipsList.length > 0 ? (
                <div className="space-y-3 bg-white p-5 border border-[#E5E2DA] rounded-sm shadow-2xs">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[#F0ECE1]">
                    <span className="text-[#737067] text-xs font-mono-meta uppercase tracking-wider font-bold">
                      Indexed Researchers & Affiliations ({authorshipsList.length})
                    </span>

                    {/* Single Quiet Summary for unrecorded affiliations */}
                    {unrecordedCount > 0 && (
                      <span className="text-[11px] font-mono-meta text-[#8C887E] italic">
                        {unrecordedCount} of {authorshipsList.length} author{unrecordedCount > 1 ? 's have' : ' has'} no institutional affiliation recorded in source registry
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-[#F2EFE8]">
                    {visibleAuthors.map((auth, idx) => (
                      <div
                        key={idx}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {onSelectAuthor && (auth.author?.id || auth.author?.name) ? (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectAuthor(auth.author);
                                onClose();
                              }}
                              className="text-sm font-bold text-[#1C1B18] hover:text-amber-800 underline transition cursor-pointer text-left min-h-[44px] flex items-center"
                            >
                              {auth.author?.name || 'Unrecorded Author'}
                            </button>
                          ) : (
                            <strong className="text-sm text-[#1C1B18] min-h-[44px] flex items-center">
                              {auth.author?.name || 'Unrecorded Author'}
                            </strong>
                          )}

                          {auth.author?.orcid && (
                            <a
                              href={
                                auth.author.orcid.startsWith('http')
                                  ? auth.author.orcid
                                  : `https://orcid.org/${auth.author.orcid}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded-xs font-mono-meta font-bold hover:bg-emerald-100 transition inline-flex items-center gap-1"
                            >
                              <span>ORCID: {auth.author.orcid.replace(/^https?:\/\/orcid\.org\//, '')} ↗</span>
                            </a>
                          )}
                        </div>

                        <div className="text-xs text-[#524F47] sm:text-right">
                          {auth.institutions && auth.institutions.length > 0 ? (
                            auth.institutions.map((inst, iIdx) => (
                              <span key={iIdx} className="inline-flex items-center gap-1">
                                {iIdx > 0 && '; '}
                                {onViewInstitutionLandscape && (inst.id || inst.openAlexId) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onViewInstitutionLandscape(inst);
                                      onClose();
                                    }}
                                    className="font-medium text-[#1C1B18] hover:text-amber-800 underline transition cursor-pointer text-left"
                                    title="View OpenAlex Research Landscape for this institution"
                                  >
                                    {inst.name}
                                  </button>
                                ) : (
                                  <span className="font-medium text-[#1C1B18]">{inst.name}</span>
                                )}
                                {inst.countryCode && (
                                  <span className="font-mono-meta text-[11px] text-[#737067]">
                                    [{inst.countryCode}]
                                  </span>
                                )}
                              </span>
                            ))
                          ) : (
                            <span className="text-[#8C887E] text-[11px] italic">
                              {auth.rawAffiliation || 'Affiliation not recorded'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Toggle Show All Authors Button */}
                  {authorshipsList.length > 4 && (
                    <div className="pt-3 border-t border-[#F0ECE1]">
                      <button
                        type="button"
                        onClick={() => setShowAllAuthors(!showAllAuthors)}
                        className="w-full min-h-[44px] py-2.5 px-4 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] font-mono-meta text-xs uppercase tracking-wider font-bold rounded-sm transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {showAllAuthors ? (
                          <span>▲ Show Fewer Authors (Top 4 of {authorshipsList.length})</span>
                        ) : (
                          <span>▼ Show All {authorshipsList.length} Authors & Institutional Affiliations</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white p-5 border border-[#E5E2DA] rounded-sm space-y-3 text-xs shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[#737067] block text-[11px] font-mono-meta uppercase">Researcher / Authors:</span>
                      <strong className="text-sm text-[#1C1B18] block mt-0.5">
                        {thesis.author || (Array.isArray(thesis.authors) ? thesis.authors.map((a) => a.name).join(', ') : 'Unspecified')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#737067] block text-[11px] font-mono-meta uppercase">Faculty Advisor / Committee:</span>
                      <strong className="text-sm text-[#1C1B18] block mt-0.5">
                        {thesis.advisor || 'Not recorded in source metadata'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#737067] block text-[11px] font-mono-meta uppercase">Affiliation / Institution:</span>
                      <span className="text-sm text-[#1C1B18] block mt-0.5">
                        {thesis.university || 'Open Scholarly Depository'} {thesis.department ? `• ${thesis.department}` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#737067] block text-[11px] font-mono-meta uppercase">Open Access Licensing:</span>
                      <span className="text-sm text-[#1C1B18] block mt-0.5">
                        {thesis.isOpenAccess ? (thesis.license || 'Open Access (Free lawful access)') : 'Subscription / Paywalled metadata record'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FULL TEXT & DATASETS */}
          {activeTab === 'datasets' && (
            <div className="space-y-5">
              {/* Verified Full Text Access Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#605D55]">
                  Verified Full Text & Repository Access
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono-meta text-xs">
                  {isDirectPdf && thesis.pdfUrl && (
                    <a
                      href={thesis.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3.5 bg-white border border-[#1C1B18] hover:bg-[#FAF9F5] rounded-sm flex items-center justify-between transition group min-h-[44px] shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <div className="font-bold text-[#1C1B18]">Open Direct PDF Document</div>
                          <div className="text-[11px] text-[#2C6B3F]">Verified Direct PDF (1:1 full-text file)</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-[#1C1B18] shrink-0" />
                    </a>
                  )}

                  {!isDirectPdf && thesis.pdfUrl && (
                    <a
                      href={thesis.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3.5 bg-white border border-[#D5D1C7] hover:border-[#1C1B18] rounded-sm flex items-center justify-between transition group min-h-[44px] shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-blue-700 shrink-0" />
                        <div>
                          <div className="font-bold text-[#1C1B18]">Full-Text Repository Page</div>
                          <div className="text-[11px] text-[#737067]">Publisher or institutional repository</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-[#737067] shrink-0" />
                    </a>
                  )}

                  {thesis.doi && (
                    <a
                      href={`https://doi.org/${thesis.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3.5 bg-white border border-[#D5D1C7] hover:border-[#1C1B18] rounded-sm flex items-center justify-between transition group min-h-[44px] shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <ExternalLink className="w-5 h-5 text-blue-800 shrink-0" />
                        <div>
                          <div className="font-bold text-blue-900">Official Publisher DOI</div>
                          <div className="text-[11px] text-[#737067]">doi.org/{thesis.doi}</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-blue-800 shrink-0" />
                    </a>
                  )}
                </div>
              </div>

              {/* Authentic Open Datasets Discovery Section */}
              <div className="space-y-3 pt-3 border-t border-[#E2DFD8]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#605D55] flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#2C6B3F]" />
                    <span>Open Research Datasets Discovery (DataCite & Zenodo)</span>
                  </h4>

                  {datasetsState.quota && datasetsState.quota.limit !== null && (
                    <span className="text-[11px] font-mono-meta bg-blue-50 border border-blue-200 text-blue-900 px-2.5 py-1 rounded-sm">
                      Trial Quota: <strong>{datasetsState.quota.remaining} of {datasetsState.quota.limit} lookups left</strong> today
                    </span>
                  )}
                </div>

                {/* Pre-Fetch Action Banner (avoid burning quota prematurely) */}
                {!datasetsState.requested && (
                  <div className="p-5 bg-white border border-[#D5D1C7] rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-2xs">
                    <div className="space-y-1.5">
                      <span className="font-serif-title font-medium text-base text-[#1C1B18] block">
                        Discover Linked & Related Open Datasets
                      </span>
                      <p className="text-[#605D55] text-xs leading-relaxed max-w-xl font-sans">
                        Query verified Open Science depositories (DataCite, Zenodo) for supplementary raw datasets, benchmark corpora, and author-deposited data files associated with this publication.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={fetchDatasets}
                      className="min-h-[44px] shrink-0 bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-5 py-2.5 rounded-sm font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Find Datasets</span>
                    </button>
                  </div>
                )}

                {/* Loading State */}
                {datasetsState.loading && (
                  <div className="p-8 bg-white border border-[#D5D1C7] rounded-sm text-center text-xs font-mono-meta text-[#737067] space-y-3">
                    <div className="w-6 h-6 border-2 border-[#2C6B3F] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <div className="font-medium text-[#1C1B18]">Querying DataCite and Zenodo for authentic research datasets...</div>
                    <div className="text-[11px] text-[#8C887E]">Verifying relationship semantics and supplemental linkages</div>
                  </div>
                )}

                {/* Locked State for Free Tier */}
                {datasetsState.isLocked && (
                  <div className="p-5 bg-amber-50/90 border border-amber-200 rounded-sm text-xs space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
                        <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Research Datasets (Premium or Trial Required)</span>
                      </div>
                      <span className="bg-amber-200/80 text-amber-900 text-[10px] font-mono-meta font-bold px-2 py-0.5 rounded-xs">
                        Feature Restricted
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed font-sans">
                      Direct access to linked raw data files, benchmark collections, and related open datasets is reserved for Premium members and 7-Day Trial users.
                    </p>
                    {onOpenMembership && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenMembership();
                        }}
                        className="min-h-[44px] px-4 py-2 bg-[#1C1B18] hover:bg-[#2E2C28] text-white rounded-xs font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs"
                      >
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>Activate 7-Day Free Trial or Upgrade to Premium</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Quota Exceeded State */}
                {datasetsState.isQuotaExceeded && (
                  <div className="p-5 bg-amber-50 border border-amber-300 rounded-sm text-xs space-y-3">
                    <div className="flex items-center gap-2 font-bold text-amber-950 text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Daily Trial Dataset Discovery Limit Reached (5/5 Lookups)</span>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed font-sans">
                      You have reached your 7-Day Research Trial limit of 5 paper dataset lookups today. Quota automatically resets at midnight (Asia/Dhaka time). Upgrade to Premium for uninhibited, unlimited dataset discovery.
                    </p>
                    {onOpenMembership && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenMembership();
                        }}
                        className="min-h-[44px] px-4 py-2 bg-amber-900 hover:bg-black text-white rounded-xs font-mono-meta text-xs uppercase tracking-wider font-bold transition cursor-pointer"
                      >
                        Upgrade to Premium (৳500 / 6 Mo)
                      </button>
                    )}
                  </div>
                )}

                {/* Provider Outage / Error with Retry */}
                {datasetsState.isError && (
                  <div className="p-5 bg-rose-50 border border-rose-200 rounded-sm text-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-900 text-sm">Dataset Discovery Provider Temporarily Unavailable</span>
                      <button
                        type="button"
                        onClick={fetchDatasets}
                        className="min-h-[44px] px-3.5 py-1.5 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-xs font-mono-meta text-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Discovery</span>
                      </button>
                    </div>
                    <p className="text-xs text-rose-800 leading-relaxed">
                      Could not reach DataCite or Zenodo upstream endpoints. Outages are not cached; click retry to query again without consuming your trial quota.
                    </p>
                  </div>
                )}

                {/* Linked Datasets with Truthful Relationship Badges */}
                {datasetsState.requested && !datasetsState.loading && datasetsState.linked.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-xs font-mono-meta font-bold uppercase text-[#2C6B3F] block">
                      ✓ Directly Linked Research Datasets ({datasetsState.linked.length})
                    </span>
                    <div className="space-y-2.5">
                      {datasetsState.linked.map((d) => {
                        const isDirect =
                          d.relationType === 'Direct Supplemental Dataset' ||
                          d.relationType === 'IsSupplementTo' ||
                          d.relationType === 'IsSupplementedBy';
                        return (
                          <a
                            key={d.id || d.url}
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`p-4 rounded-sm flex items-start justify-between gap-3 transition group min-h-[44px] ${
                              isDirect
                                ? 'bg-emerald-50/50 border border-emerald-200 hover:border-emerald-500'
                                : 'bg-blue-50/50 border border-blue-200 hover:border-blue-500'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded-2xs text-[10px] font-mono-meta font-bold uppercase ${
                                    isDirect
                                      ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                                      : 'bg-blue-100 text-blue-900 border border-blue-300'
                                  }`}
                                >
                                  {isDirect ? 'Direct Supplemental Dataset' : 'Referenced Work / Citation'}
                                </span>
                                <span className="bg-white border border-[#D5D1C7] px-2 py-0.5 rounded-2xs text-[10px] font-mono-meta text-[#1C1B18]">
                                  {d.source || 'DataCite'}
                                </span>
                              </div>

                              <div className="font-bold text-sm text-[#1C1B18] group-hover:text-[#2C6B3F] leading-snug">
                                {d.title}
                              </div>

                              {d.evidence && (
                                <div className="text-xs text-[#605D55] italic font-sans">
                                  Evidence: {d.evidence}
                                </div>
                              )}

                              <div className="text-xs font-mono-meta text-[#737067] flex items-center gap-2 flex-wrap">
                                {d.formats?.length > 0 && <span>Format: {d.formats.join(', ')}</span>}
                                {d.size && <span>• Size: {d.size}</span>}
                                <span>• License: {d.license || 'Unknown / Not specified'}</span>
                                {d.doi && <span>• DOI: {d.doi}</span>}
                              </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-[#2C6B3F] shrink-0 mt-1" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Discovered Topic Suggestions */}
                {datasetsState.requested && !datasetsState.loading && datasetsState.related.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <span className="text-xs font-mono-meta font-bold uppercase text-amber-900 block flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                      <span>Discovered Topic Suggestions via DataCite & Zenodo ({datasetsState.related.length})</span>
                    </span>
                    <div className="space-y-2.5">
                      {datasetsState.related.map((d) => (
                        <a
                          key={d.id || d.url}
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-4 bg-amber-50/40 border border-amber-200 hover:border-amber-600 rounded-sm flex items-start justify-between gap-3 transition group min-h-[44px]"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-[10px] font-mono-meta">
                              <span className="bg-amber-100 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-2xs font-bold uppercase">
                                Related Data
                              </span>
                              <span className="bg-white border border-amber-200 px-2 py-0.5 rounded-2xs">
                                {d.source || 'Zenodo'}
                              </span>
                            </div>

                            <div className="font-semibold text-sm text-[#1C1B18] group-hover:text-amber-900 leading-snug">
                              {d.title}
                            </div>

                            <div className="text-xs font-mono-meta text-[#737067] flex items-center gap-2 flex-wrap">
                              {d.formats?.length > 0 && <span>Format: {d.formats.join(', ')}</span>}
                              {d.size && <span>• Size: {d.size}</span>}
                              <span>• License: {d.license || 'Unknown / Not specified'}</span>
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-amber-800 shrink-0 mt-1" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State after search */}
                {datasetsState.requested &&
                  !datasetsState.loading &&
                  !datasetsState.isLocked &&
                  !datasetsState.isQuotaExceeded &&
                  !datasetsState.isError &&
                  datasetsState.linked.length === 0 &&
                  datasetsState.related.length === 0 && (
                    <div className="p-4 bg-white border border-[#E2DFD8] rounded-sm text-xs font-mono-meta text-[#737067]">
                      No open research datasets currently registered in DataCite or Zenodo for this publication.
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* TAB 4: CITATIONS & PROVENANCE */}
          {activeTab === 'citations' && (
            <div className="space-y-5">
              {/* Citation Generator Action Banner */}
              <div className="p-4 bg-white border border-[#D5D1C7] rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-1">
                  <span className="font-serif-title font-medium text-base text-[#1C1B18] block">
                    Academic Citation Generator
                  </span>
                  <p className="text-xs text-[#605D55] leading-relaxed">
                    Export formatted citations directly in BibTeX (LaTeX), RIS (EndNote/Zotero/Mendeley), or APA 7th edition.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCite && onCite(thesis)}
                  className="min-h-[44px] shrink-0 bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-2.5 rounded-sm font-mono-meta text-xs uppercase tracking-wider font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Quote className="w-4 h-4 text-emerald-400" />
                  <span>Generate Citation</span>
                </button>
              </div>

              {/* Indexed Citation Metrics Breakdown */}
              {thesis.citationCount !== undefined && thesis.citationCount !== null && (
                <div className="bg-white border border-[#D5D1C7] p-4 rounded-sm space-y-2 shadow-2xs">
                  <h4 className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#605D55]">
                    Indexed Citation Provenance & Telemetry
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono-meta">
                    <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm">
                      <span className="text-[10px] text-[#737067] uppercase block">Indexed Citations:</span>
                      <strong className="text-base text-[#1C1B18] font-bold">
                        {thesis.citationCount.toLocaleString()}
                      </strong>
                    </div>
                    <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm">
                      <span className="text-[10px] text-[#737067] uppercase block">Attributed Source:</span>
                      <strong className="text-sm text-[#1C1B18]">
                        {thesis.citationMetrics?.source || thesis.citationSource || 'OpenAlex'}
                      </strong>
                    </div>
                    <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm">
                      <span className="text-[10px] text-[#737067] uppercase block">Snapshot Harvested:</span>
                      <span className="text-xs text-[#524F47]">
                        {thesis.citationMetrics?.retrievedAt || 'Current Session'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Global Scholarly Citation Indices */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#605D55]">
                  Global Scholarly Citation Indices
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono-meta text-xs">
                  <a
                    href={`https://scholar.google.com/scholar?q=%22${encodeURIComponent(thesis.title)}%22`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 bg-white border border-[#D5D1C7] hover:border-blue-700 rounded-sm flex items-center justify-between transition min-h-[44px] shadow-2xs group"
                  >
                    <div>
                      <div className="font-bold text-blue-900 group-hover:underline">Google Scholar ↗</div>
                      <div className="text-[11px] text-[#737067]">Citation metrics & mirrors</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-blue-700" />
                  </a>

                  <a
                    href={`https://www.semanticscholar.org/search?q=${encodeURIComponent(thesis.title)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 bg-white border border-[#D5D1C7] hover:border-purple-700 rounded-sm flex items-center justify-between transition min-h-[44px] shadow-2xs group"
                  >
                    <div>
                      <div className="font-bold text-purple-900 group-hover:underline">Semantic Scholar ↗</div>
                      <div className="text-[11px] text-[#737067]">AI summaries & impact</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-purple-700" />
                  </a>

                  <a
                    href={`https://www.researchgate.net/search/publication?q=${encodeURIComponent(thesis.title)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 bg-white border border-[#D5D1C7] hover:border-teal-700 rounded-sm flex items-center justify-between transition min-h-[44px] shadow-2xs group"
                  >
                    <div>
                      <div className="font-bold text-teal-900 group-hover:underline">ResearchGate ↗</div>
                      <div className="text-[11px] text-[#737067]">Author discussions</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-teal-700" />
                  </a>
                </div>
              </div>

              {/* Provenance & Registry Identifiers */}
              <div className="bg-white border border-[#D5D1C7] p-4 rounded-sm space-y-2 text-xs font-mono-meta shadow-2xs">
                <h4 className="font-bold uppercase tracking-wider text-[#605D55] text-[11px]">
                  Archival Provenance & Registry Metadata
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#737067] uppercase block">DOI Resolver:</span>
                    {thesis.doi ? (
                      <a
                        href={`https://doi.org/${thesis.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-900 underline hover:text-black font-bold break-all"
                      >
                        https://doi.org/{thesis.doi}
                      </a>
                    ) : (
                      <span className="text-[#8C887E] italic">Unassigned / Not registered</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-[#737067] uppercase block">Primary Upstream Source:</span>
                    <span className="text-[#1C1B18] font-bold">
                      {thesis.source || 'OpenAlex Scholarly Knowledge Graph'}
                    </span>
                  </div>

                  {thesis.citationMetrics?.sourceId && (
                    <div>
                      <span className="text-[10px] text-[#737067] uppercase block">OpenAlex Canonical Record:</span>
                      <a
                        href={thesis.citationMetrics.sourceId}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-900 underline hover:text-black break-all"
                      >
                        {thesis.citationMetrics.sourceId}
                      </a>
                    </div>
                  )}

                  {thesis.isOpenAccess !== undefined && (
                    <div>
                      <span className="text-[10px] text-[#737067] uppercase block">Access Status:</span>
                      <span className="font-semibold text-[#1C1B18]">
                        {thesis.isOpenAccess ? 'Lawful Open Access Repository' : 'Subscription / Restricted'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: GROUNDED QUICK SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-5">
              {/* Header with Language Choice & Actions */}
              <div className="bg-white border border-[#D5D1C7] p-4 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-600" />
                    <h3 className="font-serif-title text-base sm:text-lg font-bold text-[#1C1B18]">
                      Grounded Research Quick Summary
                    </h3>
                  </div>
                  <p className="text-xs text-[#605D55] font-mono-meta mt-1">
                    Direct factual decomposition extracted from author text. Zero hallucination policy.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Language Selector */}
                  <div className="inline-flex rounded-sm border border-[#D5D1C7] p-0.5 bg-[#FAF9F5] text-xs font-mono-meta">
                    <button
                      type="button"
                      onClick={() => {
                        fetchSummary('en');
                      }}
                      className={`px-3 py-1.5 rounded-xs font-bold transition min-h-[36px] ${
                        summaryState.language === 'en'
                          ? 'bg-[#1C1B18] text-white'
                          : 'text-[#605D55] hover:text-black'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        fetchSummary('bn');
                      }}
                      className={`px-3 py-1.5 rounded-xs font-bold transition min-h-[36px] ${
                        summaryState.language === 'bn'
                          ? 'bg-[#1C1B18] text-white'
                          : 'text-[#605D55] hover:text-black'
                      }`}
                    >
                      বাংলা (Bangla)
                    </button>
                  </div>

                  {summaryState.data?.summary && (
                    <>
                      <button
                        type="button"
                        onClick={copySummaryText}
                        className="min-h-[40px] px-3 py-1.5 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] rounded-sm text-xs font-mono-meta font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Copy structured summary to clipboard"
                      >
                        <Bookmark className="w-3.5 h-3.5 text-amber-700" />
                        <span>{summaryState.copied ? '✓ Copied' : 'Copy Summary'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fetchSummary(summaryState.language, true)}
                        className="min-h-[40px] px-3 py-1.5 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] rounded-sm text-xs font-mono-meta font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Regenerate summary"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* State 1: Not Requested Yet (Honest trigger screen) */}
              {!summaryState.requested && !summaryState.loading && (
                <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-6 sm:p-8 rounded-sm text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-800">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="max-w-lg mx-auto space-y-2">
                    <h4 className="text-base font-bold text-[#1C1B18]">
                      Extract Grounded Key Research Findings
                    </h4>
                    <p className="text-xs sm:text-sm text-[#524F47] leading-relaxed">
                      Generate an objective, methodology, data/sample, and findings breakdown. Project Panther strictly forbids hallucination — missing experimental data is marked as “Not reported”.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => fetchSummary(summaryState.language)}
                      className="min-h-[44px] px-6 py-2.5 bg-[#1C1B18] hover:bg-[#2E2C28] text-white font-mono-meta text-xs uppercase tracking-wider font-bold rounded-sm transition shadow-2xs cursor-pointer inline-flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Generate Grounded Summary</span>
                    </button>
                  </div>
                </div>
              )}

              {/* State 2: Loading Skeleton */}
              {summaryState.loading && (
                <div className="space-y-4 animate-pulse">
                  <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-sm flex items-center gap-3">
                    <RefreshCw className="w-4 h-4 text-amber-700 animate-spin" />
                    <span className="text-xs font-mono-meta text-amber-900 font-bold">
                      Analyzing author text and verifying grounded claims...
                    </span>
                  </div>
                  <div className="bg-white p-5 border border-[#E5E2DA] rounded-sm space-y-3">
                    <div className="h-4 bg-[#E5E2DA] rounded w-1/4"></div>
                    <div className="h-3 bg-[#F0ECE1] rounded w-full"></div>
                    <div className="h-3 bg-[#F0ECE1] rounded w-5/6"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-5 border border-[#E5E2DA] rounded-sm space-y-3">
                      <div className="h-4 bg-[#E5E2DA] rounded w-1/3"></div>
                      <div className="h-3 bg-[#F0ECE1] rounded w-full"></div>
                      <div className="h-3 bg-[#F0ECE1] rounded w-2/3"></div>
                    </div>
                    <div className="bg-white p-5 border border-[#E5E2DA] rounded-sm space-y-3">
                      <div className="h-4 bg-[#E5E2DA] rounded w-1/3"></div>
                      <div className="h-3 bg-[#F0ECE1] rounded w-full"></div>
                      <div className="h-3 bg-[#F0ECE1] rounded w-2/3"></div>
                    </div>
                  </div>
                </div>
              )}

              {/* State 3: Error State */}
              {summaryState.error && !summaryState.loading && (
                <div className="bg-red-50 border border-red-300 p-5 rounded-sm space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
                    <span>Summary Service Notice</span>
                  </div>
                  <p className="text-xs text-red-800 leading-relaxed">
                    {summaryState.error}
                  </p>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => fetchSummary(summaryState.language, true)}
                      className="min-h-[44px] px-4 py-2 bg-red-900 text-white font-mono-meta text-xs uppercase font-bold rounded-sm transition cursor-pointer"
                    >
                      Retry Generation
                    </button>
                    {summaryState.error.includes('Daily Limit') && onOpenMembership && (
                      <button
                        type="button"
                        onClick={onOpenMembership}
                        className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-mono-meta text-xs uppercase font-bold rounded-sm transition cursor-pointer"
                      >
                        Upgrade Membership Plan
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* State 4: Summary Result View */}
              {summaryState.data?.summary && !summaryState.loading && (
                <div className="space-y-4">
                  {/* Coverage & AI Disclaimer Notice Banner */}
                  <div className="p-3.5 bg-amber-50/70 border border-amber-300 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono-meta">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-sm font-bold uppercase text-[10px] ${
                          summaryState.data.coverage === 'full_text'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-400'
                        }`}
                      >
                        {summaryState.data.coverage === 'full_text'
                          ? '✓ Full-Text Grounded'
                          : '⚡ Based on Abstract Only'}
                      </span>
                      <span className="text-[#605D55]">
                        {summaryState.data.summary.disclaimer || 'AI-generated; verify against the original paper'}
                      </span>
                    </div>

                    {summaryState.data.quota && (
                      <span className="text-[#737067] text-[11px]">
                        Daily Quota: {summaryState.data.quota.used}/{summaryState.data.quota.limit} used
                      </span>
                    )}
                  </div>

                  {/* TL;DR Highlight Card */}
                  <div className="bg-white border-2 border-[#1C1B18] p-5 sm:p-6 rounded-sm space-y-2 shadow-2xs">
                    <span className="text-[11px] font-mono-meta text-amber-800 uppercase tracking-wider font-bold block">
                      TL;DR Executive Summary:
                    </span>
                    <p className="font-sans text-[15px] sm:text-base text-[#1C1B18] leading-relaxed font-medium">
                      {summaryState.data.summary.tldr}
                    </p>
                  </div>

                  {/* Structured Core Aspects Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Research Objective */}
                    <div className="bg-white border border-[#D5D1C7] p-5 rounded-sm space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider font-bold block">
                        🎯 Research Objective / Problem:
                      </span>
                      <p className="text-sm text-[#2E2C28] leading-relaxed">
                        {summaryState.data.summary.researchObjective}
                      </p>
                    </div>

                    {/* Methodology */}
                    <div className="bg-white border border-[#D5D1C7] p-5 rounded-sm space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider font-bold block">
                        🔬 Methodology & Study Design:
                      </span>
                      <p className="text-sm text-[#2E2C28] leading-relaxed">
                        {summaryState.data.summary.methodology}
                      </p>
                    </div>

                    {/* Data / Sample / Dataset */}
                    <div className="bg-white border border-[#D5D1C7] p-5 rounded-sm space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider font-bold block">
                        📊 Data & Corpus / Sample:
                      </span>
                      <p className="text-sm text-[#2E2C28] leading-relaxed">
                        {summaryState.data.summary.datasetSample}
                      </p>
                    </div>

                    {/* Main Findings */}
                    <div className="bg-white border border-[#D5D1C7] p-5 rounded-sm space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider font-bold block">
                        💡 Key Empirical Findings:
                      </span>
                      <p className="text-sm text-[#2E2C28] leading-relaxed">
                        {summaryState.data.summary.mainFindings}
                      </p>
                    </div>
                  </div>

                  {/* Limitations Card */}
                  <div className="bg-white border border-[#D5D1C7] p-5 rounded-sm space-y-2 shadow-2xs">
                    <span className="text-[11px] font-mono-meta text-amber-900 uppercase tracking-wider font-bold block">
                      ⚠️ Author-Stated Limitations:
                    </span>
                    <p className="text-sm text-[#524F47] leading-relaxed">
                      {summaryState.data.summary.limitations}
                    </p>
                    {summaryState.data.summary.inferredLimitations && (
                      <p className="text-xs text-[#737067] italic pt-1 border-t border-[#F0ECE1]">
                        Cautious Inferred Scope: {summaryState.data.summary.inferredLimitations}
                      </p>
                    )}
                  </div>

                  {/* Key Terms */}
                  {summaryState.data.summary.keyTerms?.length > 0 && (
                    <div className="bg-white border border-[#D5D1C7] p-4 rounded-sm space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider font-bold block">
                        🏷️ Key Domain Terms:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {summaryState.data.summary.keyTerms.map((term, tIdx) => (
                          <span
                            key={tIdx}
                            className="bg-[#FAF9F5] border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1 rounded-sm text-xs font-mono-meta font-medium"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full Text Section References */}
                  {summaryState.data.summary.evidenceReferences?.length > 0 && (
                    <div className="bg-white border border-[#D5D1C7] p-4 rounded-sm space-y-2 shadow-2xs">
                      <span className="text-[11px] font-mono-meta text-emerald-800 uppercase tracking-wider font-bold block">
                        📑 Full-Text Evidence References:
                      </span>
                      <div className="space-y-2">
                        {summaryState.data.summary.evidenceReferences.map((ev, eIdx) => (
                          <div key={eIdx} className="text-xs p-2.5 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm font-mono-meta">
                            <strong className="text-[#1C1B18] block">{ev.sectionOrPage}</strong>
                            <span className="text-[#605D55] italic">"{ev.quote}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. ANCHORED ACTION FOOTER                                                 */}
        {/* ========================================================================= */}
        <div className="px-4 sm:px-6 py-3 border-t border-[#E2DFD8] bg-white flex items-center justify-between gap-3 font-mono-meta text-xs shrink-0 flex-wrap">
          <div className="flex items-center gap-2 text-[#737067] text-[11px]">
            <span>Panther Scholarly Archive</span>
            {thesis.doi && (
              <>
                <span>•</span>
                <span className="hidden sm:inline font-mono">DOI: {thesis.doi}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCite && onCite(thesis)}
              className="min-h-[44px] bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-3.5 py-2 rounded-sm transition cursor-pointer flex items-center gap-1.5"
            >
              <Quote className="w-3.5 h-3.5 text-[#2C6B3F]" />
              <span className="font-bold">Cite</span>
            </button>

            <button
              onClick={onClose}
              className="min-h-[44px] bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-5 py-2 rounded-sm uppercase tracking-wider font-bold transition cursor-pointer shadow-2xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
