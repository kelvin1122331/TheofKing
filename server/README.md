# ♞ TheofKing Server

Backend opsional untuk TheofKing: **akun global, leaderboard, sinkronisasi
(bintang/koin/skin/teman), admin global, dan matchmaking arena.**
Tanpa server, game tetap jalan normal dalam mode lokal (data di HP masing-masing).

## Jalankan lokal

```bash
cd server
npm install
npm start
```

Buka `http://localhost:3000` — server menyajikan game + API dalam satu port,
jadi tanpa konfigurasi apa pun game otomatis tersambung (indikator 🟢 Server
di footer).

## Konfigurasi (env)

| Variabel     | Default            | Arti                              |
| ------------ | ------------------ | --------------------------------- |
| `PORT`       | `3000`             | Port server                       |
| `DATA_FILE`  | `./data.json`      | File database JSON                |
| `ADMIN_USER` | `theoid`    | User admin panel                  |
| `ADMIN_PASS` | `theo5757`     | Sandi admin panel                 |
| `SMTP_HOST`  | –                  | Host SMTP (cth: `smtp.gmail.com`) |
| `SMTP_PORT`  | `587`              | Port SMTP                         |
| `SMTP_USER`  | –                  | User/email SMTP                   |
| `SMTP_PASS`  | –                  | Sandi / App Password SMTP         |
| `SMTP_FROM`  | = SMTP_USER        | Alamat pengirim email             |

Contoh: `PORT=8080 ADMIN_PASS=sandi-baru npm start`

## Deploy gratis (agar online 24 jam)

**Railway:** New Project → Deploy from Repo → pilih repo ini → Settings →
perintah start `node server/index.js`, root directory biarkan `/` (atau
gunakan Dockerfile yang sudah tersedia). Tambahkan volume agar `data.json`
tidak hilang.

**Render:** New → Web Service → repo ini → Runtime `Docker` (pakai Dockerfile
bawaan) → deploy. Tambahkan Disk agar `data.json` persisten.

**VPS sendiri:** install Node 20+, `cd server && npm install`,
jalankan dengan `pm2 start index.js --name theofking` (atau systemd).

## Game di hosting terpisah?

Kalau game (HTML) dihosting di tempat lain, arahkan ke server dengan:

```
https://game-kamu.com/?server=https://server-kamu.com
```

Alamat tersimpan otomatis di HP pemain.

## API ringkas

- `GET /api/health` — cek server
- `POST /api/account/register` — daftar `{id, username, name, avatar, country}`
- `GET /api/account/:id?as=:id` — ambil data (milik sendiri = lengkap)
- `PUT /api/account/:id` — simpan `{profile, stats, settings, friends, rev}`
- `GET /api/account/find?q=` — cari akun (publik)
- `GET /api/account/check?username=&name=&except=` — cek nama/username dipakai (`{usernameTaken, nameTaken}`)
- `POST /api/account/secure` — pasang email+sandi `{id, email, password}`
- `POST /api/account/login` — masuk `{login, password}` (username/email)
- `POST /api/account/password` — ganti sandi `{id, oldPassword, newPassword}`
- `POST /api/account/reset/request` — kirim kode reset `{login}` (selalu ok)
- `POST /api/account/reset/confirm` — reset `{login, code, newPassword}` → langsung login
- `GET /api/leaderboard?by=stars|streak&me=:id` — peringkat global
- `POST /api/admin/login` — `{user, pass}` → token
- `GET /api/admin/find?q=` + `POST /api/admin/stars` — butuh header `X-Admin-Token`
- `POST /api/admin/coins` — kelola koin `{target, mode, amount}` (butuh token)
- `POST /api/admin/verified` — centang verified `{target, value}` (butuh token)
- `POST /api/admin/title` — gelar `{target, title: owner|admin|none}` (butuh token)
- `POST /api/notify/friend` — notifikasi tambah teman `{fromId, toId}`
- `GET /api/inbox/:id?as=:id` — pesan pribadi + kabar global
- `POST /api/inbox/:id/read` — tandai dibaca `{as, ids}`
- `POST /api/like` — suka akun `{fromId, toId}` (1x per akun)
- `POST /api/admin/broadcast` — kabar global `{title, body}` (butuh token)
- `POST /api/admin/gift` — gift `{target|ALL, coins, stars}` (butuh token)
- `POST /api/admin/likes` — kelola suka `{target, mode, amount}` (butuh token)
- `WS /ws` — antre arena: kirim `{t:'queue', id, rank, profile, stats}`,
  terima `{t:'matched', role, code, opp}` lalu sambung P2P seperti biasa.

## Email reset via Gmail (gratis)

1. Di akun Gmail pengirim: aktifkan **verifikasi 2 langkah**
   (`myaccount.google.com` → Keamanan → Verifikasi 2 langkah).
2. Buat **Sandi aplikasi**: Keamanan → Sandi aplikasi → beri nama
   `TheofKing` → salin 16 huruf yang muncul (tanpa spasi).
3. Jalankan server dengan env:
   ```bash
   SMTP_HOST=smtp.gmail.com SMTP_PORT=587 \
   SMTP_USER=emailkamu@gmail.com SMTP_PASS=xxxxxxxxxxxxxxxx \
   npm start
   ```
   (Di Railway/Render/VPS: isi variabel yang sama di pengaturan env.)
4. Tanpa SMTP, endpoint reset tetap jalan tapi `sent:false` dan kode
   dicatat di log server (untuk tes / dibantu admin).

## Batasan yang perlu tahu

- Database berupa **file JSON satu instance** — cukup untuk ratusan pemain.
  Kalau pemain membludak, ganti ke SQLite/Postgres.
- Identitas akun = **ID pemain** (tanpa password) — simpel seperti di game.
  Jangan taruh data sensitif; leaderboard bersifat publik.
