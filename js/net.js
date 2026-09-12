// ============================================================
// Jaringan online via PeerJS (peer-to-peer, tanpa server sendiri).
// Host membuat room dengan kode 6 karakter, tamu gabung via kode.
// ============================================================

export const ROOM_PREFIX = 'theofking-v1-room-';
const GUEST_PREFIX = 'theofking-v1-g-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

function randId() {
  return GUEST_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function peerErrorMessage(err) {
  const t = err?.type || '';
  switch (t) {
    case 'peer-unavailable': return 'Room tidak ditemukan. Periksa lagi kodenya.';
    case 'unavailable-id': return 'Kode room sedang dipakai. Coba lagi.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return 'Gagal terhubung ke server sinyal. Periksa internet lalu coba lagi.';
    case 'webrtc': return 'Browser memblokir koneksi game. Coba browser lain / matikan VPN.';
    case 'browser-incompatible': return 'Browser tidak mendukung WebRTC. Gunakan Chrome/Edge/Firefox terbaru.';
    default: return 'Koneksi gagal: ' + (err?.message || t || 'tidak diketahui');
  }
}

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.code = null;
    this.onData = null;      // (msg) => void
    this.onGuest = null;     // host: tamu terhubung (conn open)
    this.onOpen = null;      // guest: koneksi ke host terbuka
    this.onClose = null;     // koneksi data tertutup
    this.onError = null;     // (err) => void
    this.destroyed = false;
  }

  get connected() {
    return !!(this.conn && this.conn.open);
  }

  _ensurePeerLib() {
    if (typeof Peer === 'undefined') {
      throw new Error('Library jaringan gagal dimuat. Periksa internet lalu muat ulang halaman.');
    }
  }

  /** Host: buat room. Resolve { code } saat peer siap. Retry jika kode bentrok. */
  host(preferCode = null, tries = 0) {
    this._ensurePeerLib();
    this.isHost = true;
    this.code = preferCode || makeRoomCode();
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(ROOM_PREFIX + this.code, { debug: 0 });
      this.peer = peer;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; try { peer.destroy(); } catch {} reject(new Error('TIMEOUT')); }
      }, 25000);

      peer.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code: this.code });
      });
      peer.on('connection', (conn) => this._handleIncoming(conn));
      peer.on('error', (err) => {
        if (!settled && err?.type === 'unavailable-id' && tries < 4) {
          settled = true;
          clearTimeout(timer);
          try { peer.destroy(); } catch {}
          this.host(null, tries + 1).then(resolve, reject);
          return;
        }
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
          return;
        }
        this.onError?.(err);
      });
      peer.on('disconnected', () => {
        if (!this.destroyed) { try { peer.reconnect(); } catch {} }
      });
    });
  }

  _handleIncoming(conn) {
    // Tolak tamu kedua (room hanya 1 vs 1)
    if (this.conn && this.conn.open) {
      conn.on('open', () => {
        try { conn.send({ t: 'lobby_full' }); } catch {}
        setTimeout(() => { try { conn.close(); } catch {} }, 600);
      });
      return;
    }
    this.conn = conn;
    conn.on('data', (d) => this.onData?.(d));
    conn.on('open', () => this.onGuest?.());
    conn.on('close', () => { this.onClose?.(); });
    conn.on('error', (e) => this.onError?.(e));
    conn.on('iceStateChanged', (s) => {
      if (s === 'disconnected' || s === 'closed' || s === 'failed') this.onClose?.();
    });
  }

  /** Guest: gabung room. Resolve saat koneksi data terbuka. */
  join(code) {
    this._ensurePeerLib();
    this.isHost = false;
    this.code = String(code || '').toUpperCase().trim();
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(randId(), { debug: 0 });
      this.peer = peer;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error('TIMEOUT')), 25000);
      peer.on('open', () => {
        const conn = peer.connect(ROOM_PREFIX + this.code, { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.onOpen?.();
          resolve();
        });
        conn.on('data', (d) => this.onData?.(d));
        conn.on('close', () => this.onClose?.());
        conn.on('error', (e) => { if (!settled) fail(e); else this.onError?.(e); });
        conn.on('iceStateChanged', (s) => {
          if (s === 'disconnected' || s === 'closed' || s === 'failed') this.onClose?.();
        });
      });
      peer.on('error', (err) => {
        if (!settled) fail(err);
        else this.onError?.(err);
      });
      peer.on('disconnected', () => {
        if (!this.destroyed) { try { peer.reconnect(); } catch {} }
      });
    });
  }

  send(obj) {
    if (!this.conn || !this.conn.open) return false;
    try {
      this.conn.send(obj);
      return true;
    } catch {
      return false;
    }
  }

  destroy() {
    this.destroyed = true;
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
  }
}
