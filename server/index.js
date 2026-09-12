// ============================================================
// TheofKing Server: akun global, leaderboard, admin, matchmaking arena.
// Jalankan: npm install && npm start  (atau: node index.js)
// Env: PORT (3000), DATA_FILE (./data.json), ADMIN_USER, ADMIN_PASS
// Catatan: DB JSON file — cocok untuk skala kecil/menengah satu instance.
// ============================================================
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admintheo5757';
const ADMIN_PASS = process.env.ADMIN_PASS || 'theofkingsid';

// ------------------------- DB (JSON file) -------------------------
let db = { accounts: {}, adminTokens: {} };
try {
  if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  console.error('DB rusak, mulai kosong:', e.message);
  db = { accounts: {}, adminTokens: {} };
}
if (!db.accounts) db.accounts = {};
if (!db.adminTokens) db.adminTokens = {};
for (const a of Object.values(db.accounts)) {
  if (typeof a.likes !== 'number') a.likes = 0;
  if (!Array.isArray(a.liked)) a.liked = [];
  if (!Array.isArray(a.inbox)) a.inbox = [];
}
if (!db.feed) db.feed = [];
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) {
      console.error('Gagal simpan DB:', e.message);
    }
  }, 300);
}

// ------------------------- validasi -------------------------
const USER_RE = /^[a-zA-Z0-9_]{3,16}$/;
const ID_RE = /^[A-Z0-9-]{3,24}$/i;
const STAT_KEYS = ['stars', 'streak', 'bestStreak', 'wins', 'losses', 'draws', 'games', 'coins', 'protections', 'changename'];
const cleanNum = (v, max = 1e7) => {
  v = Math.floor(Number(v));
  return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
};
function cleanStats(s) {
  const o = {};
  for (const k of STAT_KEYS) o[k] = cleanNum(s ? s[k] : 0);
  return o;
}
function cleanProfile(p) {
  p = p || {};
  const at = p.avatar && p.avatar.type;
  return {
    name: String(p.name || '').slice(0, 30),
    username: String(p.username || '').slice(0, 16),
    avatar: {
      type: ['preset', 'upload', 'initial'].includes(at) ? at : 'initial',
      data: p.avatar && typeof p.avatar.data === 'string' ? p.avatar.data.slice(0, 300000) : null,
    },
    country: /^[A-Z]{2}$/.test(p.country || '') ? p.country : null,
    avatarBorder: typeof p.avatarBorder === 'string' ? p.avatarBorder.slice(0, 24) : null,
    nickFx: p.nickFx === 'rainbow' ? 'rainbow' : 'none',
  };
}
/** Tampilan publik: tanpa koin/proteksi/teman/settings lengkap. */
function publicAccount(a) {
  return {
    id: a.id, username: a.username, name: a.name, avatar: a.avatar, country: a.country,
    stats: {
      stars: a.stats.stars, streak: a.stats.streak, bestStreak: a.stats.bestStreak,
      wins: a.stats.wins, losses: a.stats.losses, draws: a.stats.draws, games: a.stats.games,
    },
    skin: (a.settings && a.settings.skin) || 'wood',
    avatarBorder: a.avatarBorder || null,
    nickFx: a.nickFx || 'none',
    likes: a.likes || 0,
    rev: a.rev, updatedAt: a.updatedAt,
  };
}
function ownerAccount(a) {
  const pub = publicAccount(a);
  pub.stats = { ...a.stats };
  pub.settings = a.settings;
  pub.friends = a.friends;
  pub.liked = a.liked || [];
  return pub;
}

// ------------------------- app -------------------------
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: Date.now(), players: Object.keys(db.accounts).length });
});

app.post('/api/account/register', (req, res) => {
  const { id, username } = req.body || {};
  if (!ID_RE.test(id || '')) return res.status(400).json({ error: 'ID tidak valid.' });
  if (!USER_RE.test(username || '')) return res.status(400).json({ error: 'Username 3–16 karakter.' });
  const uid = String(id).toUpperCase();
  if (db.accounts[uid]) return res.json({ account: ownerAccount(db.accounts[uid]), existed: true });
  const p = cleanProfile(req.body);
  const uclash = Object.values(db.accounts).find((a) => a.username.toLowerCase() === String(p.username).toLowerCase());
  if (uclash) return res.status(409).json({ error: 'Username sudah dipakai akun lain.' });
  if (p.name.trim()) {
    const nclash = Object.values(db.accounts).find((a) => (a.name || '').toLowerCase() === p.name.trim().toLowerCase());
    if (nclash) return res.status(409).json({ error: 'Nama sudah dipakai akun lain.' });
  }
  const now = Date.now();
  db.accounts[uid] = {
    id: uid, ...p, createdAt: now, updatedAt: now, rev: 0,
    stats: cleanStats(null),
    settings: { skin: 'wood', skins: ['wood', 'midnight', 'emerald'] },
    friends: [],
  };
  saveSoon();
  res.json({ account: ownerAccount(db.accounts[uid]), existed: false });
});

