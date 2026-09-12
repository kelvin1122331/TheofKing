// ============================================================
// TheofKing — bootstrap aplikasi: onboarding, home, lobby,
// leaderboard, profil, tema, dan orkestrasi Game + Net.
// ============================================================
import { store, saveStats, validateProfile, PRESET_AVATARS, getLeaderboard, myGlobalRank, avatarGradientFor, initialsFor, makePlayerId, addFriend, removeFriend } from './store.js?v=20';
import { rankForStars, rankProgress, RANKS, STARS_PER_RANK } from './ranks.js?v=20';
import { sfx, unlockAudio, soundEnabled, setSoundEnabled } from './sound.js?v=20';
import { $, $$, esc, openModal, closeModal, toast, confirmDialog, initConfirm, copyText, avatarHTML, starRowHTML, renderMiniBoard, fmtTimeAgo, showVsSplash, nickHTML } from './ui.js?v=20';
import { Net, peerErrorMessage, arenaCodeFor, ARENA_BUCKET_MS } from './net.js?v=20';
import { Server, isServerOnline, isServerReadonly, setServerReadonly, checkServer, openMatchSocket } from './server.js?v=20';
import { Game } from './game.js?v=20';
import { preloadPieces } from './pieces.js?v=20';
import { AI_LEVELS, AI_NAMES, chooseMove } from './ai.js?v=20';
import { COUNTRIES, countryByCode, flagEmoji, flagFor } from './countries.js?v=20';
import { SKINS, skinById, applySkin } from './skins.js?v=20';
import { BORDERS, AVATARS, NICKFX, borderById, avatarById, avatarImg, nickFxById } from './cosmetics.js?v=20';

// Penanda untuk skrip diagnostik boot (lihat index.html)
window.__TOK_MODULE_OK = true;

// ------------------------- state -------------------------
let screen = 'home';
let selectedMode = null;
let game = null;
let net = null;
let lobby = null; // { code, isHost, config, guest, host, started }

const TIME_OPTIONS = [
  { id: 'none',   label: 'Tanpa Jam', ms: 0,      inc: 0 },
  { id: 'b1',     label: '1 mnt ⚡',  ms: 60000,  inc: 0 },
  { id: 'b32',    label: '3+2 ⚡',    ms: 180000, inc: 2000 },
  { id: 'b5',     label: '5 mnt',     ms: 300000, inc: 0 },
  { id: 'r10',    label: '10 mnt',    ms: 600000, inc: 0 },
];

const cfgState = {
  ai: { diff: 'medium', color: 'random', time: 'b5' },
  local: { color: 'w', time: 'none' },
  online: { tab: 'create', color: 'random', time: 'b5', code: '' },
};


function timeById(id) {
  return TIME_OPTIONS.find((t) => t.id === id) || TIME_OPTIONS[0];
}
function flipCoin() { return Math.random() < 0.5 ? 'w' : 'b'; }
function resolveColor(choice) { return choice === 'random' ? flipCoin() : choice; }

// ------------------------- navigasi -------------------------
function showScreen(name) {
  screen = name;
  $('#screen-home').hidden = name !== 'home';
  $('#screen-lobby').hidden = name !== 'lobby';
  $('#screen-game').hidden = name !== 'game';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cleanupGame() {
  if (game) { game.destroy(); game = null; }
  closeModal('modal-result');
  $('#game-chat-messages').innerHTML = '';
  $('#game-chat-input').value = '';
}

function cleanupNet() {
  if (net) { net.destroy(); net = null; }
  lobby = null;
  $('#lobby-chat-messages').innerHTML = '';
  $('#lobby-chat-input').value = '';
}

function goMenu() {
  cleanupGame();
  cleanupNet();
  refreshStats();
  showScreen('home');
}

// ------------------------- header & statistik -------------------------
function currentProfile() { return store.profile; }

function ensureProfileId() {
  const p = store.profile;
  if (p && !p.id) {
    p.id = makePlayerId();
    store.profile = p;
  }
}

function updateFriendsBadge() {
  const n = store.friends.length;
  const el = document.getElementById('friends-count');
  if (!el) return;
  el.textContent = n > 99 ? '99+' : n;
  el.hidden = n === 0;
}

function renderChip() {
  const p = currentProfile();
  const chip = $('#profile-chip');
  if (!p) { chip.innerHTML = '👤 Masuk'; updateFriendsBadge(); return; }
  const r = rankForStars(store.stats.stars);
  chip.innerHTML = `${avatarHTML(p, 32)}
    <span class="pinfo"><span class="pname">${flagFor(p) ? flagFor(p) + " " : ""}${nickHTML(p.name, p.nickFx)}</span>
    <span class="prank">${r.icon} ${r.name} • ⭐ ${store.stats.stars}</span>
    <span class="pcoins" title="Koin — klik untuk buka Shop">🪙 <b id="coin-balance">${store.stats.coins || 0}</b></span></span>`;
  updateFriendsBadge();
}

function refreshStats() {
  renderChip();
  const st = store.stats;
  const rank = rankForStars(st.stars || 0);
  const prog = rankProgress(st.stars || 0);
  $('#stat-rank').innerHTML = `<span class="rank-medal">${rank.icon}</span>
    <span><span class="rank-name">${rank.name}</span><br>
    <span class="muted small">${prog.maxed ? 'MAX 👑' : `${prog.filled}/${prog.total} ⭐ ke ${prog.next.icon} ${prog.next.name}`}</span></span>`;
  $('#star-progress').innerHTML = starRowHTML(st.stars || 0) +
    `<div class="rank-bar" style="flex-basis:100%"><i style="width:${(prog.filled / prog.total) * 100}%"></i></div>`;
  $('#stat-streak').textContent = st.streak || 0;
  $('#stat-best-streak').textContent = st.bestStreak || 0;
  $('#stat-wins').textContent = st.wins || 0;
  $('#stat-draws').textContent = st.draws || 0;
  $('#stat-losses').textContent = st.losses || 0;
  $('#stat-games').textContent = st.games || 0;
  const g = myGlobalRank('stars');
  $('#stat-global').textContent = g ? '#' + g : '#–';
  $('#stat-coins').textContent = st.coins || 0;
  $('#stat-prot').textContent = st.protections || 0;
  $('#hero-stars').textContent = st.stars || 0;
  $('#hero-streak').textContent = st.streak || 0;
  // ladder
  $('#rank-ladder').innerHTML = RANKS.map((r) =>
    `<span class="rank-pill ${r.id === rank.id ? 'current' : ''}">${r.icon} ${r.name}</span>`).join('');
  renderRecent();
}

function renderRecent() {
  const list = store.recent || [];
  lastRecent = list;
  const panel = $('#recent-panel');
  if (!list.length) { panel.hidden = true; return; }
  panel.hidden = false;
  const modeName = { ai: 'vs Komputer', local: 'vs Teman', online: 'Online' };
  const resName = { win: 'Menang', loss: 'Kalah', draw: 'Seri' };
  $('#recent-list').innerHTML = list.map((r, i) => `
    <div class="recent-item" data-ri="${i}" style="cursor:pointer" title="Lihat detail">
      <span class="r ${r.result}">${r.result === 'win' ? '🏆' : r.result === 'loss' ? '💔' : '🤝'} ${resName[r.result]}</span>
      <span class="opp">${esc(((r.opp && typeof r.opp === 'object') ? r.opp.name : r.opp) || '')} • ${modeName[r.mode] || r.mode} • ${r.moves || 0} langkah</span>
      <span class="dt">${fmtTimeAgo(r.at)}</span>
    </div>`).join('');
}

// ------------------------- pemilih negara -------------------------
let obPicker = null;
let pfPicker = null;

function closeAllCountryDrops() {
  if (obPicker) obPicker.close();
  if (pfPicker) pfPicker.close();
}

function createCountryPicker(prefix) {
  const btn = document.getElementById(`${prefix}-country-btn`);
  const drop = document.getElementById(`${prefix}-country-drop`);
  const search = document.getElementById(`${prefix}-country-search`);
  const list = document.getElementById(`${prefix}-country-list`);
  let value = null; // kode ISO, mis. 'ID'
  const paintBtn = () => {
    const c = value ? countryByCode(value) : null;
    btn.innerHTML = c
      ? `<span class="flag">${flagEmoji(c.code)}</span><span>${esc(c.name)}</span><span class="caret">▾</span>`
      : `<span class="flag">🏳️</span><span class="muted">Pilih negara...</span><span class="caret">▾</span>`;
  };
  const renderList = (filter = '') => {
    const f = filter.trim().toLowerCase();
    const items = !f ? COUNTRIES : COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(f) || c.code.toLowerCase() === f);
    let html = `<button type="button" class="country-item ${!value ? 'active' : ''}" data-code=""><span class="flag">🏳️</span><span>Tanpa bendera</span></button>`;
    html += items.map((c) =>
      `<button type="button" class="country-item ${c.code === value ? 'active' : ''}" data-code="${c.code}"><span class="flag">${flagEmoji(c.code)}</span><span>${esc(c.name)}</span></button>`
    ).join('');
    if (!items.length) html += `<div class="country-empty">Tidak ditemukan. Coba kata lain.</div>`;
    list.innerHTML = html;
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.click();
    const willOpen = drop.hidden;
    closeAllCountryDrops();
    drop.hidden = !willOpen;
    if (willOpen) { search.value = ''; renderList(''); setTimeout(() => search.focus(), 30); }
  });
  search.addEventListener('input', () => renderList(search.value));
  search.addEventListener('click', (e) => e.stopPropagation());
  drop.addEventListener('click', (e) => e.stopPropagation());
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.country-item');
    if (!item) return;
    value = item.dataset.code || null;
    paintBtn();
    renderList(search.value);
    drop.hidden = true;
    sfx.click();
  });
  paintBtn();
  renderList('');
  return {
    get: () => value,
    set: (code) => { value = code || null; paintBtn(); renderList(''); },
    close: () => { const was = !drop.hidden; drop.hidden = true; return was; },
  };
}

// ------------------------- onboarding & profil -------------------------
let avatarDraft = { type: 'initial', data: null };

function renderPresetGrid(rootId, previewId) {
  const root = $(rootId);
  root.innerHTML = '';
  PRESET_AVATARS.forEach((em) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-pick' + (avatarDraft.type === 'preset' && avatarDraft.data === em ? ' active' : '');
    b.textContent = em;
    b.addEventListener('click', () => {
      avatarDraft = { type: 'preset', data: em };
      sfx.click();
      renderPresetGrid(rootId, previewId);
      updateAvatarPreview(previewId);
    });
    root.appendChild(b);
  });
}

function updateAvatarPreview(previewId, nameVal = '') {
  const pv = $(previewId);
  const name = nameVal || $('#ob-name')?.value || $('#pf-name')?.value || '?';
  if (avatarDraft.type === 'premium' && avatarDraft.data) {
    pv.innerHTML = `<img src="${avatarImg(avatarDraft.data)}" alt="avatar" />`;
  } else if (avatarDraft.type === 'upload' && avatarDraft.data) {
    pv.innerHTML = `<img src="${avatarDraft.data}" alt="foto" />`;
  } else if (avatarDraft.type === 'preset' && avatarDraft.data) {
    pv.textContent = avatarDraft.data;
    pv.style.background = avatarGradientFor('x');
  } else {
    pv.textContent = initialsFor(name) || '?';
    pv.style.background = avatarGradientFor(name);
  }
}

function handleAvatarUpload(inputEl, previewId) {
  const file = inputEl.files?.[0];
  inputEl.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('File harus gambar ya 📷', 'error'); return; }
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    try {
      const S = 160;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const cx = cv.getContext('2d');
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      cx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
      avatarDraft = { type: 'upload', data: cv.toDataURL('image/jpeg', 0.85) };
      updateAvatarPreview(previewId);
      sfx.notify();
      toast('Foto profil dipasang! 📷', 'success');
    } catch { toast('Gagal memproses gambar.', 'error'); }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Gagal membaca gambar.', 'error'); };
  img.src = url;
}

function initOnboarding() {
  renderPresetGrid('#ob-avatar-presets', '#ob-avatar-preview');
  obPicker = createCountryPicker('ob');
  updateAvatarPreview('#ob-avatar-preview');
  $('#ob-name').addEventListener('input', () => updateAvatarPreview('#ob-avatar-preview'));
  $('#ob-avatar-upload').addEventListener('change', (e) => handleAvatarUpload(e.target, '#ob-avatar-preview'));
  $('#ob-submit').addEventListener('click', () => {
    const er = $('#ob-error');
    const fail = (msg) => { er.textContent = msg; er.hidden = false; sfx.illegal(); };
    const v = validateProfile($('#ob-name').value, $('#ob-username').value);
    if (!v.ok) { fail(v.message); return; }
    if (avatarDraft.type !== 'preset' && avatarDraft.type !== 'upload') {
      fail('Pilih foto profil dulu ya 📷 (emoji / upload).');
      return;
    }
    if (!obPicker.get()) { fail('Pilih negara asal kamu dulu ya 🚩'); return; }
    er.hidden = true;
    store.profile = { name: v.name, username: v.username, avatar: { ...avatarDraft }, country: obPicker.get(), id: makePlayerId(), createdAt: Date.now() };
    closeModal('modal-onboarding');
    sfx.start();
    toast(`Selamat datang, ${v.name}! 👑`, 'gold');
    refreshStats();
    linkAccount();
  });
}

