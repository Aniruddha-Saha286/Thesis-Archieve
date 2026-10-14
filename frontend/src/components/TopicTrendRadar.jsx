import React, { useEffect, useState } from 'react';
import axios from 'axios';
export default function TopicTrendRadar({ onTopic }) {
  const [data, setData] = useState(null);
  useEffect(() => { const controller = new AbortController(); axios.get('/api/research/trends', { signal: controller.signal }).then(r => setData(r.data)).catch(() => {}); return () => controller.abort(); }, []);
  if (!data?.topics?.length) return null;
  return <details className="rounded-2xl border border-[#E2DFD8] dark:border-[#383530] bg-white dark:bg-[#151413] p-4">
    <summary className="cursor-pointer text-sm font-semibold">Archive topic activity · this month</summary>
    <p className="text-xs text-[#737067] dark:text-[#9A968D] my-3">{data.basis}</p>
    <div className="flex flex-wrap gap-2">{data.topics.filter(t => t._id).map(t => <button type="button" key={t._id} onClick={() => onTopic(t._id)} className="rounded-full border px-3 py-2 text-sm hover:border-emerald-600">{t._id} <span className="text-xs">· {t.papers} papers</span></button>)}</div>
  </details>;
}