app.get('/api/account/find', (req, res) => {
  const q = String(req.query.q || '').replace(/^@/, '').toLowerCase();
  if (!q) return res.status(400).json({ error: 'q kosong.' });
  const a = Object.values(db.accounts).find((x) => x.id.toLowerCase() === q || x.username.toLowerCase() === q);
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  res.json({ account: publicAccount(a) });
});

app.get('/api/account/check', (req, res) => {
  const username = String(req.query.username || '').replace(/^@/, '').toLowerCase();
  const name = String(req.query.name || '').trim().toLowerCase();
  const except = String(req.query.except || '').toUpperCase();
  let usernameTaken = false, nameTaken = false;
  for (const a of Object.values(db.accounts)) {
    if (except && a.id === except) continue;
    if (username && (a.username || '').toLowerCase() === username) usernameTaken = true;
    if (name && (a.name || '').toLowerCase() === name) nameTaken = true;
  }
  res.json({ usernameTaken, nameTaken });
});

app.get('/api/account/:id', (req, res) => {
  const a = db.accounts[String(req.params.id).toUpperCase()];
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const as = String(req.query.as || '').toUpperCase();
  res.json({ account: as && as === a.id ? ownerAccount(a) : publicAccount(a) });
});

app.put('/api/account/:id', (req, res) => {
  const uid = String(req.params.id).toUpperCase();
  const a = db.accounts[uid];
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const rev = Math.floor(Number(req.body && req.body.rev)) || 0;
  if (rev < a.rev) return res.status(409).json({ error: 'Data server lebih baru.', account: ownerAccount(a) });
  const b = req.body || {};
  if (b.profile) {
    const p = cleanProfile(b.profile);
    if (p.username && USER_RE.test(p.username)) {
      const clash = Object.values(db.accounts).find((x) => x.id !== uid && x.username.toLowerCase() === p.username.toLowerCase());
      if (clash) return res.status(409).json({ error: 'Username sudah dipakai akun lain.' });
      a.username = p.username;
    }
    if (p.name && p.name.trim()) {
      const nclash = Object.values(db.accounts).find((x) => x.id !== uid && (x.name || '').toLowerCase() === p.name.trim().toLowerCase());
      if (nclash) return res.status(409).json({ error: 'Nama sudah dipakai akun lain.' });
    }
    if (p.name) a.name = p.name;
    a.avatar = p.avatar;
    a.country = p.country;
    a.avatarBorder = p.avatarBorder;
    a.nickFx = p.nickFx;
  }
  if (b.stats) {
    const cs = cleanStats(b.stats);
    for (const k of STAT_KEYS) a.stats[k] = cs[k];
  }
  if (b.settings) {
    if (typeof b.settings.skin === 'string') a.settings.skin = b.settings.skin.slice(0, 24);
    if (Array.isArray(b.settings.skins)) {
      a.settings.skins = [...new Set(b.settings.skins.map(String).map((x) => x.slice(0, 24)))].slice(0, 24);
    }
    for (const k of ['borders', 'avatars', 'nickfx']) {
      if (Array.isArray(b.settings[k])) {
        a.settings[k] = [...new Set(b.settings[k].map(String).map((x) => x.slice(0, 24)))].slice(0, 24);
      }
    }
  }
  if (Array.isArray(b.friends)) {
    a.friends = b.friends
      .filter((f) => f && USER_RE.test(f.username || '') && ID_RE.test(f.id || ''))
      .slice(0, 200)
      .map((f) => ({ username: f.username, id: String(f.id).toUpperCase(), addedAt: Number(f.addedAt) || Date.now() }));
  }
  a.rev = rev;
  a.updatedAt = Date.now();
  saveSoon();
  res.json({ account: ownerAccount(a) });
});

