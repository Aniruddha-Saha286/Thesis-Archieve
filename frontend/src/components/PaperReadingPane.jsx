import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { safeResourceLink } from '../utils/resourceLinks';
export default function PaperReadingPane({ paper, user, onSavedChange }) {
  const id = String(paper.paperId || paper._id || paper.id);
  const url = safeResourceLink(paper.pdfUrl);
  const [notes, setNotes] = useState(''); const [saved, setSaved] = useState(false); const [loaded, setLoaded] = useState(!user);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [analysis, setAnalysis] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!user) return;
    axios.get('/api/user/saved-papers', { signal: controller.signal }).then(({ data }) => {
      const found = data.find(p => p.paperId === id); setNotes(found?.notes || ''); setSaved(Boolean(found)); setLoaded(true);
    }).catch(() => { if (!controller.signal.aborted) setMessage('Notes could not be loaded. Retry before editing to avoid replacing existing notes.'); });
    return () => controller.abort();
  }, [id, user, loadAttempt]);
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      if (saved) await axios.patch(`/api/user/saved-papers/${encodeURIComponent(id)}/notes`, { notes });
      else await axios.post('/api/user/saved-papers', { paperId: id, title: paper.title, abstract: paper.abstract || '', doi: paper.doi || '',
        authors: paper.author || (typeof paper.authors === 'string' ? paper.authors : paper.authors?.map(a => a.name).join(', ')) || '',
        year: paper.publishedYear || paper.year, pdfUrl: paper.pdfUrl || '', publicationType: paper.publicationType || 'unknown', notes });
      setSaved(true); setMessage('Notes saved to your library.'); onSavedChange?.();
    } catch (e) { setMessage(e.response?.data?.message || 'Notes could not be saved. Your draft is still here.'); }
    finally { setBusy(false); }
  };
  const loadAnalysis = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post('/api/research/matrix', { papers: [{ paperId: id, title: paper.title, doi: paper.doi }] }); setAnalysis(data.rows[0]);
    } catch (e) { setMessage(e.response?.data?.message || 'Analysis could not be loaded.'); }
    finally { setBusy(false); }
  };
  return <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <section className="lg:col-span-2 space-y-2">
      {url ? <>
        <object data={url} type="application/pdf" aria-label={`PDF: ${paper.title}`} className="w-full h-[65vh] min-h-80 rounded-xl border bg-white"><p className="p-4">This browser cannot embed the PDF. <a href={url} target="_blank" rel="noreferrer" className="underline">Open the PDF separately</a>.</p></object>
        <p className="text-xs">If the publisher blocks embedding or the reader is blank, <a href={url} target="_blank" rel="noreferrer" className="underline">open the paper in a separate tab</a>.</p>
      </> : <p className="rounded-xl border p-6 text-sm">No direct PDF link is available. Use the source link in Overview or find a free copy first.</p>}
    </section>
    <section className="space-y-4">
      <div><h3 className="text-lg font-semibold">Reading notes</h3><p className="text-xs">Personal notes stay in your own library.</p></div>
      <label className="block text-sm">Your notes<textarea aria-label="Personal reading notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={10000} disabled={!user || !loaded || busy} className="mt-2 w-full min-h-48 rounded-xl border p-3 bg-white dark:bg-[#201F1C]" placeholder="Questions, limitations, useful passages and page numbers…" /></label>
      <button type="button" onClick={save} disabled={!user || !loaded || busy} className="rounded-xl bg-[#254B40] text-white px-4 py-2 disabled:opacity-50">{busy ? 'Working…' : saved ? 'Save notes' : 'Save paper & notes'}</button>
      <p role="status" className="text-xs">{message || (!user ? 'Sign in to save notes.' : '')}</p>
      {user && !loaded && message && <button type="button" onClick={() => { setMessage(''); setLoadAttempt(n => n + 1); }} className="text-sm underline">Retry loading notes</button>}
      {user && <button type="button" onClick={loadAnalysis} disabled={busy} className="text-sm underline">Load existing research analysis</button>}
      {analysis && <div className="space-y-3 text-sm"><p className="text-xs">{analysis.coverage}. No new AI request was made.</p>{[['methodology', 'Methodology'], ['dataset', 'Dataset'], ['limitations', 'Limitations'], ['futureWork', 'Future work']].map(([key, label]) => <div key={key}><h4 className="font-semibold">{label}</h4><p className="whitespace-pre-wrap">{analysis[key]}</p></div>)}</div>}
    </section>
  </div>;
}
