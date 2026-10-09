import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getPlanInfo } from '../utils/plan';
import {
  Compass,
  Lightbulb,
  Database,
  Bookmark,
  Sun,
  Moon,
  Shield,
  Zap,
  LogOut,
  ChevronDown,
  Globe,
  User,
  CheckCircle2,
  Menu,
  X,
  FileText,
  Search,
  MessageSquare,
} from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Header({
  activeTab = 'discover',
  onChangeActiveTab,
  onOpenStudentManagement,
  pendingCount = 0,
  savedPapersCount = 0,
  comparisonCount = 0,
  onOpenMembership,
  membershipPlan = 'free',
  onOpenCoverage,
  onOpenLogin,
  onOpenFeedback,
  onOpenAlerts,
}) {
  const { user, isAdmin, isEditor, isStaff, hasPermission, isAuthenticated, logout } = useAuth();
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    const handleEscape = (e) => { if (e.key === 'Escape') setShowProfileMenu(false); };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const totalLibraryItems = (savedPapersCount || 0) + (comparisonCount || 0);

  const currentTab = activeTab === 'publications' ? 'discover' : activeTab;

  const handleTabClick = (tab) => {
    if (onChangeActiveTab) {
      onChangeActiveTab(tab);
    }
  };

  return (
    <header className="research-header bg-white dark:bg-[#151413] border-b border-[#E2DFD8] dark:border-[#2A2824] sticky top-0 z-30 shadow-2xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-14 md:h-16 gap-3">
          <button
            type="button"
            onClick={() => handleTabClick('discover')}
            aria-current={currentTab === 'discover' ? 'page' : undefined}
            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
            title="The Thesis Archive — Home"
          >
            <div className="w-8 h-8 shrink-0 rounded-xl bg-[#1C1B18] dark:bg-[#FAF9F5] text-[#FAF9F5] dark:text-[#1C1B18] flex items-center justify-center font-serif-title text-xl font-normal shadow-xs group-hover:scale-105 transition-transform">
              T
            </div>
            <div className="min-w-0">
              <span className="font-serif-title text-lg md:text-xl tracking-tight text-[#1C1B18] dark:text-[#FAF9F5] block leading-none truncate">
                The Thesis Archive
              </span>
            </div>
          </button>

          <nav aria-label="Main navigation" className="hidden lg:flex items-center bg-[#FAF9F5] dark:bg-[#1C1A18] p-1 rounded-xl border border-[#D5D1C7] dark:border-[#383530] text-sm">
            <button
              type="button"
              onClick={() => handleTabClick('discover')}
            aria-current={currentTab === 'discover' ? 'page' : undefined}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-2 cursor-pointer font-bold ${
                currentTab === 'discover'
                  ? 'bg-[#1C1B18] text-white dark:bg-[#FAF9F5] dark:text-[#1C1B18] shadow-2xs'
                  : 'text-[#605D55] dark:text-[#9E9A90] hover:text-[#1C1B18] dark:hover:text-[#FAF9F5]'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Find papers</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabClick('datasets')}
            aria-current={currentTab === 'datasets' ? 'page' : undefined}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-2 cursor-pointer font-bold ${
                currentTab === 'datasets'
                  ? 'bg-[#2C6B3F] text-white dark:bg-emerald-400 dark:text-neutral-950 shadow-2xs'
                  : 'text-[#605D55] dark:text-[#9E9A90] hover:text-[#2C6B3F] dark:hover:text-emerald-400'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Datasets</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabClick('topic')}
            aria-current={currentTab === 'topic' ? 'page' : undefined}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-2 cursor-pointer font-bold whitespace-nowrap ${
                currentTab === 'topic'
                  ? 'bg-indigo-700 text-white dark:bg-indigo-400 dark:text-neutral-950 shadow-2xs'
                  : 'text-[#605D55] dark:text-[#9E9A90] hover:text-indigo-700 dark:hover:text-indigo-300'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Check topic</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabClick('library')}
            aria-current={currentTab === 'library' ? 'page' : undefined}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-2 cursor-pointer font-bold ${
                currentTab === 'library'
                  ? 'bg-amber-600 text-white dark:bg-amber-400 dark:text-neutral-950 shadow-2xs'
                  : 'text-[#605D55] dark:text-[#9E9A90] hover:text-amber-700 dark:hover:text-amber-400'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Library</span>
              {totalLibraryItems > 0 && (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-2xs font-mono-meta font-bold ${
                    currentTab === 'library'
                      ? 'bg-white text-amber-700 dark:bg-neutral-950 dark:text-amber-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  }`}
                >
                  {totalLibraryItems}
                </span>
              )}
            </button>
          </nav>

          <div className="flex items-center gap-2 font-mono-meta text-xs shrink-0">
            {isAuthenticated ? (
              <>
                {isStaff && (hasPermission?.('students.view') || isAdmin) && (
                  <button
                    type="button"
                    onClick={onOpenStudentManagement}
                    className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-2.5 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer border border-amber-500"
                    title="Manage verification applications & editorial review"
                  >
                    <Shield className="w-3.5 h-3.5 text-neutral-950" />
                    <span className="hidden lg:inline">{isAdmin ? 'Admin Desk' : 'Staff Desk'}</span>
                    {pendingCount > 0 && (
                      <span className="bg-neutral-950 text-amber-300 text-[11px] px-1 rounded-lg">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                )}

                {/* Membership Plan Pill */}
                <button
                  type="button"
                  onClick={onOpenMembership}
                  className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 dark:from-purple-950/40 dark:to-pink-950/30 dark:hover:from-purple-900/50 dark:hover:to-pink-900/40 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-300 flex items-center gap-1.5 transition cursor-pointer shadow-2xs font-semibold"
                  title="Plans, 7-day trial and payment"
                >
                  <Zap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 fill-current" />
                  <span className="hidden sm:inline">
                    {getPlanInfo(membershipPlan).isPaid || getPlanInfo(membershipPlan).isTrial
                      ? getPlanInfo(membershipPlan).label
                      : 'Upgrade'}
                  </span>
                </button>

                {/* Notifications */}
                <NotificationBell onOpenFeedback={onOpenFeedback} onOpenMembership={onOpenMembership} onOpenAlerts={onOpenAlerts} />

                {/* Theme Toggle (Light / Dark Mode) */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-1.5 rounded-xl bg-[#FAF9F5] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#FAF9F5] transition cursor-pointer shadow-2xs"
                  title={`Theme: ${theme}. Click to switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
                  aria-label="Toggle Light and Dark Mode"
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-[#524F47]" />
                  )}
                </button>

                {/* User Account Menu Dropdown */}
                <div className="relative" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowProfileMenu((prev) => !prev)}
                    className="flex items-center gap-1.5 p-1 rounded-xl border border-[#D5D1C7] dark:border-[#383530] bg-[#FAF9F5] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:hover:bg-[#252320] transition cursor-pointer"
                    aria-label="User account menu"
                    aria-expanded={showProfileMenu}
                  >
                    <div className="w-6 h-6 rounded-lg bg-[#1C1B18] dark:bg-[#FAF9F5] text-white dark:text-[#1C1B18] flex items-center justify-center text-[11px] font-bold">
                      {user?.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
                    </div>
                    <ChevronDown className={`w-3 h-3 text-[#737067] dark:text-[#9E9A90] transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Profile Dropdown Panel */}
                  {showProfileMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-60 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] rounded-xl shadow-xl z-50 p-2 space-y-2 font-sans animate-fadeIn">
                      <div className="px-2 py-1.5 border-b border-[#F2EFE8] dark:border-[#2A2824]">
                        <div className="font-semibold text-xs text-[#1C1B18] dark:text-[#FAF9F5] truncate">
                          {user?.name || 'Signed in'}
                        </div>
                        <div className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9E9A90] truncate">
                          {user?.email}
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono-meta font-bold uppercase px-1.5 py-0.2 rounded-2xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>{isAdmin ? 'Administrator' : isEditor ? 'Editor' : 'Verified student'}</span>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowProfileMenu(false);
                            handleTabClick('library');
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#FAF9F5] dark:hover:bg-[#252320] flex items-center justify-between text-xs text-[#1C1B18] dark:text-[#FAF9F5] transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <Bookmark className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Library</span>
                          </span>
                          {totalLibraryItems > 0 && (
                            <span className="text-[11px] font-mono-meta font-bold text-amber-700 dark:text-amber-400">
                              {totalLibraryItems}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowProfileMenu(false);
                            onOpenMembership?.();
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#FAF9F5] dark:hover:bg-[#252320] flex items-center gap-2 text-xs text-[#1C1B18] dark:text-[#FAF9F5] transition cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          <span>Membership</span>
                        </button>

                        {onOpenFeedback && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowProfileMenu(false);
                              onOpenFeedback();
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#FAF9F5] dark:hover:bg-[#252320] flex items-center gap-2 text-xs text-[#1C1B18] dark:text-[#FAF9F5] transition cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Message the team</span>
                          </button>
                        )}

                        {onOpenCoverage && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowProfileMenu(false);
                              onOpenCoverage();
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#FAF9F5] dark:hover:bg-[#252320] flex items-center gap-2 text-xs text-[#1C1B18] dark:text-[#FAF9F5] transition cursor-pointer"
                          >
                            <Globe className="w-3.5 h-3.5 text-[#737067] dark:text-[#9E9A90]" />
                            <span>About the sources</span>
                          </button>
                        )}
                      </div>

                      <div className="pt-1.5 border-t border-[#F2EFE8] dark:border-[#2A2824]">
                        <button
                          type="button"
                          onClick={() => {
                            setShowProfileMenu(false);
                            logout();
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-400 flex items-center gap-2 text-xs transition cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Theme Toggle for Guests */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-1.5 rounded-xl bg-[#FAF9F5] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#FAF9F5] transition cursor-pointer shadow-2xs"
                  title={`Toggle ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
                  aria-label="Toggle theme"
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-[#524F47]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#FAF9F5] dark:hover:bg-white text-white dark:text-[#1C1B18] px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs font-medium"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navigation Tabs Row for phones and tablets (the four tabs do not fit beside the logo below 1024px) */}
        <nav aria-label="Main navigation" className="lg:hidden flex items-center justify-around py-2 border-t border-[#EAE7DF] dark:border-[#252320] text-sm">
          <button
            type="button"
            onClick={() => handleTabClick('discover')}
            aria-current={currentTab === 'discover' ? 'page' : undefined}
            className={`px-2 py-1 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer ${
              currentTab === 'discover'
                ? 'bg-[#1C1B18] text-white dark:bg-[#FAF9F5] dark:text-[#1C1B18]'
                : 'text-[#605D55] dark:text-[#9E9A90]'
            }`}
          >
            <Compass className="w-3.5 h-3.5 hidden min-[420px]:block" />
            <span>Find papers</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick('datasets')}
            aria-current={currentTab === 'datasets' ? 'page' : undefined}
            className={`px-2 py-1 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer ${
              currentTab === 'datasets'
                ? 'bg-[#2C6B3F] text-white dark:bg-emerald-400 dark:text-neutral-950'
                : 'text-[#605D55] dark:text-[#9E9A90]'
            }`}
          >
            <Database className="w-3.5 h-3.5 hidden min-[420px]:block" />
            <span>Datasets</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick('topic')}
            aria-current={currentTab === 'topic' ? 'page' : undefined}
            className={`px-2 py-1 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer whitespace-nowrap ${
              currentTab === 'topic'
                ? 'bg-indigo-700 text-white dark:bg-indigo-400 dark:text-neutral-950'
                : 'text-[#605D55] dark:text-[#9E9A90]'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5 hidden min-[420px]:block" />
            <span>Check topic</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabClick('library')}
            aria-current={currentTab === 'library' ? 'page' : undefined}
            className={`px-2 py-1 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer ${
              currentTab === 'library'
                ? 'bg-amber-600 text-white dark:bg-amber-400 dark:text-neutral-950'
                : 'text-[#605D55] dark:text-[#9E9A90]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 hidden min-[420px]:block" />
            <span>Library</span>
            {totalLibraryItems > 0 && (
              <span className="bg-amber-100 text-amber-900 text-[11px] px-1 rounded-lg">
                {totalLibraryItems}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
