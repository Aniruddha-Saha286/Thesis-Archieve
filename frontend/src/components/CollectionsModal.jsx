import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Folder, Plus, Download, FileText, Check, Trash2, ArrowRight } from 'lucide-react';

export default function CollectionsModal({ isOpen, onClose }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchCollections();
    }
  }, [isOpen]);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/user/collections');
      setCollections(res.data || []);
      if (res.data?.length > 0 && !selectedCollection) {
        setSelectedCollection(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to load collections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollection = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setCreating(true);
      const res = await axios.post('/api/user/collections', {
        name: name.trim(),
        description: description.trim(),
      });
      const newColl = res.data.collection;
      setCollections((prev) => [...prev, newColl]);
      setSelectedCollection(newColl);
      setName('');
      setDescription('');
      setShowCreateForm(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create collection.');
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async (collectionId, format = 'bibtex') => {
    try {
      const res = await axios.get(`/api/user/collections/${collectionId}/export`, {
        params: { format },
        responseType: 'blob',
      });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `collection_${collectionId}.${format === 'ris' ? 'ris' : 'bib'}`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export collection citations.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-blue-700" />
            <div>
              <h2 className="text-xl font-serif-title text-[#1C1B18]">Research Collections & Bibliographies</h2>
              <span className="text-xs font-mono-meta text-[#737067]">
                Organize publications by chapter or thesis theme with batch BibTeX/RIS export
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

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
          
          {/* Left Column: Collections List & New Button */}
          <div className="border-r border-[#E2DFD8] pr-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono-meta uppercase tracking-wider font-bold text-[#605D55]">
                My Collections ({collections.length})
              </span>
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="bg-[#1C1B18] text-white p-1 rounded-xs hover:bg-[#2E2C28] transition cursor-pointer"
                title="Create new collection"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="text-xs font-mono-meta text-[#737067] py-6 text-center">Loading collections...</div>
            ) : collections.length === 0 ? (
              <div className="text-xs font-mono-meta text-[#737067] p-3 bg-[#FAF9F5] border border-dashed border-[#D5D1C7] text-center rounded-sm">
                No collections created yet.
              </div>
            ) : (
              <div className="space-y-1">
                {collections.map((coll) => {
                  const isSelected = selectedCollection?._id === coll._id;
                  return (
                    <button
                      key={coll._id}
                      type="button"
                      onClick={() => setSelectedCollection(coll)}
                      className={`w-full text-left p-2.5 rounded-sm transition flex items-center justify-between text-xs cursor-pointer ${
                        isSelected
                          ? 'bg-[#1C1B18] text-white font-bold'
                          : 'bg-[#FAF9F5] hover:bg-[#F2EFE8] text-[#1C1B18] border border-[#E5E2DA]'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="truncate">{coll.name}</div>
                        <div className={`text-[10px] font-mono-meta ${isSelected ? 'text-neutral-300' : 'text-[#8C887E]'}`}>
                          {coll.paperIds?.length || 0} papers
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Collection Details / New Form */}
          <div className="md:col-span-2 space-y-4">
            {showCreateForm ? (
              <form onSubmit={handleCreateCollection} className="p-4 bg-[#FAF9F5] border border-[#D5D1C7] rounded-sm space-y-3 text-xs">
                <div className="font-bold text-[#1C1B18] font-mono-meta text-xs uppercase tracking-wider">
                  Create New Research Collection
                </div>
                <div>
                  <label className="block font-medium text-[#1C1B18] mb-1">Collection Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Chapter 2: Literature Review, Benchmark Datasets..."
                    className="w-full bg-white border border-[#D5D1C7] px-3 py-1.5 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#1C1B18] mb-1">Description / Topic Scope (optional)</label>
                  <textarea
                    rows="2"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe purpose of this collection or thesis chapter inquiry..."
                    className="w-full bg-white border border-[#D5D1C7] px-3 py-1.5 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                  ></textarea>
                </div>
                <div className="flex items-center justify-end gap-2 font-mono-meta text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-3 py-1.5 border border-[#D5D1C7] text-[#737067] rounded-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="bg-[#1C1B18] text-white px-4 py-1.5 rounded-sm transition cursor-pointer disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create Collection'}
                  </button>
                </div>
              </form>
            ) : selectedCollection ? (
              <div className="space-y-4">
                <div className="p-4 bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-serif-title text-[#1C1B18]">
                        {selectedCollection.name}
                      </h3>
                      {selectedCollection.description && (
                        <p className="text-xs text-[#605D55] mt-0.5">
                          {selectedCollection.description}
                        </p>
                      )}
                    </div>
                    <div className="text-[11px] font-mono-meta text-[#737067] shrink-0">
                      {selectedCollection.paperIds?.length || 0} papers
                    </div>
                  </div>

                  {/* Batch Export Buttons */}
                  <div className="pt-2 border-t border-[#E5E2DA] flex items-center gap-2 flex-wrap font-mono-meta text-xs">
                    <span className="text-[10px] uppercase font-bold text-[#737067]">Batch Export:</span>
                    <button
                      type="button"
                      onClick={() => handleExport(selectedCollection._id, 'bibtex')}
                      className="bg-white hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1 rounded-sm flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Download complete bibliography as BibTeX"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-700" />
                      <span>Export BibTeX (.bib)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExport(selectedCollection._id, 'ris')}
                      className="bg-white hover:bg-[#F2EFE8] border border-[#D5D1C7] text-[#1C1B18] px-2.5 py-1 rounded-sm flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Download complete bibliography as RIS"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Export RIS (.ris)</span>
                    </button>
                  </div>
                </div>

                {/* Papers in Collection */}
                <div>
                  <div className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#605D55] mb-2">
                    Included Papers ({selectedCollection.paperIds?.length || 0})
                  </div>
                  {(!selectedCollection.paperIds || selectedCollection.paperIds.length === 0) ? (
                    <div className="p-4 bg-white border border-dashed border-[#D5D1C7] text-center text-xs font-mono-meta text-[#737067] rounded-sm">
                      No papers added to this collection yet. You can assign papers from your Saved Papers or discovery search results.
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {selectedCollection.paperIds.map((pId, idx) => (
                        <div key={idx} className="p-2.5 bg-white border border-[#E5E2DA] rounded-sm font-mono-meta flex items-center justify-between">
                          <span className="truncate mr-2 font-medium text-[#1C1B18]">Paper Ref: {pId}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs font-mono-meta text-[#737067] p-8 text-center bg-[#FAF9F5] border border-dashed border-[#D5D1C7] rounded-sm">
                Select a collection from the list or create a new one.
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#E2DFD8] flex items-center justify-end">
          <button
            onClick={onClose}
            className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-1.5 rounded-sm text-xs font-mono-meta transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
