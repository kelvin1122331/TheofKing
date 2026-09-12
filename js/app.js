// ============================================================
// TheofKing — bootstrap aplikasi: onboarding, home, lobby,
// leaderboard, profil, tema, dan orkestrasi Game + Net.
// ============================================================
import { store, saveStats, validateProfile, PRESET_AVATARS, getLeaderboard, myGlobalRank, avatarGradientFor, initialsFor, makePlayerId, addFriend, removeFriend } from './store.js?v=12';
import { rankForStars, rankProgress, RANKS, STARS_PER_RANK } from './ranks.js?v=12';
import { sfx, unlockAudio, soundEnabled, setSoundEnabled } from './sound.js?v=12';
import { $, $$, esc, openModal, closeModal, toast, confirmDialog, initConfirm, copyText, avatarHTML, starRowHTML, renderMiniBoard, fmtTimeAgo, showVsSplash } from './ui.js?v=12';
import { Net, peerErrorMessage, arenaCodeFor, ARENA_BUCKET_MS } from './net.js?v=12';
import { Game } from './game.js?v=12';
import { preloadPieces } from './pieces.js?v=12';
import { AI_LEVELS, AI_NAMES } from './ai.js?v=12';
import { COUNTRIES, countryByCode, flagEmoji, flagFor } from './countries.js?v=12';
import { SKINS, skinById, applySkin } from './skins.js?v=12';

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
    <span class="pinfo"><span class="pname">${flagFor(p) ? flagFor(p) + " " : ""}${esc(p.name)}</span>
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
  const panel = $('#recent-panel');
  if (!list.length) { panel.hidden = true; return; }
  panel.hidden = false;
  const modeName = { ai: 'vs Komputer', local: 'vs Teman', online: 'Online' };
  const resName = { win: 'Menang', loss: 'Kalah', draw: 'Seri' };
  $('#recent-list').innerHTML = list.map((r) => `
    <div class="recent-item">
      <span class="r ${r.result}">${r.result === 'win' ? '🏆' : r.result === 'loss' ? '💔' : '🤝'} ${resName[r.result]}</span>
      <span class="opp">${esc(r.opp || '')} • ${modeName[r.mode] || r.mode} • ${r.moves || 0} langkah</span>
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
  if (avatarDraft.type === 'upload' && avatarDraft.data) {
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

function renderLeaderboard() {
  $$('#modal-leaderboard .tab').forEach((t) => t.classList.toggle('active', t.dataset.lbtab === lbTab));
  const rows = getLeaderboard(lbTab);
  const medal = (pos) => (pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`);
  $('#lb-list').innerHTML = rows.map((r) => `
    <div class="lb-row ${r.me ? 'me' : ''}">
      <span class="pos">${medal(r.pos)}</span>
      ${avatarHTML(r, 40)}
      <span class="who"><span class="n">${flagFor(r) ? flagFor(r) + ' ' : ''}${esc(r.name)}${r.me ? ' (Kamu)' : ''}</span><br>
      <span class="u">@${esc(r.username)} • ${r.rank.icon} ${r.rank.name}</span></span>
      <span class="score">${lbTab === 'stars' ? '⭐ ' + r.stars : '🔥 ' + r.streak}</span>
    </div>`).join('');
  const me = myGlobalRank(lbTab);
  $('#lb-me').innerHTML = me ? `Peringkatmu: <b>#${me}</b> dari ${rows.length} pemain 🌍` : '';
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
  const r = rankForStars(store.stats.stars || 0);
  arena = { active: true, round: 0, fullOffset: 0, startedAt: Date.now(), bucket: Math.floor(Date.now() / ARENA_BUCKET_MS) };
  document.getElementById('arena-rank').innerHTML = `${r.icon} <b>${r.name}</b> • ⭐ ${store.stats.stars || 0}`;
  setArenaStatus('Mencari lawan se-rank…');
  document.getElementById('arena-elapsed').textContent = '⏱️ 0 dtk';
  openModal('modal-arena');
  arena.elapsedTimer = setInterval(updateArenaElapsed, 1000);
  arena.bucketWatch = setInterval(() => {
    if (!arena?.active || lobby?.started || game) return;
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
async function searchArenaRound() {
  if (!arena?.active) return;
  const round = ++arena.round;
  const alive = () => arena?.active && arena.round === round;
  cleanupNet();
  const code = arenaCodeFor(myRankId(), Date.now() + arena.fullOffset * ARENA_BUCKET_MS);
  setArenaStatus(arena.fullOffset > 0 ? 'Arena penuh, cari slot lain…' : 'Mencari lawan se-rank…');
  net = new Net();
  try {
    await net.join(code);
  } catch (err) {
    if (!alive()) return;
    if (err?.type === 'peer-unavailable') { hostArenaBucket(code, round); return; }
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
      arena.fullOffset++;
      searchArenaRound();
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
  return { stars: st.stars || 0, streak: st.streak || 0, wins: st.wins || 0, skin: store.settings.skin || 'wood' };
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
  cfg.opp = { ...oppEntry.profile, stars: oppEntry.stats?.stars || 0, skin: oppEntry.stats?.skin || 'wood' };
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

function submitAddFriend() {
  const er = document.getElementById('fr-error');
  const r = addFriend(document.getElementById('fr-username').value, document.getElementById('fr-id').value, currentProfile()?.id);
  if (!r.ok) { er.textContent = r.message; er.hidden = false; sfx.illegal(); return; }
  er.hidden = true;
  document.getElementById('fr-username').value = '';
  document.getElementById('fr-id').value = '';
  sfx.buy();
  toast(`@${r.username} jadi temanmu! 👥`, 'success');
  renderFriends();
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
    for (const id of ['modal-help', 'modal-leaderboard', 'modal-profile', 'modal-shop', 'modal-friends']) {
      if (!document.getElementById(id).hidden) { closeModal(id); break; }
    }
  });

  // topbar
  $('#brand-home').addEventListener('click', (e) => { e.preventDefault(); sfx.click(); if (screen !== 'home') goMenu(); else window.scrollTo({ top: 0, behavior: 'smooth' }); });
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
  document.addEventListener('tok:stats', refreshStats);

  // peringatan keluar saat game online
  addEventListener('beforeunload', (e) => {
    if (game && game.cfg.mode === 'online' && !game.finished) e.preventDefault();
  });

  ensureProfileId();
  refreshStats();

  // wajib isi profil saat pertama masuk
  if (!currentProfile()) {
    openModal('modal-onboarding');
  }
  window.__TOK_READY = true;
}

document.addEventListener('DOMContentLoaded', init);
