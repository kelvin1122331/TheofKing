// ============================================================
// Klien server TheofKing (opsional): akun global, leaderboard,
// admin global, matchmaking arena. Offline = mode lokal biasa.
// ============================================================
let online = false;
let readonly = false;

function savedBase() {
  try { return localStorage.getItem('tok.v1.server') || ''; } catch { return ''; }
}

export function serverBase() {
  const o = savedBase().replace(/\/+$/, '');
  if (o) return o;
  try {
    if (typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:')) {
      return location.origin;
    }
  } catch { /* abaikan */ }
  return null;
}

export function isServerOnline() { return online; }
export function isServerReadonly() { return readonly; }
export function setServerReadonly(v) { readonly = !!v; }

export async function checkServer(timeoutMs = 3000) {
  const b = serverBase();
  if (!b || typeof fetch === 'undefined') { online = false; return false; }
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const r = await fetch(b + '/api/health', { signal: c.signal });
    clearTimeout(t);
    online = r.ok;
  } catch {
    online = false;
  }
  return online;
}

export async function api(path, { method = 'GET', body = null, token = null, timeoutMs = 8000 } = {}) {
  const b = serverBase();
  if (!b) throw new Error('NO_SERVER');
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(b + path, {
      method,
      signal: c.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Admin-Token': token } : {}) },
      body: body ? JSON.stringify(body) : null,
    });
  } catch {
    clearTimeout(t);
    online = false;
    throw new Error('NET');
  }
  clearTimeout(t);
  let j = null;
  try { j = await r.json(); } catch { /* abaikan */ }
  if (!r.ok) {
    const err = new Error((j && j.error) || ('HTTP ' + r.status));
    err.code = r.status;
    err.account = j && j.account;
    throw err;
  }
  online = true;
  return j;
}

export const Server = {
  register: (p) => api('/api/account/register', { method: 'POST', body: p }),
  pull: (id) => api('/api/account/' + encodeURIComponent(id) + '?as=' + encodeURIComponent(id)),
  push: (id, data) => api('/api/account/' + encodeURIComponent(id), { method: 'PUT', body: data }),
  find: (q) => api('/api/account/find?q=' + encodeURIComponent(q)),
  leaderboard: (by, me) => api(`/api/leaderboard?by=${by}&limit=50${me ? '&me=' + encodeURIComponent(me) : ''}`),
  adminLogin: (user, pass) => api('/api/admin/login', { method: 'POST', body: { user, pass } }),
  adminFind: (token, q) => api('/api/admin/find?q=' + encodeURIComponent(q), { token }),
  adminStars: (token, target, mode, amount) =>
    api('/api/admin/stars', { method: 'POST', token, body: { target, mode, amount } }),
  adminCoins: (token, target, mode, amount) =>
    api('/api/admin/coins', { method: 'POST', token, body: { target, mode, amount } }),
  notify: (fromId, toId) => api('/api/notify/friend', { method: 'POST', body: { fromId, toId } }),
  inbox: (id) => api('/api/inbox/' + encodeURIComponent(id) + '?as=' + encodeURIComponent(id)),
  inboxRead: (id, ids) => api('/api/inbox/' + encodeURIComponent(id) + '/read', { method: 'POST', body: { as: id, ids } }),
  like: (fromId, toId) => api('/api/like', { method: 'POST', body: { fromId, toId } }),
  adminLikes: (token, target, mode, amount) =>
    api('/api/admin/likes', { method: 'POST', token, body: { target, mode, amount } }),
};

export function openMatchSocket() {
  const b = serverBase();
  if (!b || !online || typeof WebSocket === 'undefined') return null;
  try {
    return new WebSocket(b.replace(/^http/, 'ws') + '/ws');
  } catch {
    return null;
  }
}
