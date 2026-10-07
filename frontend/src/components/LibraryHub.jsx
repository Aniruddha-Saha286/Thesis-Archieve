import React from 'react';
import {
  Bookmark,
  Folder,
  Scale,
  Bell,
  Plus,
  FileText,
  Download,
  ArrowRight,
  Sparkles,
  Layers,
  Database,
  ExternalLink,
  Shield,
  Zap,
} from 'lucide-react';
import { getPlanInfo } from '../utils/plan';

export default function LibraryHub({
  savedPapersCount = 0,
  onOpenSavedPapers,
  onOpenCollections,
  comparisonCount = 0,
  onOpenComparisonMatrix,
  onOpenTopicAlerts,
  onOpenPropose,
  onOpenMembership,
  membershipPlan = 'free',
  onSwitchToDiscover,
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-8 animate-fadeIn">
      <div className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] rounded-sm p-6 md:p-8 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xs bg-[#FAF9F5] dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] text-[#737067] dark:text-[#9E9A90] text-xs font-mono-meta uppercase tracking-wider font-semibold">
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Your library</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-serif-title font-normal tracking-tight text-[#1C1B18] dark:text-[#FAF9F5]">
              Library
            </h1>
            <p className="text-xs md:text-sm text-[#737067] dark:text-[#9E9A90] leading-relaxed">
              Your saved papers and notes, collections, paper comparisons and topic alerts.
            </p>
          </div>

          {/* Quick Metrics Badge Group */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="bg-[#FAF9F5] dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] px-4 py-3 rounded-sm text-center min-w-[100px]">
              <span className="block text-2xl font-serif-title font-bold text-[#1C1B18] dark:text-[#FAF9F5]">
                {savedPapersCount}
              </span>
              <span className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9E9A90] uppercase tracking-wider">
                Saved Papers
              </span>
            </div>

            <div className="bg-[#FAF9F5] dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] px-4 py-3 rounded-sm text-center min-w-[100px]">
              <span className="block text-2xl font-serif-title font-bold text-purple-700 dark:text-purple-400">
                {comparisonCount} <span className="text-xs text-[#737067] dark:text-[#9E9A90] font-normal">/ 5</span>
              </span>
              <span className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9E9A90] uppercase tracking-wider">
                To compare
              </span>
            </div>

            <div className="bg-[#FAF9F5] dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] px-4 py-3 rounded-sm text-center min-w-[100px]">
              <span className="block text-xs font-mono-meta font-bold uppercase text-amber-700 dark:text-amber-400 mt-2 mb-1">
                {getPlanInfo(membershipPlan).badge}
              </span>
              <span className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9E9A90] uppercase tracking-wider">
                Plan
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Saved Papers & Annotations */}
        <div className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] hover:border-[#1C1B18] dark:hover:border-[#FAF9F5] rounded-sm p-6 flex flex-col justify-between transition group shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-sm bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <Bookmark className="w-5 h-5" />
              </div>
              <span className="bg-[#FAF9F5] dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#FAF9F5] font-mono-meta text-xs px-2 py-0.5 rounded-xs font-bold">
                {savedPapersCount} {savedPapersCount === 1 ? 'Paper' : 'Papers'}
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-serif-title font-bold text-[#1C1B18] dark:text-[#FAF9F5] group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                Saved Papers & Notes
              </h2>
              <p className="text-xs text-[#737067] dark:text-[#9E9A90] leading-relaxed">
                Every paper you saved, with your own notes and a link to its PDF where one exists.
              </p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[#F2EFE8] dark:border-[#24221F] flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenSavedPapers}
              className="w-full bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#FAF9F5] dark:hover:bg-white text-white dark:text-[#1C1B18] px-4 py-2 rounded-sm text-xs font-mono-meta uppercase tracking-wider font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <span>Open Saved Papers</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 2: Collections & Bibliography Export */}
        <div className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] hover:border-[#1C1B18] dark:hover:border-[#FAF9F5] rounded-sm p-6 flex flex-col justify-between transition group shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-sm bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 flex items-center justify-center">
                <Folder className="w-5 h-5" />
              </div>
              <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 font-mono-meta text-[11px] px-2 py-0.5 rounded-xs border border-blue-200 dark:border-blue-800 uppercase font-bold">
                BibTeX & RIS
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-serif-title font-bold text-[#1C1B18] dark:text-[#FAF9F5] group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                Collections
              </h2>
              <p className="text-xs text-[#737067] dark:text-[#9E9A90] leading-relaxed">
                Sort saved papers into folders, for example one per chapter. Export a whole folder as BibTeX or RIS for Zotero, Mendeley or EndNote.
              </p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[#F2EFE8] dark:border-[#24221F] flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenCollections}
              className="w-full bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#FAF9F5] dark:hover:bg-white text-white dark:text-[#1C1B18] px-4 py-2 rounded-sm text-xs font-mono-meta uppercase tracking-wider font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <span>Manage Collections</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 3: Literature Comparison Matrix */}
        <div className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] hover:border-[#1C1B18] dark:hover:border-[#FAF9F5] rounded-sm p-6 flex flex-col justify-between transition group shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-sm bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400 flex items-center justify-center">
                <Scale className="w-5 h-5" />
              </div>
              <span className="bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 font-mono-meta text-[11px] px-2 py-0.5 rounded-xs border border-purple-200 dark:border-purple-800 uppercase font-bold">
                Compare papers
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-serif-title font-bold text-[#1C1B18] dark:text-[#FAF9F5] group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors">
                Compare papers
              </h2>
              <p className="text-xs text-[#737067] dark:text-[#9E9A90] leading-relaxed">
                Put up to 5 papers side by side: method, sample size, findings, datasets and limitations. You can save a comparison and open it again later.
              </p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[#F2EFE8] dark:border-[#24221F] flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenComparisonMatrix}
              className="w-full bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#FAF9F5] dark:hover:bg-white text-white dark:text-[#1C1B18] px-4 py-2 rounded-sm text-xs font-mono-meta uppercase tracking-wider font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <span>Open Matrix ({comparisonCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 4: Scholarly Topic Alerts */}
        <div className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] hover:border-[#1C1B18] dark:hover:border-[#FAF9F5] rounded-sm p-6 flex flex-col justify-between transition group shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
              <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-mono-meta text-[11px] px-2 py-0.5 rounded-xs border border-emerald-200 dark:border-emerald-800 uppercase font-bold">
                By email
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-serif-title font-bold text-[#1C1B18] dark:text-[#FAF9F5] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                Topic alerts
              </h2>
              <p className="text-xs text-[#737067] dark:text-[#9E9A90] leading-relaxed">
                Name a topic and get a notice here, and by email, when a new paper on it appears.
              </p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[#F2EFE8] dark:border-[#24221F] flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenTopicAlerts}
              className="w-full bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-[#FAF9F5] dark:hover:bg-white text-white dark:text-[#1C1B18] px-4 py-2 rounded-sm text-xs font-mono-meta uppercase tracking-wider font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <span>Configure Alerts</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 5: Propose / Deposit Thesis */}
        <div className="bg-white dark:bg-[#151413] border border-[#E2DFD8] dark:border-[#2A2824] hover:border-[#1C1B18] dark:hover:border-[#FAF9F5] rounded-sm p-6 flex flex-col justify-between transition group shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-sm bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <span className="bg-[#FAF9F5] dark:bg-[#1C1A18] text-[#737067] dark:text-[#9E9A90] font-mono-meta text-[11px] px-2 py-0.5 rounded-xs border border-[#D5D1C7] dark:border-[#383530] uppercase font-bold">
                Reviewed
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-serif-title font-bold text-[#1C1B18] dark:text-[#FAF9F5] group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                Deposit a thesis
              </h2>
              <p className="text-xs text-[#737067] dark:text-[#9E9A90] leading-relaxed">
                Add your own thesis to the archive. Upload the PDF or give a link; the team checks it before it appears in search.
              </p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[#F2EFE8] dark:border-[#24221F] flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenPropose}
              className="w-full bg-[#FAF9F5] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#FAF9F5] px-4 py-2 rounded-sm text-xs font-mono-meta uppercase tracking-wider font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <span>Deposit Record</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 6: Membership & Upgrade */}
        <div className="bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800/60 rounded-sm p-6 flex flex-col justify-between transition group shadow-2xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-sm bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <span className="bg-purple-100 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 font-mono-meta text-[11px] px-2 py-0.5 rounded-xs border border-purple-300 dark:border-purple-700 uppercase font-bold">
                {getPlanInfo(membershipPlan).label}
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-serif-title font-bold text-[#1C1B18] dark:text-[#FAF9F5]">
                Membership
              </h2>
              <p className="text-xs text-[#737067] dark:text-[#9E9A90] leading-relaxed">
                {getPlanInfo(membershipPlan).isPaid
                  ? 'Your plan is active: unlimited searches, dataset search, summaries from the full paper and whole-folder citation export.'
                  : 'Start the 7-day free trial, or pay by bKash, for unlimited searches, dataset search, summaries from the full paper and whole-folder citation export.'}
              </p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-purple-200 dark:border-purple-800/40 flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenMembership}
              className="w-full bg-purple-700 hover:bg-purple-800 dark:bg-purple-600 dark:hover:bg-purple-500 text-white px-4 py-2 rounded-sm text-xs font-mono-meta uppercase tracking-wider font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <span>{getPlanInfo(membershipPlan).isPaid ? 'View Membership' : 'Explore Plans & Trial'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Guidance Banner */}
      <div className="bg-[#FAF9F5] dark:bg-[#181614] border border-[#E2DFD8] dark:border-[#2A2824] rounded-sm p-4 text-xs font-mono-meta flex flex-col sm:flex-row items-center justify-between gap-3 text-[#737067] dark:text-[#9E9A90]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Need to find literature to add to your library? Head back to the discovery search engine.</span>
        </div>
        <button
          type="button"
          onClick={onSwitchToDiscover}
          className="underline text-[#1C1B18] dark:text-[#FAF9F5] hover:text-amber-700 dark:hover:text-amber-400 font-bold cursor-pointer shrink-0"
        >
          Go to Discover Search →
        </button>
      </div>
    </div>
  );
}
