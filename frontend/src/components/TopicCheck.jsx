import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Lightbulb,
  Search,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  Scale,
  Bell,
  Database,
  ExternalLink,
  GraduationCap,
  ArrowRight,
  Info,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  analyzeTopic,
  buildBriefText,
  extractKeywords,
  isThesisRecord,
  recordAuthor,
  recordUniversity,
  VERDICTS,
} from '../utils/topicAnalysis';

const reportCache = new Map();
let lastTopicKey = '';
const HISTORY_KEY = 'thesis_vault_topic_checks';
const EXAMPLES = [
  'Bangla sentiment analysis of e-commerce reviews using transformers',
  'Crop disease detection from leaf images with deep learning',
  'Federated learning for privacy in healthcare IoT',
];

const SCALE_STEPS = [
  'bg-indigo-100 dark:bg-indigo-950',
  'bg-indigo-200 dark:bg-indigo-900',
  'bg-indigo-300 dark:bg-indigo-700',
  'bg-indigo-500 dark:bg-indigo-500',
  'bg-indigo-700 dark:bg-indigo-300',
];

const topicKeyOf = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
const paperId = (r) => r?._id || r?.id || r?.paperId;

function readHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((h) => h && typeof h.topic === 'string').slice(0, 5) : [];
  } catch (e) {
    return [];
  }
}

function writeHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 5)));
  } catch (e) {
  }
}

function typeLabel(record) {
  if (isThesisRecord(record)) return record.degreeType || 'Thesis';
  const type = String(record.publicationType || '').toLowerCase();
  if (type === 'preprint') return 'Preprint';
  if (type === 'conference-paper') return 'Conference paper';
  if (type === 'book') return 'Book';
  if (type === 'journal-article') return 'Journal article';
  return 'Publication';
}

function StatTile({ value, label, hint }) {
  return (
    <div className="bg-white dark:bg-[#161513] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-md px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-[#1C1B18] dark:text-[#F0EDE6]">{value}</div>
      <div className="text-xs text-[#524F47] dark:text-[#B3AFA6] mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-[#8C887E] dark:text-[#736E66] mt-0.5">{hint}</div>}
    </div>
  );
}

