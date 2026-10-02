import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bookmark, Trash2, Edit3, Check, FileText, Quote, Scale, ExternalLink, Plus, Search } from 'lucide-react';

export default function SavedPapersModal({ isOpen, onClose, onCite, onAddToCompare, comparisonPaperIds = [] }) {
  const [savedPapers, setSavedPapers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const fetchSavedPapers = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/user/saved-papers');
      setSavedPapers(res.data || []);
    } catch (err) {
      console.error('Failed to load saved papers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSavedPapers();
    }
  }, [isOpen]);

  const handleDelete = async (paperId) => {
    try {
      const res = await axios.delete(`/api/user/saved-papers/${encodeURIComponent(paperId)}`);
      setSavedPapers(res.data.savedPapers || []);
    } catch (err) {
      alert('Failed to remove paper.');
    }
  };

  const handleStartEditNote = (paper) => {
    setEditingId(paper.paperId);
    setEditNoteText(paper.notes || '');
  };

  const handleSaveNote = async (paperId) => {
    try {
      setSavingNote(true);
      await axios.patch(`/api/user/saved-papers/${encodeURIComponent(paperId)}/notes`, {
        notes: editNoteText,
      });
      setSavedPapers((prev) =>
        prev.map((p) => (p.paperId === paperId ? { ...p, notes: editNoteText } : p))
      );
      setEditingId(null);
    } catch (err) {
      alert('Failed to update notes.');
    } finally {
      setSavingNote(false);
    }
  };

  if (!isOpen) return null;

  const filteredPapers = savedPapers.filter((p) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      (p.title && p.title.toLowerCase().includes(term)) ||
      (p.authors && p.authors.toLowerCase().includes(term)) ||
      (p.notes && p.notes.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-xl font-serif-title text-[#1C1B18]">My Saved Thesis Papers</h2>
              <span className="text-xs font-mono-meta text-[#737067]">
                Personal research library • {savedPapers.length} publications saved
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer"
          >
            [✕ CLOSE]
          </button>
        </div>

        {/* Filter Input */}
        <div className="pt-3 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8C887E] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter saved papers by title, author, or personal research note..."
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] pl-8 pr-3 py-1.5 text-xs text-[#1C1B18] rounded-sm font-sans focus:outline-none focus:border-[#1C1B18]"
            />
          </div>
        </div>

        {/* Papers List */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs font-mono-meta text-[#737067]">
              Loading your saved papers...
            </div>
          ) : filteredPapers.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono-meta text-[#737067] bg-[#FAF9F5] border border-dashed border-[#D5D1C7] rounded-sm">
              {searchFilter
                ? 'No saved papers match your search term.'
                : 'No saved papers yet. Bookmark relevant publications from discovery search to view and annotate them here.'}
            </div>
          ) : (
            filteredPapers.map((paper) => {
              const inComparison = comparisonPaperIds.includes(paper.paperId);

              return (
                <div
                  key={paper.paperId}
                  className="p-4 bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm space-y-2 hover:border-[#BDB9AF] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <h3 className="font-serif-title text-base text-[#1C1B18] leading-snug">
                        {paper.title}
                      </h3>
                      <div className="text-[11px] font-mono-meta text-[#737067] flex items-center gap-2 flex-wrap">
                        <span>{paper.authors || 'Author unrecorded'}</span>
                        {paper.year && (
                          <>
                            <span>•</span>
                            <span>{paper.year}</span>
                          </>
                        )}
                        {paper.doi && (
                          <>
                            <span>•</span>
                            <span className="text-blue-800">DOI: {paper.doi}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 font-mono-meta text-xs">
                      {paper.pdfUrl && (
                        <a
                          href={paper.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-white border border-[#D5D1C7] hover:border-[#1C1B18] text-[#1C1B18] rounded-sm flex items-center gap-1 text-[11px]"
                          title="Open Full Text"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                          <span className="hidden sm:inline">PDF</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => onCite && onCite(paper)}
                        className="p-1.5 bg-white border border-[#D5D1C7] hover:border-[#1C1B18] text-[#1C1B18] rounded-sm flex items-center gap-1 text-[11px] cursor-pointer"
                        title="Cite paper"
                      >
                        <Quote className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Cite</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAddToCompare && onAddToCompare(paper)}
                        className={`p-1.5 border rounded-sm flex items-center gap-1 text-[11px] cursor-pointer transition ${
                          inComparison
                            ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold'
                            : 'bg-white border-[#D5D1C7] hover:border-purple-600 text-[#1C1B18]'
                        }`}
                        title="Add to Comparison Matrix"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{inComparison ? 'In Matrix' : 'Compare'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(paper.paperId)}
                        className="p-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-700 rounded-sm cursor-pointer"
                        title="Remove from saved library"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Private Student Research Notes Section */}
                  <div className="pt-2 border-t border-[#E5E2DA]">
                    {editingId === paper.paperId ? (
                      <div className="space-y-2">
                        <label className="text-[11px] font-mono-meta font-bold text-[#1C1B18] block">
                          Private Thesis Research Notes:
                        </label>
                        <textarea
                          rows="3"
                          value={editNoteText}
                          onChange={(e) => setEditNoteText(e.target.value)}
                          placeholder="Note methodology relevance, benchmark results, dataset suitability, or critique..."
                          className="w-full bg-white border border-[#1C1B18] p-2 text-xs text-[#1C1B18] rounded-sm focus:outline-none font-mono-meta"
                        ></textarea>
                        <div className="flex items-center justify-end gap-2 font-mono-meta text-xs">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 border border-[#D5D1C7] text-[#737067] rounded-sm cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveNote(paper.paperId)}
                            disabled={savingNote}
                            className="bg-[#1C1B18] text-white px-3 py-1 rounded-sm flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{savingNote ? 'Saving...' : 'Save Note'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <div className="text-[11px] text-[#524F47] leading-relaxed">
                          <span className="font-mono-meta font-bold text-[#1C1B18] mr-1.5">Note:</span>
                          {paper.notes ? (
                            <span className="italic">{paper.notes}</span>
                          ) : (
                            <span className="text-[#8C887E]">No private notes attached yet.</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleStartEditNote(paper)}
                          className="text-[11px] font-mono-meta text-[#737067] hover:text-[#1C1B18] underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>{paper.notes ? 'Edit' : 'Add Note'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#E2DFD8] flex items-center justify-between text-xs font-mono-meta text-[#737067]">
          <span>Notes and saved papers are private to your authenticated workspace.</span>
          <button
            onClick={onClose}
            className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-1.5 rounded-sm transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
