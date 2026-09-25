import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  X,
  PieChart as PieChartIcon,
  TrendingUp,
  ExternalLink,
  Info,
  Calendar,
  RefreshCw,
  Filter,
  CheckCircle2,
  Table as TableIcon,
  BarChart2,
  AlertCircle,
  Building2,
} from 'lucide-react';

/**
 * Color-blind safe palette matching backend implementation.
 */
const COLOR_BLIND_PALETTE = [
  '#1E3A8A', // Deep Blue
  '#0D9488', // Teal
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#E11D48', // Rose
  '#059669', // Emerald
  '#78716C', // Stone/Gray (Other Disciplines)
];

export default function InstitutionLandscapeModal({
  institution,
  isOpen,
  onClose,
  onFilterByField,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [disabledNotice, setDisabledNotice] = useState(null);

  // Year range filters
  const currentYear = new Date().getFullYear();
  const [fromYearInput, setFromYearInput] = useState(String(currentYear - 5));
  const [toYearInput, setToYearInput] = useState(String(currentYear));
  const [appliedRange, setAppliedRange] = useState({
    from: currentYear - 5,
    to: currentYear,
  });

  // Active view tab: 'chart' | 'table'
  const [distributionView, setDistributionView] = useState('chart');
  const [activeHoveredSlice, setActiveHoveredSlice] = useState(null);

  // Normalize institution ID (OpenAlex canonical format 'I...')
  const explicitCanonicalId = useMemo(() => {
    if (!institution) return null;
    const rawId = institution.id || institution.openAlexId || institution._id || '';
    const match = String(rawId).match(/I\d+$/i);
    return match ? match[0].toUpperCase() : null;
  }, [institution]);

  const [resolvedId, setResolvedId] = useState(null);

  useEffect(() => {
    setResolvedId(null);
  }, [institution]);

  const canonicalId = explicitCanonicalId || resolvedId;

  // Auto-resolve OpenAlex institution ID from name if not provided
  useEffect(() => {
    if (!isOpen || explicitCanonicalId || !institution?.name) return;
    let isSubscribed = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await axios.get('/api/institutions/suggest', {
          params: { q: institution.name, limit: 1 },
          timeout: 10000,
        });
        if (!isSubscribed) return;
        const first = Array.isArray(res.data) ? res.data[0] : null;
        if (first && first.id) {
          const match = String(first.id).match(/I\d+$/i);
          if (match) {
            setResolvedId(match[0].toUpperCase());
            return;
          }
        }
        setError(`Could not resolve OpenAlex identifier for "${institution.name}".`);
        setLoading(false);
      } catch (err) {
        if (!isSubscribed) return;
        setError(`Failed to resolve institution "${institution.name}".`);
        setLoading(false);
      }
    })();
    return () => {
      isSubscribed = false;
    };
  }, [isOpen, explicitCanonicalId, institution?.name]);

  // Fetch landscape data
  const fetchLandscape = useCallback(
    async (force = false) => {
      if (!canonicalId) {
        if (!institution?.name) {
          setError('Valid OpenAlex Institution ID is required to generate a research landscape.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      setDisabledNotice(null);

      try {
        const params = {
          fromYear: appliedRange.from,
          toYear: appliedRange.to,
        };
        if (force) params.forceRefresh = 'true';

        const res = await axios.get(`/api/institutions/${canonicalId}/analytics`, {
          params,
          timeout: 25000,
        });

        if (res.data.enabled === false) {
          setDisabledNotice(
            res.data.message ||
              'Institution research landscape analytics is currently disabled by administrator configuration.'
          );
          setData(null);
        } else if (res.data.error) {
          setError(res.data.message || 'Failed to retrieve institution research landscape.');
          setData(null);
        } else {
          setData(res.data);
        }
      } catch (err) {
        console.error('Failed to load institution analytics:', err);
        const serverMsg = err.response?.data?.message;
        if (err.response?.status === 404) {
          setError('Institution records were not found in the OpenAlex knowledge graph.');
        } else if (err.response?.status === 503) {
          setError('The authoritative analytics service is temporarily unavailable. Please retry in a few moments.');
        } else {
          setError(serverMsg || 'An unexpected error occurred while loading institution analytics.');
        }
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [canonicalId, appliedRange, institution?.name]
  );

  useEffect(() => {
    if (isOpen && canonicalId) {
      fetchLandscape();
    }
  }, [isOpen, canonicalId, fetchLandscape]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Apply Year Filter Handler
  const handleApplyYearFilter = (e) => {
    e.preventDefault();
    const from = parseInt(fromYearInput, 10);
    const to = parseInt(toYearInput, 10);

    if (isNaN(from) || isNaN(to)) {
      setError('Please provide valid 4-digit years for the date range filter.');
      return;
    }
    if (from > to) {
      setError('Start year cannot be greater than end year.');
      return;
    }
    if (from < 1950 || to > currentYear + 1) {
      setError(`Year range must be between 1950 and ${currentYear + 1}.`);
      return;
    }

    setError(null);
    setAppliedRange({ from, to });
  };

  const handleResetYearFilter = () => {
    const defaultFrom = currentYear - 5;
    const defaultTo = currentYear;
    setFromYearInput(String(defaultFrom));
    setToYearInput(String(defaultTo));
    setAppliedRange({ from: defaultFrom, to: defaultTo });
  };

  if (!isOpen) return null;

  // Donut chart math
  const slices = data?.fieldDistribution?.slices || [];
  const totalClassifiedWorks = data?.fieldDistribution?.totalClassifiedWorks || 0;

  // SVG parameters
  const chartSize = 220;
  const strokeWidth = 32;
  const radius = (chartSize - strokeWidth) / 2; // 94
  const circumference = 2 * Math.PI * radius; // ~590.6

  let cumulativeAngle = 0;
  const donutSlices = slices.map((slice, index) => {
    const strokeDasharray = `${(slice.percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((cumulativeAngle / 100) * circumference);
    cumulativeAngle += slice.percentage;

    return {
      ...slice,
      color: slice.color || COLOR_BLIND_PALETTE[index % COLOR_BLIND_PALETTE.length],
      strokeDasharray,
      strokeDashoffset,
    };
  });

  // Trends max calculation for bar normalization
  const publicationTrends = data?.publicationTrends || [];
  const maxYearWorks = publicationTrends.reduce((max, t) => Math.max(max, t.count), 0) || 1;

  const activeSliceInfo = activeHoveredSlice || slices[0] || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="landscape-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        className="bg-[#FAF9F5] border border-[#1C1B18] w-full max-w-4xl max-h-[92vh] flex flex-col rounded-sm shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* MODAL HEADER                                                              */}
        {/* ========================================================================= */}
        <div className="bg-white border-b border-[#E2DFD8] p-4 sm:p-5 shrink-0 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-[#1C1B18] text-white text-[11px] font-mono-meta font-bold px-2 py-0.5 rounded-2xs uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Institution Landscape
              </span>
              {data?.institution?.countryCode && (
                <span className="bg-[#FAF9F5] border border-[#D5D1C7] text-[#1C1B18] text-[11px] font-mono-meta font-bold px-1.5 py-0.5 rounded-2xs">
                  {data.institution.countryCode} {data.institution.countryName ? `· ${data.institution.countryName}` : ''}
                </span>
              )}
              {data?.cached && (
                <span className="text-[11px] font-mono-meta text-[#737067] bg-[#F2EFE8] px-2 py-0.5 rounded-2xs">
                  Cached ({Math.floor((data.cacheAgeSeconds || 0) / 60)}m ago)
                </span>
              )}
            </div>

            <h2
              id="landscape-modal-title"
              className="text-xl sm:text-2xl font-serif-title font-normal text-[#1C1B18] leading-tight"
            >
              {data?.institution?.name || institution?.name || 'Institution Research Landscape'}
            </h2>

            {/* Registry links */}
            <div className="flex items-center gap-3 text-xs font-mono-meta text-[#737067] pt-0.5 flex-wrap">
              {canonicalId && (
                <a
                  href={`https://openalex.org/${canonicalId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#1C1B18] underline inline-flex items-center gap-1"
                >
                  <span>OpenAlex: {canonicalId}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {data?.institution?.ror && (
                <a
                  href={data.institution.ror}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#1C1B18] underline inline-flex items-center gap-1"
                >
                  <span>ROR Registry</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {data?.institution?.homepageUrl && (
                <a
                  href={data.institution.homepageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#1C1B18] underline inline-flex items-center gap-1"
                >
                  <span>Official Website</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchLandscape(true)}
              disabled={loading}
              title="Force refresh authoritative analytics"
              aria-label="Force refresh analytics"
              className="min-h-[44px] min-w-[44px] p-2 text-[#737067] hover:text-[#1C1B18] hover:bg-[#FAF9F5] border border-transparent hover:border-[#D5D1C7] rounded-sm transition flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close institution landscape modal"
              className="min-h-[44px] min-w-[44px] p-2 text-[#737067] hover:text-[#1C1B18] hover:bg-[#FAF9F5] border border-transparent hover:border-[#D5D1C7] rounded-sm transition flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STRICT AFFILIATION SCOPE BANNER                                           */}
        {/* ========================================================================= */}
        <div className="bg-[#FAF9F5] border-b border-[#E2DFD8] px-4 py-2.5 sm:px-5 flex items-start gap-2.5 text-xs text-[#524F47]">
          <Info className="w-4 h-4 text-[#8C887E] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-[#1C1B18] font-semibold">Affiliation Scope: </strong>
            {data?.scopeNote ||
              'OpenAlex-indexed works with at least one author affiliated with this institution.'}{' '}
            <span className="text-[#737067]">
              This represents collaborative research footprint, not works publisher-owned or exclusively produced by this university.
            </span>
          </p>
        </div>

        {/* ========================================================================= */}
        {/* MODAL BODY (SCROLLABLE)                                                   */}
        {/* ========================================================================= */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 grow">
          {/* Feature disabled notice */}
          {disabledNotice && (
            <div className="bg-amber-50 border border-amber-200 p-5 rounded-sm text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
              <h3 className="font-serif-title text-base font-bold text-amber-950">
                Analytics Feature Disabled
              </h3>
              <p className="text-xs text-amber-900 max-w-md mx-auto leading-relaxed">
                {disabledNotice}
              </p>
              <p className="text-xs text-amber-800/80 pt-2 font-mono-meta">
                Standard institution filtering and paper search remain fully available.
              </p>
            </div>
          )}

          {/* Error notice */}
          {error && !disabledNotice && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-sm flex items-start justify-between gap-3 text-xs text-rose-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchLandscape(true)}
                className="min-h-[44px] px-3 font-mono-meta font-bold underline hover:text-rose-950 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Skeleton loading state */}
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="h-20 bg-[#EFECE6] rounded-sm" />
                <div className="h-20 bg-[#EFECE6] rounded-sm" />
                <div className="h-20 bg-[#EFECE6] rounded-sm" />
              </div>
              <div className="h-64 bg-[#EFECE6] rounded-sm" />
              <div className="h-44 bg-[#EFECE6] rounded-sm" />
            </div>
          )}

          {/* Analytics content */}
          {!loading && data && (
            <>
              {/* 1. Summary KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white border border-[#D5D1C7] p-3.5 rounded-sm">
                  <div className="text-[11px] font-mono-meta uppercase tracking-wider text-[#737067]">
                    Total Indexed Works
                  </div>
                  <div className="text-2xl font-serif-title font-bold text-[#1C1B18] mt-1">
                    {(data.summaryMetrics?.totalWorksIndexed || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#8C887E] mt-0.5">
                    Affiliated author works
                  </div>
                </div>

                <div className="bg-white border border-[#D5D1C7] p-3.5 rounded-sm">
                  <div className="text-[11px] font-mono-meta uppercase tracking-wider text-[#737067]">
                    Total Indexed Citations
                  </div>
                  <div className="text-2xl font-serif-title font-bold text-[#2C6B3F] mt-1">
                    {(data.summaryMetrics?.totalCitationsIndexed || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#8C887E] mt-0.5">
                    Global scholarly citations
                  </div>
                </div>

                <div className="bg-white border border-[#D5D1C7] p-3.5 rounded-sm">
                  <div className="text-[11px] font-mono-meta uppercase tracking-wider text-[#737067]">
                    Classified Disciplines
                  </div>
                  <div className="text-2xl font-serif-title font-bold text-[#1C1B18] mt-1">
                    {data.summaryMetrics?.classifiedDisciplinesCount || 0}
                  </div>
                  <div className="text-[11px] text-[#8C887E] mt-0.5">
                    Primary research fields
                  </div>
                </div>
              </div>

              {/* 2. Date Range Filter Toolbar */}
              <div className="bg-white border border-[#D5D1C7] p-3 rounded-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <form
                  onSubmit={handleApplyYearFilter}
                  className="flex items-center gap-2 flex-wrap"
                >
                  <span className="text-xs font-mono-meta text-[#737067] flex items-center gap-1 font-bold">
                    <Calendar className="w-3.5 h-3.5 text-[#1C1B18]" />
                    Filter Years:
                  </span>
                  <input
                    type="number"
                    min="1950"
                    max={currentYear + 1}
                    value={fromYearInput}
                    onChange={(e) => setFromYearInput(e.target.value)}
                    placeholder="From"
                    className="w-20 bg-[#FAF9F5] border border-[#D5D1C7] px-2 py-1 text-xs rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono"
                    aria-label="Filter from year"
                  />
                  <span className="text-xs text-[#737067]">to</span>
                  <input
                    type="number"
                    min="1950"
                    max={currentYear + 1}
                    value={toYearInput}
                    onChange={(e) => setToYearInput(e.target.value)}
                    placeholder="To"
                    className="w-20 bg-[#FAF9F5] border border-[#D5D1C7] px-2 py-1 text-xs rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono"
                    aria-label="Filter to year"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-3.5 py-1.5 bg-[#1C1B18] hover:bg-[#2E2C28] text-white rounded-sm text-xs font-mono-meta font-bold cursor-pointer transition"
                  >
                    Apply Range
                  </button>
                  <button
                    type="button"
                    onClick={handleResetYearFilter}
                    className="min-h-[44px] px-2.5 py-1.5 text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] cursor-pointer"
                  >
                    Reset (5y)
                  </button>
                </form>

                <div className="flex items-center gap-1 self-end sm:self-auto font-mono-meta text-xs">
                  <span className="text-[#8C887E] mr-1 text-[11px]">View:</span>
                  <button
                    type="button"
                    onClick={() => setDistributionView('chart')}
                    className={`min-h-[44px] px-3 py-1 rounded-sm border flex items-center gap-1.5 cursor-pointer transition ${
                      distributionView === 'chart'
                        ? 'bg-[#1C1B18] text-white border-[#1C1B18] font-bold'
                        : 'bg-[#FAF9F5] text-[#737067] border-[#D5D1C7] hover:text-[#1C1B18]'
                    }`}
                    aria-label="Switch to donut chart view"
                  >
                    <PieChartIcon className="w-3.5 h-3.5" />
                    <span>Donut</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionView('table')}
                    className={`min-h-[44px] px-3 py-1 rounded-sm border flex items-center gap-1.5 cursor-pointer transition ${
                      distributionView === 'table'
                        ? 'bg-[#1C1B18] text-white border-[#1C1B18] font-bold'
                        : 'bg-[#FAF9F5] text-[#737067] border-[#D5D1C7] hover:text-[#1C1B18]'
                    }`}
                    aria-label="Switch to accessible table view"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                </div>
              </div>

              {/* 3. Research Landscape: Donut Chart / Table View */}
              <div className="bg-white border border-[#D5D1C7] p-4 sm:p-5 rounded-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE1]">
                  <div>
                    <h3 className="font-serif-title text-base sm:text-lg font-bold text-[#1C1B18] flex items-center gap-2">
                      <PieChartIcon className="w-4 h-4 text-[#1C1B18]" />
                      Primary Research Fields Distribution
                    </h3>
                    <p className="text-xs text-[#737067] mt-0.5">
                      Top 6 disciplines + combined Other Disciplines (Max 7 slices, exact arithmetic sum).
                    </p>
                  </div>
                  <span className="text-xs font-mono-meta text-[#737067] hidden sm:inline-block">
                    {totalClassifiedWorks.toLocaleString()} Classified Works
                  </span>
                </div>

                {distributionView === 'chart' ? (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {/* SVG Donut Chart */}
                    <div className="md:col-span-5 flex flex-col items-center justify-center relative">
                      <div className="relative w-[220px] h-[220px]">
                        <svg
                          width={chartSize}
                          height={chartSize}
                          viewBox={`0 0 ${chartSize} ${chartSize}`}
                          className="transform -rotate-90"
                          role="img"
                          aria-label="Donut chart showing field distribution"
                        >
                          {/* Background track circle */}
                          <circle
                            cx={chartSize / 2}
                            cy={chartSize / 2}
                            r={radius}
                            fill="transparent"
                            stroke="#EFECE6"
                            strokeWidth={strokeWidth}
                          />

                          {/* Slices */}
                          {donutSlices.map((slice, idx) => (
                            <circle
                              key={idx}
                              cx={chartSize / 2}
                              cy={chartSize / 2}
                              r={radius}
                              fill="transparent"
                              stroke={slice.color}
                              strokeWidth={strokeWidth}
                              strokeDasharray={slice.strokeDasharray}
                              strokeDashoffset={slice.strokeDashoffset}
                              role="graphics-symbol"
                              aria-label={`${slice.name || slice.fieldName}: ${slice.count.toLocaleString()} works (${slice.percentage}%)`}
                              className="transition-all duration-200 cursor-pointer hover:opacity-90"
                              onMouseEnter={() => setActiveHoveredSlice(slice)}
                              onFocus={() => setActiveHoveredSlice(slice)}
                              onClick={() => {
                                if (onFilterByField && !slice.isOther) {
                                  onFilterByField(slice.name || slice.fieldName);
                                  onClose();
                                }
                              }}
                            />
                          ))}
                        </svg>

                        {/* Donut Center Display */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                          <span className="text-[10px] font-mono-meta uppercase tracking-wider text-[#737067] truncate max-w-[120px]">
                            {activeSliceInfo?.name || activeSliceInfo?.fieldName || 'Classified'}
                          </span>
                          <span className="text-xl font-bold font-serif-title text-[#1C1B18] mt-0.5">
                            {activeSliceInfo ? `${activeSliceInfo.percentage}%` : '100%'}
                          </span>
                          <span className="text-[11px] font-mono-meta text-[#8C887E]">
                            {activeSliceInfo
                              ? `${activeSliceInfo.count.toLocaleString()} works`
                              : `${totalClassifiedWorks.toLocaleString()} works`}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-[#737067] text-center mt-3 font-mono-meta">
                        Colorblind-safe categorical palette
                      </div>
                    </div>

                    {/* Interactive Legend List */}
                    <div className="md:col-span-7 space-y-2 divide-y divide-[#F2EFE8]">
                      {slices.map((slice, idx) => {
                        const sliceDisplayName = slice.name || slice.fieldName || 'Discipline';
                        const isSliceActive = (activeSliceInfo?.name || activeSliceInfo?.fieldName) === sliceDisplayName;
                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setActiveHoveredSlice(slice)}
                            className={`pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs transition p-1.5 rounded-xs ${
                              isSliceActive ? 'bg-[#FAF9F5]' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-3.5 h-3.5 rounded-2xs shrink-0 shadow-2xs"
                                style={{ backgroundColor: slice.color }}
                                aria-hidden="true"
                              />
                              <div className="truncate">
                                <span className="font-semibold text-[#1C1B18] block truncate">
                                  {sliceDisplayName}
                                </span>
                                <span className="text-[11px] text-[#737067] font-mono-meta">
                                  {slice.count.toLocaleString()} works
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono-meta font-bold text-[#1C1B18] text-xs">
                                {slice.percentage}%
                              </span>
                              {onFilterByField && !slice.isOther && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onFilterByField(sliceDisplayName);
                                    onClose();
                                  }}
                                  title={`Filter papers by ${sliceDisplayName}`}
                                  className="min-h-[44px] px-2 py-1 bg-white hover:bg-[#FAF9F5] border border-[#D5D1C7] hover:border-[#1C1B18] rounded-xs text-[11px] font-mono-meta text-[#1C1B18] transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Filter className="w-3 h-3" />
                                  <span>Filter</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Accessible Table Representation */
                  <div className="overflow-x-auto border border-[#E5E2DA] rounded-sm">
                    <table className="w-full text-left text-xs divide-y divide-[#E5E2DA]">
                      <thead className="bg-[#FAF9F5] font-mono-meta text-[11px] uppercase tracking-wider text-[#737067]">
                        <tr>
                          <th className="p-3">Discipline</th>
                          <th className="p-3 text-right">Works Count</th>
                          <th className="p-3 text-right">Share (%)</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2EFE8] bg-white">
                        {slices.map((slice, idx) => {
                          const sliceDisplayName = slice.name || slice.fieldName || 'Discipline';
                          return (
                            <tr key={idx} className="hover:bg-[#FAF9F5] transition">
                              <td className="p-3 flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-2xs shrink-0"
                                  style={{ backgroundColor: slice.color }}
                                />
                                <span className="font-medium text-[#1C1B18]">{sliceDisplayName}</span>
                              </td>
                              <td className="p-3 text-right font-mono-meta text-[#1C1B18]">
                                {slice.count.toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-mono-meta font-bold text-[#1C1B18]">
                                {slice.percentage}%
                              </td>
                              <td className="p-3 text-right">
                                {onFilterByField && !slice.isOther && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onFilterByField(sliceDisplayName);
                                      onClose();
                                    }}
                                    className="min-h-[44px] px-3 py-1 text-2xs font-mono-meta uppercase font-bold text-[#1C1B18] hover:bg-[#FAF9F5] border border-[#D5D1C7] rounded-xs transition inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Filter className="w-3 h-3" />
                                    <span>Filter</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 4. Publication Trends (Yearly Volume Bar Chart) */}
              <div className="bg-white border border-[#D5D1C7] p-4 sm:p-5 rounded-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE1]">
                  <div>
                    <h3 className="font-serif-title text-base sm:text-lg font-bold text-[#1C1B18] flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#1C1B18]" />
                      Annual Publication Output
                    </h3>
                    <p className="text-xs text-[#737067] mt-0.5">
                      Year-by-year indexed research volume across the selected date range.
                    </p>
                  </div>
                  <span className="text-xs font-mono-meta text-[#737067]">
                    {appliedRange.from} – {appliedRange.to}
                  </span>
                </div>

                {publicationTrends.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#737067] font-mono-meta">
                    No publication trend data available for this range.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div
                      className="h-40 flex items-end gap-2 pt-6 px-2 border-b border-[#D5D1C7]"
                      role="img"
                      aria-label="Annual publication trend bar chart"
                    >
                      {publicationTrends.map((pt, idx) => {
                        const heightPercent = Math.max(8, Math.round((pt.count / maxYearWorks) * 100));
                        return (
                          <div
                            key={idx}
                            className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end"
                          >
                            {/* Hover tooltip */}
                            <div className="opacity-0 group-hover:opacity-100 transition absolute -top-7 bg-[#1C1B18] text-white text-[10px] font-mono-meta px-1.5 py-0.5 rounded-2xs whitespace-nowrap pointer-events-none z-10">
                              {pt.year}: {pt.count.toLocaleString()} works
                            </div>

                            {/* Bar element */}
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className="w-full bg-[#1C1B18] group-hover:bg-amber-700 transition rounded-t-2xs"
                              role="graphics-symbol"
                              aria-label={`Year ${pt.year}: ${pt.count.toLocaleString()} works`}
                            />

                            {/* Year label */}
                            <span className="text-[11px] font-mono-meta text-[#737067] group-hover:text-[#1C1B18] group-hover:font-bold transition mt-1">
                              {pt.year}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono-meta text-[#8C887E] px-2">
                      <span>Baseline: 0 works</span>
                      <span>Peak Output: {maxYearWorks.toLocaleString()} works</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ========================================================================= */}
        {/* MODAL FOOTER                                                              */}
        {/* ========================================================================= */}
        <div className="bg-white border-t border-[#E2DFD8] p-3 sm:p-4 shrink-0 flex items-center justify-between gap-3 text-xs font-mono-meta text-[#737067]">
          <span>Source: OpenAlex Open Scholarly Knowledge Graph</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 bg-[#1C1B18] hover:bg-[#2E2C28] text-white rounded-sm font-bold uppercase tracking-wider cursor-pointer transition"
          >
            Close Landscape
          </button>
        </div>
      </div>
    </div>
  );
}
