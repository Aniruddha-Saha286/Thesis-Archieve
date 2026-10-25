import React, { useState, useEffect } from 'react';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { useSocket } from '../context/SocketContext';
import axios from 'axios';
import { Bell, Plus, Trash2, RefreshCw, Sparkles, X } from 'lucide-react';

export default function TopicAlertsModal({ isOpen, onClose, initialTopic = '' }) {
  useEscapeToClose(onClose, isOpen);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkingAlerts, setCheckingAlerts] = useState(false);
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('All Disciplines');
  const [publicationType, setPublicationType] = useState('');
  const { notificationTick, isConnected } = useSocket();
  const [creating, setCreating] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);
  const [notice, setNotice] = useState(null);

  const showNotice = (message, type = 'info') => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 3500);
  };

  const fetchAlertsAndNotifications = async () => {
    try {
      setLoading(true);
      const [alertsRes, notifsRes] = await Promise.all([
        axios.get('/api/user/alerts'),
        axios.get('/api/user/notifications'),
      ]);
      setAlerts(alertsRes.data || []);
      setNotifications((notifsRes.data || []).filter(n => n.type === 'topic_alert'));
    } catch (err) {
      showNotice('Follows could not be loaded. Reopen this panel to retry.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAlertsAndNotifications();
    }
  }, [isOpen, notificationTick]);

  useEffect(() => { if (isOpen) setTopic(initialTopic); }, [isOpen, initialTopic]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;

    try {
      setCreating(true);
      const res = await axios.post('/api/user/alerts', {
        topic: topic.trim(),
        category,
        publicationType,
      });
      setAlerts(res.data.alerts || []);
      setTopic('');
      showNotice('Topic alert created successfully.', 'success');
    } catch (err) {
      showNotice(err.response?.data?.message || 'Failed to create topic alert.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await axios.delete(`/api/user/alerts/${id}`);
      setAlerts(res.data.alerts || []);
      showNotice('Topic alert removed.', 'success');
    } catch (err) {
      showNotice('Failed to remove topic alert.', 'error');
    }
  };

  const handleCheckNow = async () => {
    try {
      setCheckingAlerts(true);
      setCheckStatus(null);
      const res = await axios.post('/api/user/alerts/check');
      setCheckStatus(res.data.sourceWarnings?.length
        ? `Some online sources could not be checked (${res.data.sourceWarnings.join(', ')}). Other available matches were saved. Try again shortly.`
        : res.data.notificationsCreated > 0
        ? `Found new papers! Generated ${res.data.notificationsCreated} notification(s).`
        : 'Scan complete: no new matches in the available index. Source delays may limit coverage.'
      );
      await fetchAlertsAndNotifications();
    } catch (err) {
      setCheckStatus(err.response?.data?.message || 'The scan could not finish. Please try again.');
    } finally {
      setCheckingAlerts(false);
    }
  };

  const handleMarkRead = async (notifId) => {
    try {
      await axios.put(`/api/user/notifications/${notifId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notifId ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Topic alerts" className="topic-alert-dialog bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-2xl w-full max-w-xl p-5 sm:p-6 shadow-2xl relative max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between gap-3 shrink-0 pb-3 border-b border-[#E2DFD8] dark:border-[#2C2A26]">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <h2 className="text-xl font-serif-title text-[#1C1B18] dark:text-[#F0EDE6]">Topic alerts</h2>
              <span className="text-xs font-mono-meta text-[#737067] dark:text-[#9C988F]">
                New research, in your inbox.
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close topic alerts"
            className="shrink-0 w-10 flex items-center justify-center text-[#737067] dark:text-[#9C988F] hover:text-[#1C1B18] dark:hover:text-[#F0EDE6] cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {notice && (
          <div role="status" className={`mt-3 px-3 py-2 text-xs font-mono-meta flex items-center justify-between shrink-0 rounded-sm border ${
            notice.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
          }`}>
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)} className="cursor-pointer text-xs ml-2 hover:opacity-75">✕</button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-4">
          <div className="rounded-xl bg-[#EAF3ED] dark:bg-[#1c3025] p-4 border border-emerald-800/10">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-serif-title text-2xl text-[#254B40] dark:text-emerald-200">Your next paper. Found for you.</h3><span className="text-xs text-emerald-800 dark:text-emerald-300">{isConnected ? 'Live delivery connected' : 'Inbox refreshes every minute'}</span></div>
            <p className="text-xs leading-relaxed text-[#456350] dark:text-emerald-100/80 mt-2">We check followed topics every 15 minutes and deliver notifications here. Online scans sample up to 50 recent OpenAlex publications from the past 30 days, plus the archive and indexed venues. Coverage and source delays vary.</p>
          </div>
          {/* Add New Alert Form */}
          <form onSubmit={handleCreate} className="p-3.5 bg-[#FAF9F5] dark:bg-[#201F1C] border border-[#D5D1C7] dark:border-[#2C2A26] rounded-sm space-y-3 text-xs">
            <div className="font-bold text-[#1C1B18] dark:text-[#F0EDE6] font-mono-meta text-[11px] uppercase tracking-wider">
              Follow a research topic
            </div>
            <div>
              <label htmlFor="alert-topic" className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Topic or keywords</label>
              <input
                type="text"
                id="alert-topic"
                maxLength={150}
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Perovskite degradation, Transformer attention efficiency, Microcredit impact..."
                className="w-full bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-xs text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none focus:border-[#1C1B18] dark:focus:border-[#9C988F]"
              />
            </div>
            <div>
              <label htmlFor="alert-paper-type" className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Publication type</label>
              <select id="alert-paper-type" value={publicationType} onChange={event => setPublicationType(event.target.value)} className="w-full bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#383530] px-3 py-2 rounded-lg">
                <option value="">All papers and theses</option><option value="thesis">Theses and dissertations only</option>
              </select>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 min-w-0">
                <label htmlFor="alert-discipline" className="block font-medium text-[#1C1B18] dark:text-[#E8E6E1] mb-1">Discipline filter</label>
                <select
                  value={category}
                  id="alert-discipline"
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-white dark:bg-[#1A1916] border border-[#D5D1C7] dark:border-[#383530] px-3 py-1.5 text-xs text-[#1C1B18] dark:text-[#F0EDE6] rounded-sm focus:outline-none"
                >
                  <option value="All Disciplines">All Disciplines</option>
                  <option value="Artificial Intelligence and Machine Learning">AI & machine learning</option>
                  <option value="Natural Language Processing">Natural language processing</option>
                  <option value="Renewable Energy & Materials">Renewable Energy & Materials</option>
                  <option value="Biomedical & Clinical Science">Biomedical & clinical science</option>
                  <option value="Development Economics">Development economics</option>
                </select>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-[#1C1B18] dark:bg-amber-600 hover:bg-[#2E2C28] dark:hover:bg-amber-700 text-white px-4 py-1.5 rounded-sm font-mono-meta flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creating ? 'Subscribing...' : 'Add Alert'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Trigger Alert Check & Status Banner */}
          <div className="flex items-center justify-between p-2.5 bg-blue-50/50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-sm text-xs font-mono-meta">
            <div>
              <span className="font-bold text-blue-950 dark:text-blue-300">Active Alerts: {alerts.length}</span>
              {checkStatus && (
                <div className="text-[11px] text-blue-900 dark:text-blue-400 mt-0.5">{checkStatus}</div>
              )}
            </div>
            <button
              onClick={handleCheckNow}
              disabled={checkingAlerts || alerts.length === 0}
              className="bg-blue-900 dark:bg-blue-700 hover:bg-blue-950 dark:hover:bg-blue-800 text-white px-3 py-1 rounded-sm text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${checkingAlerts ? 'animate-spin' : ''}`} />
              <span>{checkingAlerts ? 'Scanning...' : 'Check Matches Now'}</span>
            </button>
          </div>

          {/* Active Subscriptions List */}
          <div>
            <h3 className="font-serif-title text-base text-[#1C1B18] dark:text-[#F0EDE6] mb-2">Your Active Topic Alerts ({alerts.length})</h3>
            {loading ? (
              <div className="p-4 text-center text-xs font-mono-meta text-[#737067] dark:text-[#9C988F]">Loading subscriptions...</div>
            ) : alerts.length === 0 ? (
              <div className="p-6 bg-white dark:bg-[#201F1C] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-sm text-center text-xs text-[#737067] dark:text-[#9C988F] font-mono-meta">
                No active topic alerts yet. Add an inquiry keyword above to receive automated research notifications.
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((al) => (
                  <div
                    key={al._id}
                    className="p-3 bg-white dark:bg-[#201F1C] border border-[#E2DFD8] dark:border-[#2C2A26] rounded-sm flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-serif-title text-base text-[#1C1B18] dark:text-[#F0EDE6]">{al.topic}</div>
                      {!al.venueId && <p className={`text-xs ${al.onlineCheckStatus === 'unavailable' ? 'text-amber-700 dark:text-amber-300' : 'text-[#737067] dark:text-[#9C988F]'}`}>
                        {al.onlineCheckStatus === 'unavailable' ? 'OpenAlex unavailable. Retrying on the next scan.' : al.onlineCheckStatus === 'disabled' ? 'Online scans are disabled in offline mode.' : al.onlineCheckedAt ? `Online checked: ${new Date(al.onlineCheckedAt).toLocaleString()}${al.onlineCheckStatus === 'limited' ? ' · Newest 50 source results' : ''}` : 'Waiting for the first online scan.'}
                      </p>}
                      {al.venueId && <p>Venue: {al.venueId.toUpperCase()} · External indexed papers</p>}
                      <div className="text-[11px] font-mono-meta text-[#737067] dark:text-[#9C988F] flex flex-wrap items-center gap-2">
                        <span>Discipline: <strong>{al.category}</strong></span>
                        <span>•</span>
                        <span>Last index scan: {al.externalCheckedAt ? new Date(al.externalCheckedAt).toLocaleDateString() : 'Pending first scan'}</span>
                      </div>
                    </div>

                    {al.publicationType === 'thesis' && <span className="text-xs text-emerald-800 dark:text-emerald-300">Theses only</span>}
                    <button
                      onClick={() => handleDelete(al._id)}
                      className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 font-mono-meta text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications Generated by Alerts */}
          {notifications.length > 0 && (
            <div className="border-t border-[#E2DFD8] dark:border-[#2C2A26] pt-3">
              <h3 className="font-serif-title text-base text-[#1C1B18] dark:text-[#F0EDE6] mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Recent Research Alert Matches ({notifications.length})</span>
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className={`p-3 rounded-sm border text-xs font-mono-meta flex items-start justify-between gap-2 ${
                      notif.read
                        ? 'bg-[#FAF9F5] dark:bg-[#1E1D1A] border-[#E2DFD8] dark:border-[#2C2A26] text-[#737067] dark:text-[#9C988F]'
                        : 'bg-white dark:bg-[#24221E] border-amber-300 dark:border-amber-700 text-[#1C1B18] dark:text-[#F0EDE6] shadow-2xs'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        {!notif.read && <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>}
                        <span>{notif.title}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#5C5950] dark:text-[#C5C1B8]">{notif.message}</p>
                      {notif.link && (
                        <a
                          href={notif.link}
                          className="text-blue-800 dark:text-blue-400 underline text-[11px] font-bold flex items-center gap-1 mt-1"
                        >
                          View matching papers ↗
                        </a>
                      )}
                    </div>

                    {!notif.read && (
                      <button
                        onClick={() => handleMarkRead(notif._id)}
                        className="text-[11px] text-blue-800 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
