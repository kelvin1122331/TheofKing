// Peta gambar bidak catur (SVG gaya Cburnett, mirip catur asli).
// Path relatif agar aman di-deploy di subpath (mis. GitHub Pages).
export function pieceSrc(color, type) {
  return `assets/pieces/${color}${type}.svg`;
}

// Preload semua gambar bidak agar papan langsung tampil mulus.
export function preloadPieces() {
  const colors = ['w', 'b'];
  const types = ['k', 'q', 'r', 'b', 'n', 'p'];
  for (const c of colors) {
    for (const t of types) {
      const img = new Image();
      img.src = pieceSrc(c, t);
    }
  }
}
