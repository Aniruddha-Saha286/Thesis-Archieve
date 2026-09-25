import React, { useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle, Send, X } from 'lucide-react';

export default function ReportIssueModal({ thesis, onClose }) {
  const [issueType, setIssueType] = useState('broken_pdf');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!thesis) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await axios.post(`/api/thesis/${thesis._id || thesis.id}/report`, {
        issueType,
        description,
        title: thesis.title,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer"
        >
          [✕ CLOSE]
        </button>

        <div className="mb-4 pb-2 border-b border-[#E2DFD8]">
          <span className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider block">
            Archival Integrity
          </span>
          <h3 className="text-lg font-serif-title text-[#1C1B18] mt-0.5">
            Report Record or Broken Link
          </h3>
          <p className="text-xs text-[#737067] font-light line-clamp-1 mt-0.5">
            {thesis.title}
          </p>
        </div>

        {success ? (
          <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-sm text-xs font-mono-meta flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Thank you! Your issue report has been transmitted to repository maintainers.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-sans">
            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta">
                {error}
              </div>
            )}

            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Issue Category *</label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] font-mono-meta text-xs"
              >
                <option value="broken_pdf">Broken PDF link (HTTP 403, 404, or blocked)</option>
                <option value="paywall">Link requires paywall subscription</option>
                <option value="wrong_title">Title or author metadata incorrect</option>
                <option value="retracted">Paper has been retracted or disputed</option>
                <option value="other">Other scholarly record issue</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Details / Suggested Direct Link (optional)</label>
              <textarea
                rows="3"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide any details, working direct URL, or retraction notice..."
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] text-xs font-mono-meta"
              ></textarea>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 font-mono-meta text-xs">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-[#D5D1C7] text-[#737067] hover:text-[#1C1B18] rounded-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-1.5 rounded-sm flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Submitting...' : 'Submit Report'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
