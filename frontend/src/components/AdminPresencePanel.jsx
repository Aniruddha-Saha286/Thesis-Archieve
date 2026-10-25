import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, RefreshCw, Users } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function AdminPresencePanel() {
  const { socket, isConnected } = useSocket();
  const [snapshot, setSnapshot] = useState(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    const receive = data => {
      if (!alive) return;
      setSnapshot(previous => !previous || Date.parse(data.updatedAt) >= Date.parse(previous.updatedAt) ? data : previous);
      setFailed(false); setClock(Date.now());
    };
    const load = () => axios.get('/api/admin/presence').then(({ data }) => receive(data)).catch(() => { if (alive) setFailed(true); });
    load();
    socket?.on('admin:presence', receive);
    socket?.emit('presence:subscribe');
    const timer = setInterval(() => { setClock(Date.now()); if (!isConnected) load(); }, 15000);
    return () => { alive = false; clearInterval(timer); socket?.off('admin:presence', receive); };
  }, [socket, isConnected]);

  const stale = failed || !snapshot || clock - Date.parse(snapshot.updatedAt) > 45000;
  const users = snapshot?.users || [];
  return (
    <section aria-label="Live member activity" className="mb-6 overflow-hidden rounded-2xl border border-emerald-900/15 dark:border-emerald-700/30 bg-white dark:bg-[#191e1b] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-emerald-50 dark:bg-emerald-950 p-2.5 text-emerald-800 dark:text-emerald-300"><Activity size={22} /></span>
          <div>
            <h2 className="text-lg font-semibold text-[#1C1B18] dark:text-[#F0EDE6]">Research pulse</h2>
            <p className="text-xs mt-1 text-[#605D55] dark:text-[#B3AFA6]">Who is here, right now</p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <span className="text-[#605D55] dark:text-[#B3AFA6]"><strong className="text-2xl text-emerald-800 dark:text-emerald-300 mr-1">{stale ? '—' : snapshot.active}</strong> active</span>
          <span className="text-[#605D55] dark:text-[#B3AFA6]"><strong className="text-2xl mr-1">{stale ? '—' : snapshot.away}</strong> away</span>
          <span role="status" className={`inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 ${stale ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}`}>
            {stale ? <RefreshCw size={12} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}{stale ? 'Reconnecting' : isConnected ? 'Live' : 'Refreshing every 15s'}
          </span>
        </div>
      </div>
      <details onToggle={event => setExpanded(event.currentTarget.open)} className="border-t border-[#E2DFD8] dark:border-[#383530]">
        <summary className="cursor-pointer px-5 py-3 text-sm text-[#254B40] dark:text-emerald-300 font-medium">{expanded ? 'Hide members' : 'Show connected members'}{!stale && ` (${users.length})`}</summary>
        <div className="px-5 pb-4">
          {stale ? <p className="text-sm text-amber-800 dark:text-amber-300">Activity data is unavailable. Retrying automatically.</p> : users.length === 0 ? <p className="text-sm text-[#737067]">No signed-in members are connected.</p> :
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" aria-label="Connected members">
              {users.map(member => <li key={member.userId} className="flex items-center gap-3 rounded-xl p-3 bg-[#F6F8F5] dark:bg-[#222b25] min-w-0">
                <Users size={16} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate text-[#1C1B18] dark:text-[#F0EDE6]">{member.name}</p><p className="text-xs capitalize text-[#737067] dark:text-[#B3AFA6]">{member.role}</p></div>
                <span className={`text-xs shrink-0 ${member.state === 'active' ? 'text-emerald-700 dark:text-emerald-300' : 'text-[#737067] dark:text-[#B3AFA6]'}`}>{member.state === 'active' ? 'Active now' : 'Away'}</span>
              </li>)}
            </ul>}
          <p className="text-xs text-[#737067] dark:text-[#B3AFA6] mt-3 leading-relaxed">Active means a visible tab with activity in the past 2 minutes. Multiple tabs count as one member. Anonymous visitors are excluded; disconnected sessions expire within 75 seconds.</p>
        </div>
      </details>
    </section>
  );
}
