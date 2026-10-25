import React, { useEffect, useState } from 'react';
import { Timer, Play, Pause, RotateCcw, Check } from 'lucide-react';

export default function FocusSession({ nextStep }) {
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [deadline, setDeadline] = useState(null);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { setDeadline(null); setFinished(true); }
    };
    tick(); const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);
  const reset = value => { setMinutes(value); setRemaining(value * 60); setDeadline(null); setFinished(false); };
  const pause = () => { setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))); setDeadline(null); };
  const start = () => { const seconds = remaining || minutes * 60; setRemaining(seconds); setFinished(false); setDeadline(Date.now() + seconds * 1000); };
  return <section className="focus-session workspace-panel" aria-label="Research focus timer">
    <div className="workspace-eyebrow"><Timer size={15} /> A little focus goes a long way</div>
    <h3 className="workspace-title">One paper. One clear thought.</h3>
    <p className="workspace-muted">{nextStep ? `Make time for: ${nextStep}` : 'Set aside a little time to read, think or write.'}</p>
    <div className="focus-clock" role="timer" aria-label="Time remaining">{String(Math.floor(remaining / 60)).padStart(2, '0')}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div>
    <div className="focus-presets" role="group" aria-label="Session duration">{[15, 25, 45].map(value => <button key={value} type="button" disabled={Boolean(deadline)} aria-pressed={minutes === value} onClick={() => reset(value)}>{value} min</button>)}</div>
    <div className="flex gap-2 mt-4"><button type="button" className="workspace-button workspace-primary flex-1" onClick={deadline ? pause : start}>{deadline ? <Pause size={16} /> : <Play size={16} />}{deadline ? 'Pause session' : remaining < minutes * 60 && remaining > 0 ? 'Resume focus' : 'Start focus'}</button><button type="button" className="workspace-button" aria-label="Reset focus timer" onClick={() => reset(minutes)}><RotateCcw size={16} /></button></div>
    <p role="status" className="workspace-muted mt-3">{finished ? <><Check size={14} className="inline mr-1" />Session complete. Capture one takeaway in your paper notes.</> : 'Your timer stays running while you explore this workspace. Reloading resets it.'}</p>
  </section>;
}
