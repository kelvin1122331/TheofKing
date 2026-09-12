// ============================================================
// Papan catur interaktif: klik + drag & drop, animasi geser,
// highlight, promosi, koordinat, balik papan.
// ============================================================
import { pieceSrc } from './pieces.js?v=11';

const FILES = 'abcdefgh';

function sqToRC(sq, orientation) {
  const f = FILES.indexOf(sq[0]);
  const r = 8 - parseInt(sq[1], 10);
  if (orientation === 'w') return { row: r, col: f };
  return { row: 7 - r, col: 7 - f };
}

function rcToSq(row, col, orientation) {
  let f = col;
  let r = row;
  if (orientation === 'b') { f = 7 - col; r = 7 - row; }
  return FILES[f] + (8 - r);
}

export class Board {
  /**
   * @param {HTMLElement} rootEl
   * @param {object} opts {
   *   orientation:'w', interactive:false,
   *   getMoves:(sq)=>verboseMoves[],       // langkah legal dari kotak
   *   pieceAt:(sq)=>{color,type}|null,     // isi kotak
   *   canMoveColor:(color)=>bool,          // boleh gerakkan warna ini?
   *   onMove:(from,to,promotion)=>void,    // user melangkah
   * }
   */
  constructor(rootEl, opts = {}) {
    this.root = rootEl;
    this.opts = opts;
    this.orientation = opts.orientation || 'w';
    this.interactive = !!opts.interactive;
    this.sqEls = new Map();   // sq -> div
    this.pieceEls = new Map();// sq -> div.piece
    this.pieces = new Map();  // sq -> {color,type}
    this.selected = null;
    this.legalCache = [];
    this.lastMove = null;
    this.checkSq = null;
    this.drag = null;

    this.root.innerHTML = '';
    this.squaresEl = document.createElement('div');
    this.squaresEl.className = 'squares';
    this.piecesEl = document.createElement('div');
    this.piecesEl.className = 'pieces';
    this.root.appendChild(this.squaresEl);
    this.root.appendChild(this.piecesEl);

    this.buildSquares();
    this.bindPointer();
  }

