// ============================================================
// Pengatur permainan: aturan, jam catur, AI, UI papan & panel,
// rating bintang, chat online, resign/remis/rematch.
// ============================================================
import { Chess } from './vendor/chess.js?v=7';
import { Board } from './board.js?v=7';
import { chooseMove, evaluateFor, AI_NAMES } from './ai.js?v=7';
import { sfx } from './sound.js?v=7';
import { store, saveStats, pushRecent } from './store.js?v=7';
import { applyResult, rankForStars } from './ranks.js?v=7';
import {
  $, avatarHTML, fmtClock, toast, openModal, closeModal,
  confettiBurst, esc, confirmDialog,
} from './ui.js?v=7';
import { pieceSrc } from './pieces.js?v=7';

const COLOR_NAME = { w: 'Putih', b: 'Hitam' };

const REASONS = {
  checkmate: 'Skakmat! ♔',
  resign: 'lawan menyerah 🏳️',
  flag: 'waktu habis ⏱️',
  stalemate: 'Stalemate (jalan buntu)',
  agreement: 'remis atas kesepakatan 🤝',
  repetition: 'remis: pengulangan 3x 🔁',
  fifty: 'remis: 50 langkah tanpa progres',
  material: 'remis: materi tidak cukup',
  disconnect: 'lawan terputus dari room 📡',
};

const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

export class Game {
  /**
   * config: {
   *   mode: 'ai'|'local'|'online',
   *   myColor: 'w'|'b',
   *   difficulty: 'easy'|'medium'|'hard',
   *   timeMs: number (0 = tanpa jam), incMs: number,
   *   me: profile, opp: profile-like,
   *   net: Net|null, isHost: bool,
   * }
   * hooks: { onMenu: ()=>void, onRestartRequest: ()=>void }
   */
  constructor(config, hooks = {}) {
    this.cfg = config;
    this.hooks = hooks;
    this.chess = new Chess();
    this.board = null;
    this.clocks = { w: config.timeMs, b: config.timeMs };
    this.timer = null;
    this.lastTick = 0;
    this.running = false;
    this.finished = false;
    this.result = null;
    this.aiThinking = false;
    this.moveToken = 0;
    this.drawOffered = false;      // saya menawari (online)
    this.rematchState = 'none';    // none|offered|received
    this.disconnectTimer = null;
    this.disconnectLeft = 0;
    this.lastTickSecond = -1;
    this.unreadChat = 0;

    this.buildBoard();
    this.wireControls();
  }

  // ============================ setup ============================
  buildBoard() {
    const el = $('#board');
    this.board = new Board(el, {
      orientation: this.cfg.myColor,
      interactive: false,
      getMoves: (sq) => {
        try { return this.chess.moves({ square: sq, verbose: true }); }
        catch { return []; }
      },
      pieceAt: (sq) => {
        const p = this.chess.get(sq);
        return p ? { color: p.color, type: p.type } : null;
      },
      canMoveColor: (color) => this.canAct(color),
      onMove: (from, to, promotion) => this.userMove(from, to, promotion),
    });
    this.board.setPieces(this.piecesMap());
  }

