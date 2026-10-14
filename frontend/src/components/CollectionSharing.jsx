import React, { useState } from 'react';
import axios from 'axios';
export default function CollectionSharing({ collection, onChange }) {
  const [token, setToken] = useState(collection.shareToken || ''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const link = token ? `${window.location.origin}/?collection=${token}` : '';
  const update = async revoke => {
    setBusy(true); setMessage('');
    try {
      const path = `/api/research/collections/${collection._id}/share`;
      const { data } = revoke ? await axios.delete(path) : await axios.post(path);
      const value = revoke ? '' : data.token; setToken(value); onChange?.({ ...collection, shareToken: value });
      setMessage(revoke ? 'Sharing turned off. The old link no longer works.' : 'Read-only link ready.');
    } catch (e) { setMessage(e.response?.data?.message || 'Could not update sharing.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-[#D5D1C7] dark:border-[#383530] p-3 space-y-2 text-sm">
    <h4 className="font-semibold">Share this reading list</h4>
    <p className="text-xs text-[#737067] dark:text-[#9A968D]">Anyone with the link can view the collection name, description and paper metadata. Your personal notes and account details stay private.</p>
    {link && <input aria-label="Read-only collection link" readOnly value={link} onFocus={e => e.target.select()} className="w-full rounded-lg border p-2 bg-white dark:bg-[#201F1C]" />}
    <div className="flex gap-3 flex-wrap">
      <button type="button" disabled={busy} onClick={() => update(Boolean(token))} className="rounded-lg border px-3 py-2 disabled:opacity-50">{busy ? 'Updating…' : token ? 'Turn off sharing' : 'Enable public sharing'}</button>
      {link && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage('Link copied.'); } catch { setMessage('Select and copy the link above.'); } }} className="rounded-lg bg-[#254B40] text-white px-3 py-2">Copy link</button>}
    </div><p role="status" className="text-xs">{message}</p>
  </section>;
}
