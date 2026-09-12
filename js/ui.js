// ============================================================
// Helper UI: toast, modal, confetti, avatar, format waktu, dialog.
// ============================================================
import { avatarGradientFor, initialsFor } from './store.js?v=31';
import { rankForStars, rankProgress } from './ranks.js?v=31';
import { sfx } from './sound.js?v=31';
import { flagFor } from './countries.js?v=31';
import { borderImg, borderFx, avatarImg } from './cosmetics.js?v=31';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ------------------------- Modal -------------------------
export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = false;
  m.style.display = '';
}
export function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = true;
  m.style.display = 'none';
}
export function anyModalOpen() {
  return $$('.modal-backdrop').some((m) => !m.hidden);
}

// ------------------------- Toast -------------------------
export function toast(msg, type = '') {
  const root = $('#toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2300);
  setTimeout(() => t.remove(), 2700);
}

// ------------------------- Confirm -------------------------
let confirmResolve = null;
export function confirmDialog({ title = 'Yakin?', message = '', ok = 'Ya', cancel = 'Batal' } = {}) {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-ok').textContent = ok;
  $('#confirm-cancel').textContent = cancel;
  openModal('modal-confirm');
  return new Promise((resolve) => { confirmResolve = resolve; });
}
export function initConfirm() {
  $('#confirm-ok').addEventListener('click', () => { closeModal('modal-confirm'); confirmResolve?.(true); confirmResolve = null; });
  $('#confirm-cancel').addEventListener('click', () => { closeModal('modal-confirm'); confirmResolve?.(false); confirmResolve = null; });
}

// ------------------------- Copy -------------------------
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

// ------------------------- Waktu -------------------------
export function fmtClock(ms) {
  ms = Math.max(0, ms);
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const tenths = ms < 20000 ? `.${Math.floor((ms % 1000) / 100)}` : '';
  return `${m}:${String(s).padStart(2, '0')}${tenths}`;
}

export function fmtTimeAgo(ts) {
  const d = Date.now() - ts;
  const min = Math.floor(d / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

// ------------------------- Avatar & Rank HTML -------------------------
export function avatarHTML(profileOrSeed, size = 40) {
  const p = profileOrSeed || {};
  const av = p.avatar;
  let inner = '';
  let style = '';
  if (av && av.type === 'upload' && av.data) {
    inner = `<img src="${av.data}" alt="foto" />`;
  } else if (av && av.type === 'preset' && av.data) {
    inner = esc(av.data);
    style = `background:${avatarGradientFor(p.username)};`;
  } else if (av && av.type === 'premium' && av.data) {
    inner = `<img src="${avatarImg(esc(av.data))}" alt="avatar" />`;
  } else if (p.emoji) {
    inner = esc(p.emoji);
    style = `background:${avatarGradientFor(p.username)};`;
  } else {
    inner = esc(initialsFor(p.name || p.username));
    style = `background:${avatarGradientFor(p.username)};`;
  }
  const bid = p.avatarBorder && p.avatarBorder !== 'none' ? ` ava-border-${esc(p.avatarBorder)}` : '';
  const frame = borderOverlayHTML(p.avatarBorder);
  return `<span class="avatar-wrap${bid}"><span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.44)}px;${style}">${inner}</span>${frame}</span>`;
}

/** Overlay bingkai berbasis gambar (tengah transparan via CSS mask). */
export function borderOverlayHTML(borderId) {
  const src = borderId ? borderImg(borderId) : null;
  if (!src) return '';
  const fx = borderFx(borderId);
  return `<span class="ava-frame"><img src="${src}" alt=""${fx ? ` class="${fx}"` : ''} /></span>`;
}

/** Lencana verified + gelar owner/admin di belakang nama. */
export function badgesHTML(p = {}) {
  let out = '';
  if (p && p.verified) out += ' <span class="badge-verified" title="Akun terverifikasi">✔</span>';
  if (p && p.title === 'owner') out += ' <span class="badge-title badge-owner">👑 OWNER</span>';
  else if (p && p.title === 'admin') out += ' <span class="badge-title badge-admin">🛡️ ADMIN</span>';
  return out;
}

/** Nama pemain; efek rainbow bila fx diset. Bendera/emoji di luar span agar tak transparan. */
export function nickHTML(name, fx, prof) {
  const t = esc(name || '\u2013');
  const b = badgesHTML(prof);
  if (fx === 'rainbow') return `<span class="nick-rainbow">${t}</span>${b}`;
  if (fx === 'inferno') return `<span class="nick-inferno">${t}</span>${b}`;
  return t + b;
}

let rankupTimer = null;

/** Overlay selebrasi animasi saat naik rank. Ketuk / 6 dtk untuk tutup. */
export function showRankUp(before, after, stars) {
  const ov = document.getElementById('rankup-overlay');
  if (!ov) return;
  document.getElementById('rankup-old-icon').textContent = before.icon;
  document.getElementById('rankup-old-name').textContent = before.name;
  document.getElementById('rankup-new-icon').textContent = after.icon;
  document.getElementById('rankup-new-name').textContent = after.name;
  document.getElementById('rankup-stars').textContent = `\u2B50 ${stars} bintang`;
  ov.hidden = false;
  ov.style.display = 'flex';
  ov.setAttribute('aria-hidden', 'false');
  ov.onclick = () => hideRankUp();
  clearTimeout(rankupTimer);
  rankupTimer = setTimeout(hideRankUp, 6000);
  setTimeout(() => confettiBurst(320), 200);
}

export function hideRankUp() {
  const ov = document.getElementById('rankup-overlay');
  if (!ov) return;
  clearTimeout(rankupTimer);
  ov.hidden = true;
  ov.style.display = 'none';
  ov.setAttribute('aria-hidden', 'true');
}

export function rankBadgeHTML(stars, showName = true) {
  const r = rankForStars(stars);
  return `<span class="rank-inline" title="${r.name}"><span class="rank-emoji">${r.icon}</span>${showName ? ` <b>${r.name}</b>` : ''}</span>`;
}

export function starRowHTML(stars) {
  const p = rankProgress(stars);
  let out = '';
  for (let i = 0; i < p.total; i++) {
    out += `<span class="${i < p.filled ? 'on' : 'off'}">★</span>`;
  }
  return out;
}

// ------------------------- VS Splash -------------------------
const VS_MS = 2800; // sinkron dengan animasi .vs-bar di CSS

/**
 * Tampilkan intro "VS" sebelum pertandingan. Resolve saat selesai/dilewati.
 * @param {object} o { me, opp, meSub, oppSub, modeLabel, sub }
 */
function vsName(p, fallback) {
  const fl = flagFor(p);
  const nm = nickHTML((p && p.name) || fallback, p && p.nickFx, p);
  return fl ? `${fl} ${nm}` : nm;
}

export function showVsSplash(o = {}) {
  return new Promise((resolve) => {
    const ov = document.getElementById('vs-splash');
    if (!ov) { resolve(); return; }
    document.getElementById('vs-mode').textContent = o.modeLabel || 'Pertandingan';
    document.getElementById('vs-me-avatar').innerHTML = avatarHTML(o.me, 84);
    document.getElementById('vs-me-name').innerHTML = vsName(o.me, 'Kamu');
    document.getElementById('vs-me-rank').innerHTML = o.meSub || '';
    document.getElementById('vs-opp-avatar').innerHTML = avatarHTML(o.opp, 84);
    document.getElementById('vs-opp-name').innerHTML = vsName(o.opp, 'Lawan');
    document.getElementById('vs-opp-rank').innerHTML = o.oppSub || '';
    document.getElementById('vs-sub').textContent = o.sub || '';
    const setStreak = (id, n) => {
      const el = document.getElementById(id);
      if (n && n >= 1) { el.textContent = `${n}x \uD83D\uDD25`; el.hidden = false; }
      else el.hidden = true;
    };
    setStreak('vs-me-streak', o.meStreak);
    setStreak('vs-opp-streak', o.oppStreak);
    ov.style.display = 'flex';
    ov.classList.remove('play');
    void ov.offsetWidth; // paksa reflow agar animasi mengulang
    ov.classList.add('play');
    sfx.versus();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ov.classList.remove('play');
      ov.style.display = 'none';
      ov.onclick = null;
      resolve();
    };
    ov.onclick = () => { sfx.click(); finish(); };
    const timer = setTimeout(finish, VS_MS);
  });
}

// ------------------------- Confetti -------------------------
const confettiCanvas = { el: null, ctx: null, parts: [], raf: 0 };

function ensureConfetti() {
  if (!confettiCanvas.el) {
    confettiCanvas.el = document.getElementById('confetti');
    confettiCanvas.ctx = confettiCanvas.el.getContext('2d');
    const fit = () => {
      const w = typeof window !== 'undefined' ? window : {};
      confettiCanvas.el.width = w.innerWidth || document.documentElement.clientWidth || 800;
      confettiCanvas.el.height = w.innerHeight || document.documentElement.clientHeight || 600;
    };
    fit();
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', fit);
  }
  return confettiCanvas;
}

const CONFETTI_COLORS = ['#f5c044', '#ffdf8e', '#ffffff', '#3ddc84', '#4da3ff', '#ff5d6c', '#c084fc'];

export function confettiBurst(count = 160, originY = 0.35) {
  const { el, ctx } = ensureConfetti();
  for (let i = 0; i < count; i++) {
    confettiCanvas.parts.push({
      x: Math.random() * el.width,
      y: el.height * originY + (Math.random() - 0.5) * 120,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -9 - 3,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      life: 1,
      decay: 0.004 + Math.random() * 0.008,
      shape: Math.random() < 0.3 ? 'circle' : 'rect',
    });
  }
  if (!confettiCanvas.raf) confettiLoop();
}

function confettiLoop() {
  const { el, ctx } = ensureConfetti();
  confettiCanvas.raf = requestAnimationFrame(confettiLoop);
  ctx.clearRect(0, 0, el.width, el.height);
  const ps = confettiCanvas.parts;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.vy += 0.22;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    p.life -= p.decay;
    if (p.life <= 0 || p.y > el.height + 30) { ps.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.c;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  if (ps.length === 0) {
    cancelAnimationFrame(confettiCanvas.raf);
    confettiCanvas.raf = 0;
    ctx.clearRect(0, 0, el.width, el.height);
  }
}

// ------------------------- Mini board (hero) -------------------------
const MINI_SETUP = [
  ['b', 'r'], ['b', 'n'], ['b', 'b'], ['b', 'q'], ['b', 'k'], ['b', 'b'], ['b', 'n'], ['b', 'r'],
];
const UNICODE_PIECES = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};

export function renderMiniBoard() {
  const el = document.getElementById('mini-board');
  if (!el || el.childElementCount) return;
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const i = document.createElement('i');
      i.className = (r + f) % 2 === 0 ? 'l' : 'd';
      let ch = '';
      if (r === 0) ch = UNICODE_PIECES['b' + back[f]];
      else if (r === 1) ch = UNICODE_PIECES.bp;
      else if (r === 6) ch = UNICODE_PIECES.wp;
      else if (r === 7) ch = UNICODE_PIECES['w' + back[f]];
      i.textContent = ch;
      i.style.color = r < 2 ? '#1c1c22' : '#fdfdfd';
      i.style.textShadow = r < 2 ? '0 1px 0 rgba(255,255,255,.4)' : '0 2px 3px rgba(0,0,0,.7)';
      el.appendChild(i);
    }
  }
}

export { sfx };
