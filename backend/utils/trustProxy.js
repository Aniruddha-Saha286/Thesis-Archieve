// Decides how many reverse proxies Express should trust when reading the visitor's address.
//
// Hosting platforms (Render, Railway, Heroku, Nginx in front of Node, Cloudflare) pass the
// visitor's real address in the X-Forwarded-For header. Without this setting every visitor
// appears to come from the proxy's address, so the per-address rate limits treat all users
// as one person and block everybody together.
//
// TRUST_PROXY in .env:
//   (not set)   -> 1 in production, off otherwise
//   a number    -> that many proxies in front of the app (2 if e.g. Cloudflare + Render)
//   false / 0   -> off (the app is reached directly)
//   true        -> treated as 1 (trusting every hop would let a visitor fake their address)
//   anything else (e.g. "loopback, 10.0.0.0/8") -> passed to Express unchanged
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
