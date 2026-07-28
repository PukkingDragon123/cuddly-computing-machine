// Tiny WebAudio blip synth — no audio files, so the whole game stays offline.

const NOTE = { c4: 261.6, e4: 329.6, g4: 392, a4: 440, c5: 523.3, d5: 587.3, e5: 659.3, g5: 784, a5: 880, c6: 1046.5, e6: 1318.5, g6: 1568 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noise = null;
  }

  /** Must run inside a user gesture on most browsers. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);

    // one shared noise buffer for thunks and whooshes
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    this.noise = buf;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.32 : 0;
  }

  #env(node, t, attack, hold, release, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  #tone({ freq, to, type = 'triangle', at = 0, dur = 0.12, gain = 0.7, attack = 0.006 }) {
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    this.#env(o, t, attack, dur * 0.35, dur * 0.7, gain);
    o.start(t);
    o.stop(t + dur + dur * 0.8 + 0.05);
  }

  #thump({ at = 0, dur = 0.14, gain = 0.5, cut = 900 }) {
    const t = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cut, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    s.connect(f);
    this.#env(f, t, 0.004, dur * 0.2, dur, gain);
    s.start(t);
    s.stop(t + dur + 0.1);
  }

  #arp(freqs, step = 0.055, type = 'triangle', gain = 0.6) {
    freqs.forEach((f, i) => this.#tone({ freq: f, type, at: i * step, dur: 0.1, gain }));
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    switch (name) {
      case 'tap':    return this.#tone({ freq: 620, to: 840, dur: 0.06, gain: 0.35 });
      case 'pop':    return this.#tone({ freq: 380, to: 1000, dur: 0.09, gain: 0.5 });
      case 'select': return this.#tone({ freq: NOTE.e5, to: NOTE.a5, dur: 0.08, gain: 0.45 });
      case 'coin':   return this.#arp([NOTE.a5, NOTE.e6], 0.05, 'triangle', 0.5);
      case 'cash':   return this.#arp([NOTE.c5, NOTE.e5, NOTE.g5, NOTE.c6], 0.048, 'triangle', 0.45);
      case 'star':   return this.#arp([NOTE.g5, NOTE.c6, NOTE.e6, NOTE.g6], 0.05, 'sine', 0.4);
      case 'ding':   return this.#arp([NOTE.c6, NOTE.g6], 0.07, 'sine', 0.4);
      case 'order':  return this.#arp([NOTE.a4, NOTE.d5], 0.06, 'square', 0.22);
      case 'place':  this.#thump({ dur: 0.16, gain: 0.55 }); return this.#tone({ freq: 190, to: 120, type: 'sine', dur: 0.12, gain: 0.4 });
      case 'build':  this.#thump({ dur: 0.12, gain: 0.4, cut: 1400 }); return this.#arp([NOTE.e5, NOTE.a5], 0.05, 'triangle', 0.35);
      case 'chomp':  return this.#arp([210, 165], 0.075, 'square', 0.2);
      case 'slurp':  return this.#tone({ freq: 300, to: 520, type: 'sine', dur: 0.18, gain: 0.28 });
      case 'no':     return this.#tone({ freq: 250, to: 150, type: 'sawtooth', dur: 0.16, gain: 0.25 });
      case 'sad':    return this.#arp([NOTE.e5, NOTE.c4], 0.11, 'triangle', 0.3);
      case 'whoosh': return this.#thump({ dur: 0.26, gain: 0.3, cut: 4200 });
      case 'open':   return this.#arp([NOTE.c5, NOTE.e5, NOTE.g5, NOTE.c6, NOTE.e6], 0.07, 'triangle', 0.4);
      case 'close':  return this.#arp([NOTE.g5, NOTE.e5, NOTE.c5], 0.09, 'triangle', 0.35);
      case 'machine':return this.#tone({ freq: 140, to: 90, type: 'square', dur: 0.1, gain: 0.14 });
      case 'belt':   return this.#tone({ freq: 520, to: 620, type: 'sine', dur: 0.05, gain: 0.12 });
      default:       return this.#tone({ freq: 500, dur: 0.07, gain: 0.3 });
    }
  }
}

export const sfx = new Sfx();
