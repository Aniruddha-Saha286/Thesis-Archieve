import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bell, Plus, Trash2, CheckCircle, Clock, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';

export default function TopicAlertsModal({ isOpen, onClose }) {
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkingAlerts, setCheckingAlerts] = useState(false);
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('All Disciplines');
  const [creating, setCreating] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchAlertsAndNotifications();
    }
  }, [isOpen]);

  const fetchAlertsAndNotifications = async () => {
    try {
      setLoading(true);
      const [alertsRes, notifsRes] = await Promise.all([
        axios.get('/api/user/alerts'),
        axios.get('/api/user/notifications'),
      ]);
      setAlerts(alertsRes.data || []);
      setNotifications(notifsRes.data || []);
    } catch (err) {
      console.error('Failed to load topic alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;

    try {
      setCreating(true);
      const res = await axios.post('/api/user/alerts', {
        topic: topic.trim(),
        category,
      });
      setAlerts(res.data.alerts || []);
      setTopic('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create topic alert.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await axios.delete(`/api/user/alerts/${id}`);
      setAlerts(res.data.alerts || []);
    } catch (err) {
      alert('Failed to remove topic alert.');
    }
  };

  const handleCheckNow = async () => {
    try {
      setCheckingAlerts(true);
      setCheckStatus(null);
      const res = await axios.post('/api/user/alerts/check');
      setCheckStatus(res.data.notificationsCreated > 0
        ? `Found new papers! Generated ${res.data.notificationsCreated} notification(s).`
        : 'Topic scan complete: No newly deposited papers since last check.'
      );
      fetchAlertsAndNotifications();
    } catch (err) {
      setCheckStatus('Error running alert check.');
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
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5D1C7] rounded-sm w-full max-w-xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DFD8]">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-xl font-serif-title text-[#1C1B18]">Scholarly Topic Alerts</h2>
              <span className="text-xs font-mono-meta text-[#737067]">
                Automated monitoring of newly deposited academic publications matching your inquiry
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#737067] hover:text-[#1C1B18] font-mono-meta text-xs cursor-pointer"
          >
            [✕ CLOSE]
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Add New Alert Form */}
          <form onSubmit={handleCreate} className="p-3.5 bg-[#FAF9F5] border border-[#D5D1C7] rounded-sm space-y-3 text-xs">
            <div className="font-bold text-[#1C1B18] font-mono-meta text-[11px] uppercase tracking-wider">
              Subscribe to New Topic Inquiry
            </div>
            <div>
              <label className="block font-medium text-[#1C1B18] mb-1">Inquiry Keyword / Search Query *</label>
              <input
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Perovskite degradation, Transformer attention efficiency, Microcredit impact..."
                className="w-full bg-white border border-[#D5D1C7] px-3 py-1.5 text-xs text-[#1C1B18] rounded-sm focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block font-medium text-[#1C1B18] mb-1">Discipline Filter</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-white border border-[#D5D1C7] px-3 py-1.5 text-xs text-[#1C1B18] rounded-sm focus:outline-none"
                >
                  <option value="All Disciplines">All Disciplines</option>
                  <option value="Computer Science & NLP">Computer Science & NLP</option>
                  <option value="Renewable Energy & Materials">Renewable Energy & Materials</option>
                  <option value="Biomedical & Neural Engineering">Biomedical & Neural Engineering</option>
                  <option value="Economics & Development">Economics & Development</option>
                  <option value="Other Disciplines">Other Disciplines</option>
                </select>
              </div>

              <div className="pt-5">
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-[#1C1B18] hover:bg-[#2E2C28] text-white px-4 py-1.5 rounded-sm font-mono-meta flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creating ? 'Subscribing...' : 'Add Alert'}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Trigger Alert Check & Status Banner */}
          <div className="flex items-center justify-between p-2.5 bg-blue-50/50 border border-blue-200 rounded-sm text-xs font-mono-meta">
            <div>
              <span className="font-bold text-blue-950">Active Alerts: {alerts.length}</span>
              {checkStatus && (
                <div className="text-[11px] text-blue-900 mt-0.5">{checkStatus}</div>
              )}
            </div>
            <button
              onClick={handleCheckNow}
              disabled={checkingAlerts || alerts.length === 0}
              className="bg-blue-900 hover:bg-blue-950 text-white px-3 py-1 rounded-sm text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${checkingAlerts ? 'animate-spin' : ''}`} />
              <span>{checkingAlerts ? 'Scanning...' : 'Check Matches Now'}</span>
            </button>
          </div>

          {/* Active Subscriptions List */}
          <div>
            <h3 className="font-serif-title text-base text-[#1C1B18] mb-2">Your Active Topic Alerts ({alerts.length})</h3>
            {loading ? (
              <div className="p-4 text-center text-xs font-mono-meta text-[#737067]">Loading subscriptions...</div>
            ) : alerts.length === 0 ? (
              <div className="p-6 bg-white border border-[#E2DFD8] rounded-sm text-center text-xs text-[#737067] font-mono-meta">
                No active topic alerts yet. Add an inquiry keyword above to receive automated research notifications.
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((al) => (
                  <div
                    key={al._id}
                    className="p-3 bg-white border border-[#E2DFD8] rounded-sm flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-serif-title text-base text-[#1C1B18]">{al.topic}</div>
                      <div className="text-[10px] font-mono-meta text-[#737067] flex items-center gap-2">
                        <span>Discipline: <strong>{al.category}</strong></span>
                        <span>•</span>
                        <span>Last scanned: {al.lastCheckedAt ? new Date(al.lastCheckedAt).toLocaleDateString() : 'Pending first scan'}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(al._id)}
                      className="text-red-700 hover:text-red-900 font-mono-meta text-xs flex items-center gap-1 cursor-pointer"
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
            <div className="border-t border-[#E2DFD8] pt-3">
              <h3 className="font-serif-title text-base text-[#1C1B18] mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Recent Research Alert Matches ({notifications.length})</span>
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className={`p-3 rounded-sm border text-xs font-mono-meta flex items-start justify-between gap-2 ${
                      notif.read ? 'bg-[#FAF9F5] border-[#E2DFD8] text-[#737067]' : 'bg-white border-amber-300 text-[#1C1B18] shadow-2xs'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        {!notif.read && <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>}
                        <span>{notif.title}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#5C5950]">{notif.message}</p>
                      {notif.link && (
                        <a
                          href={notif.link}
                          className="text-blue-800 underline text-[11px] font-bold flex items-center gap-1 mt-1"
                        >
                          View matching papers ↗
                        </a>
                      )}
                    </div>

                    {!notif.read && (
                      <button
                        onClick={() => handleMarkRead(notif._id)}
                        className="text-[10px] text-blue-800 hover:underline shrink-0 cursor-pointer"
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