function openProfileModal() {
  ensureProfileId();
  const p = currentProfile();
  if (!p) return;
  document.getElementById('pf-id').textContent = p.id || '–';
  avatarDraft = { ...(p.avatar || { type: 'initial', data: null }) };
  renderPresetGrid('#pf-avatar-presets', '#pf-avatar-preview');
  $('#pf-name').value = p.name;
  $('#pf-username').value = p.username;
  pfPicker.set(p.country || null);
  $('#pf-error').hidden = true;
  updateAvatarPreview('#pf-avatar-preview', p.name);
  const st = store.stats;
  const r = rankForStars(st.stars);
  $('#profile-stats').innerHTML =
    `<span class="chip">${r.icon} ${r.name}</span><span class="chip">⭐ ${st.stars}</span>` +
    `<span class="chip">🔥 ${st.streak} (terbaik ${st.bestStreak})</span>` +
    `<span class="chip">🏆 ${st.wins} 🤝 ${st.draws} 💔 ${st.losses}</span>`;
  openModal('modal-profile');
}

function initProfileModal() {
  pfPicker = createCountryPicker('pf');
  $('#pf-name').addEventListener('input', () => updateAvatarPreview('#pf-avatar-preview'));
  $('#pf-avatar-upload').addEventListener('change', (e) => handleAvatarUpload(e.target, '#pf-avatar-preview'));
  $('#pf-avatar-skip').addEventListener('click', () => {
    avatarDraft = { type: 'initial', data: null };
    sfx.click();
    renderPresetGrid('#pf-avatar-presets', '#pf-avatar-preview');
    updateAvatarPreview('#pf-avatar-preview');
  });
  $('#pf-save').addEventListener('click', () => {
    const v = validateProfile($('#pf-name').value, $('#pf-username').value);
    if (!v.ok) {
      const er = $('#pf-error');
      er.textContent = v.message;
      er.hidden = false;
      sfx.illegal();
      return;
    }
    const p = store.profile || {};
    store.profile = { ...p, name: v.name, username: v.username, avatar: { ...avatarDraft }, country: pfPicker.get() };
    closeModal('modal-profile');
    sfx.notify();
    toast('Profil disimpan! 💾', 'success');
    refreshStats();
    schedulePush();
  });
  $('#pf-copy-id').addEventListener('click', async () => {
    sfx.click();
    if (await copyText(currentProfile()?.id || '')) toast('ID disalin! 📋', 'success');
  });
  $('#pf-reset').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Hapus Semua Data?',
      message: 'Profil, bintang, streak, dan rank akan hilang permanen. Yakin?',
      ok: 'Ya, hapus', cancel: 'Batal',
    });
    if (ok) {
      store.clearAll();
      location.reload();
    }
  });
}

// ------------------------- leaderboard -------------------------
let lbTab = 'stars';

function openLeaderboard() {
  sfx.click();
  renderLeaderboard();
  openModal('modal-leaderboard');
}

let lastLbRows = [];
let lastRecent = [];

function paintLeaderboard(rows, meRank) {
  lastLbRows = rows;
  const medal = (pos) => (pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`);
  $('#lb-list').innerHTML = rows.map((r, i) => `
    <div class="lb-row ${r.me ? 'me' : ''}" data-lbi="${i}" style="cursor:pointer" title="Lihat profil">
      <span class="pos">${medal(r.pos)}</span>
      ${avatarHTML(r, 40)}
      <span class="who"><span class="n">${flagFor(r) ? flagFor(r) + ' ' : ''}${nickHTML(r.name, r.nickFx)}${r.me ? ' (Kamu)' : ''}</span><br>
      <span class="u">@${esc(r.username)} • ${r.rank.icon} ${r.rank.name}</span></span>
      <span class="score">${lbTab === 'stars' ? '⭐ ' + r.stars : '🔥 ' + r.streak}</span>
      <span class="lb-likes">❤️ ${r.likes || 0}</span>
    </div>`).join('');
  $('#lb-me').innerHTML = meRank ? `Peringkatmu: <b>#${meRank}</b> dari ${rows.length} pemain 🌍` : '';
}

function renderLeaderboard() {
  $$('#modal-leaderboard .tab').forEach((t) => t.classList.toggle('active', t.dataset.lbtab === lbTab));
  paintLeaderboard(getLeaderboard(lbTab), myGlobalRank(lbTab));
  if (isServerOnline()) {
    const tab = lbTab;
    Server.leaderboard(tab, currentProfile()?.id).then((lb) => {
      if (tab !== lbTab || document.getElementById('modal-leaderboard').hidden) return;
      const myId = currentProfile()?.id;
      paintLeaderboard(lb.players.map((x, i) => ({
        id: x.id, name: x.name, username: x.username, avatar: x.avatar, bot: false,
        me: !!myId && x.id === myId, country: x.country || null, avatarBorder: x.avatarBorder || null,
        stars: x.stars, streak: x.streak, likes: x.likes || 0, nickFx: x.nickFx || 'none', rank: rankForStars(x.stars), pos: i + 1,
      })), lb.meRank);
    }).catch(() => { /* tetap tampilkan lokal */ });
  }
}

// ------------------------- mode & konfigurasi -------------------------
function segHTML(options, activeId, group) {
  return `<div class="seg" data-group="${group}">` + options.map((o) =>
    `<button type="button" data-val="${o.id}" class="${o.id === activeId ? 'active' : ''}">${o.label}</button>`).join('') + `</div>`;
}

function renderModeConfig() {
  const box = $('#mode-config');
  if (!selectedMode) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  if (selectedMode === 'ai') {
    const s = cfgState.ai;
    box.innerHTML = `
      <h3>🤖 Vs Komputer <span class="muted small">— offline, tetap dapat ⭐</span></h3>
      <div class="cfg-grid">
        <div class="cfg-group"><label>Level Komputer</label>
          ${segHTML(AI_LEVELS.map((l) => ({ id: l.id, label: l.name })), s.diff, 'diff')}</div>
        <div class="cfg-group"><label>Main Sebagai</label>
          ${segHTML([{ id: 'w', label: '⬜ Putih' }, { id: 'b', label: '⬛ Hitam' }, { id: 'random', label: '🎲 Acak' }], s.color, 'color')}</div>
        <div class="cfg-group"><label>Kontrol Waktu</label>
          ${segHTML(TIME_OPTIONS.map((t) => ({ id: t.id, label: t.label })), s.time, 'time')}</div>
      </div>
      <button class="btn btn-gold btn-lg btn-block" id="btn-start-mode">▶ Mulai Main</button>`;
  } else if (selectedMode === 'local') {
    const s = cfgState.local;
    box.innerHTML = `
      <h3>👥 Vs Teman <span class="muted small">— 1 HP berdua, ⭐ untuk kamu jika menang</span></h3>
      <div class="cfg-grid">
        <div class="cfg-group"><label>Kamu Bermain Sebagai</label>
          ${segHTML([{ id: 'w', label: '⬜ Putih' }, { id: 'b', label: '⬛ Hitam' }], s.color, 'color')}</div>
        <div class="cfg-group"><label>Kontrol Waktu</label>
          ${segHTML(TIME_OPTIONS.map((t) => ({ id: t.id, label: t.label })), s.time, 'time')}</div>
      </div>
      <button class="btn btn-gold btn-lg btn-block" id="btn-start-mode">▶ Mulai Main</button>`;
  } else if (selectedMode === 'online') {
    const s = cfgState.online;
    box.innerHTML = `
      <h3>🌐 Main Online <span class="muted small">— 1 vs 1 real-time, dapat ⭐</span></h3>
      <div class="online-tabs">
        <button type="button" data-otab="create" class="${s.tab === 'create' ? 'active' : ''}">✨ Buat Room</button>
        <button type="button" data-otab="join" class="${s.tab === 'join' ? 'active' : ''}">🔑 Gabung Room</button>
      </div>
      <div id="online-pane"></div>`;
    const renderPane = () => {
      const pane = $('#online-pane');
      if (s.tab === 'create') {
        pane.innerHTML = `
          <div class="cfg-grid">
            <div class="cfg-group"><label>Kamu Main Sebagai</label>
              ${segHTML([{ id: 'w', label: '⬜ Putih' }, { id: 'b', label: '⬛ Hitam' }, { id: 'random', label: '🎲 Acak' }], s.color, 'color')}</div>
            <div class="cfg-group"><label>Kontrol Waktu</label>
              ${segHTML(TIME_OPTIONS.filter((t) => t.id !== 'none').map((t) => ({ id: t.id, label: t.label })), s.time === 'none' ? 'b5' : s.time, 'time')}</div>
          </div>
          <button class="btn btn-gold btn-lg btn-block" id="btn-online-create">✨ Buat Room &amp; Dapat Kode</button>`;
        bindSeg(pane, s);
        $('#btn-online-create').addEventListener('click', createRoom);
      } else {
        pane.innerHTML = `
          <div class="cfg-group"><label>Masukkan Kode Room Temanmu</label>
            <input class="code-input" id="join-code" maxlength="6" placeholder="••••••" autocomplete="off" />
          </div>
          <button class="btn btn-gold btn-lg btn-block" id="btn-online-join">🔑 Gabung Room</button>`;
        const inp = $('#join-code');
        inp.value = s.code || '';
        inp.addEventListener('input', () => {
          inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
          s.code = inp.value;
        });
        $('#btn-online-join').addEventListener('click', joinRoom);
      }
    };
    $$('[data-otab]', box).forEach((b) => b.addEventListener('click', () => {
      s.tab = b.dataset.otab;
      sfx.click();
      $$('[data-otab]', box).forEach((x) => x.classList.toggle('active', x === b));
      renderPane();
    }));
    renderPane();
    return;
  } else if (selectedMode === 'arena') {
    const r = rankForStars(store.stats.stars || 0);
    box.innerHTML = `
      <h3>⚔️ Arena Online <span class="muted small">— lawan acak se-rank, otomatis</span></h3>
      <div class="arena-info">
        <div>🏅 Rank kamu: <b>${r.icon} ${r.name}</b> • ⭐ ${store.stats.stars || 0}</div>
        <div class="muted small">🎲 Warna acak • ⏱️ ${ARENA_TIME.label} • menang/kalah memengaruhi ⭐</div>
      </div>
      <button class="btn btn-gold btn-lg btn-block" id="btn-arena-search">⚔️ Cari Lawan Se-Rank</button>`;
    $('#btn-arena-search').addEventListener('click', startArenaSearch);
    return;
  }
  bindSeg(box, cfgState[selectedMode]);
  $('#btn-start-mode').addEventListener('click', startOfflineGame);
}

function bindSeg(root, stateObj) {
  $$('.seg', root).forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      sfx.click();
      stateObj[seg.dataset.group] = b.dataset.val;
      $$('button', seg).forEach((x) => x.classList.toggle('active', x === b));
    });
  });
}

