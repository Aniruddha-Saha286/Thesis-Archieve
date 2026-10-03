import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
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
  Globe,
  Lock,
  MoreHorizontal,
  Sparkles,
  Check,
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
}) {
  const { isAdmin, user, isAuthenticated } = useAuth();
  const { showNotice } = useSocket();
  const [upvotes, setUpvotes] = useState(thesis.upvotes || 0);
  const [hasUpvoted, setHasUpvoted] = useState(
    thesis.upvotedBy?.some((id) => id === user?.id || id?._id === user?.id) || false
  );
  const [isSaved, setIsSaved] = useState(false);
  const [savingPaper, setSavingPaper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef(null);

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

  const isLocalPaper = Boolean(
    thesis._id &&
    (thesis.source === 'Local Repository' || (!thesis.source && !thesis.isExternal))
  );

  const handleUpvote = async () => {
    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('Sign in with your student account to endorse research papers.');
      return;
    }
    try {
      const res = await axios.post(`/api/thesis/${thesis._id || thesis.id}/upvote`);
      if (res.data?.code === 'EXTERNAL_PAPER_UPVOTE_UNSUPPORTED') {
        showNotice(res.data.message || 'Endorsements are available for locally cataloged institutional records.', 'info');
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
        onRequireAuth('Sign in with your student account to save papers and annotate private notes.');
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
    } catch (err) {
      console.error('Failed to toggle save paper:', err);
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
      showNotice('Failed to update pin state.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/thesis/${thesis._id || thesis.id}`);
      if (onDeleted) onDeleted(thesis._id || thesis.id);
      showNotice('Thesis record removed from repository.', 'info');
    } catch (err) {
      showNotice('Failed to delete thesis record.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Determine publication type styling
  const pubType = (thesis.publicationType || thesis.degreeType || 'article').toLowerCase();
  const isThesisType = pubType.includes('thesis') || pubType.includes('dissertation') || pubType.includes('capstone');
  const isPreprint = pubType.includes('preprint') || thesis.source === 'arXiv';
  const isConference = pubType.includes('proceedings') || pubType.includes('conference');

  // Direct authentic PDF detection
  const isDirectPdf = Boolean(
    thesis.isDirectPdf ||
    (thesis.pdfUrl && (
      thesis.pdfUrl.endsWith('.pdf') ||
      thesis.pdfUrl.includes('/pdf/') ||
      thesis.pdfUrl.includes('pmc.ncbi.nlm.nih.gov') ||
      thesis.pdfUrl.includes('/servlets/purl')
    ))
  );

  return (
    <article
      className={`bg-white dark:bg-[#161513] border rounded-sm p-5 md:p-6 shadow-2xs space-y-4 transition-colors ${
        thesis.isPinned ? 'border-amber-400 bg-amber-50/20 dark:bg-amber-950/20' : 'border-[#E2DFD8] dark:border-[#2C2A26] hover:border-[#BDB9AF] dark:hover:border-[#423F3A]'
      }`}
    >
      {/* Retraction Warning Banner if Retracted */}
      {thesis.isRetracted && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 p-2.5 rounded-sm text-xs font-mono-meta text-red-900 dark:text-red-300 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
            <span>CAUTION: RETRACTED OR DISPUTED SCHOLARLY PUBLICATION</span>
          </div>
          {thesis.retractionNoticeUrl && (
            <a
              href={thesis.retractionNoticeUrl}
              target="_blank"
              rel="noreferrer"
              className="underline font-bold text-red-800 dark:text-red-300 hover:text-black dark:hover:text-white cursor-pointer"
            >
              Read Official Retraction Notice ↗
            </a>
          )}
        </div>
      )}

      {/* Main Header / Badges Row */}
      <div className="flex items-center gap-2 text-[11px] font-mono-meta text-[#737067] dark:text-[#9A968D] flex-wrap">
        {thesis.isPinned && (
          <span className="bg-amber-400 text-neutral-950 px-1.5 py-0.5 rounded-sm font-bold uppercase flex items-center gap-1">
            <Pin className="w-3 h-3" /> PINNED
          </span>
        )}

        {/* Publication Type Chip */}
        <span
          className={`px-2 py-0.5 rounded-sm font-bold uppercase text-[10px] ${
            isThesisType
              ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-900 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
              : isPreprint
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
              : isConference
              ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
              : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
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

        {/* Peer-review status honesty */}
        {thesis.isPeerReviewed === true && (
          <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-sm text-[10px] font-bold">
            ✓ Peer-Reviewed
          </span>
        )}

        {/* Provenance Source */}
        {thesis.source && (
          <span className="bg-[#1C1B18] dark:bg-[#2C2A26] text-white px-2 py-0.5 rounded-sm font-bold uppercase text-[10px]">
            {thesis.source}
          </span>
        )}

        {thesis.isOpenAccess && (
          <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded-sm font-bold uppercase text-[10px]">
            OPEN ACCESS
          </span>
        )}

        {thesis.subjects && thesis.subjects.length > 0 ? (
          thesis.subjects.slice(0, 2).map((sub) => (
            <span
              key={sub.id}
              className="bg-[#FAF9F5] dark:bg-[#201F1C] text-[#1C1B18] dark:text-[#E8E6E1] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-sm font-semibold uppercase text-xs"
            >
              {sub.shortLabel || sub.label}
            </span>
          ))
        ) : thesis.category ? (
          <span className="bg-[#FAF9F5] dark:bg-[#201F1C] text-[#5C5950] dark:text-[#A8A49C] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-sm font-semibold uppercase text-xs">
            {thesis.category}
          </span>
        ) : null}

        {thesis.doi && (
          <span className="text-[#605D55] dark:text-[#9A968D]">
            DOI: <strong className="text-[#1C1B18] dark:text-[#F0EDE6]">{thesis.doi}</strong>
          </span>
        )}
      </div>

      {/* Thesis Title (Clickable link for details) */}
      <h3
        onClick={() => onViewDetail && onViewDetail(thesis)}
        className="text-lg md:text-xl font-serif-title font-normal text-[#1C1B18] dark:text-[#F0EDE6] hover:text-amber-900 dark:hover:text-amber-300 hover:underline cursor-pointer leading-snug transition-colors"
        title="View publication details"
      >
        {thesis.title}
      </h3>

      {/* Abstract: Readable 15px text with generous line-height */}
      <p className="text-[15px] text-[#4A4740] dark:text-[#A8A49C] leading-relaxed font-light line-clamp-3">
        {thesis.abstract || 'No abstract text deposited in public scholarly metadata.'}
      </p>

      {/* Metadata Row: Author, Affiliation, Venue, Year, Citations */}
      <div className="pt-1 text-xs text-[#737067] dark:text-[#9A968D] flex items-center gap-x-4 gap-y-1.5 flex-wrap font-sans">
        <span>
          Author:{' '}
          {thesis.authorships && thesis.authorships.length > 0 ? (
            thesis.authorships.slice(0, 3).map((auth, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && ', '}
                {onSelectAuthor && (auth.author?.id || auth.author?.name) ? (
                  <button
                    type="button"
                    onClick={() => onSelectAuthor(auth.author)}
                    className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium hover:text-amber-800 dark:hover:text-amber-300 underline transition cursor-pointer"
                    title={`View profile for ${auth.author.name}`}
                  >
                    {auth.author.name}
                  </button>
                ) : (
                  <strong className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium">{auth.author?.name || 'Unrecorded'}</strong>
                )}
              </React.Fragment>
            ))
          ) : (
            <strong className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium">
              {thesis.author || (Array.isArray(thesis.authors) && thesis.authors.map(a => a.name).join(', ')) || 'Unrecorded'}
            </strong>
          )}
          {thesis.authorships && thesis.authorships.length > 3 && ' et al.'}
        </span>

        {thesis.advisor && (
          <span>
            Advisor: <strong className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium">{thesis.advisor}</strong>
          </span>
        )}

        <span>
          Year: <strong className="text-[#1C1B18] dark:text-[#F0EDE6] font-medium">{thesis.publishedYear || 'Unrecorded'}</strong>
        </span>

        {/* Institution / Awarding Body */}
        {thesis.awardingInstitution?.name ? (
          <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300 px-2 py-0.5 rounded-sm text-[11px]">
            <Building2 className="w-3 h-3 text-blue-700 dark:text-blue-400" />
            <span>Awarded by: <strong>{thesis.awardingInstitution.name}</strong></span>
            {thesis.awardingInstitution.countryCode && (
              <span className="font-mono-meta text-[10px] font-bold">[{thesis.awardingInstitution.countryCode}]</span>
            )}
          </div>
        ) : (thesis.authorships?.[0]?.institutions?.[0]?.name || thesis.university) ? (
          <div className="flex items-center gap-1 bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-sm text-[11px] text-[#1C1B18] dark:text-[#E8E6E1]">
            <Building2 className="w-3 h-3 text-amber-800 dark:text-amber-400" />
            <span>Affiliation: <strong>{thesis.authorships?.[0]?.institutions?.[0]?.name || thesis.university}</strong></span>
            {thesis.authorships?.[0]?.institutions?.[0]?.countryCode && (
              <span className="font-mono-meta text-[10px] font-bold">[{thesis.authorships[0].institutions[0].countryCode}]</span>
            )}
          </div>
        ) : null}

        {/* Clickable Publisher / Venue */}
        {(thesis.publisher || thesis.venue) && (
          <div className="flex items-center gap-1 bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-0.5 rounded-sm text-[11px] text-[#1C1B18] dark:text-[#E8E6E1]">
            <span>Venue:</span>
            <button
              type="button"
              onClick={() => onSelectPublisher && onSelectPublisher(thesis.publisher || thesis.venue)}
              className="font-semibold text-[#1C1B18] dark:text-[#F0EDE6] hover:text-amber-800 dark:hover:text-amber-300 underline transition cursor-pointer"
              title={`Filter publications by ${thesis.publisher || thesis.venue}`}
            >
              {thesis.publisher || thesis.venue}
            </button>
          </div>
        )}

        {/* Citation Count with Attribution */}
        {thesis.citationCount !== undefined && thesis.citationCount !== null && (
          <span className="font-mono-meta text-[#2C6B3F] dark:text-emerald-300 font-semibold text-[11px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-sm">
            ★ {thesis.citationCount.toLocaleString()} {thesis.citationCount === 1 ? 'citation' : 'citations'} · {thesis.citationSource || 'OpenAlex'}
          </span>
        )}
      </div>

      {/* Structured Action Bar: Primary, Secondary, Details, Compare, Dataset, More Menu */}
      <div className="pt-2 border-t border-[#F2EFE8] dark:border-[#24221E] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* ONE PRIMARY BUTTON: Open PDF or View Source */}
          {isDirectPdf && thesis.pdfUrl ? (
            <a
              href={thesis.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 px-4 py-2 rounded-sm text-sm font-semibold transition shadow-2xs min-h-[44px]"
              title={`Open direct verified full-text PDF: ${thesis.title}`}
            >
              <FileText className="w-4 h-4 text-amber-300 dark:text-neutral-950" />
              <span>Open PDF</span>
            </a>
          ) : (thesis.fullTextUrl || thesis.pdfUrl) ? (
            <a
              href={thesis.fullTextUrl || thesis.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 px-4 py-2 rounded-sm text-sm font-semibold transition shadow-2xs min-h-[44px]"
              title="Open full text landing page"
            >
              <ExternalLink className="w-4 h-4 text-blue-300 dark:text-neutral-950" />
              <span>View Source</span>
            </a>
          ) : thesis.doi ? (
            <a
              href={`https://doi.org/${thesis.doi}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 px-4 py-2 rounded-sm text-sm font-semibold transition shadow-2xs min-h-[44px]"
              title="Open official publisher DOI landing page"
            >
              <ExternalLink className="w-4 h-4 text-amber-300 dark:text-neutral-950" />
              <span>View DOI Source</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onViewDetail && onViewDetail(thesis)}
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 px-4 py-2 rounded-sm text-sm font-semibold transition shadow-2xs min-h-[44px] cursor-pointer"
            >
              <FileText className="w-4 h-4 text-amber-300 dark:text-neutral-950" />
              <span>View Details</span>
            </button>
          )}

          {/* SECONDARY BUTTON: Save / Saved */}
          <button
            type="button"
            onClick={handleToggleSave}
            disabled={savingPaper}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border rounded-sm text-sm font-medium transition min-h-[44px] cursor-pointer ${
              isSaved
                ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-300 font-bold'
                : 'bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6]'
            }`}
            title={isSaved ? 'Saved to personal library' : 'Save to personal library'}
          >
            <Bookmark className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          {/* SECONDARY BUTTON: Cite */}
          <button
            type="button"
            onClick={() => onCite && onCite(thesis)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm text-sm font-medium transition min-h-[44px] cursor-pointer"
            title="Cite in BibTeX, RIS, or APA"
          >
            <Quote className="w-4 h-4 text-[#737067] dark:text-[#9A968D]" />
            <span>Cite</span>
          </button>

          {/* SECONDARY BUTTON: Compare with visible label and tray count */}
          <button
            type="button"
            onClick={() => onAddToCompare && onAddToCompare(thesis)}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border rounded-sm text-sm font-medium transition min-h-[44px] cursor-pointer ${
              inComparison
                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 border-purple-300 dark:border-purple-700 font-bold'
                : 'bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6]'
            }`}
            title={inComparison ? 'Remove from literature comparison matrix' : 'Add to literature comparison matrix'}
          >
            <Scale className="w-4 h-4 text-purple-700 dark:text-purple-400" />
            <span>
              {inComparison
                ? 'In Matrix'
                : comparisonCount > 0
                ? `Compare (${comparisonCount}/5)`
                : 'Compare'}
            </span>
          </button>

          {/* Details Action */}
          <button
            type="button"
            onClick={() => onViewDetail && onViewDetail(thesis, 'overview')}
            className="inline-flex items-center justify-center gap-1 text-[#605D55] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] text-xs font-mono-meta underline px-2 py-2 min-h-[44px] cursor-pointer"
            title="Inspect full metadata and open science datasets"
          >
            <span>Details &rarr;</span>
          </button>

          {/* Quick Summary Action */}
          <button
            type="button"
            onClick={() => onViewDetail && onViewDetail(thesis, 'summary')}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-amber-50/70 dark:hover:bg-amber-950/40 border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] hover:text-amber-900 dark:hover:text-amber-300 hover:border-amber-300 dark:hover:border-amber-700 rounded-sm text-xs font-mono-meta transition min-h-[44px] cursor-pointer"
            title="Grounded research summary extracted from paper text"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Summary</span>
          </button>

          {/* Dataset Action / Badge */}
          {(thesis.datasetUrl || thesis.hasDataset) && (
            thesis.isDatasetLocked ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenMembership) {
                    onOpenMembership();
                  } else if (onViewDetail) {
                    onViewDetail(thesis);
                  }
                }}
                className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-3 py-2 rounded-sm text-xs font-mono-meta transition cursor-pointer min-h-[44px]"
                title="Paper-specific dataset access locked for Standard Academic plan"
              >
                <Lock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                <span>Dataset (Premium)</span>
              </button>
            ) : (
              <a
                href={thesis.datasetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] text-[#1C1B18] dark:text-[#F0EDE6] border border-[#D5D1C7] dark:border-[#38352F] px-3 py-2 rounded-sm text-xs font-mono-meta transition min-h-[44px]"
                title="Direct open research dataset"
              >
                <Database className="w-3.5 h-3.5 text-[#2C6B3F] dark:text-emerald-400" />
                <span>Dataset {thesis.datasetFormat ? `(${thesis.datasetFormat})` : '↗'}</span>
              </a>
            )
          )}
        </div>

        {/* Right side: Upvote Endorsement & MORE MENU */}
        <div className="flex items-center gap-2">
          {/* Endorse / Upvote */}
          <button
            type="button"
            onClick={handleUpvote}
            className={`px-3 py-2 border rounded-sm transition flex items-center gap-1.5 text-xs font-mono-meta min-h-[44px] cursor-pointer ${
              hasUpvoted
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold'
                : 'bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6]'
            }`}
            title={isLocalPaper ? 'Endorse Research Publication' : 'Endorsements are available for locally cataloged institutional records'}
          >
            <ArrowBigUp className="w-4 h-4" />
            <span>{upvotes}</span>
          </button>

          {/* MORE MENU DROPDOWN (...) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2.5 bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm transition flex items-center justify-center min-h-[44px] min-w-[42px] cursor-pointer"
              title="More actions (Google Scholar, Semantic Scholar, DOI, Code, Report)"
            >
              <MoreHorizontal className="w-4 h-4 text-[#605D55] dark:text-[#9A968D]" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 w-56 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] rounded-sm shadow-xl z-20 py-1 text-xs font-mono-meta">
                <a
                  href={`https://scholar.google.com/scholar?q=%22${encodeURIComponent(thesis.title)}%22`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowMoreMenu(false)}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] dark:hover:bg-[#282622] text-blue-900 dark:text-blue-400 transition"
                >
                  <span>Google Scholar</span>
                  <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                </a>

                <a
                  href={`https://www.semanticscholar.org/search?q=${encodeURIComponent(thesis.title)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowMoreMenu(false)}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] dark:hover:bg-[#282622] text-purple-900 dark:text-purple-400 transition"
                >
                  <span>Semantic Scholar</span>
                  <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                </a>

                {thesis.doi && (
                  <a
                    href={`https://doi.org/${thesis.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setShowMoreMenu(false)}
                    className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] dark:hover:bg-[#282622] text-[#1C1B18] dark:text-[#F0EDE6] transition border-t border-[#F2EFE8] dark:border-[#2C2A26]"
                  >
                    <span>Publisher DOI Record</span>
                    <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                  </a>
                )}

                {thesis.codeUrl && (
                  <a
                    href={thesis.codeUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setShowMoreMenu(false)}
                    className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] dark:hover:bg-[#282622] text-[#1C1B18] dark:text-[#F0EDE6] transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-[#737067] dark:text-[#9A968D]" />
                      <span>Code Repository</span>
                    </span>
                    <ExternalLink className="w-3 h-3 text-[#737067] dark:text-[#9A968D]" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    if (onReportIssue) onReportIssue(thesis);
                  }}
                  className="w-full text-left flex items-center justify-between px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-[#8C887E] hover:text-red-700 dark:hover:text-red-400 transition border-t border-[#F2EFE8] dark:border-[#2C2A26] cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5" />
                    <span>Report Issue</span>
                  </span>
                </button>

                {/* Admin Privileges inside menu */}
                {isAdmin && (
                  <div className="pt-1 mt-1 border-t border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-1.5 space-y-1">
                    <div className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase px-1.5">Admin Controls:</div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handlePin();
                      }}
                      disabled={loading}
                      className="w-full text-left px-2 py-1 bg-white dark:bg-[#1E1D1A] hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-xs transition text-[11px] cursor-pointer"
                    >
                      {thesis.isPinned ? 'Unpin from Top' : 'Pin to Top of Catalog'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowDeleteConfirm(true);
                      }}
                      disabled={loading}
                      className="w-full text-left px-2 py-1 bg-white dark:bg-[#1E1D1A] hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-xs transition text-[11px] cursor-pointer"
                    >
                      Purge Record from Archive
                    </button>
                  </div>
                )}
              </div>
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
              <h4 className="font-bold text-red-700 dark:text-red-400">Purge Record</h4>
              <button onClick={() => setShowDeleteConfirm(false)} className="cursor-pointer text-[#737067] hover:text-[#1C1B18] dark:hover:text-white">✕</button>
            </div>
            <p className="text-neutral-700 dark:text-neutral-300 font-sans leading-relaxed">
              Are you sure you want to permanently purge this thesis record from the repository?
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
                Purge Record
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
