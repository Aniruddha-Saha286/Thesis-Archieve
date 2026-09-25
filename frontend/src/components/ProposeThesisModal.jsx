import React, { useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function ProposeThesisModal({ isOpen, onClose, onCreated }) {
  const [formData, setFormData] = useState({
    title: '',
    abstract: '',
    category: 'Renewable Energy & Materials',
    degreeType: 'M.Sc. Thesis',
    university: '',
    department: '',
    author: '',
    advisor: '',
    publishedYear: new Date().getFullYear(),
    pdfUrl: '',
    datasetUrl: '',
    datasetSize: '',
    datasetFormat: 'CSV',
    codeUrl: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post('/api/thesis', formData);
      onCreated(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deposit thesis record.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer"
        >
          [✕ CLOSE]
        </button>

        <div className="mb-4 pb-2 border-b border-[#E2DFD8]">
          <span className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider block">
            Archival Intake
          </span>
          <h3 className="text-xl font-serif-title text-[#1C1B18] mt-0.5">
            Deposit Thesis & Empirical Dataset
          </h3>
          <p className="text-xs text-[#737067] font-light">
            Share approved academic research to assist upcoming student cohorts.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-[#1C1B18] mb-1">Thesis Title *</label>
            <input
              type="text"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. Degradation Kinetics of Lead-Free Perovskite Absorbers..."
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Research Domain *</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              >
                <option>Renewable Energy & Materials</option>
                <option>Computer Science & NLP</option>
                <option>Biomedical & Clinical Science</option>
                <option>Agricultural Systems & Soil</option>
                <option>Development Economics</option>
                <option>Other Disciplines</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Degree Level *</label>
              <select
                name="degreeType"
                value={formData.degreeType}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              >
                <option>B.Sc. Capstone</option>
                <option>M.Sc. Thesis</option>
                <option>M.Phil Researcher</option>
                <option>Ph.D. Dissertation</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">University / Institute *</label>
              <input
                type="text"
                name="university"
                required
                value={formData.university}
                onChange={handleChange}
                placeholder="e.g. University of Dhaka"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Department / Faculty *</label>
              <input
                type="text"
                name="department"
                required
                value={formData.department}
                onChange={handleChange}
                placeholder="e.g. Computer Science & Eng."
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Author / Researcher *</label>
              <input
                type="text"
                name="author"
                required
                value={formData.author}
                onChange={handleChange}
                placeholder="e.g. Rafiul Islam"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Faculty Advisor</label>
              <input
                type="text"
                name="advisor"
                value={formData.advisor}
                onChange={handleChange}
                placeholder="e.g. Dr. N. H. Chowdhury"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Year</label>
              <input
                type="number"
                name="publishedYear"
                value={formData.publishedYear}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#1C1B18] mb-1">Abstract Summary *</label>
            <textarea
              name="abstract"
              rows="3"
              required
              value={formData.abstract}
              onChange={handleChange}
              placeholder="Provide background, methodology, experimental setup, and main findings..."
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
            ></textarea>
          </div>

          <div>
            <label className="block font-medium text-[#1C1B18] mb-1">Direct PDF Document URL (Optional)</label>
            <input
              type="url"
              name="pdfUrl"
              value={formData.pdfUrl}
              onChange={handleChange}
              placeholder="e.g. https://arxiv.org/pdf/2301.12345.pdf or https://zenodo.org/records/.../files/manuscript.pdf"
              className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] text-xs font-mono-meta"
            />
            <p className="text-[10px] text-[#737067] mt-1 font-mono-meta">
              Direct URL to full manuscript. If left blank, users can search full-text citations via Google Scholar & Semantic Scholar mirrors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Dataset Repository URL (Optional)</label>
              <input
                type="url"
                name="datasetUrl"
                value={formData.datasetUrl}
                onChange={handleChange}
                placeholder="https://zenodo.org/... or https://dataverse.harvard.edu/..."
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] text-xs font-mono-meta"
              />
              <p className="text-[10px] text-[#737067] mt-1 font-mono-meta">
                Approved scholarly repositories only (Zenodo, Harvard Dataverse, Dryad, Figshare, OSF, Hugging Face). Arbitrary cloud drives are rejected.
              </p>
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Dataset Size</label>
              <input
                type="text"
                name="datasetSize"
                value={formData.datasetSize}
                onChange={handleChange}
                placeholder="e.g. 42 MB"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Dataset Format</label>
              <input
                type="text"
                name="datasetFormat"
                value={formData.datasetFormat}
                onChange={handleChange}
                placeholder="CSV / Parquet / HDF5"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-1.5 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1C1B18] hover:bg-[#2E2C28] text-white font-medium py-2 rounded-sm transition text-xs shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Depositing Document...' : 'Index Thesis to Archive'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