function selectMode(mode, scroll = true) {
  selectedMode = mode;
  sfx.click();
  $$('.mode-card').forEach((c) => c.classList.toggle('selected', c.dataset.mode === mode));
  renderModeConfig();
  if (scroll) $('#mode-config').scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

async function startOfflineGame() {
  unlockAudio();
  sfx.click();
  const me = currentProfile();
  if (!me) { openModal('modal-onboarding'); return; }
  let cfg, opp, modeLabel, oppSub, sub;
  if (selectedMode === 'ai') {
    const s = cfgState.ai;
    const t = timeById(s.time);
    const myColor = resolveColor(s.color);
    const lvName = (AI_LEVELS.find((l) => l.id === s.diff) || {}).name || s.diff;
    opp = { name: AI_NAMES[s.diff] || 'Komputer', username: 'komputer', avatar: { type: 'preset', data: '🤖' }, bot: true };
    cfg = { mode: 'ai', myColor, difficulty: s.diff, timeMs: t.ms, incMs: t.inc, me, net: null };
    modeLabel = '🤖 VS KOMPUTER • ' + lvName.toUpperCase();
    oppSub = 'Level ' + lvName;
    sub = `⏱️ ${t.label} • Kamu: ${myColor === 'w' ? '⬜ Putih' : '⬛ Hitam'}`;
  } else if (selectedMode === 'local') {
    const s = cfgState.local;
    const t = timeById(s.time);
    opp = { name: 'Teman (Tamu)', username: 'tamu', avatar: { type: 'preset', data: '👤' }, guest: true };
    cfg = { mode: 'local', myColor: s.color, timeMs: t.ms, incMs: t.inc, me, net: null };
    modeLabel = '👥 VS TEMAN • SATU LAYAR';
    oppSub = '@tamu • main di HP ini';
    sub = `⏱️ ${t.label} • Kamu: ${s.color === 'w' ? '⬜ Putih' : '⬛ Hitam'}`;
  } else return;
  const r = rankForStars(store.stats.stars || 0);
  await showVsSplash({
    me, opp,
    meSub: `${r.icon} ${r.name} • ⭐ ${store.stats.stars || 0}`,
    oppSub, modeLabel, sub,
    meStreak: store.stats.streak || 0,
    oppStreak: 0,
  });
  cleanupGame();
  $('#panel-chat').hidden = true;
  showScreen('game');
  game = new Game(cfg, { onMenu: goMenu });
  game.start();
  toast(cfg.mode === 'ai' ? `Melawan ${game.oppProfile().name}! Semangat! ⚔️` : 'Selamat bertanding! 🤝', 'gold');
}

// ------------------------- server: sinkron -------------------------
let pushTimer = null, pushing = false, readonlyWarned = false;

function paintServerStatus() {
  const el = document.getElementById('server-status');
  if (el) el.textContent = isServerOnline() ? '🟢 Server' : '⚪ Offline';
}

async function initServerLink() {
  paintServerStatus();
  const ok = await checkServer();
  paintServerStatus();
  if (ok) {
    linkAccount();
    fetchInbox();
    if (!inboxTimer) { inboxTimer = setInterval(fetchInbox, 60000); if (inboxTimer && inboxTimer.unref) inboxTimer.unref(); }
  }
}

async function linkAccount() {
  const p = currentProfile();
  if (!p?.id) return;
  try {
    const { account } = await Server.pull(p.id);
    const localRev = store.stats._rev || 0;
    if ((account.rev || 0) > localRev) {
      applyServerAccount(account);
      toast('Data disinkron dari server 🌐', 'gold');
    } else if (localRev > (account.rev || 0)) {
      schedulePush();
    }
  } catch (e) {
    if (e.code === 404 && !isServerReadonly()) {
      try {
        await Server.register({ id: p.id, username: p.username, name: p.name, avatar: p.avatar, country: p.country, avatarBorder: p.avatarBorder || null });
        schedulePush();
      } catch (e2) {
        if (e2.code === 409) {
          setServerReadonly(true);
          if (!readonlyWarned) { readonlyWarned = true; toast('Username dipakai akun lain di server ⚠️', 'error'); }
        }
      }
    }
  }
}

async function pullAccount() {
  const p = currentProfile();
  if (!p?.id || !isServerOnline()) return;
  try {
    const { account } = await Server.pull(p.id);
    if ((account.rev || 0) > (store.stats._rev || 0)) applyServerAccount(account);
  } catch { /* abaikan */ }
}

function applyServerAccount(a) {
  store.profile = { id: a.id, username: a.username, name: a.name, avatar: a.avatar, country: a.country, avatarBorder: a.avatarBorder || null, nickFx: a.nickFx || 'none', createdAt: store.profile?.createdAt || Date.now() };
  store.stats = { ...a.stats, _rev: a.rev || 0 };
  const s = store.settings;
  if (a.settings?.skin) s.skin = a.settings.skin;
  if (Array.isArray(a.settings?.skins)) s.skins = a.settings.skins;
  if (Array.isArray(a.settings?.borders)) s.borders = a.settings.borders;
  if (Array.isArray(a.settings?.avatars)) s.avatars = a.settings.avatars;
  if (Array.isArray(a.settings?.nickfx)) s.nickfx = a.settings.nickfx;
  store.settings = s;
  store.friends = Array.isArray(a.friends) ? a.friends : [];
  refreshStats();
  applyEquippedSkin();
}

function schedulePush() {
  if (!isServerOnline() || isServerReadonly()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAccount, 1500);
}

async function pushAccount() {
  if (!isServerOnline() || isServerReadonly() || pushing) return;
  const p = currentProfile();
  if (!p?.id) return;
  pushing = true;
  try {
    const st = store.stats;
    const rev = (st._rev || 0) + 1;
    const set = store.settings;
    const { account } = await Server.push(p.id, {
      profile: { name: p.name, username: p.username, avatar: p.avatar, country: p.country, avatarBorder: p.avatarBorder || null, nickFx: p.nickFx || 'none' },
      stats: { ...st },
      settings: { skin: set.skin, skins: set.skins, borders: set.borders, avatars: set.avatars, nickfx: set.nickfx },
      friends: store.friends,
      rev,
    });
    const cur = store.stats;
    cur._rev = account.rev;
    store.stats = cur;
  } catch (e) {
    if (e.code === 409 && e.account) {
      const cur = store.stats;
      if ((e.account.rev || 0) > (cur._rev || 0)) applyServerAccount(e.account);
    } else if (e.code === 409) {
      setServerReadonly(true); // username bentrok
    }
  } finally {
    pushing = false;
  }
}

// ------------------------- arena: matchmaking -------------------------
const ARENA_TIME = { ms: 300000, inc: 0, label: '5 mnt' };
let arena = null; // { active, round, fullOffset, startedAt, elapsedTimer, bucketWatch, bucket }

function myRankId() {
  return rankForStars(store.stats.stars || 0).id;
}

function setArenaStatus(t) {
  const el = document.getElementById('arena-status');
  if (el) el.textContent = t;
}

function updateArenaElapsed() {
  if (!arena?.active) return;
  const s = Math.floor((Date.now() - arena.startedAt) / 1000);
  document.getElementById('arena-elapsed').textContent = `⏱️ ${s} dtk`;
}

function endArenaSearch() {
  if (!arena) return;
  arena.active = false;
  clearInterval(arena.elapsedTimer);
  clearInterval(arena.bucketWatch);
  clearTimeout(arena.serverFallbackT);
  if (arenaSocket) { try { arenaSocket.close(); } catch { /* abaikan */ } arenaSocket = null; }
  arena = null;
}

function cancelArenaSearch() {
  if (!arena) { closeModal('modal-arena'); return; }
  endArenaSearch();
  cleanupNet();
  closeModal('modal-arena');
  sfx.click();
  toast('Pencarian lawan dibatalkan.', 'gold');
}

function arenaFail(msg) {
  endArenaSearch();
  cleanupNet();
  closeModal('modal-arena');
  toast(msg, 'error');
}

async function startArenaSearch() {
  unlockAudio();
  sfx.click();
  const me = currentProfile();
  if (!me) { openModal('modal-onboarding'); return; }
  if (arena?.active) return;
  if (typeof Peer === 'undefined') {
    toast('Butuh internet untuk Arena. Periksa koneksi lalu coba lagi 📶', 'error');
    return;
  }
  if (isServerOnline()) { startArenaServer(); return; }
  const r = rankForStars(store.stats.stars || 0);
  arena = { active: true, round: 0, fullOffset: 0, startedAt: Date.now(), bucket: Math.floor(Date.now() / ARENA_BUCKET_MS) };
  document.getElementById('arena-rank').innerHTML = `${r.icon} <b>${r.name}</b> • ⭐ ${store.stats.stars || 0}`;
  setArenaStatus('Mencari lawan se-rank…');
  document.getElementById('arena-elapsed').textContent = '⏱️ 0 dtk';
  openModal('modal-arena');
  arena.elapsedTimer = setInterval(updateArenaElapsed, 1000);
  arena.bucketWatch = setInterval(() => {
    if (!arena?.active || arena.server || lobby?.started || game) return;
    const matched = lobby && (lobby.isHost ? !!lobby.guest : true);
    if (matched) return;
    if (Math.floor(Date.now() / ARENA_BUCKET_MS) !== arena.bucket) {
      arena.bucket = Math.floor(Date.now() / ARENA_BUCKET_MS);
      searchArenaRound(); // slot baru → cari ulang
    }
  }, 3000);
  searchArenaRound();
}

/** Satu ronde: coba gabung bucket arena; kalau kosong, jadi host. */
let arenaSocket = null;

async function startArenaServer() {
  const me = currentProfile();
  const r = rankForStars(store.stats.stars || 0);
  arena = { active: true, round: 0, fullOffset: 0, startedAt: Date.now(), bucket: Math.floor(Date.now() / ARENA_BUCKET_MS), server: true, matched: false };
  document.getElementById('arena-rank').innerHTML = `${r.icon} <b>${r.name}</b> • ⭐ ${store.stats.stars || 0}`;
  setArenaStatus('Menghubungi server…');
  document.getElementById('arena-elapsed').textContent = '⏱️ 0 dtk';
  openModal('modal-arena');
  arena.elapsedTimer = setInterval(updateArenaElapsed, 1000);
  arena.bucketWatch = setInterval(() => {
    if (!arena?.active || arena.server || lobby?.started || game) return;
    const matched = lobby && (lobby.isHost ? !!lobby.guest : true);
    if (matched) return;
    if (Math.floor(Date.now() / ARENA_BUCKET_MS) !== arena.bucket) {
      arena.bucket = Math.floor(Date.now() / ARENA_BUCKET_MS);
      searchArenaRound();
    }
  }, 3000);
  const ws = openMatchSocket();
  if (!ws) { searchArenaRound(); return; }
  arenaSocket = ws;
  let matched = false;
  const queueMsg = () => JSON.stringify({ t: 'queue', id: me.id, rank: r.id, profile: { id: me.id, name: me.name, username: me.username, avatar: me.avatar, country: me.country || null }, stats: snapshotStats() });
  ws.onopen = () => {
    if (!arena?.active) { try { ws.close(); } catch { /* abaikan */ } return; }
    try { ws.send(queueMsg()); } catch { /* abaikan */ }
    setArenaStatus('Antre di server…');
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!arena?.active || matched) return;
    if (msg.t === 'queued') {
      setArenaStatus(`Antre #${msg.position} • ${r.icon} ${r.name}…`);
    } else if (msg.t === 'matched') {
      matched = true;
      arena.matched = true;
      const round = ++arena.round;
      try { ws.send(JSON.stringify({ t: 'started', code: msg.code })); } catch { /* abaikan */ }
      setTimeout(() => { try { ws.close(); } catch { /* abaikan */ } if (arenaSocket === ws) arenaSocket = null; }, 500);
      setArenaStatus(`Lawan: ${msg.opp?.profile?.name || '???'}! Menghubungkan…`);
      if (msg.role === 'host') {
        arena.serverFallbackT = setTimeout(() => {
          if (arena?.active && arena.server && !lobby?.guest && !lobby?.started && !game) {
            toast('Tamu tak datang, cari lokal… 📶', 'error');
            searchArenaRound();
          }
        }, 45000);
        hostArenaBucket(msg.code, round);
      } else {
        guestArenaJoin(msg.code, round);
      }
    } else if (msg.t === 'opp_gone' || msg.t === 'expired') {
      setArenaStatus('Antre lagi di server…');
      try { if (ws.readyState === 1) ws.send(queueMsg()); } catch { /* abaikan */ }
    }
  };
  const failToLegacy = () => {
    if (!arena?.active || matched) return;
    matched = true;
    try { ws.close(); } catch { /* abaikan */ }
    if (arenaSocket === ws) arenaSocket = null;
    setArenaStatus('Server sibuk, cari lokal…');
    searchArenaRound();
  };
  ws.onerror = () => failToLegacy();
  ws.onclose = () => { if (arenaSocket === ws) arenaSocket = null; failToLegacy(); };
}

/** Satu ronde legacy: coba gabung bucket; kalau kosong, jadi host. */
async function searchArenaRound() {
  if (!arena?.active) return;
  const round = ++arena.round;
  arena.server = false;
  arena.matched = false;
  const code = arenaCodeFor(myRankId(), Date.now() + arena.fullOffset * ARENA_BUCKET_MS);
  setArenaStatus(arena.fullOffset > 0 ? 'Arena penuh, cari slot lain…' : 'Mencari lawan se-rank…');
  guestArenaJoin(code, round);
}

/** Gabung kode arena sebagai tamu + handshake (dipakai legacy & server). */
async function guestArenaJoin(code, round) {
  const alive = () => arena?.active && arena.round === round;
  cleanupNet();
  net = new Net();
  try {
    await net.join(code);
  } catch (err) {
    if (!alive()) return;
    if (err?.type === 'peer-unavailable') {
      if (arena.server) { searchArenaRound(); return; } // host server hilang → legacy
      hostArenaBucket(code, round);
      return;
    }
    arenaFail(err?.message === 'TIMEOUT' ? 'Koneksi timeout. Coba lagi.' : peerErrorMessage(err));
    return;
  }
  if (!alive()) return;
  // ---- GUEST: handshake sambutan ----
  const me = currentProfile();
  setArenaStatus('Lawan ditemukan! Menghubungkan…');
  try {
    const welcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TIMEOUT')), 18000);
      net.onData = (msg) => {
        if (msg?.t === 'welcome') { clearTimeout(timer); resolve(msg); }
        else if (msg?.t === 'lobby_full') { clearTimeout(timer); reject(new Error('FULL')); }
      };
      net.onClose = () => { clearTimeout(timer); reject(new Error('CLOSED')); };
      net.send({ t: 'join', profile: me, stats: snapshotStats() });
    });
    if (!alive()) return;
    lobby = {
      code, isHost: false, started: false, arena: true,
      guest: { profile: me, stats: snapshotStats() },
      host: { profile: welcome.profile, stats: welcome.stats },
      config: welcome.config,
    };
    net.onData = onLobbyNetData;
    net.onClose = onLobbyNetClose;
    net.onError = (e) => console.warn('net', e);
    net.send({ t: 'ready' });
    setArenaStatus(`Lawan ditemukan: ${welcome.profile?.name || '???'}! Bersiap…`);
    // menunggu pesan 'start' dari host → startOnlineGame
  } catch (err) {
    if (!alive()) return;
    if (err?.message === 'FULL' || err?.message === 'CLOSED') {
      if (arena.server) { searchArenaRound(); } // slot server bermasalah → legacy
      else { arena.fullOffset++; searchArenaRound(); }
      return;
    }
    arenaFail(err?.message === 'TIMEOUT' ? 'Host tidak menjawab. Coba lagi.' : peerErrorMessage(err));
  }
}

