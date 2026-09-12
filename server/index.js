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
const STAT_KEYS = ['stars', 'streak', 'bestStreak', 'wins', 'losses', 'draws', 'games', 'coins', 'protections'];
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
    rev: a.rev, updatedAt: a.updatedAt,
  };
}
function ownerAccount(a) {
  const pub = publicAccount(a);
  pub.stats = { ...a.stats };
  pub.settings = a.settings;
  pub.friends = a.friends;
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
  const clash = Object.values(db.accounts).find((a) => a.username.toLowerCase() === String(username).toLowerCase());
  if (clash) return res.status(409).json({ error: 'Username sudah dipakai akun lain.' });
  const p = cleanProfile(req.body);
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
    if (p.name) a.name = p.name;
    a.avatar = p.avatar;
    a.country = p.country;
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
    stars: a.stats.stars, streak: a.stats.streak,
  }));
  all.sort((x, y) => (y[by] - x[by]) || (y.stars - x.stars));
  const me = String(req.query.me || '').toUpperCase();
  res.json({
    players: all.slice(0, limit),
    meRank: me ? all.findIndex((x) => x.id === me) + 1 || null : null,
    total: all.length,
  });
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
