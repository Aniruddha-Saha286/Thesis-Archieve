import React, { useState, useEffect } from 'react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import axios from 'axios';
import { AlertCircle, CheckCircle, X, Upload, FileText, Loader2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const FALLBACK_DISCIPLINES = [
  'Cybersecurity / Information Security',
  'Data Science / Data Analytics',
  'Artificial Intelligence and Machine Learning',
  'Natural Language Processing',
  'Computer Vision',
  'Software Engineering',
  'Computer Networks and Distributed Systems',
  'Databases and Data Management',
  'Human–Computer Interaction',
  'Internet of Things and Embedded Systems',
  'Renewable Energy & Materials',
  'Biomedical & Clinical Science',
  'Agricultural Systems & Soil',
  'Development Economics',
  'Other Disciplines / Unclassified',
];

const MAX_UPLOAD_MB = 20;

function discardUpload(storageRef) {
  if (!storageRef) return;
  axios.delete('/api/upload/thesis-pdf', { data: { storageRef } }).catch(() => {});
}

export default function ProposeThesisModal({ isOpen, onClose, onCreated, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    abstract: '',
    category: '',
    degreeType: '',
    university: '',
    department: '',
    author: '',
    advisor: '',
    publishedYear: new Date().getFullYear(),
    pdfUrl: '',
    datasetUrl: '',
    datasetSize: '',
    datasetFormat: '',
    codeUrl: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [disciplines, setDisciplines] = useState(FALLBACK_DISCIPLINES);
  const { showNotice } = useSocket();

  const closeForm = () => {
    if (uploaded) {
      discardUpload(uploaded.storageRef);
      setUploaded(null);
    }
    onClose();
  };
  useEscapeToClose(closeForm, isOpen);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    axios
      .get('/api/subjects')
      .then((res) => {
        const labels = Array.isArray(res.data) ? res.data.map((sub) => sub && sub.label).filter(Boolean) : [];
        if (!cancelled && labels.length > 0) setDisciplines(labels);
      })
      .catch(() => {
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  const handleFileChosen = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setUploadError('Please choose a PDF file.');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`This file is ${formatSize(file.size)}. The limit is ${MAX_UPLOAD_MB} MB. Compress the PDF, or paste a link instead.`);
      return;
    }
    try {
      setUploading(true);
      setUploadPercent(0);
      if (uploaded) {
        discardUpload(uploaded.storageRef);
        setUploaded(null);
      }
      const body = new FormData();
      body.append('thesisPdf', file);
      const res = await axios.post('/api/upload/thesis-pdf', body, {
        onUploadProgress: (event) => {
          if (event.total) setUploadPercent(Math.round((event.loaded / event.total) * 100));
        },
      });
      setUploaded({
        pdfUrl: res.data.pdfUrl,
        storageRef: res.data.storageRef,
        sizeBytes: res.data.sizeBytes || file.size,
        fileName: res.data.fileName || file.name,
      });
      setFormData((prev) => ({ ...prev, pdfUrl: '' }));
    } catch (err) {
      setUploadError(err.response?.data?.message || 'The file could not be uploaded. Try again, or paste a link instead.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploading) return;
    setError('');
    setLoading(true);

    try {
      const payload = uploaded
        ? { ...formData, pdfUrl: uploaded.pdfUrl, pdfStorageRef: uploaded.storageRef, pdfSizeBytes: uploaded.sizeBytes }
        : formData;
      const res = await axios.post('/api/thesis', payload);
      if (typeof onCreated === 'function') onCreated(res.data);
      if (typeof onSuccess === 'function') onSuccess(res.data);
      if (showNotice) {
        showNotice(res.data?.message || 'Thesis submitted. It will appear in search after staff review.', 'info');
      }
      setUploaded(null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'The thesis could not be submitted. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm w-full max-w-xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={closeForm}
          aria-label="Close"
          title="Close (Esc)"
          className="absolute top-3 right-3 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-sm text-[#605D55] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#F2EFE8] dark:hover:bg-[#2A2824] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4 pb-2 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
          <h3 className="text-xl font-serif-title text-[#1C1B18] dark:text-[#F0EDE6] pr-10">
            Deposit a thesis
          </h3>
          <p className="text-xs text-[#737067] dark:text-[#9C988F]">
            Add your finished thesis so the next students can find it. The team checks it before it appears in search.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-mono-meta flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Title *</label>
            <input
              type="text"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              placeholder="The full title, as on the cover page"
              className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Discipline *</label>
              <select
                name="category"
                required
                value={formData.category}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              >
                <option value="" disabled>
                  Choose the closest discipline
                </option>
                {disciplines.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Degree *</label>
              <select
                name="degreeType"
                required
                value={formData.degreeType}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              >
                <option value="" disabled>Choose…</option>
                <option>B.Sc. Thesis</option>
                <option>M.Sc. Thesis</option>
                <option>M.Phil. Thesis</option>
                <option>Ph.D. Dissertation</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">University *</label>
              <input
                type="text"
                name="university"
                required
                value={formData.university}
                onChange={handleChange}
                placeholder="e.g. University of Dhaka"
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Department *</label>
              <input
                type="text"
                name="department"
                required
                value={formData.department}
                onChange={handleChange}
                placeholder="e.g. Computer Science and Engineering"
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Author *</label>
              <input
                type="text"
                name="author"
                required
                value={formData.author}
                onChange={handleChange}
                placeholder="e.g. Rafiul Islam"
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Supervisor</label>
              <input
                type="text"
                name="advisor"
                value={formData.advisor}
                onChange={handleChange}
                placeholder="e.g. Dr. N. H. Chowdhury"
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Year</label>
              <input
                type="number"
                name="publishedYear"
                value={formData.publishedYear}
                onChange={handleChange}
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Abstract *</label>
            <textarea
              name="abstract"
              rows="3"
              required
              value={formData.abstract}
              onChange={handleChange}
              placeholder="Paste the abstract from your thesis"
              className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
            ></textarea>
          </div>

          {/* The thesis file: upload it here, or give a link to where it already is */}
          <fieldset className="border border-[#E2DFD8] dark:border-[#2C2A26] rounded-sm p-3 space-y-2.5">
            <legend className="px-1 font-medium text-[#1C1B18] dark:text-[#E8E6E1]">Thesis PDF (optional)</legend>

            {uploaded ? (
              <div className="flex items-center justify-between gap-3 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-sm" data-testid="uploaded-pdf">
                <span className="flex items-center gap-2 min-w-0 text-emerald-950 dark:text-emerald-200">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate font-medium">{uploaded.fileName}</span>
                  <span className="shrink-0 text-emerald-800 dark:text-emerald-300">· {formatSize(uploaded.sizeBytes)} · uploaded</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    discardUpload(uploaded.storageRef);
                    setUploaded(null);
                  }}
                  className="shrink-0 underline text-emerald-900 dark:text-emerald-200 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <label
                  className={`flex items-center justify-center gap-2 p-3 border border-dashed rounded-sm text-center transition ${
                    uploading
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                      : 'border-[#BDB9AF] dark:border-[#47433C] bg-[#FAF9F5] dark:bg-[#201F1C] hover:border-[#1C1B18] dark:hover:border-[#9C988F] text-[#1C1B18] dark:text-[#E8E6E1] cursor-pointer'
                  }`}
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploading ? `Uploading… ${uploadPercent}%` : `Choose a PDF from your device (up to ${MAX_UPLOAD_MB} MB)`}</span>
                  <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={uploading} onChange={handleFileChosen} aria-label="Choose the thesis PDF" />
                </label>

                {uploadError && (
                  <p role="alert" className="text-red-700 dark:text-red-300">{uploadError}</p>
                )}

                <div>
                  <label htmlFor="deposit-pdf-link" className="block text-[#605D55] dark:text-[#A8A49C] mb-1">Or paste a link to the PDF</label>
                  <input
                    id="deposit-pdf-link"
                    type="url"
                    name="pdfUrl"
                    value={formData.pdfUrl}
                    onChange={handleChange}
                    disabled={uploading}
                    placeholder="https://…"
                    className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F] text-xs"
                  />
                </div>
              </>
            )}
            <p className="text-[11px] text-[#737067] dark:text-[#9C988F]">
              With a PDF, readers can open your thesis here, and members can read its limitations and future work without leaving the site.
            </p>
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Dataset link (optional)</label>
              <input
                type="url"
                name="datasetUrl"
                value={formData.datasetUrl}
                onChange={handleChange}
                placeholder="https://zenodo.org/... or https://dataverse.harvard.edu/..."
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F] text-xs font-mono-meta"
              />
              <p className="text-[11px] text-[#737067] dark:text-[#9C988F] mt-1 font-mono-meta">
                Must be on a research data site: Zenodo, Harvard Dataverse, Dryad, Figshare, OSF, Kaggle, Hugging Face or GitHub. Links to personal drives are not accepted.
              </p>
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Dataset size</label>
              <input
                type="text"
                name="datasetSize"
                value={formData.datasetSize}
                onChange={handleChange}
                placeholder="e.g. 42 MB"
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Dataset format</label>
              <input
                type="text"
                name="datasetFormat"
                value={formData.datasetFormat}
                onChange={handleChange}
                placeholder="e.g. CSV"
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || uploading}
              className="w-full min-h-[40px] bg-[#1C1B18] dark:bg-amber-600 hover:bg-[#2E2C28] dark:hover:bg-amber-700 text-white font-semibold py-2 rounded-sm transition text-sm shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Submitting…' : uploading ? 'Waiting for the upload…' : 'Submit for review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