/** Jadi host bucket arena lalu tunggu tamu se-rank. */
async function hostArenaBucket(code, round) {
  const alive = () => arena?.active && arena.round === round;
  cleanupNet();
  net = new Net();
  setArenaStatus('Menunggu lawan se-rank bergabung…');
  try {
    await net.host(code, 0, true);
  } catch (err) {
    if (!alive()) return;
    if (err?.type === 'unavailable-id') { searchArenaRound(); return; } // balapan: lawan jadi host duluan → gabung
    arenaFail(err?.message === 'TIMEOUT' ? 'Koneksi timeout. Coba lagi.' : peerErrorMessage(err));
    return;
  }
  if (!alive()) return;
  const me = currentProfile();
  const hostColor = Math.random() < 0.5 ? 'w' : 'b';
  lobby = {
    code, isHost: true, started: false, guest: null, arena: true,
    host: { profile: me, stats: snapshotStats() },
    config: { timeMs: ARENA_TIME.ms, incMs: ARENA_TIME.inc, timeLabel: ARENA_TIME.label, hostColor, guestColor: hostColor === 'w' ? 'b' : 'w' },
  };
  net.onGuest = () => { /* tunggu pesan join */ };
  net.onData = onLobbyNetData; // join → welcome; ready → mulai otomatis
  net.onClose = onLobbyNetClose;
  net.onError = (e) => console.warn('net', e);
  sfx.notify();
}

// ------------------------- online: lobby -------------------------
async function createRoom() {
  unlockAudio();
  sfx.click();
  const me = currentProfile();
  if (!me) { openModal('modal-onboarding'); return; }
  const btn = $('#btn-online-create');
  btn.disabled = true;
  btn.textContent = 'Membuat room…';
  cleanupNet();
  net = new Net();
  try {
    const { code } = await net.host();
    const s = cfgState.online;
    const t = timeById(s.time === 'none' ? 'b5' : s.time);
    const hostColor = resolveColor(s.color);
    lobby = {
      code, isHost: true, started: false, guest: null,
      host: { profile: me, stats: snapshotStats() },
      config: { timeMs: t.ms, incMs: t.inc, timeLabel: t.label, hostColor, guestColor: hostColor === 'w' ? 'b' : 'w' },
    };
    net.onGuest = () => { /* tunggu pesan join */ };
    net.onData = onLobbyNetData;
    net.onClose = onLobbyNetClose;
    net.onError = (e) => console.warn('net', e);
    enterLobby();
    toast(`Room ${code} dibuat! Bagikan kodenya 📋`, 'success');
  } catch (err) {
    console.error(err);
    toast(err?.message === 'TIMEOUT' ? 'Koneksi timeout. Coba lagi.' : peerErrorMessage(err), 'error');
    cleanupNet();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Buat Room &amp; Dapat Kode';
  }
}

async function joinRoom() {
  unlockAudio();
  sfx.click();
  const me = currentProfile();
  if (!me) { openModal('modal-onboarding'); return; }
  const code = (cfgState.online.code || '').toUpperCase().trim();
  if (code.length !== 6) { toast('Kode room harus 6 karakter 🔑', 'error'); sfx.illegal(); return; }
  const btn = $('#btn-online-join');
  btn.disabled = true;
  btn.textContent = 'Menyambung…';
  cleanupNet();
  net = new Net();
  try {
    await net.join(code);
    // kirim join & tunggu welcome
    const welcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TIMEOUT')), 18000);
      net.onData = (msg) => {
        if (msg?.t === 'welcome') { clearTimeout(timer); resolve(msg); }
        else if (msg?.t === 'lobby_full') { clearTimeout(timer); reject(new Error('FULL')); }
      };
      net.onClose = () => { clearTimeout(timer); reject(new Error('CLOSED')); };
      net.send({ t: 'join', profile: me, stats: snapshotStats() });
    });
    lobby = {
      code, isHost: false, started: false,
      guest: { profile: me, stats: snapshotStats() },
      host: { profile: welcome.profile, stats: welcome.stats },
      config: welcome.config,
    };
    net.onData = onLobbyNetData;
    net.onClose = onLobbyNetClose;
    net.onError = (e) => console.warn('net', e);
    enterLobby();
    sfx.notify();
    toast(`Bergabung ke room ${code}! 🎉`, 'success');
  } catch (err) {
    console.error(err);
    const msg = err?.message === 'TIMEOUT' ? 'Host tidak menjawab. Coba lagi.'
      : err?.message === 'FULL' ? 'Room penuh (maksimal 2 pemain).'
      : err?.message === 'CLOSED' ? 'Koneksi ditutup host.'
      : peerErrorMessage(err);
    toast(msg, 'error');
    cleanupNet();
  } finally {
    btn.disabled = false;
    btn.textContent = '🔑 Gabung Room';
  }
}

function snapshotStats() {
  const st = store.stats;
  return { stars: st.stars || 0, streak: st.streak || 0, wins: st.wins || 0, likes: st.likes || 0, skin: store.settings.skin || 'wood' };
}

function enterLobby() {
  cleanupGame();
  $('#lobby-code').textContent = lobby.code;
  $('#lobby-chat-messages').innerHTML = '';
  sysChat(`${lobby.isHost ? 'Kamu membuat' : 'Kamu bergabung ke'} room ${lobby.code}. ${lobby.isHost ? 'Bagikan kode ke temanmu!' : 'Menunggu host memulai…'}`);
  renderLobby();
  showScreen('lobby');
}

function renderLobby() {
  if (!lobby) return;
  const c = lobby.config;
  // host card
  $('#lobby-host').innerHTML = lobbyCardHTML(lobby.host, 'HOST');
  // guest card
  const g = $('#lobby-guest');
  if (lobby.guest) g.innerHTML = lobbyCardHTML(lobby.guest, 'TAMU');
  else {
    g.className = 'lobby-player empty';
    g.innerHTML = `<span class="spin">⏳</span><span>Menunggu lawan…<br><small>Bagikan kode room!</small></span>`;
    $('#lobby-guest').classList.add('empty');
  }
  if (lobby.guest) $('#lobby-guest').classList.remove('empty');
  $('#lobby-config').innerHTML =
    `<span>⏱️ <b>${esc(c.timeLabel)}</b></span><span>•</span>` +
    `<span>Host: <b>${c.hostColor === 'w' ? '⬜ Putih' : '⬛ Hitam'}</b></span><span>•</span>` +
    `<span>Tamu: <b>${c.guestColor === 'w' ? '⬜ Putih' : '⬛ Hitam'}</b></span>`;
  const startBtn = $('#btn-lobby-start');
  if (lobby.isHost) {
    startBtn.hidden = false;
    startBtn.disabled = !lobby.guest;
    $('#lobby-status').textContent = lobby.guest ? 'Lawan sudah siap! Tekan mulai ⚔️' : 'Menunggu lawan bergabung…';
  } else {
    startBtn.hidden = true;
    $('#lobby-status').textContent = `Terhubung sebagai Tamu (${c.guestColor === 'w' ? 'Putih ⬜' : 'Hitam ⬛'}). Menunggu host memulai…`;
  }
}

function lobbyCardHTML(entry, tag) {
  const r = rankForStars(entry.stats?.stars || 0);
  return `${avatarHTML(entry.profile, 54)}
    <span class="lname">${flagFor(entry.profile) ? flagFor(entry.profile) + " " : ""}${esc(entry.profile.name)}</span>
    <span class="lrank">${r.icon} ${r.name} • ⭐ ${entry.stats?.stars || 0} • 🔥 ${entry.stats?.streak || 0}</span>
    <span class="mode-tag ${tag === 'HOST' ? 'on' : 'off'}">${tag}</span>`;
}

function sysChat(text) {
  const box = $('#lobby-chat-messages');
  const d = document.createElement('div');
  d.className = 'chat-msg sys';
  d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function lobbyChatRender(msg, mine) {
  const box = $('#lobby-chat-messages');
  const d = document.createElement('div');
  d.className = 'chat-msg ' + (mine ? 'me' : 'them');
  d.innerHTML = `<span class="who">${esc(mine ? 'Kamu' : (msg.name || 'Lawan'))}</span>${esc(msg.text)}`;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  if (!mine) sfx.message();
}

function onLobbyNetData(msg) {
  if (!msg || typeof msg !== 'object' || !lobby) return;
  if (lobby.isHost) {
    switch (msg.t) {
      case 'join':
        if (arena?.serverFallbackT) { clearTimeout(arena.serverFallbackT); arena.serverFallbackT = null; }
        lobby.guest = { profile: msg.profile, stats: msg.stats };
        net.send({ t: 'welcome', profile: lobby.host.profile, stats: lobby.host.stats, config: lobby.config });
        sfx.notify();
        sysChat(`🎉 ${msg.profile?.name || 'Lawan'} bergabung!`);
        renderLobby();
        break;
      case 'ready':
        // arena: tamu siap → langsung mulai otomatis
        if (lobby.arena && lobby.guest && !lobby.started) startOnlineGame();
        break;
      case 'leave':
        lobby.guest = null;
        sysChat('Lawan keluar room.');
        renderLobby();
        break;
      case 'chat': lobbyChatRender(msg, false); break;
      case 'ping': net.send({ t: 'pong' }); break;
      default: break;
    }
  } else {
    switch (msg.t) {
      case 'start':
        lobby.config = { timeMs: msg.timeMs, incMs: msg.incMs, timeLabel: msg.timeLabel, hostColor: msg.hostColor, guestColor: msg.guestColor };
        startOnlineGame();
        break;
      case 'room_closed':
        toast('Host menutup room.', 'error');
        goMenu();
        break;
      case 'chat': lobbyChatRender(msg, false); break;
      case 'ping': net.send({ t: 'pong' }); break;
      default: break;
    }
  }
}

function onLobbyNetClose() {
  if (!lobby || lobby.started) return; // saat game, ditangani Game
  if (lobby.isHost) {
    if (lobby.guest) {
      lobby.guest = null;
      sysChat('📡 Lawan terputus.');
      renderLobby();
      toast('Lawan terputus 📡', 'error');
    }
  } else {
    if (lobby.arena && !lobby.started && arena?.active) {
      setArenaStatus('Host hilang, mencari lagi…');
      searchArenaRound();
      return;
    }
    toast('Terputus dari host 📡', 'error');
    goMenu();
  }
}

async function startOnlineGame() {
  if (!lobby || lobby.started) return;
  lobby.started = true;
  closeModal('modal-arena');
  endArenaSearch();
  const me = currentProfile();
  const myColor = lobby.isHost ? lobby.config.hostColor : lobby.config.guestColor;
  const oppEntry = lobby.isHost ? lobby.guest : lobby.host;
  const cfg = {
    mode: 'online',
    myColor,
    timeMs: lobby.config.timeMs,
    incMs: lobby.config.incMs,
    me,
    opp: oppEntry.profile,
    net,
    isHost: lobby.isHost,
  };
  // sematkan bintang lawan untuk tampilan
  cfg.opp = { ...oppEntry.profile, stars: oppEntry.stats?.stars || 0, skin: oppEntry.stats?.skin || 'wood', likes: oppEntry.stats?.likes || 0, nickFx: oppEntry.profile?.nickFx || 'none' };
  net.onData = (msg) => (game ? game.onNetMessage(msg) : onLobbyNetData(msg));
  net.onClose = () => {
    if (!game) {
      if (lobby) lobby.started = false;
      onLobbyNetClose();
      return;
    }
    // game: kirim leave semu → game menangani klaim menang
    game.onNetMessage({ t: 'leave' });
  };
  if (lobby.isHost) {
    net.send({ t: 'start', ...lobby.config });
  }
  cleanupGame();
  {
    const me = currentProfile();
    const r = rankForStars(store.stats.stars || 0);
    const or = rankForStars(cfg.opp.stars || 0);
    const oppSkinObj = skinById(cfg.opp.skin);
    const oppSkinLabel = oppSkinObj && cfg.opp.skin !== 'wood' ? ` • 🎨 ${oppSkinObj.name}` : '';
    await showVsSplash({
      me,
      opp: cfg.opp,
      meSub: `${r.icon} ${r.name} • ⭐ ${store.stats.stars || 0}`,
      oppSub: `${or.icon} ${or.name} • ⭐ ${cfg.opp.stars || 0}${oppSkinLabel}`,
      modeLabel: '🌐 ONLINE 1 VS 1',
      sub: `⏱️ ${lobby.config.timeLabel} • Kamu: ${myColor === 'w' ? '⬜ Putih' : '⬛ Hitam'}`,
      meStreak: store.stats.streak || 0,
      oppStreak: (oppEntry.stats && oppEntry.stats.streak) || 0,
    });
  }
  if (!lobby || !net || !net.connected) {
    toast('Lawan terputus sebelum mulai 📡', 'error');
    goMenu();
    return;
  }
  $('#panel-chat').hidden = false;
  $('#game-chat-messages').innerHTML = '';
  showScreen('game');
  game = new Game(cfg, { onMenu: goMenu });
  game.start();
  toast('Pertandingan dimulai! ⚔️', 'gold');
}

function initLobby() {
  $('#btn-arena-cancel').addEventListener('click', cancelArenaSearch);
  $('#btn-copy-code').addEventListener('click', async () => {
    sfx.click();
    if (!lobby) return;
    const ok = await copyText(lobby.code);
    toast(ok ? `Kode ${lobby.code} disalin! 📋` : 'Gagal menyalin.', ok ? 'success' : 'error');
  });
  $('#btn-share-code').addEventListener('click', () => {
    sfx.click();
    if (!lobby) return;
    const text = `Yuk main catur lawan aku di TheofKing! 👑%0AKode room: *${lobby.code}*%0A⏱️ ${encodeURIComponent(lobby.config.timeLabel)}`;
    window.open(`https://wa.me/?text=${text}`, '_blank');
  });
  $('#btn-lobby-start').addEventListener('click', () => {
    if (!lobby?.isHost || !lobby.guest) return;
    sfx.click();
    startOnlineGame();
  });
  $('#btn-lobby-leave').addEventListener('click', async () => {
    sfx.click();
    const ok = await confirmDialog({ title: 'Keluar Room?', message: 'Kamu akan keluar dari room ini.', ok: 'Ya, keluar', cancel: 'Batal' });
    if (!ok) return;
    if (net && lobby) {
      if (lobby.isHost) net.send({ t: 'room_closed' });
      else net.send({ t: 'leave' });
    }
    goMenu();
  });
  $('#lobby-chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#lobby-chat-input');
    const text = inp.value.trim();
    if (!text || !net) return;
    inp.value = '';
    const me = currentProfile();
    const msg = { t: 'chat', text: text.slice(0, 200), from: me.username, name: me.name, ts: Date.now() };
    if (net.send(msg)) lobbyChatRender(msg, true);
    else toast('Belum terhubung ke lawan.', 'error');
    sfx.click();
  });
}

