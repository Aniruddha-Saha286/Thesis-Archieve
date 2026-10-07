import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSocket } from '../context/SocketContext';
import { LogOut, RefreshCw, AlertOctagon, Sun, Moon, MessageSquare } from 'lucide-react';
import FeedbackModal from './FeedbackModal';

export default function PendingView() {
  const { user, logout, refreshUser } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [checking, setChecking] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { isConnected } = useSocket();

  const applicationRef = String(user?.id || user?._id || '').slice(-8).toUpperCase();

  const isBanned = user?.status === 'banned';
  const isRejected = user?.status === 'rejected';

  const handleRefresh = async () => {
    setChecking(true);
    await refreshUser();
    setTimeout(() => setChecking(false), 600);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-neutral-950 text-[#1C1B18] dark:text-neutral-100 flex flex-col justify-between p-6 transition-colors">
      
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#E2DFD8] dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-[#1C1B18] dark:bg-neutral-100 text-[#FAF9F5] dark:text-neutral-950 flex items-center justify-center font-serif-title text-xl font-normal">
            §
          </div>
          <div>
            <span className="font-serif-title text-xl tracking-tight text-[#1C1B18] dark:text-neutral-100 block leading-none">
              The Thesis Archive
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
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full my-auto py-12">
        <div className="bg-white dark:bg-neutral-900 border border-[#E2DFD8] dark:border-neutral-800 p-8 rounded-sm shadow-sm space-y-5">
          
          {isBanned ? (
            <>
              <div className="flex items-center gap-3 pb-3 border-b border-red-200 dark:border-red-900/60">
                <div className="w-8 h-8 rounded-full border border-red-600 dark:border-red-500 bg-red-50 dark:bg-red-950/60 flex items-center justify-center text-red-700 dark:text-red-400 text-xs font-mono-meta font-bold">
                  <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-red-700 dark:text-red-400 font-mono-meta">
                    Your account is suspended
                  </h2>
                  <p className="text-xs text-[#737067] dark:text-neutral-400">Decided by the site team</p>
                </div>
              </div>

              <p className="text-xs text-[#4A4740] dark:text-neutral-300 leading-relaxed">
                <strong>{user?.name}</strong>, the team has suspended your access to The Thesis Archive.
              </p>

              <div className="bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 p-4 text-xs font-mono-meta space-y-1.5 text-red-900 dark:text-red-300">
                <div><span>Student ID:</span> <strong>{user?.studentId || 'Not given'}</strong></div>
                <div><span>University:</span> {user?.university || 'Not given'}</div>
                <div><span>Reason:</span> <em>{user?.banReason || 'No reason was recorded'}</em></div>
              </div>

              <p className="text-[11px] text-[#737067] dark:text-neutral-400 leading-relaxed">
                If you think this is a mistake, write to the site team by email and include your student ID.
              </p>

              <div className="pt-2 border-t border-[#E2DFD8] dark:border-neutral-800 flex items-center justify-between">
                <button
                  onClick={handleRefresh}
                  className="text-xs font-mono-meta text-[#1C1B18] dark:text-neutral-200 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? 'Checking…' : 'Check again'}</span>
                </button>

                <button
                  onClick={logout}
                  className="text-xs font-mono-meta text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white cursor-pointer"
                >
                  Sign out
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
                    {isRejected ? 'Your registration was not approved' : 'Your details are being checked'}
                  </h2>
                  {applicationRef && (
                    <p className="text-xs text-[#737067] dark:text-neutral-400">Your reference: #{applicationRef}</p>
                  )}
                </div>
              </div>

              <p className="text-xs text-[#4A4740] dark:text-neutral-300 leading-relaxed">
                {isRejected ? (
                  <><strong>{user?.name}</strong>, the team looked at your registration and could not approve it. Message the team below and include proof that you are a current student.</>
                ) : (
                  <>Welcome, <strong>{user?.name}</strong>. A member of the team checks each new student by hand. You can start searching as soon as that is done.</>
                )}
              </p>

              <div className="bg-[#FAF9F5] dark:bg-neutral-800/80 border border-[#E5E2DA] dark:border-neutral-700 p-4 text-xs font-mono-meta space-y-1.5 text-[#5C5950] dark:text-neutral-300">
                <div className="flex justify-between">
                  <span>University</span> <span className="font-bold text-[#1C1B18] dark:text-neutral-100">{user?.university || 'Not given'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Student ID</span> <span className="font-bold text-[#1C1B18] dark:text-neutral-100">{user?.studentId || 'Not given'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Degree</span> <span className="text-[#1C1B18] dark:text-neutral-100">{user?.degreeProgram}</span>
                </div>
                <div className="flex justify-between">
                  <span>Research area</span> <span className="text-[#1C1B18] dark:text-neutral-100">{user?.researchDomain}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[#E5E2DA] dark:border-neutral-700">
                  <span>Status</span>{' '}
                  <span className={isRejected ? 'text-red-700 dark:text-red-400 font-bold' : 'text-amber-700 dark:text-amber-400 font-bold'}>
                    {isRejected ? 'Not approved' : 'Waiting for the team'}
                  </span>
                </div>
              </div>

              {!isRejected && !isBanned && (
                isConnected ? (
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 p-2.5 rounded-sm flex items-center gap-2 text-[11px] font-mono-meta text-emerald-900 dark:text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                    <span>Connected. This page opens by itself as soon as you are verified.</span>
                  </div>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-2.5 rounded-sm flex items-center gap-2 text-[11px] font-mono-meta text-amber-900 dark:text-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                    <span>Live updates are not connected right now. Use “Check again” below.</span>
                  </div>
                )
              )}

              <p className="text-[11px] text-[#737067] dark:text-neutral-400 leading-relaxed">
                The check confirms that accounts belong to real university scholars. Your details are used for nothing else.
              </p>

              <div className="pt-2 border-t border-[#E5E2DA] dark:border-neutral-800 flex items-center justify-between">
                <button
                  onClick={handleRefresh}
                  className="text-xs font-mono-meta text-[#1C1B18] dark:text-neutral-200 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? 'Checking…' : 'Check again'}</span>
                </button>

                <button
                  onClick={() => setIsFeedbackOpen(true)}
                  className="text-xs font-mono-meta text-[#1C1B18] dark:text-neutral-200 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Message the team</span>
                </button>

                <button
                  onClick={logout}
                  className="text-xs font-mono-meta text-[#737067] dark:text-neutral-400 hover:text-[#1C1B18] dark:hover:text-white cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </>
          )}

        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full py-4 border-t border-[#E2DFD8] dark:border-neutral-800 text-center text-xs font-mono-meta text-[#737067] dark:text-neutral-500">
        Prepared and developed by CSE IMPOSTERS TEAM
      </footer>

      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} pageContext="waiting-for-approval" />
    </div>
  );
}
