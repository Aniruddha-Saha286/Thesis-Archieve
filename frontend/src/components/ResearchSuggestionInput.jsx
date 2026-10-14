import { useEffect, useId, useState } from 'react';
import { TOPICS, VENUES } from '../utils/venues';
export default function ResearchSuggestionInput({ value, onChange, onSelectVenue }) {
  const id = useId(); const [items, setItems] = useState([]); const [open, setOpen] = useState(false); const [index, setIndex] = useState(-1);
  useEffect(() => {
    const timer = setTimeout(() => { const q = value.trim().toLowerCase(); setItems(q ? [...TOPICS.map(label => ({ label })), ...VENUES].filter(i => i.label.toLowerCase().includes(q)).slice(0, 8) : []); setIndex(-1); }, 250);
    return () => clearTimeout(timer);
  }, [value]);
  const choose = item => { if (item.id) { onSelectVenue(item.id); onChange(''); } else onChange(item.label); setOpen(false); setIndex(-1); };
  return <div className="relative flex-1 min-w-full sm:min-w-0">
    <input aria-label="Search topics and venues" role="combobox" aria-autocomplete="list" aria-expanded={open && items.length > 0} aria-controls={open && items.length ? id : undefined} aria-activedescendant={open && index >= 0 && items[index] ? `${id}-${index}` : undefined}
      value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (open && items.length && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setIndex(i => e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1)); } if (e.key === 'Enter' && open && items[index]) { e.preventDefault(); choose(items[index]); } }}
      placeholder="Filter Radar by topic, or try CVPR…" className="w-full rounded-xl border border-[#D5D1C7] dark:border-[#383530] bg-white dark:bg-[#1C1A18] px-4 py-3 text-sm" />
    {open && items.length > 0 && <ul id={id} role="listbox" aria-label="Topic and venue suggestions" className="absolute z-20 mt-1 w-full rounded-xl border bg-white dark:bg-[#201F1C] overflow-hidden">
      {items.map((item, i) => <li key={item.label} id={`${id}-${i}`} role="option" aria-selected={i === index} onMouseDown={e => e.preventDefault()}><button type="button" tabIndex={-1} onClick={() => choose(item)} className={`w-full px-4 py-3 text-left text-sm ${i === index ? 'bg-amber-100 dark:bg-amber-950' : ''}`}>{item.label}<span className="ml-2 text-xs opacity-60">{item.id ? 'Venue' : 'Topic'}</span></button></li>)}
    </ul>}
  </div>;
}
