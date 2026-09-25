import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
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
  const [upvotes, setUpvotes] = useState(thesis.upvotes || 0);
  const [hasUpvoted, setHasUpvoted] = useState(
    thesis.upvotedBy?.some((id) => id === user?.id || id?._id === user?.id) || false
  );
  const [isSaved, setIsSaved] = useState(false);
  const [savingPaper, setSavingPaper] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
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
        alert(res.data.message || 'Endorsements are available for locally cataloged institutional records.');
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
      alert('Failed to update pin state.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to purge this thesis record from the repository?')) return;
    try {
      setLoading(true);
      await axios.delete(`/api/thesis/${thesis._id || thesis.id}`);
      if (onDeleted) onDeleted(thesis._id || thesis.id);
    } catch (err) {
      alert('Failed to delete thesis record.');
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
      className={`bg-white border rounded-sm p-5 md:p-6 shadow-2xs space-y-4 transition-colors ${
        thesis.isPinned ? 'border-amber-400 bg-amber-50/20' : 'border-[#E2DFD8] hover:border-[#BDB9AF]'
      }`}
    >
      {/* Retraction Warning Banner if Retracted */}
      {thesis.isRetracted && (
        <div className="bg-red-50 border border-red-300 p-2.5 rounded-sm text-xs font-mono-meta text-red-900 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            <span>CAUTION: RETRACTED OR DISPUTED SCHOLARLY PUBLICATION</span>
          </div>
          {thesis.retractionNoticeUrl && (
            <a
              href={thesis.retractionNoticeUrl}
              target="_blank"
              rel="noreferrer"
              className="underline font-bold text-red-800 hover:text-black cursor-pointer"
            >
              Read Official Retraction Notice ↗
            </a>
          )}
        </div>
      )}

      {/* Main Header / Badges Row */}
      <div className="flex items-center gap-2 text-[11px] font-mono-meta text-[#737067] flex-wrap">
        {thesis.isPinned && (
          <span className="bg-amber-400 text-neutral-950 px-1.5 py-0.5 rounded-sm font-bold uppercase flex items-center gap-1">
            <Pin className="w-3 h-3" /> PINNED
          </span>
        )}

        {/* Publication Type Chip */}
        <span
          className={`px-2 py-0.5 rounded-sm font-bold uppercase text-[10px] ${
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

        {/* Peer-review status honesty */}
        {thesis.isPeerReviewed === true && (
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-sm text-[10px] font-bold">
            ✓ Peer-Reviewed
          </span>
        )}

        {/* Provenance Source */}
        {thesis.source && (
          <span className="bg-[#1C1B18] text-white px-2 py-0.5 rounded-sm font-bold uppercase text-[10px]">
            {thesis.source}
          </span>
        )}

        {thesis.isOpenAccess && (
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-sm font-bold uppercase text-[10px]">
            OPEN ACCESS
          </span>
        )}

        {thesis.subjects && thesis.subjects.length > 0 ? (
          thesis.subjects.slice(0, 2).map((sub) => (
            <span
              key={sub.id}
              className="bg-[#FAF9F5] text-[#1C1B18] border border-[#D5D1C7] px-2 py-0.5 rounded-sm font-semibold uppercase text-[10px]"
            >
              {sub.shortLabel || sub.label}
            </span>
          ))
        ) : thesis.category ? (
          <span className="bg-[#FAF9F5] text-[#5C5950] border border-[#D5D1C7] px-2 py-0.5 rounded-sm font-semibold uppercase text-[10px]">
            {thesis.category}
          </span>
        ) : null}

        {thesis.doi && (
          <span className="text-[#605D55]">
            DOI: <strong className="text-[#1C1B18]">{thesis.doi}</strong>
          </span>
        )}
      </div>

      {/* Thesis Title (Clickable link for details) */}
      <h3
        onClick={() => onViewDetail && onViewDetail(thesis)}
        className="text-lg md:text-xl font-serif-title font-normal text-[#1C1B18] hover:text-amber-900 hover:underline cursor-pointer leading-snug"
        title="View publication details"
      >
        {thesis.title}
      </h3>

      {/* Abstract: Readable 14px text */}
      <p className="text-sm text-[#524F47] leading-relaxed font-light line-clamp-3">
        {thesis.abstract || 'No abstract text deposited in public scholarly metadata.'}
      </p>

      {/* Metadata Row: Author, Affiliation, Venue, Year, Citations */}
      <div className="pt-1 text-xs text-[#737067] flex items-center gap-x-4 gap-y-1.5 flex-wrap font-sans">
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
                    className="text-[#1C1B18] font-medium hover:text-amber-800 underline transition cursor-pointer"
                    title={`View profile for ${auth.author.name}`}
                  >
                    {auth.author.name}
                  </button>
                ) : (
                  <strong className="text-[#1C1B18] font-medium">{auth.author?.name || 'Unrecorded'}</strong>
                )}
              </React.Fragment>
            ))
          ) : (
            <strong className="text-[#1C1B18] font-medium">
              {thesis.author || (Array.isArray(thesis.authors) && thesis.authors.map(a => a.name).join(', ')) || 'Unrecorded'}
            </strong>
          )}
          {thesis.authorships && thesis.authorships.length > 3 && ' et al.'}
        </span>

        {thesis.advisor && (
          <span>
            Advisor: <strong className="text-[#1C1B18] font-medium">{thesis.advisor}</strong>
          </span>
        )}

        <span>
          Year: <strong className="text-[#1C1B18] font-medium">{thesis.publishedYear || 'Unrecorded'}</strong>
        </span>

        {/* Institution / Awarding Body */}
        {thesis.awardingInstitution?.name ? (
          <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-900 px-2 py-0.5 rounded-sm text-[11px]">
            <Building2 className="w-3 h-3 text-blue-700" />
            <span>Awarded by: <strong>{thesis.awardingInstitution.name}</strong></span>
            {thesis.awardingInstitution.countryCode && (
              <span className="font-mono-meta text-[10px] font-bold">[{thesis.awardingInstitution.countryCode}]</span>
            )}
          </div>
        ) : (thesis.authorships?.[0]?.institutions?.[0]?.name || thesis.university) ? (
          <div className="flex items-center gap-1 bg-[#FAF9F5] border border-[#D5D1C7] px-2 py-0.5 rounded-sm text-[11px]">
            <Building2 className="w-3 h-3 text-amber-800" />
            <span>Affiliation: <strong>{thesis.authorships?.[0]?.institutions?.[0]?.name || thesis.university}</strong></span>
            {thesis.authorships?.[0]?.institutions?.[0]?.countryCode && (
              <span className="font-mono-meta text-[10px] font-bold">[{thesis.authorships[0].institutions[0].countryCode}]</span>
            )}
          </div>
        ) : null}

        {/* Clickable Publisher / Venue */}
        {(thesis.publisher || thesis.venue) && (
          <div className="flex items-center gap-1 bg-[#FAF9F5] border border-[#D5D1C7] px-2 py-0.5 rounded-sm text-[11px]">
            <span>Venue:</span>
            <button
              type="button"
              onClick={() => onSelectPublisher && onSelectPublisher(thesis.publisher || thesis.venue)}
              className="font-semibold text-[#1C1B18] hover:text-amber-800 underline transition cursor-pointer"
              title={`Filter publications by ${thesis.publisher || thesis.venue}`}
            >
              {thesis.publisher || thesis.venue}
            </button>
          </div>
        )}

        {/* Citation Count with Attribution */}
        {thesis.citationCount !== undefined && thesis.citationCount !== null && (
          <span className="font-mono-meta text-[#2C6B3F] font-semibold text-[11px] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-sm">
            ★ {thesis.citationCount.toLocaleString()} {thesis.citationCount === 1 ? 'citation' : 'citations'} · {thesis.citationSource || 'OpenAlex'}
          </span>
        )}
      </div>

      {/* Structured Action Bar: Primary, Secondary, Details, Compare, Dataset, More Menu */}
      <div className="pt-2 border-t border-[#F2EFE8] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* ONE PRIMARY BUTTON: Open PDF or View Source */}
          {isDirectPdf && thesis.pdfUrl ? (
            <a
              href={thesis.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-2 rounded-sm text-sm font-medium transition shadow-2xs min-h-[42px]"
              title={`Open direct verified full-text PDF: ${thesis.title}`}
            >
              <FileText className="w-4 h-4 text-amber-300" />
              <span>Open PDF</span>
            </a>
          ) : (thesis.fullTextUrl || thesis.pdfUrl) ? (
            <a
              href={thesis.fullTextUrl || thesis.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-2 rounded-sm text-sm font-medium transition shadow-2xs min-h-[42px]"
              title="Open full text landing page"
            >
              <ExternalLink className="w-4 h-4 text-blue-300" />
              <span>View Source</span>
            </a>
          ) : thesis.doi ? (
            <a
              href={`https://doi.org/${thesis.doi}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-2 rounded-sm text-sm font-medium transition shadow-2xs min-h-[42px]"
              title="Open official publisher DOI landing page"
            >
              <ExternalLink className="w-4 h-4 text-amber-300" />
              <span>View DOI Source</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onViewDetail && onViewDetail(thesis)}
              className="inline-flex items-center justify-center gap-2 bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-2 rounded-sm text-sm font-medium transition shadow-2xs min-h-[42px] cursor-pointer"
            >
              <FileText className="w-4 h-4 text-amber-300" />
              <span>View Details</span>
            </button>
          )}

          {/* SECONDARY BUTTON: Save / Saved */}
          <button
            type="button"
            onClick={handleToggleSave}
            disabled={savingPaper}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border rounded-sm text-sm font-medium transition min-h-[42px] cursor-pointer ${
              isSaved
                ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border-[#D5D1C7] text-[#1C1B18]'
            }`}
            title={isSaved ? 'Saved to personal library' : 'Save to personal library'}
          >
            <Bookmark className="w-4 h-4 text-amber-700" />
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          {/* SECONDARY BUTTON: Cite */}
          <button
            type="button"
            onClick={() => onCite && onCite(thesis)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] rounded-sm text-sm font-medium transition min-h-[42px] cursor-pointer"
            title="Cite in BibTeX, RIS, or APA"
          >
            <Quote className="w-4 h-4 text-[#737067]" />
            <span>Cite</span>
          </button>

          {/* SECONDARY BUTTON: Compare with visible label and tray count */}
          <button
            type="button"
            onClick={() => onAddToCompare && onAddToCompare(thesis)}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border rounded-sm text-sm font-medium transition min-h-[42px] cursor-pointer ${
              inComparison
                ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold'
                : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border-[#D5D1C7] text-[#1C1B18]'
            }`}
            title={inComparison ? 'Remove from literature comparison matrix' : 'Add to literature comparison matrix'}
          >
            <Scale className="w-4 h-4 text-purple-700" />
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
            className="inline-flex items-center justify-center gap-1 text-[#605D55] hover:text-[#1C1B18] text-xs font-mono-meta underline px-2 py-2 min-h-[42px] cursor-pointer"
            title="Inspect full metadata and open science datasets"
          >
            <span>Details &rarr;</span>
          </button>

          {/* Quick Summary Action */}
          <button
            type="button"
            onClick={() => onViewDetail && onViewDetail(thesis, 'summary')}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FAF9F5] hover:bg-amber-50/70 border border-[#D5D1C7] text-[#1C1B18] hover:text-amber-900 hover:border-amber-300 rounded-sm text-xs font-mono-meta transition min-h-[42px] cursor-pointer"
            title="Grounded research summary extracted from paper text"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
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
                className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-3 py-2 rounded-sm text-xs font-mono-meta transition cursor-pointer min-h-[42px]"
                title="Paper-specific dataset access locked for Standard Academic plan"
              >
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span>Dataset (Premium)</span>
              </button>
            ) : (
              <a
                href={thesis.datasetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-[#FAF9F5] hover:bg-[#F2EFE8] text-[#1C1B18] border border-[#D5D1C7] px-3 py-2 rounded-sm text-xs font-mono-meta transition min-h-[42px]"
                title="Direct open research dataset"
              >
                <Database className="w-3.5 h-3.5 text-[#2C6B3F]" />
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
            className={`px-3 py-2 border rounded-sm transition flex items-center gap-1.5 text-xs font-mono-meta min-h-[42px] cursor-pointer ${
              hasUpvoted
                ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold'
                : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border-[#D5D1C7] text-[#1C1B18]'
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
              className="p-2.5 bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] rounded-sm transition flex items-center justify-center min-h-[42px] min-w-[42px] cursor-pointer"
              title="More actions (Google Scholar, Semantic Scholar, DOI, Code, Report)"
            >
              <MoreHorizontal className="w-4 h-4 text-[#605D55]" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 w-56 bg-white border border-[#D5D1C7] rounded-sm shadow-xl z-20 py-1 text-xs font-mono-meta">
                <a
                  href={`https://scholar.google.com/scholar?q=%22${encodeURIComponent(thesis.title)}%22`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowMoreMenu(false)}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] text-blue-900 transition"
                >
                  <span>Google Scholar</span>
                  <ExternalLink className="w-3 h-3 text-[#737067]" />
                </a>

                <a
                  href={`https://www.semanticscholar.org/search?q=${encodeURIComponent(thesis.title)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowMoreMenu(false)}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] text-purple-900 transition"
                >
                  <span>Semantic Scholar</span>
                  <ExternalLink className="w-3 h-3 text-[#737067]" />
                </a>

                {thesis.doi && (
                  <a
                    href={`https://doi.org/${thesis.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setShowMoreMenu(false)}
                    className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] text-[#1C1B18] transition border-t border-[#F2EFE8]"
                  >
                    <span>Publisher DOI Record</span>
                    <ExternalLink className="w-3 h-3 text-[#737067]" />
                  </a>
                )}

                {thesis.codeUrl && (
                  <a
                    href={thesis.codeUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setShowMoreMenu(false)}
                    className="flex items-center justify-between px-3 py-2 hover:bg-[#FAF9F5] text-[#1C1B18] transition"
                  >
                    <span className="flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-[#737067]" />
                      <span>Code Repository</span>
                    </span>
                    <ExternalLink className="w-3 h-3 text-[#737067]" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    if (onReportIssue) onReportIssue(thesis);
                  }}
                  className="w-full text-left flex items-center justify-between px-3 py-2 hover:bg-red-50 text-[#8C887E] hover:text-red-700 transition border-t border-[#F2EFE8] cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5" />
                    <span>Report Issue</span>
                  </span>
                </button>

                {/* Admin Privileges inside menu */}
                {isAdmin && (
                  <div className="pt-1 mt-1 border-t border-amber-200 bg-amber-50/50 p-1.5 space-y-1">
                    <div className="text-[10px] font-bold text-amber-800 uppercase px-1.5">Admin Controls:</div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handlePin();
                      }}
                      disabled={loading}
                      className="w-full text-left px-2 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xs transition text-[11px] cursor-pointer"
                    >
                      {thesis.isPinned ? 'Unpin from Top' : 'Pin to Top of Catalog'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleDelete();
                      }}
                      disabled={loading}
                      className="w-full text-left px-2 py-1 bg-white hover:bg-red-50 text-red-700 border border-red-300 rounded-xs transition text-[11px] cursor-pointer"
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
    </article>
  );
}
