import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Scale, Trash2, Save, FileText, Check, Download, X, FolderOpen, Plus, Clock, ExternalLink } from 'lucide-react';

export default function ComparisonMatrixModal({
  isOpen,
  onClose,
  comparisonPapers = [],
  onRemovePaper,
  onClear,
  onSetComparisonPapers,
}) {
  const [viewTab, setViewTab] = useState('matrix'); // 'matrix' | 'saved'
  const [matrixTitle, setMatrixTitle] = useState('Comparative Literature Matrix');
  const [currentMatrixId, setCurrentMatrixId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [editableNotes, setEditableNotes] = useState({});
  const [savedMatrices, setSavedMatrices] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSavedMatrices();
    }
  }, [isOpen]);

  const fetchSavedMatrices = async () => {
    try {
      setLoadingSaved(true);
      const res = await axios.get('/api/user/comparisons');
      setSavedMatrices(res.data || []);
    } catch (err) {
      console.error('Failed to load saved matrices:', err);
    } finally {
      setLoadingSaved(false);
    }
  };

  if (!isOpen) return null;

  const handleNoteChange = (paperId, field, value) => {
    setEditableNotes((prev) => ({
      ...prev,
      [`${paperId}_${field}`]: value,
    }));
  };

  const handleSaveMatrix = async (saveAsNew = false) => {
    try {
      setSaving(true);
      const paperIds = comparisonPapers.map((p) => p._id || p.id || p.paperId);

      if (currentMatrixId && !saveAsNew) {
        // Update existing matrix
        await axios.put(`/api/user/comparisons/${currentMatrixId}`, {
          title: matrixTitle,
          paperIds,
          criteria: editableNotes,
        });
      } else {
        // Save new matrix
        const res = await axios.post('/api/user/comparisons', {
          title: matrixTitle,
          paperIds,
          criteria: editableNotes,
        });
        if (res.data?.comparison?._id) {
          setCurrentMatrixId(res.data.comparison._id);
        }
      }

      setSavedSuccess(true);
      fetchSavedMatrices();
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save comparison matrix.');
    } finally {
      setSaving(false);
    }
  };

  const handleReopenMatrix = async (matrix) => {
    setMatrixTitle(matrix.title || 'Comparative Literature Matrix');
    setCurrentMatrixId(matrix._id);
    setEditableNotes(matrix.criteria || {});

    // If papers need to be reloaded from IDs
    if (onSetComparisonPapers && Array.isArray(matrix.paperIds)) {
      try {
        // Fetch saved papers to populate full paper objects
        const res = await axios.get('/api/user/saved-papers');
        const userSaved = res.data || [];
        const matched = matrix.paperIds.map((id) => {
          const found = userSaved.find((p) => p.paperId === id || p._id === id);
          return found || { _id: id, id: id, title: `Publication ${id}` };
        });
        onSetComparisonPapers(matched);
      } catch (err) {
        // Keep existing if fetch fails
      }
    }

    setViewTab('matrix');
  };

  const handleDeleteMatrix = async (id, title) => {
    if (!window.confirm(`Delete comparison matrix "${title}"?`)) return;
    try {
      await axios.delete(`/api/user/comparisons/${id}`);
      setSavedMatrices((prev) => prev.filter((m) => m._id !== id));
      if (currentMatrixId === id) {
        setCurrentMatrixId(null);
      }
    } catch (err) {
      alert('Failed to delete comparison matrix.');
    }
  };

  const handleExportCsv = () => {
    if (comparisonPapers.length === 0) return;
    const headers = ['Criterion', ...comparisonPapers.map((p) => `"${(p.title || '').replace(/"/g, '""')}"`)];
    const rows = [
      ['Authors', ...comparisonPapers.map((p) => `"${p.author || (Array.isArray(p.authors) ? p.authors.map(a => a.name).join(', ') : '') || ''}"`)],
      ['Year', ...comparisonPapers.map((p) => p.publishedYear || p.year || '')],
      ['Type', ...comparisonPapers.map((p) => p.publicationType || p.degreeType || 'Article')],
      ['Venue / Publisher', ...comparisonPapers.map((p) => `"${p.venue || p.publisher || p.university || ''}"`)],
      ['Methodology', ...comparisonPapers.map((p) => `"${editableNotes[`${p._id || p.id || p.paperId}_methodology`] || (p.abstract?.slice(0, 100) + '...') || ''}"`)],
      ['Dataset / Benchmark', ...comparisonPapers.map((p) => `"${p.datasetUrl ? 'Empirical Dataset attached' : (editableNotes[`${p._id || p.id || p.paperId}_dataset`] || 'N/A')}"`)],
      ['Key Findings', ...comparisonPapers.map((p) => `"${editableNotes[`${p._id || p.id || p.paperId}_findings`] || ''}"`)],
      ['Limitations', ...comparisonPapers.map((p) => `"${editableNotes[`${p._id || p.id || p.paperId}_limitations`] || ''}"`)],
    ];

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = matrixTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
    a.href = url;
    a.download = `${safeTitle || 'literature_matrix'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-6xl p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-purple-700" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-serif-title text-[#1C1B18]">Literature Review Comparison Matrix</h2>
                {currentMatrixId && (
                  <span className="bg-purple-100 text-purple-900 text-[10px] font-mono-meta px-2 py-0.5 rounded-sm font-bold">
                    Editing Saved Matrix
                  </span>
                )}
              </div>
              <span className="text-xs font-mono-meta text-[#737067]">
                Side-by-side synthesis of methodologies, empirical benchmarks, findings, and limitations
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono-meta text-xs">
            {/* View Switcher */}
            <div className="flex border border-[#D5D1C7] rounded-sm mr-2">
              <button
                type="button"
                onClick={() => setViewTab('matrix')}
                className={`px-3 py-1 text-xs cursor-pointer transition ${
                  viewTab === 'matrix' ? 'bg-[#1C1B18] text-white font-bold' : 'bg-white text-[#737067] hover:bg-[#FAF9F5]'
                }`}
              >
                Active Matrix
              </button>
              <button
                type="button"
                onClick={() => setViewTab('saved')}
                className={`px-3 py-1 text-xs cursor-pointer transition flex items-center gap-1 ${
                  viewTab === 'saved' ? 'bg-[#1C1B18] text-white font-bold' : 'bg-white text-[#737067] hover:bg-[#FAF9F5]'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Saved ({savedMatrices.length})</span>
              </button>
            </div>

            {viewTab === 'matrix' && comparisonPapers.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="bg-white hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-3 py-1.5 rounded-sm flex items-center gap-1.5 transition cursor-pointer"
                  title="Export comparison matrix as CSV table"
                >
                  <Download className="w-3.5 h-3.5 text-blue-700" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveMatrix(false)}
                  disabled={saving}
                  className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-3 py-1.5 rounded-sm flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {savedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{savedSuccess ? 'Saved!' : currentMatrixId ? 'Update Matrix' : 'Save Matrix'}</span>
                </button>

                {currentMatrixId && (
                  <button
                    type="button"
                    onClick={() => handleSaveMatrix(true)}
                    disabled={saving}
                    className="bg-white hover:bg-[#FAF9F5] border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1.5 rounded-sm transition cursor-pointer"
                    title="Save copy as new matrix"
                  >
                    Save Copy
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClear}
                  className="text-red-700 hover:underline px-2 py-1 cursor-pointer"
                >
                  Clear All
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="text-[#737067] hover:text-[#1C1B18] cursor-pointer ml-2"
            >
              [✕ CLOSE]
            </button>
          </div>
        </div>

        {/* View 1: Saved Matrices List Flow */}
        {viewTab === 'saved' ? (
          <div className="flex-1 overflow-auto my-3 border border-[#E2DFD8] rounded-sm p-4 bg-[#FAF9F5]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-title text-base text-[#1C1B18]">
                Your Saved Literature Review Matrices ({savedMatrices.length})
              </h3>
              <button
                onClick={() => setViewTab('matrix')}
                className="bg-[#1C1B18] text-white text-xs px-3 py-1.5 rounded-sm font-mono-meta flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Create / Return to Active
              </button>
            </div>

            {loadingSaved ? (
              <div className="p-8 text-center text-xs font-mono-meta text-[#737067]">
                Loading saved comparison matrices...
              </div>
            ) : savedMatrices.length === 0 ? (
              <div className="p-12 text-center text-xs font-mono-meta text-[#737067] space-y-2">
                <FolderOpen className="w-8 h-8 mx-auto text-[#8C887E] opacity-60" />
                <p className="font-medium text-[#1C1B18]">No saved comparison matrices yet.</p>
                <p className="text-[11px]">Synthesize papers in the Active Matrix tab and click "Save Matrix" to preserve your literature notes.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {savedMatrices.map((matrix) => (
                  <div
                    key={matrix._id}
                    className="p-4 bg-white border border-[#D5D1C7] rounded-sm flex flex-col justify-between space-y-3 hover:border-[#1C1B18] transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-serif-title text-base text-[#1C1B18] line-clamp-1">{matrix.title}</h4>
                        <span className="text-[10px] font-mono-meta bg-purple-50 text-purple-900 border border-purple-200 px-1.5 py-0.5 rounded-xs shrink-0 font-bold">
                          {matrix.paperIds?.length || 0} papers
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-meta text-[#737067] flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>Last modified: {new Date(matrix.updatedAt || matrix.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#EAE7DF] pt-2 text-xs font-mono-meta">
                      <button
                        onClick={() => handleReopenMatrix(matrix)}
                        className="bg-[#1C1B18] text-white hover:bg-[#2E2C28] px-3 py-1 rounded-sm flex items-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" /> Reopen & Edit
                      </button>

                      <button
                        onClick={() => handleDeleteMatrix(matrix._id, matrix.title)}
                        className="text-red-700 hover:text-red-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* View 2: Active Matrix Table Flow */
          <>
            {/* Matrix Title Input */}
            <div className="py-2 flex items-center gap-3">
              <label className="text-xs font-mono-meta text-[#737067] uppercase font-bold shrink-0">
                Synthesis Topic:
              </label>
              <input
                type="text"
                value={matrixTitle}
                onChange={(e) => setMatrixTitle(e.target.value)}
                className="flex-1 bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1 text-xs text-[#1C1B18] rounded-sm font-sans focus:outline-none focus:border-[#1C1B18]"
                placeholder="e.g. Deep Learning Approaches for Climate Prediction Benchmarks"
              />
            </div>

            {/* Matrix Table Area */}
            <div className="flex-1 overflow-auto border border-[#E2DFD8] rounded-sm my-2 bg-white">
              {comparisonPapers.length === 0 ? (
                <div className="p-16 text-center text-xs font-mono-meta text-[#737067] space-y-2">
                  <Scale className="w-8 h-8 mx-auto text-[#8C887E] opacity-60" />
                  <p className="font-medium text-[#1C1B18]">No publications selected for comparison.</p>
                  <p className="text-[11px] max-w-md mx-auto">
                    Click <strong>"Compare"</strong> on any thesis or research paper in the discovery catalog to add up to 5 papers side-by-side, or load a saved matrix from the <strong>Saved</strong> tab above.
                  </p>
                </div>
              ) : (
                <table className="w-full border-collapse text-xs text-left">
                  <thead>
                    <tr className="bg-[#FAF9F5] border-b border-[#E2DFD8]">
                      <th className="p-3 font-mono-meta font-bold uppercase text-[#605D55] text-[11px] w-48 border-r border-[#E2DFD8] sticky left-0 bg-[#FAF9F5] z-10">
                        Criterion
                      </th>
                      {comparisonPapers.map((paper) => {
                        const pId = paper._id || paper.id || paper.paperId;
                        return (
                          <th key={pId} className="p-3 font-serif-title font-normal text-base text-[#1C1B18] min-w-[240px] max-w-[320px] border-r border-[#E2DFD8] last:border-r-0 relative align-top">
                            <div className="pr-6">
                              <div className="line-clamp-2 leading-snug">{paper.title}</div>
                              <div className="text-[10px] font-mono-meta text-[#737067] font-normal mt-1">
                                {paper.publishedYear || paper.year || 'N/A'} • {paper.publicationType || paper.degreeType || 'Article'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemovePaper && onRemovePaper(pId)}
                              className="absolute top-3 right-2 text-[#8C887E] hover:text-red-700 p-0.5 cursor-pointer"
                              title="Remove from comparison"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2DFD8] text-xs">
                    {/* 1. Authors & Institution */}
                    <tr>
                      <td className="p-3 font-mono-meta font-bold text-[#605D55] text-[11px] border-r border-[#E2DFD8] bg-[#FAF9F5] sticky left-0 z-10">
                        Primary Authors
                      </td>
                      {comparisonPapers.map((paper) => (
                        <td key={paper._id || paper.id || paper.paperId} className="p-3 border-r border-[#E2DFD8] last:border-r-0 text-[#1C1B18]">
                          {paper.author || (Array.isArray(paper.authors) ? paper.authors.map(a => a.name).join(', ') : 'Unspecified')}
                        </td>
                      ))}
                    </tr>

                    {/* 2. Venue / Publisher / Institution */}
                    <tr>
                      <td className="p-3 font-mono-meta font-bold text-[#605D55] text-[11px] border-r border-[#E2DFD8] bg-[#FAF9F5] sticky left-0 z-10">
                        Venue / Institution
                      </td>
                      {comparisonPapers.map((paper) => (
                        <td key={paper._id || paper.id || paper.paperId} className="p-3 border-r border-[#E2DFD8] last:border-r-0 text-[#524F47]">
                          {paper.venue || paper.publisher || paper.university || 'Scholarly Repository'}
                        </td>
                      ))}
                    </tr>

                    {/* 3. Methodological Approach */}
                    <tr>
                      <td className="p-3 font-mono-meta font-bold text-[#605D55] text-[11px] border-r border-[#E2DFD8] bg-[#FAF9F5] sticky left-0 z-10">
                        Methodological Approach
                      </td>
                      {comparisonPapers.map((paper) => {
                        const pId = paper._id || paper.id || paper.paperId;
                        const key = `${pId}_methodology`;
                        return (
                          <td key={pId} className="p-3 border-r border-[#E2DFD8] last:border-r-0">
                            <textarea
                              rows="3"
                              value={editableNotes[key] !== undefined ? editableNotes[key] : (paper.abstract ? paper.abstract.slice(0, 150) + '...' : '')}
                              onChange={(e) => handleNoteChange(pId, 'methodology', e.target.value)}
                              placeholder="Synthesize methodology (e.g. Quasi-experiment, Transformer, LSTM, Case study)..."
                              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] p-2 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono-meta"
                            ></textarea>
                          </td>
                        );
                      })}
                    </tr>

                    {/* 4. Empirical Dataset / Benchmark */}
                    <tr>
                      <td className="p-3 font-mono-meta font-bold text-[#605D55] text-[11px] border-r border-[#E2DFD8] bg-[#FAF9F5] sticky left-0 z-10">
                        Empirical Dataset / Benchmark
                      </td>
                      {comparisonPapers.map((paper) => {
                        const pId = paper._id || paper.id || paper.paperId;
                        const key = `${pId}_dataset`;
                        return (
                          <td key={pId} className="p-3 border-r border-[#E2DFD8] last:border-r-0">
                            {paper.datasetUrl && (
                              <div className="mb-1 text-[11px] text-[#2C6B3F] font-mono-meta font-bold">
                                ✓ Raw Dataset Available ({paper.datasetFormat || 'CSV'})
                              </div>
                            )}
                            <textarea
                              rows="2"
                              value={editableNotes[key] || ''}
                              onChange={(e) => handleNoteChange(pId, 'dataset', e.target.value)}
                              placeholder="Enter dataset details, sample size (N), or evaluation benchmarks..."
                              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] p-2 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono-meta"
                            ></textarea>
                          </td>
                        );
                      })}
                    </tr>

                    {/* 5. Key Findings & Contributions */}
                    <tr>
                      <td className="p-3 font-mono-meta font-bold text-[#605D55] text-[11px] border-r border-[#E2DFD8] bg-[#FAF9F5] sticky left-0 z-10">
                        Key Findings & Contributions
                      </td>
                      {comparisonPapers.map((paper) => {
                        const pId = paper._id || paper.id || paper.paperId;
                        const key = `${pId}_findings`;
                        return (
                          <td key={pId} className="p-3 border-r border-[#E2DFD8] last:border-r-0">
                            <textarea
                              rows="3"
                              value={editableNotes[key] || ''}
                              onChange={(e) => handleNoteChange(pId, 'findings', e.target.value)}
                              placeholder="Synthesize empirical findings, accuracy scores, or theoretical contributions..."
                              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] p-2 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono-meta"
                            ></textarea>
                          </td>
                        );
                      })}
                    </tr>

                    {/* 6. Limitations & Gaps */}
                    <tr>
                      <td className="p-3 font-mono-meta font-bold text-[#605D55] text-[11px] border-r border-[#E2DFD8] bg-[#FAF9F5] sticky left-0 z-10">
                        Limitations & Research Gaps
                      </td>
                      {comparisonPapers.map((paper) => {
                        const pId = paper._id || paper.id || paper.paperId;
                        const key = `${pId}_limitations`;
                        return (
                          <td key={pId} className="p-3 border-r border-[#E2DFD8] last:border-r-0">
                            <textarea
                              rows="3"
                              value={editableNotes[key] || ''}
                              onChange={(e) => handleNoteChange(pId, 'limitations', e.target.value)}
                              placeholder="Note study limitations, computational constraints, or avenues for thesis extension..."
                              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] p-2 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono-meta"
                            ></textarea>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
