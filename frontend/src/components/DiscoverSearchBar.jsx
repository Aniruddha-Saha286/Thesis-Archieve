import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Search,
  X,
  Loader2,
  FileText,
  SlidersHorizontal,
  Building2,
  Globe,
  Sparkles,
  Users,
  BookOpen,
} from 'lucide-react';

export default function DiscoverSearchBar({
  searchQuery = '',
  onSearch,
  loadingTheses = false,
  searchMode = 'publications', // 'publications' | 'authors'
  onChangeSearchMode,
  onSelectAuthor,
  selectedPublicationType = 'all',
  onChangePublicationType,
  hasPdfOnly = false,
  onToggleHasPdfOnly,
  isOpenAccessOnly = false,
  onToggleIsOpenAccessOnly,
  onToggleFilterDrawer,
  activeFilterCount = 0,
  onOpenCoverage,
}) {
  const [inputValue, setInputValue] = useState(searchQuery);
  const debounceTimerRef = useRef(null);

  // Author candidates autocomplete
  const [authorCandidates, setAuthorCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const authorDropdownRef = useRef(null);
  const authorSearchTimerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(e.target)) {
        setShowAuthorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync internal search input with external searchQuery
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const triggerSearch = (query) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (onSearch) {
      onSearch(query.trim());
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setInputValue(val);

    if (searchMode === 'authors') {
      if (authorSearchTimerRef.current) clearTimeout(authorSearchTimerRef.current);
      if (val.trim().length >= 2) {
        authorSearchTimerRef.current = setTimeout(async () => {
          try {
            setLoadingCandidates(true);
            const res = await axios.get('/api/authors/search', { params: { q: val.trim(), limit: 6 } });
            setAuthorCandidates(res.data || []);
            setShowAuthorDropdown(true);
          } catch (err) {
            console.error('Author autocomplete error:', err);
          } finally {
            setLoadingCandidates(false);
          }
        }, 300);
      } else {
        setAuthorCandidates([]);
        setShowAuthorDropdown(false);
      }
      return;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setShowAuthorDropdown(false);
    if (searchMode === 'authors') {
      const q = inputValue.trim();
      if (!q) return;
      if (authorCandidates.length > 0) {
        if (onSelectAuthor) onSelectAuthor(authorCandidates[0]);
        return;
      }
      try {
        setLoadingCandidates(true);
        const res = await axios.get('/api/authors/search', { params: { q, limit: 1 } });
        if (Array.isArray(res.data) && res.data.length > 0) {
          if (onSelectAuthor) onSelectAuthor(res.data[0]);
        } else {
          setAuthorCandidates([]);
          setShowAuthorDropdown(true);
        }
      } catch (err) {
        console.error('Author search error:', err);
      } finally {
        setLoadingCandidates(false);
      }
      return;
    }
    triggerSearch(inputValue);
  };

  const handleClear = () => {
    setInputValue('');
    setAuthorCandidates([]);
    setShowAuthorDropdown(false);
    triggerSearch('');
  };

  const pubTypes = [
    { id: 'all', label: 'All Records' },
    { id: 'thesis', label: 'Theses & Dissertations' },
    { id: 'journal-article', label: 'Journal Articles' },
    { id: 'conference-paper', label: 'Conference Papers' },
    { id: 'preprint', label: 'Preprints' },
    { id: 'book', label: 'Books' },
  ];

  return (
    <div className="bg-white dark:bg-[#151413] border-b border-[#E2DFD8] dark:border-[#2A2824] transition-colors py-6 md:py-8 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-5">
        {/* Header Title & Mode Selector */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono-meta text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Federated Scholarly Search</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-serif-title font-normal tracking-tight text-[#1C1B18] dark:text-[#FAF9F5]">
              Discover Scholarly Research
            </h1>
            <p className="text-xs md:text-sm text-[#737067] dark:text-[#9E9A90] max-w-2xl leading-relaxed">
              Query millions of open-access papers, doctoral dissertations, conference proceedings, preprints, and author metrics across OpenAlex, arXiv, Crossref, Europe PMC, HAL, and DOAJ.
            </p>
          </div>

          {/* Search Mode Pill Switch */}
          <div className="flex items-center bg-[#FAF9F5] dark:bg-[#1C1A18] p-1 rounded-sm border border-[#D5D1C7] dark:border-[#383530] text-xs font-mono-meta shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                if (onChangeSearchMode) onChangeSearchMode('publications');
                setShowAuthorDropdown(false);
              }}
              className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer font-bold ${
                searchMode === 'publications'
                  ? 'bg-[#1C1B18] text-white dark:bg-[#FAF9F5] dark:text-[#1C1B18] shadow-2xs'
                  : 'text-[#605D55] dark:text-[#9E9A90] hover:text-[#1C1B18] dark:hover:text-[#FAF9F5]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Publications</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onChangeSearchMode) onChangeSearchMode('authors');
              }}
              className={`px-3 py-1.5 rounded-xs transition flex items-center gap-1.5 cursor-pointer font-bold ${
                searchMode === 'authors'
                  ? 'bg-[#1C1B18] text-white dark:bg-[#FAF9F5] dark:text-[#1C1B18] shadow-2xs'
                  : 'text-[#605D55] dark:text-[#9E9A90] hover:text-[#1C1B18] dark:hover:text-[#FAF9F5]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Authors</span>
            </button>
          </div>
        </div>

        {/* Prominent Search Form */}
        <div className="relative" ref={authorDropdownRef}>
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <div className="relative w-full shadow-xs">
              <input
                type="text"
                value={inputValue}
                onChange={handleChange}
                onFocus={() => {
                  if (searchMode === 'authors' && authorCandidates.length > 0) {
                    setShowAuthorDropdown(true);
                  }
                }}
                placeholder={
                  searchMode === 'authors'
                    ? 'Search researchers: e.g. Yoshua Bengio, Geoffrey Hinton, ORCID identifier...'
                    : 'Search papers by title, topic keywords, author names, DOI, or publisher...'
                }
                className="w-full bg-[#FAF9F5] dark:bg-[#1C1A18] border-2 border-[#D5D1C7] dark:border-[#383530] hover:border-[#1C1B18] dark:hover:border-[#FAF9F5] focus:border-[#1C1B18] dark:focus:border-[#FAF9F5] px-4 py-3 pl-11 pr-24 text-sm md:text-base text-[#1C1B18] dark:text-[#FAF9F5] placeholder-[#8C887E] dark:placeholder-[#736E66] focus:outline-none rounded-sm transition font-sans"
              />

              {/* Left Search Icon or Loading Spinner */}
              <div className="absolute left-3.5 top-3.5 pointer-events-none">
                {loadingTheses || loadingCandidates ? (
                  <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                ) : (
                  <Search className="w-5 h-5 text-[#8C887E] dark:text-[#736E66]" />
                )}
              </div>

              {/* Clear & Submit Action Group */}
              <div className="absolute right-2 top-2 flex items-center gap-1.5">
                {inputValue && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1.5 text-[#8C887E] hover:text-[#1C1B18] dark:text-[#736E66] dark:hover:text-[#FAF9F5] transition rounded-xs cursor-pointer"
                    title="Clear search query"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="submit"
                  className="bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#FAF9F5] dark:hover:bg-white text-white dark:text-[#1C1B18] px-4 py-2 rounded-xs text-xs font-mono-meta uppercase tracking-wider font-bold transition cursor-pointer shadow-2xs"
                >
                  Search
                </button>
              </div>
            </div>
          </form>

          {/* Author Candidates Autocomplete Dropdown */}
          {searchMode === 'authors' && showAuthorDropdown && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] rounded-sm shadow-xl z-50 overflow-hidden font-sans">
              <div className="bg-[#FAF9F5] dark:bg-[#181614] px-4 py-2 border-b border-[#E2DFD8] dark:border-[#2E2B26] text-xs font-mono-meta uppercase tracking-wider text-[#737067] dark:text-[#9E9A90] flex items-center justify-between">
                <span>Matching Researchers ({authorCandidates.length})</span>
                <span className="text-[#2C6B3F] dark:text-emerald-400 font-bold">OpenAlex Bibliometrics</span>
              </div>

              {authorCandidates.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#737067] dark:text-[#9E9A90] font-mono-meta">
                  {loadingCandidates ? 'Searching verified academic authors...' : 'No author matches found.'}
                </div>
              ) : (
                <div className="divide-y divide-[#F2EFE8] dark:divide-[#2E2B26] max-h-80 overflow-y-auto">
                  {authorCandidates.map((cand) => (
                    <div
                      key={cand.id}
                      onClick={() => {
                        if (onSelectAuthor) onSelectAuthor(cand);
                        setShowAuthorDropdown(false);
                      }}
                      className="p-3.5 hover:bg-[#FAF9F5] dark:hover:bg-[#24211D] cursor-pointer transition flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#1C1B18] dark:text-[#FAF9F5] font-serif-title text-base">
                            {cand.name}
                          </span>
                          {cand.orcid && (
                            <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[9px] px-1.5 py-0.2 rounded-2xs font-mono-meta font-bold">
                              ORCID
                            </span>
                          )}
                        </div>

                        {cand.lastKnownInstitution && (
                          <div className="flex items-center gap-1.5 text-xs text-[#524F47] dark:text-[#B3AFA6]">
                            <Building2 className="w-3 h-3 text-amber-800 dark:text-amber-500" />
                            <span>{cand.lastKnownInstitution.name}</span>
                            {cand.lastKnownInstitution.countryCode && (
                              <span className="font-mono-meta text-[10px] text-[#737067] dark:text-[#9E9A90]">
                                [{cand.lastKnownInstitution.countryCode}]
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-right font-mono-meta text-xs shrink-0 text-[#605D55] dark:text-[#B3AFA6]">
                        <div className="text-[#2C6B3F] dark:text-emerald-400 font-bold">
                          ★ {cand.citationCount ? cand.citationCount.toLocaleString() : '0'} citations
                        </div>
                        <div className="text-[10px] text-[#8C887E] dark:text-[#736E66]">
                          {cand.worksCount || 0} works {cand.hIndex ? `· h-index: ${cand.hIndex}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Publication Type Filters & Quick Switches Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono-meta pt-1">
          {/* Publication Types Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {pubTypes.map((type) => {
              const active = selectedPublicationType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onChangePublicationType && onChangePublicationType(type.id)}
                  className={`px-3 py-1.5 rounded-xs transition whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#1C1B18] text-white dark:bg-[#FAF9F5] dark:text-[#1C1B18] font-bold shadow-2xs'
                      : 'bg-[#FAF9F5] dark:bg-[#1C1A18] text-[#5C5950] dark:text-[#A6A298] hover:text-[#1C1B18] dark:hover:text-[#FAF9F5] border border-[#D5D1C7] dark:border-[#383530]'
                  }`}
                >
                  {type.label}
                </button>
              );
            })}
          </div>

          {/* Secondary Quick Toggles & Controls */}
          <div className="flex items-center gap-3 text-xs text-[#524F47] dark:text-[#B3AFA6] flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasPdfOnly}
                onChange={(e) => onToggleHasPdfOnly && onToggleHasPdfOnly(e.target.checked)}
                className="rounded-none border-[#D5D1C7] dark:border-[#47433C] text-[#1C1B18] focus:ring-0 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Direct PDF Only</span>
              </span>
            </label>

            <span className="text-[#D5D1C7] dark:text-[#383530]">•</span>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isOpenAccessOnly}
                onChange={(e) => onToggleIsOpenAccessOnly && onToggleIsOpenAccessOnly(e.target.checked)}
                className="rounded-none border-[#D5D1C7] dark:border-[#47433C] text-[#1C1B18] focus:ring-0 cursor-pointer"
              />
              <span>Open Access Only</span>
            </label>

            <span className="text-[#D5D1C7] dark:text-[#383530]">•</span>

            <button
              type="button"
              onClick={onToggleFilterDrawer}
              className={`px-2.5 py-1 rounded-xs transition flex items-center gap-1.5 cursor-pointer font-bold ${
                activeFilterCount > 0
                  ? 'bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-300'
                  : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#FAF9F5]'
              }`}
              title="Filter by Discipline, University, Country, Year, and Citations"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#737067] dark:text-[#9E9A90]" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-[#1C1B18] dark:bg-[#FAF9F5] text-white dark:text-[#1C1B18] text-[9px] px-1.5 py-0.2 rounded-2xs font-bold font-mono-meta">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {onOpenCoverage && (
              <>
                <span className="text-[#D5D1C7] dark:text-[#383530] hidden sm:inline">•</span>
                <button
                  type="button"
                  onClick={onOpenCoverage}
                  className="hidden sm:inline-flex px-2 py-1 rounded-xs bg-[#FAF9F5] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#524F47] dark:text-[#B3AFA6] hover:text-[#1C1B18] dark:hover:text-[#FAF9F5] transition items-center gap-1.5 cursor-pointer"
                  title="View federated coverage and source disclosures"
                >
                  <Globe className="w-3.5 h-3.5 text-[#737067] dark:text-[#9E9A90]" />
                  <span>Coverage & Sources</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