app.get('/api/leaderboard', (req, res) => {
  const by = req.query.by === 'streak' ? 'streak' : 'stars';
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const all = Object.values(db.accounts).map((a) => ({
    id: a.id, name: a.name, username: a.username, avatar: a.avatar, country: a.country,
    stars: a.stats.stars, streak: a.stats.streak, likes: a.likes || 0, nickFx: a.nickFx || 'none', avatarBorder: a.avatarBorder || null,
  }));
  all.sort((x, y) => (y[by] - x[by]) || (y.stars - x.stars));
  const me = String(req.query.me || '').toUpperCase();
  res.json({
    players: all.slice(0, limit),
    meRank: me ? all.findIndex((x) => x.id === me) + 1 || null : null,
    total: all.length,
  });
});

// ------------------------- pesan & suka -------------------------
function norm(a) {
  if (!a) return a;
  if (typeof a.likes !== 'number') a.likes = 0;
  if (!Array.isArray(a.liked)) a.liked = [];
  if (!Array.isArray(a.inbox)) a.inbox = [];
  return a;
}
const rid = () => crypto.randomBytes(8).toString('hex');
function pushInbox(a, msg) {
  norm(a);
  a.inbox.unshift({ id: rid(), at: Date.now(), read: false, ...msg });
  a.inbox = a.inbox.slice(0, 50);
  saveSoon();
}

app.post('/api/notify/friend', (req, res) => {
  const from = db.accounts[String((req.body && req.body.fromId) || '').toUpperCase()];
  const to = db.accounts[String((req.body && req.body.toId) || '').toUpperCase()];
  if (!from || !to) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (from.id === to.id) return res.status(400).json({ error: 'Tidak bisa ke diri sendiri.' });
  pushInbox(to, { type: 'friend', title: '👥 Teman baru!', body: `@${from.username} menambahkanmu sebagai teman.`, data: { username: from.username, id: from.id } });
  res.json({ ok: true });
});

app.get('/api/inbox/:id', (req, res) => {
  const a = db.accounts[String(req.params.id).toUpperCase()];
  if (!a || String(req.query.as || '').toUpperCase() !== a.id) return res.status(403).json({ error: 'Bukan milikmu.' });
  norm(a);
  res.json({ messages: a.inbox, feed: (db.feed || []).slice(0, 20) });
});

app.post('/api/inbox/:id/read', (req, res) => {
  const a = db.accounts[String(req.params.id).toUpperCase()];
  if (!a || String((req.body && req.body.as) || '').toUpperCase() !== a.id) return res.status(403).json({ error: 'Bukan milikmu.' });
  const ids = new Set((req.body && req.body.ids) || []);
  norm(a).inbox.forEach((m) => { if (ids.has(m.id)) m.read = true; });
  saveSoon();
  res.json({ ok: true });
});

app.post('/api/like', (req, res) => {
  const from = db.accounts[String((req.body && req.body.fromId) || '').toUpperCase()];
  const to = db.accounts[String((req.body && req.body.toId) || '').toUpperCase()];
  if (!from || !to) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (from.id === to.id) return res.status(400).json({ error: 'Tidak bisa suka diri sendiri.' });
  norm(from); norm(to);
  if (from.liked.includes(to.id)) return res.status(409).json({ error: 'Sudah disuka.', likes: to.likes });
  from.liked.push(to.id);
  from.liked = from.liked.slice(-500);
  to.likes += 1;
  saveSoon();
  res.json({ likes: to.likes });
});

