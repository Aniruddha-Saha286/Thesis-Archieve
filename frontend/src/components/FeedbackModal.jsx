import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X, Send, MessageSquare, CheckCircle2, Loader2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { timeAgo } from '../utils/timeAgo';

const CATEGORIES = [
  { value: 'bug', label: 'Something is not working' },
  { value: 'idea', label: 'Idea or suggestion' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other' },
];

const STATUS_WORDS = {
  new: { label: 'Sent', tone: 'bg-[#F2EFE8] dark:bg-[#2A2824] text-[#524F47] dark:text-[#B3AFA6] border-[#D5D1C7] dark:border-[#383530]' },
  in_progress: { label: 'Being looked at', tone: 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  answered: { label: 'Answered', tone: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' },
  closed: { label: 'Closed', tone: 'bg-[#F2EFE8] dark:bg-[#2A2824] text-[#524F47] dark:text-[#B3AFA6] border-[#D5D1C7] dark:border-[#383530]' },
};

const MIN_LENGTH = 5;
const MAX_LENGTH = 2000;

export default function FeedbackModal({ isOpen, onClose, pageContext = '' }) {
  useEscapeToClose(onClose, isOpen);
  const { notificationTick } = useSocket();

  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [justSent, setJustSent] = useState(false);

  const [mine, setMine] = useState([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [mineFailed, setMineFailed] = useState(false);

  const loadMine = useCallback(async () => {
    try {
      setLoadingMine(true);
      const res = await axios.get('/api/feedback/mine');
      const list = Array.isArray(res.data?.feedback) ? res.data.feedback : [];
      setMine(list);
      setMineFailed(false);
      list
        .filter((item) => item.adminReply && !item.userSeenReply)
        .forEach((item) => {
          axios.put(`/api/feedback/${item._id}/seen`).catch(() => {});
        });
    } catch (err) {
      setMineFailed(true);
    } finally {
      setLoadingMine(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setJustSent(false);
      loadMine();
    }
  }, [isOpen, loadMine, notificationTick]);

  if (!isOpen) return null;

  const trimmedLength = message.trim().length;
  const canSend = trimmedLength >= MIN_LENGTH && trimmedLength <= MAX_LENGTH && !sending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    try {
      setSending(true);
      setError('');
      const res = await axios.post('/api/feedback', { category, message: message.trim(), pageContext });
      setMessage('');
      setJustSent(true);
      if (res.data?.feedback) setMine((prev) => [res.data.feedback, ...prev]);
    } catch (err) {
      setError(err.response?.data?.message || 'Your message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      className="fixed inset-0 z-50 bg-neutral-950/70 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col text-[#1C1B18] dark:text-[#F0EDE6]">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#E2DFD8] dark:border-[#2C2A26] shrink-0">
          <div>
            <h2 id="feedback-title" className="text-lg font-serif-title flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              <span>Message the team</span>
            </h2>
            <p className="text-xs text-[#605D55] dark:text-[#A8A49C] mt-0.5">
              Report a problem, suggest something, or ask a question. Replies appear here and under the bell.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="text-[#605D55] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] hover:bg-[#F2EFE8] dark:hover:bg-[#2A2824] rounded-sm cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center -mr-2 -mt-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="feedback-category" className="block text-xs font-semibold mb-1">What is it about?</label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-2 text-sm rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="feedback-message" className="block text-xs font-semibold mb-1">Your message</label>
              <textarea
                id="feedback-message"
                rows={4}
                value={message}
                maxLength={MAX_LENGTH}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setJustSent(false);
                }}
                placeholder="What happened, and what did you expect? For a problem, say which page and what you clicked."
                className="w-full bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#383530] px-3 py-2 text-sm rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-amber-400 placeholder-[#8C887E] dark:placeholder-[#736E66]"
              />
              <div className="flex items-center justify-between text-[11px] text-[#737067] dark:text-[#9C988F] mt-0.5">
                <span>{trimmedLength > 0 && trimmedLength < MIN_LENGTH ? 'A few more words, please.' : ''}</span>
                <span>{trimmedLength} / {MAX_LENGTH}</span>
              </div>
            </div>

            {error && (
              <div role="alert" className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-sm">
                {error}
              </div>
            )}
            {justSent && (
              <div role="status" className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs rounded-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Sent. The team will reply here.</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!canSend}
                className="min-h-[40px] bg-[#1C1B18] hover:bg-[#2E2C28] dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-neutral-950 px-4 py-2 rounded-sm text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{sending ? 'Sending…' : 'Send'}</span>
              </button>
            </div>
          </form>

          <div className="border-t border-[#F0ECE1] dark:border-[#2C2A26] pt-4 space-y-2.5">
            <h3 className="text-xs font-mono-meta font-bold uppercase tracking-wider text-[#605D55] dark:text-[#9C988F]">
              Your messages {mine.length > 0 ? `(${mine.length})` : ''}
            </h3>

            {loadingMine && mine.length === 0 ? (
              <p className="text-xs text-[#737067] dark:text-[#9C988F]">Loading…</p>
            ) : mineFailed && mine.length === 0 ? (
              <p className="text-xs text-[#737067] dark:text-[#9C988F]">
                Your earlier messages could not be loaded.{' '}
                <button type="button" onClick={loadMine} className="underline font-semibold text-[#1C1B18] dark:text-[#F0EDE6] cursor-pointer">Try again</button>
              </p>
            ) : mine.length === 0 ? (
              <p className="text-xs text-[#737067] dark:text-[#9C988F]">You have not sent anything yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {mine.map((item) => {
                  const status = STATUS_WORDS[item.status] || STATUS_WORDS.new;
                  const categoryLabel = CATEGORIES.find((c) => c.value === item.category)?.label || 'Other';
                  return (
                    <li key={item._id} className="border border-[#E2DFD8] dark:border-[#2C2A26] rounded-sm p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold">{categoryLabel}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-[#8C887E] dark:text-[#736E66]">{timeAgo(item.createdAt)}</span>
                          <span className={`px-1.5 py-0.5 rounded-sm border text-[11px] ${status.tone}`}>{status.label}</span>
                        </span>
                      </div>
                      <p className="text-[#524F47] dark:text-[#B3AFA6] leading-relaxed whitespace-pre-line break-words">{item.message}</p>
                      {item.adminReply && (
                        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border-l-4 border-emerald-500 pl-3 pr-2 py-2 space-y-0.5">
                          <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300">
                            Reply from the team{item.repliedAt ? ` · ${timeAgo(item.repliedAt)}` : ''}
                          </div>
                          <p className="text-[#1C1B18] dark:text-[#F0EDE6] leading-relaxed whitespace-pre-line break-words">{item.adminReply}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