// ------------------------- teman -------------------------
function openFriends() {
  if (!currentProfile()) { openModal('modal-onboarding'); return; }
  ensureProfileId();
  renderFriends();
  openModal('modal-friends');
}

function renderFriends() {
  const p = currentProfile() || {};
  document.getElementById('fr-my-user').textContent = p.username ? '@' + p.username : '–';
  document.getElementById('fr-my-id').textContent = p.id || '–';
  const list = store.friends;
  document.getElementById('fr-count').textContent = list.length;
  const box = document.getElementById('friends-list');
  box.innerHTML = list.length ? list.map((f) => `
    <div class="friend-row">
      <span class="friend-ava" style="background:${avatarGradientFor(f.username)}">${esc(initialsFor(f.username))}</span>
      <span class="friend-info"><b>@${esc(f.username)}</b><small>🆔 ${esc(f.id)}</small></span>
      <button class="btn btn-outline btn-sm" data-fr-copy="${esc(f.id)}" type="button">📋</button>
      <button class="btn btn-danger-ghost btn-sm" data-fr-del="${esc(f.id)}" type="button">✕</button>
    </div>`).join('')
    : '<div class="friends-empty">Belum ada teman. Tambahkan lewat username + ID di atas 👆</div>';
  updateFriendsBadge();
}

async function submitAddFriend() {
  const er = document.getElementById('fr-error');
  const uname = document.getElementById('fr-username').value;
  const fid = document.getElementById('fr-id').value;
  if (isServerOnline()) {
    try {
      const { account } = await Server.find((fid || '').trim() || uname);
      const uu = uname.trim().replace(/^@/, '').toLowerCase();
      if (uu && (fid || '').trim() && account.username.toLowerCase() !== uu) throw new Error('MISMATCH');
    } catch {
      er.textContent = 'Akun tidak terdaftar di server 🔍';
      er.hidden = false; sfx.illegal(); return;
    }
  }
  const r = addFriend(uname, fid, currentProfile()?.id);
  if (!r.ok) { er.textContent = r.message; er.hidden = false; sfx.illegal(); return; }
  er.hidden = true;
  document.getElementById('fr-username').value = '';
  document.getElementById('fr-id').value = '';
  sfx.buy();
  toast(`@${r.username} jadi temanmu! 👥`, 'success');
  renderFriends();
  schedulePush();
  if (isServerOnline()) Server.notify(currentProfile()?.id, r.id).catch(() => {});
}

// ------------------------- modal pemain & match -------------------------
function getLikedMap() {
  try { return JSON.parse(localStorage.getItem('tok.v1.liked') || '{}'); } catch { return {}; }
}
function hasLiked(id) {
  if (!id) return false;
  return !!getLikedMap()[String(id).toUpperCase()];
}
function markLiked(id, n) {
  try {
    const m = getLikedMap();
    m[String(id).toUpperCase()] = n || 0;
    localStorage.setItem('tok.v1.liked', JSON.stringify(m));
  } catch { /* abaikan */ }
}

function rowFromAccount(a) {
  if (!a) return null;
  const myId = currentProfile()?.id;
  const st = a.stats || {};
  const isMe = !!myId && a.id === myId;
  return {
    id: a.id, name: a.name, username: a.username, avatar: a.avatar || null,
    avatarBorder: a.avatarBorder || null, bot: false, me: isMe,
    country: a.country || null, stars: st.stars || 0, streak: st.streak || 0,
    likes: a.likes || 0, nickFx: a.nickFx || 'none', rank: rankForStars(st.stars || 0),
    pos: isMe ? (myGlobalRank('stars') || null) : null,
  };
}

function paintLbLikes(id, likes) {
  const rows = lastLbRows || [];
  const idx = rows.findIndex((x) => x.id === id);
  if (idx < 0) return;
  rows[idx].likes = likes;
  const el = document.querySelector(`#lb-list .lb-row[data-lbi="${idx}"] .lb-likes`);
  if (el) el.textContent = `❤️ ${likes}`;
}

function openPlayerModal(row) {
  if (!row) return;
  const myId = currentProfile()?.id || 'me';
  const isMe = !!row.me || (row.id && row.id === myId);
  const liked = hasLiked(row.id);
  const canLike = !isMe && !row.bot && !!row.id && isServerOnline() && !liked;
  const why = row.bot ? '🤖 Bot tidak bisa disukai' : !isServerOnline() ? '📴 Butuh server untuk suka' : '';
  const c = row.country ? countryByCode(row.country) : null;
  const rk = rankForStars(row.stars || 0);
  document.getElementById('player-body').innerHTML = `
    <div class="pm-wrap">
      <div class="pm-face">${avatarHTML(row, 76)}</div>
      <h2 class="pm-name">${nickHTML(row.name, row.nickFx)}</h2>
      <div class="pm-sub">${row.username ? '@' + esc(row.username) + ' • ' : ''}${esc(row.id || '')}${isMe ? ' • <b>Ini kamu</b>' : ''}${row.bot ? ' • 🤖 Bot' : ''}</div>
      <div class="pm-rank">${rk.icon} ${esc(rk.name)}</div>
      <div class="pm-grid">
        <div><b>${row.pos ? '#' + row.pos : '#–'}</b><span>Rank</span></div>
        <div><b>⭐ ${row.stars || 0}</b><span>Bintang</span></div>
        <div><b>❤️ <span id="pm-likes-n">${row.likes || 0}</span></b><span>Suka</span></div>
        <div><b>${row.country ? flagEmoji(row.country) : '–'}</b><span>${esc(c ? c.name : 'Negara')}</span></div>
      </div>
      ${isMe ? '' : `<button class="btn btn-gold pm-like" id="pm-like" type="button" ${canLike ? '' : 'disabled'}>${liked ? '❤️ Disukai' : canLike ? '❤️ Suka' : esc(why)}</button>`}
    </div>`;
  const btn = document.getElementById('pm-like');
  if (btn && canLike) {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await Server.like(myId, row.id);
        const n = (r && typeof r.likes === 'number') ? r.likes : (row.likes || 0) + 1;
        markLiked(row.id, n);
        const nn = document.getElementById('pm-likes-n'); if (nn) nn.textContent = n;
        btn.textContent = '❤️ Disukai';
        paintLbLikes(row.id, n);
        sfx.buy();
        toast(`❤️ Kamu menyukai ${row.name || 'pemain'}!`, 'success');
      } catch (err) {
        if (err && err.code === 409) {
          markLiked(row.id, row.likes || 0);
          btn.textContent = '❤️ Disukai';
        } else {
          btn.disabled = false;
          toast('Gagal memberi suka.', 'error');
        }
      }
    };
  }
  openModal('modal-player');
}

function openMatchModal(r) {
  if (!r) return;
  const me = currentProfile() || {};
  const st = store.stats || {};
  const o = (r.opp && typeof r.opp === 'object') ? r.opp : { name: (typeof r.opp === 'string' && r.opp) || 'Lawan' };
  const big = r.result === 'win' ? ['MENANG 🎉', 'win'] : r.result === 'loss' ? ['KALAH 😞', 'loss'] : ['SERI 🤝', 'draw'];
  const modeName = { ai: 'vs Komputer', local: 'vs Teman', online: 'Online' };
  const dt = r.at ? new Date(r.at) : null;
  const when = dt && !isNaN(dt) ? dt.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const REASON_ID = { checkmate: 'Skakmat', resign: 'Menyerah', timeout: 'Waktu habis', agreement: 'Sepakat seri', stalemate: 'Stalemate', fifty: 'Aturan 50 langkah', material: 'Buah tidak cukup' };
  const why = REASON_ID[r.reason] || '';
  const side = (tag, p) => {
    const cc = p.country ? countryByCode(p.country) : null;
    return `<div class="mm-side">
      <div class="mm-tag">${tag}</div>
      <div class="mm-face">${avatarHTML(p, 60)}</div>
      <div class="mm-name">${nickHTML(p.name, p.nickFx)}</div>
      <div class="mm-sub">${p.country ? esc(flagEmoji(p.country) + ' ' + (cc ? cc.name : p.country)) : '–'}</div>
      <div class="mm-stats">⭐ ${p.stars == null ? '–' : p.stars} &nbsp; ❤️ ${p.likes == null ? '–' : p.likes}</div>
    </div>`;
  };
  document.getElementById('match-body').innerHTML = `
    <div class="mm-result ${big[1]}">${big[0]}</div>
    <div class="mm-meta">${esc(modeName[r.mode] || r.mode || '')} • ${r.moves || 0} langkah${when ? ' • ' + esc(when) : ''}${why ? ' • ' + esc(why) : ''}</div>
    <div class="mm-vs">
      ${side('KAMU', { ...me, stars: st.stars || 0, likes: st.likes || 0 })}
      <div class="mm-x">VS</div>
      ${side('LAWAN', { avatar: o.avatar || null, avatarBorder: o.avatarBorder || null, name: o.name || 'Lawan', username: o.username || '', nickFx: o.nickFx || 'none', country: o.country || null, stars: (typeof o.stars === 'number' ? o.stars : null), likes: (typeof o.likes === 'number' ? o.likes : null) })}
    </div>`;
  openModal('modal-match');
}

// ------------------------- inbox -------------------------
let inboxCache = { messages: [], feed: [] };
let inboxTimer = null;

function feedSeen() {
  try { return Number(localStorage.getItem('tok.v1.feedseen')) || 0; } catch { return 0; }
}
function saveFeedSeen(v) {
  try { localStorage.setItem('tok.v1.feedseen', v); } catch { /* abaikan */ }
}

function unreadInboxCount() {
  const unread = inboxCache.messages.filter((m) => !m.read).length;
  const seen = feedSeen();
  const fresh = inboxCache.feed.filter((f) => f.at > seen).length;
  return unread + fresh;
}

function paintInboxBadge() {
  const n = unreadInboxCount();
  const el = document.getElementById('inbox-count');
  if (!el) return;
  el.textContent = n > 99 ? '99+' : n;
  el.hidden = n === 0;
}

async function fetchInbox() {
  const p = currentProfile();
  if (!p?.id || !isServerOnline()) return;
  try {
    inboxCache = await Server.inbox(p.id);
    paintInboxBadge();
    if (!document.getElementById('modal-inbox').hidden) renderInbox(true);
  } catch { /* abaikan */ }
}

function openInbox() {
  if (!currentProfile()) { openModal('modal-onboarding'); return; }
  renderInbox(true);
  openModal('modal-inbox');
  fetchInbox();
}

function renderInbox(mark) {
  const box = document.getElementById('inbox-list');
  const items = [
    ...inboxCache.messages.map((m) => ({ ...m, mine: true })),
    ...inboxCache.feed.map((f) => ({ id: 'f' + f.at, title: (f.kind === 'gift' ? '' : '📢 ') + f.title, body: f.body, at: f.at, kind: f.kind, mine: false, read: f.at <= feedSeen() })),
  ].sort((x, y) => y.at - x.at);
  if (!items.length) {
    box.innerHTML = `<div class="inbox-empty">${isServerOnline() ? '💌 Belum ada pesan.' : '📴 Butuh server untuk pesan 🌐'}</div>`;
    return;
  }
  box.innerHTML = items.map((m) => {
    const icon = m.type === 'friend' ? '👥' : (m.type === 'gift' || m.kind === 'gift') ? '🎁' : '📢';
    const acts = m.type === 'friend' && m.data
      ? `<div class="msg-acts"><button class="btn btn-gold btn-sm" data-inbox-add="${esc(m.data.id)}|${esc(m.data.username)}" type="button">➕ Tambah Balik</button><button class="btn btn-outline btn-sm" data-inbox-view="${esc(m.data.id)}" type="button">👤 Lihat</button></div>`
      : '';
    return `<div class="msg-row ${m.read ? '' : 'unread'}">
      <span class="msg-icon">${icon}</span>
      <div class="msg-body"><b>${esc(m.title)}</b><p>${esc(m.body)}</p><small>${fmtTimeAgo(m.at)}</small>${acts}</div>
    </div>`;
  }).join('');
  if (mark) {
    const ids = inboxCache.messages.filter((m) => !m.read).map((m) => m.id);
    inboxCache.messages.forEach((m) => { m.read = true; });
    let mx = feedSeen();
    inboxCache.feed.forEach((f) => { mx = Math.max(mx, f.at); });
    saveFeedSeen(mx);
    paintInboxBadge();
    const p = currentProfile();
    if (ids.length && p?.id) Server.inboxRead(p.id, ids).catch(() => {});
  }
}

