import React from 'react';
const UNIVERSITIES = [
  ['BUET', 'Bangladesh University of Engineering and Technology'], ['BRACU', 'BRAC University'],
  ['DU', 'University of Dhaka'], ['NSU', 'North South University'], ['IUT', 'Islamic University of Technology'],
  ['SUST', 'Shahjalal University of Science and Technology'],
];
export default function LocalDiscoveryShortcuts({ institution, onInstitution, degree, onDegree, program, onProgram }) {
  return <details className="rounded-2xl border border-[#E2DFD8] dark:border-[#383530] bg-white dark:bg-[#151413] p-4">
    <summary className="cursor-pointer text-sm font-semibold">Bangladesh university & program shortcuts</summary>
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">{UNIVERSITIES.map(([label, name]) => <button key={label} type="button" aria-pressed={institution?.name === name} onClick={() => onInstitution(institution?.name === name ? null : { name, countryCode: 'BD' })} className={`rounded-full border px-3 py-2 text-sm ${institution?.name === name ? 'bg-[#254B40] text-white' : 'hover:border-emerald-600'}`}>{label}</button>)}</div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label>Degree <select aria-label="Degree shortcut" value={degree} onChange={e => onDegree(e.target.value)} className="ml-2 rounded-xl border px-3 py-2 bg-white dark:bg-[#201F1C]"><option value="">Any degree</option><option value="bsc">B.Sc. / final year project</option><option value="msc">M.Sc. thesis</option><option value="phd">Ph.D. dissertation</option></select></label>
        <label>Program <select aria-label="Program shortcut" value={program} onChange={e => onProgram(e.target.value)} className="ml-2 rounded-xl border px-3 py-2 bg-white dark:bg-[#201F1C]"><option value="">Any program</option><option value="cse">Computer Science</option><option value="eee">EEE</option><option value="business">BBA / Economics</option><option value="pharmacy">Pharmacy</option></select></label>
      </div>
      <p className="text-xs text-[#737067] dark:text-[#9A968D]">University chips use affiliations. For the university that awarded a thesis, choose “Awarding university” in More filters. Degree and program shortcuts require recorded metadata; unclassified papers will be excluded.</p>
    </div>
  </details>;
}
