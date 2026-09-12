// ============================================================
// Skin papan & bidak catur. ID skin dikirim ke lawan saat online
// sehingga skin-mu bisa dilihat pemain lain.
// ============================================================

export const SKINS = [
  { id: 'wood',     name: 'Kayu Klasik', desc: 'Klasik dan elegan.',  price: 0 },
  { id: 'midnight', name: 'Midnight',    desc: 'Tenang malam hari.',  price: 0 },
  { id: 'emerald',  name: 'Emerald',     desc: 'Hijau meja turnamen.', price: 0 },
  { id: 'neon',     name: 'Neon Cyber',  desc: 'Bercahaya ala cyber.', price: 100 },
  { id: 'gold',     name: 'Emas Sultan', desc: 'Mewah berkilau.',     price: 100 },
  { id: 'ocean',    name: 'Ocean',       desc: 'Segar biru laut.',    price: 100 },
  { id: 'candy',    name: 'Candy Pop',   desc: 'Ceria pink permen.',  price: 100 },
  { id: 'shadow',   name: 'Shadow',      desc: 'Gelap misterius.',    price: 100 },
  { id: 'galaksi',  name: 'Galaksi',     desc: 'Antariksa beranimasi — eksklusif Spin!', price: 500, spinOnly: true },
];

export const DEFAULT_SKINS = ['wood', 'midnight', 'emerald'];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || null;
}

const SKIN_CLASSES = [
  ...SKINS.map((s) => 'skin-' + s.id),
  'theme-wood', 'theme-midnight', 'theme-emerald', // legacy, dibersihkan
];

/** Terapkan skin ke elemen papan. Return id final (fallback 'wood'). */
export function applySkin(boardEl, skinId) {
  const id = skinById(skinId) ? skinId : 'wood';
  if (!boardEl) return id;
  boardEl.classList.remove(...SKIN_CLASSES);
  boardEl.classList.add('skin-' + id);
  return id;
}
