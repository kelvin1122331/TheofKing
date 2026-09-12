// ============================================================
// Kosmetik profil: bingkai foto (border) & avatar premium.
// Bingkai tampil otomatis di semua avatar via avatarHTML().
// ============================================================

export const BORDERS = [
  { id: 'none',    name: 'Tanpa Bingkai',  desc: 'Polos bawaan',          price: 0 },
  { id: 'gold',    name: 'Emas Mulia',     desc: 'Lingkaran emas mewah',  price: 50 },
  { id: 'frost',   name: 'Es Beku',        desc: 'Biru es berkilau',      price: 60 },
  { id: 'ocean',   name: 'Samudra',        desc: 'Biru laut berkilau',    price: 75 },
  { id: 'neon',    name: 'Neon Cyber',     desc: 'Cahaya neon terang',    price: 80 },
  { id: 'shadow',  name: 'Bayangan',       desc: 'Ungu gelap misterius',  price: 90 },
  { id: 'fire',    name: 'Api Membara',    desc: 'Bara api menyala',      price: 100 },
  { id: 'blood',   name: 'Darah',          desc: 'Merah darah menyala',   price: 110 },
  { id: 'rainbow', name: 'Pelangi',        desc: 'Warna-warni berdenyut', price: 120 },
  { id: 'emerald', name: 'Zamrud',         desc: 'Hijau permata mewah',   price: 130 },
  { id: 'storm',   name: 'Petir',          desc: 'Kuning elektrik',       price: 140 },
  { id: 'royal',   name: 'Mahkota Raja',   desc: 'Ungu + emas bangsawan', price: 150 },
  { id: 'galaxy',  name: 'Galaksi',        desc: 'Antariksa berbintang',  price: 175 },
  { id: 'mecha',   name: 'Mecha',          desc: 'Bingkai robot futuristik', price: 200 },
  { id: 'jaring',  name: 'Jaring Laba-laba', desc: 'Bingkai jaring hero',   price: 250 },
  { id: 'beku',    name: 'Raja Es',        desc: 'Bingkai kristal es',      price: 300 },
  { id: 'siber',   name: 'Cyberpunk',      desc: 'Bingkai neon digital',    price: 400 },
  { id: 'samurai', name: 'Samurai',        desc: 'Bingkai ksatria sakura',  price: 450 },
  { id: 'titan',   name: 'Titan Emas',     desc: 'Bingkai robot raksasa',   price: 500 },
  { id: 'neraka',  name: 'Neraka',         desc: 'Bingkai api neraka',      price: 600 },
  { id: 'zeus',    name: 'Petir Zeus',     desc: 'Bingkai badai petir',     price: 700 },
  { id: 'naga',    name: 'Naga',           desc: 'Bingkai naga perkasa',    price: 800 },
  { id: 'tengkorak', name: 'Bayangan Tengkorak', desc: 'Bingkai kegelapan', price: 900 },
  { id: 'nebula',  name: 'Nebula',         desc: 'Bingkai kosmik teragung', price: 1000 },
];

export const AVATARS = [
  { id: 'wolf',    name: 'Serigala Es',  emoji: '🐺', price: 40 },
  { id: 'robot',   name: 'Robot Tempur', emoji: '🤖', price: 60 },
  { id: 'phoenix', name: 'Phoenix Api',  emoji: '🔥', price: 80 },
  { id: 'ninja',   name: 'Ninja Bayangan', emoji: '🥷', price: 100 },
  { id: 'runespider', name: 'Laba-laba Rune', emoji: '🕷️', price: 100 },
  { id: 'knight',  name: 'Ksatria Emas', emoji: '🛡️', price: 120 },
  { id: 'dragon',  name: 'Naga Langit',  emoji: '🐉', price: 150 },
  { id: 'nightmare', name: 'Mimpi Buruk', emoji: '👁️', price: 150 },
];

export function borderById(id) {
  return BORDERS.find((b) => b.id === id) || null;
}

export function avatarById(id) {
  return AVATARS.find((a) => a.id === id) || null;
}

const BORDER_IMG = {
  mecha: 'assets/frames/mecha.png',
  jaring: 'assets/frames/jaring.png',
  beku: 'assets/frames/beku.png',
  siber: 'assets/frames/siber.png',
  samurai: 'assets/frames/samurai.png',
  titan: 'assets/frames/titan.png',
  neraka: 'assets/frames/neraka.png',
  zeus: 'assets/frames/zeus.png',
  naga: 'assets/frames/naga.png',
  tengkorak: 'assets/frames/tengkorak.png',
  nebula: 'assets/frames/nebula.png',
};

/** Path gambar bingkai berbasis image, atau null bila CSS murni. */
export function borderImg(id) {
  return BORDER_IMG[id] || null;
}

export function avatarImg(id) {
  return `assets/avatars/${id}.png`;
}

export const NICKFX = [
  { id: 'none',    name: 'Tanpa Efek',       desc: 'Nama normal',                 price: 0,   emoji: '\U0001F4DD' },
  { id: 'rainbow', name: 'Nickname Rainbow', desc: 'Nama warna-warni beranimasi', price: 200, emoji: '\U0001F308' },
];

export function nickFxById(id) {
  return NICKFX.find((x) => x.id === id) || null;
}