  // ------------------------- bangun kotak -------------------------
  buildSquares() {
    this.squaresEl.innerHTML = '';
    this.sqEls.clear();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = rcToSq(row, col, this.orientation);
        const d = document.createElement('div');
        const isLight = (FILES.indexOf(sq[0]) + parseInt(sq[1], 10)) % 2 === 1;
        d.className = 'sq ' + (isLight ? 'l' : 'd');
        d.dataset.sq = sq;
        if (col === 0) {
          const c = document.createElement('span');
          c.className = 'coord rank';
          c.textContent = sq[1];
          d.appendChild(c);
        }
        if (row === 7) {
          const c = document.createElement('span');
          c.className = 'coord file';
          c.textContent = sq[0];
          d.appendChild(c);
        }
        const hint = document.createElement('span');
        hint.className = 'hint-dot';
        hint.hidden = true;
        d.appendChild(hint);
        this.squaresEl.appendChild(d);
        this.sqEls.set(sq, d);
      }
    }
    this.applyHighlights();
    this.repositionAll();
  }

  // ------------------------- posisi bidak -------------------------
  /** Set penuh dari Map sq->{color,type} (tanpa animasi). */
  setPieces(piecesMap) {
    this.pieces = new Map(piecesMap);
    this.piecesEl.innerHTML = '';
    this.pieceEls.clear();
    for (const [sq, p] of this.pieces) {
      this.pieceEls.set(sq, this.makePieceEl(sq, p));
    }
    this.repositionAll();
  }

  makePieceEl(sq, p) {
    const d = document.createElement('div');
    d.className = 'piece';
    d.dataset.sq = sq;
    const img = document.createElement('img');
    img.src = pieceSrc(p.color, p.type);
    img.alt = p.color + p.type;
    img.draggable = false;
    d.appendChild(img);
    this.piecesEl.appendChild(d);
    return d;
  }

  posTransform(sq) {
    const { row, col } = sqToRC(sq, this.orientation);
    return `translate(${col * 100}%, ${row * 100}%)`;
  }

  repositionAll() {
    for (const [sq, el] of this.pieceEls) {
      el.style.transform = this.posTransform(sq);
      el.dataset.sq = sq;
    }
    this.refreshOwnCursor();
  }

  refreshOwnCursor() {
    const can = this.opts.canMoveColor;
    for (const [sq, el] of this.pieceEls) {
      const p = this.pieces.get(sq);
      const own = !!(p && this.interactive && can && can(p.color));
      el.classList.toggle('own', own);
    }
  }

  setInteractive(on) {
    this.interactive = !!on;
    if (!on) this.clearSelection();
    this.refreshOwnCursor();
  }

  setOrientation(o) {
    if (this.orientation === o) return;
    this.orientation = o;
    this.clearSelection();
    this.buildSquares();
    // pindahkan elemen bidak ke posisi baru (tanpa animasi aneh)
    for (const el of this.pieceEls.values()) el.style.transition = 'none';
    this.repositionAll();
    requestAnimationFrame(() => {
      for (const el of this.pieceEls.values()) el.style.transition = '';
    });
  }

  flip() {
    this.setOrientation(this.orientation === 'w' ? 'b' : 'w');
  }

  /** Update setelah ada langkah (dengan animasi). moveInfo: {from,to,piece:{color,type},captured:bool,capturedSq,promotion,castle:{rookFrom,rookTo},epCaptured} */
  applyMoveVisual(moveInfo, newPiecesMap) {
    const { from, to } = moveInfo;
    const mover = this.pieceEls.get(from);

    // hapus bidak yang dimakan (dengan fade)
    const removeSq = moveInfo.epCaptured || (moveInfo.captured ? to : null);
    if (removeSq && removeSq !== from) {
      const victim = this.pieceEls.get(removeSq);
      if (victim) {
        victim.classList.add('fade-captured');
        setTimeout(() => victim.remove(), 200);
        this.pieceEls.delete(removeSq);
      }
    }

    if (mover) {
      this.pieceEls.delete(from);
      this.pieceEls.set(to, mover);
      mover.dataset.sq = to;
      mover.style.transform = this.posTransform(to);
      if (moveInfo.promotion) {
        const color = moveInfo.piece.color;
        setTimeout(() => {
          const img = mover.querySelector('img');
          if (img) img.src = pieceSrc(color, moveInfo.promotion);
        }, 180);
      }
    }

    // rokade: geser benteng juga
    if (moveInfo.castle) {
      const rook = this.pieceEls.get(moveInfo.castle.rookFrom);
      if (rook) {
        this.pieceEls.delete(moveInfo.castle.rookFrom);
        this.pieceEls.set(moveInfo.castle.rookTo, rook);
        rook.dataset.sq = moveInfo.castle.rookTo;
        rook.style.transform = this.posTransform(moveInfo.castle.rookTo);
      }
    }

    this.pieces = new Map(newPiecesMap);
    this.clearSelection();
    this.lastMove = { from, to };
    this.applyHighlights();
    this.refreshOwnCursor();
  }

  // ------------------------- highlight -------------------------
  applyHighlights() {
    for (const [, el] of this.sqEls) {
      el.classList.remove('lastmove', 'selected', 'check');
    }
    if (this.lastMove) {
      this.sqEls.get(this.lastMove.from)?.classList.add('lastmove');
      this.sqEls.get(this.lastMove.to)?.classList.add('lastmove');
    }
    if (this.selected) {
      this.sqEls.get(this.selected)?.classList.add('selected');
    }
    if (this.checkSq) {
      this.sqEls.get(this.checkSq)?.classList.add('check');
    }
  }

  setLastMove(from, to) {
    this.lastMove = from ? { from, to } : null;
    this.applyHighlights();
  }

  setCheck(sq) {
    this.checkSq = sq || null;
    this.applyHighlights();
  }

  // ------------------------- seleksi & hint -------------------------
  clearSelection() {
    this.selected = null;
    this.legalCache = [];
    for (const [, el] of this.sqEls) {
      el.classList.remove('selected');
      const h = el.querySelector('.hint-dot');
      if (h) h.hidden = true;
      el.classList.remove('hint-cap');
    }
  }

  select(sq) {
    this.clearSelection();
    const moves = (this.opts.getMoves && this.opts.getMoves(sq)) || [];
    if (!moves.length) return false;
    this.selected = sq;
    this.legalCache = moves;
    this.sqEls.get(sq)?.classList.add('selected');
    const seen = new Set();
    for (const m of moves) {
      if (seen.has(m.to)) continue;
      seen.add(m.to);
      const el = this.sqEls.get(m.to);
      if (!el) continue;
      const h = el.querySelector('.hint-dot');
      if (h) h.hidden = false;
      if (m.captured || m.flags.includes('e')) el.classList.add('hint-cap');
    }
    return true;
  }

  targetsOf(sq) {
    return this.legalCache.filter((m) => m.to === sq);
  }

  // ------------------------- pointer (klik + drag) -------------------------
  bindPointer() {
    this.root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMovePointer(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
  }

  sqFromPoint(x, y) {
    const r = this.root.getBoundingClientRect();
    const col = Math.floor(((x - r.left) / r.width) * 8);
    const row = Math.floor(((y - r.top) / r.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return rcToSq(row, col, this.orientation);
  }

  onDown(e) {
    if (!this.interactive || e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    const sq = this.sqFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    e.preventDefault();
    const p = this.opts.pieceAt ? this.opts.pieceAt(sq) : this.pieces.get(sq);
    const canMove = this.opts.canMoveColor;
    const isOwn = !!(p && canMove && canMove(p.color));

    // mulai kemungkinan drag jika bidak sendiri
    if (isOwn) {
      const el = this.pieceEls.get(sq);
      this.drag = {
        from: sq, el, startX: e.clientX, startY: e.clientY,
        dragging: false, pointerId: e.pointerId,
      };
    } else {
      this.drag = { from: null, tapSq: sq, startX: e.clientX, startY: e.clientY, dragging: false, pointerId: e.pointerId };
    }
  }

  onMovePointer(e) {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;
    if (!this.drag.dragging) {
      if (Math.hypot(dx, dy) < 7 || !this.drag.el) return;
      // mulai drag
      this.drag.dragging = true;
      this.select(this.drag.from);
      this.drag.el.classList.add('dragging');
      if (e.cancelable) e.preventDefault();
    }
    if (e.cancelable) e.preventDefault();
    const r = this.root.getBoundingClientRect();
    const sqSize = r.width / 8;
    const x = e.clientX - r.left - sqSize / 2;
    const y = e.clientY - r.top - sqSize / 2;
    this.drag.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  onUp(e) {
    if (!this.drag || (e.pointerId !== undefined && e.pointerId !== this.drag.pointerId)) return;
    const d = this.drag;
    this.drag = null;

    if (d.dragging && d.el) {
      d.el.classList.remove('dragging');
      const target = this.sqFromPoint(e.clientX, e.clientY);
      // kembalikan dulu (kalau jadi jalan, visual di-update oleh game)
      d.el.style.transform = this.posTransform(d.from);
      if (target && target !== d.from && this.selected === d.from) {
        const opts = this.targetsOf(target);
        if (opts.length) {
          this.attemptMove(d.from, target, opts);
          return;
        }
      }
      this.clearSelection();
      return;
    }

    // ---- tap / klik ----
    const sq = d.from || d.tapSq;
    if (!sq) return;
    if (this.selected && sq === this.selected) {
      this.clearSelection();
      return;
    }
    if (this.selected) {
      const opts = this.targetsOf(sq);
      if (opts.length) {
        this.attemptMove(this.selected, sq, opts);
        return;
      }
    }
    const p = this.opts.pieceAt ? this.opts.pieceAt(sq) : this.pieces.get(sq);
    const canMove = this.opts.canMoveColor;
    if (p && canMove && canMove(p.color)) {
      this.select(sq);
    } else {
      this.clearSelection();
    }
  }

  cancelDrag() {
    if (this.drag?.el) {
      this.drag.el.classList.remove('dragging');
      this.drag.el.style.transform = this.posTransform(this.drag.from);
    }
    this.drag = null;
  }

  attemptMove(from, to, opts) {
    // promosi? tampilkan pilihan
    if (opts.length > 1 || (opts[0] && opts[0].promotion)) {
      const promos = opts.filter((m) => m.promotion);
      if (promos.length) {
        const color = this.pieces.get(from)?.color || (this.opts.pieceAt(from)?.color) || 'w';
        this.showPromotion(color, (choice) => {
          if (choice) this.opts.onMove?.(from, to, choice);
          else this.clearSelection();
        });
        return;
      }
    }
    this.opts.onMove?.(from, to, opts[0]?.promotion);
  }

  showPromotion(color, cb) {
    const ov = document.createElement('div');
    ov.className = 'promo-overlay';
    const box = document.createElement('div');
    box.className = 'promo-box';
    box.innerHTML = `<p>Promosi jadi…</p>`;
    const row = document.createElement('div');
    row.className = 'promo-choices';
    for (const t of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.type = 'button';
      const img = document.createElement('img');
      img.src = pieceSrc(color, t);
      img.alt = t;
      b.appendChild(img);
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ov.remove();
        cb(t);
      });
      row.appendChild(b);
    }
    box.appendChild(row);
    ov.appendChild(box);
    ov.addEventListener('click', () => { ov.remove(); cb(null); });
    this.root.appendChild(ov);
  }

  destroy() {
    this.root.innerHTML = '';
  }
}