// ------------------------- admin -------------------------
const ADMIN_USER = 'admintheo5757';
const ADMIN_PASS = 'theofkingsid';
let brandTaps = [];
let isAdmin = false;
let adminToken = null;
let admTargetSeq = 0;
const adminLog = [];

function openAdminLogin() {
  if (isAdmin) { openAdminPanel(); return; }
  document.getElementById('adm-error').hidden = true;
  openModal('modal-admin-login');
}

async function submitAdminLogin() {
  const u = document.getElementById('adm-user').value.trim();
  const pw = document.getElementById('adm-pass').value;
  const er = document.getElementById('adm-error');
  if (u === ADMIN_USER && pw === ADMIN_PASS) {
    isAdmin = true;
    adminToken = null;
    if (isServerOnline()) {
      try { const r = await Server.adminLogin(u, pw); adminToken = r.token; } catch { /* mode lokal */ }
    }
    document.getElementById('adm-user').value = '';
    document.getElementById('adm-pass').value = '';
    er.hidden = true;
    closeModal('modal-admin-login');
    sfx.buy();
    toast('Selamat datang, Admin! 🛠️', 'gold');
    openAdminPanel();
  } else {
    er.textContent = 'User / sandi salah ⛔';
    er.hidden = false;
    sfx.illegal();
  }
}

function openAdminPanel() {
  paintCheat();
  if (!isAdmin) { openAdminLogin(); return; }
  if (!currentProfile()) {
    closeModal('modal-admin');
    toast('Buat akun pemain dulu 👤', 'error');
    openModal('modal-onboarding');
    return;
  }
  document.getElementById('adm-mode').textContent = (isServerOnline() && adminToken) ? '🌐 Mode Server — semua pemain' : '📴 Mode Lokal — perangkat ini';
  renderAdminTarget();
  renderAdminLog();
  openModal('modal-admin');
}

function resolveAdminTarget() {
  const q = document.getElementById('adm-target').value.trim().replace(/^@/, '').toUpperCase();
  const p = currentProfile();
  if (!q || !p) return null;
  if (q === String(p.username || '').toUpperCase() || q === String(p.id || '').toUpperCase()) return p;
  return null;
}

async function resolveAdminTargetAsync() {
  const q = document.getElementById('adm-target').value.trim().replace(/^@/, '');
  if (!q) return null;
  if (isServerOnline() && adminToken) {
    try {
      const { account } = await Server.adminFind(adminToken, q);
      return { server: true, name: account.name, username: account.username, id: account.id, stars: account.stats.stars, coins: account.stats.coins || 0 };
    } catch { return null; }
  }
  return resolveAdminTarget();
}

async function renderAdminTarget() {
  const box = document.getElementById('adm-target-info');
  const hint = `🔍 Ketik ID / username akun${(isServerOnline() && adminToken) ? '' : ' <b>di perangkat ini</b>'}.`;
  const q = document.getElementById('adm-target').value.trim();
  if (!q) { box.innerHTML = hint; return; }
  const seq = ++admTargetSeq;
  const t = await resolveAdminTargetAsync();
  if (seq !== admTargetSeq || document.getElementById('adm-target').value.trim() !== q) return;
  if (t) {
    box.innerHTML = `✅ Target: <b>${esc(t.name)}</b> (@${esc(t.username)} • ${esc(t.id || '–')})${t.server ? ' 🌐' : ''}<br>⭐ saat ini: <b>${t.server ? t.stars : (store.stats.stars || 0)}</b> • 🪙: <b>${t.server ? t.coins : (store.stats.coins || 0)}</b>`;
  } else {
    box.innerHTML = hint;
  }
}

function renderAdminLog() {
  document.getElementById('adm-log').innerHTML = adminLog.length
    ? adminLog.map((x) => `<div>${esc(x)}</div>`).join('')
    : '<div class="muted">Belum ada perubahan.</div>';
}

async function applyAdminStars(mode) {
  const t = await resolveAdminTargetAsync();
  const er = document.getElementById('adm-error2');
  const scope = (isServerOnline() && adminToken) ? 'di server' : 'di perangkat ini';
  if (!t) { er.textContent = `Akun tidak ditemukan ${scope} 🔍`; er.hidden = false; sfx.illegal(); return; }
  const n = Math.floor(Number(document.getElementById('adm-amount').value));
  const lo = mode === 'set' ? 0 : 1;
  if (!Number.isFinite(n) || n < lo || n > 99999) {
    er.textContent = mode === 'set' ? 'Jumlah harus 0–99999 🎯' : 'Jumlah harus 1–99999 ➕';
    er.hidden = false; sfx.illegal(); return;
  }
  er.hidden = true;
  if (t.server && adminToken) {
    try {
      const r = await Server.adminStars(adminToken, document.getElementById('adm-target').value.trim(), mode, n);
      adminLog.unshift(`${mode === 'set' ? '🎯' : '➕'} @${r.account.username}: ${r.before} → ${r.after} ⭐ 🌐`);
      if (r.account.id === currentProfile()?.id) pullAccount();
      renderAdminTarget();
      renderAdminLog();
      sfx.buy();
      toast(mode === 'set' ? `Bintang @${r.account.username} jadi ${r.after}! 🎯` : `+${n} ⭐ untuk @${r.account.username}!`, 'success');
    } catch (e2) {
      er.textContent = e2.code === 404 ? 'Akun tidak ditemukan di server 🔍' : 'Server sibuk, coba lagi.';
      er.hidden = false; sfx.illegal();
    }
    return;
  }
  const st = store.stats;
  const before = st.stars || 0;
  st.stars = mode === 'set' ? n : before + n;
  saveStats(st);
  document.dispatchEvent(new CustomEvent('tok:stats'));
  adminLog.unshift(`${mode === 'set' ? '🎯' : '➕'} @${t.username}: ${before} → ${st.stars} ⭐`);
  renderAdminTarget();
  renderAdminLog();
  sfx.buy();
  toast(mode === 'set' ? `Bintang @${t.username} jadi ${st.stars}! 🎯` : `+${n} ⭐ untuk @${t.username}!`, 'success');
}

async function applyAdminCoins(mode) {
  const t = await resolveAdminTargetAsync();
  const er = document.getElementById('adm-error2');
  const scope = (isServerOnline() && adminToken) ? 'di server' : 'di perangkat ini';
  if (!t) { er.textContent = `Akun tidak ditemukan ${scope} 🔍`; er.hidden = false; sfx.illegal(); return; }
  const n = Math.floor(Number(document.getElementById('adm-amount-coin').value));
  const lo = mode === 'set' ? 0 : 1;
  if (!Number.isFinite(n) || n < lo || n > 999999) {
    er.textContent = mode === 'set' ? 'Koin harus 0–999999 🎯' : 'Koin harus 1–999999 ➕';
    er.hidden = false; sfx.illegal(); return;
  }
  er.hidden = true;
  if (t.server && adminToken) {
    try {
      const r = await Server.adminCoins(adminToken, document.getElementById('adm-target').value.trim(), mode, n);
      adminLog.unshift(`${mode === 'set' ? '🎯' : '➕'} @${r.account.username}: ${r.before} → ${r.after} 🪙 🌐`);
      if (r.account.id === currentProfile()?.id) pullAccount();
      renderAdminTarget();
      renderAdminLog();
      sfx.buy();
      toast(mode === 'set' ? `Koin @${r.account.username} jadi ${r.after}! 🎯` : `+${n} 🪙 untuk @${r.account.username}!`, 'success');
    } catch (e2) {
      er.textContent = e2.code === 404 ? 'Akun tidak ditemukan di server 🔍' : 'Server sibuk, coba lagi.';
      er.hidden = false; sfx.illegal();
    }
    return;
  }
  const st = store.stats;
  const before = st.coins || 0;
  st.coins = mode === 'set' ? n : before + n;
  saveStats(st);
  document.dispatchEvent(new CustomEvent('tok:stats'));
  adminLog.unshift(`${mode === 'set' ? '🎯' : '➕'} @${t.username}: ${before} → ${st.coins} 🪙`);
  renderAdminTarget();
  renderAdminLog();
  sfx.buy();
  toast(mode === 'set' ? `Koin @${t.username} jadi ${st.coins}! 🎯` : `+${n} 🪙 untuk @${t.username}!`, 'success');
}

async function applyAdminLikes(mode) {
  const t = await resolveAdminTargetAsync();
  const er = document.getElementById('adm-error2');
  const scope = (isServerOnline() && adminToken) ? 'di server' : 'di perangkat ini';
  if (!t) { er.textContent = `Akun tidak ditemukan ${scope} 🔍`; er.hidden = false; sfx.illegal(); return; }
  const n = Math.floor(Number(document.getElementById('adm-amount-like').value));
  const lo = mode === 'set' ? 0 : 1;
  if (!Number.isFinite(n) || n < lo || n > 999999) {
    er.textContent = mode === 'set' ? 'Suka harus 0–999999 🎯' : 'Suka harus 1–999999 ➕';
    er.hidden = false; sfx.illegal(); return;
  }
  er.hidden = true;
  if (t.server && adminToken) {
    try {
      const r = await Server.adminLikes(adminToken, document.getElementById('adm-target').value.trim(), mode, n);
      adminLog.unshift(`${mode === 'set' ? '🎯' : '➕'} @${r.account.username}: ${r.before} → ${r.after} ❤️ 🌐`);
      if (r.account.id === currentProfile()?.id) pullAccount();
      renderAdminTarget();
      renderAdminLog();
      sfx.buy();
      toast(mode === 'set' ? `Suka @${r.account.username} jadi ${r.after}! 🎯` : `+${n} ❤️ untuk @${r.account.username}!`, 'success');
    } catch (e2) {
      er.textContent = e2.code === 404 ? 'Akun tidak ditemukan di server 🔍' : 'Server sibuk, coba lagi.';
      er.hidden = false; sfx.illegal();
    }
    return;
  }
  const st = store.stats;
  const before = st.likes || 0;
  st.likes = mode === 'set' ? n : before + n;
  saveStats(st);
  document.dispatchEvent(new CustomEvent('tok:stats'));
  adminLog.unshift(`${mode === 'set' ? '🎯' : '➕'} @${t.username}: ${before} → ${st.likes} ❤️`);
  renderAdminTarget();
  renderAdminLog();
  sfx.buy();
  toast(mode === 'set' ? `Suka @${t.username} jadi ${st.likes}! 🎯` : `+${n} ❤️ untuk @${t.username}!`, 'success');
}

// ------------------------- cheat admin -------------------------
const cheat = { enabled: false, auto: false, hint: false, level: 'medium', lastFen: '', lastHint: null };
let cheatTimer = null;

function loadCheatPrefs() {
  try {
    const o = JSON.parse(localStorage.getItem('tok.v1.cheat') || '{}');
    if (o && o.level) cheat.level = o.level;
    return o || {};
  } catch { return {}; }
}
function saveCheatPrefs() {
  try {
    const fab = document.getElementById('cheat-fab');
    localStorage.setItem('tok.v1.cheat', JSON.stringify({
      level: cheat.level,
      x: fab.style.left || '', y: fab.style.top || '',
    }));
  } catch { /* abaikan */ }
}
function placeCheatFab() {
  const fab = document.getElementById('cheat-fab');
  const o = loadCheatPrefs();
  if (o && o.x && o.y) {
    fab.style.left = o.x; fab.style.top = o.y;
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
  }
  const lv = document.getElementById('cheat-level');
  if (lv) lv.value = cheat.level;
}

function setCheatEnabled(on) {
  cheat.enabled = !!on && isAdmin;
  if (!cheat.enabled) {
    cheat.auto = false; cheat.hint = false; cheat.lastFen = '';
    clearCheatArrow();
    closeModal('modal-cheat');
  }
  document.getElementById('cheat-fab').hidden = !cheat.enabled;
  paintCheat();
  ensureCheatTimer();
}

function paintCheat() {
  const t = document.getElementById('adm-cheat-toggle');
  if (t) {
    t.textContent = cheat.enabled ? 'MATIKAN Tombol Cheat' : 'Aktifkan Tombol Cheat';
    t.classList.toggle('btn-gold', cheat.enabled);
    t.classList.toggle('btn-outline', !cheat.enabled);
  }
  const au = document.getElementById('cheat-auto');
  if (au) {
    au.textContent = cheat.auto ? 'Nyala' : 'Mati';
    au.classList.toggle('btn-gold', cheat.auto);
    au.classList.toggle('btn-outline', !cheat.auto);
  }
  const h = document.getElementById('cheat-hint');
  if (h) {
    h.textContent = cheat.hint ? 'Nyala' : 'Mati';
    h.classList.toggle('btn-gold', cheat.hint);
    h.classList.toggle('btn-outline', !cheat.hint);
  }
}