// ------------------------- admin -------------------------
function needAdmin(req, res, next) {
  const t = req.get('X-Admin-Token') || (req.body && req.body.token);
  if (!t || !db.adminTokens[t]) return res.status(403).json({ error: 'Butuh token admin.' });
  next();
}
app.post('/api/admin/login', (req, res) => {
  if (req.body && req.body.user === ADMIN_USER && req.body.pass === ADMIN_PASS) {
    const token = crypto.randomBytes(24).toString('hex');
    db.adminTokens[token] = Date.now();
    saveSoon();
    return res.json({ token });
  }
  res.status(403).json({ error: 'User / sandi salah.' });
});
app.get('/api/admin/find', needAdmin, (req, res) => {
  const q = String(req.query.q || '').replace(/^@/, '').toLowerCase();
  const a = Object.values(db.accounts).find((x) => x.id.toLowerCase() === q || x.username.toLowerCase() === q);
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  res.json({ account: ownerAccount(a) });
});
app.post('/api/admin/stars', needAdmin, (req, res) => {
  const q = String((req.body && req.body.target) || '').replace(/^@/, '').toLowerCase();
  const a = Object.values(db.accounts).find((x) => x.id.toLowerCase() === q || x.username.toLowerCase() === q);
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const n = Math.floor(Number(req.body && req.body.amount));
  const mode = req.body && req.body.mode === 'set' ? 'set' : 'add';
  if (!Number.isFinite(n) || n < (mode === 'set' ? 0 : 1) || n > 99999) {
    return res.status(400).json({ error: 'Jumlah tidak valid.' });
  }
  const before = a.stats.stars;
  a.stats.stars = mode === 'set' ? n : before + n;
  a.rev += 1;
  a.updatedAt = Date.now();
  saveSoon();
  res.json({ before, after: a.stats.stars, account: ownerAccount(a) });
});
app.post('/api/admin/coins', needAdmin, (req, res) => {
  const q = String((req.body && req.body.target) || '').replace(/^@/, '').toLowerCase();
  const a = Object.values(db.accounts).find((x) => x.id.toLowerCase() === q || x.username.toLowerCase() === q);
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const n = Math.floor(Number(req.body && req.body.amount));
  const mode = req.body && req.body.mode === 'set' ? 'set' : 'add';
  if (!Number.isFinite(n) || n < (mode === 'set' ? 0 : 1) || n > 999999) {
    return res.status(400).json({ error: 'Jumlah tidak valid.' });
  }
  const before = a.stats.coins;
  a.stats.coins = mode === 'set' ? n : before + n;
  a.rev += 1;
  a.updatedAt = Date.now();
  saveSoon();
  res.json({ before, after: a.stats.coins, account: ownerAccount(a) });
});
app.post('/api/admin/broadcast', needAdmin, (req, res) => {
  const title = String((req.body && req.body.title) || '').slice(0, 80);
  const body = String((req.body && req.body.body) || '').slice(0, 500);
  if (!title || !body) return res.status(400).json({ error: 'Judul + isi wajib.' });
  db.feed.unshift({ id: rid(), kind: 'info', title, body, at: Date.now() });
  db.feed = db.feed.slice(0, 30);
  saveSoon();
  res.json({ ok: true });
});
app.post('/api/admin/gift', needAdmin, (req, res) => {
  const coins = Math.floor(Number(req.body && req.body.coins)) || 0;
  const stars = Math.floor(Number(req.body && req.body.stars)) || 0;
  if (coins < 0 || stars < 0 || coins > 999999 || stars > 99999 || (!coins && !stars)) {
    return res.status(400).json({ error: 'Jumlah gift tidak valid.' });
  }
  const q = String((req.body && req.body.target) || '').replace(/^@/, '').toLowerCase();
  const label = [stars ? `⭐ ${stars}` : '', coins ? `🪙 ${coins}` : ''].filter(Boolean).join(' + ');
  if (q === 'all') {
    for (const a of Object.values(db.accounts)) {
      a.stats.stars += stars;
      a.stats.coins += coins;
      a.rev += 1;
      a.updatedAt = Date.now();
    }
    db.feed.unshift({ id: rid(), kind: 'gift', title: '🎁 Gift dari Admin!', body: `Semua pemain dapat ${label}. Otomatis masuk ✅`, at: Date.now() });
    db.feed = db.feed.slice(0, 30);
    saveSoon();
    return res.json({ ok: true, count: Object.keys(db.accounts).length });
  }
  const a = Object.values(db.accounts).find((x) => x.id.toLowerCase() === q || x.username.toLowerCase() === q);
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  a.stats.stars += stars;
  a.stats.coins += coins;
  a.rev += 1;
  a.updatedAt = Date.now();
  pushInbox(a, { type: 'gift', title: '🎁 Gift dari Admin!', body: `Kamu dapat ${label}. Otomatis masuk ✅` });
  saveSoon();
  res.json({ ok: true, account: ownerAccount(a) });
});
app.post('/api/admin/likes', needAdmin, (req, res) => {
  const q = String((req.body && req.body.target) || '').replace(/^@/, '').toLowerCase();
  const a = Object.values(db.accounts).find((x) => x.id.toLowerCase() === q || x.username.toLowerCase() === q);
  if (!a) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  norm(a);
  const n = Math.floor(Number(req.body && req.body.amount));
  const mode = req.body && req.body.mode === 'set' ? 'set' : 'add';
  if (!Number.isFinite(n) || n < (mode === 'set' ? 0 : 1) || n > 999999) {
    return res.status(400).json({ error: 'Jumlah tidak valid.' });
  }
  const before = a.likes;
  a.likes = mode === 'set' ? n : before + n;
  a.rev += 1;
  a.updatedAt = Date.now();
  saveSoon();
  res.json({ before, after: a.likes, account: ownerAccount(a) });
});

