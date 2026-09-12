// ============================================================
// Efek suara hasil sintesis WebAudio (tanpa file audio).
// ============================================================
import { store } from './store.js?v=5';

let ctx = null;
let noiseBuf = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    try {
      const r = ctx.resume();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* abaikan */ }
  }
  return ctx;
}

function getNoise(c) {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 0.25;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export function soundEnabled() {
  return store.settings.sound !== false;
}

export function setSoundEnabled(on) {
  const s = store.settings;
  s.sound = !!on;
  store.settings = s;
}

/** Buka kunci audio (panggil saat ada interaksi user). */
export function unlockAudio() {
  try { ac(); } catch { /* abaikan */ }
}

function tone({ freq = 440, end = null, dur = 0.12, type = 'sine', vol = 0.25, delay = 0 }) {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  try {
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch { /* abaikan */ }
}

function thock({ vol = 0.5, delay = 0, bright = 1200 }) {
  if (!soundEnabled()) return;
  const c = ac();
  if (!c) return;
  try {
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + 0.13);
    // body kayu
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.09);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(vol * 0.7, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g2).connect(c.destination);
    o.start(t);
    o.stop(t + 0.12);
  } catch { /* abaikan */ }
}

export const sfx = {
  click()   { tone({ freq: 660, dur: 0.06, type: 'triangle', vol: 0.15 }); },
  select()  { tone({ freq: 520, dur: 0.05, type: 'triangle', vol: 0.12 }); },
  move()    { thock({}); },
  capture() { thock({ bright: 2200, vol: 0.6 }); tone({ freq: 300, end: 140, dur: 0.1, type: 'square', vol: 0.08 }); },
  castle()  { thock({}); thock({ delay: 0.11 }); },
  check()   { tone({ freq: 880, dur: 0.12, type: 'triangle', vol: 0.22 }); tone({ freq: 1174, dur: 0.16, type: 'triangle', vol: 0.22, delay: 0.1 }); },
  promote() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.2, delay: i * 0.07 })); },
  start()   { tone({ freq: 392, dur: 0.12, type: 'triangle', vol: 0.2 }); tone({ freq: 523, dur: 0.14, type: 'triangle', vol: 0.2, delay: 0.09 }); tone({ freq: 659, dur: 0.2, type: 'triangle', vol: 0.2, delay: 0.18 }); },
  win()     { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.22, delay: i * 0.1 })); },
  lose()    { [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'sawtooth', vol: 0.08, delay: i * 0.13 })); },
  draw()    { tone({ freq: 440, dur: 0.15, type: 'triangle', vol: 0.18 }); tone({ freq: 440, dur: 0.2, type: 'triangle', vol: 0.18, delay: 0.16 }); },
  illegal() { tone({ freq: 160, dur: 0.15, type: 'sawtooth', vol: 0.12 }); },
  tick()    { tone({ freq: 1050, dur: 0.04, type: 'square', vol: 0.06 }); },
  message() { tone({ freq: 740, dur: 0.07, type: 'sine', vol: 0.18 }); tone({ freq: 980, dur: 0.09, type: 'sine', vol: 0.16, delay: 0.07 }); },
  rankup()  { [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.22, delay: i * 0.09 })); },
  notify()  { tone({ freq: 620, dur: 0.1, type: 'triangle', vol: 0.2 }); tone({ freq: 830, dur: 0.14, type: 'triangle', vol: 0.2, delay: 0.1 }); },
};
