// Tweening + the springy easings that give everything its bounce.

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t ** 3,
  outBack: (t, s = 1.9) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-11 * t) * Math.sin((t * 10 - 0.75) * (Math.PI * 2) / 3) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

class Tween {
  constructor(target, props, dur, opts = {}) {
    this.target = target;
    this.props = props;
    this.dur = Math.max(0.0001, dur);
    this.ease = typeof opts.ease === 'function' ? opts.ease : (Ease[opts.ease] ?? Ease.outCubic);
    this.delay = opts.delay ?? 0;
    this.onDone = opts.onDone;
    this.onUpdate = opts.onUpdate;
    this.t = 0;
    this.from = null;
    this.dead = false;
  }
  step(dt) {
    if (this.delay > 0) { this.delay -= dt; if (this.delay > 0) return; dt = -this.delay; this.delay = 0; }
    if (!this.from) {
      this.from = {};
      for (const k in this.props) this.from[k] = this.target[k] ?? 0;
    }
    this.t = Math.min(1, this.t + dt / this.dur);
    const e = this.ease(this.t);
    for (const k in this.props) this.target[k] = this.from[k] + (this.props[k] - this.from[k]) * e;
    this.onUpdate?.(e, this.target);
    if (this.t >= 1) { this.dead = true; this.onDone?.(this.target); }
  }
}

class Timer {
  constructor(dur, fn, opts = {}) {
    this.dur = Math.max(0.0001, dur);
    this.fn = fn;
    this.ease = typeof opts.ease === 'function' ? opts.ease : (Ease[opts.ease] ?? Ease.linear);
    this.delay = opts.delay ?? 0;
    this.onDone = opts.onDone;
    this.t = 0;
    this.dead = false;
  }
  step(dt) {
    if (this.delay > 0) { this.delay -= dt; if (this.delay > 0) return; dt = -this.delay; this.delay = 0; }
    this.t = Math.min(1, this.t + dt / this.dur);
    this.fn(this.ease(this.t), this.t);
    if (this.t >= 1) { this.dead = true; this.onDone?.(); }
  }
}

export class Tweens {
  #list = [];
  /** Interpolate numeric props on `target`. */
  to(target, props, dur, opts) { const t = new Tween(target, props, dur, opts); this.#list.push(t); return t; }
  /** Run `fn(eased, raw)` each frame for `dur` seconds. */
  run(dur, fn, opts) { const t = new Timer(dur, fn, opts); this.#list.push(t); return t; }
  /** Fire once after `dur` seconds. */
  after(dur, fn) { return this.run(dur, () => {}, { onDone: fn }); }
  clear() { this.#list.length = 0; }
  update(dt) {
    const list = this.#list;
    for (let i = 0; i < list.length; i++) list[i].step(dt);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
  }
}

/**
 * Critically-ish damped spring — used for squash/stretch that has to settle
 * without ringing forever. Mutates and returns `s`.
 */
export function spring(s, target, dt, stiffness = 190, damping = 17) {
  const a = (target - s.value) * stiffness - s.vel * damping;
  s.vel += a * dt;
  s.value += s.vel * dt;
  return s;
}

export const makeSpring = (value = 1) => ({ value, vel: 0 });
