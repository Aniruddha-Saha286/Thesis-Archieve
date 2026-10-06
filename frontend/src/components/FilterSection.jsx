import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Collapsible group used in the Discover sidebar so related filters sit together
 * and long lists do not push everything else off-screen.
 *
 * - `activeCount` shows a small badge so people can see a collapsed group is filtering.
 * - `onClear` (optional) renders a "Clear" link that works without expanding the group.
 */
export default function FilterSection({
  title,
  icon: Icon,
  defaultOpen = true,
  activeCount = 0,
  onClear,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border border-[#E2DFD8] dark:border-[#2C2A26] bg-white dark:bg-[#161513] rounded-sm transition-colors">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
        >
          {Icon && <Icon className="w-3.5 h-3.5 text-[#737067] dark:text-[#9A968D] shrink-0" />}
          <span className="text-[11px] font-mono-meta font-bold uppercase tracking-wider text-[#4A4740] dark:text-[#B3AFA6] truncate">
            {title}
          </span>
          {activeCount > 0 && (
            <span className="bg-[#1C1B18] dark:bg-amber-400 text-white dark:text-neutral-950 text-[11px] font-mono-meta font-bold px-1.5 py-0.5 rounded-2xs shrink-0">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-mono-meta text-amber-800 dark:text-amber-400 underline cursor-pointer shrink-0"
          >
            Clear
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="p-1 text-[#737067] dark:text-[#9A968D] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer shrink-0"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && <div className="px-3 pb-3 pt-0.5 space-y-3">{children}</div>}
    </section>
  );
}
