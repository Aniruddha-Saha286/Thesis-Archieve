import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, RefreshCw, AlertOctagon } from 'lucide-react';

export default function PendingView() {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);

  const isBanned = user?.status === 'banned';
  const isRejected = user?.status === 'rejected';

  const handleRefresh = async () => {
    setChecking(true);
    await refreshUser();
    setTimeout(() => setChecking(false), 600);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#1C1B18] flex flex-col justify-between p-6">
      
      {/* Header */}
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
              Open Academic Depository
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

      {/* Main Notice */}
      <main className="max-w-xl mx-auto w-full my-auto py-12">
        <div className="bg-white border border-[#E2DFD8] p-8 rounded-sm shadow-sm space-y-5">
          
          {isBanned ? (
            /* BANNED / SUSPENDED STATE */
            <>
              <div className="flex items-center gap-3 pb-3 border-b border-red-200">
                <div className="w-8 h-8 rounded-full border border-red-600 bg-red-50 flex items-center justify-center text-red-700 text-xs font-mono-meta font-bold">
                  <AlertOctagon className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-red-700 font-mono-meta">
                    [ACCESS SUSPENDED / ACCOUNT BANNED]
                  </h2>
                  <p className="text-xs text-[#737067]">Administrative Action Imposed</p>
                </div>
              </div>

              <p className="text-xs text-[#4A4740] leading-relaxed">
                Dear <strong>{user?.name}</strong>, your access to The Thesis Archive services has been revoked by the editorial board.
              </p>

              <div className="bg-red-50/60 border border-red-200 p-4 text-xs font-mono-meta space-y-1.5 text-red-900">
                <div><span>STUDENT ID:</span> <strong>{user?.studentId || 'N/A'}</strong></div>
                <div><span>INSTITUTION:</span> {user?.university || 'University'}</div>
                <div><span>REASON:</span> <em>{user?.banReason || 'Administrative suspension'}</em></div>
                <div className="pt-1 text-[11px] text-red-700 border-t border-red-200">
                  STATUS: ACCESS TO REPOSITORY, PDFS & DATASETS HAS BEEN TERMINATED
                </div>
              </div>

              <p className="text-[11px] text-[#737067] leading-relaxed">
                If you believe this action was made in error or wish to appeal your academic verification, please contact the institution administrator.
              </p>

              <div className="pt-2 border-t border-[#E2DFD8] flex items-center justify-between">
                <button
                  onClick={handleRefresh}
                  className="text-xs font-mono-meta text-[#1C1B18] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? 'Checking Status...' : 'Check Status'}</span>
                </button>

                <button
                  onClick={logout}
                  className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            /* PENDING APPROVAL STATE */
            <>
              <div className="flex items-center gap-3 pb-3 border-b border-[#E5E2DA]">
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-mono-meta font-bold ${
                  isRejected ? 'border-red-400 bg-red-50 text-red-700' : 'border-amber-600/40 bg-amber-50 text-amber-800'
                }`}>
                  {isRejected ? '✕' : '!'}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1C1B18]">
                    {isRejected ? 'Academic Verification Declined' : 'Academic Verification In Progress'}
                  </h2>
                  <p className="text-xs text-[#737067]">Application ID: #ARCH-2024-819</p>
                </div>
              </div>

              <p className="text-xs text-[#4A4740] leading-relaxed">
                {isRejected ? (
                  <>Dear <strong>{user?.name}</strong>, your academic registration application was reviewed and could not be approved at this time. Please contact the administrative desk with proof of active enrollment.</>
                ) : (
                  <>Welcome, <strong>{user?.name}</strong>. Your academic registration is queued for manual credential review by the foundation's editorial team.</>
                )}
              </p>

              <div className="bg-[#FAF9F5] border border-[#E5E2DA] p-4 text-xs font-mono-meta space-y-1.5 text-[#5C5950]">
                <div className="flex justify-between">
                  <span>INSTITUTION:</span> <span className="font-bold text-[#1C1B18]">{user?.university || 'University'}</span>
                </div>
                <div className="flex justify-between">
                  <span>STUDENT ID:</span> <span className="font-bold text-[#1C1B18]">{user?.studentId || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>DEGREE PROGRAM:</span> <span className="text-[#1C1B18]">{user?.degreeProgram}</span>
                </div>
                <div className="flex justify-between">
                  <span>RESEARCH DOMAIN:</span> <span className="text-[#1C1B18]">{user?.researchDomain}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#E5E2DA]">
                  <span>STATUS:</span>{' '}
                  <span className={isRejected ? 'text-red-700 font-bold' : 'text-amber-700 font-bold'}>
                    {isRejected ? 'APPLICATION DECLINED' : 'AWAITING EDITORIAL REVIEW'}
                  </span>
                </div>
              </div>

              {!isRejected && (
                <div className="bg-emerald-50 border border-emerald-200/80 p-2.5 rounded-sm flex items-center justify-between text-[11px] font-mono-meta text-emerald-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Real-time channel active: page will automatically unlock once verified.</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[#737067] leading-relaxed">
                To prevent automatic web scraping and preserve original thesis integrity, our staff verifies student enrollment before enabling full-text PDF downloads and raw dataset access.
              </p>

              <div className="pt-2 border-t border-[#E5E2DA] flex items-center justify-between">
                <button
                  onClick={handleRefresh}
                  className="text-xs font-mono-meta text-[#1C1B18] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? 'Checking Status...' : 'Check Approval Status'}</span>
                </button>

                <button
                  onClick={logout}
                  className="text-xs font-mono-meta text-[#737067] hover:text-[#1C1B18] cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}

        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] text-center text-xs font-mono-meta text-[#737067]">
        Prepared and Developed by CSE IMPOSTERS TEAM
      </footer>
    </div>
  );
}
