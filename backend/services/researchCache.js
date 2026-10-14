const crypto = require('crypto');
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
class ResearchCache {
  constructor({ ttl = 6 * 60 * 60 * 1000, maxEntries = 300, maxBytes = 16 * 1024 * 1024, now = Date.now } = {}) {
    this.ttl = ttl; this.maxEntries = maxEntries; this.maxBytes = maxBytes; this.now = now;
    this.entries = new Map(); this.pending = new Map(); this.bytes = 0;
  }
  remove(key) { const entry = this.entries.get(key); if (entry) this.bytes -= entry.bytes; this.entries.delete(key); }
  async get(key, fetcher) {
    const cached = this.entries.get(key);
    if (cached && cached.expires > this.now()) return structuredClone(cached.value);
    this.remove(key);
    if (!this.pending.has(key)) {
      if (this.pending.size >= 100) return structuredClone(await fetcher());
      const task = Promise.resolve().then(fetcher).then(value => {
        if (value && !value.error && !value.totalTechnicalFailure && !value.partialResults) {
          const bytes = Buffer.byteLength(JSON.stringify(value));
          if (bytes <= this.maxBytes) {
            while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes)) this.remove(this.entries.keys().next().value);
            this.entries.set(key, { value: structuredClone(value), bytes, expires: this.now() + this.ttl }); this.bytes += bytes;
          }
        }
        return value;
      }).finally(() => this.pending.delete(key));
      // Bound coordination memory; excess distinct requests proceed without caching.
      this.pending.set(key, task);
    }
    return structuredClone(await this.pending.get(key));
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}
const providerCache = new ResearchCache();
function cachedProvider(name, provider) {
  return params => {
    if (process.env.OFFLINE_MODE === 'true' || process.env.NODE_ENV === 'test') return provider(params);
    const key = crypto.createHash('sha256').update(JSON.stringify([name, stable(params)])).digest('hex');
    return providerCache.get(key, () => provider(params));
  };
}
module.exports = { ResearchCache, cachedProvider, providerCache };
