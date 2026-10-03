import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, RefreshCw, AlertOctagon, Sun, Moon } from 'lucide-react';

export default function PendingView() {
  const { user, logout, refreshUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [checking, setChecking] = useState(false);

  const isBanned = user?.status === 'banned';
  const isRejected = user?.status === 'rejected';

  const handleRefresh = async () => {
    setChecking(true);
    await refreshUser();
    setTimeout(() => setChecking(false), 600);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-neutral-950 text-[#1C1B18] dark:text-neutral-100 flex flex-col justify-between p-6 transition-colors">
      
      {/* Header */}
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
              Open Academic Depository
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

      {/* Main Notice */}
      <main className="max-w-xl mx-auto w-full my-auto py-12">
        <div className="bg-white dark:bg-neutral-900 border border-[#E2DFD8] dark:border-neutral-800 p-8 rounded-sm shadow-sm space-y-5">
          
          {isBanned ? (
            /* BANNED / SUSPENDED STATE */
            <>
              <div className="flex items-center gap-3 pb-3 border-b border-red-200 dark:border-red-900/60">
                <div className="w-8 h-8 rounded-full border border-red-600 dark:border-red-500 bg-red-50 dark:bg-red-950/60 flex items-center justify-center text-red-700 dark:text-red-400 text-xs font-mono-meta font-bold">
                  <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-red-700 dark:text-red-400 font-mono-meta">
                    [ACCESS SUSPENDED / ACCOUNT BANNED]
                  </h2>
                  <p className="text-xs text-[#737067] dark:text-neutral-400">Administrative Action Imposed</p>
                </div>
              </div>

              <p className="text-xs text-[#4A4740] dark:text-neutral-300 leading-relaxed">
                Dear <strong>{user?.name}</strong>, your access to The Thesis Archive services has been revoked by the editorial board.
              </p>

              <div className="bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 p-4 text-xs font-mono-meta space-y-1.5 text-red-900 dark:text-red-300">
                <div><span>STUDENT ID:</span> <strong>{user?.studentId || 'N/A'}</strong></div>
                <div><span>INSTITUTION:</span> {user?.university || 'University'}</div>
                <div><span>REASON:</span> <em>{user?.banReason || 'Administrative suspension'}</em></div>
                <div className="pt-1 text-[11px] text-red-700 dark:text-red-400 border-t border-red-200 dark:border-red-900/60">
                  STATUS: ACCESS TO REPOSITORY, PDFS & DATASETS HAS BEEN TERMINATED
                </div>
              </div>

              <p className="text-[11px] text-[#737067] dark:text-neutral-400 leading-relaxed">
                If you believe this action was made in error or wish to appeal your academic verification, please contact the institution administrator.
              </p>

              <div className="pt-2 border-t border-[#E2DFD8] dark:border-neutral-800 flex items-center justify-between">
                <button
                  onClick={handleRefresh}
                  className="text-xs font-mono-meta text-[#1C1B18] dark:text-neutral-200 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? 'Checking Status...' : 'Check Status'}</span>
                </button>

                <button
                  onClick={logout}
                  className="text-xs font-mono-meta text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            /* PENDING APPROVAL STATE */
            <>
              <div className="flex items-center gap-3 pb-3 border-b border-[#E5E2DA] dark:border-neutral-800">
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-mono-meta font-bold ${
                  isRejected ? 'border-red-400 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400' : 'border-amber-600/40 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                }`}>
                  {isRejected ? '✕' : '!'}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1C1B18] dark:text-neutral-100">
                    {isRejected ? 'Academic Verification Declined' : 'Academic Verification In Progress'}
                  </h2>
                  <p className="text-xs text-[#737067] dark:text-neutral-400">Application ID: #ARCH-2024-819</p>
                </div>
              </div>

              <p className="text-xs text-[#4A4740] dark:text-neutral-300 leading-relaxed">
                {isRejected ? (
                  <>Dear <strong>{user?.name}</strong>, your academic registration application was reviewed and could not be approved at this time. Please contact the administrative desk with proof of active enrollment.</>
                ) : (
                  <>Welcome, <strong>{user?.name}</strong>. Your academic registration is queued for manual credential review by the foundation's editorial team.</>
                )}
              </p>

              <div className="bg-[#FAF9F5] dark:bg-neutral-800/80 border border-[#E5E2DA] dark:border-neutral-700 p-4 text-xs font-mono-meta space-y-1.5 text-[#5C5950] dark:text-neutral-300">
                <div className="flex justify-between">
                  <span>INSTITUTION:</span> <span className="font-bold text-[#1C1B18] dark:text-neutral-100">{user?.university || 'University'}</span>
                </div>
                <div className="flex justify-between">
                  <span>STUDENT ID:</span> <span className="font-bold text-[#1C1B18] dark:text-neutral-100">{user?.studentId || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>DEGREE PROGRAM:</span> <span className="text-[#1C1B18] dark:text-neutral-100">{user?.degreeProgram}</span>
                </div>
                <div className="flex justify-between">
                  <span>RESEARCH DOMAIN:</span> <span className="text-[#1C1B18] dark:text-neutral-100">{user?.researchDomain}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#E5E2DA] dark:border-neutral-700">
                  <span>STATUS:</span>{' '}
                  <span className={isRejected ? 'text-red-700 dark:text-red-400 font-bold' : 'text-amber-700 dark:text-amber-400 font-bold'}>
                    {isRejected ? 'APPLICATION DECLINED' : 'AWAITING EDITORIAL REVIEW'}
                  </span>
                </div>
              </div>

              {!isRejected && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 p-2.5 rounded-sm flex items-center justify-between text-[11px] font-mono-meta text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Real-time channel active: page will automatically unlock once verified.</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[#737067] dark:text-neutral-400 leading-relaxed">
                To prevent automatic web scraping and preserve original thesis integrity, our staff verifies student enrollment before enabling full-text PDF downloads and raw dataset access.
              </p>

              <div className="pt-2 border-t border-[#E5E2DA] dark:border-neutral-800 flex items-center justify-between">
                <button
                  onClick={handleRefresh}
                  className="text-xs font-mono-meta text-[#1C1B18] dark:text-neutral-200 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? 'Checking Status...' : 'Check Approval Status'}</span>
                </button>

                <button
                  onClick={logout}
                  className="text-xs font-mono-meta text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}

        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] dark:border-neutral-800 text-center text-xs font-mono-meta text-[#737067] dark:text-neutral-500">
        Prepared and Developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