function ensureCheatTimer() {
  if (cheatTimer) return;
  cheatTimer = setInterval(cheatTick, 750);
  if (cheatTimer && cheatTimer.unref) cheatTimer.unref();
}

function cheatTick() {
  if (!cheat.enabled || !isAdmin) return;
  const active = game && game.running && !game.finished && screen === 'game' && game.chess;
  if (cheat.auto && active) {
    try {
      const t = game.turn();
      if (game.canAct(t)) {
        const mv = chooseMove(game.chess.fen(), cheat.level);
        if (mv) game.userMove(mv.from, mv.to, mv.promotion);
      }
    } catch { /* abaikan */ }
  }
  if (cheat.hint && active) {
    try {
      const fen = game.chess.fen();
      if (fen !== cheat.lastFen) { cheat.lastFen = fen; cheat.lastHint = chooseMove(fen, 'hard'); }
      drawCheatArrow(cheat.lastHint);
    } catch { /* abaikan */ }
  } else {
    cheat.lastFen = '';
    clearCheatArrow();
  }
  paintCheatStatus();
}

function paintCheatStatus() {
  const el = document.getElementById('cheat-status');
  if (!el || document.getElementById('modal-cheat').hidden) return;
  if (!game || !game.running || game.finished) { el.textContent = 'Tidak ada game berjalan.'; return; }
  const t = game.turn() === 'w' ? 'Putih' : 'Hitam';
  const mv = cheat.lastHint;
  el.textContent = 'Giliran: ' + t + (mv ? ' | Saran: ' + mv.from + ' ke ' + mv.to : '');
}

function drawCheatArrow(mv) {
  const board = document.getElementById('board');
  if (!board || !mv) { clearCheatArrow(); return; }
  const a = board.querySelector('[data-sq="' + mv.from + '"]');
  const q = board.querySelector('[data-sq="' + mv.to + '"]');
  if (!a || !q) { clearCheatArrow(); return; }
  let svg = document.getElementById('cheat-arrow');
  if (!svg || svg.parentNode !== board) {
    clearCheatArrow();
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'cheat-arrow';
    board.appendChild(svg);
  }
  svg.dataset.from = mv.from;
  svg.dataset.to = mv.to;
  const br = board.getBoundingClientRect();
  const ar = a.getBoundingClientRect();
  const dr = q.getBoundingClientRect();
  const x1 = ar.left + ar.width / 2 - br.left, y1 = ar.top + ar.height / 2 - br.top;
  const x2 = dr.left + dr.width / 2 - br.left, y2 = dr.top + dr.height / 2 - br.top;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const shorten = Math.min(ar.width * 0.28, L * 0.3);
  const ex = x2 - Math.cos(ang) * shorten, ey = y2 - Math.sin(ang) * shorten;
  const hs = Math.max(6, ar.width * 0.22);
  const p1 = (ex + hs * Math.cos(ang + 2.5)) + ',' + (ey + hs * Math.sin(ang + 2.5));
  const p2 = (ex + hs * Math.cos(ang - 2.5)) + ',' + (ey + hs * Math.sin(ang - 2.5));
  svg.setAttribute('viewBox', '0 0 ' + Math.max(1, br.width) + ' ' + Math.max(1, br.height));
  svg.innerHTML = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + ex + '" y2="' + ey + '" /><polygon points="' + x2 + ',' + y2 + ' ' + p1 + ' ' + p2 + '" />';
}

function clearCheatArrow() {
  const el = document.getElementById('cheat-arrow');
  if (el) el.remove();
  cheat.lastHint = null;
}

function initCheatFab() {
  const fab = document.getElementById('cheat-fab');
  placeCheatFab();
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = 0;
  const down = (cx, cy) => {
    dragging = true; moved = 0;
    const r = fab.getBoundingClientRect();
    sx = cx; sy = cy; ox = r.left; oy = r.top;
  };
  const move = (cx, cy) => {
    if (!dragging) return;
    moved = Math.max(moved, Math.abs(cx - sx) + Math.abs(cy - sy));
    const w = fab.offsetWidth || 46, h = fab.offsetHeight || 46;
    const vw = window.innerWidth || 800, vh = window.innerHeight || 600;
    fab.style.left = Math.min(Math.max(0, ox + cx - sx), vw - w) + 'px';
    fab.style.top = Math.min(Math.max(0, oy + cy - sy), vh - h) + 'px';
    fab.style.right = 'auto'; fab.style.bottom = 'auto';
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6) {
      sfx.click();
      if (isAdmin && cheat.enabled) { paintCheatStatus(); openModal('modal-cheat'); }
    } else {
      saveCheatPrefs();
    }
  };
  fab.addEventListener('mousedown', (e) => { e.preventDefault(); down(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', up);
  fab.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) down(t.clientX, t.clientY); }, { passive: true });
  fab.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) { move(t.clientX, t.clientY); if (dragging) e.preventDefault(); } }, { passive: false });
  fab.addEventListener('touchend', up);
}

function adminLogout() {
  isAdmin = false;
  adminToken = null;
  setCheatEnabled(false);
  closeModal('modal-admin');
  sfx.click();
  toast('Admin keluar 🔒', 'gold');
}

// ------------------------- skin & shop -------------------------
function applyEquippedSkin() {
  applySkin(document.getElementById('board'), store.settings.skin || 'wood');
}

function ownedSkins() {
  const s = store.settings.skins;
  const base = ['wood', 'midnight', 'emerald'];
  if (!Array.isArray(s) || !s.length) return [...base];
  const known = new Set(SKINS.map((x) => x.id));
  return [...new Set([...base, ...s.filter((id) => known.has(id))])];
}

function openShop() {
  renderShop();
  openModal('modal-shop');
}

