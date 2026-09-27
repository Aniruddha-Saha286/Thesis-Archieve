import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Shield, GraduationCap, CheckCircle2 } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

export default function LoginView() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if client ID is configured and not a placeholder
  const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleConfigured = Boolean(
    rawClientId &&
    rawClientId !== '—' &&
    !rawClientId.includes('—') &&
    rawClientId.trim().length > 5
  );

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle({
        credential: credentialResponse.credential,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'Google authentication failed. Please ensure you are using an authorized institutional or personal Google account.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google Sign-In popup was closed or encountered a communication problem.');
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
            <span>Identity Authentication Gateway</span>
            <span>•</span>
            <span>Unified Google Sign-In</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-serif-title font-normal tracking-tight text-[#1C1B18] leading-[1.12]">
            IMPOSTERS THESIS PAPER ARCHIVE
          </h1>
          <p className="text-xs md:text-sm text-[#737067] max-w-lg mx-auto leading-relaxed">
            Federated scholarly discovery, institutional theses, full-text publications, and literature research workspace.
          </p>
        </div>

        {/* Unified Authentication Card (No separate tabs or client-chosen roles) */}
        <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-sm max-w-md mx-auto overflow-hidden">
          
          <div className="p-6 space-y-5 text-left">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[#F2EFE8] text-[#5C5950] border border-[#D5D1C7] text-[10px] font-mono-meta font-bold uppercase mb-2">
                <Shield className="w-3 h-3 text-[#2C6B3F]" /> Official Single Sign-On
              </div>
              <h2 className="text-base font-serif-title font-bold text-[#1C1B18]">
                Scholarly & Administrative Sign-In
              </h2>
              <p className="text-xs text-[#737067] mt-1 leading-relaxed">
                Students, editorial moderators, and depository administrators authenticate through one verified Google identity. Roles and capabilities are authoritatively resolved by the server.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono-meta flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Google Sign-In or Configuration Warning */}
            {isGoogleConfigured ? (
              <div className="w-full flex flex-col items-center justify-center py-5 bg-[#FAF9F5] border border-[#E5E2DA] rounded-sm px-4 space-y-3">
                <div className="w-full flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    theme="filled_black"
                    size="large"
                    width="320"
                    text="continue_with"
                    shape="rectangular"
                  />
                </div>
                <div className="text-[10px] font-mono-meta text-[#8C887E] text-center">
                  Institutional G-Suite or Personal Google Accounts
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-sm space-y-2 text-xs font-mono-meta">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  Google OAuth Setup Required
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-950 font-bold">VITE_GOOGLE_CLIENT_ID</code> is currently set to placeholder <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-950 font-bold">—</code>.
                  Please update your environment configuration with a valid Google Cloud Client ID to enable sign-in.
                </p>
              </div>
            )}

            {/* Capabilities Summary */}
            <div className="bg-[#FAF9F5] border border-[#E5E2DA] p-3.5 rounded-sm space-y-2 text-xs text-[#5C5950]">
              <div className="font-bold text-[#1C1B18] text-[10px] font-mono-meta uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#2C6B3F]" />
                Automated Access Provisioning:
              </div>
              <ul className="text-[11px] text-[#737067] space-y-1 pl-4 list-disc leading-relaxed">
                <li>
                  <strong className="text-[#1C1B18]">Students:</strong> Registered with academic profile awaiting verification or continuing research library sessions.
                </li>
                <li>
                  <strong className="text-[#1C1B18]">Editors:</strong> Automatically recognized with delegated moderation capabilities.
                </li>
                <li>
                  <strong className="text-[#1C1B18]">Administrator:</strong> Primary configured depository director account provisioned with full operational privileges.
                </li>
              </ul>
            </div>

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
