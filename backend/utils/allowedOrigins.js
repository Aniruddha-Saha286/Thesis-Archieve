function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true; // Non-browser API clients still need normal authentication.
  const allowed = new Set([
    'https://thesis-archieve.vercel.app',
    'http://localhost:5173', 'http://localhost:3000',
    'http://127.0.0.1:5173', 'http://127.0.0.1:3000',
    ...[env.CLIENT_ORIGIN, env.FRONTEND_URL].flatMap(value => String(value || '').split(',').map(item => item.trim()).filter(Boolean)),
  ]);
  return allowed.has(origin);
}
module.exports = { isAllowedOrigin };
