import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, AlertCircle, ShieldCheck, Upload, CheckCircle, FileText, X, Sun, Moon } from 'lucide-react';
import axios from 'axios';

export default function StudentRegistrationView() {
  const { user, refreshUser, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    university: '',
    studentId: '',
    degreeProgram: 'B.Sc. Undergraduate Thesis',
    researchDomain: 'Renewable Energy & Materials',
    thesisGoal: '',
  });

  const [hasUploadedDocument, setHasUploadedDocument] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10 MB maximum limit.');
      return;
    }

    // Local instant preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    setError('');

    const uploadData = new FormData();
    uploadData.append('idCard', file);

    try {
      const res = await axios.post('/api/upload/id-card', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.hasVerificationDocument) {
        setHasUploadedDocument(true);
        setUploadSuccess(true);
      }
    } catch (err) {
      console.error('Upload error:', err);
      // FAILS CLOSED: Never treat local blob: as completed server upload
      setHasUploadedDocument(false);
      setUploadSuccess(false);
      setError(
        err.response?.data?.message ||
        'Identity document upload failed. Only JPEG, PNG, WebP, and PDF documents are accepted.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = async () => {
    try {
      setUploading(true);
      await axios.delete('/api/upload/id-card');
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl('');
      setHasUploadedDocument(false);
      setUploadSuccess(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove document from server. Please retry.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post('/api/auth/complete-profile', formData);
      await refreshUser();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit student registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-neutral-950 text-[#1C1B18] dark:text-neutral-100 flex flex-col justify-between p-6 transition-colors">
      
      {/* Top Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#E2DFD8] dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] dark:bg-neutral-100 text-[#FAF9F5] dark:text-neutral-950 flex items-center justify-center font-serif-title text-xl font-normal">
            §
          </div>
          <div>
            <span className="font-serif-title text-xl tracking-tight text-[#1C1B18] dark:text-neutral-100 block leading-none">
              The Thesis Archive
            </span>
            <span className="text-[10px] font-mono-meta text-[#737067] dark:text-neutral-400 uppercase tracking-wider">
              Student Registration Gateway
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-sm border border-[#D5D1C7] dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[#5C5950] dark:text-neutral-200 hover:text-[#1C1B18] dark:hover:text-white transition cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-neutral-600" />}
          </button>

          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs font-mono-meta text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>[SIGN OUT]</span>
          </button>
        </div>
      </header>

      {/* Main Registration Form */}
      <main className="max-w-xl mx-auto w-full my-auto py-10">
        <div className="bg-white dark:bg-neutral-900 border border-[#E2DFD8] dark:border-neutral-800 p-8 rounded-sm shadow-sm space-y-5">
          
          <div className="pb-3 border-b border-[#E5E2DA] dark:border-neutral-800">
            <span className="text-[10px] font-mono-meta text-[#2C6B3F] dark:text-emerald-400 uppercase tracking-wider font-semibold block flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Authenticated Identity: {user?.email}
            </span>
            <h2 className="text-2xl font-serif-title font-normal text-[#1C1B18] dark:text-neutral-100 mt-1">
              Scholarly Credentials Verification
            </h2>
            <p className="text-xs text-[#737067] dark:text-neutral-400 mt-0.5">
              Please register your academic program and university affiliation to request editorial verification.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono-meta">
            
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Full Legal Name *</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Aniruddha Saha"
                className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">University / Institute *</label>
                <input
                  type="text"
                  name="university"
                  required
                  value={formData.university}
                  onChange={handleChange}
                  placeholder="e.g. University of Dhaka"
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Student / Registration ID *</label>
                <input
                  type="text"
                  name="studentId"
                  required
                  value={formData.studentId}
                  onChange={handleChange}
                  placeholder="e.g. 2020-832-114"
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Degree Program *</label>
                <select
                  name="degreeProgram"
                  value={formData.degreeProgram}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                >
                  <option>B.Sc. Undergraduate Thesis</option>
                  <option>M.Sc. Postgraduate Thesis</option>
                  <option>M.Phil. Research</option>
                  <option>Ph.D. Doctoral Dissertation</option>
                  <option>Faculty / Institutional Researcher</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Primary Research Domain *</label>
                <select
                  name="researchDomain"
                  value={formData.researchDomain}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
                >
                  <option>Computer Science & NLP</option>
                  <option>Biomedical & Clinical Science</option>
                  <option>Agricultural Systems & Soil</option>
                  <option>Development Economics</option>
                  <option>Other Disciplines</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">Thesis Working Title or Research Inquiry *</label>
              <textarea
                name="thesisGoal"
                rows="2"
                required
                value={formData.thesisGoal}
                onChange={handleChange}
                placeholder="Describe your thesis inquiry or datasets you need..."
                className="w-full bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 px-3 py-2 text-[#1C1B18] dark:text-neutral-100 rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              ></textarea>
            </div>

            {/* Student ID Card Document Upload */}
            <div>
              <label className="block font-medium text-[#1C1B18] dark:text-neutral-200 mb-1">
                Upload Student ID Card / Proof (JPEG, PNG, WebP, or PDF — Max 10MB)
              </label>

              {hasUploadedDocument ? (
                <div className="bg-[#FAF9F5] dark:bg-neutral-800 border border-[#D5D1C7] dark:border-neutral-700 p-3 rounded-sm flex items-center justify-between">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="ID Preview"
                        className="w-12 h-12 object-cover rounded-sm border border-[#D5D1C7] dark:border-neutral-700"
                      />
                    ) : (
                      <FileText className="w-6 h-6 text-[#2C6B3F] dark:text-emerald-400" />
                    )}
                    <div className="truncate">
                      <div className="flex items-center gap-1 text-[#2C6B3F] dark:text-emerald-400 font-bold text-[11px]">
                        <CheckCircle className="w-3.5 h-3.5" /> ID Uploaded Securely
                      </div>
                      <div className="text-[10px] text-[#737067] dark:text-neutral-400">
                        Verified asset stored privately for depository moderation.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={uploading}
                    className="text-[#737067] dark:text-neutral-400 hover:text-red-700 dark:hover:text-red-400 p-1 cursor-pointer disabled:opacity-50"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-[#D5D1C7] dark:border-neutral-700 hover:border-[#1C1B18] dark:hover:border-neutral-400 bg-[#FAF9F5] dark:bg-neutral-800/40 rounded-sm p-4 text-center block cursor-pointer transition">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <Upload className={`w-5 h-5 ${uploading ? 'animate-bounce text-amber-600 dark:text-amber-400' : 'text-[#737067] dark:text-neutral-400'}`} />
                    <span className="font-medium text-[#1C1B18] dark:text-neutral-200">
                      {uploading ? 'Uploading to private storage...' : 'Click or drag student ID card to upload'}
                    </span>
                    <span className="text-[10px] text-[#737067] dark:text-neutral-400">
                      JPEG, PNG, WebP, or PDF (Maximum 10 MB)
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Privacy & Evaluation Note */}
            <div className="p-3 bg-[#FAF9F5] dark:bg-neutral-800/60 border border-[#E2DFD8] dark:border-neutral-700/80 rounded-sm text-[11px] font-mono-meta text-[#605D55] dark:text-neutral-400 space-y-1">
              <span className="font-semibold text-[#1C1B18] dark:text-neutral-200 block uppercase tracking-wider text-[10px]">
                Identity Verification Notice
              </span>
              <p className="leading-relaxed">
                Your submitted credentials and identification documents are inspected strictly by authorized depository staff through short-lived access. Identification assets are never made publicly available.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full bg-[#1C1B18] hover:bg-[#2C2A24] dark:bg-amber-500 dark:hover:bg-amber-400 text-[#FAF9F5] dark:text-neutral-950 py-2.5 rounded-sm transition font-semibold cursor-pointer disabled:opacity-50 text-xs"
              >
                {loading ? 'Submitting Application...' : 'Submit Academic Verification Request'}
              </button>
            </div>

          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] dark:border-neutral-800 text-center text-xs font-mono-meta text-[#737067] dark:text-neutral-500">
        Prepared and Developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