function renderShop() {
  const st = store.stats;
  const equipped = store.settings.skin || 'wood';
  const owned = ownedSkins();
  document.getElementById('shop-balance').innerHTML =
    `🪙 <b>${st.coins || 0}</b> &nbsp;•&nbsp; 🛡️ Proteksi: <b>${st.protections || 0}</b>`;
  document.getElementById('prot-owned').textContent =
    `Punya ${st.protections || 0} • otomatis dipakai saat kalah`;
  const pb = document.getElementById('btn-buy-prot');
  pb.textContent = 'Beli — 10 🪙';
  pb.disabled = (st.coins || 0) < 10;
  pb.onclick = () => {
    const cur = store.stats;
    if ((cur.coins || 0) < 10) { toast('Koin kurang! Menangkan game untuk dapat 🪙', 'error'); sfx.illegal(); return; }
    cur.coins -= 10;
    cur.protections = (cur.protections || 0) + 1;
    saveStats(cur);
    sfx.buy();
    toast('🛡️ +1 Star Protection!', 'success');
    document.dispatchEvent(new CustomEvent('tok:stats'));
    renderShop();
  };
  const grid = document.getElementById('skins-grid');
  grid.innerHTML = SKINS.map((sk) => {
    const has = owned.includes(sk.id);
    const isEq = equipped === sk.id;
    const btn = isEq
      ? `<button class="btn btn-gold btn-sm" disabled>✓ Dipakai</button>`
      : has
        ? `<button class="btn btn-outline btn-sm" data-equip="${sk.id}">Pakai</button>`
        : `<button class="btn btn-gold btn-sm" data-buy="${sk.id}" ${(st.coins || 0) < sk.price ? 'disabled' : ''}>Beli — ${sk.price} 🪙</button>`;
    return `<div class="skin-card ${isEq ? 'equipped' : ''} ${has ? 'owned' : ''}">
      <div class="skin-prev skin-${sk.id}"></div>
      <div class="skin-name">${esc(sk.name)}</div>
      <div class="skin-desc">${esc(sk.desc)}</div>
      ${btn}
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-buy]').forEach((x) => { x.onclick = () => buySkin(x.dataset.buy); });
  grid.querySelectorAll('[data-equip]').forEach((x) => { x.onclick = () => equipSkin(x.dataset.equip); });
  paintShopTabs();
  renderBordersGrid();
  renderAvatarsGrid();
  renderNickFxGrid();
}

let shopTab = 'prot';

function paintShopTabs() {
  document.querySelectorAll('#shop-tabs .tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.shopTab === shopTab);
    t.onclick = () => { shopTab = t.dataset.shopTab; sfx.click(); paintShopTabs(); };
  });
  for (const id of ['prot', 'skins', 'borders', 'avatars', 'nickfx']) {
    document.getElementById('shop-pane-' + id).hidden = shopTab !== id;
  }
}

function ownedBorders() {
  const s = store.settings.borders;
  if (!Array.isArray(s) || !s.length) return ['none'];
  const known = new Set(BORDERS.map((x) => x.id));
  return [...new Set(['none', ...s.filter((id) => known.has(id))])];
}

function ownedAvatars() {
  const s = store.settings.avatars;
  if (!Array.isArray(s)) return [];
  const known = new Set(AVATARS.map((x) => x.id));
  return [...new Set(s.filter((id) => known.has(id)))];
}

function equippedBorder() {
  return currentProfile()?.avatarBorder || 'none';
}

function equippedAvatarId() {
  const av = currentProfile()?.avatar;
  return av?.type === 'premium' ? av.data : null;
}

function ownedNickFx() {
  const s = store.settings.nickfx;
  const known = new Set(NICKFX.map((x) => x.id));
  const arr = Array.isArray(s) ? s.filter((id) => known.has(id)) : [];
  return [...new Set(['none', ...arr])];
}

function equippedNickFx() {
  return currentProfile()?.nickFx || 'none';
}

function renderNickFxGrid() {
  const coins = store.stats.coins || 0;
  const eq = equippedNickFx();
  const owned = ownedNickFx();
  const grid = document.getElementById('nickfx-grid');
  grid.innerHTML = NICKFX.map((x) => {
    const has = owned.includes(x.id);
    const isEq = eq === x.id;
    const prev = x.id === 'rainbow'
      ? '<span class="nick-rainbow" style="font-size:1.25rem;font-weight:800;">Nama Kamu</span>'
      : '<span style="font-size:1.25rem;font-weight:800;">Nama Kamu</span>';
    return `<div class="skin-card ${isEq ? 'equipped' : ''} ${has ? 'owned' : ''}">
      <div class="cos-prev">${prev}</div>
      <div class="skin-name">${x.emoji} ${esc(x.name)}</div>
      <div class="skin-desc">${esc(x.desc)}</div>
      ${cosButton('nickfx', x, has, isEq, coins)}
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-buy-nickfx]').forEach((x) => { x.onclick = () => buyNickFx(x.dataset.buyNickfx); });
  grid.querySelectorAll('[data-eq-nickfx]').forEach((x) => { x.onclick = () => equipNickFx(x.dataset.eqNickfx); });
}

function buyNickFx(id) {
  const x = nickFxById(id);
  if (!x) return;
  const cur = store.stats;
  if ((cur.coins || 0) < x.price) { toast('Koin kurang! Menangkan game untuk dapat \U0001FA99', 'error'); sfx.illegal(); return; }
  cur.coins -= x.price;
  saveStats(cur);
  const st = store.settings;
  st.nickfx = [...new Set([...ownedNickFx(), id])];
  store.settings = st;
  sfx.buy();
  equipNickFx(id, true);
}

function equipNickFx(id, fromBuy = false) {
  if (!nickFxById(id) || !ownedNickFx().includes(id)) return;
  const p = store.profile || {};
  p.nickFx = id;
  store.profile = p;
  sfx.buy();
  toast(fromBuy ? `\U0001F308 Efek ${nickFxById(id).name} dibeli & dipakai!` : `\U0001F308 Efek ${nickFxById(id).name} dipakai!`, 'success');
  document.dispatchEvent(new CustomEvent('tok:stats'));
  renderShop();
}

function cosButton(kind, item, has, isEq, coins) {
  if (isEq) return `<button class="btn btn-gold btn-sm" disabled>✓ Dipakai</button>`;
  if (has) return `<button class="btn btn-outline btn-sm" data-eq-${kind}="${item.id}">Pakai</button>`;
  return `<button class="btn btn-gold btn-sm" data-buy-${kind}="${item.id}" ${coins < item.price ? 'disabled' : ''}>Beli — ${item.price} 🪙</button>`;
}

function renderBordersGrid() {
  const coins = store.stats.coins || 0;
  const eq = equippedBorder();
  const owned = ownedBorders();
  const me = currentProfile() || { name: '?', username: '?' };
  const grid = document.getElementById('borders-grid');
  grid.innerHTML = BORDERS.map((bd) => {
    const has = owned.includes(bd.id);
    const isEq = eq === bd.id;
    return `<div class="skin-card ${isEq ? 'equipped' : ''} ${has ? 'owned' : ''}">
      <div class="cos-prev"><span class="avatar-wrap${bd.id === 'none' ? '' : ' ava-border-' + bd.id}"><span class="avatar" style="width:40px;height:40px;font-size:18px;background:${avatarGradientFor(me.username)}">${esc(initialsFor(me.name))}</span></span></div>
      <div class="skin-name">${esc(bd.name)}</div>
      <div class="skin-desc">${esc(bd.desc)}</div>
      ${cosButton('border', bd, has, isEq, coins)}
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-buy-border]').forEach((x) => { x.onclick = () => buyBorder(x.dataset.buyBorder); });
  grid.querySelectorAll('[data-eq-border]').forEach((x) => { x.onclick = () => equipBorder(x.dataset.eqBorder); });
}

function renderAvatarsGrid() {
  const coins = store.stats.coins || 0;
  const eq = equippedAvatarId();
  const owned = ownedAvatars();
  const grid = document.getElementById('avatars-grid');
  grid.innerHTML = AVATARS.map((x) => {
    const has = owned.includes(x.id);
    const isEq = eq === x.id;
    return `<div class="skin-card ${isEq ? 'equipped' : ''} ${has ? 'owned' : ''}">
      <div class="cos-prev"><img class="cos-ava" src="${avatarImg(x.id)}" alt="${esc(x.name)}" /></div>
      <div class="skin-name">${x.emoji} ${esc(x.name)}</div>
      <div class="skin-desc">Avatar spesial</div>
      ${cosButton('avatar', x, has, isEq, coins)}
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-buy-avatar]').forEach((x) => { x.onclick = () => buyAvatar(x.dataset.buyAvatar); });
  grid.querySelectorAll('[data-eq-avatar]').forEach((x) => { x.onclick = () => equipAvatar(x.dataset.eqAvatar); });
}

function buyBorder(id) {
  const b = borderById(id);
  if (!b) return;
  const cur = store.stats;
  if ((cur.coins || 0) < b.price) { toast('Koin kurang! Menangkan game untuk dapat 🪙', 'error'); sfx.illegal(); return; }
  cur.coins -= b.price;
  saveStats(cur);
  const st = store.settings;
  st.borders = [...new Set([...ownedBorders(), id])];
  store.settings = st;
  sfx.buy();
  equipBorder(id, true);
}

function equipBorder(id, fromBuy = false) {
  if (!borderById(id) || !ownedBorders().includes(id)) return;
  const p = store.profile || {};
  p.avatarBorder = id;
  store.profile = p;
  sfx.buy();
  toast(fromBuy ? `🖼️ Bingkai ${borderById(id).name} dibeli & dipakai!` : `🖼️ Bingkai ${borderById(id).name} dipakai!`, 'success');
  document.dispatchEvent(new CustomEvent('tok:stats'));
  renderShop();
}

function buyAvatar(id) {
  const x = avatarById(id);
  if (!x) return;
  const cur = store.stats;
  if ((cur.coins || 0) < x.price) { toast('Koin kurang! Menangkan game untuk dapat 🪙', 'error'); sfx.illegal(); return; }
  cur.coins -= x.price;
  saveStats(cur);
  const st = store.settings;
  st.avatars = [...new Set([...ownedAvatars(), id])];
  store.settings = st;
  sfx.buy();
  equipAvatar(id, true);
}

function equipAvatar(id, fromBuy = false) {
  if (!avatarById(id) || !ownedAvatars().includes(id)) return;
  const p = store.profile || {};
  p.avatar = { type: 'premium', data: id };
  store.profile = p;
  sfx.buy();
  toast(fromBuy ? `😎 Avatar ${avatarById(id).name} dibeli & dipakai!` : `😎 Avatar ${avatarById(id).name} dipakai!`, 'success');
  document.dispatchEvent(new CustomEvent('tok:stats'));
  renderShop();
}

function buySkin(id) {
  const sk = skinById(id);
  if (!sk) return;
  const cur = store.stats;
  if ((cur.coins || 0) < sk.price) { toast('Koin kurang! Menangkan game untuk dapat 🪙', 'error'); sfx.illegal(); return; }
  cur.coins -= sk.price;
  saveStats(cur);
  const settings = store.settings;
  settings.skins = [...new Set([...ownedSkins(), id])];
  settings.skin = id;
  store.settings = settings;
  if (game && game.cfg.mode === 'online') {
    toast(`🎨 Skin ${sk.name} dibeli! Dipakai mulai game online berikutnya.`, 'success');
  } else {
    applyEquippedSkin();
    toast(`🎨 Skin ${sk.name} dibeli & dipakai!`, 'success');
  }
  sfx.buy();
  document.dispatchEvent(new CustomEvent('tok:stats'));
  renderShop();
}

function equipSkin(id) {
  if (!skinById(id) || !ownedSkins().includes(id)) return;
  const settings = store.settings;
  settings.skin = id;
  store.settings = settings;
  if (game && game.cfg.mode === 'online') {
    toast('🎨 Skin tersimpan — dipakai mulai game online berikutnya.', 'gold');
  } else {
    applyEquippedSkin();
    toast(`🎨 Skin ${skinById(id).name} dipakai!`, 'success');
  }
  sfx.click();
  renderShop();
  document.dispatchEvent(new CustomEvent('tok:stats')); // sinkron skin
}

// ------------------------- init -------------------------
function init() {
  window.__TOK_INIT_STARTED = true;
  // Laporkan error tak terduga ke layar (jangan pernah gagal diam-diam)
  window.addEventListener('error', (e) => {
    if (e && e.message && !String(e.message).includes('Script error')) {
      console.error(e.error || e.message);
      toast('Ups, ada kendala: ' + String(e.message).slice(0, 120), 'error');
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e && e.reason ? (e.reason.message || String(e.reason)) : 'unknown';
    console.error(msg);
    if (!String(msg).includes('TIMEOUT')) toast('Ups, ada kendala: ' + String(msg).slice(0, 120), 'error');
  });
  preloadPieces();
  renderMiniBoard();
  initConfirm();
  initOnboarding();
  initProfileModal();
  initLobby();
  applyEquippedSkin();

  // unlock audio di interaksi pertama
  const unlock = () => unlockAudio();
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });

  // tombol close modal (X) & klik backdrop
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => { sfx.click(); closeModal(b.dataset.close); }));
  $$('.modal-backdrop').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target !== m) return;
      if (['modal-onboarding', 'modal-result', 'modal-confirm', 'modal-arena'].includes(m.id)) return;
      closeModal(m.id);
    });
  });
  document.addEventListener('click', closeAllCountryDrops);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    { const a = obPicker ? obPicker.close() : false; const d2 = pfPicker ? pfPicker.close() : false; if (a || d2) return; }
    for (const id of ['modal-help', 'modal-leaderboard', 'modal-profile', 'modal-shop', 'modal-friends', 'modal-admin-login', 'modal-admin', 'modal-inbox', 'modal-player', 'modal-match', 'modal-cheat']) {
      if (!document.getElementById(id).hidden) { closeModal(id); break; }
    }
  });

  // topbar
  $('#brand-home').addEventListener('click', (e) => {
    e.preventDefault(); sfx.click();
    const now = Date.now();
    brandTaps = brandTaps.filter((t) => now - t < 3000);
    brandTaps.push(now);
    if (brandTaps.length >= 3) { brandTaps = []; openAdminLogin(); return; }
    if (screen !== 'home') goMenu(); else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#adm-login-submit').addEventListener('click', submitAdminLogin);
  $('#adm-target').addEventListener('input', renderAdminTarget);
  $('#adm-add').addEventListener('click', () => applyAdminStars('add'));
  $('#adm-set').addEventListener('click', () => applyAdminStars('set'));
  $('#adm-add-coin').addEventListener('click', () => applyAdminCoins('add'));
  $('#adm-set-coin').addEventListener('click', () => applyAdminCoins('set'));
  $('#adm-add-like').addEventListener('click', () => applyAdminLikes('add'));
  $('#adm-set-like').addEventListener('click', () => applyAdminLikes('set'));
  $('#adm-logout').addEventListener('click', adminLogout);
  $('#adm-cheat-toggle').addEventListener('click', () => {
    sfx.click();
    setCheatEnabled(!cheat.enabled);
    toast(cheat.enabled ? 'Tombol cheat aktif! Seret sesukamu.' : 'Tombol cheat mati.', 'gold');
  });
  $('#cheat-auto').addEventListener('click', () => { sfx.click(); cheat.auto = !cheat.auto; paintCheat(); });
  $('#cheat-hint').addEventListener('click', () => {
    sfx.click();
    cheat.hint = !cheat.hint;
    if (!cheat.hint) { clearCheatArrow(); cheat.lastFen = ''; }
    paintCheat();
  });
  $('#cheat-level').addEventListener('change', (ev) => { cheat.level = ev.target.value; saveCheatPrefs(); sfx.click(); });
  initCheatFab();
  ensureCheatTimer();
  $('#profile-chip').addEventListener('click', (e) => {
    sfx.click();
    if (!currentProfile()) { openModal('modal-onboarding'); return; }
    if (e.target.closest('.pcoins')) { openShop(); return; }
    openProfileModal();
  });
  $('#btn-leaderboard').addEventListener('click', openLeaderboard);
  $('#btn-help').addEventListener('click', () => { sfx.click(); openModal('modal-help'); });
  $('#btn-shop').addEventListener('click', () => { sfx.click(); openShop(); });
  $('#btn-friends').addEventListener('click', () => { sfx.click(); openFriends(); });
  $('#fr-add').addEventListener('click', submitAddFriend);
  $('#btn-inbox').addEventListener('click', () => { sfx.click(); openInbox(); });
  $('#inbox-refresh').addEventListener('click', () => { sfx.click(); fetchInbox(); });
  $('#inbox-list').addEventListener('click', async (e) => {
    const add = e.target.closest('[data-inbox-add]');
    const view = e.target.closest('[data-inbox-view]');
    if (add) {
      const [id, username] = add.dataset.inboxAdd.split('|');
      const r = addFriend(username, id, currentProfile()?.id);
      if (!r.ok) { toast(r.message, 'error'); sfx.illegal(); return; }
      sfx.buy();
      toast(`@${r.username} jadi temanmu! 👥`, 'success');
      schedulePush();
      fetchInbox();
    } else if (view) {
      try {
        const { account } = await Server.find(view.dataset.inboxView);
        openPlayerModal(rowFromAccount(account));
      } catch { toast('Akun tidak ditemukan 🔍', 'error'); }
    }
  });
  $('#lb-list').addEventListener('click', (e) => {
    const row = e.target.closest('.lb-row');
    if (row && row.dataset.lbi !== undefined && lastLbRows[+row.dataset.lbi]) openPlayerModal(lastLbRows[+row.dataset.lbi]);
  });
  $('#recent-list').addEventListener('click', (e) => {
    const it = e.target.closest('.recent-item');
    if (it && it.dataset.ri !== undefined && lastRecent[+it.dataset.ri]) openMatchModal(lastRecent[+it.dataset.ri]);
  });
  $('#fr-copy-user').addEventListener('click', async () => { sfx.click(); if (await copyText(currentProfile()?.username || '')) toast('Username disalin! 📋', 'success'); });
  $('#fr-copy-id').addEventListener('click', async () => { sfx.click(); if (await copyText(currentProfile()?.id || '')) toast('ID disalin! 📋', 'success'); });
  $('#friends-list').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-fr-del]');
    const cp = e.target.closest('[data-fr-copy]');
    if (del) {
      removeFriend(del.dataset.frDel);
      sfx.click();
      toast('Teman dihapus.', 'gold');
      renderFriends();
      schedulePush();
    } else if (cp) {
      if (await copyText(cp.dataset.frCopy)) toast('ID teman disalin! 📋', 'success');
    }
  });
  $('#stat-coins-card').addEventListener('click', () => { sfx.click(); openShop(); });
  const sndBtn = $('#btn-sound');
  const paintSnd = () => { sndBtn.textContent = soundEnabled() ? '🔊' : '🔇'; };
  paintSnd();
  sndBtn.addEventListener('click', () => { setSoundEnabled(!soundEnabled()); paintSnd(); sfx.click(); });
  $('#stat-global-card').addEventListener('click', openLeaderboard);

  // leaderboard tabs
  $$('#modal-leaderboard .tab').forEach((t) => t.addEventListener('click', () => {
    lbTab = t.dataset.lbtab;
    sfx.click();
    renderLeaderboard();
  }));

  // mode cards
  $$('.mode-card').forEach((c) => {
    c.addEventListener('click', () => selectMode(c.dataset.mode));
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(c.dataset.mode); }
    });
  });
  $('#btn-quick-ai').addEventListener('click', () => {
    selectMode('ai', false);
    startOfflineGame();
  });
  $('#btn-quick-online').addEventListener('click', () => {
    selectMode('online');
    toast('Pilih "Buat Room" atau "Gabung Room" di bawah 🌐');
  });

  // refresh saat stats berubah
  document.addEventListener('tok:stats', () => { refreshStats(); schedulePush(); });

  // peringatan keluar saat game online
  addEventListener('beforeunload', (e) => {
    if (game && game.cfg.mode === 'online' && !game.finished) e.preventDefault();
  });

  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q && /^https?:\/\//.test(q)) localStorage.setItem('tok.v1.server', q.replace(/\/+$/, ''));
  } catch { /* abaikan */ }
  ensureProfileId();
  refreshStats();
  initServerLink();

  // wajib isi profil saat pertama masuk
  if (!currentProfile()) {
    openModal('modal-onboarding');
  }
  window.__TOK_READY = true;
}

document.addEventListener('DOMContentLoaded', init);
