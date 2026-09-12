// ============================================================
// Penyimpanan lokal (localStorage): profil, statistik, setting,
// leaderboard, dan riwayat permainan.
// ============================================================
import { rankForStars } from './ranks.js?v=22';

const PREFIX = 'tok.v1.';

// Cache memori: aplikasi tetap jalan dalam sesi ini walau localStorage diblokir
// (iframe sandbox / mode privat ketat). Data tersimpan permanen jika bisa.
const memCache = {};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return key in memCache ? memCache[key] : fallback;
    const val = JSON.parse(raw);
    memCache[key] = val;
    return val;
  } catch {
    return key in memCache ? memCache[key] : fallback;
  }
}

function write(key, value) {
  memCache[key] = value;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* abaikan (storage penuh / privat / diblokir) */
  }
}

export const store = {
  get profile() { return read('profile', null); },
  set profile(v) { write('profile', v); },

  get stats() {
    const d = { stars: 0, streak: 0, bestStreak: 0, wins: 0, losses: 0, draws: 0, games: 0, coins: 0, protections: 0, likes: 0 };
    return { ...d, ...read('stats', {}) };
  },
  set stats(v) { write('stats', v); },

  get settings() {
    const d = { sound: true, theme: 'wood', skin: 'wood', skins: ['wood', 'midnight', 'emerald'], borders: ['none'], avatars: [] };
    return { ...d, ...read('settings', {}) };
  },
  set settings(v) { write('settings', v); },

  get recent() { return read('recent', []); },
  set recent(v) { write('recent', v); },

  get friends() { return read('friends', []); },
  set friends(v) { write('friends', v); },

  get seeds() { return read('seeds', null); },
  set seeds(v) { write('seeds', v); },

  clearAll() {
    for (const k of Object.keys(memCache)) delete memCache[k];
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* abaikan */
    }
  },
};

export function saveStats(stats) {
  store.stats = stats;
}

export function pushRecent(entry) {
  const list = store.recent || [];
  list.unshift({ ...entry, at: Date.now() });
  store.recent = list.slice(0, 10);
}

// ------------------------- Leaderboard -------------------------

const SEED_PLAYERS = [
  { name: 'Magnus Carlsen',   username: 'magnus', country: 'NO',      emoji: '🐐', stars: 58, streak: 14 },
  { name: 'Hikaru Nakamura',  username: 'hikaru', country: 'US',      emoji: '⚡', stars: 51, streak: 9 },
  { name: 'Gotham Chess',     username: 'gothamchess', country: 'US', emoji: '🏙️', stars: 47, streak: 11 },
  { name: 'Irene Sukandar',   username: 'irene_wim', country: 'ID',   emoji: '🇮🇩', stars: 42, streak: 7 },
  { name: 'Gajah Mada',       username: 'gajah_mada', country: 'ID',  emoji: '🐘', stars: 38, streak: 8 },
  { name: 'Susanto Megaranto',username: 'susan_to', country: 'ID',    emoji: '🔥', stars: 34, streak: 5 },
  { name: 'Raja Jawa',        username: 'raja_jawa', country: 'ID',   emoji: '👑', stars: 29, streak: 6 },
  { name: 'Kuda Lumping',     username: 'kuda_lumping', country: 'ID',emoji: '🐴', stars: 25, streak: 4 },
  { name: 'Fabiano Caruana',  username: 'fabiano', country: 'US',     emoji: '🎯', stars: 22, streak: 3 },
  { name: 'Ding Liren',       username: 'ding', country: 'CN',        emoji: '🐼', stars: 19, streak: 5 },
  { name: 'Anak Senja',       username: 'anak_senja', country: 'ID',  emoji: '🌇', stars: 15, streak: 2 },
  { name: 'Alireza Firouzja', username: 'alireza', country: 'FR',     emoji: '🚀', stars: 12, streak: 4 },
  { name: 'Tukang Skak',      username: 'tukang_skak', country: 'ID', emoji: '🔨', stars: 8,  streak: 3 },
  { name: 'Pion Balap',       username: 'pion_balap', country: 'ID',  emoji: '🏎️', stars: 5,  streak: 2 },
  { name: 'Pemula Santuy',    username: 'pemula', country: 'ID',      emoji: '🌱', stars: 2,  streak: 1 },
];

