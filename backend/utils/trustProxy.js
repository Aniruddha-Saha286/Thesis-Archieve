function resolveTrustProxy(env = process.env) {
  const raw = typeof env.TRUST_PROXY === 'string' ? env.TRUST_PROXY.trim() : '';

  if (!raw) {
    return env.NODE_ENV === 'production' ? 1 : false;
  }

  const lowered = raw.toLowerCase();
  if (lowered === 'false' || lowered === 'off' || lowered === 'no' || lowered === '0') return false;
  if (lowered === 'true' || lowered === 'on' || lowered === 'yes') return 1;

  if (/^\d+$/.test(raw)) {
    return Math.min(parseInt(raw, 10), 10);
  }

  return raw;
}

module.exports = { resolveTrustProxy };
