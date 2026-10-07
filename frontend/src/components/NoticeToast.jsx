import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function NoticeToast() {
  const { realtimeNotice, clearRealtimeNotice } = useSocket();

  useEffect(() => {
    if (!realtimeNotice) return undefined;
    const isError = realtimeNotice.type === 'error';
    const timer = setTimeout(() => clearRealtimeNotice(), isError ? 9000 : 6000);
    return () => clearTimeout(timer);
  }, [realtimeNotice]);

  if (!realtimeNotice || !realtimeNotice.message) return null;
  const isError = realtimeNotice.type === 'error';

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-xl pointer-events-none">
      <div
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        className={`pointer-events-auto flex items-start justify-between gap-3 px-4 py-3 rounded-md border shadow-xl text-sm ${
          isError
            ? 'bg-red-50 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-100 dark:border-red-800'
            : 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800'
        }`}
      >
        <div className="flex items-start gap-2 min-w-0">
          {isError ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="break-words">{realtimeNotice.message}</span>
        </div>
        <button type="button" onClick={clearRealtimeNotice} className="p-0.5 shrink-0 hover:opacity-70 cursor-pointer" aria-label="Dismiss message">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
