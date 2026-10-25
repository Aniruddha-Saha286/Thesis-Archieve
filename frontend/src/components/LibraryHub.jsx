import React from 'react';
import { ArrowRight, Bell, Bookmark, Folder, Layers, Plus, Scale, Sparkles, Zap } from 'lucide-react';
import { getPlanInfo } from '../utils/plan';
import { useAuth } from '../context/AuthContext';
import ResearchWorkspace from './ResearchWorkspace';

export default function LibraryHub({
  active = true, savedPapersCount = 0, onOpenSavedPapers, onOpenCollections,
  comparisonCount = 0, onOpenComparisonMatrix, onOpenTopicAlerts, onOpenPropose,
  onOpenMembership, membershipPlan = 'free', onSwitchToDiscover, onReadPaper,
}) {
  const { user } = useAuth();
  const tools = [
    { title: 'Saved papers & notes', description: 'The papers worth keeping, and the thoughts they sparked.', icon: Bookmark, run: onOpenSavedPapers, action: 'Open saved papers', detail: `${savedPapersCount} saved` },
    { title: 'Collections', description: 'Give every chapter, question or project its own reading list.', icon: Folder, run: onOpenCollections, action: 'Manage collections', detail: 'Organize & export' },
    { title: 'Compare papers', description: 'See methods, findings and limitations side by side.', icon: Scale, run: onOpenComparisonMatrix, action: `Open matrix (${comparisonCount})`, detail: 'Connect the dots' },
    { title: 'Topic alerts', description: 'Follow a question. Receive new-paper matches in your inbox here.', icon: Bell, run: onOpenTopicAlerts, action: 'Configure alerts', detail: 'Keep discovering' },
    { title: 'Deposit a thesis', description: 'Add your own work for the archive team to review.', icon: Plus, run: onOpenPropose, action: 'Deposit record', detail: 'Share your contribution' },
    { title: 'Membership', description: getPlanInfo(membershipPlan).isPaid ? 'Review your current research access and membership.' : 'Explore research access, the trial and membership options.', icon: Zap, run: onOpenMembership, action: getPlanInfo(membershipPlan).isPaid ? 'View membership' : 'Explore plans & trial', detail: getPlanInfo(membershipPlan).label },
  ];
  return <div className="library-workspace max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-9">
    <section className="library-welcome" aria-label="Your research workspace">
      <div className="library-welcome-copy"><div className="workspace-eyebrow"><Layers size={15} /> Your personal research studio</div><h1>A little more clarity.<br /><em>A little closer to your thesis.</em></h1><p>Good research grows one thoughtful step at a time. Keep your plan, your reading and your next idea together.</p><button type="button" onClick={onSwitchToDiscover} className="workspace-button workspace-primary">Find my next paper<ArrowRight size={16} /></button></div>
      <div className="library-welcome-aside"><div className="library-monogram" aria-hidden="true">t.</div><div className="library-welcome-stats"><div><strong>{savedPapersCount}</strong><span>papers in your corner</span></div><div><strong>{comparisonCount}<span className="text-base"> / 5</span></strong><span>ideas to compare</span></div></div><p><Sparkles size={14} /> A workspace for your curiosity.</p></div>
    </section>
    <ResearchWorkspace key={user?.id || user?._id} active={active} savedPapersCount={savedPapersCount} onOpenSavedPapers={onOpenSavedPapers} onReadPaper={onReadPaper} onDiscover={onSwitchToDiscover} />
    <section className="library-toolkit" aria-labelledby="toolkit-heading"><div className="workspace-section-header"><div><div className="workspace-eyebrow">Everything within reach</div><h2 id="toolkit-heading" className="workspace-title">Your research toolkit</h2></div></div><div className="library-tool-grid">{tools.map(({ title, description, icon: Icon, run, action, detail }) => <article key={title} className="library-tool-card"><div className="library-tool-top"><span className="library-tool-icon"><Icon size={21} /></span><span>{detail}</span></div><h3>{title}</h3><p>{description}</p><button type="button" onClick={run}>{action}<ArrowRight size={16} /></button></article>)}</div></section>
  </div>;
}
