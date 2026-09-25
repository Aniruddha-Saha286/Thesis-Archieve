import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Building2,
  Globe,
  SlidersHorizontal,
  X,
  Search,
  Check,
  Award,
  Quote,
  Loader2,
  Info,
  RotateCcw,
} from 'lucide-react';

const COMMON_COUNTRIES = [
  { code: 'BD', name: 'Bangladesh' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'IN', name: 'India' },
];

export default function DiscoveryFiltersPanel({
  // Subjects
  subjects = [],
  selectedSubjectId = '',
  onSelectSubject,
  // Institution
  selectedInstitution = null, // { id, name, countryCode, type, ror }
  onSelectInstitution,
  institutionMode = 'affiliation', // 'affiliation' | 'awarding'
  onChangeInstitutionMode,
  academicOnly = true,
  onChangeAcademicOnly,
  // Country Multi-select
  selectedCountries = [], // ['BD', 'US']
  onToggleCountry,
  onClearCountries,
  // Citations & Sort
  minCitations = '',
  onChangeMinCitations,
  sortOrder = 'relevance',
  onChangeSortOrder,
  // Author
  selectedAuthor = null, // { id, name, orcid }
  onClearAuthor,
  // Apply & Reset
  onApplyFilters,
  onResetAllFilters,
  className = '',
}) {
  // Draft filter states for multi-filter staging
  const [draftInstitution, setDraftInstitution] = useState(selectedInstitution);
  const [draftInstitutionMode, setDraftInstitutionMode] = useState(institutionMode);
  const [draftAcademicOnly, setDraftAcademicOnly] = useState(academicOnly);
  const [draftCountries, setDraftCountries] = useState(selectedCountries || []);
  const [draftMinCitations, setDraftMinCitations] = useState(minCitations || '');
  const [draftSortOrder, setDraftSortOrder] = useState(sortOrder || 'relevance');

  useEffect(() => {
    setDraftInstitution(selectedInstitution);
    setDraftInstitutionMode(institutionMode);
    setDraftAcademicOnly(academicOnly);
    setDraftCountries(selectedCountries || []);
    setDraftMinCitations(minCitations || '');
    setDraftSortOrder(sortOrder || 'relevance');
  }, [selectedInstitution, institutionMode, academicOnly, selectedCountries, minCitations, sortOrder]);

  const effectiveInstitution = onApplyFilters ? draftInstitution : selectedInstitution;
  const effectiveInstitutionMode = onApplyFilters ? draftInstitutionMode : institutionMode;
  const effectiveAcademicOnly = onApplyFilters ? draftAcademicOnly : academicOnly;
  const effectiveCountries = onApplyFilters ? draftCountries : selectedCountries;
  const effectiveMinCitations = onApplyFilters ? draftMinCitations : minCitations;
  const effectiveSortOrder = onApplyFilters ? draftSortOrder : sortOrder;

  const isDirty = Boolean(onApplyFilters) && (
    (draftInstitution?.id || '') !== (selectedInstitution?.id || '') ||
    draftInstitutionMode !== institutionMode ||
    draftAcademicOnly !== academicOnly ||
    draftMinCitations !== (minCitations || '') ||
    draftSortOrder !== sortOrder ||
    draftCountries.length !== (selectedCountries || []).length ||
    draftCountries.some((c) => !(selectedCountries || []).includes(c))
  );

  const handleApply = () => {
    if (onApplyFilters) {
      onApplyFilters({
        institution: draftInstitution,
        institutionMode: draftInstitutionMode,
        academicOnly: draftAcademicOnly,
        countries: draftCountries,
        minCitations: draftMinCitations,
        sortOrder: draftSortOrder,
      });
    }
  };

  // Institution typeahead state
  const [instInput, setInstInput] = useState('');
  const [instSuggestions, setInstSuggestions] = useState([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [showInstDropdown, setShowInstDropdown] = useState(false);
  const instDropdownRef = useRef(null);
  const instTimerRef = useRef(null);

  // Custom country input state
  const [customCountryInput, setCustomCountryInput] = useState('');

  // Close institution dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (instDropdownRef.current && !instDropdownRef.current.contains(e.target)) {
        setShowInstDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInstInputChange = (val) => {
    setInstInput(val);
    if (instTimerRef.current) clearTimeout(instTimerRef.current);

    if (val.trim().length >= 2) {
      instTimerRef.current = setTimeout(async () => {
        try {
          setLoadingInst(true);
          const res = await axios.get('/api/institutions/suggest', {
            params: {
              q: val.trim(),
              academic_only: effectiveAcademicOnly,
              limit: 7,
            },
          });
          setInstSuggestions(res.data || []);
          setShowInstDropdown(true);
        } catch (err) {
          console.error('Institution suggest error:', err);
        } finally {
          setLoadingInst(false);
        }
      }, 300);
    } else {
      setInstSuggestions([]);
      setShowInstDropdown(false);
    }
  };

  const handleSelectInstItem = (inst) => {
    if (onApplyFilters) {
      setDraftInstitution(inst);
    } else if (onSelectInstitution) {
      onSelectInstitution(inst);
    }
    setInstInput('');
    setInstSuggestions([]);
    setShowInstDropdown(false);
  };

  const handleClearInstitution = () => {
    if (onApplyFilters) {
      setDraftInstitution(null);
    } else if (onSelectInstitution) {
      onSelectInstitution(null);
    }
  };

  const handleAddCustomCountry = (e) => {
    e.preventDefault();
    const code = customCountryInput.trim().toUpperCase();
    if (code && /^[A-Z]{2}$/.test(code)) {
      if (onApplyFilters) {
        setDraftCountries((prev) => (prev.includes(code) ? prev : [...prev, code]));
      } else if (onToggleCountry) {
        onToggleCountry(code);
      }
      setCustomCountryInput('');
    }
  };

  const handleToggleCountryCode = (code) => {
    if (onApplyFilters) {
      setDraftCountries((prev) =>
        prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
      );
    } else if (onToggleCountry) {
      onToggleCountry(code);
    }
  };

  const handleClearCountriesList = () => {
    if (onApplyFilters) {
      setDraftCountries([]);
    } else if (onClearCountries) {
      onClearCountries();
    }
  };

  const handleMinCitationsChange = (val) => {
    if (onApplyFilters) {
      setDraftMinCitations(val);
    } else if (onChangeMinCitations) {
      onChangeMinCitations(val);
    }
  };

  const handleSortOrderChange = (val) => {
    if (onApplyFilters) {
      setDraftSortOrder(val);
    } else if (onChangeSortOrder) {
      onChangeSortOrder(val);
    }
  };

  const handleReset = () => {
    setDraftInstitution(null);
    setDraftInstitutionMode('affiliation');
    setDraftAcademicOnly(true);
    setDraftCountries([]);
    setDraftMinCitations('');
    setDraftSortOrder('relevance');
    if (onResetAllFilters) {
      onResetAllFilters();
    }
  };

  const citationPresets = [
    { label: 'Any', value: '' },
    { label: '10+', value: '10' },
    { label: '50+', value: '50' },
    { label: '100+', value: '100' },
    { label: '500+', value: '500' },
  ];

  return (
    <div className={`space-y-5 text-xs ${className}`}>
      {/* Draft Apply Bar (Top) */}
      {onApplyFilters && isDirty && (
        <div className="p-2 bg-amber-50 border border-amber-300 rounded-sm flex items-center justify-between gap-2 animate-in fade-in">
          <span className="font-mono-meta text-[11px] text-amber-900 font-bold">
            Pending filter changes
          </span>
          <button
            type="button"
            onClick={handleApply}
            className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-2.5 py-1 rounded-sm text-xs font-mono-meta font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            <Check className="w-3 h-3 text-emerald-400" />
            <span>Apply Now</span>
          </button>
        </div>
      )}
      {/* Active Author Filter Pill (if author search was activated) */}
      {selectedAuthor && (
        <div className="bg-amber-50 border border-amber-300 p-2.5 rounded-sm flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono-meta uppercase tracking-wider text-amber-900 block font-bold">
              Active Author Filter
            </span>
            <span className="font-serif-title text-sm font-semibold text-[#1C1B18]">
              {selectedAuthor.name}
            </span>
            {selectedAuthor.lastKnownInstitution && (
              <span className="text-[11px] text-[#524F47] block">
                {selectedAuthor.lastKnownInstitution.name}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClearAuthor}
            className="text-amber-900 hover:text-black font-mono-meta text-xs p-1 cursor-pointer"
            title="Remove author filter"
          >
            ✕
          </button>
        </div>
      )}

      {/* University / Institution Discovery */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E2DFD8]">
          <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#605D55] flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>University / Institution</span>
          </span>
          {effectiveInstitution && (
            <button
              type="button"
              onClick={handleClearInstitution}
              className="text-[10px] font-mono-meta text-amber-800 underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {effectiveInstitution ? (
          <div className="bg-[#FAF9F5] border border-[#1C1B18] p-2.5 rounded-sm flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-[#1C1B18] text-xs">
                {effectiveInstitution.name}
              </div>
              <div className="text-[10px] font-mono-meta text-[#737067] flex items-center gap-1.5 mt-0.5">
                {effectiveInstitution.countryCode && (
                  <span className="bg-white border border-[#D5D1C7] px-1 rounded-2xs font-bold text-[#1C1B18]">
                    {effectiveInstitution.countryCode}
                  </span>
                )}
                <span>{effectiveInstitution.type || 'education'}</span>
                {effectiveInstitution.ror && <span>• ROR verified</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearInstitution}
              className="text-[#737067] hover:text-[#1C1B18] text-xs cursor-pointer"
              title="Remove institution"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="relative" ref={instDropdownRef}>
            <div className="relative">
              <input
                type="text"
                value={instInput}
                onChange={(e) => handleInstInputChange(e.target.value)}
                placeholder="Search university: e.g. Harvard, BUET, MIT..."
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-2.5 py-1.5 pr-7 text-xs rounded-sm focus:outline-none focus:border-[#1C1B18] font-sans"
              />
              <div className="absolute right-2 top-2 pointer-events-none text-[#737067]">
                {loadingInst ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
              </div>
            </div>

            {/* Suggestions dropdown */}
            {showInstDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#D5D1C7] rounded-sm shadow-lg z-40 max-h-56 overflow-y-auto divide-y divide-[#F2EFE8]">
                {instSuggestions.length === 0 ? (
                  <div className="p-3 text-center text-[11px] font-mono-meta text-[#737067]">
                    {loadingInst ? 'Searching global institutions...' : 'No institution found.'}
                  </div>
                ) : (
                  instSuggestions.map((inst) => (
                    <div
                      key={inst.id}
                      onClick={() => handleSelectInstItem(inst)}
                      className="p-2 hover:bg-[#FAF9F5] cursor-pointer transition text-left"
                    >
                      <div className="font-medium text-[#1C1B18] text-xs leading-snug">
                        {inst.name}
                      </div>
                      <div className="text-[10px] font-mono-meta text-[#737067] flex items-center gap-1.5 mt-0.5">
                        {inst.countryCode && (
                          <span className="bg-[#FAF9F5] border border-[#D5D1C7] px-1 rounded-2xs font-bold text-[#1C1B18]">
                            {inst.countryCode}
                          </span>
                        )}
                        <span>{inst.type}</span>
                        {inst.acronyms && inst.acronyms.length > 0 && (
                          <span>({inst.acronyms[0]})</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Institution Mode & Academic-Only Controls */}
        <div className="space-y-1.5 pt-1 text-[11px] font-mono-meta text-[#605D55]">
          <div className="flex items-center justify-between">
            <span>Mode:</span>
            <div className="flex items-center gap-1 bg-[#FAF9F5] p-0.5 rounded-sm border border-[#D5D1C7]">
              <button
                type="button"
                onClick={() => {
                  if (onApplyFilters) setDraftInstitutionMode('affiliation');
                  else if (onChangeInstitutionMode) onChangeInstitutionMode('affiliation');
                }}
                className={`px-1.5 py-0.5 rounded-2xs text-[10px] cursor-pointer transition ${
                  effectiveInstitutionMode === 'affiliation'
                    ? 'bg-[#1C1B18] text-white font-bold'
                    : 'text-[#605D55] hover:text-[#1C1B18]'
                }`}
                title="Search publications where author was affiliated with this institution"
              >
                Affiliation
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onApplyFilters) setDraftInstitutionMode('awarding');
                  else if (onChangeInstitutionMode) onChangeInstitutionMode('awarding');
                }}
                className={`px-1.5 py-0.5 rounded-2xs text-[10px] cursor-pointer transition ${
                  effectiveInstitutionMode === 'awarding'
                    ? 'bg-[#1C1B18] text-white font-bold'
                    : 'text-[#605D55] hover:text-[#1C1B18]'
                }`}
                title="Search theses where degree was awarded by this institution"
              >
                Awarding (Theses)
              </button>
            </div>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={effectiveAcademicOnly}
              onChange={(e) => {
                if (onApplyFilters) setDraftAcademicOnly(e.target.checked);
                else if (onChangeAcademicOnly) onChangeAcademicOnly(e.target.checked);
              }}
              className="rounded-none border-[#D5D1C7] text-[#1C1B18] focus:ring-0 cursor-pointer"
            />
            <span>Academic institutions only</span>
          </label>
        </div>
      </div>

      {/* Country Multi-Select Filter */}
      <div className="space-y-2 pt-2 border-t border-[#E2DFD8]">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E2DFD8]">
          <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#605D55] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            <span>Country Discovery</span>
          </span>
          {effectiveCountries.length > 0 && (
            <button
              type="button"
              onClick={handleClearCountriesList}
              className="text-[10px] font-mono-meta text-amber-800 underline cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Selected Country Chips */}
        {effectiveCountries.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {effectiveCountries.map((code) => (
              <span
                key={code}
                className="bg-[#1C1B18] text-white px-2 py-0.5 rounded-xs text-[11px] font-mono-meta flex items-center gap-1 shadow-2xs"
              >
                <span>{code}</span>
                <button
                  type="button"
                  onClick={() => handleToggleCountryCode(code)}
                  className="hover:text-amber-300 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Common Country Quick-Picks */}
        <div className="flex items-center gap-1 flex-wrap">
          {COMMON_COUNTRIES.map((c) => {
            const isSelected = effectiveCountries.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => handleToggleCountryCode(c.code)}
                className={`px-1.5 py-0.5 rounded-2xs text-[10px] font-mono-meta border transition cursor-pointer ${
                  isSelected
                    ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                    : 'bg-[#FAF9F5] border-[#D5D1C7] text-[#524F47] hover:border-[#1C1B18]'
                }`}
                title={`Filter by ${c.name} (${c.code})`}
              >
                {c.code}
              </button>
            );
          })}
        </div>

        {/* Custom ISO Code Input */}
        <form onSubmit={handleAddCustomCountry} className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            maxLength={2}
            value={customCountryInput}
            onChange={(e) => setCustomCountryInput(e.target.value.toUpperCase())}
            placeholder="ISO (e.g. FR)"
            className="w-20 bg-[#FAF9F5] border border-[#D5D1C7] px-2 py-1 text-xs rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono-meta uppercase"
          />
          <button
            type="submit"
            className="bg-white hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-2 py-1 rounded-sm text-[11px] font-mono-meta cursor-pointer"
          >
            + Add
          </button>
        </form>

        <p className="text-[10px] font-mono-meta text-[#8C887E] leading-tight">
          Restricts results so matched institutions reside in selected countries (coauthor isolation enforced).
        </p>
      </div>

      {/* Citation Metrics & Sorting */}
      <div className="space-y-2 pt-2 border-t border-[#E2DFD8]">
        <div className="flex items-center justify-between pb-1.5 border-b border-[#E2DFD8]">
          <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#605D55] flex items-center gap-1.5">
            <Quote className="w-3.5 h-3.5 text-[#2C6B3F]" />
            <span>Citation Impact</span>
          </span>
          {effectiveMinCitations && (
            <button
              type="button"
              onClick={() => handleMinCitationsChange('')}
              className="text-[10px] font-mono-meta text-amber-800 underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Minimum citations presets */}
        <div className="space-y-1">
          <span className="text-[10px] font-mono-meta text-[#737067] block">
            Minimum Citations (OpenAlex):
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {citationPresets.map((p) => {
              const active = effectiveMinCitations === p.value;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handleMinCitationsChange(p.value)}
                  className={`px-2 py-0.5 rounded-2xs text-[10px] font-mono-meta border transition cursor-pointer ${
                    active
                      ? 'bg-[#1C1B18] text-white border-[#1C1B18] font-bold'
                      : 'bg-[#FAF9F5] border-[#D5D1C7] text-[#524F47] hover:border-[#1C1B18]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sort Order Selector */}
        <div className="space-y-1 pt-1.5">
          <span className="text-[10px] font-mono-meta text-[#737067] block">
            Rank & Sort Order:
          </span>
          <select
            value={effectiveSortOrder}
            onChange={(e) => handleSortOrderChange(e.target.value)}
            className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-2.5 py-1.5 text-xs text-[#1C1B18] rounded-sm font-mono-meta focus:outline-none focus:border-[#1C1B18]"
          >
            <option value="relevance">Relevance Scoring</option>
            <option value="citations">Most Cited First (OpenAlex Impact)</option>
            <option value="newest">Newest First (Publication Year)</option>
          </select>
        </div>
      </div>

      {/* Action Footer: Apply & Reset */}
      <div className="pt-2 border-t border-[#E2DFD8] space-y-2">
        {onApplyFilters && (
          <button
            type="button"
            onClick={handleApply}
            disabled={!isDirty}
            className={`w-full py-2 rounded-sm text-xs font-mono-meta font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
              isDirty
                ? 'bg-[#1C1B18] hover:bg-[#2E2C28] text-white animate-pulse'
                : 'bg-[#FAF9F5] border border-[#D5D1C7] text-[#737067] cursor-not-allowed opacity-80'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isDirty ? 'Apply Discovery Filters' : 'Filters Up to Date'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleReset}
          className="w-full bg-white hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#524F47] hover:text-[#1C1B18] py-1.5 rounded-sm text-xs font-mono-meta transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset All Discovery Filters</span>
        </button>
      </div>
    </div>
  );
}
