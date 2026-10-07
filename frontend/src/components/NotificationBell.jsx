import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Bell, Check, MessageSquare } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { timeAgo } from '../utils/timeAgo';

export default function NotificationBell({ onOpenFeedback, onOpenMembership, onOpenAlerts }) {
  const { notificationTick } = useSocket();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef(null);

  useEscapeToClose(() => setOpen(false), open);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/user/notifications');
      setItems(Array.isArray(res.data) ? res.data : []);
      setFailed(false);
    } catch (err) {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, notificationTick]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  const markRead = async (id) => {
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    try {
      await axios.put(`/api/user/notifications/${id}/read`);
    } catch (err) {
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await axios.put('/api/user/notifications/read-all');
    } catch (err) {
      load();
    }
  };

  const actionFor = (n) => {
    if (n.type === 'feedback_reply' && onOpenFeedback) return { label: 'Read the reply', run: onOpenFeedback };
    if (/^(payment_|membership_)/.test(n.type || '') && onOpenMembership) return { label: 'Open membership', run: onOpenMembership };
    if (n.type === 'topic_alert' && onOpenAlerts) return { label: 'Open alerts', run: onOpenAlerts };
    return null;
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
        className="relative p-1.5 rounded-sm bg-[#FAF9F5] hover:bg-[#F2EFE8] dark:bg-[#1C1A18] dark:hover:bg-[#252320] border border-[#D5D1C7] dark:border-[#383530] text-[#1C1B18] dark:text-[#FAF9F5] transition cursor-pointer shadow-2xs"
      >
        <Bell className="w-3.5 h-3.5" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-1.5 w-[min(22rem,calc(100vw-1.5rem))] bg-white dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] rounded-sm shadow-xl z-50 font-sans"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#F2EFE8] dark:border-[#2A2824]">
            <span className="text-sm font-semibold text-[#1C1B18] dark:text-[#FAF9F5]">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs text-[#605D55] dark:text-[#B3AFA6] hover:text-[#1C1B18] dark:hover:text-white underline cursor-pointer inline-flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="p-4 text-xs text-[#737067] dark:text-[#9E9A90]">Loading…</p>
            ) : failed && items.length === 0 ? (
              <div className="p-4 text-xs text-[#737067] dark:text-[#9E9A90] space-y-2">
                <p>Notifications could not be loaded.</p>
                <button type="button" onClick={load} className="underline font-semibold text-[#1C1B18] dark:text-[#FAF9F5] cursor-pointer">Try again</button>
              </div>
            ) : items.length === 0 ? (
              <p className="p-4 text-xs text-[#737067] dark:text-[#9E9A90] leading-relaxed">
                Nothing yet. Replies from the team, membership updates and topic alerts will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-[#F2EFE8] dark:divide-[#2A2824]">
                {items.map((n) => {
                  const action = actionFor(n);
                  return (
                    <li key={n._id} className={`px-3 py-2.5 text-xs ${n.read ? '' : 'bg-amber-50/60 dark:bg-amber-950/20'}`}>
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-rose-600'}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-[#1C1B18] dark:text-[#FAF9F5]">{n.title}</span>
                            <span className="shrink-0 text-[11px] text-[#8C887E] dark:text-[#736E66]">{timeAgo(n.createdAt)}</span>
                          </div>
                          <p className="text-[#524F47] dark:text-[#B3AFA6] leading-relaxed break-words">{n.message}</p>
                          <div className="flex items-center gap-3 pt-0.5">
                            {action && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!n.read) markRead(n._id);
                                  setOpen(false);
                                  action.run();
                                }}
                                className="inline-flex items-center gap-1 underline font-semibold text-[#1C1B18] dark:text-[#FAF9F5] cursor-pointer"
                              >
                                {n.type === 'feedback_reply' && <MessageSquare className="w-3 h-3" />}
                                <span>{action.label}</span>
                              </button>
                            )}
                            {!n.read && (
                              <button type="button" onClick={() => markRead(n._id)} className="underline text-[#605D55] dark:text-[#9E9A90] cursor-pointer">
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
