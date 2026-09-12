// ============================================================
// Kosmetik profil: bingkai foto (border) & avatar premium.
// Bingkai tampil otomatis di semua avatar via avatarHTML().
// ============================================================

export const BORDERS = [
  { id: 'none',    name: 'Tanpa Bingkai',  desc: 'Polos bawaan',          price: 0 },
  { id: 'gold',    name: 'Emas Mulia',     desc: 'Lingkaran emas mewah',  price: 50 },
  { id: 'ocean',   name: 'Samudra',        desc: 'Biru laut berkilau',    price: 75 },
  { id: 'neon',    name: 'Neon Cyber',     desc: 'Cahaya neon terang',    price: 80 },
  { id: 'fire',    name: 'Api Membara',    desc: 'Bara api menyala',      price: 100 },
  { id: 'rainbow', name: 'Pelangi',        desc: 'Warna-warni berdenyut', price: 120 },
  { id: 'royal',   name: 'Mahkota Raja',   desc: 'Ungu + emas bangsawan', price: 150 },
];

export const AVATARS = [
  { id: 'wolf',    name: 'Serigala Es',  emoji: '🐺', price: 40 },
  { id: 'robot',   name: 'Robot Tempur', emoji: '🤖', price: 60 },
  { id: 'phoenix', name: 'Phoenix Api',  emoji: '🔥', price: 80 },
  { id: 'ninja',   name: 'Ninja Bayangan', emoji: '🥷', price: 100 },
  { id: 'knight',  name: 'Ksatria Emas', emoji: '🛡️', price: 120 },
  { id: 'dragon',  name: 'Naga Langit',  emoji: '🐉', price: 150 },
];

export function borderById(id) {
  return BORDERS.find((b) => b.id === id) || null;
}

export function avatarById(id) {
  return AVATARS.find((a) => a.id === id) || null;
}

export function avatarImg(id) {
  return `assets/avatars/${id}.png`;
}
