const { ResearchCache } = require('./researchCache');
const cache = new ResearchCache({ ttl: 60 * 60 * 1000, maxEntries: 100, maxBytes: 8 * 1024 * 1024 });
const cooldowns = new Map();
async function getMetadata(url, format = 'json', maxBytes = 4 * 1024 * 1024) {
  const host = new URL(url).hostname;
  if (!['api2.openreview.net', 'openaccess.thecvf.com', 'www.jmlr.org'].includes(host)) throw new Error('Unsupported metadata host');
  return cache.get(url, async () => {
    if ((cooldowns.get(host) || 0) > Date.now()) throw new Error('Provider cooldown');
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error', headers: { 'User-Agent': 'ThesisArchive/1.0 (research metadata discovery)', Accept: format === 'json' ? 'application/json' : 'text/html' } });
      if (res.status === 429) { cooldowns.set(host, Date.now() + Math.min(300, Math.max(30, Number(res.headers.get('retry-after')) || 30)) * 1000); throw new Error('Provider rate limit'); }
      if (res.status >= 500 && !attempt) { await new Promise(r => setTimeout(r, 1000)); continue; }
      if (!res.ok) throw new Error('Provider HTTP ' + res.status);
      if (Number(res.headers.get('content-length')) > maxBytes) throw new Error('Metadata response too large');
      const reader = res.body.getReader(); let bytes = 0; const chunks = [];
      try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > maxBytes) throw new Error('Metadata response too large'); chunks.push(Buffer.from(value)); } }
      finally { await reader.cancel(); }
      const text = Buffer.concat(chunks).toString('utf8');
      return format === 'json' ? JSON.parse(text) : { html: text };
    }
  });
}
module.exports = { getMetadata };
