// ============================================================
// AI catur: negamax + alpha-beta pruning + piece-square tables.
// 3 level: easy (kedalaman 1 + ngawur), medium (2), hard (3).
// ============================================================
import { Chess } from './vendor/chess.js?v=10';

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// Piece-square tables (sudut pandang putih, urutan a8..h1)
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

/** Evaluasi statis dari sudut pandang giliran berjalan (centipawn). */
function evaluate(chess) {
  const b = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = b[r][f];
      if (!sq) continue;
      const idx = sq.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const v = VAL[sq.type] + PST[sq.type][idx];
      score += sq.color === 'w' ? v : -v;
    }
  }
  return chess.turn() === 'w' ? score : -score;
}

/** Evaluasi dari sudut pandang warna tertentu (untuk keputusan AI). */
export function evaluateFor(fen, color) {
  try {
    const c = new Chess(fen);
    const s = evaluate(c);
    return c.turn() === color ? s : -s;
  } catch {
    return 0;
  }
}

function orderMoves(moves) {
  for (const m of moves) {
    let s = 0;
    if (m.captured) s += 10 * (VAL[m.captured] || 0) - (VAL[m.piece] || 0);
    if (m.promotion) s += (VAL[m.promotion] || 0) + 800;
    if (m.san && m.san.includes('+')) s += 60;
    m._s = s;
  }
  moves.sort((a, b) => b._s - a._s);
  return moves;
}

class TimeUp extends Error {}

function negamax(chess, depth, alpha, beta, ply, lim) {
  lim.nodes++;
  if ((lim.nodes & 1023) === 0 && (Date.now() > lim.deadline || lim.nodes > lim.maxNodes)) throw new TimeUp();
  if (chess.isCheckmate()) return -(MATE - ply);
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition() || chess.isDrawByFiftyMoves()) return 0;
  if (depth <= 0) return evaluate(chess);

  const moves = orderMoves(chess.moves({ verbose: true }));
  let best = -Infinity;
  for (const m of moves) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    const s = -negamax(chess, depth - 1, -beta, -alpha, ply + 1, lim);
    chess.undo();
    if (s > best) best = s;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

const LEVELS = {
  easy:   { depth: 1, timeMs: 250,  maxNodes: 6000,   randomPick: 0.35, topSpread: 140 },
  medium: { depth: 2, timeMs: 700,  maxNodes: 45000,  randomPick: 0.0,  topSpread: 45 },
  hard:   { depth: 3, timeMs: 1600, maxNodes: 260000, randomPick: 0.0,  topSpread: 12 },
};

/**
 * Pilih langkah AI.
 * @returns {{from,to,promotion}|null}
 */
export function chooseMove(fen, difficulty = 'medium') {
  const lv = LEVELS[difficulty] || LEVELS.medium;
  const chess = new Chess(fen);
  const rootMoves = chess.moves({ verbose: true });
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) {
    const m = rootMoves[0];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }
  // Easy: kadang melangkah ngawur biar manusia bisa menang 😄
  if (lv.randomPick > 0 && Math.random() < lv.randomPick) {
    const m = rootMoves[(Math.random() * rootMoves.length) | 0];
    return { from: m.from, to: m.to, promotion: m.promotion || (m.promotion === undefined && isPromoMove(m) ? 'q' : undefined) };
  }

  // Iterative deepening: depth 1 -> 2 -> 3. Hasil iterasi terdalam
  // yang selesai dipakai (jadi skakmat dalam 1 langkah pasti ketemu).
  orderMoves(rootMoves);
  const lim = { nodes: 0, deadline: Date.now() + lv.timeMs, maxNodes: lv.maxNodes };
  let completed = null;
  try {
    for (let depth = 1; depth <= lv.depth; depth++) {
      const scored = [];
      let alpha = -Infinity;
      for (const m of rootMoves) {
        chess.move({ from: m.from, to: m.to, promotion: m.promotion });
        let s;
        try {
          s = -negamax(chess, depth - 1, -Infinity, -alpha, 1, lim);
        } finally {
          chess.undo();
        }
        scored.push({ m, s });
        if (s > alpha) alpha = s;
      }
      completed = scored;
      // urutkan untuk iterasi berikutnya (best-first = pruning maksimal)
      const rank = new Map(scored.map((x) => [x.m, x.s]));
      rootMoves.sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0));
      // skakmat ketemu -> langsung mainkan, tak perlu mikir lebih dalam
      if (scored.some((x) => x.s > MATE - 1000)) break;
    }
  } catch (e) {
    if (!(e instanceof TimeUp)) throw e;
  }
  if (!completed || completed.length === 0) {
    const m = rootMoves[(Math.random() * rootMoves.length) | 0];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }
  const scored = completed;
  scored.sort((a, b) => b.s - a.s);
  // sedikit noise agar variatif (kecuali saat skakmat: pilih yang tercepat)
  let pick;
  if (scored[0].s > MATE - 1000) {
    pick = scored[0].m;
  } else {
    for (const x of scored) x.s += (Math.random() - 0.5) * lv.topSpread * 0.4;
    scored.sort((a, b) => b.s - a.s);
    const best = scored[0].s;
    const pool = scored.filter((x) => best - x.s <= lv.topSpread);
    pick = pool[(Math.random() * pool.length) | 0].m;
  }
  let promotion = pick.promotion;
  if (!promotion && isPromoMove(pick)) promotion = 'q';
  return { from: pick.from, to: pick.to, promotion };
}

function isPromoMove(m) {
  if (m.promotion) return true;
  // fallback: pion mencapai baris akhir
  if (!m.piece || m.piece !== 'p') return false;
  const toRank = m.to[1];
  return (m.color === 'w' && toRank === '8') || (m.color === 'b' && toRank === '1');
}

export const AI_LEVELS = [
  { id: 'easy', name: 'Mudah 🌱', desc: 'Santai, cocok untuk belajar.' },
  { id: 'medium', name: 'Sedang 🔥', desc: 'Cukup menantang.' },
  { id: 'hard', name: 'Sulit 💀', desc: 'Serius! Awas skakmat.' },
];

export const AI_NAMES = {
  easy: 'Bot Pion',
  medium: 'Bot Ksatria',
  hard: 'Bot Raja',
};
