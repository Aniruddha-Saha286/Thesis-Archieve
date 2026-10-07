import React, { useState, useEffect } from 'react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import axios from 'axios';
import {
  X,
  User,
  Building2,
  ExternalLink,
  BookOpen,
  Award,
  TrendingUp,
  FileText,
  Search,
  Filter,
  Loader2,
  Globe,
  Quote,
} from 'lucide-react';

export default function AuthorProfileModal({
  authorId,
  initialAuthor = null,
  onClose,
  onSelectAuthorPublications,
  onViewThesisDetail,
}) {
  useEscapeToClose(onClose, true);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    if (!authorId && !initialAuthor?.id) return;
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const cleanId = authorId || initialAuthor?.id;
        const res = await axios.get(`/api/authors/${encodeURIComponent(cleanId)}`);
        setProfile(res.data);
      } catch (err) {
        console.error('Failed to load author profile:', err);
        setError('Unable to load author bibliometric profile.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [authorId, initialAuthor]);

  const author = profile?.author || initialAuthor;
  const works = profile?.works || [];

  const filteredWorks = works.filter((w) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      (w.title && w.title.toLowerCase().includes(q)) ||
      (w.venue && w.venue.toLowerCase().includes(q)) ||
      (w.publishedYear && String(w.publishedYear).includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm w-full max-w-4xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] font-mono-meta text-xs cursor-pointer"
        >
          [✕ CLOSE]
        </button>

        {loading && !author ? (
          <div className="py-20 text-center space-y-3 font-mono-meta text-xs text-[#737067] dark:text-[#9C988F]">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1C1B18] dark:text-[#F0EDE6]" />
            <p>Retrieving author bibliometrics and publication record...</p>
          </div>
        ) : error && !author ? (
          <div className="py-12 text-center space-y-3 font-mono-meta text-xs text-red-700 dark:text-red-400">
            <p>{error}</p>
            <button
              onClick={onClose}
              className="bg-[#1C1B18] dark:bg-[#2C2A26] text-white px-3 py-1.5 rounded-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Header: Author Name, Institution, Provenance & Links */}
            <div className="border-b border-[#E2DFD8] dark:border-[#2C2A26] pb-4 space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-mono-meta uppercase tracking-wider text-[#737067] dark:text-[#9C988F]">
                <span className="bg-[#1C1B18] dark:bg-[#383530] text-white px-2 py-0.5 rounded-xs font-bold">
                  Researcher Profile
                </span>
                <span>Verified Provider: OpenAlex</span>
                {profile?.retrievedAt && (
                  <span>• Retrieved: {new Date(profile.retrievedAt).toLocaleDateString()}</span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                  <h2 className="text-2xl font-serif-title font-medium text-[#1C1B18] dark:text-[#F0EDE6] leading-tight">
                    {author?.name || 'Academic Researcher'}
                  </h2>

                  {author?.nameAlternatives && author.nameAlternatives.length > 0 && (
                    <p className="text-xs text-[#737067] dark:text-[#9C988F] font-mono-meta mt-0.5">
                      Also published as: {author.nameAlternatives.slice(0, 3).join(', ')}
                    </p>
                  )}

                  {/* Affiliation */}
                  {author?.lastKnownInstitution && (
                    <div className="flex items-center gap-1.5 text-xs text-[#524F47] dark:text-[#B0ACA2] mt-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-800 dark:text-amber-500" />
                      <span className="font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">
                        {author.lastKnownInstitution.name}
                      </span>
                      {author.lastKnownInstitution.countryCode && (
                        <span className="bg-[#FAF9F5] dark:bg-[#24221E] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#E8E6E1] px-1.5 py-0.2 rounded-xs text-[11px] font-mono-meta font-bold">
                          {author.lastKnownInstitution.countryCode}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {author?.orcid && (
                    <a
                      href={author.orcid.startsWith('http') ? author.orcid : `https://orcid.org/${author.orcid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 px-2.5 py-1.5 rounded-sm text-xs font-mono-meta transition flex items-center gap-1.5"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                      <span>ORCID Record</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {author?.openAlexId && (
                    <a
                      href={author.openAlexId}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-[#FAF9F5] dark:bg-[#24221E] hover:bg-[#F2EFE8] dark:hover:bg-[#2A2824] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#E8E6E1] px-2.5 py-1.5 rounded-sm text-xs font-mono-meta transition flex items-center gap-1.5"
                    >
                      <span>OpenAlex</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {onSelectAuthorPublications && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAuthorPublications(author);
                        onClose();
                      }}
                      className="bg-[#1C1B18] dark:bg-amber-600 hover:bg-[#2E2C28] dark:hover:bg-amber-700 text-white px-3 py-1.5 rounded-sm text-xs font-mono-meta transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-amber-300 dark:text-amber-100" />
                      <span>Explore in Search Feed</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics Dashboard Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-meta">
              <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#2C2A26] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] dark:text-[#9C988F] text-[11px] uppercase">
                  <span>Total Works</span>
                  <BookOpen className="w-3.5 h-3.5 text-[#1C1B18] dark:text-[#F0EDE6]" />
                </div>
                <div className="text-xl font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                  {author?.worksCount ? author.worksCount.toLocaleString() : '0'}
                </div>
                <div className="text-[11px] text-[#737067] dark:text-[#9C988F]">Indexed publications</div>
              </div>

              <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#2C2A26] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] dark:text-[#9C988F] text-[11px] uppercase">
                  <span>Total Citations</span>
                  <Quote className="w-3.5 h-3.5 text-[#2C6B3F] dark:text-emerald-400" />
                </div>
                <div className="text-xl font-bold text-[#2C6B3F] dark:text-emerald-400">
                  {author?.citationCount !== undefined && author?.citationCount !== null
                    ? author.citationCount.toLocaleString()
                    : '—'}
                </div>
                <div className="text-[11px] text-[#737067] dark:text-[#9C988F]">Source: OpenAlex</div>
              </div>

              <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#2C2A26] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] dark:text-[#9C988F] text-[11px] uppercase">
                  <span>h-index</span>
                  <Award className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                </div>
                <div className="text-xl font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                  {author?.hIndex !== null && author?.hIndex !== undefined ? author.hIndex : '—'}
                </div>
                <div className="text-[11px] text-[#737067] dark:text-[#9C988F]">Impact metric</div>
              </div>

              <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#2C2A26] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] dark:text-[#9C988F] text-[11px] uppercase">
                  <span>i10-index</span>
                  <TrendingUp className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                </div>
                <div className="text-xl font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                  {author?.i10Index !== null && author?.i10Index !== undefined ? author.i10Index : '—'}
                </div>
                <div className="text-[11px] text-[#737067] dark:text-[#9C988F]">≥10 citations</div>
              </div>
            </div>

            {/* Research Topics */}
            {author?.topics && author.topics.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#737067] dark:text-[#9C988F] block">
                  Core Research Topics & Concepts:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {author.topics.map((t, idx) => (
                    <span
                      key={idx}
                      className="bg-white dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#2C2A26] text-[#1C1B18] dark:text-[#E8E6E1] px-2 py-0.5 rounded-xs text-xs font-mono-meta"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Works List with Filter-Within */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-serif-title font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                    Selected Publications & Theses ({filteredWorks.length})
                  </h3>
                  {loading && <Loader2 className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 animate-spin" />}
                </div>

                {/* Filter within works */}
                <div className="relative max-w-xs w-full">
                  <input
                    type="text"
                    placeholder="Filter papers by keyword, venue, year..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-2.5 py-1 text-xs text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F] font-mono-meta"
                  />
                  {filterQuery && (
                    <button
                      onClick={() => setFilterQuery('')}
                      className="absolute right-2 top-1.5 text-[#737067] dark:text-[#9C988F] text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {profile?.worksStatus === 'error' ? (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-6 text-center rounded-sm font-mono-meta text-xs text-amber-900 dark:text-amber-300 space-y-2">
                  <p className="font-bold">Author publications could not be retrieved from provider at this time.</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-400">{profile.worksError || 'Technical communication timeout with OpenAlex'}</p>
                  {onSelectAuthorPublications && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAuthorPublications(author);
                        onClose();
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1C1B18] dark:bg-amber-600 text-white rounded-xs font-mono-meta hover:bg-[#2E2C28] dark:hover:bg-amber-700 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-amber-300 dark:text-amber-100" />
                      <span>Search Publications in Main Feed</span>
                    </button>
                  )}
                </div>
              ) : filteredWorks.length === 0 ? (
                <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#E2DFD8] dark:border-[#2C2A26] p-8 text-center rounded-sm font-mono-meta text-xs text-[#737067] dark:text-[#9C988F]">
                  {works.length === 0
                    ? 'No publication records currently indexed for this author.'
                    : 'No publications match your filter keyword.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredWorks.map((work) => (
                    <div
                      key={work.id || work.doi || work.title}
                      className="bg-white dark:bg-[#201F1C] border border-[#E2DFD8] dark:border-[#2C2A26] hover:border-[#1C1B18] dark:hover:border-[#E8E6E1] p-4 rounded-sm transition space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 text-[11px] font-mono-meta text-[#737067] dark:text-[#9C988F] flex-wrap">
                            <span className="bg-[#FAF9F5] dark:bg-[#24221E] border border-[#D5D1C7] dark:border-[#383530] px-1.5 py-0.2 rounded-xs font-bold uppercase text-[#1C1B18] dark:text-[#E8E6E1]">
                              {work.publicationType || 'Publication'}
                            </span>
                            {work.publishedYear && <span>{work.publishedYear}</span>}
                            {work.venue && (
                              <span className="truncate max-w-[240px]">
                                {work.venue}
                              </span>
                            )}
                            {work.citationCount !== null && work.citationCount !== undefined && (
                              <span className="text-[#2C6B3F] dark:text-emerald-400 font-bold">
                                ★ {work.citationCount} {work.citationCount === 1 ? 'citation' : 'citations'} · OpenAlex
                              </span>
                            )}
                          </div>

                          <h4
                            onClick={() => onViewThesisDetail && onViewThesisDetail(work)}
                            className="text-sm font-serif-title font-medium text-[#1C1B18] dark:text-[#F0EDE6] group-hover:text-amber-900 dark:group-hover:text-amber-400 group-hover:underline cursor-pointer leading-snug"
                          >
                            {work.title}
                          </h4>

                          {work.authorDisplay && (
                            <p className="text-xs text-[#524F47] dark:text-[#B0ACA2]">
                              {work.authorDisplay}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 pt-1 font-mono-meta text-xs">
                          {work.pdfUrl && (
                            <a
                              href={work.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#F0EDE6] dark:hover:bg-[#E2DFD8] text-white dark:text-[#141412] px-2.5 py-1 rounded-sm text-[11px] transition flex items-center gap-1"
                              title="Open PDF full-text"
                            >
                              <FileText className="w-3 h-3 text-amber-300 dark:text-amber-700" />
                              <span>PDF</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => onViewThesisDetail && onViewThesisDetail(work)}
                            className="bg-[#FAF9F5] dark:bg-[#24221E] hover:bg-[#F2EFE8] dark:hover:bg-[#2A2824] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#E8E6E1] px-2.5 py-1 rounded-sm text-[11px] transition cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {works.length > 0 && (author?.worksCount || 0) > works.length && onSelectAuthorPublications && (
                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectAuthorPublications(author);
                          onClose();
                        }}
                        className="w-full py-2.5 bg-[#FAF9F5] dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#2A2824] border border-[#D5D1C7] dark:border-[#2C2A26] text-[#1C1B18] dark:text-[#F0EDE6] text-xs font-mono-meta rounded-sm transition flex items-center justify-center gap-2 cursor-pointer font-bold"
                      >
                        <Search className="w-3.5 h-3.5 text-[#1C1B18] dark:text-[#F0EDE6]" />
                        <span>Explore all {author?.worksCount?.toLocaleString() || ''} publications in Search Feed</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