function YearChart({ series, earlier }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const total = series.reduce((sum, s) => sum + s.count, 0);
  const peak = series.reduce((best, s) => (s.count > best.count ? s : best), series[0]);

  if (total === 0) {
    return (
      <p className="text-xs text-[#737067] dark:text-[#9A968D]">
        No related work from the last 10 years was found{earlier > 0 ? `, only ${earlier} older ${earlier === 1 ? 'item' : 'items'}` : ''}.
      </p>
    );
  }

  return (
    <div>
      <div
        role="img"
        aria-label={`Related works per year from ${series[0].year} to ${series[series.length - 1].year}. Highest: ${peak.count} in ${peak.year}.`}
        className="flex items-end gap-[2px] h-28 border-b border-[#D5D1C7] dark:border-[#38352F]"
      >
        {series.map((s) => (
          <div key={s.year} className="group relative flex-1 h-full flex items-end justify-center" tabIndex={0} title={`${s.year}: ${s.count}`}>
            <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-[#1C1B18] dark:bg-[#F0EDE6] px-1.5 py-0.5 text-[11px] text-white dark:text-[#1C1B18] opacity-0 group-hover:opacity-100 group-focus:opacity-100 z-10">
              {s.year}: {s.count}
            </span>
            {s.count > 0 && s.year === peak.year && (
              <span
                className="absolute left-1/2 -translate-x-1/2 text-[11px] tabular-nums text-[#524F47] dark:text-[#B3AFA6]"
                style={{ bottom: `calc(${(s.count / max) * 80}% + 2px)` }}
              >
                {s.count}
              </span>
            )}
            <div
              className="w-full max-w-[24px] rounded-t-[4px] bg-indigo-500 dark:bg-indigo-400 group-hover:bg-indigo-600 dark:group-hover:bg-indigo-300"
              style={{ height: s.count === 0 ? '0%' : `${Math.max(4, (s.count / max) * 80)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1" aria-hidden="true">
        {series.map((s, i) => (
          <div key={s.year} className="flex-1 text-center text-[11px] tabular-nums text-[#8C887E] dark:text-[#736E66]">
            {i === 0 || i === series.length - 1 || i % 3 === 0 ? `’${String(s.year).slice(2)}` : ''}
          </div>
        ))}
      </div>
      <ul className="sr-only">
        {series.map((s) => (
          <li key={s.year}>
            {s.year}: {s.count}
          </li>
        ))}
      </ul>
      {earlier > 0 && (
        <p className="text-[11px] text-[#8C887E] dark:text-[#736E66] mt-1.5">
          Plus {earlier} older than {series[0].year}.
        </p>
      )}
    </div>
  );
}

export default function TopicCheck({
  onViewDetail,
  onToggleCompare,
  comparisonIds = [],
  onOpenMembership,
  onSearchInDiscover,
  onOpenTopicAlerts,
  initialTopic = '',
}) {
  const { user } = useAuth();
  // A topic handed over from Discover is only pre-filled, never run automatically (a check costs a search)
  const seedKey = initialTopic ? topicKeyOf(initialTopic) : lastTopicKey;
  const [input, setInput] = useState(() => (initialTopic ? String(initialTopic).slice(0, 200) : reportCache.get(lastTopicKey)?.topic || ''));
  const [report, setReport] = useState(() => reportCache.get(seedKey) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { message, quota?: boolean }
  const [hint, setHint] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [history, setHistory] = useState(readHistory);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const copyTimerRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const remember = (rep) => {
    const key = topicKeyOf(rep.topic);
    reportCache.set(key, rep);
    lastTopicKey = key;
    if (reportCache.size > 12) reportCache.delete(reportCache.keys().next().value);
    const next = [
      { topic: rep.topic, verdict: rep.verdict.label, at: Date.now() },
      ...readHistory().filter((h) => topicKeyOf(h.topic) !== key),
    ].slice(0, 5);
    writeHistory(next);
    if (mountedRef.current) setHistory(next);
  };

  const runCheck = async (rawTopic) => {
    const topic = String(rawTopic || '').trim().slice(0, 200);
    const keywords = extractKeywords(topic);
    setError(null);
    setCopied(false);
    setShowAll(false);

    if (keywords.length < 2) {
      setHint('Describe the idea in a few words, for example the problem, the method and where you would apply it.');
      return;
    }
    setHint('');

    const key = topicKeyOf(topic);
    if (reportCache.has(key)) {
      lastTopicKey = key;
      setReport(reportCache.get(key));
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    // Search with the meaningful words only, in singular form ("transformers" -> "transformer"),
    // so filler words and plurals do not make keyword matching stricter for no benefit
    const search = keywords.map((k) => k.stem).join(' ');

    try {
      const first = await axios.get('/api/thesis', { params: { search, page: 1, limit: 50, sort: 'relevance' } });
      if (requestId !== requestIdRef.current) return;

      const data = first.data || {};
      const records = Array.isArray(data) ? data : data.records || [];
      if (!Array.isArray(data) && data.totalTechnicalFailure && records.length === 0) {
        if (mountedRef.current) setError({ message: 'The academic sources did not respond just now. Nothing was deducted from your daily searches. Please try again in a moment.' });
        return;
      }

      // Same search context => the server treats these as refinements, not new billed searches
      const [thesisRes, datasetRes] = await Promise.allSettled([
        axios.get('/api/thesis', {
          params: { search, publicationType: 'thesis', page: 1, limit: 50, sort: 'relevance', ...(data.searchContextId ? { searchContextId: data.searchContextId } : {}) },
        }),
        axios.get('/api/datasets', { params: { q: search, page: 1, limit: 6 } }),
      ]);
      if (requestId !== requestIdRef.current) return;

      const thesisData = thesisRes.status === 'fulfilled' ? thesisRes.value.data || {} : {};
      const thesisRecords = Array.isArray(thesisData) ? thesisData : thesisData.records || [];
      const datasets = datasetRes.status === 'fulfilled' ? datasetRes.value.data?.datasets || [] : [];

      const rep = analyzeTopic({ topic, records, thesisRecords, datasets, userUniversity: user?.university || '' });
      rep.thesisLookupFailed = thesisRes.status !== 'fulfilled';
      rep.datasetLookupFailed = datasetRes.status !== 'fulfilled';
      rep.partial = Boolean(data.partialResults);
      rep.searchContextId = (!Array.isArray(data) && data.searchContextId) || null;
      rep.searchQuery = search;
      // Saved even if the student has moved to another tab meanwhile: the search was already
      // spent, so the finished report must be waiting when they come back.
      remember(rep);
      if (mountedRef.current) setReport(rep);
    } catch (err) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      const code = err.response?.data?.code;
      if (code === 'SEARCH_QUOTA_EXCEEDED') {
        setError({ quota: true, message: `You have used all ${err.response.data.limit || ''} daily searches. Topic Check needs one search. It resets at midnight (Asia/Dhaka).` });
      } else if (err.response?.status === 503 || code === 'MAINTENANCE_MODE') {
        setError({ message: err.response?.data?.message || 'The archive is under maintenance. Please try again later.' });
      } else if (err.response?.status === 429) {
        setError({ message: 'Too many requests in a short time. Wait a few seconds and try again.' });
      } else {
        setError({ message: err.response?.data?.message || 'The check could not be completed. Check your connection and try again.' });
      }
    } finally {
      if (requestId === requestIdRef.current && mountedRef.current) setLoading(false);
    }
  };

  // Bring the result into view once it is ready (phones especially)
  useEffect(() => {
    if (report && resultRef.current && typeof resultRef.current.scrollIntoView === 'function' && window.innerWidth < 768) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [report]);

  const handleCopy = async () => {
    const text = buildBriefText(report);
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      // Older browsers / non-HTTPS pages
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand('copy');
        document.body.removeChild(area);
      } catch (e) {
        ok = false;
      }
    }
    setCopied(ok ? 'yes' : 'failed');
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
  };

  const inCompare = (record) => comparisonIds.includes(paperId(record));
  const strongest = report ? (report.related.length > 0 ? report.related : report.items.slice(0, 5)) : [];
  const visible = showAll ? strongest : strongest.slice(0, 6);
  const compareCandidates = report ? report.related.filter((i) => !inCompare(i.record)).slice(0, Math.max(0, 5 - comparisonIds.length)) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
      {/* Ask */}
      <section className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md overflow-hidden">
        <div className="h-1 bg-indigo-600 dark:bg-indigo-400" aria-hidden="true" />
        <div className="p-5 md:p-8 space-y-5">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Lightbulb className="w-4 h-4" />
              <span>Topic Check</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-serif-title tracking-tight text-[#1C1B18] dark:text-[#FAF9F5]">
              Has your thesis idea been done before?
            </h1>
            <p className="text-sm text-[#605D55] dark:text-[#9E9A90] leading-relaxed">
              Type your working title. You get the closest existing work, related theses and who supervised them,
              datasets you could use, and which part of your idea looks different. Take the brief to your supervisor.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!loading) runCheck(input);
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <label htmlFor="topic-check-input" className="sr-only">
              Your thesis idea or working title
            </label>
            <input
              id="topic-check-input"
              type="text"
              value={input}
              maxLength={200}
              onChange={(e) => {
                setInput(e.target.value);
                if (hint) setHint('');
              }}
              placeholder="e.g. Bangla sentiment analysis of e-commerce reviews using transformers"
              className="flex-1 min-w-0 bg-[#FAF9F5] dark:bg-[#1C1A18] border-2 border-[#D5D1C7] dark:border-[#383530] focus:border-indigo-600 dark:focus:border-indigo-400 px-4 py-3 text-sm md:text-base text-[#1C1B18] dark:text-[#FAF9F5] placeholder-[#8C887E] dark:placeholder-[#736E66] focus:outline-none rounded-md transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-400 dark:hover:bg-indigo-300 text-white dark:text-neutral-950 px-5 py-3 rounded-md text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>{loading ? 'Checking' : 'Check topic'}</span>
            </button>
          </form>

          {hint && (
            <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
              {hint}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[#737067] dark:text-[#9A968D]">
            <span>{history.length > 0 ? 'Recent:' : 'Try:'}</span>
            {(history.length > 0 ? history.map((h) => h.topic) : EXAMPLES).map((topic) => (
              <button
                key={topic}
                type="button"
                disabled={loading}
                onClick={() => {
                  setInput(topic);
                  runCheck(topic);
                }}
                className="max-w-full truncate px-2.5 py-1 rounded-full border border-[#D5D1C7] dark:border-[#383530] bg-[#FAF9F5] dark:bg-[#1C1A18] text-[#1C1B18] dark:text-[#F0EDE6] hover:border-indigo-500 dark:hover:border-indigo-400 cursor-pointer disabled:opacity-60 transition-colors"
                title={topic}
              >
                {topic}
              </button>
            ))}
            <span className="basis-full text-[11px] text-[#8C887E] dark:text-[#736E66]">
              A new check uses one of your daily searches. Re-opening a recent topic in this session is free.
            </span>
          </div>
        </div>
      </section>

      {/* Problems */}
      {error && (
        <div role="alert" className="bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-md p-4 flex flex-wrap items-start justify-between gap-3 text-sm text-rose-900 dark:text-rose-200">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error.message}</span>
          </div>
          {error.quota && onOpenMembership ? (
            <button type="button" onClick={onOpenMembership} className="px-3 py-1.5 rounded-md bg-rose-900 dark:bg-rose-200 text-white dark:text-rose-950 text-xs font-semibold cursor-pointer shrink-0">
              See plans
            </button>
          ) : (
            <button type="button" onClick={() => runCheck(input)} className="underline font-semibold text-xs cursor-pointer shrink-0">
              Try again
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="py-14 text-center text-sm text-[#737067] dark:text-[#9A968D] space-y-3" aria-live="polite">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600 dark:text-indigo-400" />
          <div>Searching papers, theses and datasets for your topic</div>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div ref={resultRef} className="space-y-6 scroll-mt-28">
          {/* Verdict */}
          <section aria-labelledby="topic-verdict" className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md p-5 md:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:items-center">
              <div className="lg:col-span-3 space-y-2">
                <p className="text-xs text-[#737067] dark:text-[#9A968D] truncate" title={report.topic}>
                  Result for “{report.topic}”
                </p>
                <h2 id="topic-verdict" className="text-xl md:text-2xl font-serif-title text-[#1C1B18] dark:text-[#FAF9F5]">
                  {report.verdict.headline}
                </h2>
                <p className="text-sm text-[#4A4740] dark:text-[#B3AFA6] leading-relaxed">{report.verdict.advice}</p>
              </div>

              <div className="lg:col-span-2">
                <div className="flex gap-[2px]" role="img" aria-label={`Position on a five step scale from little found to crowded: ${report.verdict.label}`}>
                  {VERDICTS.map((v, i) => (
                    <div key={v.key} className="flex-1 min-w-0">
                      <div className={`h-3 ${SCALE_STEPS[i]} ${i === 0 ? 'rounded-l-full' : ''} ${i === VERDICTS.length - 1 ? 'rounded-r-full' : ''}`} />
                      <div className="h-4 flex justify-center">
                        {i === report.verdictIndex && (
                          <span className="block w-0 h-0 mt-1 border-x-[6px] border-x-transparent border-b-[8px] border-b-[#1C1B18] dark:border-b-[#F0EDE6]" />
                        )}
                      </div>
                      <div
                        className={`text-center text-[11px] leading-tight ${
                          i === report.verdictIndex
                            ? 'font-semibold text-[#1C1B18] dark:text-[#F0EDE6]'
                            : 'text-[#8C887E] dark:text-[#736E66] hidden sm:block'
                        }`}
                      >
                        {v.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[#F2EFE8] dark:border-[#24221F] space-y-1.5 text-xs text-[#737067] dark:text-[#9A968D]">
              <p className="flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Based on the {report.checkedCount} top results the sources returned for your words. It shows what was found, not proof
                  that nothing else exists.
                  {report.partial && ' Some sources did not answer, so the picture may be incomplete.'}
                </span>
              </p>
              {report.tooBroad && (
                <p className="text-amber-800 dark:text-amber-300">
                  Your topic has very few specific words. Add the method, the domain or the dataset and check again for a sharper answer.
                </p>
              )}
            </div>
          </section>

          {/* Numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile value={report.close.length} label="Close matches" hint="Nearly the same idea" />
            <StatTile value={report.related.length} label="Related works" hint="Share most of your topic" />
            <StatTile value={report.recentCount} label="From the last 3 years" hint={`${report.currentYear - 2} to ${report.currentYear}`} />
            <StatTile
              value={report.theses.length}
              label="Related theses"
              hint={report.thesisLookupFailed ? 'Thesis lookup did not respond' : report.localTheses.length > 0 ? `${report.localTheses.length} in this archive` : 'Student work on this'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left: the reading list and the angle */}
            <div className="lg:col-span-2 space-y-6">
              <section aria-labelledby="topic-closest" className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md">
                <div className="px-5 py-4 border-b border-[#F2EFE8] dark:border-[#24221F] flex flex-wrap items-center justify-between gap-2">
                  <h3 id="topic-closest" className="text-base font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">
                    {report.related.length > 0 ? 'Closest existing work' : 'Nearest results (weak matches only)'}
                  </h3>
                  {compareCandidates.length > 1 && onToggleCompare && (
                    <button
                      type="button"
                      onClick={() => compareCandidates.forEach((i) => onToggleCompare(i.record))}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-800 dark:text-purple-300 hover:underline cursor-pointer"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>Compare the top {compareCandidates.length}</span>
                    </button>
                  )}
                </div>

                {strongest.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-[#737067] dark:text-[#9A968D]">
                    Nothing came back for these words. Try a broader phrase or different terms for the same idea.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#F2EFE8] dark:divide-[#24221F]">
                    {visible.map((item) => {
                      const r = item.record;
                      const where = isThesisRecord(r) ? recordUniversity(r) : r.venue || r.publisher;
                      const selected = inCompare(r);
                      return (
                        <li key={paperId(r) || r.title} className="px-5 py-4 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => onViewDetail && onViewDetail(r)}
                              className="text-left text-[15px] font-medium text-[#1C1B18] dark:text-[#F0EDE6] hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline cursor-pointer leading-snug"
                            >
                              {r.title}
                            </button>
                            <span
                              className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                item.level === 'close'
                                  ? 'bg-indigo-700 border-indigo-700 text-white dark:bg-indigo-300 dark:border-indigo-300 dark:text-neutral-950'
                                  : item.level === 'related'
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-200'
                                  : 'bg-[#FAF9F5] border-[#D5D1C7] text-[#605D55] dark:bg-[#1C1A18] dark:border-[#383530] dark:text-[#9A968D]'
                              }`}
                            >
                              {item.level === 'close' ? 'Close match' : item.level === 'related' ? 'Related' : 'Weak match'}
                            </span>
                          </div>
                          <p className="text-xs text-[#605D55] dark:text-[#9A968D]">
                            {[recordAuthor(r), r.publishedYear, typeLabel(r), where].filter(Boolean).join(', ')}
                            {Number(r.citationCount) > 0 && `, cited ${Number(r.citationCount).toLocaleString()} times`}
                          </p>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] text-[#8C887E] dark:text-[#736E66]">
                              {item.matched.length > 0 ? `Shares: ${item.matched.join(', ')}` : 'Shares none of your key words in its title or abstract'}
                            </p>
                            {onToggleCompare && (
                              <button
                                type="button"
                                aria-pressed={selected}
                                onClick={() => onToggleCompare(r)}
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-purple-100 border-purple-300 text-purple-900 dark:bg-purple-950/60 dark:border-purple-700 dark:text-purple-200'
                                    : 'bg-white border-[#D5D1C7] text-[#1C1B18] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:border-[#383530] dark:text-[#F0EDE6] dark:hover:bg-[#252320]'
                                }`}
                              >
                                <Scale className="w-3 h-3" />
                                <span>{selected ? 'In comparison' : 'Compare'}</span>
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {strongest.length > 6 && (
                  <div className="px-5 py-3 border-t border-[#F2EFE8] dark:border-[#24221F]">
                    <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 hover:underline cursor-pointer">
                      {showAll ? 'Show fewer' : `Show all ${strongest.length}`}
                    </button>
                  </div>
                )}
              </section>

              <section aria-labelledby="topic-angle" className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md p-5 space-y-4">
                <h3 id="topic-angle" className="text-base font-semibold text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Where your idea differs</span>
                </h3>
                {report.related.length < 5 ? (
                  <p className="text-sm text-[#605D55] dark:text-[#9A968D]">
                    Too few related works were found to compare wording. That can mean the idea is unusual, or that the phrasing is narrow. Try a
                    broader version to see the neighbouring literature.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">Parts of your idea the related work rarely mentions</p>
                      {report.rareTerms.length > 0 ? (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {report.rareTerms.map((term) => (
                              <span key={term} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-700 text-white dark:bg-indigo-300 dark:text-neutral-950">
                                {term}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-[#605D55] dark:text-[#9A968D]">
                            Fewer than 1 in 5 related works mention these. This may be your contribution. Confirm it by reading the closest work.
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-[#605D55] dark:text-[#9A968D]">
                          Every part of your wording already appears often in the related work. Add what is specific to you: a dataset, a language, a
                          place, or a method.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">What the related work keeps using</p>
                      {report.commonTerms.length > 0 ? (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {report.commonTerms.map((term) => (
                              <span key={term.word} className="px-2 py-0.5 rounded-full text-xs border border-[#D5D1C7] dark:border-[#383530] bg-[#FAF9F5] dark:bg-[#1C1A18] text-[#1C1B18] dark:text-[#F0EDE6]">
                                {term.word} <span className="text-[#8C887E] dark:text-[#736E66] tabular-nums">{term.count}</span>
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-[#605D55] dark:text-[#9A968D]">
                            Common methods and settings in this area. Useful as baselines, or as things to deliberately do differently.
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-[#605D55] dark:text-[#9A968D]">No other term repeats often enough to call a pattern.</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Right: feasibility */}
            <div className="space-y-6">
              <section aria-labelledby="topic-years" className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md p-5 space-y-3">
                <div>
                  <h3 id="topic-years" className="text-base font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">Activity by year</h3>
                  <p className="text-xs text-[#737067] dark:text-[#9A968D]">Related works found, by publication year</p>
                </div>
                <YearChart series={report.yearSeries} earlier={report.earlier} />
              </section>

              <section aria-labelledby="topic-theses" className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md p-5 space-y-3">
                <h3 id="topic-theses" className="text-base font-semibold text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Theses and supervisors</span>
                </h3>
                {report.theses.length === 0 ? (
                  <p className="text-xs text-[#605D55] dark:text-[#9A968D]">
                    {report.thesisLookupFailed
                      ? 'The thesis lookup did not respond this time.'
                      : 'No related thesis was found. If you do this one, yours could be the first in the archive on this topic.'}
                  </p>
                ) : (
                  <>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { n: report.localTheses.length, t: 'In this archive' },
                        { n: report.bangladeshTheses.length, t: 'From Bangladesh' },
                        { n: user?.university ? report.sameUniversity.length : report.theses.length, t: user?.university ? 'At your university' : 'In total' },
                      ].map((cell) => (
                        <div key={cell.t} className="bg-[#FAF9F5] dark:bg-[#1C1A18] rounded-md py-2">
                          <dd className="text-lg font-semibold tabular-nums text-[#1C1B18] dark:text-[#F0EDE6]">{cell.n}</dd>
                          <dt className="text-[11px] text-[#737067] dark:text-[#9A968D]">{cell.t}</dt>
                        </div>
                      ))}
                    </dl>

                    {report.supervisors.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">Supervised related theses</p>
                        <ul className="space-y-1.5">
                          {report.supervisors.map((s) => (
                            <li key={s.name} className="text-xs text-[#4A4740] dark:text-[#B3AFA6]">
                              <span className="font-medium text-[#1C1B18] dark:text-[#F0EDE6]">{s.name}</span>
                              {s.university ? `, ${s.university}` : ''}
                              <span className="text-[#8C887E] dark:text-[#736E66]"> ({s.count} {s.count === 1 ? 'thesis' : 'theses'})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {report.universities.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">Where they were written</p>
                        <ul className="space-y-1">
                          {report.universities.map((u) => (
                            <li key={u.name} className="flex justify-between gap-3 text-xs text-[#4A4740] dark:text-[#B3AFA6]">
                              <span className="truncate" title={u.name}>{u.name}</span>
                              <span className="tabular-nums text-[#8C887E] dark:text-[#736E66]">{u.count}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </section>

              <section aria-labelledby="topic-data" className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md p-5 space-y-3">
                <h3 id="topic-data" className="text-base font-semibold text-[#1C1B18] dark:text-[#F0EDE6] flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#2C6B3F] dark:text-emerald-400" />
                  <span>Datasets you could use</span>
                </h3>
                {report.datasets.length === 0 ? (
                  <p className="text-xs text-[#605D55] dark:text-[#9A968D]">
                    {report.datasetLookupFailed
                      ? 'The dataset lookup did not respond this time.'
                      : 'No open dataset matched. Plan time for collecting your own data, and say so in your proposal.'}
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {report.datasets.map((d) => (
                      <li key={d.id || d.url || d.title} className="text-xs">
                        {d.url || d.doi ? (
                          <a
                            href={d.url || `https://doi.org/${d.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-[#1C1B18] dark:text-[#F0EDE6] hover:underline inline-flex items-start gap-1"
                          >
                            <span>{d.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 text-[#8C887E]" />
                          </a>
                        ) : (
                          <span className="font-medium text-[#1C1B18] dark:text-[#F0EDE6]">{d.title}</span>
                        )}
                        <div className="text-[11px] text-[#8C887E] dark:text-[#736E66]">
                          {[d.source, d.publicationYear, d.license].filter(Boolean).join(', ')}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {/* What next */}
          <section aria-label="Next steps" className="bg-[#FAF9F5] dark:bg-[#181614] border border-[#E2DFD8] dark:border-[#2A2824] rounded-md p-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-400 dark:hover:bg-indigo-300 text-white dark:text-neutral-950 px-3.5 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors"
            >
              {copied === 'yes' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied === 'yes' ? 'Brief copied' : copied === 'failed' ? 'Copy failed, try again' : 'Copy brief for your supervisor'}</span>
            </button>
            {onOpenTopicAlerts && (
              <button
                type="button"
                onClick={onOpenTopicAlerts}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1C1A18] hover:bg-[#F2EFE8] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#F0EDE6] px-3.5 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Get alerts for new work</span>
              </button>
            )}
            {onSearchInDiscover && (
              <button
                type="button"
                onClick={() => onSearchInDiscover(report.searchQuery || report.keywords.join(' '), report.searchContextId)}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1C1A18] hover:bg-[#F2EFE8] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#F0EDE6] px-3.5 py-2 rounded-md text-xs font-semibold cursor-pointer transition-colors"
              >
                <span>See all results in Discover</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
