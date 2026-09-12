# ♞ TheofKing — Catur Online & Offline

Website game catur dengan tampilan keren bernuansa kerajaan 👑. Bisa dimainkan **offline** (vs komputer / vs teman satu HP) maupun **online** (1 vs 1 real-time pakai kode room).

![Mode](https://img.shields.io/badge/mode-online_%2B_offline-gold) ![Tanpa Build](https://img.shields.io/badge/build-tanpa_build-blue) ![Responsif](https://img.shields.io/badge/responsif-ya-green)

## ✨ Fitur

- **♟️ Papan realistis** — bidak SVG gaya Staunton, papan kayu klasik (3 tema: Kayu, Midnight, Emerald), animasi geser, drag & drop + klik, notasi, jam catur, efek suara.
- **🤖 Vs Komputer (offline)** — 3 level AI (Mudah / Sedang / Sulit), pilih warna & kontrol waktu.
- **👥 Vs Teman (offline)** — main berdua di satu layar.
- **🌐 Online** — buat room, bagikan **kode 6 digit**, gabung, chat, remis, rematch (peer-to-peer via PeerJS, tanpa server sendiri).
- **⭐ Sistem rank & bintang** — menang **+1 ⭐**, kalah **−1 ⭐**, tiap **5 ⭐ naik rank**:
  🥉 Bronze → 🥈 Silver → 🥇 Gold → 🔮 Mythic → 👑 King → ♛ Master.
- **🔥 Streak kemenangan** — menang beruntun, kalah membuat streak kembali 0.
- **🏆 Rank global & leaderboard** — peringkat bintang & streak + riwayat permainan.
- **👤 Profil wajib isi** — nama & username wajib saat pertama masuk, foto profil opsional (upload / avatar / inisial).
- **📱 Responsif** — nyaman di HP, tablet, dan desktop.

## 🚀 Cara Menjalankan

Tanpa build, cukup sajikan folder ini lewat server HTTP statis (dibutuhkan agar ES module & fetch lokal jalan):

```bash
# opsi 1: python
python3 -m http.server 8080

# opsi 2: node
npx serve .
```

Lalu buka `http://localhost:8080`.

> Catatan: mode **online** butuh internet (koneksi peer-to-peer lewat server sinyal publik PeerJS). Mode offline bisa jalan tanpa internet setelah halaman termuat.

## 🗂️ Struktur Proyek

```
├── index.html            # kerangka: home, lobby, game, modal
├── css/style.css         # seluruh tampilan + responsif
├── assets/pieces/        # 12 gambar bidak SVG (gaya Cburnett)
├── js/
│   ├── app.js            # bootstrap: onboarding, home, lobby, leaderboard
│   ├── game.js           # aturan main, jam, rating, chat, remis/rematch
│   ├── board.js          # papan interaktif (klik + drag, animasi)
│   ├── ai.js             # AI minimax 3 level
│   ├── net.js            # online room via PeerJS
│   ├── store.js          # profil, statistik, leaderboard (localStorage)
│   ├── ranks.js          # logika rank & bintang
│   ├── sound.js          # efek suara WebAudio
│   ├── ui.js             # toast, modal, confetti, avatar
│   ├── pieces.js         # path gambar bidak + preload
│   └── vendor/           # chess.js (aturan), peerjs (online) — disalin lokal
└── manifest.webmanifest
```

## 🙏 Kredit

- Bidak catur: **Colin M.L. Burnett** via Wikimedia Commons, lisensi [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (dikemas ulang oleh cm-chessboard).
- Aturan & validasi: [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause).
- Jaringan P2P: [PeerJS](https://peerjs.com/) (MIT).

Dibuat dengan ♞ oleh **TheofKing**.
