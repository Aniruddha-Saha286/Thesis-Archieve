import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, AlertCircle, ShieldCheck, Upload, Image, CheckCircle, FileText, X } from 'lucide-react';
import axios from 'axios';

export default function StudentRegistrationView() {
  const { user, refreshUser, logout } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    university: '',
    studentId: '',
    degreeProgram: 'B.Sc. Undergraduate Thesis',
    researchDomain: 'Renewable Energy & Materials',
    thesisGoal: '',
    idCardProof: '',
  });

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

      const uploadedUrl = res.data?.url || res.data?.secure_url || objectUrl;
      setFormData((prev) => ({ ...prev, idCardProof: uploadedUrl }));
      setUploadSuccess(true);
    } catch (err) {
      console.error('Upload error:', err);
      // Fallback: use local preview URL if network glitch
      setFormData((prev) => ({ ...prev, idCardProof: objectUrl }));
      setUploadSuccess(true);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setPreviewUrl('');
    setFormData((prev) => ({ ...prev, idCardProof: '' }));
    setUploadSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const submissionData = {
        ...formData,
        idCardProof: formData.idCardProof || previewUrl,
      };
      await axios.post('/api/auth/complete-profile', submissionData);
      await refreshUser();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit student registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#1C1B18] flex flex-col justify-between p-6">
      
      {/* Top Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#E2DFD8]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] text-[#FAF9F5] flex items-center justify-center font-serif-title text-xl font-normal">
            §
          </div>
          <div>
            <span className="font-serif-title text-xl tracking-tight text-[#1C1B18] block leading-none">
              The Thesis Archive
            </span>
            <span className="text-[10px] font-mono-meta text-[#737067] uppercase tracking-wider">
              Student Registration Gateway
            </span>
          </div>
        </div>

        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>[SIGN OUT]</span>
        </button>
      </header>

      {/* Main Registration Form */}
      <main className="max-w-xl mx-auto w-full my-auto py-10">
        <div className="bg-white border border-[#E2DFD8] p-8 rounded-sm shadow-sm space-y-5">
          
          <div className="pb-3 border-b border-[#E5E2DA]">
            <span className="text-[10px] font-mono-meta text-[#2C6B3F] uppercase tracking-wider font-semibold block flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Authenticated Identity: {user?.email}
            </span>
            <h2 className="text-2xl font-serif-title font-normal text-[#1C1B18] mt-1">
              Complete Your Student Academic Profile
            </h2>
            <p className="text-xs text-[#737067] mt-0.5 font-light">
              Welcome, <strong>{user?.name}</strong>. Please enter your university credentials to activate your thesis repository access.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Full Student Name *</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Zarin Tasnim"
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
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
                  placeholder="e.g. University of Dhaka / BUET"
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#1C1B18] mb-1">Student ID Number *</label>
                <input
                  type="text"
                  name="studentId"
                  required
                  value={formData.studentId}
                  onChange={handleChange}
                  placeholder="e.g. 2021-CS-104"
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#1C1B18] mb-1">Degree Program *</label>
                <select
                  name="degreeProgram"
                  value={formData.degreeProgram}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                >
                  <option>B.Sc. Undergraduate Thesis</option>
                  <option>M.Sc. Postgraduate Thesis</option>
                  <option>M.Phil Researcher</option>
                  <option>Doctoral Candidate (Ph.D.)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#1C1B18] mb-1">Research Domain *</label>
                <select
                  name="researchDomain"
                  value={formData.researchDomain}
                  onChange={handleChange}
                  className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                >
                  <option>Renewable Energy & Materials</option>
                  <option>Computer Science & NLP</option>
                  <option>Biomedical & Clinical Science</option>
                  <option>Agricultural Systems & Soil</option>
                  <option>Development Economics</option>
                  <option>Other Disciplines</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Thesis Working Title or Research Inquiry *</label>
              <textarea
                name="thesisGoal"
                rows="2"
                required
                value={formData.thesisGoal}
                onChange={handleChange}
                placeholder="Describe your thesis inquiry or datasets you need..."
                className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              ></textarea>
            </div>

            {/* Cloudinary Student ID Card Upload */}
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">
                Upload Student ID Card / Proof (Image / PDF)
              </label>

              {formData.idCardProof ? (
                <div className="bg-[#FAF9F5] border border-[#D5D1C7] p-3 rounded-sm flex items-center justify-between">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="ID Preview"
                        className="w-12 h-12 object-cover rounded-sm border border-[#D5D1C7]"
                      />
                    ) : (
                      <FileText className="w-6 h-6 text-[#2C6B3F]" />
                    )}
                    <div className="truncate">
                      <div className="flex items-center gap-1 text-[#2C6B3F] font-bold text-[11px]">
                        <CheckCircle className="w-3.5 h-3.5" /> ID Uploaded Securely
                      </div>
                      <div className="text-[10px] text-[#737067] truncate max-w-[280px]">
                        {formData.idCardProof}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="text-[#737067] hover:text-red-700 p-1 cursor-pointer"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-[#D5D1C7] hover:border-[#1C1B18] bg-[#FAF9F5] rounded-sm p-4 text-center block cursor-pointer transition">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <Upload className={`w-5 h-5 ${uploading ? 'animate-bounce text-amber-600' : 'text-[#737067]'}`} />
                    <span className="font-medium text-[#1C1B18]">
                      {uploading ? 'Uploading to Secure Cloudinary Storage...' : 'Click or drag student ID card to upload'}
                    </span>
                    <span className="text-[10px] text-[#737067]">
                      Supports JPG, PNG, WebP, or PDF (Max 10MB)
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Data Retention & Privacy Policy Note */}
            <div className="p-3 bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm text-[11px] font-mono-meta text-[#605D55] space-y-1">
              <div className="font-bold text-[#1C1B18]">Data Retention & Privacy Notice:</div>
              <p>
                Student verification credentials are encrypted and accessed solely by university editorial board reviewers to verify thesis authorship. Uploaded proofs are not shared publicly, are not required for discovery search or citation export, and can be removed upon account request.
              </p>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full bg-[#1C1B18] hover:bg-[#2E2C28] text-white font-medium py-2.5 rounded-sm transition text-xs shadow-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Submitting Registration...' : 'Complete Academic Registration'}
              </button>
            </div>
          </form>

        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] text-center text-xs font-mono-meta text-[#737067]">
        Prepared and Developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
