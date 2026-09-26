import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Shield, GraduationCap, Eye, EyeOff } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

export default function LoginView() {
  const { login, loginWithGoogle } = useAuth();
  
  // Tab state: 'student' or 'admin'
  const [activeTab, setActiveTab] = useState('student');

  // Admin form state (Email & password)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(adminEmail.trim(), adminPassword.trim());
    } catch (err) {
      setError(err.response?.data?.message || 'Administrative authentication failed. Unauthorized credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle({
        credential: credentialResponse.credential,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google Sign-In popup was closed or encountered a problem.');
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
              Academic Depository & Research Vault
            </span>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[#D5D1C7] bg-[#F2EFE8] text-[#5C5950] text-[11px] font-mono-meta uppercase">
          <span>University Press Depository</span>
          <span>•</span>
          <span>Verified Access Only</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full my-auto py-8">
        <div className="max-w-2xl mx-auto text-center space-y-3 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[#D5D1C7] bg-[#F2EFE8] text-[#5C5950] text-xs font-mono-meta uppercase tracking-wider">
            <span>Academic Depository</span>
            <span>•</span>
            <span>Identity Authentication Gateway</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-serif-title font-normal tracking-tight text-[#1C1B18] leading-[1.12]">
            IMPOSTERS THESIS PAPER ARCHIVE
          </h1>
        </div>

        {/* Authentication Card with Distinct Role Tabs */}
        <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-sm max-w-md mx-auto overflow-hidden">
          
          {/* Distinct Role Selection Tabs */}
          <div className="grid grid-cols-2 border-b border-[#E2DFD8] text-xs font-mono-meta">
            <button
              type="button"
              onClick={() => { setActiveTab('student'); setError(''); }}
              className={`py-3 px-4 flex items-center justify-center gap-2 border-r border-[#E2DFD8] transition cursor-pointer ${
                activeTab === 'student'
                  ? 'bg-white font-bold text-[#1C1B18] border-b-2 border-b-[#1C1B18]'
                  : 'bg-[#FAF9F5] text-[#737067] hover:text-[#1C1B18]'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Student / Scholar</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('admin'); setError(''); }}
              className={`py-3 px-4 flex items-center justify-center gap-2 transition cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-white font-bold text-amber-900 border-b-2 border-b-amber-600 bg-amber-50/30'
                  : 'bg-[#FAF9F5] text-[#737067] hover:text-amber-800'
              }`}
            >
              <Shield className="w-4 h-4 text-amber-600" />
              <span>Editorial Board</span>
            </button>
          </div>

          <div className="p-6 space-y-4 text-left">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* TAB 1: STUDENT / RESEARCHER AUTH */}
            {activeTab === 'student' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#1C1B18]">Official University Authentication</h2>
                  <p className="text-xs text-[#737067] mt-0.5 leading-relaxed">
                    Student access is exclusively authorized via Google OAuth. Please sign in with your official university G-Suite or Google account.
                  </p>
                </div>

                {/* Google Sign-In Component */}
                <div className="w-full flex justify-center py-4 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm p-4">
                  <div className="space-y-2 text-center w-full flex flex-col items-center">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={handleGoogleError}
                      theme="filled_black"
                      size="large"
                      width="320"
                      text="continue_with"
                      shape="rectangular"
                    />
                    <div className="text-[10px] font-mono-meta text-[#8C887E]">
                      Institutional G-Suite & Standard Google Accounts
                    </div>
                  </div>
                </div>

                <div className="bg-[#FAF9F5] border border-[#E5E2DA] p-3 rounded-sm space-y-1 text-xs text-[#5C5950]">
                  <div className="font-bold text-[#1C1B18] text-[10px] font-mono-meta uppercase tracking-wider">
                    Academic Repository Access:
                  </div>
                  <p className="text-[11px] text-[#737067] leading-relaxed">
                    Sign in to search federated scholarly records, open verified full-text PDFs, annotate private notes, build comparison matrices, and export citations.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: EDITORIAL BOARD / ADMIN LOGIN */}
            {activeTab === 'admin' && (
              <div className="space-y-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-mono-meta font-bold uppercase mb-1">
                    <Shield className="w-3 h-3" /> Editorial Board Gate
                  </div>
                  <h2 className="text-sm font-semibold text-[#1C1B18]">Administrative Console Login</h2>
                  <p className="text-xs text-[#737067] mt-0.5">
                    Restricted authentication for repository directors and editorial moderators.
                  </p>
                </div>

                <form onSubmit={handleAdminLogin} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[#1C1B18] font-medium mb-1">Administrator ID or Email</label>
                    <input
                      type="text"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="e.g. director@institution.edu or admin ID"
                      className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] transition font-mono-meta text-xs"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[#1C1B18] font-medium">Administrative Master Passkey</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[10px] text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer font-mono-meta"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showPassword ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#FAF9F5] border border-[#D5D1C7] px-3 py-2 text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18] transition text-xs font-mono-meta"
                      />
                    </div>
                  </div>
                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 rounded-sm transition text-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>{loading ? 'Verifying Credentials...' : 'Authenticate as Administrator'}</span>
                    </button>
                  </div>
                </form>

                <div className="p-2.5 bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm text-[11px] text-[#605D55]">
                  <p className="leading-relaxed">
                    Student Google accounts cannot acquire administrator access. Editorial board accounts are provisioned exclusively for authorized repository directors.
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] text-center text-xs font-mono-meta text-[#737067]">
        Prepared and Developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
