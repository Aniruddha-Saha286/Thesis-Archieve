import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { RefreshCw, Send, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { timeAgo } from '../utils/timeAgo';

const CATEGORY_LABELS = {
  bug: 'Something is not working',
  idea: 'Idea or suggestion',
  complaint: 'Complaint',
  question: 'Question',
  other: 'Other',
};

const STATUS_LABELS = { new: 'New', in_progress: 'In progress', answered: 'Answered', closed: 'Closed' };

const STATUS_TONE = {
  new: 'bg-amber-100 text-amber-900 border-amber-300',
  in_progress: 'bg-blue-50 text-blue-900 border-blue-300',
  answered: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  closed: 'bg-[#F2EFE8] text-[#524F47] border-[#D5D1C7]',
};

const FILTERS = [
  ['open', 'Open'],
  ['new', 'New'],
  ['in_progress', 'In progress'],
  ['answered', 'Answered'],
  ['closed', 'Closed'],
  ['', 'All'],
];

export default function AdminFeedbackPanel({ onCountsChange }) {
  const { showNotice, notificationTick } = useSocket();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ feedback: [], pagination: { page: 1, pages: 1, total: 0 }, counts: {} });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/feedback/admin', { params: { status, page, limit: 20 } });
      setData({
        feedback: Array.isArray(res.data?.feedback) ? res.data.feedback : [],
        pagination: res.data?.pagination || { page: 1, pages: 1, total: 0 },
        counts: res.data?.counts || {},
      });
      setFailed(false);
      if (onCountsChange) onCountsChange(res.data?.counts || {});
    } catch (err) {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [status, page, onCountsChange]);

  useEffect(() => {
    load();
  }, [load, notificationTick]);

  const update = async (item, body, successText) => {
    try {
      setBusyId(item._id);
      await axios.put(`/api/feedback/admin/${item._id}`, body);
      if (body.reply) setDrafts((prev) => ({ ...prev, [item._id]: '' }));
      showNotice(successText, 'info');
      await load();
    } catch (err) {
      showNotice(err.response?.data?.message || 'The change could not be saved.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const counts = data.counts || {};
  const countFor = (key) => {
    if (key === 'open') return (counts.new || 0) + (counts.in_progress || 0);
    if (key === '') return Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);
    return counts[key] || 0;
  };

  return (
    <div className="bg-white border border-[#E2DFD8] rounded-sm shadow-xs p-4 sm:p-6 space-y-4" data-testid="admin-feedback">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E2DFD8]">
        <div>
          <h2 className="text-xl font-serif-title text-[#1C1B18]">Messages from users</h2>
          <p className="text-xs text-[#737067]">
            Problems, ideas and questions sent with “Message the team”. Your reply reaches the user by notification and email.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-[#737067] hover:text-[#1C1B18] flex items-center gap-1 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex items-center gap-1 bg-[#FAF9F5] border border-[#D5D1C7] p-1 rounded-sm text-xs w-fit flex-wrap">
        {FILTERS.map(([key, label]) => (
          <button
            key={key || 'all'}
            type="button"
            onClick={() => {
              setStatus(key);
              setPage(1);
            }}
            aria-pressed={status === key}
            className={`px-2.5 py-1 rounded-xs cursor-pointer transition ${
              status === key ? 'bg-[#1C1B18] text-white font-bold' : 'text-[#605D55] hover:text-[#1C1B18]'
            }`}
          >
            {label} ({countFor(key)})
          </button>
        ))}
      </div>

      {loading && data.feedback.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#737067]">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading messages…
        </div>
      ) : failed ? (
        <div className="p-8 text-center text-xs text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm space-y-2">
          <p>The messages could not be loaded.</p>
          <button type="button" onClick={load} className="underline font-semibold text-[#1C1B18] cursor-pointer">Try again</button>
        </div>
      ) : data.feedback.length === 0 ? (
        <div className="p-10 text-center text-xs text-[#737067] bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm">
          <MessageSquare className="w-5 h-5 mx-auto mb-2 text-[#8C887E]" />
          No messages here.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.feedback.map((item) => {
            const draft = drafts[item._id] || '';
            const busy = busyId === item._id;
            return (
              <li key={item._id} className="p-4 bg-[#FAF9F5] border border-[#E2DFD8] rounded-sm space-y-2.5 text-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#1C1B18]">{CATEGORY_LABELS[item.category] || 'Other'}</div>
                    <div className="text-xs text-[#737067] break-all">
                      {item.userName || 'User'} · {item.userEmail} · {timeAgo(item.createdAt)}
                      {item.pageContext ? ` · sent from: ${item.pageContext}` : ''}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-sm border text-[11px] font-bold uppercase shrink-0 ${STATUS_TONE[item.status] || STATUS_TONE.closed}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>

                <p className="text-[#2E2C28] leading-relaxed whitespace-pre-line break-words">{item.message}</p>

                {item.adminReply && (
                  <div className="bg-white border-l-4 border-emerald-500 pl-3 pr-2 py-2 space-y-0.5 text-xs">
                    <div className="font-semibold text-emerald-900">
                      Reply{item.repliedByName ? ` by ${item.repliedByName}` : ''}{item.repliedAt ? ` · ${timeAgo(item.repliedAt)}` : ''}
                      {item.userSeenReply ? ' · seen by the user' : ' · not seen yet'}
                    </div>
                    <p className="text-[#1C1B18] leading-relaxed whitespace-pre-line break-words">{item.adminReply}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="sr-only" htmlFor={`reply-${item._id}`}>Reply to {item.userName || 'the user'}</label>
                  <textarea
                    id={`reply-${item._id}`}
                    rows={2}
                    maxLength={2000}
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [item._id]: e.target.value }))}
                    placeholder={item.adminReply ? 'Write a new reply (replaces the one above)' : 'Write a reply to the user'}
                    className="w-full bg-white border border-[#D5D1C7] px-3 py-2 text-sm text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={busy || draft.trim().length < 2}
                      onClick={() => update(item, { reply: draft.trim() }, 'Reply sent to the user.')}
                      className="min-h-[36px] px-3 py-1.5 bg-[#1C1B18] hover:bg-[#2E2C28] text-white rounded-sm text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send reply</span>
                    </button>
                    {item.status === 'new' && (
                      <button type="button" disabled={busy} onClick={() => update(item, { status: 'in_progress' }, 'Marked as in progress.')} className="min-h-[36px] px-3 py-1.5 bg-white border border-[#D5D1C7] hover:bg-[#F2EFE8] text-[#1C1B18] rounded-sm text-xs cursor-pointer disabled:opacity-50">
                        Mark in progress
                      </button>
                    )}
                    {item.status !== 'closed' ? (
                      <button type="button" disabled={busy} onClick={() => update(item, { status: 'closed' }, 'Message closed.')} className="min-h-[36px] px-3 py-1.5 bg-white border border-[#D5D1C7] hover:bg-[#F2EFE8] text-[#1C1B18] rounded-sm text-xs cursor-pointer disabled:opacity-50">
                        Close
                      </button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => update(item, { status: 'in_progress' }, 'Message reopened.')} className="min-h-[36px] px-3 py-1.5 bg-white border border-[#D5D1C7] hover:bg-[#F2EFE8] text-[#1C1B18] rounded-sm text-xs cursor-pointer disabled:opacity-50">
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.pagination.pages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#605D55] pt-2 border-t border-[#E2DFD8]">
          <span>Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} messages</span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2.5 py-1 border border-[#D5D1C7] rounded-sm flex items-center gap-1 cursor-pointer disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="px-2.5 py-1 border border-[#D5D1C7] rounded-sm flex items-center gap-1 cursor-pointer disabled:opacity-40">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
