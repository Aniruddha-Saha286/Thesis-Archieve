import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import FilterSection from './FilterSection';
import {
  Building2,
  Globe,
  Search,
  Quote,
  Loader2,
  PieChart,
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
  subjects = [],
  selectedSubjectId = '',
  onSelectSubject,
  selectedInstitution = null,
  onSelectInstitution,
  onViewInstitutionLandscape,
  institutionMode = 'affiliation',
  onChangeInstitutionMode,
  academicOnly = true,
  onChangeAcademicOnly,
  selectedCountries = [],
  onToggleCountry,
  onClearCountries,
  minCitations = '',
  onChangeMinCitations,
  selectedAuthor = null,
  onClearAuthor,
  className = '',
}) {
  const [localMinCitations, setLocalMinCitations] = useState(minCitations || '');
  const citationsTimerRef = useRef(null);

  useEffect(() => {
    setLocalMinCitations(minCitations || '');
  }, [minCitations]);

  const effectiveInstitution = selectedInstitution;
  const effectiveInstitutionMode = institutionMode;
  const effectiveAcademicOnly = academicOnly;
  const effectiveCountries = selectedCountries || [];
  const effectiveMinCitations = localMinCitations;

  const [instInput, setInstInput] = useState('');
  const [instSuggestions, setInstSuggestions] = useState([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [showInstDropdown, setShowInstDropdown] = useState(false);
  const instDropdownRef = useRef(null);
  const instTimerRef = useRef(null);

  const [customCountryInput, setCustomCountryInput] = useState('');

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
    if (onSelectInstitution) {
      onSelectInstitution(inst);
    }
    setInstInput('');
    setInstSuggestions([]);
    setShowInstDropdown(false);
  };

  const handleClearInstitution = () => {
    if (onSelectInstitution) {
      onSelectInstitution(null);
    }
  };

  const handleAddCustomCountry = (e) => {
    e.preventDefault();
    const code = customCountryInput.trim().toUpperCase();
    if (code && /^[A-Z]{2}$/.test(code)) {
      if (onToggleCountry) {
        onToggleCountry(code);
      }
      setCustomCountryInput('');
    }
  };

  const handleToggleCountryCode = (code) => {
    if (onToggleCountry) {
      onToggleCountry(code);
    }
  };

  const handleClearCountriesList = () => {
    if (onClearCountries) {
      onClearCountries();
    }
  };

  const handleMinCitationsChange = (val) => {
    setLocalMinCitations(val);
    if (citationsTimerRef.current) clearTimeout(citationsTimerRef.current);
    citationsTimerRef.current = setTimeout(() => {
      if (onChangeMinCitations) {
        onChangeMinCitations(val);
      }
    }, 400);
  };

  const handlePresetCitations = (val) => {
    setLocalMinCitations(val);
    if (citationsTimerRef.current) clearTimeout(citationsTimerRef.current);
    if (onChangeMinCitations) {
      onChangeMinCitations(val);
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
      {selectedAuthor && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 p-2.5 rounded-sm flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-[11px] font-mono-meta uppercase tracking-wider text-amber-900 dark:text-amber-300 block font-bold">
              Active Author Filter
            </span>
            <span className="font-serif-title text-sm font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">
              {selectedAuthor.name}
            </span>
            {selectedAuthor.lastKnownInstitution && (
              <span className="text-[11px] text-[#524F47] dark:text-[#A8A49C] block">
                {selectedAuthor.lastKnownInstitution.name}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClearAuthor}
            className="text-amber-900 dark:text-amber-300 hover:text-black dark:hover:text-white font-mono-meta text-xs p-1 cursor-pointer"
            title="Remove author filter"
          >
            ✕
          </button>
        </div>
      )}

      <FilterSection
        title="University"
        icon={Building2}
        activeCount={effectiveInstitution ? 1 : 0}
        onClear={handleClearInstitution}
      >
        {effectiveInstitution ? (
          <div className="space-y-2">
            <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#1C1B18] dark:border-amber-400 p-2.5 rounded-sm flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-[#1C1B18] dark:text-[#F0EDE6] text-xs">
                  {effectiveInstitution.name}
                </div>
                <div className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9A968D] flex items-center gap-1.5 mt-0.5">
                  {effectiveInstitution.countryCode && (
                    <span className="bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-1 rounded-2xs font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
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
                className="text-[#737067] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] text-xs cursor-pointer p-1"
                title="Remove institution"
                aria-label="Remove institution filter"
              >
                ✕
              </button>
            </div>

            {onViewInstitutionLandscape && (
              <button
                type="button"
                onClick={() => onViewInstitutionLandscape(effectiveInstitution)}
                className="w-full min-h-[44px] py-2 px-3 bg-white dark:bg-[#1E1D1A] hover:bg-[#FAF9F5] dark:hover:bg-[#282622] border border-[#1C1B18] dark:border-amber-400 text-[#1C1B18] dark:text-[#F0EDE6] text-xs font-mono-meta font-bold rounded-sm transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                title="View OpenAlex Research Landscape for this institution"
              >
                <PieChart className="w-3.5 h-3.5 text-[#1C1B18] dark:text-amber-400" />
                <span>Research Landscape</span>
              </button>
            )}
          </div>
        ) : (
          <div className="relative" ref={instDropdownRef}>
            <div className="relative">
              <input
                type="text"
                value={instInput}
                onChange={(e) => handleInstInputChange(e.target.value)}
                placeholder="Search university: e.g. Harvard, BUET, MIT..."
                className="w-full bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2.5 py-1.5 pr-7 text-xs rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 font-sans text-[#1C1B18] dark:text-[#F0EDE6]"
              />
              <div className="absolute right-2 top-2 pointer-events-none text-[#737067] dark:text-[#9A968D]">
                {loadingInst ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
              </div>
            </div>

            {showInstDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] rounded-sm shadow-lg z-40 max-h-56 overflow-y-auto divide-y divide-[#F2EFE8] dark:divide-[#2C2A26]">
                {instSuggestions.length === 0 ? (
                  <div className="p-3 text-center text-[11px] font-mono-meta text-[#737067] dark:text-[#9A968D]">
                    {loadingInst ? 'Searching global institutions...' : 'No institution found.'}
                  </div>
                ) : (
                  instSuggestions.map((inst) => (
                    <div
                      key={inst.id}
                      onClick={() => handleSelectInstItem(inst)}
                      className="p-2 hover:bg-[#FAF9F5] dark:hover:bg-[#282622] cursor-pointer transition text-left"
                    >
                      <div className="font-medium text-[#1C1B18] dark:text-[#F0EDE6] text-xs leading-snug">
                        {inst.name}
                      </div>
                      <div className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9A968D] flex items-center gap-1.5 mt-0.5">
                        {inst.countryCode && (
                          <span className="bg-[#FAF9F5] dark:bg-[#24221E] border border-[#D5D1C7] dark:border-[#38352F] px-1 rounded-2xs font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
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
        <div className="space-y-1.5 pt-1 text-[11px] font-mono-meta text-[#605D55] dark:text-[#9A968D]">
          <div className="flex items-center justify-between">
            <span>Mode:</span>
            <div className="flex items-center gap-1 bg-[#FAF9F5] dark:bg-[#1E1D1A] p-0.5 rounded-sm border border-[#D5D1C7] dark:border-[#38352F]">
              <button
                type="button"
                onClick={() => {
                  if (onChangeInstitutionMode) onChangeInstitutionMode('affiliation');
                }}
                className={`px-1.5 py-0.5 rounded-2xs text-[11px] cursor-pointer transition ${
                  effectiveInstitutionMode === 'affiliation'
                    ? 'bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 font-bold'
                    : 'text-[#605D55] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
                }`}
                title="Search publications where author was affiliated with this institution"
              >
                Affiliation
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onChangeInstitutionMode) onChangeInstitutionMode('awarding');
                }}
                className={`px-1.5 py-0.5 rounded-2xs text-[11px] cursor-pointer transition ${
                  effectiveInstitutionMode === 'awarding'
                    ? 'bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 font-bold'
                    : 'text-[#605D55] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
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
                if (onChangeAcademicOnly) onChangeAcademicOnly(e.target.checked);
              }}
              className="rounded-none border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] focus:ring-0 cursor-pointer accent-amber-500"
            />
            <span>Academic institutions only</span>
          </label>
        </div>
      </FilterSection>

      <FilterSection
        title="Country"
        icon={Globe}
        activeCount={effectiveCountries.length}
        onClear={handleClearCountriesList}
        defaultOpen={false}
      >

        {effectiveCountries.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {effectiveCountries.map((code) => (
              <span
                key={code}
                className="bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 px-2 py-0.5 rounded-xs text-[11px] font-mono-meta flex items-center gap-1 shadow-2xs font-bold"
              >
                <span>{code}</span>
                <button
                  type="button"
                  onClick={() => handleToggleCountryCode(code)}
                  className="hover:text-amber-300 dark:hover:text-red-900 cursor-pointer"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 flex-wrap">
          {COMMON_COUNTRIES.map((c) => {
            const isSelected = effectiveCountries.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => handleToggleCountryCode(c.code)}
                className={`px-1.5 py-0.5 rounded-2xs text-[11px] font-mono-meta border transition cursor-pointer ${
                  isSelected
                    ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 dark:border-amber-700 text-amber-950 dark:text-amber-300 font-bold'
                    : 'bg-[#FAF9F5] dark:bg-[#201F1C] border-[#D5D1C7] dark:border-[#38352F] text-[#524F47] dark:text-[#A8A49C] hover:border-[#1C1B18] dark:hover:border-amber-400'
                }`}
                title={`Filter by ${c.name} (${c.code})`}
              >
                {c.code}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleAddCustomCountry} className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            maxLength={2}
            value={customCountryInput}
            onChange={(e) => setCustomCountryInput(e.target.value.toUpperCase())}
            placeholder="ISO (e.g. FR)"
            className="w-20 bg-[#FAF9F5] dark:bg-[#1E1D1A] border border-[#D5D1C7] dark:border-[#38352F] px-2 py-1 text-xs rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 font-mono-meta uppercase text-[#1C1B18] dark:text-[#F0EDE6]"
          />
          <button
            type="submit"
            className="bg-white dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#282622] border border-[#D5D1C7] dark:border-[#38352F] text-[#1C1B18] dark:text-[#F0EDE6] px-2 py-1 rounded-sm text-[11px] font-mono-meta cursor-pointer"
          >
            + Add
          </button>
        </form>

        <p className="text-[11px] font-mono-meta text-[#8C887E] dark:text-[#5C5950] leading-tight">
          Shows results from institutions located in the selected countries.
        </p>
      </FilterSection>

      <FilterSection
        title="Citation Impact"
        icon={Quote}
        activeCount={effectiveMinCitations ? 1 : 0}
        onClear={() => handlePresetCitations('')}
        defaultOpen={false}
      >

        <div className="space-y-1">
          <span className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9A968D] block">
            Minimum Citations (OpenAlex):
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {citationPresets.map((p) => {
              const active = effectiveMinCitations === p.value;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePresetCitations(p.value)}
                  className={`px-2 py-0.5 rounded-2xs text-[11px] font-mono-meta border transition cursor-pointer ${
                    active
                      ? 'bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 border-[#1C1B18] dark:border-amber-400 font-bold'
                      : 'bg-[#FAF9F5] dark:bg-[#201F1C] border-[#D5D1C7] dark:border-[#38352F] text-[#524F47] dark:text-[#A8A49C] hover:border-[#1C1B18] dark:hover:border-amber-400'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

      </FilterSection>
    </div>
  );
}
