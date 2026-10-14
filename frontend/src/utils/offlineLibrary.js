const PREFIX = 'tta:offline:v1:';
const SESSION_KEY = PREFIX + 'session';
async function tokenTag(token) {
  if (!token) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function cacheOfflineSession(storage, user) {
  const id = user?.id || user?._id;
  if (!storage || !id || user.status !== 'approved' || user.role !== 'student') return;
  try {
    const token = storage.getItem('thesis_vault_token'); const tag = await tokenTag(token);
    if (!tag || token !== storage.getItem('thesis_vault_token')) return;
    storage.setItem(SESSION_KEY, JSON.stringify({ id: String(id), name: user.name, status: 'approved', role: 'student', isProfileComplete: true, offline: true, tokenTag: tag }));
  } catch { /* Storage full or unavailable. */ }
}
export async function offlineSession(storage) {
  try { const value = JSON.parse(storage?.getItem(SESSION_KEY) || 'null'); const tag = await tokenTag(storage?.getItem('thesis_vault_token')); return tag && value?.tokenTag === tag && value?.offline && value?.id && value?.role === 'student' ? value : null; } catch { return null; }
}
export function cacheOfflineLibrary(storage, userId, papers) {
  if (!storage || !userId || !Array.isArray(papers)) return;
  try { storage.setItem(PREFIX + userId, JSON.stringify({ savedAt: Date.now(), papers: papers.slice(0, 100).map(p => ({ ...p, abstract: String(p.abstract || '').slice(0, 12000) })) })); } catch { /* Storage full or unavailable. */ }
}
export function offlineLibrary(storage, userId) {
  if (!storage || !userId) return null;
  try { const value = JSON.parse(storage.getItem(PREFIX + userId) || 'null'); return Array.isArray(value?.papers) ? value : null; } catch { return null; }
}
export function clearOfflineData(storage) {
  if (!storage) return;
  try { for (let i = storage.length - 1; i >= 0; i--) { const key = storage.key(i); if (key?.startsWith(PREFIX)) storage.removeItem(key); } } catch { /* Storage unavailable. */ }
}
