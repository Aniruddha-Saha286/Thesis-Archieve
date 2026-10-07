import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import useEscapeToClose from '../hooks/useEscapeToClose';
import {
  FileText,
  Database,
  Code,
  Bookmark,
  Quote,
  Pin,
  Trash2,
  ArrowBigUp,
  Building2,
  ExternalLink,
  AlertTriangle,
  Scale,
  Flag,
  Lock,
  MoreHorizontal,
  Sparkles,
  Check,
  X,
} from 'lucide-react';
import axios from 'axios';

export default function ThesisCard({
  thesis,
  onCite,
  onDeleted,
  onPinned,
  onSelectPublisher,
  onViewDetail,
  onAddToCompare,
  inComparison = false,
  comparisonCount = 0,
  onReportIssue,
  onRequireAuth,
  onOpenMembership,
  onSelectAuthor,
  initiallySaved = false,
  onSavedChange,
}) {
  const { isAdmin, user, isAuthenticated } = useAuth();
  const { showNotice } = useSocket();
  const [upvotes, setUpvotes] = useState(thesis.upvotes || 0);
  const [hasUpvoted, setHasUpvoted] = useState(
    thesis.upvotedBy?.some((id) => id === user?.id || id?._id === user?.id) || false
  );
  const [isSaved, setIsSaved] = useState(Boolean(initiallySaved));
  const [savingPaper, setSavingPaper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef(null);

  useEscapeToClose(() => setShowMoreMenu(false), showMoreMenu);
  useEscapeToClose(() => setShowDeleteConfirm(false), showDeleteConfirm);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showMoreMenu]);

  useEffect(() => {
    setIsSaved(Boolean(initiallySaved));
  }, [initiallySaved]);

  const isLocalPaper = Boolean(
    thesis._id &&
    (thesis.source === 'Local Repository' || (!thesis.source && !thesis.isExternal))
  );

  const handleUpvote = async () => {
    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('Sign in to recommend papers.');
      return;
    }
    try {
      const res = await axios.post(`/api/thesis/${thesis._id || thesis.id}/upvote`);
      if (res.data?.code === 'EXTERNAL_PAPER_UPVOTE_UNSUPPORTED') {
        showNotice('Recommendations are available for papers deposited in this archive.', 'info');
        return;
      }
      setUpvotes(res.data.upvotes);
      setHasUpvoted(res.data.hasUpvoted);
    } catch (err) {
      console.error('Failed to upvote:', err);
    }
  };

  const handleToggleSave = async () => {
    if (!isAuthenticated) {
      if (onRequireAuth) {
        onRequireAuth('Sign in to save papers.');
      }
      return;
    }

    try {
      setSavingPaper(true);
      if (isSaved) {
        await axios.delete(`/api/user/saved-papers/${encodeURIComponent(thesis._id || thesis.id)}`);
        setIsSaved(false);
      } else {
        await axios.post('/api/user/saved-papers', {
          paperId: thesis._id || thesis.id,
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
      if (onSavedChange) onSavedChange();
    } catch (err) {
      console.error('Failed to toggle save paper:', err);
      showNotice(err.response?.data?.message || 'Could not update your saved papers. Please try again.', 'error');
      if (err.response?.data?.code === 'QUOTA_EXCEEDED' && onOpenMembership) onOpenMembership();
    } finally {
      setSavingPaper(false);
    }
  };

  const handlePin = async () => {
    try {
      setLoading(true);
      const res = await axios.put(`/api/thesis/${thesis._id || thesis.id}/pin`, {
        isPinned: !thesis.isPinned,
        paper: thesis,
      });
      if (onPinned) onPinned(thesis._id || thesis.id, res.data.isPinned);
    } catch (err) {
      showNotice('The pin could not be changed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/thesis/${thesis._id || thesis.id}`);
      if (onDeleted) onDeleted(thesis._id || thesis.id);
      showNotice('Record deleted.', 'info');
    } catch (err) {
      showNotice('The record could not be deleted.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const pubType = (thesis.publicationType || thesis.degreeType || 'article').toLowerCase();
  const isThesisType = pubType.includes('thesis') || pubType.includes('dissertation') || pubType.includes('capstone');
  const isPreprint = pubType.includes('preprint') || thesis.source === 'arXiv';
  const isConference = pubType.includes('proceedings') || pubType.includes('conference');

  const typeEdge = isThesisType
    ? 'bg-blue-500 dark:bg-blue-400'
    : isPreprint
    ? 'bg-amber-500 dark:bg-amber-400'
    : isConference
    ? 'bg-purple-500 dark:bg-purple-400'
    : 'bg-emerald-500 dark:bg-emerald-400';

  const sourceLabel = thesis.source || thesis.sources?.[0]?.provider || '';

  const isDirectPdf = Boolean(
    thesis.isDirectPdf ||
    (thesis.pdfUrl && (
      thesis.pdfUrl.endsWith('.pdf') ||
      thesis.pdfUrl.includes('/pdf/') ||
      thesis.pdfUrl.includes('pmc.ncbi.nlm.nih.gov') ||
      thesis.pdfUrl.includes('/servlets/purl')
    ))
  );

  const primaryLink = isDirectPdf && thesis.pdfUrl
    ? { href: thesis.pdfUrl, label: 'Open PDF', icon: FileText, title: `Open the PDF: ${thesis.title}` }
    : (thesis.fullTextUrl || thesis.pdfUrl)
    ? { href: thesis.fullTextUrl || thesis.pdfUrl, label: 'View source', icon: ExternalLink, title: 'Open the page that hosts the full text' }
    : thesis.doi
    ? { href: `https://doi.org/${thesis.doi}`, label: 'View DOI', icon: ExternalLink, title: "Open the publisher's page for this DOI" }
    : null;

  const typeLabel = isThesisType
    ? (thesis.degreeType || 'Thesis')
    : isPreprint
    ? 'Preprint'
    : isConference
    ? 'Conference paper'
    : 'Journal article';

  const typeText = isThesisType
    ? 'text-blue-800 dark:text-blue-300'
    : isPreprint
    ? 'text-amber-800 dark:text-amber-300'
    : isConference
    ? 'text-purple-800 dark:text-purple-300'
    : 'text-emerald-800 dark:text-emerald-300';

  const authorList = thesis.authorships && thesis.authorships.length > 0 ? thesis.authorships : null;
  const plainAuthors = thesis.author || (Array.isArray(thesis.authors) && thesis.authors.map((a) => a.name).join(', ')) || '';
  const institutionName = thesis.awardingInstitution?.name || thesis.authorships?.[0]?.institutions?.[0]?.name || thesis.university || '';
  const venueName = thesis.publisher || thesis.venue || '';
  const showVenue = Boolean(venueName) && !(institutionName && venueName.toLowerCase().includes(institutionName.toLowerCase()));

  const buttonBase = 'inline-flex items-center justify-center gap-1.5 rounded-sm text-sm lg:text-[13px] transition cursor-pointer min-h-[40px] lg:min-h-[32px] px-3 lg:px-2.5';
  const quietButton = `${buttonBase} bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] font-medium`;
  const mainButton = `${buttonBase} bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 font-semibold shadow-2xs`;
  const menuItem = 'w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 lg:py-2 hover:bg-[#FAF9F5] dark:hover:bg-[#282622] text-[#1C1B18] dark:text-[#F0EDE6] transition cursor-pointer';
  const closeMenu = () => setShowMoreMenu(false);

  return (
    <article
      className={`relative bg-white dark:bg-[#161513] border rounded-sm p-3 pl-5 sm:px-4 sm:pl-5 shadow-2xs transition-colors ${
        thesis.isPinned ? 'border-amber-400 bg-amber-50/20 dark:bg-amber-950/20' : 'border-[#E2DFD8] dark:border-[#2C2A26] hover:border-[#BDB9AF] dark:hover:border-[#423F3A]'
      }`}
    >
      <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-sm ${typeEdge}`} />

      {thesis.isRetracted && (
        <div className="mb-2.5 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 px-2.5 py-2 rounded-sm text-xs text-red-900 dark:text-red-300 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
            <span>Retracted or disputed paper</span>
          </div>
          {thesis.retractionNoticeUrl && (
            <a
              href={thesis.retractionNoticeUrl}
              target="_blank"
              rel="noreferrer"
              className="underline font-bold text-red-800 dark:text-red-300 hover:text-black dark:hover:text-white"
            >
              Read the retraction notice ↗
            </a>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start gap-2.5 lg:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-[17px] font-serif-title font-normal leading-snug">
            <button
              type="button"
              onClick={() => onViewDetail && onViewDetail(thesis)}
              className="text-left text-[#1C1B18] dark:text-[#F0EDE6] hover:text-amber-900 dark:hover:text-amber-300 hover:underline cursor-pointer transition-colors line-clamp-2"
              title="Open details"
            >
              {thesis.title}
            </button>
          </h3>

          <div className="text-[13px] text-[#605D55] dark:text-[#A8A49C] flex items-center gap-x-1.5 gap-y-0.5 flex-wrap leading-snug">
            {thesis.isPinned && (
              <span className="inline-flex items-center gap-1 bg-amber-400 text-neutral-950 px-1.5 rounded-sm text-[11px] font-bold">
                <Pin className="w-3 h-3" /> Pinned
              </span>
            )}
            <span className={`font-semibold ${typeText}`}>{typeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {authorList ? (
                <>
                  {authorList.slice(0, 2).map((auth, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && ', '}
                      {onSelectAuthor && (auth.author?.id || auth.author?.name) ? (
                        <button
                          type="button"
                          onClick={() => onSelectAuthor(auth.author)}
                          className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium hover:text-amber-800 dark:hover:text-amber-300 hover:underline cursor-pointer"
                          title={`See other work by ${auth.author.name}`}
                        >
                          {auth.author.name}
                        </button>
                      ) : (
                        <span className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium">{auth.author?.name || 'Author not recorded'}</span>
                      )}
                    </React.Fragment>
                  ))}
                  {authorList.length > 2 && ' et al.'}
                </>
              ) : (
                <span className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium">{plainAuthors || 'Author not recorded'}</span>
              )}
            </span>
            {thesis.publishedYear && (
              <>
                <span aria-hidden="true">·</span>
                <span>{thesis.publishedYear}</span>
              </>
            )}
            {institutionName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3 h-3 shrink-0" />
                  {institutionName}
                </span>
              </>
            )}
            {showVenue && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onSelectPublisher && onSelectPublisher(venueName)}
                  className="hover:text-amber-800 dark:hover:text-amber-300 hover:underline cursor-pointer text-left"
                  title={`Show only results from ${venueName}`}
                >
                  {venueName}
                </button>
              </>
            )}
            {thesis.advisor && (
              <>
                <span aria-hidden="true">·</span>
                <span>Advisor: <span className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium">{thesis.advisor}</span></span>
              </>
            )}
            {thesis.citationCount !== undefined && thesis.citationCount !== null && thesis.citationCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span title={`Citation count from ${thesis.citationSource || 'OpenAlex'}`}>
                  {thesis.citationCount.toLocaleString()} {thesis.citationCount === 1 ? 'citation' : 'citations'}
                </span>
              </>
            )}
            {sourceLabel && (
              <span className="ml-0.5 px-1.5 rounded-sm border border-[#D5D1C7] dark:border-[#38352F] bg-[#FAF9F5] dark:bg-[#201F1C] text-[11px] text-[#1C1B18] dark:text-[#E8E6E1]" title="Where this record comes from">
                {sourceLabel}
              </span>
            )}
            {thesis.isOpenAccess && (
              <span className="px-1.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-[11px] text-emerald-800 dark:text-emerald-300">
                Open access
              </span>
            )}
            {thesis.isPeerReviewed === true && (
              <span className="px-1.5 rounded-sm border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300">
                Peer-reviewed
              </span>
            )}
          </div>

          <p className="text-sm text-[#4A4740] dark:text-[#A8A49C] leading-snug line-clamp-2">
            {thesis.abstract || 'No abstract is available for this record.'}
          </p>
        </div>

        {/* Three main actions; everything else is under More */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap lg:flex-nowrap lg:pt-0.5">
          {primaryLink ? (
            <a href={primaryLink.href} target="_blank" rel="noreferrer" className={mainButton} title={primaryLink.title}>
              <primaryLink.icon className="w-4 h-4 text-amber-300 dark:text-neutral-950" />
              <span>{primaryLink.label}</span>
            </a>
          ) : (
            <button type="button" onClick={() => onViewDetail && onViewDetail(thesis)} className={mainButton}>
              <FileText className="w-4 h-4 text-amber-300 dark:text-neutral-950" />
              <span>Details</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleSave}
            disabled={savingPaper}
            aria-pressed={isSaved}
            className={
              isSaved
                ? `${buttonBase} bg-amber-100 dark:bg-amber-950/60 border border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-300 font-bold`
                : quietButton
            }
            title={isSaved ? 'Saved in your library. Press to remove.' : 'Save to your library'}
          >
            <Bookmark className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          <button type="button" onClick={() => onCite && onCite(thesis)} className={quietButton} title="Copy a citation (APA, BibTeX, RIS)">
            <Quote className="w-4 h-4 text-[#737067] dark:text-[#9A968D]" />
            <span>Cite</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-haspopup="menu"
              aria-expanded={showMoreMenu}
              aria-label="More actions"
              className={`${quietButton} px-2.5 ${inComparison ? 'border-purple-400 dark:border-purple-600' : ''}`}
              title="More actions: summary, compare, datasets, other sites, report"
            >
              <MoreHorizontal className="w-4 h-4 text-[#605D55] dark:text-[#9A968D]" />
            </button>

            {showMoreMenu && (
              <>
                <div
                  className="fixed inset-0 bg-neutral-950/40 backdrop-blur-2xs z-40 lg:hidden"
                  onClick={() => setShowMoreMenu(false)}
                  aria-hidden="true"
                />

                <div
                  role="menu"
                  aria-label="More actions"
                  className="fixed inset-x-3 bottom-3 sm:inset-x-6 sm:bottom-4 max-h-[78dvh] overflow-y-auto overscroll-contain z-50 rounded-lg shadow-2xl lg:shadow-xl lg:rounded-sm lg:inset-auto lg:absolute lg:right-0 lg:bottom-auto lg:top-full lg:mt-1 lg:w-60 lg:max-h-[calc(100vh-120px)] lg:z-20 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] py-1 text-[13px]"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#F2EFE8] dark:border-[#2C2A26] lg:hidden sticky top-0 bg-white dark:bg-[#1E1D1A] z-10">
                    <span className="text-xs font-semibold text-[#737067] dark:text-[#9A968D]">More actions</span>
                    <button
                      type="button"
                      onClick={() => setShowMoreMenu(false)}
                      className="text-[#737067] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] p-1 -mr-1 cursor-pointer"
                      aria-label="Close menu"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                {primaryLink && (
                  <button type="button" role="menuitem" onClick={() => { closeMenu(); if (onViewDetail) onViewDetail(thesis, 'overview'); }} className={menuItem}>
                    <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[#737067] dark:text-[#9A968D]" />Details</span>
                  </button>
                )}
                <button type="button" role="menuitem" onClick={() => { closeMenu(); if (onViewDetail) onViewDetail(thesis, 'summary'); }} className={menuItem}>
                  <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />Quick summary</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { closeMenu(); if (onAddToCompare) onAddToCompare(thesis); }} className={menuItem}>
                  <span className="flex items-center gap-2">
                    <Scale className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                    {inComparison ? 'Remove from comparison' : comparisonCount > 0 ? `Compare (${comparisonCount} of 5 chosen)` : 'Compare'}
                  </span>
                  {inComparison && <Check className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />}
                </button>
                {(thesis.datasetUrl || thesis.hasDataset) && (
                  thesis.isDatasetLocked ? (
                    <button type="button" role="menuitem" onClick={() => { closeMenu(); if (onOpenMembership) onOpenMembership(); else if (onViewDetail) onViewDetail(thesis); }} className={menuItem}>
                      <span className="flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />Dataset (Premium)</span>
                    </button>
                  ) : (
                    <a role="menuitem" href={thesis.datasetUrl} target="_blank" rel="noreferrer" onClick={closeMenu} className={menuItem}>
                      <span className="flex items-center gap-2"><Database className="w-3.5 h-3.5 text-[#2C6B3F] dark:text-emerald-400" />Dataset{thesis.datasetFormat ? ` (${thesis.datasetFormat})` : ''}</span>
                      <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                    </a>
                  )
                )}
                {thesis.codeUrl && (
                  <a role="menuitem" href={thesis.codeUrl} target="_blank" rel="noreferrer" onClick={closeMenu} className={menuItem}>
                    <span className="flex items-center gap-2"><Code className="w-3.5 h-3.5 text-[#737067] dark:text-[#9A968D]" />Code</span>
                    <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                  </a>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { closeMenu(); handleUpvote(); }}
                  className={menuItem}
                  title={isLocalPaper ? 'Recommend this paper to other students' : 'Recommendations are available for papers deposited in this archive'}
                >
                  <span className="flex items-center gap-2">
                    <ArrowBigUp className={`w-4 h-4 ${hasUpvoted ? 'text-emerald-700 dark:text-emerald-400' : 'text-[#737067] dark:text-[#9A968D]'}`} />
                    {hasUpvoted ? 'Recommended by you' : 'Recommend'}
                  </span>
                  <span className="text-[#737067] dark:text-[#9A968D]">{upvotes}</span>
                </button>

                <div className="mt-1 pt-1 border-t border-[#F2EFE8] dark:border-[#2C2A26]">
                  <div className="px-3 pt-1 pb-0.5 text-[11px] text-[#737067] dark:text-[#9A968D]">Look it up elsewhere</div>
                  {thesis.doi && primaryLink?.label !== 'View DOI' && (
                    <a role="menuitem" href={`https://doi.org/${thesis.doi}`} target="_blank" rel="noreferrer" onClick={closeMenu} className={menuItem}>
                      <span>Publisher page (DOI)</span>
                      <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                    </a>
                  )}
                  <a role="menuitem" href={`https://scholar.google.com/scholar?q=%22${encodeURIComponent(thesis.title)}%22`} target="_blank" rel="noreferrer" onClick={closeMenu} className={menuItem}>
                    <span>Google Scholar</span>
                    <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                  </a>
                  <a role="menuitem" href={`https://www.semanticscholar.org/search?q=${encodeURIComponent(thesis.title)}`} target="_blank" rel="noreferrer" onClick={closeMenu} className={menuItem}>
                    <span>Semantic Scholar</span>
                    <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                  </a>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { closeMenu(); if (onReportIssue) onReportIssue(thesis); }}
                  className={`${menuItem} mt-1 border-t border-[#F2EFE8] dark:border-[#2C2A26] text-[#605D55] dark:text-[#A8A49C] hover:text-red-700 dark:hover:text-red-400`}
                >
                  <span className="flex items-center gap-2"><Flag className="w-3.5 h-3.5" />Report a problem</span>
                </button>

                {isAdmin && (
                  <div className="mt-1 pt-1 border-t border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
                    <div className="px-3 pt-1 pb-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-400">Admin</div>
                    <button type="button" role="menuitem" onClick={() => { closeMenu(); handlePin(); }} disabled={loading} className={menuItem}>
                      <span className="flex items-center gap-2"><Pin className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />{thesis.isPinned ? 'Unpin' : 'Pin to top'}</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { closeMenu(); setShowDeleteConfirm(true); }} disabled={loading} className={`${menuItem} text-red-700 dark:text-red-400`}>
                      <span className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />Delete record</span>
                    </button>
                  </div>
                )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* In-App Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-xs" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#38352F] rounded-sm shadow-2xl max-w-sm w-full p-5 z-10 font-mono-meta text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
              <h4 className="font-bold text-red-700 dark:text-red-400">Delete record</h4>
              <button onClick={() => setShowDeleteConfirm(false)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18] dark:hover:text-white">✕</button>
            </div>
            <p className="text-neutral-700 dark:text-neutral-300 font-sans leading-relaxed">
              Delete this record from the archive for good? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2DFD8] dark:border-[#2C2A26]">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 border border-[#D5D1C7] dark:border-[#38352F] rounded-xs text-[#737067] dark:text-[#9A968D] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await executeDelete();
                }}
                className="px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-xs font-bold cursor-pointer"
              >
                Delete record
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
