import React, { useState, useEffect } from 'react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import axios from 'axios';
import { Copy, Check, Download, Quote, FileText, AlertCircle, RefreshCw } from 'lucide-react';

export default function CiteModal({ thesis, onClose }) {
  useEscapeToClose(onClose, Boolean(thesis));
  const [activeTab, setActiveTab] = useState('bibtex'); // 'bibtex', 'ris', 'apa'
  const [copied, setCopied] = useState(false);
  const [citations, setCitations] = useState({ bibtex: '', ris: '', apa: '' });
  const [missingFields, setMissingFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCitations = async () => {
    if (!thesis) return;
    try {
      setLoading(true);
      setError(null);
      const res = await axios.post('/api/thesis/cite', {
        record: thesis,
      });
      if (res.data) {
        setCitations({
          bibtex: res.data.bibtex || '',
          ris: res.data.ris || '',
          apa: res.data.apa || '',
        });
        setMissingFields(res.data.missingFields || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate academic citations from repository server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCitations();
  }, [thesis]);

  if (!thesis) return null;

  const currentContent = citations[activeTab] || '';

  const handleCopy = () => {
    if (!currentContent) return;
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!currentContent) return;
    const ext = activeTab === 'bibtex' ? 'bib' : activeTab === 'ris' ? 'ris' : 'txt';
    const mime = activeTab === 'bibtex' ? 'application/x-bibtex' : activeTab === 'ris' ? 'application/x-research-info-systems' : 'text/plain';
    const blob = new Blob([currentContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (thesis.title || 'citation').slice(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.href = url;
    a.download = `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm w-full max-w-xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] font-mono-meta text-xs cursor-pointer"
        >
          [✕ CLOSE]
        </button>

        <div className="mb-4 pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
          <span className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9C988F] uppercase tracking-wider block">
            Academic Attribution & Citation Export
          </span>
          <h3 className="text-xl font-serif-title text-[#1C1B18] dark:text-[#F0EDE6] mt-0.5 line-clamp-2">
            {thesis.title}
          </h3>
          <div className="text-xs text-[#737067] dark:text-[#9C988F] mt-1 font-mono-meta flex items-center gap-2 flex-wrap">
            <span>{thesis.author || (Array.isArray(thesis.authors) && thesis.authors.map(a => a.name).join(', '))}</span>
            <span>•</span>
            <span>{thesis.publishedYear || '(n.d.)'}</span>
            {thesis.doi && (
              <>
                <span>•</span>
                <span className="text-blue-800 dark:text-blue-400">DOI: {thesis.doi}</span>
              </>
            )}
          </div>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex border-b border-[#E2DFD8] dark:border-[#2C2A26] text-xs font-mono-meta mb-3">
          <button
            type="button"
            onClick={() => setActiveTab('bibtex')}
            className={`py-2 px-4 transition border-b-2 cursor-pointer ${
              activeTab === 'bibtex'
                ? 'border-[#1C1B18] dark:border-[#F0EDE6] font-bold text-[#1C1B18] dark:text-[#F0EDE6] bg-[#FAF9F5] dark:bg-[#24221E]'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
            }`}
          >
            BibTeX (.bib)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ris')}
            className={`py-2 px-4 transition border-b-2 cursor-pointer ${
              activeTab === 'ris'
                ? 'border-[#1C1B18] dark:border-[#F0EDE6] font-bold text-[#1C1B18] dark:text-[#F0EDE6] bg-[#FAF9F5] dark:bg-[#24221E]'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
            }`}
          >
            RIS / EndNote / Zotero
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apa')}
            className={`py-2 px-4 transition border-b-2 cursor-pointer ${
              activeTab === 'apa'
                ? 'border-[#1C1B18] dark:border-[#F0EDE6] font-bold text-[#1C1B18] dark:text-[#F0EDE6] bg-[#FAF9F5] dark:bg-[#24221E]'
                : 'border-transparent text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6]'
            }`}
          >
            APA (7th Edition)
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-mono-meta rounded-sm mb-3 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={fetchCitations}
              className="underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {/* Citation Content Box */}
        <div className="relative">
          <pre className="p-4 bg-[#FAF9F5] dark:bg-[#141412] border border-[#E2DFD8] dark:border-[#2C2A26] text-xs font-mono-meta text-[#1C1B18] dark:text-[#E8E6E1] whitespace-pre-wrap overflow-x-auto rounded-sm leading-relaxed mb-3 max-h-60 overflow-y-auto">
            {loading ? 'Formatting scholarly citation from verified metadata...' : currentContent}
          </pre>
        </div>

        {/* Missing Fields Transparency Notice */}
        {missingFields.length > 0 && (
          <div className="p-2.5 bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-sm text-[11px] font-mono-meta text-amber-900 dark:text-amber-300 mb-4 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Metadata Notice:</strong> Source record is missing verified data for:{' '}
              <span className="font-bold underline">{missingFields.join(', ')}</span>. Missing fields are preserved as omitted rather than populated with fictional fallbacks.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 font-mono-meta text-xs">
          <div className="text-[11px] text-[#737067] dark:text-[#9C988F]">
            Format: <strong className="uppercase text-[#1C1B18] dark:text-[#F0EDE6]">{activeTab}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={loading || !currentContent}
              className="bg-white dark:bg-[#201F1C] hover:bg-[#F2EFE8] dark:hover:bg-[#272521] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#E8E6E1] px-3 py-1.5 rounded-sm flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
              title="Download citation file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .{activeTab === 'bibtex' ? 'bib' : activeTab === 'ris' ? 'ris' : 'txt'}</span>
            </button>

            <button
              onClick={handleCopy}
              disabled={loading || !currentContent}
              className="bg-[#1C1B18] dark:bg-blue-700 hover:bg-[#2E2C28] dark:hover:bg-blue-800 text-white px-4 py-1.5 rounded-sm flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-40"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
