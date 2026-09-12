// ============================================================
// Penyimpanan lokal (localStorage): profil, statistik, setting,
// leaderboard, dan riwayat permainan.
// ============================================================
import { rankForStars } from './ranks.js?v=6';

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
    return read('stats', { stars: 0, streak: 0, bestStreak: 0, wins: 0, losses: 0, draws: 0, games: 0 });
  },
  set stats(v) { write('stats', v); },

  get settings() {
    return read('settings', { sound: true, theme: 'wood' });
  },
  set settings(v) { write('settings', v); },

  get recent() { return read('recent', []); },
  set recent(v) { write('recent', v); },

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
  { name: 'Magnus Carlsen',   username: 'magnus',      emoji: '🐐', stars: 58, streak: 14 },
  { name: 'Hikaru Nakamura',  username: 'hikaru',      emoji: '⚡', stars: 51, streak: 9 },
  { name: 'Gotham Chess',     username: 'gothamchess', emoji: '🏙️', stars: 47, streak: 11 },
  { name: 'Irene Sukandar',   username: 'irene_wim',   emoji: '🇮🇩', stars: 42, streak: 7 },
  { name: 'Gajah Mada',       username: 'gajah_mada',  emoji: '🐘', stars: 38, streak: 8 },
  { name: 'Susanto Megaranto',username: 'susan_to',    emoji: '🔥', stars: 34, streak: 5 },
  { name: 'Raja Jawa',        username: 'raja_jawa',   emoji: '👑', stars: 29, streak: 6 },
  { name: 'Kuda Lumping',     username: 'kuda_lumping',emoji: '🐴', stars: 25, streak: 4 },
  { name: 'Fabiano Caruana',  username: 'fabiano',     emoji: '🎯', stars: 22, streak: 3 },
  { name: 'Ding Liren',       username: 'ding',        emoji: '🐼', stars: 19, streak: 5 },
  { name: 'Anak Senja',       username: 'anak_senja',  emoji: '🌇', stars: 15, streak: 2 },
  { name: 'Alireza Firouzja', username: 'alireza',     emoji: '🚀', stars: 12, streak: 4 },
  { name: 'Tukang Skak',      username: 'tukang_skak', emoji: '🔨', stars: 8,  streak: 3 },
  { name: 'Pion Balap',       username: 'pion_balap',  emoji: '🏎️', stars: 5,  streak: 2 },
  { name: 'Pemula Santuy',    username: 'pemula',      emoji: '🌱', stars: 2,  streak: 1 },
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
    stars: s.stars, streak: s.streak,
    rank: rankForStars(s.stars),
  }));
  if (profile) {
    rows.push({
      id: 'me', name: profile.name, username: profile.username,
      avatar: profile.avatar, bot: false, me: true,
      stars: stats.stars || 0, streak: stats.streak || 0,
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
