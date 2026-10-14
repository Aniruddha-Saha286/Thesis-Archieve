import React, { useEffect, useState } from 'react';
import axios from 'axios';
export default function CitationExplorer({ paper }) {
  const [seed, setSeed] = useState(null); const [data, setData] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [group, setGroup] = useState('references');
  useEffect(() => {
    if (!seed) return;
    const controller = new AbortController(); setBusy(true); setError(''); setData(null);
    axios.post('/api/research/neighborhood', { paper: seed }, { signal: controller.signal }).then(r => setData(r.data))
      .catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Could not load citation links.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [seed]);
  const groups = [['references', 'Papers cited by this'], ['citations', 'Papers that cited this'], ['similar', 'Recommended similar works']];
  return <section className="rounded-2xl border border-[#D5D1C7] dark:border-[#383530] p-4 space-y-4">
    <div><h3 className="text-lg font-semibold">Follow the research trail</h3><p className="text-sm text-[#737067] dark:text-[#9A968D]">Explore indexed citations and recommendations from a seed paper.</p></div>
    {!seed && <button type="button" onClick={() => setSeed(paper)} className="rounded-xl bg-[#254B40] text-white px-4 py-2">Explore citation tree</button>}
    {seed && <p className="text-sm font-medium">Seed: {seed.title || paper.title} {seed !== paper && <button type="button" onClick={() => setSeed(paper)} className="underline ml-2">Back to original paper</button>}</p>}
    {busy && <p role="status">Loading citation links…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setSeed({ ...seed })} className="underline">Try again</button></div>}
    {data && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm" aria-label="Citation neighborhood">
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950 p-3">Prior work →<br /><strong>{data.references.length} references shown</strong></div>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950 p-3">Seed paper<br /><strong className="line-clamp-2">{seed.title || paper.title}</strong></div>
        <div className="rounded-xl bg-purple-50 dark:bg-purple-950 p-3">→ Later work<br /><strong>{data.citations.length} citing papers shown</strong></div>
      </div>
      <p className="text-xs text-[#737067] dark:text-[#9A968D]">{data.message || data.note || 'Similar works are recommendations, not citation edges.'} {data.provider && `Source: ${data.provider}.`} {data.partialResults && 'Some provider requests failed; this view is incomplete.'}</p>
      <div className="flex flex-wrap gap-2">{groups.map(([key, label]) => <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)} className={`rounded-xl border px-3 py-2 text-sm ${group === key ? 'bg-[#254B40] text-white' : ''}`}>{label} ({data[key].length})</button>)}</div>
      <ul className="space-y-3">{data[group].map(p => <li key={p.id || p.doi} className="rounded-xl border p-3 space-y-1 text-sm">
        {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{p.title}</a> : <strong>{p.title}</strong>}
        <p className="text-xs text-[#737067] dark:text-[#9A968D]">{p.authors} {p.year ? `· ${p.year}` : ''}</p>
        <button type="button" onClick={() => setSeed({ ...p, id: data.provider === 'Semantic Scholar' ? `s2_${p.id}` : p.id })} className="text-xs underline">Use as next seed</button>
      </li>)}</ul>
      {!data[group].length && <p className="text-sm">No indexed links returned for this section. This does not prove there are none.</p>}
    </>}
  </section>;
}
