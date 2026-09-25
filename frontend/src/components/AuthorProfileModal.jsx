import React, { useState, useEffect } from 'react';
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
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-4xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer"
        >
          [✕ CLOSE]
        </button>

        {loading && !author ? (
          <div className="py-20 text-center space-y-3 font-mono-meta text-xs text-[#737067]">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1C1B18]" />
            <p>Retrieving author bibliometrics and publication record...</p>
          </div>
        ) : error && !author ? (
          <div className="py-12 text-center space-y-3 font-mono-meta text-xs text-red-700">
            <p>{error}</p>
            <button
              onClick={onClose}
              className="bg-[#1C1B18] text-white px-3 py-1.5 rounded-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Header: Author Name, Institution, Provenance & Links */}
            <div className="border-b border-[#E2DFD8] pb-4 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-mono-meta uppercase tracking-wider text-[#737067]">
                <span className="bg-[#1C1B18] text-white px-2 py-0.5 rounded-xs font-bold">
                  Researcher Profile
                </span>
                <span>Verified Provider: OpenAlex</span>
                {profile?.retrievedAt && (
                  <span>• Retrieved: {new Date(profile.retrievedAt).toLocaleDateString()}</span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                  <h2 className="text-2xl font-serif-title font-medium text-[#1C1B18] leading-tight">
                    {author?.name || 'Academic Researcher'}
                  </h2>

                  {/* Name Alternatives */}
                  {author?.nameAlternatives && author.nameAlternatives.length > 0 && (
                    <p className="text-xs text-[#737067] font-mono-meta mt-0.5">
                      Also published as: {author.nameAlternatives.slice(0, 3).join(', ')}
                    </p>
                  )}

                  {/* Affiliation */}
                  {author?.lastKnownInstitution && (
                    <div className="flex items-center gap-1.5 text-xs text-[#524F47] mt-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-800" />
                      <span className="font-semibold text-[#1C1B18]">
                        {author.lastKnownInstitution.name}
                      </span>
                      {author.lastKnownInstitution.countryCode && (
                        <span className="bg-[#FAF9F5] border border-[#D5D1C7] text-[#1C1B18] px-1.5 py-0.2 rounded-xs text-[10px] font-mono-meta font-bold">
                          {author.lastKnownInstitution.countryCode}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* External Links & Search Trigger */}
                <div className="flex items-center gap-2 flex-wrap">
                  {author?.orcid && (
                    <a
                      href={author.orcid.startsWith('http') ? author.orcid : `https://orcid.org/${author.orcid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 px-2.5 py-1.5 rounded-sm text-xs font-mono-meta transition flex items-center gap-1.5"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-700" />
                      <span>ORCID Record</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {author?.openAlexId && (
                    <a
                      href={author.openAlexId}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1.5 rounded-sm text-xs font-mono-meta transition flex items-center gap-1.5"
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
                      className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-3 py-1.5 rounded-sm text-xs font-mono-meta transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-amber-300" />
                      <span>Explore in Search Feed</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics Dashboard Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-meta">
              <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] text-[10px] uppercase">
                  <span>Total Works</span>
                  <BookOpen className="w-3.5 h-3.5 text-[#1C1B18]" />
                </div>
                <div className="text-xl font-bold text-[#1C1B18]">
                  {author?.worksCount ? author.worksCount.toLocaleString() : '0'}
                </div>
                <div className="text-[10px] text-[#737067]">Indexed publications</div>
              </div>

              <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] text-[10px] uppercase">
                  <span>Total Citations</span>
                  <Quote className="w-3.5 h-3.5 text-[#2C6B3F]" />
                </div>
                <div className="text-xl font-bold text-[#2C6B3F]">
                  {author?.citationCount !== undefined && author?.citationCount !== null
                    ? author.citationCount.toLocaleString()
                    : '—'}
                </div>
                <div className="text-[10px] text-[#737067]">Source: OpenAlex</div>
              </div>

              <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] text-[10px] uppercase">
                  <span>h-index</span>
                  <Award className="w-3.5 h-3.5 text-amber-700" />
                </div>
                <div className="text-xl font-bold text-[#1C1B18]">
                  {author?.hIndex !== null && author?.hIndex !== undefined ? author.hIndex : '—'}
                </div>
                <div className="text-[10px] text-[#737067]">Impact metric</div>
              </div>

              <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-3 rounded-sm space-y-1">
                <div className="flex items-center justify-between text-[#737067] text-[10px] uppercase">
                  <span>i10-index</span>
                  <TrendingUp className="w-3.5 h-3.5 text-purple-700" />
                </div>
                <div className="text-xl font-bold text-[#1C1B18]">
                  {author?.i10Index !== null && author?.i10Index !== undefined ? author.i10Index : '—'}
                </div>
                <div className="text-[10px] text-[#737067]">≥10 citations</div>
              </div>
            </div>

            {/* Research Topics */}
            {author?.topics && author.topics.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono-meta font-bold uppercase tracking-wider text-[#737067] block">
                  Core Research Topics & Concepts:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {author.topics.map((t, idx) => (
                    <span
                      key={idx}
                      className="bg-white border border-[#D5D1C7] text-[#1C1B18] px-2 py-0.5 rounded-xs text-xs font-mono-meta"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Works List with Filter-Within */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E2DFD8]">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-serif-title font-bold text-[#1C1B18]">
                    Selected Publications & Theses ({filteredWorks.length})
                  </h3>
                  {loading && <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin" />}
                </div>

                {/* Filter within works */}
                <div className="relative max-w-xs w-full">
                  <input
                    type="text"
                    placeholder="Filter papers by keyword, venue, year..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-2.5 py-1 text-xs rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono-meta"
                  />
                  {filterQuery && (
                    <button
                      onClick={() => setFilterQuery('')}
                      className="absolute right-2 top-1.5 text-[#737067] text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {filteredWorks.length === 0 ? (
                <div className="bg-[#FAF9F5] border border-[#E2DFD8] p-8 text-center rounded-sm font-mono-meta text-xs text-[#737067]">
                  {works.length === 0
                    ? 'No publication records currently indexed for this author.'
                    : 'No publications match your filter keyword.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredWorks.map((work) => (
                    <div
                      key={work.id || work.doi || work.title}
                      className="bg-white border border-[#E2DFD8] hover:border-[#1C1B18] p-4 rounded-sm transition space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 text-[10px] font-mono-meta text-[#737067] flex-wrap">
                            <span className="bg-[#FAF9F5] border border-[#D5D1C7] px-1.5 py-0.2 rounded-xs font-bold uppercase text-[#1C1B18]">
                              {work.publicationType || 'Publication'}
                            </span>
                            {work.publishedYear && <span>{work.publishedYear}</span>}
                            {work.venue && (
                              <span className="truncate max-w-[240px]">
                                {work.venue}
                              </span>
                            )}
                            {work.citationCount !== null && work.citationCount !== undefined && (
                              <span className="text-[#2C6B3F] font-bold">
                                ★ {work.citationCount} {work.citationCount === 1 ? 'citation' : 'citations'} · OpenAlex
                              </span>
                            )}
                          </div>

                          <h4
                            onClick={() => onViewThesisDetail && onViewThesisDetail(work)}
                            className="text-sm font-serif-title font-medium text-[#1C1B18] group-hover:text-amber-900 group-hover:underline cursor-pointer leading-snug"
                          >
                            {work.title}
                          </h4>

                          {work.authorDisplay && (
                            <p className="text-xs text-[#524F47]">
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
                              className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-2.5 py-1 rounded-sm text-[11px] transition flex items-center gap-1"
                              title="Open PDF full-text"
                            >
                              <FileText className="w-3 h-3 text-amber-300" />
                              <span>PDF</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => onViewThesisDetail && onViewThesisDetail(work)}
                            className="bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1 rounded-sm text-[11px] transition cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
