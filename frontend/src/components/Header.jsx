import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  LogOut,
  Users,
  User,
  X,
  Loader2,
  Bookmark,
  Folder,
  Scale,
  Bell,
  Shield,
  LogIn,
  SlidersHorizontal,
  FileText,
  Zap,
  Sparkles,
  Building2,
  Award,
} from 'lucide-react';

export default function Header({
  searchQuery = '',
  onSearch,
  loadingTheses = false,
  onOpenStudentManagement,
  pendingCount = 0,
  // New Workspace Triggers:
  onOpenSavedPapers,
  savedPapersCount = 0,
  onOpenCollections,
  onOpenComparisonMatrix,
  comparisonCount = 0,
  onOpenTopicAlerts,
  onOpenMembership,
  membershipPlan = 'free',
  onOpenLogin,
  // Publication type and filters
  selectedPublicationType = 'all',
  onChangePublicationType,
  hasPdfOnly = false,
  onToggleHasPdfOnly,
  isOpenAccessOnly = false,
  onToggleIsOpenAccessOnly,
  // Mode & Discovery Controls:
  searchMode = 'publications',
  onChangeSearchMode,
  onSelectAuthor,
  onToggleFilterDrawer,
  activeFilterCount = 0,
}) {
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const [inputValue, setInputValue] = useState(searchQuery);
  const [showFilters, setShowFilters] = useState(false);
  const debounceTimerRef = useRef(null);

  // Author candidates autocomplete state
  const [authorCandidates, setAuthorCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const authorDropdownRef = useRef(null);
  const authorSearchTimerRef = useRef(null);

  // Close author candidate dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (authorDropdownRef.current && !authorDropdownRef.current.contains(e.target)) {
        setShowAuthorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync internal search input
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

    // Never auto-fire committed search on typing debounce!
    // Search credit must only be billed upon explicit user submission (Enter or button click)
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchMode === 'authors') {
      // Explicit submission: trigger search for the entered string without silently overriding with candidate[0]
      triggerSearch(inputValue);
      setShowAuthorDropdown(false);
    } else {
      triggerSearch(inputValue);
    }
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
    <header className="bg-white border-b border-[#E2DFD8] sticky top-0 z-30 shadow-2xs">
      {/* Top Navbar Row */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] text-[#FAF9F5] flex items-center justify-center font-serif-title text-xl font-normal">
            §
          </div>
          <div>
            <span className="font-serif-title text-xl tracking-tight text-[#1C1B18] block leading-none">
              The Thesis Archive
            </span>
            <span className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider">
              Scholarly Discovery & Open Datasets
            </span>
          </div>
        </div>

        {/* Center: Search Box & Mode Switch */}
        <div className="flex-1 max-w-xl mx-2 order-3 md:order-2 w-full md:w-auto relative" ref={authorDropdownRef}>
          <div className="flex items-center gap-2">
            {/* Search Mode Toggle */}
            <div className="flex items-center bg-[#FAF9F5] p-0.5 rounded-sm border border-[#D5D1C7] text-[10px] font-mono-meta shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (onChangeSearchMode) onChangeSearchMode('publications');
                  setShowAuthorDropdown(false);
                }}
                className={`px-2 py-1 rounded-xs transition cursor-pointer font-bold ${
                  searchMode === 'publications'
                    ? 'bg-[#1C1B18] text-white shadow-2xs'
                    : 'text-[#605D55] hover:text-[#1C1B18]'
                }`}
                title="Search publications by title, DOI, or keywords"
              >
                Works
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onChangeSearchMode) onChangeSearchMode('authors');
                }}
                className={`px-2 py-1 rounded-xs transition cursor-pointer font-bold ${
                  searchMode === 'authors'
                    ? 'bg-[#1C1B18] text-white shadow-2xs'
                    : 'text-[#605D55] hover:text-[#1C1B18]'
                }`}
                title="Search researchers with citation metrics and profiles"
              >
                Authors
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="relative flex-1 flex items-center">
              <div className="relative w-full">
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
                      ? 'Search researchers: e.g. Yoshua Bengio, Hinton, ORCID...'
                      : 'Search 250M+ scholarly works: title, author, DOI, domain...'
                  }
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] hover:border-[#8C887E] focus:border-[#1C1B18] px-3.5 py-1.5 pl-8 pr-16 text-xs text-[#1C1B18] placeholder-[#8C887E] focus:outline-none rounded-sm transition font-sans"
                />

                {/* Left Search Icon or Loading Spinner */}
                <div className="absolute left-2.5 top-2.5 pointer-events-none">
                  {loadingTheses || loadingCandidates ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5 text-[#8C887E]" />
                  )}
                </div>

                {/* Clear and Submit */}
                <div className="absolute right-2 top-1.5 flex items-center gap-1">
                  {inputValue && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="p-1 text-[#8C887E] hover:text-[#1C1B18] transition rounded-xs cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="submit"
                    className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-2 py-0.5 rounded-xs text-[10px] font-mono-meta uppercase tracking-wider font-semibold transition cursor-pointer"
                  >
                    Search
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Author Candidates Autocomplete Dropdown */}
          {searchMode === 'authors' && showAuthorDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#D5D1C7] rounded-sm shadow-xl z-50 overflow-hidden font-sans">
              <div className="bg-[#FAF9F5] px-3 py-1.5 border-b border-[#E2DFD8] text-[10px] font-mono-meta uppercase tracking-wider text-[#737067] flex items-center justify-between">
                <span>Matching Researchers ({authorCandidates.length})</span>
                <span className="text-[#2C6B3F] font-bold">OpenAlex Metrics</span>
              </div>

              {authorCandidates.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#737067] font-mono-meta">
                  {loadingCandidates ? 'Searching verified academic authors...' : 'No author matches found.'}
                </div>
              ) : (
                <div className="divide-y divide-[#F2EFE8] max-h-72 overflow-y-auto">
                  {authorCandidates.map((cand) => (
                    <div
                      key={cand.id}
                      onClick={() => {
                        if (onSelectAuthor) onSelectAuthor(cand);
                        setShowAuthorDropdown(false);
                      }}
                      className="p-3 hover:bg-[#FAF9F5] cursor-pointer transition flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#1C1B18] font-serif-title text-sm">
                            {cand.name}
                          </span>
                          {cand.orcid && (
                            <span className="bg-emerald-50 text-emerald-900 border border-emerald-300 text-[9px] px-1 rounded-2xs font-mono-meta font-bold">
                              ORCID
                            </span>
                          )}
                        </div>

                        {cand.lastKnownInstitution && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#524F47]">
                            <Building2 className="w-3 h-3 text-amber-800" />
                            <span>{cand.lastKnownInstitution.name}</span>
                            {cand.lastKnownInstitution.countryCode && (
                              <span className="font-mono-meta text-[10px] text-[#737067]">
                                [{cand.lastKnownInstitution.countryCode}]
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Author Bibliometrics */}
                      <div className="text-right font-mono-meta text-[11px] shrink-0 text-[#605D55]">
                        <div className="text-[#2C6B3F] font-bold">
                          ★ {cand.citationCount ? cand.citationCount.toLocaleString() : '0'} citations
                        </div>
                        <div className="text-[10px] text-[#8C887E]">
                          {cand.worksCount || 0} works {cand.hIndex ? `· h:${cand.hIndex}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Workspace & Authentication Controls */}
        <div className="flex items-center gap-2 order-2 md:order-3 font-mono-meta text-xs">
          {isAuthenticated ? (
            <>
              {/* Saved Papers Button */}
              <button
                type="button"
                onClick={onOpenSavedPapers}
                className="px-2.5 py-1.5 rounded-sm bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] flex items-center gap-1.5 transition cursor-pointer"
                title="Saved Papers & Research Notes"
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden lg:inline">Saved</span>
                {savedPapersCount > 0 && (
                  <span className="bg-[#1C1B18] text-white text-[10px] px-1.5 py-0.2 rounded-xs font-bold">
                    {savedPapersCount}
                  </span>
                )}
              </button>

              {/* Collections Button */}
              <button
                type="button"
                onClick={onOpenCollections}
                className="px-2.5 py-1.5 rounded-sm bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] flex items-center gap-1.5 transition cursor-pointer"
                title="Collections & Bibliography Export"
              >
                <Folder className="w-3.5 h-3.5 text-blue-700" />
                <span className="hidden lg:inline">Collections</span>
              </button>

              {/* Compare Matrix Button */}
              <button
                type="button"
                onClick={onOpenComparisonMatrix}
                className={`px-2.5 py-1.5 rounded-sm border flex items-center gap-1.5 transition cursor-pointer ${
                  comparisonCount > 0
                    ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold'
                    : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border-[#D5D1C7] text-[#1C1B18]'
                }`}
                title="Literature Review Comparison Matrix"
              >
                <Scale className="w-3.5 h-3.5 text-purple-700" />
                <span className="hidden lg:inline">Compare</span>
                {comparisonCount > 0 && (
                  <span className="bg-purple-700 text-white text-[10px] px-1.5 py-0.2 rounded-xs font-bold">
                    {comparisonCount}
                  </span>
                )}
              </button>

              {/* Topic Alerts */}
              <button
                type="button"
                onClick={onOpenTopicAlerts}
                className="p-1.5 rounded-sm bg-[#FAF9F5] hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] transition cursor-pointer"
                title="Topic Alerts & Subscriptions"
              >
                <Bell className="w-3.5 h-3.5 text-[#737067]" />
              </button>

              {/* Admin Button */}
              {isAdmin && (
                <button
                  onClick={onOpenStudentManagement}
                  className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-2.5 py-1.5 rounded-sm text-xs transition flex items-center gap-1 shadow-2xs cursor-pointer border border-amber-500"
                  title="Manage verification applications"
                >
                  <Shield className="w-3.5 h-3.5 text-neutral-950" />
                  <span className="hidden sm:inline">Admin</span>
                  {pendingCount > 0 && (
                    <span className="bg-neutral-950 text-amber-300 text-[10px] px-1 rounded-xs">
                      {pendingCount}
                    </span>
                  )}
                </button>
              )}

              {/* Membership & Upgrade Button */}
              <button
                type="button"
                onClick={onOpenMembership}
                className="px-2.5 py-1.5 rounded-sm bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 border border-purple-200 text-purple-900 flex items-center gap-1.5 transition cursor-pointer shadow-2xs font-semibold"
                title="Membership Plans, 7-Day Trial & bKash Upgrade"
              >
                <Zap className="w-3.5 h-3.5 text-purple-600 fill-current" />
                <span className="hidden md:inline">
                  {membershipPlan === 'premium' ? 'Premium' : membershipPlan === 'trial' ? '7-Day Trial' : 'Membership'}
                </span>
              </button>

              {/* User Avatar & Logout */}
              <div className="w-7 h-7 rounded-sm border border-[#D5D1C7] bg-[#F2EFE8] flex items-center justify-center text-xs font-bold text-[#1C1B18]">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
              </div>

              <button
                onClick={logout}
                className="text-[#737067] hover:text-[#1C1B18] p-1 cursor-pointer transition"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              {/* Guest Quick Links */}
              <button
                type="button"
                onClick={onOpenComparisonMatrix}
                className={`px-2 py-1 rounded-sm border flex items-center gap-1 transition cursor-pointer text-xs ${
                  comparisonCount > 0
                    ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold'
                    : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] border-[#D5D1C7] text-[#524F47]'
                }`}
                title="Compare Matrix"
              >
                <Scale className="w-3.5 h-3.5 text-purple-700" />
                <span>Compare {comparisonCount > 0 ? `(${comparisonCount})` : ''}</span>
              </button>

              <button
                type="button"
                onClick={onOpenLogin}
                className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-3 py-1.5 rounded-sm flex items-center gap-1.5 transition cursor-pointer shadow-2xs font-medium"
              >
                <LogIn className="w-3.5 h-3.5 text-amber-300" />
                <span>Sign In / Workspace</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Subheader: Publication Type Filters & Quick Switches */}
      <div className="border-t border-[#EAE7DF] bg-[#FAF9F5] px-4 md:px-6 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs font-mono-meta">
          {/* Publication Types Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {pubTypes.map((type) => {
              const active = selectedPublicationType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onChangePublicationType && onChangePublicationType(type.id)}
                  className={`px-2.5 py-1 rounded-xs transition whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#1C1B18] text-white font-bold'
                      : 'text-[#5C5950] hover:text-[#1C1B18] hover:bg-[#EAE7DF]'
                  }`}
                >
                  {type.label}
                </button>
              );
            })}
          </div>

          {/* Quick Toggles */}
          <div className="flex items-center gap-3 text-[11px] text-[#524F47]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPdfOnly}
                onChange={(e) => onToggleHasPdfOnly && onToggleHasPdfOnly(e.target.checked)}
                className="rounded-none border-[#D5D1C7] text-[#1C1B18] focus:ring-0 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3 text-amber-600" />
                <span>Direct PDF Only</span>
              </span>
            </label>

            <span className="text-[#D5D1C7]">•</span>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isOpenAccessOnly}
                onChange={(e) => onToggleIsOpenAccessOnly && onToggleIsOpenAccessOnly(e.target.checked)}
                className="rounded-none border-[#D5D1C7] text-[#1C1B18] focus:ring-0 cursor-pointer"
              />
              <span>Open Access Only</span>
            </label>

            <span className="text-[#D5D1C7]">•</span>

            <button
              type="button"
              onClick={onToggleFilterDrawer}
              className={`px-2 py-0.5 rounded-xs transition flex items-center gap-1 cursor-pointer font-bold ${
                activeFilterCount > 0
                  ? 'bg-amber-100 border border-amber-300 text-amber-950'
                  : 'bg-white hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18]'
              }`}
              title="Filter by University, Country, Category, and Citations"
            >
              <SlidersHorizontal className="w-3 h-3 text-[#737067]" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-[#1C1B18] text-white text-[9px] px-1 py-0.2 rounded-2xs font-bold font-mono-meta">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
