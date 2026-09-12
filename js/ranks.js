// ============================================================
// Sistem Rank TheofKing:
// Bronze -> Silver -> Gold -> Mythic -> King -> Master
// Menang +1 bintang, kalah -1 bintang, tiap 5 bintang naik rank.
// ============================================================

export const STARS_PER_RANK = 5;

export const RANKS = [
  { id: 'bronze', name: 'Bronze', icon: '🥉', min: 0,  css: 'linear-gradient(135deg,#e8a06a,#8c4b1f)' },
  { id: 'silver', name: 'Silver', icon: '🥈', min: 5,  css: 'linear-gradient(135deg,#f2f5fa,#8d99ae)' },
  { id: 'gold',   name: 'Gold',   icon: '🥇', min: 10, css: 'linear-gradient(135deg,#ffe27a,#d99a1f)' },
  { id: 'mythic', name: 'Mythic', icon: '🔮', min: 15, css: 'linear-gradient(135deg,#c084fc,#6d28d9)' },
  { id: 'king',   name: 'King',   icon: '👑', min: 20, css: 'linear-gradient(135deg,#ffd166,#b57e12)' },
  { id: 'master', name: 'Master', icon: '♛',  min: 25, css: 'linear-gradient(135deg,#7df9ff,#2563eb)' },
];

export function rankForStars(stars) {
  const s = Math.max(0, Math.floor(stars || 0));
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (s >= RANKS[i].min) idx = i;
  }
  return { ...RANKS[idx], index: idx };
}

/** Progress bintang di rank saat ini: { filled (0-5), total:5, next } */
export function rankProgress(stars) {
  const s = Math.max(0, Math.floor(stars || 0));
  const rank = rankForStars(s);
  if (rank.id === 'master') return { filled: STARS_PER_RANK, total: STARS_PER_RANK, next: null, maxed: true };
  return {
    filled: s - rank.min,
    total: STARS_PER_RANK,
    next: RANKS[rank.index + 1],
    maxed: false,
  };
}

/**
 * Terapkan hasil pertandingan ke stats.
 * @param {object} stats { stars, streak, bestStreak, wins, losses, draws, games }
 * @param {'win'|'loss'|'draw'} result
 * @returns {{ starDelta:number, rankUp:boolean, rankDown:boolean, before:object, after:object }}
 */
export function applyResult(stats, result, opts = {}) {
  const before = rankForStars(stats.stars);
  let starDelta = 0;
  stats.games = (stats.games || 0) + 1;
  if (result === 'win') {
    stats.wins = (stats.wins || 0) + 1;
    stats.stars = (stats.stars || 0) + 1;
    stats.streak = (stats.streak || 0) + 1;
    stats.bestStreak = Math.max(stats.bestStreak || 0, stats.streak);
    starDelta = 1;
  } else if (result === 'loss') {
    stats.losses = (stats.losses || 0) + 1;
    if (opts.protect) {
      starDelta = 0; // dilindungi Star Protection: bintang aman
    } else {
      stats.stars = Math.max(0, (stats.stars || 0) - 1);
      starDelta = -1;
    }
    stats.streak = 0;
  } else {
    stats.draws = (stats.draws || 0) + 1;
    starDelta = 0; // seri: bintang & streak aman
  }
  const after = rankForStars(stats.stars);
  return {
    starDelta,
    rankUp: after.index > before.index,
    rankDown: after.index < before.index,
    before,
    after,
  };
}