function seedLeaderboard() {
  let seeds = store.seeds;
  if (!seeds) {
    seeds = SEED_PLAYERS.map((p, i) => ({ ...p, id: 'seed-' + i, bot: true }));
    store.seeds = seeds;
  }
  return seeds;
}

/** Leaderboard global = bot + pemain, diurutkan. by: 'stars' | 'streak' */
export function getLeaderboard(by = 'stars') {
  const seeds = seedLeaderboard();
  const profile = store.profile;
  const stats = store.stats;
  const rows = seeds.map((s) => ({
    id: s.id, name: s.name, username: s.username,
    emoji: s.emoji, bot: true, me: false,
    country: s.country || null,
    stars: s.stars, streak: s.streak,
    likes: 0,
    nickFx: 'none',
    rank: rankForStars(s.stars),
  }));
  if (profile) {
    rows.push({
      id: 'me', name: profile.name, username: profile.username,
      avatar: profile.avatar, bot: false, me: true, avatarBorder: profile.avatarBorder || null,
      country: profile.country || null,
      stars: stats.stars || 0, streak: stats.streak || 0,
      likes: stats.likes || 0,
      nickFx: profile.nickFx || 'none',
      rank: rankForStars(stats.stars || 0),
    });
  }
  rows.sort((a, b) => (b[by] - a[by]) || (b.stars - a.stars));
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

export function myGlobalRank(by = 'stars') {
  const rows = getLeaderboard(by);
  const me = rows.find((r) => r.me);
  return me ? me.pos : null;
}

// ------------------------- Avatar -------------------------

export const PRESET_AVATARS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🦄', '🤖', '👽', '⚡', '🔥', '♞', '👑'];
export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#f59e0b,#b45309)',
  'linear-gradient(135deg,#ef4444,#7f1d1d)',
  'linear-gradient(135deg,#8b5cf6,#4c1d95)',
  'linear-gradient(135deg,#06b6d4,#0e7490)',
  'linear-gradient(135deg,#22c55e,#14532d)',
  'linear-gradient(135deg,#ec4899,#831843)',
  'linear-gradient(135deg,#64748b,#1e293b)',
  'linear-gradient(135deg,#eab308,#713f12)',
];

export function avatarGradientFor(username) {
  let h = 0;
  const s = String(username || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function initialsFor(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function validateProfile(name, username) {
  name = String(name || '').trim();
  username = String(username || '').trim().replace(/^@/, '');
  if (name.length < 2) return { ok: false, field: 'name', message: 'Nama minimal 2 huruf ya.' };
  if (name.length > 30) return { ok: false, field: 'name', message: 'Nama maksimal 30 huruf.' };
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return { ok: false, field: 'username', message: 'Username 3–16 karakter (huruf, angka, _).' };
  }
  return { ok: true, name, username };
}

const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makePlayerId() {
  let rnd;
  try {
    rnd = [...crypto.getRandomValues(new Uint8Array(6))];
  } catch {
    rnd = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));
  }
  return 'TK-' + rnd.map((n) => ID_ALPHABET[n % ID_ALPHABET.length]).join('');
}

export function normalizeFriendId(id) {
  return String(id || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function addFriend(username, id, selfId) {
  username = String(username || '').trim().replace(/^@/, '');
  id = normalizeFriendId(id);
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return { ok: false, message: 'Username teman 3–16 karakter (huruf, angka, _).' };
  }
  if (!/^TK-[A-Z2-9]{6}$/.test(id)) {
    return { ok: false, message: 'Format ID salah. Contoh benar: TK-AB12CD.' };
  }
  if (selfId && id === String(selfId).toUpperCase()) {
    return { ok: false, message: 'Itu ID kamu sendiri 😄' };
  }
  const list = store.friends;
  if (list.some((f) => f.id === id)) {
    return { ok: false, message: 'Teman ini sudah ada di daftar.' };
  }
  list.unshift({ username, id, addedAt: Date.now() });
  store.friends = list;
  return { ok: true, username, id };
}

export function removeFriend(id) {
  store.friends = store.friends.filter((f) => f.id !== id);
}
