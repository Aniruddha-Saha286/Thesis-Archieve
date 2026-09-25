import React from 'react';
import { ShieldCheck, Plus, Users, UserCheck } from 'lucide-react';

export default function AdminDesk({ pendingCount, onOpenDrawer, onOpenNewThesis, onOpenStudentManagement }) {
  return (
    <div className="bg-[#1C1B18] text-[#FAF9F5] border-b border-neutral-800 px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs font-mono-meta">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span className="font-bold text-amber-300">[EDITORIAL BOARD ACTIVE]</span>
          <span className="text-neutral-400 text-[11px] hidden sm:inline">
            Same repository view with candidate verification, student moderation & banning privileges enabled.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenStudentManagement}
            className="bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-3 py-1 rounded-sm text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Users className="w-3.5 h-3.5" />
            <span>View All Students & Roster</span>
          </button>

          <button
            onClick={onOpenDrawer}
            className="bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-amber-600/40 px-2.5 py-1 rounded-sm text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Review Applications ({pendingCount})</span>
          </button>

          <button
            onClick={onOpenNewThesis}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 px-2.5 py-1 rounded-sm text-xs transition flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Index New Thesis</span>
          </button>
        </div>
      </div>
    </div>
  );
}
