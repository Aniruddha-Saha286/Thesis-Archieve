export default function PaperSkeletons({ count = 3 }) {
  return <div role="status" aria-label="Loading papers" className="space-y-3">
    <span className="sr-only">Loading papers</span>
    {Array.from({ length: count }, (_, i) => <div key={i} aria-hidden="true" className="rounded-xl border border-[#E2DFD8] dark:border-[#383530] bg-white dark:bg-[#1C1A18] p-6 motion-safe:animate-pulse">
      <div className="h-3 w-1/3 bg-stone-200 dark:bg-stone-700 rounded mb-4" />
      <div className="h-5 w-5/6 bg-stone-200 dark:bg-stone-700 rounded mb-3" />
      <div className="h-3 w-2/3 bg-stone-100 dark:bg-stone-800 rounded mb-6" />
      <div className="h-3 bg-stone-100 dark:bg-stone-800 rounded mb-2" />
      <div className="h-3 w-4/5 bg-stone-100 dark:bg-stone-800 rounded" />
    </div>)}
  </div>;
}
