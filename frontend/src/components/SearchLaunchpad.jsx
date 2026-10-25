import React, { useState } from 'react';
import { ArrowUpRight, Compass, Sparkles } from 'lucide-react';
import { searchAngles } from '../utils/researchWorkspace';

export default function SearchLaunchpad({ onSearch }) {
  const [topic, setTopic] = useState('');
  const angles = searchAngles(topic);
  return <section className="search-launchpad max-w-7xl mx-auto px-4 md:px-6 pt-6" aria-label="Research search builder">
    <details className="search-launchpad-shell">
      <summary><span className="launchpad-icon"><Compass size={21} /></span><span><strong>A topic is a starting point. Find your angle.</strong><small>Turn a broad interest into three useful literature searches.</small></span><Sparkles size={18} className="shrink-0" /></summary>
      <div className="launchpad-body"><label htmlFor="launchpad-topic">What are you curious about?</label><input id="launchpad-topic" value={topic} maxLength={120} onChange={event => setTopic(event.target.value)} placeholder="e.g. coastal flood prediction" />
        <div className="launchpad-prompts">{['Bangla sentiment analysis', 'Coastal flood prediction', 'Solar energy storage'].map(idea => <button key={idea} type="button" onClick={() => setTopic(idea)}>{idea}</button>)}</div>
        {angles.length > 0 && <div className="search-angle-grid">{angles.map(angle => <button type="button" key={angle.id} onClick={() => onSearch(angle.query)}><span className="flex items-center justify-between gap-2"><strong>{angle.label}</strong><ArrowUpRight size={17} /></span><p>{angle.detail}</p><span className="angle-query">{angle.query}</span></button>)}</div>}
        <p className="launchpad-disclaimer">These are search starters, not findings or claims of a research gap. Selecting one runs a normal paper search.</p>
      </div>
    </details>
  </section>;
}
