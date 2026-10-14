import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { safeResourceLink } from '../utils/resourceLinks';
export default function SharedCollectionPage({ token }) {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); axios.get(`/api/research/shared/${encodeURIComponent(token)}`, { signal: controller.signal }).then(r => setData(r.data)).catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'This shared collection could not be loaded.'); }); return () => controller.abort(); }, [token]);
  return <main className="research-shell min-h-screen bg-[#FAF9F5] dark:bg-[#141412] text-[#1C1B18] dark:text-white p-5 sm:p-10">
    <div className="max-w-3xl mx-auto space-y-6">
      <a href="/" className="font-serif-title text-2xl">The Thesis Archive</a>
      <p className="text-sm text-[#737067] dark:text-[#9A968D]">Shared collection · read-only</p>
      {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading reading list…</p> : <>
        <h1 className="font-serif-title text-4xl">{data.name}</h1><p className="text-sm">{data.description}</p>
        <ul className="space-y-4">{data.papers.map((paper, index) => <li key={`${paper.doi || paper.title}-${index}`} className="rounded-2xl border p-5 bg-white dark:bg-[#1A1916] space-y-2">
          <h2 className="text-lg font-semibold">{paper.title}</h2><p className="text-sm">{paper.authors} {paper.year ? `· ${paper.year}` : ''}</p>
          {safeResourceLink(paper.url) && <a href={safeResourceLink(paper.url)} target="_blank" rel="noreferrer" className="text-sm underline">Open paper source</a>}
        </li>)}</ul>
        {!data.papers.length && <p>No papers are currently available in this collection.</p>}
      </>}
    </div>
  </main>;
}