  piecesMap() {
    const m = new Map();
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) m.set(cell.square, { color: cell.color, type: cell.type });
      }
    }
    return m;
  }

  meFirst() { return this.cfg.myColor === 'w'; }

  oppProfile() {
    if (this.cfg.mode === 'ai') {
      const lv = this.cfg.difficulty || 'medium';
      return { name: AI_NAMES[lv] || 'Komputer', username: 'komputer', avatar: { type: 'preset', data: '🤖' }, bot: true };
    }
    if (this.cfg.mode === 'local') {
      return { name: 'Teman (Tamu)', username: 'tamu', avatar: { type: 'preset', data: '👤' }, guest: true };
    }
    return this.cfg.opp;
  }

  start() {
    this.chess.reset();
    this.board.setPieces(this.piecesMap());
    this.board.setLastMove(null);
    this.board.setCheck(null);
    this.clocks = { w: this.cfg.timeMs, b: this.cfg.timeMs };
    this.running = true;
    this.finished = false;
    this.result = null;
    this.moveToken++;
    this.drawOffered = false;
    this.rematchState = 'none';
    this.hideResult();
    $('#moves-list').innerHTML = '<li class="moves-empty">Belum ada langkah.</li>';
    $('#material-chip').hidden = true;
    $('#draw-badge').hidden = true;
    this.renderBars();
    this.updateStatus();
    this.updateBoardInteractive();
    this.startClockLoop();
    sfx.start();
    this.maybeAiMove();
  }

  restartSwap() {
    // rematch offline: tukar warna biar adil
    if (this.cfg.mode !== 'online') {
      this.cfg.myColor = this.cfg.myColor === 'w' ? 'b' : 'w';
      this.board.setOrientation(this.cfg.myColor);
    }
    this.start();
  }

  destroy() {
    this.moveToken++;
    this.stopClockLoop();
    this.clearDisconnectTimer();
    this.board?.destroy();
    this.board = null;
  }

  // ============================ giliran & aksi ============================
  turn() { return this.chess.turn(); }

  canAct(color) {
    if (!this.running || this.finished) return false;
    if (this.chess.turn() !== color) return false;
    if (this.cfg.mode === 'local') return true;               // berdua 1 layar
    if (this.cfg.mode === 'ai') return color === this.cfg.myColor && !this.aiThinking;
    if (this.cfg.mode === 'online') return color === this.cfg.myColor;
    return false;
  }

  updateBoardInteractive() {
    if (!this.board) return;
    const t = this.turn();
    this.board.setInteractive(this.canAct(t));
  }

  // ============================ langkah ============================
  userMove(from, to, promotion) {
    if (this.finished || !this.running) return;
    const piece = this.chess.get(from);
    if (!piece) return;
    if (!this.canAct(piece.color)) { sfx.illegal(); return; }
    this.applyMove({ from, to, promotion }, 'user');
  }

  /** Terapkan langkah (sumber: 'user' | 'ai' | 'remote'). */
  applyMove({ from, to, promotion }, source) {
    let move;
    try {
      move = this.chess.move({ from, to, promotion });
    } catch {
      sfx.illegal();
      this.board.clearSelection();
      return false;
    }
    // increment jam
    if (this.cfg.timeMs > 0 && this.cfg.incMs > 0) {
      this.clocks[move.color] += this.cfg.incMs;
    }
    // visual papan
    const info = this.visualInfo(move);
    this.board.applyMoveVisual(info, this.piecesMap());
    this.board.setCheck(this.chess.isCheck() ? this.kingSquare(this.turn()) : null);

    // suara
    if (this.chess.isCheckmate() || this.chess.isCheck()) {
      if (move.captured) sfx.capture();
      sfx.check();
    } else if (move.captured) {
      sfx.capture();
    } else if (move.flags.includes('k') || move.flags.includes('q')) {
      sfx.castle();
    } else if (move.promotion) {
      sfx.promote();
    } else {
      sfx.move();
    }

    // kirim ke lawan (online)
    if (source === 'user' && this.cfg.mode === 'online') {
      this.cfg.net?.send({
        t: 'move', from: move.from, to: move.to,
        promotion: move.promotion || null,
        clocks: { ...this.clocks },
      });
    }

    this.renderMoves();
    this.renderCaptured();
    this.renderBars();
    this.updateBoardInteractive();

    if (this.checkGameOver()) return true;
    this.updateStatus();
    this.maybeAiMove();
    return true;
  }

  visualInfo(move) {
    const info = {
      from: move.from, to: move.to,
      piece: { color: move.color, type: move.piece },
      captured: !!move.captured,
      promotion: move.promotion || null,
      castle: null, epCaptured: null,
    };
    if (move.flags.includes('k') || move.flags.includes('q')) {
      const rank = move.color === 'w' ? '1' : '8';
      if (move.flags.includes('k')) info.castle = { rookFrom: 'h' + rank, rookTo: 'f' + rank };
      else info.castle = { rookFrom: 'a' + rank, rookTo: 'd' + rank };
    }
    if (move.flags.includes('e')) {
      const f = move.to[0];
      const r = move.color === 'w' ? '5' : '4';
      info.epCaptured = f + r;
    }
    return info;
  }

  kingSquare(color) {
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === color) return cell.square;
      }
    }
    return null;
  }

  // ============================ AI ============================
  maybeAiMove() {
    if (this.cfg.mode !== 'ai' || this.finished || !this.running) return;
    if (this.turn() === this.cfg.myColor) return;
    this.aiThinking = true;
    this.updateBoardInteractive();
    this.updateStatus();
    const token = this.moveToken;
    const fen = this.chess.fen();
    const diff = this.cfg.difficulty || 'medium';
    setTimeout(() => {
      if (token !== this.moveToken || this.finished) return;
      let mv = null;
      try {
        mv = chooseMove(fen, diff);
      } catch (e) {
        console.error('AI error', e);
      }
      this.aiThinking = false;
      if (token !== this.moveToken || this.finished) return;
      if (!mv) { this.checkGameOver(); return; }
      this.applyMove(mv, 'ai');
    }, 380);
  }

  // ============================ jam ============================
  startClockLoop() {
    this.stopClockLoop();
    if (!this.cfg.timeMs) { this.renderBars(); return; }
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), 100);
  }

  stopClockLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    if (!this.running || this.finished || !this.cfg.timeMs) return;
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const t = this.turn();
    this.clocks[t] -= dt;
    // bunyi detik di 10 detik terakhir giliran saya
    const remain = this.clocks[t];
    if (remain < 10000 && remain > 0) {
      const sec = Math.ceil(remain / 1000);
      if (sec !== this.lastTickSecond) { this.lastTickSecond = sec; sfx.tick(); }
    }
    if (remain <= 0) {
      this.clocks[t] = 0;
      this.renderBars();
      this.onFlag(t);
      return;
    }
    this.renderClocksOnly();
  }

  onFlag(colorOut) {
    // yang kehabisan waktu kalah, kecuali lawan tak mungkin skakmat → remis
    if (this.chess.isInsufficientMaterial()) {
      this.finish('draw', 'flag_draw');
    } else {
      const winner = colorOut === 'w' ? 'b' : 'w';
      this.finish(this.outcomeFor(winner), 'flag');
    }
  }

  outcomeFor(winnerColor) {
    if (winnerColor === 'draw') return 'draw';
    return winnerColor === this.cfg.myColor ? 'win' : 'loss';
  }

  // ============================ akhir game ============================
  checkGameOver() {
    const c = this.chess;
    if (c.isCheckmate()) {
      const winner = c.turn() === 'w' ? 'b' : 'w';
      this.finish(this.outcomeFor(winner), 'checkmate');
      return true;
    }
    if (c.isStalemate()) { this.finish('draw', 'stalemate'); return true; }
    if (c.isInsufficientMaterial()) { this.finish('draw', 'material'); return true; }
    if (c.isThreefoldRepetition()) { this.finish('draw', 'repetition'); return true; }
    if (c.isDrawByFiftyMoves()) { this.finish('draw', 'fifty'); return true; }
    return false;
  }

  finish(outcome, reason) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.moveToken++;
    this.stopClockLoop();
    this.clearDisconnectTimer();
    this.updateBoardInteractive();
    this.renderBars();

    if (outcome === 'win') { sfx.win(); confettiBurst(200); }
    else if (outcome === 'loss') sfx.lose();
    else sfx.draw();

    // rating
    const stats = store.stats;
    const delta = applyResult(stats, outcome);
    saveStats(stats);
    pushRecent({
      result: outcome, reason,
      mode: this.cfg.mode,
      opp: this.oppProfile().name,
      moves: this.chess.history().length,
    });
    document.dispatchEvent(new CustomEvent('tok:stats'));

    this.result = { outcome, reason, delta };
    this.updateStatus();
    setTimeout(() => this.showResult(), 650);
  }

  reasonText(reason, outcome) {
    switch (reason) {
      case 'checkmate': return outcome === 'win' ? 'Skakmat! Kamu memenangkan permainan ♔' : 'Skakmat! Rajamu tumbang.';
      case 'resign': return outcome === 'win' ? 'Lawan menyerah. Kemenangan untukmu! 🏳️' : 'Kamu menyerah.';
      case 'flag': return outcome === 'win' ? 'Waktu lawan habis. Kamu menang! ⏱️' : 'Waktumu habis!';
      case 'flag_draw': return 'Waktu habis, tapi materi tidak cukup — remis.';
      case 'stalemate': return 'Stalemate — tidak ada langkah legal. Remis.';
      case 'agreement': return 'Remis atas kesepakatan kedua pemain 🤝';
      case 'repetition': return 'Remis: posisi berulang 3 kali 🔁';
      case 'fifty': return 'Remis: 50 langkah tanpa pion/makan.';
      case 'material': return 'Remis: materi tidak cukup untuk skakmat.';
      case 'disconnect': return 'Lawan terputus. Kemenangan untukmu! 📡';
      default: return REASONS[reason] || 'Permainan berakhir.';
    }
  }

  // ============================ UI: bar pemain ============================
  barPlayer(which) {
    // which: 'top'|'bottom' → warna sesuai orientasi
    const ori = this.board ? this.board.orientation : this.cfg.myColor;
    const color = which === 'bottom' ? ori : (ori === 'w' ? 'b' : 'w');
    const isMe = this.cfg.mode === 'local'
      ? color === this.cfg.myColor
      : color === this.cfg.myColor;
    const prof = isMe ? this.cfg.me : this.oppProfile();
    return { color, isMe, prof };
  }

  renderBars() {
    for (const which of ['top', 'bottom']) {
      const { color, isMe, prof } = this.barPlayer(which);
      const el = which === 'top' ? $('#player-top') : $('#player-bottom');
      const stars = prof.stars ?? (isMe ? store.stats.stars : null);
      const rank = stars != null ? rankForStars(stars) : null;
      const active = this.running && !this.finished && this.turn() === color;
      const ms = this.clocks[color];
      const clockHTML = this.cfg.timeMs > 0
        ? `<div class="clock ${active ? 'active' : ''} ${ms < 30000 ? 'low' : ''}" data-clock="${color}">${fmtClock(ms)}</div>`
        : `<div class="clock no-time">${color === 'w' ? '♔' : '♚'}</div>`;
      el.innerHTML = `
        ${avatarHTML(prof, 42)}
        <div class="pmeta">
          <div class="pname"><span class="color-dot ${color}"></span><span>${esc(prof.name)}${isMe && this.cfg.mode !== 'local' ? ' (Kamu)' : ''}</span></div>
          <div class="psub">
            ${rank ? `<span>${rank.icon} ${rank.name}</span>` : `<span>@${esc(prof.username || 'lawan')}</span>`}
            ${stars != null ? `<span>⭐ ${stars}</span>` : ''}
          </div>
          <div class="captured-row" data-captured="${color === 'w' ? 'b' : 'w'}"></div>
        </div>
        ${clockHTML}`;
    }
    this.renderCaptured();
  }

  renderClocksOnly() {
    if (!this.cfg.timeMs) return;
    for (const color of ['w', 'b']) {
      const el = document.querySelector(`[data-clock="${color}"]`);
      if (!el) continue;
      const active = this.running && !this.finished && this.turn() === color;
      el.textContent = fmtClock(this.clocks[color]);
      el.classList.toggle('active', active);
      el.classList.toggle('low', this.clocks[color] < 30000);
    }
  }

  renderCaptured() {
    // hitung bidak yang hilang dari papan
    const count = { w: { ...START_COUNT }, b: { ...START_COUNT } };
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) count[cell.color][cell.type]--;
      }
    }
    const order = ['q', 'r', 'b', 'n', 'p'];
    let matW = 0, matB = 0;
    for (const color of ['w', 'b']) {
      const missing = [];
      for (const t of order) {
        for (let i = 0; i < count[color][t]; i++) missing.push(t);
      }
      // material yang dimakan warna ini = bidak lawan yang hilang
      const foe = color === 'w' ? 'b' : 'w';
      let mat = 0;
      for (const t of order) mat += count[foe][t] * PIECE_VAL[t];
      if (color === 'w') matW = mat; else matB = mat;
      const rowEl = document.querySelector(`[data-captured="${color}"]`);
      if (rowEl) {
        rowEl.innerHTML = missing.map((t) => `<img src="${pieceSrc(color, t)}" alt="" />`).join('');
      }
    }
    const diff = matW - matB;
    const chip = $('#material-chip');
    if (diff === 0) { chip.hidden = true; }
    else {
      chip.hidden = false;
      chip.textContent = diff > 0 ? `Putih +${diff}` : `Hitam +${-diff}`;
    }
  }

  renderMoves() {
    const hist = this.chess.history({ verbose: true });
    const ol = $('#moves-list');
    if (!hist.length) {
      ol.innerHTML = '<li class="moves-empty">Belum ada langkah.</li>';
      return;
    }
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const no = i / 2 + 1;
      const w = hist[i] ? hist[i].san : '';
      const b = hist[i + 1] ? hist[i + 1].san : '';
      html += `<li><span class="mv-no">${no}.</span><span class="mv">${esc(w)}</span><span class="mv">${esc(b)}</span></li>`;
    }
    ol.innerHTML = html;
    ol.scrollTop = ol.scrollHeight;
  }

  updateStatus() {
    const el = $('#game-status');
    el.classList.remove('check', 'mate');
    if (this.finished && this.result) {
      const { outcome, reason } = this.result;
      el.classList.add('mate');
      el.textContent = outcome === 'win' ? '🏆 ' + this.reasonText(reason, outcome)
        : outcome === 'loss' ? '💔 ' + this.reasonText(reason, outcome)
        : '🤝 ' + this.reasonText(reason, outcome);
      return;
    }
    const t = this.turn();
    const inCheck = this.chess.isCheck();
    let label;
    if (this.cfg.mode === 'ai') {
      if (this.aiThinking) label = `🤖 ${esc(this.oppProfile().name)} sedang berpikir…`;
      else label = t === this.cfg.myColor ? `Giliranmu (${COLOR_NAME[t]})` : `Giliran ${COLOR_NAME[t]}`;
    } else if (this.cfg.mode === 'local') {
      label = `Giliran: ${COLOR_NAME[t]} ${t === 'w' ? '⬜' : '⬛'}`;
    } else {
      label = t === this.cfg.myColor ? 'Giliranmu! Langkahkan bidakmu ⚡' : 'Giliran lawan… tunggu ya ⏳';
    }
    if (inCheck) { el.classList.add('check'); label += ' — SKAK! ⚠️'; }
    el.innerHTML = label;
  }

  // ============================ kontrol ============================
  wireControls() {
    $('#btn-flip').onclick = () => { sfx.click(); this.board.flip(); this.renderBars(); };
    $('#btn-resign').onclick = () => this.onResign();
    $('#btn-draw').onclick = () => this.onDrawButton();
    $('#btn-newgame').onclick = () => this.onNewGame();
    $('#btn-tomenu').onclick = () => this.onMenu();
    $('#game-chat-form').onsubmit = (e) => {
      e.preventDefault();
      const inp = $('#game-chat-input');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      this.sendChat(text);
    };
  }

  async onResign() {
    if (this.finished || !this.running) return;
    sfx.click();
    const ok = await confirmDialog({ title: 'Menyerah?', message: 'Kamu akan kalah dan kehilangan 1 ⭐. Yakin?', ok: 'Ya, menyerah', cancel: 'Lanjut main' });
    if (!ok) return;
    if (this.cfg.mode === 'online') {
      this.cfg.net?.send({ t: 'resign' });
      this.finish('loss', 'resign');
    } else if (this.cfg.mode === 'local') {
      // yang gilirannya berjalan menyerah
      const loser = this.turn();
      this.finish(this.outcomeFor(loser === 'w' ? 'b' : 'w'), 'resign');
    } else {
      this.finish('loss', 'resign');
    }
  }

  async onDrawButton() {
    if (this.finished || !this.running) return;
    sfx.click();
    if (this.cfg.mode === 'online') {
      if (this.drawOffered) { toast('Tawaran remis sudah dikirim, menunggu lawan…'); return; }
      this.drawOffered = true;
      this.cfg.net?.send({ t: 'draw_offer' });
      toast('🤝 Tawaran remis dikirim ke lawan.');
      return;
    }
    if (this.cfg.mode === 'local') {
      const ok = await confirmDialog({ title: 'Remis?', message: 'Kedua pemain setuju remis?', ok: 'Ya, remis', cancel: 'Lanjut main' });
      if (ok) this.finish('draw', 'agreement');
      return;
    }
    // vs AI: komputer menerima jika posisinya tidak lebih bagus
    const evalMe = evaluateFor(this.chess.fen(), this.cfg.myColor);
    if (evalMe >= -60) {
      toast('🤖 Komputer menolak remis. Lanjut berjuang!');
      sfx.notify();
    } else {
      toast('🤖 Komputer menerima remis.');
      this.finish('draw', 'agreement');
    }
  }

  async onNewGame() {
    sfx.click();
    if (this.cfg.mode === 'online') {
      toast('Gunakan tombol Rematch setelah game selesai, atau keluar room.');
      return;
    }
    if (!this.finished) {
      const ok = await confirmDialog({ title: 'Game Baru?', message: 'Permainan saat ini akan dibuang (tidak dihitung). Lanjut?', ok: 'Ya', cancel: 'Batal' });
      if (!ok) return;
    }
    this.restartSwap();
  }

  async onMenu() {
    sfx.click();
    if (this.cfg.mode === 'online' && !this.finished) {
      const gone = !this.cfg.net?.connected;
      const ok = await confirmDialog({
        title: gone ? 'Keluar Room?' : 'Keluar & Menyerah?',
        message: gone ? 'Lawan sudah terputus. Keluar dan klaim kemenangan?' : 'Keluar room berarti MENYERAH (−1 ⭐). Yakin?',
        ok: 'Ya, keluar', cancel: 'Tetap di sini',
      });
      if (!ok) return;
      if (gone) {
        this.finish('win', 'disconnect');
        setTimeout(() => this.hooks.onMenu?.(), 1200);
        return;
      }
      this.cfg.net?.send({ t: 'resign' });
      this.cfg.net?.send({ t: 'leave' });
      this.finish('loss', 'resign');
      setTimeout(() => this.hooks.onMenu?.(), 1200);
      return;
    }
    if (!this.finished && (this.cfg.mode === 'ai' || this.cfg.mode === 'local')) {
      const ok = await confirmDialog({ title: 'Ke Menu?', message: 'Permainan belum selesai dan tidak akan dihitung. Lanjut?', ok: 'Ya', cancel: 'Batal' });
      if (!ok) return;
    }
    this.hooks.onMenu?.();
  }

  // ============================ hasil ============================
  showResult() {
    const { outcome, reason, delta } = this.result;
    const trophy = $('#result-trophy');
    const title = $('#result-title');
    if (outcome === 'win') { trophy.textContent = '🏆'; title.innerHTML = 'Kamu <span class="gold-text">Menang!</span>'; }
    else if (outcome === 'loss') { trophy.textContent = '💔'; title.textContent = 'Kamu Kalah'; }
    else { trophy.textContent = '🤝'; title.textContent = 'Seri (Remis)'; }
    $('#result-reason').textContent = this.reasonText(reason, outcome);

    // bintang
    const sr = $('#result-stars');
    if (delta.starDelta > 0) sr.innerHTML = `<span class="pop">⭐</span><span style="font-size:1.1rem;font-weight:800;color:var(--green)">+1 bintang!</span>`;
    else if (delta.starDelta < 0) sr.innerHTML = `<span class="pop">💫</span><span style="font-size:1.1rem;font-weight:800;color:var(--red)">−1 bintang</span>`;
    else sr.innerHTML = `<span style="font-size:1rem;color:var(--muted)">Bintang tetap ⭐ ${store.stats.stars}</span>`;

    // rank
    const rk = $('#result-rank');
    if (delta.rankUp) {
      sfx.rankup();
      confettiBurst(260);
      rk.innerHTML = `<span class="rankup">🎉 NAIK RANK: ${delta.before.icon} ${delta.before.name} → ${delta.after.icon} ${delta.after.name}!</span>`;
    } else if (delta.rankDown) {
      rk.innerHTML = `<span class="muted">Rank turun: ${delta.before.icon} ${delta.before.name} → ${delta.after.icon} ${delta.after.name}. Semangat, balas dendam! 💪</span>`;
    } else {
      const r = delta.after;
      rk.innerHTML = `<span class="muted">Rank: ${r.icon} <b style="color:var(--text)">${r.name}</b> • ⭐ ${store.stats.stars}</span>`;
    }

    // streak
    const st = store.stats;
    $('#result-streak').innerHTML = st.streak >= 2
      ? `🔥 Streak <b style="color:var(--gold)">${st.streak}x</b> kemenangan!`
      : (outcome === 'win' ? '🔥 Streak dimulai! Menangkan lagi!' : outcome === 'loss' ? 'Streak kembali ke 0. Coba lagi! 💪' : 'Streak aman.');
    $('#result-wait').hidden = true;

    const rb = $('#btn-result-rematch');
    rb.hidden = false;
    if (this.cfg.mode === 'online') {
      rb.textContent = this.rematchState === 'received' ? '✅ Terima Rematch' : '⚔️ Ajak Rematch';
    } else {
      rb.textContent = '⚔️ Main Lagi (tukar warna)';
    }
    openModal('modal-result');

    rb.onclick = () => this.onRematchClick();
    $('#btn-result-menu').onclick = () => { sfx.click(); closeModal('modal-result'); this.onMenu(); };
  }

  hideResult() {
    closeModal('modal-result');
  }

  onRematchClick() {
    sfx.click();
    if (this.cfg.mode !== 'online') {
      closeModal('modal-result');
      this.restartSwap();
      return;
    }
    // ---- online rematch ----
    if (this.rematchState === 'received') {
      // terima: tukar warna, mulai
      this.cfg.net?.send({ t: 'rematch_accept' });
      this.cfg.myColor = this.cfg.myColor === 'w' ? 'b' : 'w';
      this.board.setOrientation(this.cfg.myColor);
      this.start();
      this.cfg.net?.send({ t: 'rematch_start', starterColor: this.cfg.myColor === 'w' ? 'b' : 'w' });
      return;
    }
    if (this.rematchState === 'offered') {
      toast('Tawaran rematch sudah dikirim, menunggu lawan…');
      return;
    }
    this.rematchState = 'offered';
    this.cfg.net?.send({ t: 'rematch_offer' });
    $('#result-wait').hidden = false;
    $('#btn-result-rematch').textContent = '⏳ Menunggu Lawan…';
    toast('⚔️ Tawaran rematch dikirim.');
  }

  // ============================ online: pesan masuk ============================
  onNetMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'move': this.onRemoteMove(msg); break;
      case 'resign':
        if (!this.finished) { toast('Lawan menyerah! 🏳️'); this.finish('win', 'resign'); }
        break;
      case 'leave':
        if (!this.finished) this.onOpponentGone();
        break;
      case 'draw_offer': this.onRemoteDrawOffer(); break;
      case 'draw_accept':
        if (!this.finished) { this.drawOffered = false; toast('Lawan menerima remis 🤝'); this.finish('draw', 'agreement'); }
        break;
      case 'draw_decline':
        this.drawOffered = false;
        toast('Lawan menolak remis. Lanjut! 🔥');
        break;
      case 'rematch_offer': this.onRemoteRematchOffer(); break;
      case 'rematch_accept': this.onRemoteRematchAccept(); break;
      case 'rematch_decline':
        this.rematchState = 'none';
        $('#result-wait').hidden = true;
        $('#btn-result-rematch').textContent = '⚔️ Ajak Rematch';
        toast('Lawan menolak rematch.');
        break;
      case 'rematch_start':
        // (ditinggalkan) kompatibilitas: abaikan
        break;
      case 'chat': this.renderChat(msg, false); break;
      case 'ping':
        this.cfg.net?.send({ t: 'pong' });
        break;
      default: break;
    }
  }

  onRemoteMove(msg) {
    if (this.finished) return;
    const ok = this.applyMove({ from: msg.from, to: msg.to, promotion: msg.promotion || undefined }, 'remote');
    if (ok && msg.clocks) {
      // samakan jam dari pengirim (otoritas waktu milik pengirim)
      this.clocks = { w: Math.max(0, msg.clocks.w), b: Math.max(0, msg.clocks.b) };
      this.lastTick = performance.now();
      this.renderBars();
    }
  }

  async onRemoteDrawOffer() {
    if (this.finished || !this.running) return;
    sfx.notify();
    $('#draw-badge').hidden = false;
    const ok = await confirmDialog({ title: 'Tawaran Remis 🤝', message: 'Lawan mengajak remis. Terima?', ok: 'Terima', cancel: 'Tolak' });
    $('#draw-badge').hidden = true;
    if (this.finished) return;
    if (ok) {
      this.cfg.net?.send({ t: 'draw_accept' });
      this.finish('draw', 'agreement');
    } else {
      this.cfg.net?.send({ t: 'draw_decline' });
    }
  }

  onRemoteRematchOffer() {
    if (!this.finished) return; // abaikan jika game masih jalan
    if (this.rematchState === 'offered') {
      // dua-duanya menawari → langsung mulai, tukar warna
      this.cfg.net?.send({ t: 'rematch_accept' });
      this.cfg.myColor = this.cfg.myColor === 'w' ? 'b' : 'w';
      this.board.setOrientation(this.cfg.myColor);
      this.start();
      return;
    }
    this.rematchState = 'received';
    sfx.notify();
    toast('⚔️ Lawan mengajak rematch!');
    $('#btn-result-rematch').textContent = '✅ Terima Rematch';
    $('#result-wait').hidden = true;
  }

  onRemoteRematchAccept() {
    if (this.rematchState !== 'offered') return;
    // saya yang menawar & diterima → tukar warna & mulai
    this.cfg.myColor = this.cfg.myColor === 'w' ? 'b' : 'w';
    this.board.setOrientation(this.cfg.myColor);
    this.start();
  }

  // ---- lawan terputus saat game online ----
  onOpponentGone() {
    if (this.finished) return;
    sfx.notify();
    toast('📡 Lawan terputus! Klaim kemenangan dalam 15 detik…', 'gold');
    this.disconnectLeft = 15;
    this.updateStatus();
    const statusEl = $('#game-status');
    this.clearDisconnectTimer();
    this.disconnectTimer = setInterval(() => {
      this.disconnectLeft--;
      if (this.disconnectLeft <= 0) {
        this.clearDisconnectTimer();
        if (!this.finished) this.finish('win', 'disconnect');
        return;
      }
      statusEl.textContent = `📡 Lawan terputus! Menang otomatis dalam ${this.disconnectLeft} detik…`;
    }, 1000);
    statusEl.textContent = `📡 Lawan terputus! Menang otomatis dalam ${this.disconnectLeft} detik…`;
  }

  clearDisconnectTimer() {
    if (this.disconnectTimer) clearInterval(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  // ============================ chat game ============================
  sendChat(text) {
    const msg = {
      t: 'chat', text: String(text).slice(0, 200),
      from: this.cfg.me.username, name: this.cfg.me.name, ts: Date.now(),
    };
    if (this.cfg.net?.send(msg)) {
      this.renderChat(msg, true);
    } else {
      toast('Gagal mengirim chat: tidak terhubung.', 'error');
    }
    sfx.click();
  }

  renderChat(msg, mine) {
    const box = $('#game-chat-messages');
    const d = document.createElement('div');
    d.className = 'chat-msg ' + (mine ? 'me' : 'them');
    d.innerHTML = `<span class="who">${esc(mine ? 'Kamu' : (msg.name || 'Lawan'))}</span>${esc(msg.text)}`;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    if (!mine) {
      sfx.message();
      if ($('#panel-chat').hidden === false) {
        // panel terlihat, tidak perlu badge
      }
    }
  }
}
