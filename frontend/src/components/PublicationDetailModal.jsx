import React, { useState, useEffect, useRef } from 'react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { buildSummaryView, buildSummaryCopyText, buildFullTextView, buildFullTextCopyText } from '../utils/summarySections';
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
  Copy,
  BookOpen,
  Users,
  Calendar,
  Layers,
  Info,
  Search,
  Code,
  Loader2,
  ArrowRight,
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
  initiallySaved = false,
}) {
  useEscapeToClose(onClose, Boolean(thesis));
  const { isAuthenticated } = useAuth();
  const currentThesisId = thesis ? (thesis._id || thesis.id || thesis.doi || thesis.title || '') : '';
  const currentThesisIdRef = useRef(currentThesisId);
  const summaryRequestRef = useRef(0);

  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [showAllAuthors, setShowAllAuthors] = useState(false);
  const [isSaved, setIsSaved] = useState(Boolean(initiallySaved));
  useEffect(() => {
    setIsSaved(Boolean(initiallySaved));
  }, [initiallySaved]);
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

  const [fullTextState, setFullTextState] = useState({ requested: false, loading: false, isLocked: false, data: null });
  const [freePdfState, setFreePdfState] = useState({ requested: false, loading: false, result: null });

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

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

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
      isLocked: false,
      data: null,
      error: null,
      language: 'en',
      copied: false,
    });
    setFullTextState({ requested: false, loading: false, isLocked: false, data: null });
    setFreePdfState({ requested: false, loading: false, result: null });
  }, [currentThesisId, initialTab]);

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

  const handleToggleSave = async () => {
    if (!isAuthenticated) {
      if (onRequireAuth) {
        onRequireAuth('Sign in with your student account to save papers to your personal library.');
      } else {
        console.warn('Sign in with your student account to save papers.');
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
      const message = err.response?.data?.message || 'Could not update your saved papers. Please try again.';
      if (onRequireAuth) onRequireAuth(message);
      if (err.response?.data?.code === 'QUOTA_EXCEEDED' && onOpenMembership) onOpenMembership();
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
        message: err.response?.data?.message || 'The dataset sources could not be reached. Please try again.',
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

  const handleSummaryTabClick = () => {
    setActiveTab('summary');
    if (!summaryState.requested && !summaryState.loading) {
      fetchSummary(summaryState.language);
    }
  };

  const fetchSummary = async (lang = summaryState.language, force = false, mode = summaryState.analysisMode || 'extractive') => {
    const requestedThesisId = currentThesisId;
    const requestId = ++summaryRequestRef.current;
    setSummaryState((s) => ({
      ...s,
      requested: true,
      loading: true,
      isLocked: false,
      error: null,
      quotaReached: false,
      language: lang,
      analysisMode: mode,
      data: null,
    }));

    try {
      const id = thesis._id || thesis.id || 'ext';
      const payload = {
        language: lang,
        forceRefresh: force,
        analysisMode: mode,
        paper: {
          title: thesis.title,
          abstract: thesis.abstract,
          doi: thesis.doi || '',
          pdfUrl: thesis.pdfUrl || '',
        },
      };

      const res = await axios.post(`/api/thesis/${encodeURIComponent(id)}/summary`, payload);
      if (currentThesisIdRef.current !== requestedThesisId || summaryRequestRef.current !== requestId) return;

      if (res.data.enabled === false) {
        setSummaryState((s) => ({
          ...s,
          loading: false,
          isLocked: false,
          data: null,
          error: res.data.message || 'Quick Summary is switched off at the moment.',
        }));
        return;
      }

      setSummaryState((s) => ({
        ...s,
        loading: false,
        isLocked: false,
        data: res.data,
        error: null,
      }));
    } catch (err) {
      if (currentThesisIdRef.current !== requestedThesisId || summaryRequestRef.current !== requestId) return;
      if (err.response?.status === 401) {
        if (onRequireAuth) {
          onRequireAuth('Sign in to use Quick Summary.');
        }
        setSummaryState((s) => ({
          ...s,
          loading: false,
          isLocked: true,
          error: 'Sign in to use Quick Summary.',
        }));
        return;
      }
      const isLocked = err.response?.status === 403 || err.response?.data?.code === 'FEATURE_LOCKED';
      if (isLocked) {
        setSummaryState((s) => ({
          ...s,
          loading: false,
          isLocked: true,
          error: err.response?.data?.message || 'Quick Summary is included in the 7-day trial and in Premium. It is not part of the free plan.',
        }));
        return;
      }
      const isQuota = err.response?.status === 429 || err.response?.data?.code === 'DAILY_SUMMARY_LIMIT_REACHED';
      const msg = err.response?.data?.message || 'The summary could not be built for this paper. Please try again.';
      setSummaryState((s) => ({
        ...s,
        loading: false,
        isLocked: false,
        error: msg,
        quotaReached: isQuota,
      }));
    }
  };

  useEffect(() => {
    if (activeTab === 'summary' && !summaryState.requested && !summaryState.loading) {
      fetchSummary(summaryState.language);
    }
  }, [activeTab, currentThesisId]);

  const copySummaryText = () => {
    if (!summaryState.data?.summary && !fullTextState.data?.available) return;
    const parts = [
      summaryState.data?.summary ? buildSummaryCopyText(thesis.title, summaryState.data.summary, summaryState.language) : thesis.title,
      buildFullTextCopyText(fullTextState.data, summaryState.language),
    ].filter(Boolean);

    navigator.clipboard.writeText(parts.join('\n\n'));
    setSummaryState((prev) => ({ ...prev, copied: true }));
    setTimeout(() => {
      setSummaryState((prev) => ({ ...prev, copied: false }));
    }, 2000);
  };

  const fetchFullText = async () => {
    const requestedThesisId = currentThesisId;
    setFullTextState({ requested: true, loading: true, isLocked: false, data: null });
    try {
      const id = thesis._id || thesis.id || 'ext';
      const res = await axios.post(`/api/thesis/${encodeURIComponent(id)}/full-text`, {
        paper: { pdfUrl: freePdfState.result?.pdfUrl || thesis.pdfUrl || '', doi: thesis.doi || '' },
      });
      if (currentThesisIdRef.current !== requestedThesisId) return;
      setFullTextState({ requested: true, loading: false, isLocked: false, data: res.data });
    } catch (err) {
      if (currentThesisIdRef.current !== requestedThesisId) return;
      const locked = err.response?.status === 403 || err.response?.data?.code === 'FEATURE_LOCKED';
      setFullTextState({
        requested: true,
        loading: false,
        isLocked: locked,
        data: {
          available: false,
          retryable: !locked,
          message: err.response?.data?.message || 'The full paper could not be read just now. Please try again.',
        },
      });
    }
  };

  const findFreePdf = async () => {
    if (!thesis.doi) return;
    const requestedThesisId = currentThesisId;
    setFreePdfState({ requested: true, loading: true, result: null });
    try {
      const res = await axios.get('/api/thesis/open-access/find', { params: { doi: thesis.doi } });
      if (currentThesisIdRef.current !== requestedThesisId) return;
      setFreePdfState({ requested: true, loading: false, result: res.data });
    } catch (err) {
      if (currentThesisIdRef.current !== requestedThesisId) return;
      setFreePdfState({
        requested: true,
        loading: false,
        result: { found: false, message: err.response?.data?.message || 'The free-PDF lookup could not be done just now. Please try again.' },
      });
    }
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

  if (!thesis) return null;

  const pubType = (thesis.publicationType || thesis.degreeType || 'article').toLowerCase();

  const sourceName = thesis.source || thesis.sources?.[0]?.provider || '';
  const isLocalRecord = /local (archive|repository)|thesis archive/i.test(sourceName) || /^THESIS-/.test(String(thesis.catalogId || ''));
  const accessState = thesis.isOpenAccess === true ? 'open' : thesis.isOpenAccess === false ? 'closed' : isLocalRecord ? 'open' : 'unknown';
  const isHarvested = thesis.origin === 'harvest';
  const originalUrl = /^https?:\/\//i.test(String(thesis.sourceUrl || '')) ? thesis.sourceUrl : '';
  const sourceDisplay = isHarvested
    ? `${thesis.sourceRepositoryName || sourceName || 'University repository'} (copied from their repository)`
    : isLocalRecord
    ? 'The Thesis Archive (deposited here)'
    : sourceName || 'Not stated';
  const EVIDENCE_WORDS = {
    local_archive_thesis_metadata: 'Stated on the thesis record in this archive',
    openalex_institution: 'From the OpenAlex record',
    author_affiliation: 'From the author affiliation',
  };
  const describeEvidence = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (EVIDENCE_WORDS[text]) return EVIDENCE_WORDS[text];
    return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text) ? '' : text;
  };
  const hasReadableCopy = Boolean(thesis.pdfUrl || freePdfState.result?.pdfUrl);
  const canLookForFreePdf = Boolean(thesis.doi) && !thesis.pdfUrl;
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

  if (!thesis) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="modal-paper-title"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-neutral-950/70 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FAF9F5] dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm w-full max-w-4xl shadow-2xl relative h-[96vh] sm:h-[90vh] max-h-[900px] flex flex-col overflow-hidden text-[#1C1B18] dark:text-[#F0EDE6]">
        <div className="px-4 sm:px-5 pt-3 pb-3 bg-white dark:bg-[#201F1C] border-b border-[#E2DFD8] dark:border-[#2C2A26] shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono-meta">
              <span
                className={`px-2 py-0.5 rounded-sm font-bold uppercase text-[11px] ${
                  isThesisType
                    ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                    : isPreprint
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : isConference
                    ? 'bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                    : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}
              >
                {isThesisType
                  ? (thesis.degreeType || 'Thesis')
                  : isPreprint
                  ? 'Preprint (not peer-reviewed)'
                  : isConference
                  ? 'Conference paper'
                  : 'Journal article'}
              </span>

              {thesis.publishedYear && (
                <span className="bg-[#FAF9F5] dark:bg-[#272521] border border-[#D5D1C7] dark:border-[#383530] text-[#605D55] dark:text-[#9C988F] px-2 py-0.5 rounded-sm text-[11px]">
                  {thesis.publishedYear}
                </span>
              )}

              {thesis.isPeerReviewed === true && (
                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded-sm text-[11px] font-bold">
                  Peer-reviewed
                </span>
              )}

              {sourceName && (
                <span className="bg-[#1C1B18] dark:bg-[#383530] text-white px-2 py-0.5 rounded-sm font-bold uppercase text-[11px]">
                  {sourceName}
                </span>
              )}

              {accessState !== 'unknown' && (
                <span
                  className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold ${
                    accessState === 'open'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-neutral-100 dark:bg-neutral-900/60 text-neutral-800 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  {accessState === 'open' ? 'Open access' : 'Subscription'}
                </span>
              )}

              {thesis.citationCount !== undefined && thesis.citationCount !== null && (
                <span className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[#2C6B3F] dark:text-emerald-400 font-bold px-2 py-0.5 rounded-sm text-[11px]">
                  {thesis.citationCount.toLocaleString()} {thesis.citationCount === 1 ? 'citation' : 'citations'}
                </span>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
              className="text-[#605D55] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#F2EFE8] dark:hover:bg-[#2A2824] rounded-sm cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center -mr-2 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Paper Title */}
          <h2
            id="modal-paper-title"
            className="text-lg sm:text-xl font-serif-title font-normal text-[#1C1B18] dark:text-[#F0EDE6] leading-snug tracking-tight line-clamp-3"
          >
            {thesis.title}
          </h2>

          {/* Actions: one way to read the paper, then save, cite and compare.
              Summary and datasets are tabs below, so they are not repeated here. */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F0ECE1] dark:border-[#2C2A26]">
            {(() => {
              const main = 'min-h-[40px] px-3.5 py-2 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#F0EDE6] dark:hover:bg-[#E2DFD8] text-white dark:text-[#141412] rounded-sm text-sm font-semibold transition flex items-center gap-2 shadow-2xs cursor-pointer';
              if (isDirectPdf && thesis.pdfUrl) {
                return (
                  <a href={thesis.pdfUrl} target="_blank" rel="noreferrer" className={main}>
                    <FileText className="w-4 h-4 text-amber-400 dark:text-amber-700 shrink-0" />
                    <span>Open PDF</span>
                  </a>
                );
              }
              if (freePdfState.result?.found && (freePdfState.result.pdfUrl || freePdfState.result.landingUrl)) {
                return (
                  <a href={freePdfState.result.pdfUrl || freePdfState.result.landingUrl} target="_blank" rel="noreferrer" className={main}>
                    <FileText className="w-4 h-4 text-amber-400 dark:text-amber-700 shrink-0" />
                    <span>{freePdfState.result.pdfUrl ? 'Open free PDF' : 'Open free copy'}</span>
                  </a>
                );
              }
              if (originalUrl) {
                return (
                  <a href={originalUrl} target="_blank" rel="noreferrer" className={main}>
                    <ExternalLink className="w-4 h-4 text-amber-400 dark:text-amber-700 shrink-0" />
                    <span>View in original repository</span>
                  </a>
                );
              }
              if (thesis.pdfUrl || thesis.fullTextUrl) {
                return (
                  <a href={thesis.pdfUrl || thesis.fullTextUrl} target="_blank" rel="noreferrer" className={main}>
                    <ExternalLink className="w-4 h-4 text-amber-400 dark:text-amber-700 shrink-0" />
                    <span>View source</span>
                  </a>
                );
              }
              if (thesis.doi) {
                return (
                  <a href={`https://doi.org/${thesis.doi}`} target="_blank" rel="noreferrer" className={main}>
                    <ExternalLink className="w-4 h-4 text-amber-400 dark:text-amber-700 shrink-0" />
                    <span>View DOI</span>
                  </a>
                );
              }
              return null;
            })()}

            {canLookForFreePdf && !freePdfState.result?.found && (
              <button
                type="button"
                onClick={findFreePdf}
                disabled={freePdfState.loading}
                className="min-h-[40px] px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:border-emerald-800 dark:text-emerald-200 rounded-sm text-sm font-medium transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
                title="Look for a legal free copy of this paper"
              >
                {freePdfState.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>{freePdfState.loading ? 'Looking…' : 'Find a free PDF'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleSave}
              disabled={savingPaper}
              aria-pressed={isSaved}
              className={`min-h-[40px] px-3.5 py-2 rounded-sm text-sm font-medium transition flex items-center gap-2 cursor-pointer ${
                isSaved
                  ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-200/70 font-bold'
                  : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] dark:bg-[#24221E] dark:hover:bg-[#2A2824] dark:border-[#383530] dark:text-[#E8E6E1]'
              }`}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="w-4 h-4 text-amber-800 dark:text-amber-400" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4 text-[#737067] dark:text-[#9C988F]" />
                  <span>Save</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onCite && onCite(thesis)}
              className="min-h-[40px] px-3.5 py-2 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] dark:bg-[#24221E] dark:hover:bg-[#2A2824] dark:border-[#383530] dark:text-[#E8E6E1] rounded-sm text-sm font-medium transition flex items-center gap-2 cursor-pointer"
            >
              <Quote className="w-4 h-4 text-[#2C6B3F] dark:text-emerald-400" />
              <span>Cite</span>
            </button>

            <button
              type="button"
              onClick={() => onAddToCompare && onAddToCompare(thesis)}
              aria-pressed={inComparison}
              className={`min-h-[40px] px-3.5 py-2 rounded-sm text-sm font-medium transition flex items-center gap-2 cursor-pointer ${
                inComparison
                  ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800 font-bold'
                  : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] dark:bg-[#24221E] dark:hover:bg-[#2A2824] dark:border-[#383530] dark:text-[#E8E6E1]'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>{inComparison ? 'In comparison' : 'Compare'}</span>
            </button>

            {onReportIssue && (
              <button
                type="button"
                onClick={() => onReportIssue(thesis)}
                className="min-h-[40px] min-w-[40px] px-2.5 py-2 text-[#8C887E] dark:text-[#9C988F] hover:text-red-700 dark:hover:text-red-400 transition flex items-center justify-center cursor-pointer ml-auto"
                title="Report a problem with this record"
                aria-label="Report a problem"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* What the free-PDF lookup found */}
          {freePdfState.requested && !freePdfState.loading && freePdfState.result && (
            <p role="status" className={`text-xs ${freePdfState.result.found ? 'text-emerald-800 dark:text-emerald-300' : 'text-[#605D55] dark:text-[#A8A49C]'}`}>
              {freePdfState.result.found
                ? `A free legal copy was found${freePdfState.result.repository ? ` at ${freePdfState.result.repository}` : ''} (through Unpaywall).`
                : freePdfState.result.message || 'No free legal copy of this paper is known.'}
            </p>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 2. TABBED NAVIGATION BAR                                                  */}
        {/* ========================================================================= */}
        <div className="bg-white dark:bg-[#201F1C] border-b border-[#E2DFD8] dark:border-[#2C2A26] px-2 sm:px-4 flex gap-0.5 sm:gap-1 overflow-x-auto shrink-0 text-[13px]">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-[42px] px-3 py-2 border-b-2 flex items-center gap-1.5 transition cursor-pointer font-semibold whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-[#1C1B18] dark:border-[#F0EDE6] text-[#1C1B18] dark:text-[#F0EDE6] bg-[#FAF9F5] dark:bg-[#1A1916]'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#FAF9F5]/60 dark:hover:bg-[#272521]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={handleSummaryTabClick}
            className={`min-h-[42px] px-3 py-2 border-b-2 flex items-center gap-1.5 transition cursor-pointer font-semibold whitespace-nowrap ${
              activeTab === 'summary'
                ? 'border-amber-600 dark:border-amber-500 text-amber-950 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/40'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#FAF9F5]/60 dark:hover:bg-[#272521]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Summary &amp; limitations</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('authors')}
            className={`min-h-[42px] px-3 py-2 border-b-2 flex items-center gap-1.5 transition cursor-pointer font-semibold whitespace-nowrap ${
              activeTab === 'authors'
                ? 'border-[#1C1B18] dark:border-[#F0EDE6] text-[#1C1B18] dark:text-[#F0EDE6] bg-[#FAF9F5] dark:bg-[#1A1916]'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#FAF9F5]/60 dark:hover:bg-[#272521]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              Authors {authorsCount > 0 ? `(${authorsCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('datasets')}
            className={`min-h-[42px] px-3 py-2 border-b-2 flex items-center gap-1.5 transition cursor-pointer font-semibold whitespace-nowrap ${
              activeTab === 'datasets'
                ? 'border-[#1C1B18] dark:border-[#F0EDE6] text-[#1C1B18] dark:text-[#F0EDE6] bg-[#FAF9F5] dark:bg-[#1A1916]'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#FAF9F5]/60 dark:hover:bg-[#272521]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              Full text &amp; datasets {totalDatasetsCount > 0 ? `(${totalDatasetsCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('citations')}
            className={`min-h-[42px] px-3 py-2 border-b-2 flex items-center gap-1.5 transition cursor-pointer font-semibold whitespace-nowrap ${
              activeTab === 'citations'
                ? 'border-[#1C1B18] dark:border-[#F0EDE6] text-[#1C1B18] dark:text-[#F0EDE6] bg-[#FAF9F5] dark:bg-[#1A1916]'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#FAF9F5]/60 dark:hover:bg-[#272521]'
            }`}
          >
            <Quote className="w-3.5 h-3.5" />
            <span>Citations &amp; source</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 3. SCROLLABLE TAB CONTENT                                                 */}
        {/* ========================================================================= */}
        <div className="tta-light-panel flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
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
                        {thesis.citationCount.toLocaleString()} {thesis.citationCount === 1 ? 'citation' : 'citations'}
                      </div>
                      <div className="text-[11px] text-[#737067] mt-0.5">
                        Counted by <strong>{thesis.citationMetrics?.source || thesis.citationSource || 'OpenAlex'}</strong>
                        {thesis.citationMetrics?.retrievedAt && ` · as of ${thesis.citationMetrics.retrievedAt}`}
                      </div>
                    </div>
                  </div>
                  {/^https?:\/\//i.test(String(thesis.citationMetrics?.sourceId || '')) && (
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
                      Published by
                    </span>
                    <span className="text-base font-bold text-[#1C1B18] block">
                      {thesis.publisher || thesis.venue || thesis.university || 'Publisher not recorded'}
                    </span>
                    <div className="text-xs text-[#605D55] mt-1 flex items-center gap-3">
                      <span>Year: <strong>{thesis.publishedYear || 'not recorded'}</strong></span>
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
                    <span>More from this publisher &rarr;</span>
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
                    {describeEvidence(thesis.awardingInstitution.evidence) && (
                      <span className="text-[11px] text-[#737067] block mt-0.5">
                        {describeEvidence(thesis.awardingInstitution.evidence)}
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
                  Abstract
                </h4>
                <div className="font-sans text-[15px] sm:text-base text-[#2E2C28] leading-relaxed font-normal bg-white p-5 sm:p-6 border border-[#E5E2DA] rounded-sm whitespace-pre-line shadow-2xs">
                  {thesis.abstract || 'No abstract is available for this record.'}
                </div>
              </div>

              {/* Research Disciplines & Subjects */}
              {thesis.subjects && thesis.subjects.length > 0 && (
                <div className="space-y-2 bg-white p-4 border border-[#E5E2DA] rounded-sm">
                  <span className="text-[11px] font-mono-meta text-[#737067] uppercase tracking-wider font-bold block">
                    Subjects
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
                  <span className="text-[11px] font-mono-meta text-[#737067] uppercase block">Access and licence</span>
                  <span className="font-medium text-[#1C1B18] mt-0.5 block">
                    {accessState === 'open'
                      ? (thesis.license || 'Open access')
                      : accessState === 'closed'
                      ? 'Subscription or paywalled'
                      : 'Not stated by the source'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-mono-meta text-[#737067] uppercase block">Identifier</span>
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
                      Authors ({authorshipsList.length})
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
                              className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded-xs font-mono-meta font-bold hover:bg-emerald-100 transition inline-flex items-center gap-1"
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
                        {thesis.university || 'University not recorded'} {thesis.department ? `• ${thesis.department}` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#737067] block text-[11px] font-mono-meta uppercase">Access and licence</span>
                      <span className="text-sm text-[#1C1B18] block mt-0.5">
                        {accessState === 'open' ? (thesis.license || 'Open access') : accessState === 'closed' ? 'Subscription or paywalled' : 'Not stated by the source'}
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
                  Where to read it
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
                          <div className="font-bold text-[#1C1B18]">Open the PDF</div>
                          <div className="text-[11px] text-[#2C6B3F]">Direct link to the file</div>
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
                          <div className="font-bold text-[#1C1B18]">Page that hosts the full text</div>
                          <div className="text-[11px] text-[#737067]">Publisher or university repository</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-[#737067] shrink-0" />
                    </a>
                  )}

                  {originalUrl && (
                    <a
                      href={originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3.5 bg-white border border-[#D5D1C7] hover:border-[#1C1B18] rounded-sm flex items-center justify-between transition group min-h-[44px] shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-blue-700 shrink-0" />
                        <div>
                          <div className="font-bold text-[#1C1B18]">View in original repository</div>
                          <div className="text-[11px] text-[#737067]">{thesis.sourceRepositoryName || 'University repository'}</div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-[#737067] shrink-0" />
                    </a>
                  )}

                  {freePdfState.result?.found && (freePdfState.result.pdfUrl || freePdfState.result.landingUrl) && (
                    <a
                      href={freePdfState.result.pdfUrl || freePdfState.result.landingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3.5 bg-emerald-50 border border-emerald-300 hover:border-emerald-600 rounded-sm flex items-center justify-between transition group min-h-[44px] shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div>
                          <div className="font-bold text-emerald-950">{freePdfState.result.pdfUrl ? 'Free PDF' : 'Free copy to read online'}</div>
                          <div className="text-[11px] text-emerald-800">
                            {[freePdfState.result.repository, freePdfState.result.license, 'found through Unpaywall'].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-emerald-800 shrink-0" />
                    </a>
                  )}

                  {canLookForFreePdf && !freePdfState.result?.found && (
                    <button
                      type="button"
                      onClick={findFreePdf}
                      disabled={freePdfState.loading}
                      className="p-3.5 bg-white border border-dashed border-emerald-400 hover:border-emerald-700 rounded-sm flex items-center justify-between transition min-h-[44px] text-left cursor-pointer disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3">
                        {freePdfState.loading ? <Loader2 className="w-5 h-5 text-emerald-700 shrink-0 animate-spin" /> : <Search className="w-5 h-5 text-emerald-700 shrink-0" />}
                        <div>
                          <div className="font-bold text-[#1C1B18]">{freePdfState.loading ? 'Looking for a free copy…' : 'Find a free PDF'}</div>
                          <div className="text-[11px] text-[#737067]">
                            {freePdfState.requested && !freePdfState.loading && freePdfState.result && !freePdfState.result.found
                              ? freePdfState.result.message || 'No free legal copy of this paper is known.'
                              : 'Checks whether a legal free copy exists'}
                          </div>
                        </div>
                      </div>
                    </button>
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
                          <div className="font-bold text-blue-900">Publisher page (DOI)</div>
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
                    <span>Datasets for this paper</span>
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
                        Find datasets linked to this paper
                      </span>
                      <p className="text-[#605D55] text-xs leading-relaxed max-w-xl font-sans">
                        Looks in DataCite, Zenodo, Figshare, Dryad, Harvard Dataverse and OpenAIRE for data the authors deposited with this paper, and for datasets on the same topic.
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
                      <span className="bg-amber-200/80 text-amber-900 text-[11px] font-mono-meta font-bold px-2 py-0.5 rounded-xs">
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
                                  className={`px-2 py-0.5 rounded-2xs text-[11px] font-mono-meta font-bold uppercase ${
                                    isDirect
                                      ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                                      : 'bg-blue-100 text-blue-900 border border-blue-300'
                                  }`}
                                >
                                  {isDirect ? 'Direct Supplemental Dataset' : 'Referenced Work / Citation'}
                                </span>
                                <span className="bg-white border border-[#D5D1C7] px-2 py-0.5 rounded-2xs text-[11px] font-mono-meta text-[#1C1B18]">
                                  {d.source || 'DataCite'}
                                </span>
                              </div>

                              <div className="font-bold text-sm text-[#1C1B18] group-hover:text-[#2C6B3F] leading-snug">
                                {d.title}
                              </div>

                              {describeEvidence(d.relationEvidence || d.evidence) && (
                                <div className="text-xs text-[#605D55] italic font-sans">
                                  {describeEvidence(d.relationEvidence || d.evidence)}
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
                            <div className="flex items-center gap-2 text-[11px] font-mono-meta">
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
                    Citation count
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono-meta">
                    <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm">
                      <span className="text-[11px] text-[#737067] uppercase block">Citations</span>
                      <strong className="text-base text-[#1C1B18] font-bold">
                        {thesis.citationCount.toLocaleString()}
                      </strong>
                    </div>
                    <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm">
                      <span className="text-[11px] text-[#737067] uppercase block">Attributed Source:</span>
                      <strong className="text-sm text-[#1C1B18]">
                        {thesis.citationMetrics?.source || thesis.citationSource || 'OpenAlex'}
                      </strong>
                    </div>
                    <div className="p-3 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm">
                      <span className="text-[11px] text-[#737067] uppercase block">Snapshot Harvested:</span>
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
                  Look this paper up elsewhere
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
                  About this record
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[11px] text-[#737067] uppercase block">DOI Resolver:</span>
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
                    <span className="text-[11px] text-[#737067] uppercase block">Source of this record:</span>
                    <span className="text-[#1C1B18] font-bold">
                      {sourceDisplay}
                    </span>
                  </div>

                  {/^https?:\/\//i.test(String(thesis.citationMetrics?.sourceId || '')) && (
                    <div>
                      <span className="text-[11px] text-[#737067] uppercase block">OpenAlex Canonical Record:</span>
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

                  {accessState !== 'unknown' && (
                    <div>
                      <span className="text-[11px] text-[#737067] uppercase block">Access Status:</span>
                      <span className="font-semibold text-[#1C1B18]">
                        {accessState === 'open' ? 'Open access' : 'Subscription or restricted'}
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
                      Summary and limitations
                    </h3>
                  </div>
                  <p className="text-xs text-[#605D55] font-mono-meta mt-1">
                    Quick Summary extracts sentences. Analyze for thesis uses AI to explain the available text with supporting quotes. Selected paper text is sent to OpenAI for analysis.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" disabled={summaryState.loading}
                    onClick={() => fetchSummary(summaryState.language, false, 'ai')}
                    className="min-h-[40px] px-3 py-1.5 bg-[#1C1B18] text-white rounded-sm text-xs font-bold disabled:opacity-50 cursor-pointer">
                    {summaryState.loading ? 'Reading paper…' : 'Analyze for thesis'}
                  </button>
                  <button type="button" disabled={summaryState.loading}
                    onClick={() => fetchSummary(summaryState.language, false, 'extractive')}
                    className="min-h-[40px] px-3 py-1.5 border border-[#D5D1C7] rounded-sm text-xs font-bold disabled:opacity-50 cursor-pointer">
                    Quick Summary
                  </button>
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
                      বাংলা
                    </button>
                  </div>

                  {(summaryState.data?.summary || fullTextState.data?.available) && (
                    <>
                      <button
                        type="button"
                        onClick={copySummaryText}
                        className="min-h-[40px] px-3 py-1.5 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] rounded-sm text-xs font-mono-meta font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Copy this summary as plain text"
                      >
                        <Copy className="w-3.5 h-3.5 text-amber-700" />
                        <span>{summaryState.copied ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fetchSummary(summaryState.language, true)}
                        className="min-h-[40px] px-3 py-1.5 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] rounded-sm text-xs font-mono-meta font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="Build the summary again"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* From the full paper: the authors' own Limitations, Future work, Conclusion and Data sections */}
              {summaryState.requested && !summaryState.loading && !summaryState.isLocked && (() => {
                const view = buildFullTextView(fullTextState.data, summaryState.language);
                const F = view.labels;
                const hasSomethingToRead = Boolean(thesis.pdfUrl || thesis.doi || freePdfState.result?.pdfUrl);
                const failed = fullTextState.requested && !fullTextState.loading && fullTextState.data && !fullTextState.data.available;

                return (
                  <section className="bg-white border border-[#D5D1C7] rounded-sm shadow-2xs" data-testid="fulltext-block" aria-label={F.title}>
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="font-serif-title text-base font-bold text-[#1C1B18] flex items-center gap-2">
                          <FileText className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>{F.title}</span>
                        </h4>
                        <p className="text-xs text-[#605D55] leading-relaxed max-w-xl">
                          {view.available
                            ? [F.note, view.pagesNote, view.viaFinder ? F.viaFinder : ''].filter(Boolean).join(' · ')
                            : 'Reads the paper’s free PDF and copies out the authors’ own Limitations, Future work, Conclusion and Data availability sections. Nothing is rewritten.'}
                        </p>
                      </div>

                      {/* "Try again" only when trying again can help (a slow or busy host), not for a scanned or missing PDF */}
                      {!view.available && !fullTextState.loading && !fullTextState.isLocked && hasSomethingToRead && (!failed || fullTextState.data.retryable !== false) && (
                        <button
                          type="button"
                          onClick={fetchFullText}
                          className="min-h-[40px] shrink-0 bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-2 rounded-sm text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                        >
                          <FileText className="w-4 h-4 text-amber-400" />
                          <span>{failed ? 'Try again' : 'Read the full paper'}</span>
                        </button>
                      )}
                      {view.available && view.pdfUrl && (
                        <a
                          href={view.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[40px] shrink-0 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-3.5 py-2 rounded-sm text-sm font-medium transition flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>{F.openPdf}</span>
                        </a>
                      )}
                    </div>

                    {!hasSomethingToRead && !fullTextState.requested && (
                      <p className="px-4 sm:px-5 pb-4 text-xs text-[#605D55]">
                        This record has no PDF link and no DOI, so there is no full text to read here.
                      </p>
                    )}

                    {fullTextState.loading && (
                      <div className="px-4 sm:px-5 pb-4 flex items-center gap-2 text-xs text-amber-900" role="status">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
                        <span>Opening and reading the PDF. A long thesis can take up to 20 seconds.</span>
                      </div>
                    )}

                    {failed && (
                      <div className="mx-4 sm:mx-5 mb-4 p-3 bg-[#FAF9F5] border border-[#D5D1C7] rounded-sm text-xs text-[#524F47] space-y-2" role="status">
                        <p>{fullTextState.data.message || 'The full paper could not be read.'}</p>
                        {fullTextState.isLocked && onOpenMembership && (
                          <button type="button" onClick={onOpenMembership} className="underline font-semibold text-[#1C1B18] cursor-pointer">
                            See trial and Premium options
                          </button>
                        )}
                        {!fullTextState.isLocked && fullTextState.data.reason === 'no_pdf' && canLookForFreePdf && !freePdfState.requested && (
                          <button type="button" onClick={findFreePdf} className="underline font-semibold text-[#1C1B18] cursor-pointer">
                            Look for a free PDF
                          </button>
                        )}
                      </div>
                    )}

                    {view.available && (
                      <div className="border-t border-[#F0ECE1] p-4 sm:p-5 space-y-4">
                        {view.blocks.length === 0 && (
                          <p className="text-sm text-[#605D55]" data-testid="fulltext-nothing">{F.nothing}</p>
                        )}

                        {view.blocks.map((block) => (
                          <div key={block.keys.join('-')} className={`space-y-1.5 ${block.keys.includes('limitations') ? 'border-l-4 border-l-amber-500 pl-3.5' : ''}`}>
                            <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                              <span className="text-[11px] font-mono-meta uppercase tracking-wider font-bold text-[#1C1B18]">{block.headings.join(' + ')}</span>
                              {(block.sectionTitle || block.page) && (
                                <span className="text-[11px] text-[#737067]">
                                  {block.sectionTitle ? `${F.section}: “${block.sectionTitle}”` : ''}
                                  {block.sectionTitle && block.page ? ', ' : ''}
                                  {block.page ? `${F.page} ${block.page}` : ''}
                                  {block.insideSection ? ` (${F.insideSection})` : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#2E2C28] leading-relaxed whitespace-pre-line">{block.text}</p>
                            {block.truncated && <p className="text-[11px] text-[#737067]">{F.continues}</p>}
                          </div>
                        ))}

                        {view.links.length > 0 && (
                          <div className="space-y-2 pt-1">
                            <span className="text-[11px] font-mono-meta uppercase tracking-wider font-bold text-[#1C1B18] block">{F.links}</span>
                            <ul className="space-y-1.5">
                              {view.links.map((link) => (
                                <li key={link.url} className="text-xs flex items-start gap-2">
                                  <span
                                    className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded-sm border text-[11px] font-bold uppercase ${
                                      link.kind === 'dataset'
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                        : link.kind === 'code'
                                        ? 'bg-blue-50 border-blue-300 text-blue-900'
                                        : 'bg-[#FAF9F5] border-[#D5D1C7] text-[#524F47]'
                                    }`}
                                  >
                                    {F[link.kind]}
                                  </span>
                                  <span className="min-w-0">
                                    <a href={link.url} target="_blank" rel="noreferrer" className="text-blue-900 underline break-all hover:text-black">
                                      {link.url}
                                    </a>
                                    {link.context && <span className="block text-[#737067] mt-0.5">“{link.context}”</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })()}

              {/* State 1: Not Requested Yet (Honest trigger screen) */}
              {!summaryState.requested && !summaryState.loading && (
                <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-6 sm:p-8 rounded-sm text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-800">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="max-w-lg mx-auto space-y-2">
                    <h4 className="text-base font-bold text-[#1C1B18]">
                      See this paper at a glance
                    </h4>
                    <p className="text-xs sm:text-sm text-[#524F47] leading-relaxed">
                      Picks the sentences that state the research question, methods, data, findings and limitations, and puts each under its heading. Nothing is rewritten, and a heading with no matching sentence is listed as not found.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => fetchSummary(summaryState.language)}
                      className="min-h-[44px] px-6 py-2.5 bg-[#1C1B18] hover:bg-[#2E2C28] text-white font-mono-meta text-xs uppercase tracking-wider font-bold rounded-sm transition shadow-2xs cursor-pointer inline-flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Show Quick Summary</span>
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
                      Sorting the paper's sentences under headings...
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

              {/* Paywalled / Feature Locked State */}
              {summaryState.isLocked && !summaryState.loading && (
                <div className="bg-[#FAF9F5] border border-amber-300 p-6 sm:p-8 rounded-sm text-center space-y-4 shadow-2xs">
                  <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-800">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h4 className="text-base font-bold text-[#1C1B18]">
                      Quick Summary is a Premium feature
                    </h4>
                    <p className="text-xs sm:text-sm text-[#524F47] leading-relaxed">
                      {summaryState.error || 'Quick Summary and reading limitations from the full paper are included in the 7-day trial and in Premium. They are not part of the free plan.'}
                    </p>
                  </div>
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                    {onOpenMembership && (
                      <button
                        type="button"
                        onClick={onOpenMembership}
                        className="min-h-[44px] px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-mono-meta text-xs uppercase tracking-wider font-bold rounded-sm transition shadow-2xs cursor-pointer inline-flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>See trial and Premium options</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* State 3: Error State */}
              {summaryState.error && !summaryState.isLocked && !summaryState.loading && (
                <div className="bg-red-50 border border-red-300 p-5 rounded-sm space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
                    <span>{summaryState.quotaReached ? "Today's summary limit is used up" : 'The summary could not be shown'}</span>
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
                      Try again
                    </button>
                    {summaryState.quotaReached && onOpenMembership && (
                      <button
                        type="button"
                        onClick={onOpenMembership}
                        className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-mono-meta text-xs uppercase font-bold rounded-sm transition cursor-pointer"
                      >
                        See membership plans
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* No usable text: say so instead of leaving the panel empty */}
              {summaryState.requested && !summaryState.loading && !summaryState.isLocked && !summaryState.error && !summaryState.data?.summary && (
                <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-5 sm:p-6 rounded-sm space-y-2">
                  <h4 className="text-sm font-bold text-[#1C1B18]">No summary for this record</h4>
                  <p className="text-xs sm:text-sm text-[#524F47] leading-relaxed">
                    {summaryState.data?.message || 'This record has no abstract long enough to summarise. Open the paper itself to read it.'}
                  </p>
                </div>
              )}

              {/* State 4: Summary Result View */}
              {summaryState.data?.summary && !summaryState.loading && !summaryState.isLocked && (() => {
                const view = buildSummaryView(summaryState.data.summary, summaryState.data.language || summaryState.language);
                const L = view.labels;
                const quota = summaryState.data.quota;
                const isFullText = summaryState.data.coverage === 'full_text';
                const headingClass = 'text-[11px] font-mono-meta uppercase tracking-wider font-bold block';

                return (
                  <div className="space-y-4" data-testid="summary-result">
                    {/* What this is, and what it is based on */}
                    <div className="p-3.5 bg-[#FAF9F5] border border-[#D5D1C7] rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-sm font-mono-meta font-bold uppercase text-[11px] border ${
                            isFullText
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border-amber-400'
                          }`}
                        >
                          {isFullText ? 'From the full text' : 'From the abstract only'}
                        </span>
                        <span className="text-[#524F47]">
                          {summaryState.data.summary.disclaimer || "Sentences taken from the paper's own text by keyword rules. Not written by AI. Check the original paper."}
                        </span>
                      </div>

                      {quota && (
                        <span className="text-[#737067] text-[11px] font-mono-meta shrink-0">
                          {quota.limit === null || quota.limit === undefined
                            ? 'No daily limit'
                            : `${quota.used} of ${quota.limit} used today`}
                        </span>
                      )}
                    </div>

                    {!summaryState.data.summary.isAiGenerated && (summaryState.data.language || summaryState.language) === 'bn' && (
                      <p className="text-xs text-[#605D55] leading-relaxed">
                        শিরোনাম ও টীকা বাংলায় দেখানো হচ্ছে। বাক্যগুলো গবেষণাপত্রের নিজের ভাষাতেই থাকে, অনুবাদ করা হয় না।
                      </p>
                    )}

                    {summaryState.data.coverageNote && (
                      <p className="text-xs text-[#605D55] leading-relaxed">{summaryState.data.coverageNote}</p>
                    )}
                    {summaryState.data.cached && summaryState.data.summary.isAiGenerated && (
                      <p className="text-xs text-emerald-800">Saved analysis reused. No new analysis credit used.</p>
                    )}
                    {/* Opening sentence */}
                    {view.takeaway && (
                      <div className="bg-white border-2 border-[#1C1B18] p-5 sm:p-6 rounded-sm space-y-2 shadow-2xs">
                        <span className={`${headingClass} text-amber-800`}>{L.takeaway}</span>
                        <p className="font-sans text-[15px] sm:text-base text-[#1C1B18] leading-relaxed font-medium">
                          {view.takeaway}
                        </p>
                        {view.takeawayAlsoCovers.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-[11px] text-[#737067]">{L.alsoCovers}:</span>
                            {view.takeawayAlsoCovers.map((name) => (
                              <span key={name} className="px-2 py-0.5 bg-[#FAF9F5] border border-[#D5D1C7] rounded-sm text-[11px] text-[#2E2C28]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {view.overview && (
                      <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-4 sm:p-5 rounded-sm">
                        <p className="text-sm text-[#2E2C28] leading-relaxed">{view.overview}</p>
                      </div>
                    )}

                    {/* One card per sentence; a sentence that answers two headings carries both names */}
                    {view.sections.length > 0 && (
                      <div className={`grid grid-cols-1 gap-4 ${view.sections.length > 1 ? 'md:grid-cols-2' : ''}`}>
                        {view.sections.map((section) => (
                          <div key={section.keys.join('-')} className="bg-white border border-[#D5D1C7] p-5 rounded-sm space-y-2 shadow-2xs">
                            <span className={`${headingClass} text-[#605D55]`}>{section.headings.join(' + ')}</span>
                            <p className="text-sm text-[#2E2C28] leading-relaxed">{section.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Limitations: what the authors said, kept apart from the site's own checklist */}
                    <div className="bg-white border border-[#D5D1C7] border-l-4 border-l-amber-500 p-5 rounded-sm space-y-2 shadow-2xs">
                      <span className={`${headingClass} text-amber-900`}>{L.limitations}</span>
                      {view.limitations.stated ? (
                        <p className="text-sm text-[#2E2C28] leading-relaxed">{view.limitations.text}</p>
                      ) : (
                        <p className="text-sm text-[#605D55] leading-relaxed">{L.limitationsMissing}</p>
                      )}
                    </div>

                    {view.futureWork && (
                      <div className="bg-white border border-[#D5D1C7] p-5 rounded-sm space-y-2 shadow-2xs">
                        <span className={`${headingClass} text-[#605D55]`}>{L.futureWork}</span>
                        <p className="text-sm text-[#2E2C28] leading-relaxed">{view.futureWork}</p>
                      </div>
                    )}

                    {summaryState.data.summary.researchDirections?.length > 0 && (
                      <section className="bg-[#FAF9F5] border border-dashed border-[#C9C4B8] p-5 rounded-sm space-y-3">
                        <h4 className="text-sm font-bold text-[#1C1B18]">Possible thesis directions</h4>
                        <p className="text-xs text-[#605D55]">AI suggestions based on this paper. Check related literature and discuss with your supervisor before claiming a new research gap.</p>
                        {summaryState.data.summary.researchDirections.map((direction, index) => (
                          <div key={index} className="space-y-1">
                            <p className="text-sm text-[#2E2C28]">{direction.text}</p>
                            <p className="text-xs text-[#605D55]">{direction.sectionOrPage}: “{direction.quote}”</p>
                          </div>
                        ))}
                      </section>
                    )}
                    {view.notFound.length > 0 && (
                      <p className="text-xs text-[#605D55] leading-relaxed" data-testid="summary-not-found">
                        <span className="font-bold text-[#2E2C28]">{L.notFound}:</span> {view.notFound.join(', ')}
                      </p>
                    )}

                    {view.checklist.length > 0 && (
                      <div className="bg-[#FAF9F5] border border-dashed border-[#C9C4B8] p-4 sm:p-5 rounded-sm space-y-2">
                        <div>
                          <span className={`${headingClass} text-[#2E2C28]`}>{L.checklist}</span>
                          <p className="text-[11px] text-[#737067] mt-0.5">{L.checklistNote}</p>
                        </div>
                        <ul className="space-y-1.5">
                          {view.checklist.map((item, index) => (
                            <li key={index} className="text-xs text-[#524F47] leading-relaxed">
                              {item.title && <span className="font-bold text-[#2E2C28]">{item.title}: </span>}
                              {item.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {view.keyTerms.length > 0 && (
                      <div className="space-y-2">
                        <span className={`${headingClass} text-[#605D55]`}>{L.keyTerms}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {view.keyTerms.map((term) => (
                            <span
                              key={term}
                              className="bg-white border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1 rounded-sm text-xs"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {view.evidence.length > 0 && (
                      <div className="bg-white border border-[#D5D1C7] p-4 rounded-sm space-y-2 shadow-2xs">
                        <span className={`${headingClass} text-emerald-800`}>{L.evidence}</span>
                        <div className="space-y-2">
                          {view.evidence.map((ev, eIdx) => (
                            <div key={eIdx} className="text-xs p-2.5 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm">
                              <strong className="text-[#1C1B18] block">{ev.field ? `${ev.field}: ` : ''}{ev.sectionOrPage}</strong>
                              <span className="text-[#605D55] italic">"{ev.quote}"</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
