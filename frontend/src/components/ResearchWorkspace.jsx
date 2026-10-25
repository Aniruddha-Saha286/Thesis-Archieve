import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRight, BookOpen, Check, ChevronRight, Download, Flag, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { readingSummary, supervisorBrief } from '../utils/researchWorkspace';
import FocusSession from './FocusSession';

export default function ResearchWorkspace({ active = true, savedPapersCount, onOpenSavedPapers, onReadPaper, onDiscover }) {
  const [plan, setPlan] = useState(null), [planError, setPlanError] = useState('');
  const [papers, setPapers] = useState(null), [paperError, setPaperError] = useState('');
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false), [newTask, setNewTask] = useState(''), [filter, setFilter] = useState('Reading');
  const [busyPaper, setBusyPaper] = useState(null);
  const mounted = useRef(true), readingRequest = useRef(0), planRequest = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadPlan = useCallback(async () => {
    const request = ++planRequest.current;
    try {
      const { data } = await axios.get('/api/user/research-plan');
      if (!data?.plan || !Array.isArray(data.plan.tasks)) throw new Error('Invalid roadmap');
      if (!mounted.current || request !== planRequest.current) return;
      setPlan(data.plan); setDirty(false); setConflict(false); setNotice(''); setPlanError('');
    } catch {
      if (mounted.current && request === planRequest.current) setPlanError('Your roadmap could not be loaded. Reconnect and try again.');
    }
  }, []);
  const loadPapers = useCallback(async () => {
    const request = ++readingRequest.current;
    try {
      const { data } = await axios.get('/api/user/saved-papers');
      if (!Array.isArray(data)) throw new Error('Invalid saved library');
      if (mounted.current && request === readingRequest.current) { setPapers(data); setPaperError(''); }
    } catch {
      if (mounted.current && request === readingRequest.current) setPaperError('The reading shelf could not be refreshed. Previously loaded papers may be out of date.');
    }
  }, []);
  // These setters run after an external account-data request resolves.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadPlan(); }, [loadPlan]);
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (active) loadPapers(); }, [active, savedPapersCount, loadPapers]);
  useEffect(() => {
    const protectDraft = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [dirty]);

  const edit = update => { setPlan(previous => ({ ...previous, ...update })); setDirty(true); setNotice(''); };
  const save = async () => {
    ++planRequest.current;
    setSaving(true); setNotice(''); setPlanError('');
    try {
      const { data } = await axios.put('/api/user/research-plan', plan);
      if (!data?.plan || !Array.isArray(data.plan.tasks)) throw new Error('Invalid saved roadmap');
      if (!mounted.current) return;
      setPlan(data.plan); setDirty(false); setConflict(false); setNotice('Roadmap saved to your account.');
    } catch (error) {
      if (!mounted.current) return;
      setConflict(error.response?.status === 409);
      setPlanError(error.response?.data?.message || 'Your roadmap could not be saved. Your edits are still here.');
    } finally { if (mounted.current) setSaving(false); }
  };
  const changeStatus = async (paper, readingStatus) => {
    ++readingRequest.current; setBusyPaper(paper.paperId); setPaperError('');
    try {
      await axios.patch(`/api/user/saved-papers/${encodeURIComponent(paper.paperId)}/reading-status`, { readingStatus });
      if (mounted.current) setPapers(previous => previous.map(item => item.paperId === paper.paperId ? { ...item, readingStatus } : item));
    } catch { if (mounted.current) setPaperError('Reading progress could not be saved. Please try again.'); }
    finally { if (mounted.current) setBusyPaper(null); }
  };
  const tasks = plan?.tasks || [], done = tasks.filter(task => task.done).length;
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const summary = readingSummary(papers || []);
  const queued = (papers || []).filter(paper => (paper.readingStatus || 'To read') === filter);
  const exportBrief = () => {
    const blob = new Blob([supervisorBrief(plan, papers)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'thesis-progress-brief.txt'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(dirty ? 'Brief downloaded with your current unsaved edits. Save the roadmap to keep them.' : 'Progress brief downloaded. Review it before sharing.');
  };
  return <div className="research-workspace">
    <div className="workspace-main">
      <section className="workspace-panel roadmap-panel" aria-labelledby="roadmap-heading">
        <div className="workspace-section-header"><div><div className="workspace-eyebrow"><Flag size={15} /> From a question to a contribution</div><h2 id="roadmap-heading" className="workspace-title">Your thesis, one step at a time.</h2></div><span className="workspace-pill">{dirty ? 'Unsaved changes' : plan?.updatedAt ? 'Saved in your account' : 'Make it yours'}</span></div>
        {planError && <div role="alert" className="workspace-error">{planError}{(!plan || conflict) && <button type="button" onClick={loadPlan} className="underline mt-2 block">{conflict ? 'Replace my draft with the saved version' : 'Retry loading roadmap'}</button>}</div>}
        {!plan && !planError && <p role="status" className="workspace-muted">Loading your roadmap…</p>}
        {plan && <>
          <fieldset disabled={saving} className="space-y-4 min-w-0">
            <div className="roadmap-fields"><div><label htmlFor="roadmap-title">Working title</label><input id="roadmap-title" maxLength={180} value={plan.title} onChange={event => edit({ title: event.target.value })} placeholder="What question will your thesis answer?" /></div><div><label htmlFor="roadmap-date">Target date <span className="font-normal">(optional)</span></label><input id="roadmap-date" type="date" value={plan.targetDate} onChange={event => edit({ targetDate: event.target.value })} /></div></div>
            <div><label htmlFor="roadmap-goal">The outcome I’m working toward</label><textarea id="roadmap-goal" rows={2} maxLength={1200} value={plan.goal} onChange={event => edit({ goal: event.target.value })} placeholder="A clear goal makes the next step easier." /></div>
            <div className="roadmap-progress"><div className="flex justify-between gap-2 text-xs mb-2"><span>{done} of {tasks.length} milestones complete</span><strong>{progress}%</strong></div><div role="progressbar" aria-label="Roadmap completion" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="roadmap-track"><span style={{ width: `${progress}%` }} /></div></div>
            <ol className="milestone-list">{tasks.map((task, index) => <li key={task.id} className={task.done ? 'milestone-done' : ''}>
              <label className="milestone-toggle"><input type="checkbox" checked={task.done} aria-label={`Complete ${task.title}`} onChange={event => edit({ tasks: tasks.map(item => item.id === task.id ? { ...item, done: event.target.checked } : item) })} /><span aria-hidden="true">{task.done ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span></label>
              <span className="milestone-label">{task.title}</span>
              <button type="button" className="milestone-remove" aria-label={`Remove ${task.title}`} onClick={() => edit({ tasks: tasks.filter(item => item.id !== task.id) })}><Trash2 size={14} /></button>
            </li>)}</ol>
            <form className="milestone-add" onSubmit={event => { event.preventDefault(); if (!newTask.trim() || tasks.length >= 24) return; edit({ tasks: [...tasks, { id: crypto.randomUUID(), title: newTask.trim(), done: false }] }); setNewTask(''); }}>
              <input aria-label="New milestone" maxLength={120} value={newTask} onChange={event => setNewTask(event.target.value)} placeholder={tasks.length >= 24 ? '24 milestone limit reached' : 'Add your own milestone…'} disabled={tasks.length >= 24 || saving} /><button type="submit" className="workspace-button" disabled={!newTask.trim() || tasks.length >= 24}><Plus size={16} /><span>Add</span></button>
            </form>
          </fieldset>
          <div className="roadmap-footer"><p className="workspace-muted">Your checklist tracks progress. It does not assess research quality.</p><button type="button" disabled={!dirty || saving || conflict} onClick={save} className="workspace-button workspace-primary"><Save size={16} />{saving ? 'Saving…' : 'Save roadmap'}</button></div>
        </>}
        {notice && <p role="status" className="workspace-success">{notice}</p>}
      </section>

      <section className="workspace-panel reading-panel" aria-labelledby="reading-heading">
        <div className="workspace-section-header"><div><div className="workspace-eyebrow"><BookOpen size={15} /> Keep the good ideas moving</div><h2 id="reading-heading" className="workspace-title">Your reading shelf</h2></div><button type="button" aria-label="Refresh reading shelf" className="workspace-button" onClick={loadPapers}><RefreshCw size={15} /></button></div>
        {paperError && <p role="alert" className="workspace-error">{paperError}</p>}
        <div className="reading-tabs" role="group" aria-label="Filter reading shelf">{['Reading', 'To read', 'Reviewed', 'To cite'].map(status => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}<span>{papers ? summary[status] : '—'}</span></button>)}</div>
        {!papers && !paperError ? <p role="status" className="workspace-muted">Loading your papers…</p> : papers && !queued.length ? <div className="reading-empty"><BookOpen size={25} /><h3>{filter === 'Reading' ? 'Make room for your next good read.' : `No papers marked “${filter}” yet.`}</h3><p className="workspace-muted">{filter === 'Reading' && summary['To read'] ? 'Your saved papers are waiting. Choose one to begin.' : 'Save papers from discovery, then give each one a place in your reading workflow.'}</p><button type="button" className="workspace-button" onClick={() => filter === 'Reading' && summary['To read'] ? setFilter('To read') : onDiscover?.()}>{filter === 'Reading' && summary['To read'] ? 'Choose from my queue' : 'Find a paper'}<ArrowRight size={15} /></button></div> :
          <ul className="reading-list">{queued.slice(0, 4).map(paper => <li key={paper.paperId}><div className="reading-spine" aria-hidden="true"><BookOpen size={19} /></div><div className="min-w-0 flex-1"><button type="button" className="reading-paper-title" onClick={() => onReadPaper?.(paper)}>{paper.title}</button><p className="workspace-muted">{paper.authors || 'Author not recorded'}{paper.year ? ` · ${paper.year}` : ''}</p><div className="reading-paper-actions"><label className="sr-only" htmlFor={`reading-${paper.paperId}`}>Reading status for {paper.title}</label><select id={`reading-${paper.paperId}`} disabled={busyPaper !== null} value={paper.readingStatus || 'To read'} onChange={event => changeStatus(paper, event.target.value)}>{['To read', 'Reading', 'Reviewed', 'To cite'].map(status => <option key={status}>{status}</option>)}</select><button type="button" onClick={() => onReadPaper?.(paper)} className="workspace-text-button">Open paper<ChevronRight size={14} /></button></div></div></li>)}</ul>}
        <button type="button" onClick={onOpenSavedPapers} className="workspace-text-button mt-5">Open my full library{papers ? ` (${papers.length})` : ''}<ArrowRight size={15} /></button>
      </section>
    </div>
    <aside className="workspace-side" aria-label="Research companion tools">
      <FocusSession nextStep={tasks.find(task => !task.done)?.title} />
      <section className="workspace-panel brief-panel"><div className="workspace-eyebrow"><Download size={15} /> Ready for your next check-in</div><h3 className="workspace-title">Walk in with a clear update.</h3><p className="workspace-muted">Download your goal, milestones and reading progress as a brief for your supervisor. You decide when and where to share it.</p><button type="button" disabled={!plan || !papers} onClick={exportBrief} className="workspace-button mt-5"><Download size={16} />Download progress brief</button></section>
    </aside>
  </div>;
}