// ------------------------- statik: file game -------------------------
app.use(['/server', '/server/*'], (req, res) => res.status(404).end()); // jangan bocorkan kode/data server
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders: (res, p) => {
    if (p.endsWith('index.html')) res.set('Cache-Control', 'no-store');
  },
}));

// ------------------------- WS: matchmaking arena -------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const queues = new Map(); // rank -> [{ws,id,profile,stats,at}]
const matches = new Map(); // code -> {a,b,aWs,bWs,at,started}
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  let c;
  do {
    c = Array.from({ length: 6 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
  } while (matches.has(c));
  return c;
}
function deQueue(id) {
  for (const [r, q] of queues) queues.set(r, q.filter((e) => e.id !== id));
}
function breakMatchOf(id, notify) {
  for (const [code, m] of matches) {
    if (m.started || (m.a !== id && m.b !== id)) continue;
    matches.delete(code);
    const other = m.a === id ? m.bWs : m.aWs;
    if (notify && other && other.readyState === 1) {
      try { other.send(JSON.stringify({ t: 'opp_gone' })); } catch { /* abaikan */ }
    }
  }
}
function sweep() {
  for (const [rank, q] of queues) {
    const alive = q.filter((e) => e.ws.readyState === 1);
    while (alive.length >= 2) {
      const A = alive.shift();
      const B = alive.shift();
      const code = genCode();
      matches.set(code, { a: A.id, b: B.id, aWs: A.ws, bWs: B.ws, at: Date.now(), started: false });
      try { A.ws.send(JSON.stringify({ t: 'matched', role: 'host', code, opp: { profile: B.profile, stats: B.stats } })); } catch { /* abaikan */ }
      try { B.ws.send(JSON.stringify({ t: 'matched', role: 'guest', code, opp: { profile: A.profile, stats: A.stats } })); } catch { /* abaikan */ }
    }
    queues.set(rank, alive);
  }
}
setInterval(sweep, 1000);
setInterval(() => {
  const now = Date.now();
  for (const [code, m] of matches) {
    if (!m.started && now - m.at > 90000) {
      matches.delete(code);
      for (const w of [m.aWs, m.bWs]) {
        if (w && w.readyState === 1) {
          try { w.send(JSON.stringify({ t: 'expired' })); } catch { /* abaikan */ }
        }
      }
    }
  }
}, 5000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.pid = null;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'queue') {
      const id = String(msg.id || '').toUpperCase();
      const rank = String(msg.rank || 'bronze').toLowerCase().slice(0, 24);
      if (!ID_RE.test(id)) {
        try { ws.send(JSON.stringify({ t: 'error', message: 'ID tidak valid.' })); } catch { /* abaikan */ }
        return;
      }
      ws.pid = id;
      deQueue(id);
      if (!queues.has(rank)) queues.set(rank, []);
      queues.get(rank).push({ ws, id, profile: msg.profile || {}, stats: msg.stats || {}, at: Date.now() });
      const pos = queues.get(rank).length;
      try { ws.send(JSON.stringify({ t: 'queued', position: pos })); } catch { /* abaikan */ }
      sweep();
    } else if (msg.t === 'leave') {
      if (ws.pid) { deQueue(ws.pid); breakMatchOf(ws.pid, true); }
    } else if (msg.t === 'started') {
      const m = matches.get(msg.code);
      if (m) m.started = true;
    }
  });
  ws.on('close', () => {
    if (ws.pid) { deQueue(ws.pid); breakMatchOf(ws.pid, true); }
  });
});
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { try { ws.terminate(); } catch { /* abaikan */ } return; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* abaikan */ }
  });
}, 25000);

server.listen(PORT, '0.0.0.0', () => console.log(`♞ TheofKing server jalan di port ${PORT}`));
