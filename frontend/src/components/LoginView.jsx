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
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#141412] text-[#1C1B18] dark:text-[#F0EDE6] flex flex-col justify-between p-6">
      
      {/* Top Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] dark:bg-[#F0EDE6] text-[#FAF9F5] dark:text-[#141412] flex items-center justify-center font-serif-title text-xl font-normal">
            §
          </div>
          <div>
            <span className="font-serif-title text-xl tracking-tight text-[#1C1B18] dark:text-[#F0EDE6] block leading-none">
              The Thesis Archive
            </span>
            <span className="text-[10px] font-mono-meta text-[#737067] dark:text-[#9C988F] uppercase tracking-wider">
              Academic Depository & Research Vault
            </span>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[#D5D1C7] dark:border-[#383530] bg-[#F2EFE8] dark:bg-[#201F1C] text-[#5C5950] dark:text-[#B0ACA2] text-[11px] font-mono-meta uppercase">
          <span>University Press Depository</span>
          <span>•</span>
          <span>Verified Access Only</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full my-auto py-8">
        <div className="max-w-2xl mx-auto text-center space-y-3 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[#D5D1C7] dark:border-[#383530] bg-[#F2EFE8] dark:bg-[#201F1C] text-[#5C5950] dark:text-[#B0ACA2] text-xs font-mono-meta uppercase tracking-wider">
            <span>Identity Authentication Gateway</span>
            <span>•</span>
            <span>Unified Google Sign-In</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-serif-title font-normal tracking-tight text-[#1C1B18] dark:text-[#F0EDE6] leading-[1.12]">
            IMPOSTERS THESIS PAPER ARCHIVE
          </h1>
          <p className="text-xs md:text-sm text-[#737067] dark:text-[#9C988F] max-w-lg mx-auto leading-relaxed">
            Federated scholarly discovery, institutional theses, full-text publications, and literature research workspace.
          </p>
        </div>

        {/* Unified Authentication Card (No separate tabs or client-chosen roles) */}
        <div className="bg-white dark:bg-[#1A1916] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-sm shadow-sm max-w-md mx-auto overflow-hidden">
          
          <div className="p-6 space-y-5 text-left">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[#F2EFE8] dark:bg-[#201F1C] text-[#5C5950] dark:text-[#B0ACA2] border border-[#D5D1C7] dark:border-[#383530] text-[10px] font-mono-meta font-bold uppercase mb-2">
                <Shield className="w-3 h-3 text-[#2C6B3F] dark:text-emerald-400" /> Official Single Sign-On
              </div>
              <h2 className="text-base font-serif-title font-bold text-[#1C1B18] dark:text-[#F0EDE6]">
                Scholarly & Administrative Sign-In
              </h2>
              <p className="text-xs text-[#737067] dark:text-[#9C988F] mt-1 leading-relaxed">
                Students, editorial moderators, and depository administrators authenticate through one verified Google identity. Roles and capabilities are authoritatively resolved by the server.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-mono-meta flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Google Sign-In or Configuration Warning */}
            {isGoogleConfigured ? (
              <div className="w-full flex flex-col items-center justify-center py-5 bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#E5E2DA] dark:border-[#2C2A26] rounded-sm px-4 space-y-3">
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
                {loading && (
                  <div className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9C988F] text-center animate-pulse">
                    Authenticating credentials with depository server...
                  </div>
                )}
                <div className="text-[10px] font-mono-meta text-[#8C887E] dark:text-[#9C988F] text-center">
                  Institutional G-Suite or Personal Google Accounts
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 rounded-sm space-y-2 text-xs font-mono-meta">
                <div className="font-bold flex items-center gap-1.5 text-amber-950 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                  Google OAuth Setup Required
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  <code className="bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded text-amber-950 dark:text-amber-200 font-bold">VITE_GOOGLE_CLIENT_ID</code> is currently set to placeholder <code className="bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded text-amber-950 dark:text-amber-200 font-bold">—</code>.
                  Please update your environment configuration with a valid Google Cloud Client ID to enable sign-in.
                </p>
              </div>
            )}

            {/* Capabilities Summary */}
            <div className="bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#E5E2DA] dark:border-[#2C2A26] p-3.5 rounded-sm space-y-2 text-xs text-[#5C5950] dark:text-[#B0ACA2]">
              <div className="font-bold text-[#1C1B18] dark:text-[#F0EDE6] text-[10px] font-mono-meta uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#2C6B3F] dark:text-emerald-400" />
                Automated Access Provisioning:
              </div>
              <ul className="text-[11px] text-[#737067] dark:text-[#9C988F] space-y-1 pl-4 list-disc leading-relaxed">
                <li>
                  <strong className="text-[#1C1B18] dark:text-[#F0EDE6]">Students:</strong> Registered with academic profile awaiting verification or continuing research library sessions.
                </li>
                <li>
                  <strong className="text-[#1C1B18] dark:text-[#F0EDE6]">Editors:</strong> Automatically recognized with delegated moderation capabilities.
                </li>
                <li>
                  <strong className="text-[#1C1B18] dark:text-[#F0EDE6]">Administrator:</strong> Primary configured depository director account provisioned with full operational privileges.
                </li>
              </ul>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] dark:border-[#2C2A26] text-center text-xs font-mono-meta text-[#737067] dark:text-[#9C988F]">
        Prepared and Developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
