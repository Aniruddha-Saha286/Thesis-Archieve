export default function RadarAvailability({ data, mode, onSearch, onReset, onAnnual, onIdea, query }) {
  const health = data.health;
  const preparing = health?.hasIndexedPapers === false;
  const messages = {
    partial_failure: 'Some sources could not synchronize. Available papers are shown; coverage may be incomplete.',
    syncing: 'Research sources are synchronizing.', stale: 'Indexed coverage has not been refreshed recently.',
    waiting: 'Waiting for the first source synchronization.', disabled: 'Automatic indexing is currently disabled.',
    indexed: 'Indexed research is available.',
  };
  return <>
    {health && <p role="status" className="text-sm mb-4">{messages[health.state]}{!health.ingestionEnabled && health.hasIndexedPapers && ' Automatic updates are disabled.'}</p>}
    <div className="flex flex-wrap gap-4 text-sm mb-4"><button type="button" className="underline" onClick={onSearch}>Search all papers</button><button type="button" className="underline" disabled={!query.trim()} onClick={() => onIdea?.(query.trim())}>Check this idea</button></div>
    <details className="text-xs mb-5"><summary className="cursor-pointer">Source sync status ({health?.configuredJobs ?? data.sync.length} {health ? 'configured jobs' : 'saved job states'})</summary><div className="mt-2 flex flex-wrap gap-2">{data.sync.map(s => <p key={s.key} className="border rounded-lg p-2">{s.provider} · {s.venueId?.toUpperCase()} {s.year} · {s.status}<br />Last success: {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString() : 'Not synced'}</p>)}{!data.sync.length && <p>Source diagnostics are unavailable. This does not establish that no research exists.</p>}</div></details>
    {data.records.length > 0 && <p className="text-xs mb-3">{data.records.length} papers loaded{data.nextCursor ? ' · More available' : ''}</p>}
    {data.empty && <div className="rounded-xl border border-[#E2DFD8] dark:border-[#383530] p-6 md:p-8 text-center"><h2 className="font-serif-title text-xl">{preparing ? 'Research Radar is getting ready.' : 'No papers match these filters.'}</h2><p className="text-sm mt-2 text-[#737067] dark:text-[#B3AFA6]">{preparing ? 'Indexed research updates are not available yet. Explore the broader scholarly catalog while sources are prepared.' : mode === 'activity' ? 'Tracked sources have not yielded matching newly indexed papers in this period. This does not mean no research exists.' : 'Coverage is limited to indexed sources. Short publication windows exclude papers with year-only dates.'}</p><div className="flex flex-wrap justify-center gap-4 mt-4 text-sm"><button type="button" className="underline" onClick={onSearch}>{preparing ? 'Find papers instead' : 'Search broader literature'}</button>{!preparing && <><button type="button" className="underline" onClick={onReset}>Clear filters</button><button type="button" className="underline" onClick={onAnnual}>Browse publication year</button></>}</div></div>}
  </>;
}
