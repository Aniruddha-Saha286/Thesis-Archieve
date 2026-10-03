import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, RefreshCw, AlertCircle, ExternalLink, FileText, Shield } from 'lucide-react';

export default function DocumentViewerModal({ isOpen, onClose, studentId, studentName }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [expiresIn, setExpiresIn] = useState(600);

  const fetchSignedDocument = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get(`/api/admin/students/${studentId}/document`);
      setDocumentUrl(res.data.documentUrl);
      setExpiresIn(res.data.expiresInSeconds || 600);
    } catch (err) {
      console.error('Error loading signed document:', err);
      setError(
        err.response?.data?.message ||
        'Failed to load verification document. The URL may have expired or access was denied.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && studentId) {
      fetchSignedDocument();
    } else {
      setDocumentUrl('');
      setError('');
    }
  }, [isOpen, studentId]);

  if (!isOpen) return null;

  const isPdf = Boolean(documentUrl && (documentUrl.toLowerCase().includes('.pdf') || documentUrl.toLowerCase().includes('/raw/')));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E2DFD8] dark:border-[#2C2A26] bg-[#FAF9F5] dark:bg-[#201F1C]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                Protected Verification Document Viewer
              </h3>
              <p className="text-[10px] font-mono-meta text-[#737067] dark:text-[#9C988F]">
                Student: <strong>{studentName || 'Scholar'}</strong> • Short-lived secure access ({Math.round(expiresIn / 60)} min)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchSignedDocument}
              disabled={loading}
              className="p-1 text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer flex items-center gap-1 text-[11px] font-mono-meta"
              title="Refresh access URL"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[300px] bg-neutral-100 dark:bg-[#141412]">
          {loading ? (
            <div className="flex flex-col items-center space-y-2 font-mono-meta text-xs text-[#737067] dark:text-[#9C988F]">
              <RefreshCw className="w-6 h-6 animate-spin text-neutral-800 dark:text-neutral-300" />
              <span>Retrieving short-lived signed credential URL...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center space-y-3 max-w-md bg-white dark:bg-[#201F1C] border border-red-200 dark:border-red-800 rounded-sm">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto" />
              <div className="text-xs font-mono-meta text-red-800 dark:text-red-300 font-medium">
                {error}
              </div>
              <button
                onClick={fetchSignedDocument}
                className="bg-[#1C1B18] dark:bg-[#2C2A26] text-white px-3 py-1.5 rounded-sm text-xs font-mono-meta hover:bg-[#2C2A24] dark:hover:bg-[#383530] cursor-pointer"
              >
                Request Fresh Document URL
              </button>
            </div>
          ) : isPdf ? (
            <div className="w-full h-[600px] flex flex-col">
              <iframe
                src={documentUrl}
                title="Student Verification PDF"
                className="w-full h-full border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm bg-white"
              />
              <div className="pt-2 text-right">
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 hover:underline font-mono-meta"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in external tab</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="max-w-full max-h-[70vh] flex flex-col items-center">
              <img
                src={documentUrl}
                alt="Student Verification Document"
                className="max-w-full max-h-[65vh] object-contain border border-[#D5D1C7] dark:border-[#2C2A26] shadow-sm rounded-sm bg-white"
              />
              <div className="pt-2 w-full text-right">
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 hover:underline font-mono-meta"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open full size</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#FAF9F5] dark:bg-[#201F1C] border-t border-[#E2DFD8] dark:border-[#2C2A26] text-[10px] font-mono-meta text-[#737067] dark:text-[#9C988F] flex items-center justify-between">
          <span>Private Object Reference Protected • No Raw Storage Keys Exposed</span>
          <span>Access token strictly expires in 10 minutes</span>
        </div>

      </div>
    </div>
  );
}
