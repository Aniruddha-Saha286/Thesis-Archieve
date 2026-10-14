import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Radar, RefreshCw, Plus, X } from 'lucide-react';
import RadarAvailability from './RadarAvailability';
import ThesisCard from './ThesisCard';
import PaperSkeletons from './PaperSkeletons';
import ResearchSuggestionInput from './ResearchSuggestionInput';
import { VENUES, TOPICS } from '../utils/venues';
import { safeResourceLink } from '../utils/resourceLinks';
export default function ResearchRadar({ active = true, filters, onFiltersChange, onSearchPapers, onCheckIdea, onViewDetail, onCompare, onCite, onReportIssue, comparisonPapers = [], savedPaperIds = new Set(), onSavedChange, onOpenMembership, onOpenAlerts }) {
  const [localFilters, setLocalFilters] = useState({ range: 'year', mode: 'publication', venue: '', provider: '', year: '', query: '' });
  const { range, mode, venue, provider, year, query } = filters || localFilters;
  const updateFilters = onFiltersChange || setLocalFilters;
  const setField = key => value => updateFilters(old => ({ ...old, [key]: value }));
  const setRange = setField('range'), setMode = setField('mode'), setVenue = setField('venue'), setProvider = setField('provider'), setYear = setField('year'), setQuery = setField('query');
  const [debounced, setDebounced] = useState(query.trim());
  const [data, setData] = useState({ records: [], sync: [] }), [cursor, setCursor] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [refresh, setRefresh] = useState(0), [following, setFollowing] = useState(false);
  const request = useRef(0), resetKey = useRef('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!active) return;
    const key = JSON.stringify([range, mode, venue, provider, year, debounced, refresh]);
    const changed = key !== resetKey.current; resetKey.current = key;
    if (changed && cursor) { ++request.current; setCursor(''); return; }
    const id = ++request.current; const controller = new AbortController(); setLoading(true); setError('');
    axios.get('/api/research/radar', { params: { range, mode, venue, provider, year, q: debounced, ...(cursor ? { cursor } : {}) }, signal: controller.signal })
      .then(res => { if (id !== request.current) return; setData(old => ({ ...res.data, records: cursor ? [...new Map([...old.records, ...res.data.records].map(r => [r.id, r])).values()] : res.data.records })); })
      .catch(err => { if (id === request.current && !axios.isCancel(err)) setError(([401, 403].includes(err.response?.status) ? 'Sign in with an approved account to view research updates.' : err.response?.data?.message || 'The feed could not be refreshed. Please check your connection.') + ' Previous results remain visible.'); })
      .finally(() => { if (id === request.current) setLoading(false); });
    return () => { ++request.current; controller.abort(); };
  }, [active, range, mode, venue, provider, year, debounced, cursor, refresh]);
  const reset = () => { setRange('year'); setMode('publication'); setVenue(''); setProvider(''); setYear(''); setQuery(''); setCursor(''); };
  const chooseVenue = next => {
    setVenue(next);
    if (year && ((next === 'iccv' && Number(year) % 2 === 0) || (next === 'eccv' && Number(year) % 2 === 1))) { setYear(''); setNotice('Edition cleared because this venue uses alternate-year editions.'); }
  };
  const searchAll = () => onSearchPapers?.({ query: query.trim(), venue, year });
  const follow = async () => {
    setFollowing(true); setNotice('');
    try { await axios.post('/api/user/alerts', { topic: query.trim() || VENUES.find(v => v.id === venue)?.label, venueId: venue }); setNotice('Follow saved. Notifications arrive when matching papers are indexed; source delays can affect updates.'); }
    catch (err) { setNotice(err.response?.status === 409 ? 'You already follow this topic and venue.' : err.response?.status === 429 || ['QUOTA_EXCEEDED', 'FEATURE_LOCKED'].includes(err.response?.data?.code) ? 'Your topic-alert allowance is full. Manage follows or review your plan.' : err.response?.data?.message || 'Following could not be saved. Please try again.'); }
    finally { setFollowing(false); }
  };
  const fieldClass = 'max-w-full rounded-xl border border-[#D5D1C7] dark:border-[#383530] bg-white dark:bg-[#1C1A18] px-3 py-2 text-sm';
  return <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 text-[#1C1B18] dark:text-[#F0EDE6]">
    <div className="flex items-start justify-between gap-4 mb-7"><div><p className="text-xs uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-2"><Radar size={16} />Computer vision & AI</p><h1 className="font-serif-title text-3xl md:text-5xl mt-2">Research Radar</h1><p className="mt-3 max-w-2xl text-sm text-[#737067] dark:text-[#B3AFA6]">Discover recent research from tracked conferences, journals and topics. This indexed feed covers selected sources; Find papers searches the broader catalog.</p></div><button type="button" onClick={() => { setCursor(''); setRefresh(n => n + 1); }} disabled={loading} aria-label="Refresh Research Radar" className={fieldClass}><RefreshCw size={16} /></button></div>
    <section aria-label="Radar filters" className="rounded-2xl border border-[#E2DFD8] dark:border-[#383530] p-4 md:p-5 mb-6 space-y-4 bg-[#F2EFE8] dark:bg-[#181614]">
      <div className="flex flex-wrap gap-2 items-center"><ResearchSuggestionInput value={query} onChange={setQuery} onSelectVenue={chooseVenue} /><button type="button" disabled={following || (!query.trim() && !venue)} onClick={follow} className="rounded-xl bg-[#2C6B3F] text-white px-4 py-3 text-sm disabled:opacity-40 flex gap-2 items-center"><Plus size={16} />Follow topic / venue</button><button type="button" onClick={onOpenAlerts} className={fieldClass}>Manage follows</button></div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="max-w-full min-w-0 text-xs space-y-1"><span className="block">Time window</span><select aria-label="Time window" className={fieldClass} value={range} onChange={e => setRange(e.target.value)}>{[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['year', mode === 'activity' ? 'This year' : 'Year ' + (year || new Date().getFullYear())]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="max-w-full min-w-0 text-xs space-y-1"><span className="block">Conference / journal</span><select aria-label="Conference or journal" className={fieldClass} value={venue} onChange={e => chooseVenue(e.target.value)}><option value="">All venues</option>{VENUES.map(v => <option key={v.id} value={v.id}>{v.label} · {v.name}</option>)}</select></label>
        <details className="w-full"><summary className="cursor-pointer text-sm">Advanced filters</summary><div className="flex flex-wrap gap-3 mt-3"><label className="max-w-full min-w-0 text-xs space-y-1"><span className="block">Date basis</span><select aria-label="Date basis" className={fieldClass} value={mode} onChange={e => setMode(e.target.value)}><option value="publication">Newest publications</option><option value="activity">Newly indexed activity</option></select></label>

        <label className="max-w-full min-w-0 text-xs space-y-1"><span className="block">Metadata source</span><select aria-label="Metadata source" className={fieldClass} value={provider} onChange={e => setProvider(e.target.value)}><option value="">All sources</option>{['CVF', 'OpenReview', 'JMLR', 'DBLP', 'arXiv'].map(p => <option key={p}>{p}</option>)}</select></label>
        <label className="max-w-full min-w-0 text-xs space-y-1"><span className="block">Edition</span><select aria-label="Edition year" className={fieldClass} value={year} onChange={e => setYear(e.target.value)}><option value="">Any year</option>{Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).filter(y => venue !== 'iccv' && venue !== 'eccv' || y % 2 === (venue === 'iccv' ? 1 : 0)).map(y => <option key={y}>{y}</option>)}</select></label>
        </div></details><button type="button" onClick={reset} className="text-sm underline px-2 py-2">Clear all</button>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Computer vision topics">{TOPICS.map(t => <button type="button" key={t} aria-pressed={query === t} onClick={() => setQuery(query === t ? '' : t)} className={`rounded-full border px-3 py-1.5 text-xs ${query === t ? 'bg-[#1C1B18] text-white dark:bg-amber-400 dark:text-black' : 'border-[#D5D1C7] dark:border-[#383530]'}`}>{t}</button>)}</div>
      {(venue || provider || query || year) && <div className="flex flex-wrap gap-2" aria-label="Active filters">{[[venue && VENUES.find(v => v.id === venue)?.label, () => setVenue('')], [provider, () => setProvider('')], [query, () => setQuery('')], [year, () => setYear('')]].filter(([label]) => label).map(([label, clear]) => <button type="button" key={label} onClick={clear} aria-label={`Remove ${label} filter`} className="inline-flex gap-1 items-center text-xs rounded-full px-3 py-1 bg-white dark:bg-[#24211D]">{label}<X size={12} /></button>)}</div>}
    </section>
    {range === 'year' && mode === 'publication' && venue === 'iccv' && !year && new Date().getFullYear() % 2 === 0 && <p className="text-sm mb-4">ICCV has odd-year editions. The current publication year has no ICCV edition. <button type="button" className="underline" onClick={() => setYear(String(new Date().getFullYear() - 1))}>Browse the latest ICCV edition</button></p>}
    {(range !== 'year' || mode !== 'publication') && <div className="flex flex-wrap gap-2 mb-4 text-xs"><button type="button" className="underline" onClick={() => { setRange('year'); setMode('publication'); }}>Clear {mode === 'activity' ? 'indexing activity' : 'publication'} period: {range === 'year' ? 'this year' : range + ' days'}</button></div>}
    <p className="text-xs text-[#737067] dark:text-[#B3AFA6] mb-4">{data.basis || 'Short publication windows require an exact publication date. Use activity to see recently indexed records.'}</p>
    {notice && <p role="status" className="text-sm mb-4">{notice}</p>}
    {error && <div role="alert" className="rounded-xl border border-amber-400 p-4 mb-4 text-sm">{error}<button type="button" onClick={() => setRefresh(n => n + 1)} className="underline ml-3">Try again</button></div>}
    <RadarAvailability data={{ ...data, empty: !loading && !data.records.length && !error }} mode={mode} query={query} onSearch={searchAll} onReset={reset} onAnnual={() => { setRange('year'); setMode('publication'); }} onIdea={onCheckIdea} />
    {loading && data.records.length > 0 && <p role="status" className="text-xs mb-3">Refreshing papers; previous results remain visible.</p>}
    <section aria-label="Research Radar papers" aria-busy={loading} className="space-y-4">
      {loading && !data.records.length ? <PaperSkeletons /> : data.records.map(p => <article key={p.id}>
        <div className="flex flex-wrap gap-2 text-xs px-2 mb-2"><span className="font-bold">{p.reviewLabel}</span><span>{p.venue || 'Venue unknown'} · {p.publishedYear || 'Year unknown'}</span><span>Source: {(p.sources || []).map(s => s.provider).filter((s, i, a) => a.indexOf(s) === i).join(', ')}</span>{mode === 'activity' && <span>Indexed {new Date(p.firstSeenAt).toLocaleDateString()}</span>}</div>
        <ThesisCard thesis={p} onCite={onCite} onReportIssue={onReportIssue} onViewDetail={onViewDetail} onAddToCompare={onCompare} inComparison={comparisonPapers.some(c => c.id === p.id)} comparisonCount={comparisonPapers.length} initiallySaved={savedPaperIds.has(p.id)} onSavedChange={onSavedChange} onOpenMembership={onOpenMembership} />
        <div className="flex flex-wrap gap-4 text-xs px-2 mt-2">{p.codeEvidence && safeResourceLink(p.codeUrl, ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']) && <a href={safeResourceLink(p.codeUrl, ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'])} target="_blank" rel="noreferrer" className="underline">Code · source linked</a>}{p.datasetEvidence && safeResourceLink(p.datasetUrl) && <a href={safeResourceLink(p.datasetUrl)} target="_blank" rel="noreferrer" className="underline">Dataset · source linked</a>}<button type="button" onClick={() => onCompare(p)} className="underline">Compare</button><button type="button" onClick={() => onViewDetail(p, 'overview')} className="underline">Read</button><button type="button" onClick={() => onViewDetail(p, 'summary')} className="underline">Summary & thesis ideas</button></div>
      </article>)}
    </section>
    {data.nextCursor && <button type="button" disabled={loading} onClick={() => setCursor(data.nextCursor)} className={`${fieldClass} mt-6`}>Load more papers</button>}
  </main>;
}
