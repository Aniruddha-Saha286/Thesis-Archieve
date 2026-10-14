import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Download } from 'lucide-react';
import { downloadFile, matrixCsv, matrixExcel, matrixMarkdown } from '../utils/literatureExport';
export default function LiteratureExport({ papers = [], title = 'literature_review', criteria = {} }) {
  const [format, setFormat] = useState('xlsx'); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const run = async () => {
    if (busy || !papers.length || papers.length > 10) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage('Preparing notes and existing analyses…');
    try {
      const selections = papers.map(p => {
        const id = String(p.paperId || p._id || p.id);
        return { paperId: id, title: p.title, authors: typeof p.authors === 'string' ? p.authors : p.author || p.authors?.map(a => a.name).join(', '),
          year: p.year || p.publishedYear, doi: p.doi, pdfUrl: p.pdfUrl,
          overrides: Object.fromEntries(['methodology', 'dataset', 'findings', 'limitations'].map(field => [field, criteria[`${id}_${field}`] || ''])) };
      });
      const { data } = await axios.post('/api/research/matrix', { papers: selections }, { signal: controller.signal });
      const rows = data.rows;
      const content = format === 'xlsx' ? await matrixExcel(rows) : format === 'md' ? matrixMarkdown(rows) : matrixCsv(rows);
      if (controller.signal.aborted) return;
      const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'literature_review';
      downloadFile(content, `${safeName}.${format}`, format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8');
      setMessage('Exported. Check the evidence and fill any “Not extracted” fields before citing.');
    } catch (error) { if (!controller.signal.aborted) setMessage(error.response?.data?.message || 'Export failed. Please try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select aria-label="Literature review export format" value={format} disabled={busy} onChange={e => setFormat(e.target.value)} className="border rounded-xl px-3 py-2 bg-white dark:bg-[#201F1C]">
        <option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="md">Markdown</option>
      </select>
      <button type="button" onClick={run} disabled={busy || !papers.length || papers.length > 10} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#254B40] text-white cursor-pointer disabled:opacity-50">
        <Download className="w-4 h-4" />{busy ? 'Preparing…' : `Export lit review (${papers.length})`}
      </button>
    </div>
    <p role="status" className="text-xs text-[#737067] dark:text-[#9A968D]">{message || 'Select up to 10 papers. Export uses your notes and cached analyses; no paid AI requests.'}</p>
  </div>;
}
