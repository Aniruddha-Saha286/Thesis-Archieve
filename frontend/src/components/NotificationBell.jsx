import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Bell, Check, MessageSquare, X } from 'lucide-react';
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
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
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
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop on mobile screens to prevent background tap & overlap collision */}
          <div
            className="fixed inset-0 bg-neutral-950/40 backdrop-blur-2xs z-40 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-label="Notifications"
            className="notification-panel fixed left-3 right-3 sm:left-auto sm:right-0 sm:absolute sm:top-full sm:mt-1.5 sm:w-[22rem] bg-white dark:bg-[#1C1A18] border border-[#D5D1C7] dark:border-[#383530] rounded-xl shadow-2xl z-50 font-sans flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-[#F2EFE8] dark:border-[#2A2824]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-[#1C1B18] dark:text-[#FAF9F5] truncate">Notifications</span>
                {unread > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs min-h-[36px] px-2 py-1 text-[#605D55] dark:text-[#B3AFA6] hover:text-[#1C1B18] dark:hover:text-white underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Mark all read</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="min-w-9 min-h-9 flex items-center justify-center rounded-lg text-[#605D55] dark:text-[#B3AFA6] hover:bg-[#F2EFE8] dark:hover:bg-[#252320] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-rose-600'}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="min-w-0 font-semibold text-[#1C1B18] dark:text-[#FAF9F5] leading-snug break-words">{n.title}</span>
                              <span className="shrink-0 text-[11px] text-[#8C887E] dark:text-[#736E66] mt-0.5">{timeAgo(n.createdAt)}</span>
                            </div>
                            <p className="text-[#524F47] dark:text-[#B3AFA6] leading-relaxed break-words">{n.message}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
                              {action && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!n.read) markRead(n._id);
                                    setOpen(false);
                                    action.run();
                                  }}
                                  className="inline-flex items-center gap-1 min-h-[32px] py-1 underline font-semibold text-[#1C1B18] dark:text-[#FAF9F5] cursor-pointer"
                                >
                                  {n.type === 'feedback_reply' && <MessageSquare className="w-3 h-3" />}
                                  <span>{action.label}</span>
                                </button>
                              )}
                              {!n.read && (
                                <button
                                  type="button"
                                  onClick={() => markRead(n._id)}
                                  className="inline-flex items-center min-h-[32px] py-1 underline text-[#605D55] dark:text-[#9E9A90] cursor-pointer"
                                >
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
        </>
      )}
    </div>
  );
}
